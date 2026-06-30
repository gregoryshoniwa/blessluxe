<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Blits;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Storefront-facing loyalty endpoints. Tightly scoped to the signed-in
 * customer — guests get a polite null response so the UI can branch.
 */
class BlitsController extends Controller
{
    /**
     * GET /api/account/blits
     *
     * Balance + last 15 ledger rows + public config (so the checkout
     * panel knows what 1 blit is worth without a second roundtrip).
     */
    public function index(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['blits' => null, 'settings' => Blits::settings()];

        $entries = DB::table('blits_ledger')
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')  // tiebreaker — same-second rows still order by insert order
            ->limit(15)
            ->get(['id', 'delta', 'balance_after', 'reason', 'reference', 'created_at']);

        return [
            'settings' => Blits::settings(),
            'blits' => [
                'balance'      => (int) $customer->loyalty_points,
                'tier'         => $customer->loyalty_tier,
                'recent'       => $entries->map(fn ($e) => [
                    'id'            => $e->id,
                    'delta'         => (int) $e->delta,
                    'balance_after' => (int) $e->balance_after,
                    'reason'        => $e->reason,
                    'reference'     => $e->reference,
                    'created_at'    => $e->created_at,
                ])->values(),
            ],
        ];
    }

    /**
     * POST /api/account/blits/preview
     * { blits: int, subtotal_cents: int }
     *
     * Returns the actual discount the customer would get if they spent the
     * requested blits on an order of the given subtotal. Lets the SPA
     * render "Use 500 Blits → $5 off" live as the slider moves.
     */
    public function preview(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        $data = $request->validate([
            'blits'          => ['required', 'integer', 'min:0'],
            'subtotal_cents' => ['required', 'integer', 'min:0'],
        ]);
        $available = (int) ($customer?->loyalty_points ?? 0);
        return [
            'available' => $available,
            'preview'   => Blits::previewDiscount(
                (int) $data['blits'],
                (int) $data['subtotal_cents'],
                $available
            ),
        ];
    }
}
