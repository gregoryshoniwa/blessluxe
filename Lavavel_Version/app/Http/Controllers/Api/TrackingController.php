<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Package;
use App\Services\Shipping;

class TrackingController extends Controller
{
    /**
     * GET /api/store/track/{code}
     *
     * Public — the code itself is the bearer. Validates Luhn check digit
     * BEFORE hitting the DB so we don't even leak which codes exist via
     * timing differences.
     */
    public function show(string $code)
    {
        $code = strtoupper(trim($code));
        if (! Shipping::verifyCode($code)) {
            return response()->json(['error' => 'Tracking code not recognised.'], 404);
        }

        $pkg = Package::with(['items', 'events', 'order:id,order_number,email'])
            ->where('package_code', $code)
            ->first();
        if (! $pkg) {
            return response()->json(['error' => 'Tracking code not found.'], 404);
        }

        return [
            'package' => [
                'code'                  => $pkg->package_code,
                'order_number'          => $pkg->order?->order_number,
                'status'                => $pkg->status,
                'carrier'               => $pkg->carrier,
                'carrier_tracking_number' => $pkg->carrier_tracking_number,
                'current_location'      => $pkg->current_location,
                'estimated_delivery_at' => $pkg->estimated_delivery_at?->toIso8601String(),
                'shipped_at'            => $pkg->shipped_at?->toIso8601String(),
                'delivered_at'          => $pkg->delivered_at?->toIso8601String(),
                'created_at'            => $pkg->created_at?->toIso8601String(),
                'items'                 => $pkg->items->map(fn ($i) => [
                    'product_title' => $i->product_title,
                    'variant_title' => $i->variant_title,
                    'quantity'      => $i->quantity,
                    'sku'           => $i->sku,
                ]),
                'events' => $pkg->events->map(fn ($e) => [
                    'status'     => $e->status,
                    'location'   => $e->location,
                    'notes'      => $e->notes,
                    'created_at' => $e->created_at?->toIso8601String(),
                ]),
            ],
        ];
    }
}
