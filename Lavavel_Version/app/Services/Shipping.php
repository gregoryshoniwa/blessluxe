<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Package;
use App\Models\PackageEvent;
use App\Models\PackageItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Package + tracking helpers. The public-facing `package_code` is a short
 * BL-XXXX-XXXX-Y string with a Luhn-style check digit at the end, so a
 * customer who mistypes a digit gets a 404 instead of pulling up someone
 * else's tracking record.
 */
class Shipping
{
    /**
     * Auto-create the package for an order. Called from PaynowController
     * after the order is materialised. Idempotent — returns the existing
     * package if one already exists for the order.
     */
    public static function ensurePackageForOrder(Order $order): Package
    {
        $existing = Package::where('order_id', $order->id)->first();
        if ($existing) return $existing;

        return DB::transaction(function () use ($order) {
            $package = Package::create([
                'id'              => 'pkg_' . Str::random(16),
                'package_code'    => self::makeCode(),
                'order_id'        => $order->id,
                'customer_id'     => $order->customer_id,
                'customer_email'  => $order->email,
                'status'          => 'created',
                'shipping_address'=> $order->shipping_address,
            ]);

            foreach ($order->lineItems as $line) {
                PackageItem::create([
                    'id'            => 'pkgi_' . Str::random(16),
                    'package_id'    => $package->id,
                    'order_line_id' => $line->id,
                    'variant_id'    => $line->variant_id,
                    'product_id'    => $line->product_id,
                    'product_title' => $line->title,
                    'variant_title' => $line->variant_title,
                    'sku'           => $line->sku,
                    'quantity'      => $line->quantity,
                    'unit_price'    => $line->unit_price,
                    'status'        => 'pending',
                ]);
            }

            self::recordEvent($package, 'created', null, 'Order received — preparing your pieces.', 'system');
            return $package->fresh();
        });
    }

    /**
     * Append a status event AND mirror the latest state onto the parent
     * package so list views can read it in a single query.
     */
    public static function recordEvent(Package $package, string $status, ?string $location, ?string $notes, ?string $createdBy = null): PackageEvent
    {
        $event = PackageEvent::create([
            'id'         => 'pkge_' . Str::random(16),
            'package_id' => $package->id,
            'status'     => $status,
            'location'   => $location,
            'notes'      => $notes,
            'created_by' => $createdBy,
            'created_at' => now(),
        ]);

        $patch = ['status' => $status, 'updated_at' => now()];
        if ($location)                      $patch['current_location'] = $location;
        if (in_array($status, ['shipped', 'in_transit'], true) && ! $package->shipped_at) {
            $patch['shipped_at'] = now();
        }
        if ($status === 'delivered' && ! $package->delivered_at) {
            $patch['delivered_at'] = now();
        }
        $package->update($patch);
        return $event;
    }

    /**
     * Generate a `BL-XXXX-XXXX-Y` code where Y is a Luhn check digit over
     * the digit positions of the random body. Cheap collision-check loop
     * since BL-XXXX-XXXX gives ~36^8 possibilities.
     */
    public static function makeCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
        do {
            $a = '';
            $b = '';
            for ($i = 0; $i < 4; $i++) $a .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            for ($i = 0; $i < 4; $i++) $b .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            $check = self::luhnCheck($a . $b);
            $code = "BL-{$a}-{$b}-{$check}";
        } while (Package::where('package_code', $code)->exists());
        return $code;
    }

    public static function verifyCode(string $code): bool
    {
        // Format: BL-XXXX-XXXX-Y
        if (! preg_match('/^BL-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9])$/', strtoupper($code), $m)) return false;
        return self::luhnCheck($m[1] . $m[2]) === $m[3];
    }

    /**
     * Compute a Luhn-style check character over a 32-char alphabet so the
     * check digit lives in the same space as the body. Each char's index
     * in the alphabet is the "digit" — we double every other from the
     * right, sum the digits, take mod 32 and emit that index.
     */
    public static function luhnCheck(string $body): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $base     = strlen($alphabet);
        $sum      = 0;
        $reversed = strrev(strtoupper($body));
        for ($i = 0; $i < strlen($reversed); $i++) {
            $val = strpos($alphabet, $reversed[$i]);
            if ($val === false) return '0';
            if ($i % 2 === 0) {
                $val *= 2;
                if ($val >= $base) $val = (int) floor($val / $base) + ($val % $base);
            }
            $sum += $val;
        }
        $check = ($base - ($sum % $base)) % $base;
        return $alphabet[$check];
    }
}
