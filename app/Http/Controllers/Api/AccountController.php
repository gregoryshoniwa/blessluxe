<?php

namespace App\Http\Controllers\Api;

use App\Enums\FulfillmentStatus;
use App\Http\Controllers\Controller;
use App\Mail\PasswordResetMail;
use App\Mail\VerifyEmailMail;
use App\Mail\WelcomeMail;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderLineItem;
use App\Models\Package;
use App\Services\PackForwarding;
use App\Services\Shipping;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Laravel\Socialite\Facades\Socialite;

class AccountController extends Controller
{
    /**
     * GET /api/account/me
     *
     * Returns the signed-in customer or `{ customer: null }` for guests.
     * Drives the storefront header (Sign in vs. avatar) and Account page.
     */
    public function me(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        return [
            'customer' => $customer ? $this->shape($customer) : null,
        ];
    }

    /**
     * POST /api/account/signup
     * { email, password, first_name?, last_name?, phone?, marketing_consent? }
     */
    public function signup(Request $request)
    {
        $data = $request->validate([
            'email'             => ['required', 'email', 'max:255', Rule::unique('customers', 'email')],
            'password'          => ['required', 'string', 'min:8'],
            'first_name'        => ['nullable', 'string', 'max:120'],
            'last_name'         => ['nullable', 'string', 'max:120'],
            'phone'             => ['nullable', 'string', 'max:40'],
            'marketing_consent' => ['nullable', 'boolean'],
        ]);

        $customer = Customer::create([
            'id'                => 'cust_' . Str::random(20),
            'email'             => strtolower(trim($data['email'])),
            'password'          => Hash::make($data['password']),
            'first_name'        => $data['first_name']        ?? null,
            'last_name'         => $data['last_name']         ?? null,
            'phone'             => $data['phone']             ?? null,
            'marketing_consent' => (bool) ($data['marketing_consent'] ?? false),
        ]);

        Auth::guard('customer')->login($customer, remember: true);
        $request->session()->regenerate();

        // Send the welcome email outside the response cycle so transient
        // SMTP failures don't 500 the signup. Log + swallow.
        try {
            Mail::to($customer->email)->send(new WelcomeMail($customer));
        } catch (\Throwable $e) {
            Log::warning('[welcome mail] '.$e->getMessage());
        }
        // Fire the verify-email link as well — separate try/catch so a
        // welcome-mail SMTP hiccup doesn't suppress the verification mail.
        $this->sendVerificationLink($customer);

        return [
            'customer' => $this->shape($customer->fresh()),
        ];
    }

    /**
     * POST /api/account/login
     * { email, password, remember? }
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $email = strtolower(trim($data['email']));
        $ok = Auth::guard('customer')->attempt(
            ['email' => $email, 'password' => $data['password']],
            (bool) ($data['remember'] ?? false),
        );

        if (! $ok) {
            return response()->json(['error' => 'Invalid email or password.'], 422);
        }

        $request->session()->regenerate();
        Customer::query()->where('id', Auth::guard('customer')->id())->update(['last_login_at' => now()]);

        return [
            'customer' => $this->shape(Auth::guard('customer')->user()->fresh()),
        ];
    }

    /**
     * GET /api/account/orders
     *
     * Customer's order history with the tracking code for each, so the
     * Transactions tab can deep-link straight into /track/{code}.
     */
    public function orders()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['orders' => null];

        $orders = Order::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get(['id', 'order_number', 'total', 'currency_code', 'status', 'payment_status', 'fulfillment_status', 'created_at']);

        // Resolves pack orders too: their tracking lives on the shared consignment,
        // which carries no order_id of its own.
        $packageCodes = collect(Shipping::trackingCodeMap($orders->pluck('id')));

        return [
            'orders' => $orders->map(fn ($o) => [
                'order_number'   => $o->order_number,
                'total_label'    => '$' . number_format($o->total / 100, 2),
                'status'         => $o->status,
                'payment_status' => $o->payment_status,
                // Payment and fulfilment answer different questions; the list used
                // to show only the first, so "paid" looked the same as "delivered".
                'fulfillment_status' => $o->fulfillment_status,
                'fulfillment_label'  => FulfillmentStatus::tryFrom((string) $o->fulfillment_status)?->label(),
                'tracking_code'  => $packageCodes->get($o->id),
                'created_at'     => $o->created_at?->toIso8601String(),
            ]),
        ];
    }

    /**
     * POST /api/account/logout
     */
    public function logout(Request $request)
    {
        Auth::guard('customer')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return ['ok' => true];
    }

    /**
     * GET /api/account/oauth/{provider}
     *
     * Starts the OAuth dance. We redirect the user's browser to the provider
     * (Google for now). For SPAs, an HTTP 302 is what we want.
     */
    public function oauthRedirect(string $provider)
    {
        $this->assertProvider($provider);
        return Socialite::driver($provider)->redirect();
    }

    /**
     * GET /api/account/oauth/{provider}/callback
     *
     * Provider sends the user back here. We find-or-create a Customer
     * keyed on (oauth_provider, oauth_subject), log them in, and bounce
     * back to the Account page.
     */
    public function oauthCallback(string $provider, Request $request)
    {
        $this->assertProvider($provider);
        try {
            $oauthUser = Socialite::driver($provider)->user();
        } catch (\Throwable $e) {
            return redirect('/account/login?error=' . urlencode('OAuth failed: ' . $e->getMessage()));
        }

        $email = strtolower(trim((string) $oauthUser->getEmail()));
        if (! $email) {
            return redirect('/account/login?error=' . urlencode('Provider did not return an email.'));
        }

        $customer = Customer::query()
            ->where(fn ($q) => $q
                ->where(['oauth_provider' => $provider, 'oauth_subject' => $oauthUser->getId()])
                ->orWhere('email', $email)
            )
            ->first();

        if (! $customer) {
            // Split "Jane Doe" into first/last on a single space — good enough
            // for the OAuth path; the customer can edit it in Account later.
            $name  = (string) $oauthUser->getName();
            [$first, $last] = array_pad(explode(' ', $name, 2), 2, null);
            $customer = Customer::create([
                'id'                => 'cust_' . Str::random(20),
                'email'             => $email,
                'first_name'        => $first ?: null,
                'last_name'         => $last  ?: null,
                'oauth_provider'    => $provider,
                'oauth_subject'     => (string) $oauthUser->getId(),
                'avatar_url'        => $oauthUser->getAvatar(),
                'email_verified_at' => now(),
            ]);
        } else {
            // Refresh OAuth pointer + avatar so the latest Google identity wins.
            $customer->update([
                'oauth_provider'    => $provider,
                'oauth_subject'     => (string) $oauthUser->getId(),
                'avatar_url'        => $customer->avatar_url ?: $oauthUser->getAvatar(),
                'email_verified_at' => $customer->email_verified_at ?: now(),
                'last_login_at'     => now(),
            ]);
        }

        Auth::guard('customer')->login($customer, remember: true);
        $request->session()->regenerate();

        return redirect('/account');
    }

    /** Whitelist providers so we never call Socialite for an unknown driver. */
    private function assertProvider(string $provider): void
    {
        abort_unless(in_array($provider, ['google'], true), 404, 'Unsupported provider.');
    }

    /**
     * GET /api/account/orders/{orderNumber}
     *
     * Detailed view for the storefront's order detail page — line items,
     * shipping address, totals, tracking. Scoped to the signed-in customer
     * by order_number so we don't leak across accounts.
     */
    public function orderDetail(Request $request, string $orderNumber)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));

        $order = Order::query()
            ->where('customer_id', $customer->id)
            ->where('order_number', $orderNumber)
            ->first();
        if (! $order) abort(response()->json(['error' => 'Not found.'], 404));

        $items = OrderLineItem::query()->where('order_id', $order->id)->get();
        $package = Shipping::packagesForOrder($order)->first();

        // This buyer's slots. Everything pack-related below is scoped to these, so
        // a shared consignment can never leak another buyer's pieces.
        $mySlots = DB::table('pack_slots')
            ->where('order_id', $order->id)
            ->whereNull('deleted_at')
            ->get(['id', 'pack_campaign_id', 'size_label', 'status']);
        $mySlotIds = $mySlots->pluck('id');

        // Pack progress: fill COUNTS only. Never names, emails or other buyers'
        // items — the buyer needs to know what their order is waiting on, not who
        // else is in the drop.
        $packContext = null;
        if ($campaignId = $mySlots->first()?->pack_campaign_id) {
            $campaign = DB::table('pack_campaigns')->where('id', $campaignId)->first();
            $slotStats = DB::table('pack_slots')
                ->where('pack_campaign_id', $campaignId)
                ->whereNull('deleted_at')
                ->selectRaw("COUNT(*) as total, SUM(status = 'paid') as paid")
                ->first();

            $packContext = [
                'public_code'    => $campaign?->public_code,
                'title'          => $campaign?->title,
                'status'         => $campaign?->status,
                'slots_total'    => (int) ($slotStats->total ?? 0),
                'slots_paid'     => (int) ($slotStats->paid ?? 0),
                'ships_when_full'=> $campaign?->status === 'open',
                'your_items'     => $mySlots->map(fn ($s) => [
                    'slot_id'    => $s->id,
                    'size_label' => $s->size_label,
                    'status'     => $s->status,
                ])->values(),
                // How this buyer gets their piece once BLESSLUXE has collected the
                // consignment from the courier.
                'delivery'       => $mySlots->map(fn ($s) => PackForwarding::quoteFor($s->id))->values(),
            ];
        }

        return [
            'order' => [
                'order_number'     => $order->order_number,
                'status'           => $order->status,
                'payment_status'   => $order->payment_status,
                'payment_method'   => $order->payment_method,
                'currency_code'    => $order->currency_code,
                'subtotal_label'   => $this->money((int) $order->subtotal),
                'shipping_label'   => $this->money((int) $order->shipping_total),
                'discount_label'   => $this->money((int) $order->discount_total),
                'tax_label'        => $this->money((int) $order->tax_total),
                'total_label'      => $this->money((int) $order->total),
                'shipping_address' => $order->shipping_address,
                'billing_address'  => $order->billing_address,
                'created_at'       => $order->created_at?->toIso8601String(),
                'items' => $items->map(fn ($i) => [
                    'id'           => $i->id,
                    'product_id'   => $i->product_id,
                    'variant_id'   => $i->variant_id,
                    'title'        => $i->title,
                    'variant_title'=> $i->variant_title,
                    'quantity'     => (int) $i->quantity,
                    'unit_label'   => $this->money((int) $i->unit_price),
                    'total_label'  => $this->money(((int) $i->unit_price) * ((int) $i->quantity)),
                    'thumbnail'    => $i->thumbnail,
                ]),
                'tracking_code'    => $package?->package_code,
                'carrier'          => $package?->carrier,
                'tracking_number'  => $package?->carrier_tracking_number,

                'fulfillment_status' => $order->fulfillment_status,
                'fulfillment_label'  => FulfillmentStatus::tryFrom((string) $order->fulfillment_status)?->label(),

                // The customer's own order page used to show LESS than the anonymous
                // /track page — no status, no events, no ETA. Full shipments now.
                // Pack consignment contents are filtered to this buyer's slots
                // server-side; sub_codes are included because the caller is
                // authenticated as the buyer who owns them.
                'shipments' => Shipping::packagesForOrder($order)
                    ->map(fn ($p) => Shipping::shipmentPayload(
                        $p,
                        $p->is_pack ? $mySlotIds->all() : null,
                        includeSubCodes: true,
                    ))
                    ->values(),

                'pack' => $packContext,
            ],
        ];
    }

    /**
     * PUT /api/account/pack-slots/{slotId}/delivery
     *
     * How the buyer wants their piece once BLESSLUXE has it: collect in person
     * (free, default) or pay to have it forwarded. Changeable at any time until
     * admin dispatches or hands the piece over.
     */
    public function setDeliveryPreference(Request $request, string $slotId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        // Scope to the owner — a slot id must never be enough on its own.
        $slot = DB::table('pack_slots')->where('id', $slotId)->where('customer_id', $customer->id)->first();
        if (! $slot) return response()->json(['error' => 'That slot is not on your account.'], 404);

        $data = $request->validate([
            'preference' => ['required', 'in:collect,forward'],
            'address_id' => ['nullable', 'string'],
            'address'    => ['nullable', 'array'],
            'courier_id' => ['nullable', 'string'],
        ]);

        // A saved address wins over a posted one; it is the shape that can be labelled.
        $address = $data['address'] ?? null;
        if (! empty($data['address_id'])) {
            $saved = DB::table('customer_addresses')
                ->where('id', $data['address_id'])
                ->where('customer_id', $customer->id)
                ->first();
            if (! $saved) return response()->json(['error' => 'That address is not on your account.'], 404);
            $address = array_merge((array) $saved, ['id' => $saved->id]);
        }

        try {
            return [
                'delivery' => PackForwarding::setPreference(
                    $slotId,
                    $data['preference'],
                    $address,
                    $data['courier_id'] ?? null,
                ),
                // Priced for one piece, so the buyer can compare before committing.
                'courier_options' => \App\Services\Couriers::optionsFor(1),
            ];
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /**
     * GET /api/account/verify-email/{id}/{hash} (signed)
     *
     * The signed URL Laravel built when we sent the verify mail. We confirm
     * the hash matches the email (so a leaked link can't verify a different
     * account), set email_verified_at, and bounce to /account.
     */
    public function verifyEmail(Request $request, string $id, string $hash)
    {
        if (! $request->hasValidSignature()) {
            return redirect('/account?verify=expired');
        }
        $customer = Customer::query()->where('id', $id)->first();
        if (! $customer) return redirect('/account?verify=missing');

        // The hash is sha1(email) — same shape Laravel uses for its built-in
        // MustVerifyEmail. Constant-time compare to avoid timing leaks.
        if (! hash_equals(sha1($customer->email), $hash)) {
            return redirect('/account?verify=mismatch');
        }
        if (! $customer->email_verified_at) {
            $customer->forceFill(['email_verified_at' => now()])->save();
        }
        // If they aren't logged in (e.g., clicked from another device),
        // log them in so they land directly in the account.
        if (! Auth::guard('customer')->check()) {
            Auth::guard('customer')->login($customer, remember: true);
            $request->session()->regenerate();
        }
        return redirect('/account?verify=ok');
    }

    /** POST /api/account/verify-email/resend (signed-in only). */
    public function resendVerification(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));
        if ($customer->email_verified_at) {
            return ['ok' => true, 'already_verified' => true];
        }
        $this->sendVerificationLink($customer);
        return ['ok' => true];
    }

    /** POST /api/account/forgot-password { email } */
    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $email = strtolower(trim($data['email']));

        $customer = Customer::query()->where('email', $email)->first();
        // Always respond OK so we don't leak whether the email exists.
        if (! $customer) return ['ok' => true];

        $token = Str::random(64);
        DB::table('customer_password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            ['token' => Hash::make($token), 'created_at' => now()],
        );

        $resetUrl = rtrim(config('app.url', '/'), '/')
            . '/account/reset/' . $token
            . '?email=' . urlencode($email);

        try {
            Mail::to($email)->send(new PasswordResetMail($email, $resetUrl, $customer->first_name));
        } catch (\Throwable $e) {
            Log::warning('[password reset mail] '.$e->getMessage());
        }
        return ['ok' => true];
    }

    /** POST /api/account/reset-password { email, token, password } */
    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'token'    => ['required', 'string'],
            'password' => ['required', 'string', 'min:8'],
        ]);
        $email = strtolower(trim($data['email']));
        $row = DB::table('customer_password_reset_tokens')->where('email', $email)->first();
        if (! $row) {
            return response()->json(['error' => 'This reset link is invalid or has been used.'], 422);
        }
        // 60-minute window.
        if (Carbon::parse($row->created_at)->lt(now()->subMinutes(60))) {
            DB::table('customer_password_reset_tokens')->where('email', $email)->delete();
            return response()->json(['error' => 'This reset link has expired.'], 422);
        }
        if (! Hash::check($data['token'], $row->token)) {
            return response()->json(['error' => 'This reset link is invalid.'], 422);
        }
        $customer = Customer::query()->where('email', $email)->first();
        if (! $customer) {
            DB::table('customer_password_reset_tokens')->where('email', $email)->delete();
            return response()->json(['error' => 'Account not found.'], 422);
        }
        $customer->forceFill(['password' => Hash::make($data['password'])])->save();
        DB::table('customer_password_reset_tokens')->where('email', $email)->delete();

        Auth::guard('customer')->login($customer, remember: true);
        $request->session()->regenerate();

        return ['ok' => true, 'customer' => $this->shape($customer)];
    }

    /** Mint a signed verify-email URL and dispatch the mail. */
    private function sendVerificationLink(Customer $customer): void
    {
        if (! $customer->email) return;
        $url = URL::temporarySignedRoute(
            'customer.verify-email',
            now()->addHours(48),
            ['id' => $customer->id, 'hash' => sha1($customer->email)],
        );
        try {
            Mail::to($customer->email)->send(new VerifyEmailMail($customer, $url));
        } catch (\Throwable $e) {
            Log::warning('[verify mail] '.$e->getMessage());
        }
    }

    private function money(int $cents): string
    {
        return '$' . number_format($cents / 100, 2);
    }

    private function shape(Customer $c): array
    {
        return [
            'id'              => $c->id,
            'email'           => $c->email,
            'first_name'      => $c->first_name,
            'last_name'       => $c->last_name,
            'phone'           => $c->phone,
            'avatar_url'      => $c->avatar_url,
            'loyalty_points'  => (int) $c->loyalty_points,
            'loyalty_tier'    => $c->loyalty_tier,
            'oauth_provider'  => $c->oauth_provider,
            'has_password'    => ! empty($c->password),
            'email_verified_at' => optional($c->email_verified_at)->toIso8601String(),
            'last_login_at'   => optional($c->last_login_at)->toIso8601String(),
        ];
    }
}
