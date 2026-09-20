<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AffiliateApplicationReceivedMail;
use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use App\Models\AffiliateSale;
use App\Models\CustomerAddress;
use App\Models\OrderLineItem;
use App\Services\Notifications;
use App\Support\Address;
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

        return ['affiliate' => $this->storefrontShape($affiliate)];
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
        return ['affiliate' => $this->storefrontShape($affiliate)];
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
     * GET /api/store/affiliate/eligibility
     *
     * What the apply form needs to know before rendering: who the customer is,
     * whether they already applied, and whether they have somewhere to be paid.
     * Lets the page ask only for what it genuinely doesn't know.
     */
    public function eligibility(Request $request)
    {
        $customer = Auth::guard('customer')->user();

        if (! $customer) {
            return [
                'signed_in' => false,
                'eligible'  => false,
                'reason'    => 'sign_in_required',
            ];
        }

        $existing = Affiliate::where('customer_id', $customer->id)
            ->orWhereRaw('LOWER(email) = ?', [strtolower((string) $customer->email)])
            ->first();

        $address = $this->payoutAddressFor($customer->id);

        // Distinguish "no address at all" from "an address we can't use". Telling
        // someone to add an address while they're looking at one is maddening —
        // and addresses saved from checkout have no name or phone, so this is the
        // common case, not an edge case.
        $hasAnyAddress = CustomerAddress::where('customer_id', $customer->id)->exists();

        return [
            'signed_in' => true,
            'customer'  => [
                'first_name' => $customer->first_name,
                'last_name'  => $customer->last_name,
                'email'      => $customer->email,
            ],
            'has_address'    => (bool) $address,
            'address'        => $address ? Address::normalize($address->toArray()) : null,
            'already_applied' => (bool) $existing,
            'existing'       => $existing ? [
                'code'   => $existing->code,
                'status' => $existing->status,
            ] : null,
            'has_any_address' => $hasAnyAddress,
            'eligible' => ! $existing && (bool) $address,
            'reason'   => $existing
                ? 'already_applied'
                : ($address ? null : ($hasAnyAddress ? 'address_incomplete' : 'address_required')),
        ];
    }

    /**
     * The address commission gets paid to.
     *
     * Requires a name and a street — orders.shipping_address carries neither, so a
     * shipping snapshot can never stand in for this.
     */
    private function payoutAddressFor(string $customerId): ?object
    {
        return CustomerAddress::where('customer_id', $customerId)
            ->whereNotNull('line1')
            ->where('line1', '!=', '')
            ->whereNotNull('city')
            ->where('city', '!=', '')
            ->where(fn ($q) => $q->whereNotNull('first_name')->orWhereNotNull('last_name'))
            ->orderByDesc('is_default_shipping')
            ->first();
    }

    /**
     * GET /api/store/affiliate/code-available?code=JANE10
     *
     * Live availability while they type, the way a username field works. Signed-in
     * only — a public endpoint would let anyone enumerate every affiliate code.
     */
    public function codeAvailable(Request $request)
    {
        if (! Auth::guard('customer')->user()) {
            return response()->json(['error' => 'Sign in first.'], 401);
        }

        $raw    = (string) $request->query('code', '');
        $code   = Affiliate::normalizeCode($raw);
        $reason = Affiliate::codeUnavailableReason($code);

        return [
            'code'        => $code,
            'available'   => $reason === null,
            'reason'      => $reason,
            // Only worth suggesting alternatives when the code was well-formed
            // and simply gone — not when they're mid-word or used a bad character.
            'suggestions' => $reason === 'Already taken.' ? Affiliate::suggestCodes($code) : [],
        ];
    }

    /**
     * PUT /api/account/affiliate/profile
     *
     * An affiliate's own profile: their links and a short bio. Deliberately not
     * part of the application — none of it is needed to decide, and asking for it
     * up front made applying feel like an interview.
     *
     * Scoped to the signed-in owner; an affiliate can only edit their own.
     */
    public function updateProfile(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in first.'], 401);
        }

        $affiliate = Affiliate::where('customer_id', $customer->id)->first();
        if (! $affiliate) {
            return response()->json(['error' => 'You are not an affiliate yet.'], 404);
        }

        $data = $request->validate([
            'bio'       => ['nullable', 'string', 'max:1000'],
            'instagram' => ['nullable', 'string', 'max:255'],
            'tiktok'    => ['nullable', 'string', 'max:255'],
            'website'   => ['nullable', 'string', 'max:255'],
        ]);

        // Merge rather than replace, so a partial save can't wipe the rest.
        $affiliate->update([
            'metadata' => array_merge($affiliate->metadata ?? [], array_filter(
                $data,
                fn ($v) => $v !== null,
            )),
        ]);

        return ['profile' => $affiliate->fresh()->metadata];
    }

    /**
     * POST /api/store/affiliate/apply
     *
     * Signed-in customers only. Name and email come from the account rather than
     * the form — asking a logged-in person to retype what we already hold is both
     * friction and a way for the two records to disagree.
     *
     * A complete address is required because commission has to be paid somewhere,
     * and chasing it after approval is worse than asking for it now.
     */
    public function apply(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json([
                'error'  => 'Please sign in to apply — your affiliate account is tied to your BLESSLUXE account.',
                'reason' => 'sign_in_required',
            ], 401);
        }

        // The one thing we genuinely can't know: what they want to be called.
        // Everything else comes from the account. Nullable here so the checks
        // below can run in order of how hard they are to fix — being told to pick
        // another code is useless if you also have to go and add an address.
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:' . Affiliate::CODE_MAX],
        ]);

        // Identity comes from the account, never the request body.
        $email = strtolower(trim((string) $customer->email));
        $data['first_name'] = $customer->first_name ?: 'Affiliate';
        $data['last_name']  = $customer->last_name;

        $address = $this->payoutAddressFor($customer->id);
        if (! $address) {
            $hasAnyAddress = CustomerAddress::where('customer_id', $customer->id)->exists();

            return response()->json([
                'error' => $hasAnyAddress
                    ? 'Your saved address is missing a recipient name or phone number. Add those and we can pay your commission there.'
                    : 'Add a delivery address to your account first — we need somewhere to send your commission.',
                'reason' => $hasAnyAddress ? 'address_incomplete' : 'address_required',
            ], 422);
        }

        // Match on the customer OR the email, so an older email-only row still
        // blocks a duplicate application.
        $existing = Affiliate::where('customer_id', $customer->id)
            ->orWhereRaw('LOWER(email) = ?', [$email])
            ->first();

        if ($existing) {
            return response()->json([
                'error' => $existing->status === 'pending'
                    ? "We've already received your application — we'll be in touch."
                    : "There's already an affiliate account for {$email}.",
            ], 409);
        }

        // Code last: by now we know they can actually apply, so a code error is
        // the only thing standing between them and being done.
        //
        // Re-checked server-side even though the form checked live — someone else
        // may have taken it in the seconds since, and the client can be bypassed.
        $code = Affiliate::normalizeCode($data['code'] ?? '');
        if ($reason = Affiliate::codeUnavailableReason($code)) {
            return response()->json([
                'error'       => $reason === 'Already taken.'
                    ? "Someone just took {$code}. Pick another."
                    : $reason,
                'reason'      => 'code_unavailable',
                'suggestions' => Affiliate::suggestCodes($code),
            ], 422);
        }

        $affiliate = Affiliate::create([
            'id'              => 'aff_' . Str::random(16),
            'customer_id'     => $customer->id,
            // Held from the moment they apply. A live "available!" check that
            // doesn't reserve would be a lie — someone could lose the code they
            // just watched turn green.
            'code'            => $code,
            'email'           => $email,
            'first_name'      => $data['first_name'],
            'last_name'       => $data['last_name'] ?? null,
            'commission_rate' => 10,
            'status'          => 'pending',
            // Snapshotted, so editing the address book later cannot silently
            // redirect a payout.
            'payout_address'  => Address::normalize($address->toArray()),
            // Links and bio are the affiliate's own to add later, from their profile.
            'metadata'        => [],
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
            body:      "{$affiliate->first_name} ({$affiliate->email})",
            actionUrl: '/admin/affiliates',
        );

        return [
            'affiliate' => [
                // Null until approval — the confirmation screen no longer claims a
                // code has been reserved.
                'code'           => $affiliate->code,
                'email'          => $affiliate->email,
                'status'         => $affiliate->status,
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
                // The affiliate's own links and bio, added after approval.
                'metadata'         => $affiliate->metadata ?? [],
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

    /**
     * How the storefront sees the affiliate it is shopping via.
     *
     * One builder for `resolve` (a link was just opened) and `active` (every
     * later page load) — they were two copies of the same array, and the copy
     * that wasn't updated is the one that would have shipped without `curated`.
     */
    private function storefrontShape(Affiliate $affiliate): array
    {
        $curated = \App\Services\AffiliatePricing::curatedProductIds($affiliate);

        return [
            'code' => $affiliate->code,
            'name' => trim(($affiliate->first_name ?? '') . ' ' . ($affiliate->last_name ?? '')) ?: $affiliate->code,
            // A curated shop sells ONLY what this affiliate picked. The
            // storefront uses this to drop everything that isn't theirs — packs,
            // empty categories — and to explain an empty shop honestly instead
            // of looking broken.
            'curated'       => $curated !== null,
            'product_count' => $curated === null ? null : count($curated),
            // Accent colour + top-bar messages, when they've set their own.
            // Rides on this payload because every page already fetches it —
            // theming the shop costs no extra request.
            'look'          => \App\Services\AffiliateLook::forStorefront($affiliate),
        ];
    }
}
