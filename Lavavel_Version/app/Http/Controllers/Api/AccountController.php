<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
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
