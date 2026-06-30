<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AdminAuthController extends Controller
{
    /**
     * GET /api/admin/me — `{ user: null }` for guests, otherwise the
     * signed-in admin's profile. Drives the SPA's "show login vs dashboard"
     * decision on first paint.
     */
    public function me()
    {
        $user = Auth::guard('web')->user();
        return ['user' => $user ? $this->shape($user) : null];
    }

    /**
     * POST /api/admin/login
     * { email, password, remember? }
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $ok = Auth::guard('web')->attempt([
            'email'    => strtolower(trim($data['email'])),
            'password' => $data['password'],
        ], (bool) ($data['remember'] ?? false));

        if (! $ok) {
            return response()->json(['error' => 'Invalid email or password.'], 422);
        }

        $request->session()->regenerate();
        return ['user' => $this->shape(Auth::guard('web')->user()->fresh())];
    }

    /**
     * POST /api/admin/logout
     */
    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return ['ok' => true];
    }

    private function shape(User $u): array
    {
        return [
            'id'    => $u->id,
            'name'  => $u->name,
            'email' => $u->email,
        ];
    }
}
