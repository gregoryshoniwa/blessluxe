<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use App\Models\AffiliateSale;
use App\Models\OrderLineItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Storefront-facing affiliate endpoints. Lets the SPA:
 *   - resolve an affiliate code (deep-link landing)
 *   - read the active attribution back so the header pill can show it
 *   - read a self-service summary by code (no auth — code itself is the bearer)
 */
class AffiliateController extends Controller
{
    /**
     * POST /api/store/affiliate/resolve
     * { code: "JANE10" }
     *
     * Validates the code, parks it in the session, returns the public bits
     * so the SPA can show the pill + (optionally) redirect to the product.
     */
    public function resolve(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:60']]);
        $code = strtoupper(trim($data['code']));

        $affiliate = Affiliate::query()
            ->where('code', $code)
            ->where('status', 'active')
            ->first();
        if (! $affiliate) {
            $request->session()->forget('affiliate_code');
            return response()->json(['error' => 'Affiliate code not found or not active.'], 404);
        }

        $request->session()->put('affiliate_code', $affiliate->code);

        return [
            'affiliate' => [
                'code' => $affiliate->code,
                'name' => trim(($affiliate->first_name ?? '') . ' ' . ($affiliate->last_name ?? '')) ?: $affiliate->code,
            ],
        ];
    }

    /**
     * GET /api/store/affiliate/active
     *
     * Returns the affiliate currently attached to this session (if any),
     * so the header can render the "Shopping via JANE10" pill on every
     * page load. Quietly returns null for guests with no attribution.
     */
    public function active(Request $request)
    {
        $code = $request->session()->get('affiliate_code');
        if (! $code) return ['affiliate' => null];

        $affiliate = Affiliate::query()->where('code', $code)->where('status', 'active')->first();
        if (! $affiliate) {
            $request->session()->forget('affiliate_code');
            return ['affiliate' => null];
        }
        return [
            'affiliate' => [
                'code' => $affiliate->code,
                'name' => trim(($affiliate->first_name ?? '') . ' ' . ($affiliate->last_name ?? '')) ?: $affiliate->code,
            ],
        ];
    }

    /**
     * POST /api/store/affiliate/clear
     *
     * Lets the customer drop the attribution mid-session.
     */
    public function clear(Request $request)
    {
        $request->session()->forget('affiliate_code');
        return ['ok' => true];
    }

    /**
     * GET /api/store/affiliate/dashboard/{code}
     *
     * Public read-only summary the affiliate can bookmark — no admin auth,
     * just the code itself. Surfaces their commission %, totals, and the
     * last 20 sales so they can sanity-check their performance.
     */
    public function dashboard(string $code)
    {
        $affiliate = Affiliate::query()->where('code', strtoupper($code))->first();
        if (! $affiliate) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $sales = AffiliateSale::query()
            ->where('affiliate_id', $affiliate->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get(['id', 'order_id', 'order_total', 'commission_amount', 'status', 'created_at'])
            ->map(fn ($s) => [
                'id'                 => $s->id,
                'order_id'           => $s->order_id,
                'order_total'        => '$' . number_format($s->order_total / 100, 2),
                'commission_amount'  => '$' . number_format($s->commission_amount / 100, 2),
                'status'             => $s->status,
                'created_at'         => $s->created_at?->toIso8601String(),
            ]);

        $payouts = AffiliatePayout::query()
            ->where('affiliate_id', $affiliate->id)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get(['id', 'amount', 'method', 'status', 'created_at'])
            ->map(fn ($p) => [
                'id'        => $p->id,
                'amount'    => '$' . number_format($p->amount / 100, 2),
                'method'    => $p->method,
                'status'    => $p->status,
                'created_at'=> $p->created_at?->toIso8601String(),
            ]);

        $monthAgo = now()->subDays(30);
        $monthlySales = (int) AffiliateSale::query()
            ->where('affiliate_id', $affiliate->id)
            ->where('created_at', '>=', $monthAgo)
            ->sum('commission_amount');

        return [
            'affiliate' => [
                'code'             => $affiliate->code,
                'name'             => trim(($affiliate->first_name ?? '') . ' ' . ($affiliate->last_name ?? '')) ?: $affiliate->code,
                'status'           => $affiliate->status,
                'commission_rate'  => (float) $affiliate->commission_rate,
            ],
            'summary' => [
                'total_earnings'    => '$' . number_format(((int) $affiliate->total_earnings) / 100, 2),
                'paid_out'          => '$' . number_format(((int) $affiliate->paid_out) / 100, 2),
                'pending_balance'   => '$' . number_format(max(0, ((int) $affiliate->total_earnings) - ((int) $affiliate->paid_out)) / 100, 2),
                'sales_last_30d'    => '$' . number_format($monthlySales / 100, 2),
            ],
            'recent_sales'  => $sales,
            'recent_payouts'=> $payouts,
        ];
    }
}
