<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * CRUD over admin users (the `users` table). Only `admin` role can
 * manage other users. Active flag flips a soft disable so logins
 * fail without deleting history.
 */
class AdminUserController extends Controller
{
    private const ROLES = ['admin', 'staff'];

    public function index()
    {
        $this->gateAdmin();
        return [
            'users' => User::query()->orderBy('name')->get()->map(fn ($u) => $this->shape($u)),
        ];
    }

    public function store(Request $request)
    {
        $this->gateAdmin();
        $data = $request->validate([
            'name'      => ['required', 'string', 'max:120'],
            'email'     => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password'  => ['required', 'string', 'min:8'],
            'role'      => ['required', Rule::in(self::ROLES)],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $user = User::create([
            'name'      => $data['name'],
            'email'     => strtolower(trim($data['email'])),
            'password'  => Hash::make($data['password']),
            'role'      => $data['role'],
            'is_active' => (bool) ($data['is_active'] ?? true),
        ]);
        return ['user' => $this->shape($user)];
    }

    public function update(Request $request, int $id)
    {
        $this->gateAdmin();
        $user = User::findOrFail($id);
        $data = $request->validate([
            'name'      => ['nullable', 'string', 'max:120'],
            'email'     => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password'  => ['nullable', 'string', 'min:8'],
            'role'      => ['nullable', Rule::in(self::ROLES)],
            'is_active' => ['nullable', 'boolean'],
        ]);
        // Don't let the only active admin demote/disable themselves into a
        // lock-out. Counted at write time so the check is race-tolerant.
        if (($data['role'] ?? $user->role) !== 'admin' || ($data['is_active'] ?? $user->is_active) === false) {
            $remainingAdmins = User::query()
                ->where('role', 'admin')
                ->where('is_active', true)
                ->where('id', '!=', $user->id)
                ->count();
            if ($remainingAdmins === 0) {
                return response()->json(['error' => 'Cannot remove the last active admin.'], 422);
            }
        }
        if (! empty($data['email'])) $data['email'] = strtolower(trim($data['email']));
        if (! empty($data['password'])) $data['password'] = Hash::make($data['password']);
        else unset($data['password']);

        $user->update($data);
        return ['user' => $this->shape($user->fresh())];
    }

    public function destroy(int $id)
    {
        $this->gateAdmin();
        $user = User::findOrFail($id);
        $me = Auth::guard('web')->user();
        if ($me && (int) $me->id === (int) $user->id) {
            return response()->json(['error' => 'You can\'t delete yourself.'], 422);
        }
        $remainingAdmins = User::query()
            ->where('role', 'admin')
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->count();
        if ($remainingAdmins === 0) {
            return response()->json(['error' => 'Cannot delete the last active admin.'], 422);
        }
        $user->delete();
        return ['ok' => true];
    }

    private function gateAdmin(): void
    {
        $me = Auth::guard('web')->user();
        if (! $me || ($me->role ?? 'admin') !== 'admin') {
            abort(response()->json(['error' => 'Admin role required.'], 403));
        }
    }

    private function shape(User $u): array
    {
        return [
            'id'        => $u->id,
            'name'      => $u->name,
            'email'     => $u->email,
            'role'      => $u->role,
            'is_active' => (bool) $u->is_active,
            'created_at'=> $u->created_at?->toIso8601String(),
        ];
    }
}
