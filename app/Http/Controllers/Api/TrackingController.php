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
            'package' => array_merge(
                // Anonymous caller: no sub_codes. On a pack consignment a sub_code is
                // the credential its holder presents to collect a garment, so this
                // endpoint must never hand them out.
                Shipping::shipmentPayload($pkg, null, includeSubCodes: false),
                ['order_number' => $pkg->order?->order_number],
            ),
        ];
    }
}
