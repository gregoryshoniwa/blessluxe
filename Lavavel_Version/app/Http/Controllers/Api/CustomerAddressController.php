<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Per-customer saved addresses. Used by the Account → Addresses tab
 * and pre-filled into checkout.
 */
class CustomerAddressController extends Controller
{
    public function index()
    {
        $customer = $this->mustBeSignedIn();
        $rows = CustomerAddress::query()->where('customer_id', $customer->id)
            ->orderByDesc('is_default_shipping')
            ->orderByDesc('updated_at')
            ->get();

        return ['addresses' => $rows->map(fn ($a) => $this->shape($a))];
    }

    public function store(Request $request)
    {
        $customer = $this->mustBeSignedIn();
        $data = $this->validated($request);

        // Defaulting: if this is the first address, make it default
        // shipping + billing unconditionally.
        $hasAny = CustomerAddress::query()->where('customer_id', $customer->id)->exists();
        if (! $hasAny) {
            $data['is_default_shipping'] = true;
            $data['is_default_billing']  = true;
        }

        $address = DB::transaction(function () use ($customer, $data) {
            if (! empty($data['is_default_shipping'])) {
                CustomerAddress::where('customer_id', $customer->id)->update(['is_default_shipping' => false]);
            }
            if (! empty($data['is_default_billing'])) {
                CustomerAddress::where('customer_id', $customer->id)->update(['is_default_billing' => false]);
            }
            return CustomerAddress::create([
                'id'          => 'addr_' . Str::random(20),
                'customer_id' => $customer->id,
            ] + $data);
        });

        return ['address' => $this->shape($address)];
    }

    public function update(Request $request, string $id)
    {
        $customer = $this->mustBeSignedIn();
        $address = CustomerAddress::query()->where('customer_id', $customer->id)->where('id', $id)->firstOrFail();
        $data = $this->validated($request);

        DB::transaction(function () use ($customer, $address, $data) {
            if (! empty($data['is_default_shipping'])) {
                CustomerAddress::where('customer_id', $customer->id)
                    ->where('id', '!=', $address->id)
                    ->update(['is_default_shipping' => false]);
            }
            if (! empty($data['is_default_billing'])) {
                CustomerAddress::where('customer_id', $customer->id)
                    ->where('id', '!=', $address->id)
                    ->update(['is_default_billing' => false]);
            }
            $address->update($data);
        });

        return ['address' => $this->shape($address->fresh())];
    }

    public function destroy(string $id)
    {
        $customer = $this->mustBeSignedIn();
        $address = CustomerAddress::query()->where('customer_id', $customer->id)->where('id', $id)->firstOrFail();
        $address->delete();
        return ['ok' => true];
    }

    private function mustBeSignedIn()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));
        return $customer;
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'label'                => ['nullable', 'string', 'max:64'],
            'first_name'           => ['nullable', 'string', 'max:120'],
            'last_name'            => ['nullable', 'string', 'max:120'],
            'phone'                => ['nullable', 'string', 'max:40'],
            'line1'                => ['required', 'string', 'max:255'],
            'line2'                => ['nullable', 'string', 'max:255'],
            'city'                 => ['required', 'string', 'max:120'],
            'region'               => ['nullable', 'string', 'max:120'],
            'postal_code'          => ['nullable', 'string', 'max:40'],
            'country'              => ['required', 'string', 'size:2'],
            'is_default_shipping'  => ['nullable', 'boolean'],
            'is_default_billing'   => ['nullable', 'boolean'],
        ]);
    }

    private function shape(CustomerAddress $a): array
    {
        return [
            'id'                  => $a->id,
            'label'               => $a->label,
            'first_name'          => $a->first_name,
            'last_name'           => $a->last_name,
            'phone'               => $a->phone,
            'line1'               => $a->line1,
            'line2'               => $a->line2,
            'city'                => $a->city,
            'region'              => $a->region,
            'postal_code'         => $a->postal_code,
            'country'             => strtoupper($a->country),
            'is_default_shipping' => (bool) $a->is_default_shipping,
            'is_default_billing'  => (bool) $a->is_default_billing,
        ];
    }
}
