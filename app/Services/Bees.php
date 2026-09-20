<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Loyalty currency ("Bees") debit / credit helpers.
 *
 * Every change to a customer's balance funnels through here so we get a
 * single ledger row + a single balance update — both inside a DB
 * transaction so partial failures can't desync the two. The customer
 * row is locked while we read its balance so concurrent debits can't
 * over-withdraw.
 *
 * Settings live in the `settings` key/value table. First read seeds the
 * defaults so admins don't have to bootstrap them by hand.
 */
class Bees
{
    /*
    |----------------------------------------------------------------------
    | The programme is called BEES. The STORAGE still says "blits".
    |----------------------------------------------------------------------
    | It was renamed for trademark reasons. Everything a person or a browser
    | can see uses the new name — copy, emails, the assistant, URLs, API paths,
    | this class. What did NOT change is what is written in the database:
    |
    |   tables    blits_ledger, blits_checkout_idempotency, blits_gift_*
    |   settings  blits.enabled / per_usd / earn_per_usd / max_discount_percent
    |   JSON keys blits_debited, blits_refunded   (inside orders.metadata and
    |                                              payment_sessions.cart_snapshot)
    |
    | Deliberately. Nobody outside the database can see those, and renaming
    | them is not free:
    |   - the refund code reads `blits_debited` back off every EXISTING order;
    |     rename the key and old orders look like they used no points, so a
    |     refund returns none — and the double-refund guard stops seeing
    |     refunds that already happened
    |   - settings() seeds defaults for keys it can't find, so renaming the
    |     keys would silently reset the configured earn/redeem rates
    | Treat these names as a storage format, not as wording.
    */

    public const KEY_PER_USD               = 'blits.per_usd';
    public const KEY_MAX_DISCOUNT_PERCENT  = 'blits.max_discount_percent';
    public const KEY_EARN_PER_USD          = 'blits.earn_per_usd';
    public const KEY_ENABLED               = 'blits.enabled';

    /**
     * Return live config. Seeds defaults the first time it's called so the
     * settings page always has something to render.
     *
     *   per_usd                — how many bees equal $1
     *   max_discount_percent   — cap on the share of an order paid in bees
     *   earn_per_usd           — bees credited per $1 of paid order
     *   enabled                — master switch
     */
    public static function settings(): array
    {
        $defaults = [
            self::KEY_PER_USD              => '100',
            self::KEY_MAX_DISCOUNT_PERCENT => '50',
            self::KEY_EARN_PER_USD         => '10',
            self::KEY_ENABLED              => 'true',
        ];
        $rows = DB::table('settings')->whereIn('key', array_keys($defaults))->pluck('value', 'key')->all();
        foreach ($defaults as $k => $v) {
            if (! array_key_exists($k, $rows)) {
                DB::table('settings')->updateOrInsert(['key' => $k], ['value' => $v, 'updated_at' => now()]);
                $rows[$k] = $v;
            }
        }
        return [
            'enabled'              => $rows[self::KEY_ENABLED] === 'true',
            'per_usd'              => (int) $rows[self::KEY_PER_USD],
            'max_discount_percent' => (float) $rows[self::KEY_MAX_DISCOUNT_PERCENT],
            'earn_per_usd'         => (float) $rows[self::KEY_EARN_PER_USD],
        ];
    }

    public static function setConfig(array $patch): array
    {
        $allowed = [
            self::KEY_PER_USD,
            self::KEY_MAX_DISCOUNT_PERCENT,
            self::KEY_EARN_PER_USD,
            self::KEY_ENABLED,
        ];
        foreach ($patch as $k => $v) {
            if (! in_array($k, $allowed, true)) continue;
            DB::table('settings')->updateOrInsert(['key' => $k], ['value' => (string) $v, 'updated_at' => now()]);
        }
        return self::settings();
    }

    /**
     * Given a desired bees amount + an order subtotal (in cents), return
     * the applicable discount in cents and how many bees will actually be
     * debited. Both can be lower than requested if the cap or balance kicks
     * in. Returns ['bees' => int, 'discount_cents' => int, 'reason' => ?string].
     */
    public static function previewDiscount(int $desiredBees, int $subtotalCents, int $availableBees): array
    {
        $cfg = self::settings();
        if (! $cfg['enabled'])      return ['bees' => 0, 'discount_cents' => 0, 'reason' => 'Bees are currently disabled.'];
        if ($cfg['per_usd'] <= 0)   return ['bees' => 0, 'discount_cents' => 0, 'reason' => 'Bees config invalid.'];
        if ($desiredBees <= 0 || $subtotalCents <= 0) return ['bees' => 0, 'discount_cents' => 0, 'reason' => null];

        $maxDiscountCents = (int) floor($subtotalCents * $cfg['max_discount_percent'] / 100);
        // Convert "bees → cents": 1 USD = per_usd bees, so 1 bee = (100 / per_usd) cents.
        $usableBees   = min($desiredBees, $availableBees, (int) floor($maxDiscountCents * $cfg['per_usd'] / 100));
        $discountCents = (int) floor($usableBees * 100 / $cfg['per_usd']);

        return [
            'bees'          => $usableBees,
            'discount_cents' => $discountCents,
            'reason'         => $usableBees < $desiredBees ? 'Capped by available balance or discount limit.' : null,
        ];
    }

    /**
     * Debit bees from a customer. Idempotent on `idempotency_key`: a second
     * call with the same key returns the original result instead of double-
     * charging the customer.
     *
     * Throws RuntimeException if the balance is insufficient or the customer
     * doesn't exist.
     *
     * @return array{blits_debited:int, balance_after:int}
     */
    public static function debit(
        string $customerId,
        int $bees,
        string $reason,
        string $idempotencyKey,
        ?string $reference = null
    ): array {
        if ($bees <= 0) {
            return ['blits_debited' => 0, 'balance_after' => (int) optional(Customer::find($customerId))->loyalty_points];
        }

        return DB::transaction(function () use ($customerId, $bees, $reason, $idempotencyKey, $reference) {
            // Check idempotency table first — if we've seen this key, return
            // the stored outcome instead of doing the debit again.
            $existing = DB::table('blits_checkout_idempotency')->where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return [
                    'blits_debited' => (int) $existing->blits_debited,
                    'balance_after' => (int) (Customer::find($customerId)?->loyalty_points ?? 0),
                ];
            }

            // Lock the customer row for the duration of the txn so two
            // concurrent debits can't both pass the balance check.
            $customer = DB::table('customers')->where('id', $customerId)->lockForUpdate()->first();
            if (! $customer) throw new \RuntimeException('Customer not found.');
            $balance = (int) $customer->loyalty_points;
            if ($balance < $bees) throw new \RuntimeException("Insufficient Bees balance ({$balance} available).");

            $newBalance = $balance - $bees;

            DB::table('customers')->where('id', $customerId)->update([
                'loyalty_points' => $newBalance,
                'updated_at'     => now(),
            ]);
            DB::table('blits_ledger')->insert([
                'id'            => 'blt_' . Str::random(16),
                'customer_id'   => $customerId,
                'delta'         => -$bees,
                'balance_after' => $newBalance,
                'reason'        => $reason,
                'reference'     => $reference,
                'created_at'    => now(),
            ]);
            DB::table('blits_checkout_idempotency')->insert([
                'idempotency_key' => $idempotencyKey,
                'customer_id'     => $customerId,
                'blits_debited'   => $bees,
                'status'          => 'committed',
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);

            return ['blits_debited' => $bees, 'balance_after' => $newBalance];
        });
    }

    /**
     * Credit bees to a customer (e.g. earn on paid order, gift, refund).
     */
    public static function credit(string $customerId, int $bees, string $reason, ?string $reference = null): int
    {
        if ($bees <= 0) return (int) (Customer::find($customerId)?->loyalty_points ?? 0);

        return DB::transaction(function () use ($customerId, $bees, $reason, $reference) {
            $customer = DB::table('customers')->where('id', $customerId)->lockForUpdate()->first();
            if (! $customer) return 0;
            $newBalance = (int) $customer->loyalty_points + $bees;
            DB::table('customers')->where('id', $customerId)->update([
                'loyalty_points' => $newBalance,
                'updated_at'     => now(),
            ]);
            DB::table('blits_ledger')->insert([
                'id'            => 'blt_' . Str::random(16),
                'customer_id'   => $customerId,
                'delta'         => $bees,
                'balance_after' => $newBalance,
                'reason'        => $reason,
                'reference'     => $reference,
                'created_at'    => now(),
            ]);
            return $newBalance;
        });
    }

    /**
     * How many bees a customer earns from a given USD-cent total.
     * Used by the paid-order hook in PaynowController.
     */
    public static function earnFor(int $subtotalCents): int
    {
        $cfg = self::settings();
        if (! $cfg['enabled'] || $cfg['earn_per_usd'] <= 0) return 0;
        return (int) floor($subtotalCents * $cfg['earn_per_usd'] / 100);
    }
}
