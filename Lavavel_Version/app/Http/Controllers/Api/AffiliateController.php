<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AffiliateApplicationReceivedMail;
use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use App\Models\AffiliateSale;
use App\Models\OrderLineItem;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
     * POST /api/store/affiliate/apply
     *
     * Public — anyone can apply. We auto-generate a CODE from their name
     * (or a random fallback). The new row lands in `status=pending` and
     * an admin approves it from /admin/affiliates.
     */
    public function apply(Request $request)
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:120'],
            'last_name'  => ['nullable', 'string', 'max:120'],
            'email'      => ['required', 'email', 'max:255'],
            'desired_code' => ['nullable', 'string', 'max:60', 'regex:/^[A-Z0-9-]+$/i'],
            'audience'   => ['nullable', 'string', 'max:1000'],
            'social'     => ['nullable', 'string', 'max:255'],
        ]);

        $email = strtolower(trim($data['email']));
        $existing = Affiliate::where('email', $email)->first();
        if ($existing) {
            return response()->json([
                'error' => $existing->status === 'pending'
                    ? "We've already received your application — we'll be in touch."
                    : "There's already an affiliate account for {$email}.",
            ], 409);
        }

        // Generate a code: caller's desired_code if available, else
        // FIRSTNAME10-style auto-pick, with a numeric suffix on collision.
        $base = strtoupper(preg_replace('/[^A-Z0-9]/', '', $data['desired_code'] ?? $data['first_name']));
        $base = substr($base, 0, 12) ?: 'AFF';
        $code = $base;
        $n = 2;
        while (Affiliate::where('code', $code)->exists()) {
            $code = $base . $n;
            $n++;
            if ($n > 999) { $code = $base . strtoupper(Str::random(4)); break; }
        }

        $affiliate = Affiliate::create([
            'id'              => 'aff_' . Str::random(16),
            'code'            => $code,
            'email'           => $email,
            'first_name'      => $data['first_name'],
            'last_name'       => $data['last_name'] ?? null,
            'commission_rate' => 10,
            'status'          => 'pending',
            'metadata'        => [
                'audience' => $data['audience'] ?? null,
                'social'   => $data['social']   ?? null,
            ],
        ]);

        // Acknowledge to the applicant + notify the team. Both wrapped so
        // SMTP failures don't 500 the application itself.
        try {
            Mail::to($affiliate->email)->send(new AffiliateApplicationReceivedMail($affiliate));
        } catch (\Throwable $e) {
            Log::warning('[affiliate apply mail] '.$e->getMessage());
        }
        Notifications::forAllAdmins(
            kind:      'affiliate_application',
            title:     'New affiliate application',
            body:      "{$affiliate->first_name} ({$affiliate->email}) — code {$affiliate->code}",
            actionUrl: '/admin/affiliates',
        );

        return [
            'affiliate' => [
                'code'   => $affiliate->code,
                'email'  => $affiliate->email,
                'status' => $affiliate->status,
            ],
        ];
    }

    /**
     * GET /api/account/affiliate
     *
     * Account-page-side: returns the affiliate record for the signed-in
     * customer (matched by email), with the same summary block as the
     * public dashboard. Returns `{ affiliate: null }` if they haven't
     * applied yet so the SPA can show the apply CTA.
     */
    public function mine(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in required.'], 401);
        }
        $affiliate = Affiliate::query()->whereRaw('LOWER(email) = ?', [strtolower($customer->email)])->first();
        if (! $affiliate) return ['affiliate' => null];

        $monthAgo = now()->subDays(30);
        $monthlySales = (int) AffiliateSale::query()
            ->where('affiliate_id', $affiliate->id)
            ->where('created_at', '>=', $monthAgo)
            ->sum('commission_amount');
        $recent = AffiliateSale::query()
            ->where('affiliate_id', $affiliate->id)
            ->orderByDesc('created_at')
            ->limit(5)
            ->get(['order_id', 'order_total', 'commission_amount', 'status', 'created_at'])
            ->map(fn ($s) => [
                'order_id'           => $s->order_id,
                'order_total'        => '$' . number_format($s->order_total / 100, 2),
                'commission_amount'  => '$' . number_format($s->commission_amount / 100, 2),
                'status'             => $s->status,
                'created_at'         => $s->created_at?->toIso8601String(),
            ]);

        return [
            'affiliate' => [
                'code'             => $affiliate->code,
                'status'           => $affiliate->status,
                'commission_rate'  => (float) $affiliate->commission_rate,
                'share_url'        => url('/affiliate/shop/'.strtolower($affiliate->code)),
                'summary' => [
                    'total_earnings'   => '$' . number_format(((int) $affiliate->total_earnings) / 100, 2),
                    'paid_out'         => '$' . number_format(((int) $affiliate->paid_out) / 100, 2),
                    'pending_balance'  => '$' . number_format(max(0, ((int) $affiliate->total_earnings) - ((int) $affiliate->paid_out)) / 100, 2),
                    'sales_last_30d'   => '$' . number_format($monthlySales / 100, 2),
                ],
                'recent_sales' => $recent,
            ],
        ];
    }

    /**
     * GET /api/store/affiliate/dashboard/{code}
     *
     * Now gated: only the signed-in customer whose email matches the
     * affiliate's email can read this. Stops a leaked code from exposing
     * earnings figures.
     */
    public function dashboard(string $code)
    {
        $affiliate = Affiliate::query()->where('code', strtoupper($code))->first();
        if (! $affiliate) {
            return response()->json(['error' => 'Not found'], 404);
        }

        // Require the signed-in customer to match the affiliate's email.
        // Returns 401 (not 404) so the SPA can prompt for login.
        $customer = Auth::guard('customer')->user();
        if (! $customer || strtolower($customer->email) !== strtolower((string) $affiliate->email)) {
            return response()->json(['error' => 'Sign in with the affiliate email to view this dashboard.'], 401);
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
