<?php

namespace App\Services\Payments;

use App\Models\PaymentSession;
use App\Services\PaymentOutcomes;
use App\Services\Payments\Contracts\Gateway;
use App\Services\Payments\Gateways\PaynowGateway;
use App\Services\Payments\Gateways\VelocityAfricaGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The payment gateways, and which one takes which kind of payment.
 *
 * Two separate ideas, kept separate on purpose:
 *   METHODS  are how the customer wants to pay (EcoCash, a card…)      — Method
 *   GATEWAYS are who processes it (Paynow, VelocityAfrica, later Stripe) — Gateway
 *
 * Staff route each method to a gateway, or switch it off, at /admin/payments.
 * "Everyone uses Paynow" is every method → paynow. "EcoCash through
 * Velocity, cards through Paynow" is two rows. What the customer sees at
 * checkout is DERIVED from that table (checkoutOptions()), never stored.
 *
 * Credentials live in config/services.php (env). This table lives in
 * `settings`, seeded on first read like Bees::settings(), so a fresh install
 * routes everything to whichever gateway has credentials.
 */
class Payments
{
    public const KEY_ROUTES   = 'payments.routes';
    public const KEY_GATEWAYS = 'payments.gateways';

    /** The registry. Adding a provider = one driver class + one line here. */
    public static function gateways(): array
    {
        static $all = null;

        return $all ??= collect([new PaynowGateway(), new VelocityAfricaGateway()])->keyBy(fn (Gateway $g) => $g->id())->all();
    }

    public static function gateway(string $id): ?Gateway
    {
        return self::gateways()[$id] ?? null;
    }

    // ─── Settings ──────────────────────────────────────────────────────────

    /**
     * @return array{gateways: array<string,array>, routes: array<string,?string>}
     */
    /**
     * Price of paying, quoted against an amount. Gateway charges are added to
     * what the customer pays; they are NOT revenue and never touch the order
     * total — we still send the goods amount to the gateway.
     *
     * @return array{lines:array<int,array{label:string,amount:int}>,fees:int,total:int}
     */
    public static function quote(int $amountCents, ?array $rule): array
    {
        $lines = [];
        if ($rule && ($rule['percent'] ?? 0) > 0) {
            $charge = (int) round($amountCents * $rule['percent'] / 100);
            if ($charge > 0) {
                $lines[] = ['label' => sprintf('%s (%s%%)', $rule['label'], rtrim(rtrim(number_format($rule['percent'], 2, '.', ''), '0'), '.')), 'amount' => $charge];
                $taxPct = (float) ($rule['tax_percent'] ?? 0);
                if ($taxPct > 0) {
                    $tax = (int) round($charge * $taxPct / 100);
                    if ($tax > 0) $lines[] = ['label' => sprintf('%s (%s%%)', $rule['tax_label'] ?? 'Tax', rtrim(rtrim(number_format($taxPct, 2, '.', ''), '0'), '.')), 'amount' => $tax];
                }
            }
        }
        $fees = array_sum(array_column($lines, 'amount'));

        return ['lines' => $lines, 'fees' => $fees, 'total' => $amountCents + $fees];
    }

    /**
     * VAT as Zimbabwe requires it: prices quoted to the public are already
     * tax-inclusive, so this is a DISCLOSURE of the tax inside the total, never
     * an amount added to it. Off until staff confirm we're registered.
     *
     * @return array{enabled:bool,rate:float,label:string}
     */
    public static function taxSettings(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY_TAX)->value('value'), true);
        if (! is_array($raw)) {
            $raw = ['enabled' => false, 'rate' => 15.5, 'label' => 'VAT'];
            DB::table('settings')->updateOrInsert(['key' => self::KEY_TAX], ['value' => json_encode($raw), 'updated_at' => now()]);
        }

        return [
            'enabled' => (bool) ($raw['enabled'] ?? false),
            'rate'    => (float) ($raw['rate'] ?? 15.5),
            'label'   => (string) ($raw['label'] ?? 'VAT'),
        ];
    }

    public const KEY_TAX = 'payments.tax';

    public static function settings(): array
    {
        $rows = DB::table('settings')->whereIn('key', [self::KEY_ROUTES, self::KEY_GATEWAYS])->pluck('value', 'key')->all();

        $gateways = json_decode((string) ($rows[self::KEY_GATEWAYS] ?? ''), true);
        $routes   = json_decode((string) ($rows[self::KEY_ROUTES] ?? ''), true);

        if (! is_array($gateways) || ! is_array($routes)) {
            [$gateways, $routes] = self::defaults();
            DB::table('settings')->updateOrInsert(['key' => self::KEY_GATEWAYS], ['value' => json_encode($gateways), 'updated_at' => now()]);
            DB::table('settings')->updateOrInsert(['key' => self::KEY_ROUTES], ['value' => json_encode($routes), 'updated_at' => now()]);
        }

        $out = ['gateways' => [], 'routes' => [], 'tax' => self::taxSettings()];
        foreach (self::gateways() as $id => $g) {
            $out['gateways'][$id] = [
                'id' => $id, 'label' => $g->label(), 'mode' => $g->mode(), 'methods' => $g->methods(),
                'configured' => $g->isConfigured(),
                // A gateway whose credentials went away is off, whatever was saved.
                'enabled' => $g->isConfigured() && (bool) ($gateways[$id]['enabled'] ?? false),
            ];
        }
        foreach (Method::ids() as $m) {
            $gid = $routes[$m] ?? null;
            $out['routes'][$m] = ($gid && ($out['gateways'][$gid]['enabled'] ?? false) && in_array($m, $out['gateways'][$gid]['methods'], true)) ? $gid : null;
        }

        return $out;
    }

    /** Fresh install: everything through the first gateway that has credentials. */
    private static function defaults(): array
    {
        $first = collect(self::gateways())->first(fn (Gateway $g) => $g->isConfigured());
        $gateways = [];
        foreach (self::gateways() as $id => $g) $gateways[$id] = ['enabled' => $first && $g->id() === $first->id()];
        $routes = [];
        foreach (Method::ids() as $m) $routes[$m] = ($first && in_array($m, $first->methods(), true)) ? $first->id() : null;

        return [$gateways, $routes];
    }

    /**
     * Staff change. Validates so the table can never point a method at a
     * gateway that is off, unconfigured, or can't take that method.
     *
     * @param array{gateways?: array<string,array{enabled:bool}>, routes?: array<string,?string>} $patch
     * @return array|string  the new settings, or a message saying what was wrong
     */
    public static function setConfig(array $patch): array|string
    {
        $current = self::settings();
        $gateways = [];
        foreach (self::gateways() as $id => $g) {
            $want = (bool) ($patch['gateways'][$id]['enabled'] ?? $current['gateways'][$id]['enabled']);
            if ($want && ! $g->isConfigured()) return "{$g->label()} has no credentials yet — add them to the environment first.";
            $gateways[$id] = ['enabled' => $want];
        }

        $routes = [];
        foreach (Method::ids() as $m) {
            $gid = array_key_exists($m, $patch['routes'] ?? []) ? ($patch['routes'][$m] ?: null) : $current['routes'][$m];
            if ($gid !== null) {
                $g = self::gateway($gid);
                if (! $g) return "Unknown gateway '{$gid}'.";
                if (! $gateways[$gid]['enabled']) return Method::label($m) . " can't go to {$g->label()} while it is switched off.";
                if (! in_array($m, $g->methods(), true)) return "{$g->label()} can't take " . Method::label($m) . '.';
            }
            $routes[$m] = $gid;
        }

        if (array_key_exists('tax', $patch)) {
            $tax = (array) $patch['tax'];
            $rate = (float) ($tax['rate'] ?? $current['tax']['rate']);
            if ($rate < 0 || $rate > 100) return 'A tax rate has to be between 0 and 100.';
            DB::table('settings')->updateOrInsert(['key' => self::KEY_TAX], ['value' => json_encode([
                'enabled' => (bool) ($tax['enabled'] ?? $current['tax']['enabled']),
                'rate'    => $rate,
                'label'   => trim((string) ($tax['label'] ?? $current['tax']['label'])) ?: 'VAT',
            ]), 'updated_at' => now()]);
        }

        DB::table('settings')->updateOrInsert(['key' => self::KEY_GATEWAYS], ['value' => json_encode($gateways), 'updated_at' => now()]);
        DB::table('settings')->updateOrInsert(['key' => self::KEY_ROUTES], ['value' => json_encode($routes), 'updated_at' => now()]);

        return self::settings();
    }

    // ─── What the customer sees ────────────────────────────────────────────

    /**
     * Checkout options, derived from the routing table. A hosted gateway is
     * ONE option listing the methods routed to it (the customer picks on its
     * page); a direct gateway is one option PER method, since each may need
     * something different from the customer first.
     *
     * @return array<int,array{id:string,gateway:string,method:?string,label:string,hint:string,methods:array,needs:array,icon:string}>
     */
    public static function checkoutOptions(): array
    {
        $s = self::settings();
        $byGateway = [];
        foreach ($s['routes'] as $method => $gid) {
            if ($gid) $byGateway[$gid][] = $method;
        }

        $out = [];
        foreach ($byGateway as $gid => $methods) {
            $g = self::gateway($gid);
            if ($g->mode() === 'hosted') {
                $out[] = [
                    'id' => $gid, 'gateway' => $gid, 'method' => null, 'label' => $g->label(),
                    'hint' => implode(', ', array_map(fn ($m) => Method::label($m), $methods)) . " — you choose on {$g->label()}'s secure page",
                    'methods' => $methods, 'needs' => $g->needs(null), 'icon' => 'shield',
                    'surcharge' => $g->surcharge(null),
                ];
            } else {
                foreach ($methods as $m) {
                    $out[] = [
                        'id' => "{$gid}:{$m}", 'gateway' => $gid, 'method' => $m, 'label' => Method::label($m),
                        'hint' => Method::ALL[$m]['hint'] . " · via {$g->label()}",
                        'methods' => [$m], 'needs' => $g->needs($m), 'icon' => Method::ALL[$m]['icon'],
                        'surcharge' => $g->surcharge($m),
                    ];
                }
            }
        }

        return $out;
    }

    /** @return array{0:Gateway,1:?string}|null  [gateway, method] for an option id the checkout sent back. */
    public static function resolveOption(?string $optionId): ?array
    {
        $options = self::checkoutOptions();
        // Nothing chosen (an old bundle, or one option): the first — the only sane default.
        $opt = $optionId === null || $optionId === '' ? ($options[0] ?? null) : collect($options)->firstWhere('id', $optionId);

        return $opt ? [self::gateway($opt['gateway']), $opt['method']] : null;
    }

    // ─── Starting and following a payment ──────────────────────────────────

    /**
     * Start a payment and record it. The row exists only once the provider
     * has said yes, so a failed start leaves nothing behind.
     *
     * @return array{0:?PaymentSession,1:InitiateResult}
     */
    public static function start(Gateway $gateway, PaymentIntent $intent, array $snapshot, ?string $customerId): array
    {
        $result = $gateway->initiate($intent);
        if (! $result->ok) return [null, $result];

        $session = PaymentSession::create([
            'id'                => 'payses_' . Str::random(20),
            'reference'         => $intent->reference,
            'provider'          => $gateway->id(),
            'method'            => $intent->method,
            'kind'              => $intent->kind,
            'status'            => 'pending',
            'poll_url'          => $result->pollHandle,
            'provider_reference' => $result->providerReference,
            'provider_meta'     => array_filter($result->meta + [
                'instruction' => $result->instruction,
                // What we told the customer they'd be debited, to check against
                // the gateway's own figures when the payment settles.
                'quoted_fees'  => self::quote($intent->amountCents, $gateway->surcharge($intent->method))['fees'] ?: null,
            ]) ?: null,
            'amount'            => $intent->amountCents,
            'currency_code'     => $intent->currency,
            'email'             => $intent->email,
            'customer_id'       => $customerId,
            'cart_snapshot'     => $snapshot,
            'raw_init_response' => $result->raw,
        ]);

        return [$session, $result];
    }

    /**
     * Ask the gateway where a pending payment stands and apply the answer.
     * Throttled: the return page polls every 3s and the provider needn't be
     * asked more often than every 4s per session.
     */
    public static function refresh(PaymentSession $session, bool $force = false): PaymentSession
    {
        if ($session->status !== 'pending') return $session;
        $meta = (array) ($session->provider_meta ?? []);
        if (! $force && isset($meta['polled_at']) && now()->timestamp - (int) $meta['polled_at'] < 4) return $session;

        $gateway = self::gateway($session->provider);
        if (! $gateway) return $session;

        try {
            $status = $gateway->refresh($session);
        } catch (\Throwable $e) {
            Log::warning('[payments refresh] ' . $e->getMessage(), ['reference' => $session->reference]);
            $status = null;
        }

        $session->update(['provider_meta' => array_merge($meta, ['polled_at' => now()->timestamp])]);
        if ($status) PaymentOutcomes::apply($session->fresh(), $status);

        return $session->fresh();
    }

    /** Short, sortable, human-friendly reference — also the order number. */
    public static function reference(): string
    {
        $time = strtoupper(base_convert((string) round(microtime(true) * 1000), 10, 36));
        $rand = strtoupper(substr(Str::random(8), 0, 4));

        return "BL-{$time}-{$rand}";
    }

    /** Where any gateway sends the customer back to. */
    public static function returnUrl(string $reference): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/store/payments/return?reference=' . urlencode($reference);
    }
}
