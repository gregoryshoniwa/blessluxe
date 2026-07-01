<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminCustomerController extends Controller
{
    public function index(Request $request)
    {
        $q = Customer::query()
            ->withCount('orders')
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('email', 'like', "%{$term}%")
                       ->orWhere('first_name', 'like', "%{$term}%")
                       ->orWhere('last_name', 'like', "%{$term}%")
                       ->orWhere('phone', 'like', "%{$term}%");
                });
            })
            ->latest();

        $paginator = $q->paginate((int) min(100, max(10, (int) $request->query('limit', 25))));

        return [
            'customers' => collect($paginator->items())->map(fn ($c) => [
                'id'             => $c->id,
                'email'          => $c->email,
                'first_name'     => $c->first_name,
                'last_name'      => $c->last_name,
                'phone'          => $c->phone,
                'loyalty_tier'   => $c->loyalty_tier,
                'loyalty_points' => $c->loyalty_points,
                'orders_count'   => $c->orders_count,
                'created_at'     => $c->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * POST /api/admin/customers/{id}/loyalty
     * { delta: int, reason?: string }
     */
    public function adjustLoyalty(Request $request, string $id)
    {
        $customer = Customer::findOrFail($id);
        $data = $request->validate([
            'delta'  => ['required', 'integer'],
            'reason' => ['nullable', 'string', 'max:64'],
        ]);

        DB::transaction(function () use ($customer, $data) {
            // Update the balance atomically.
            Customer::where('id', $customer->id)->update([
                'loyalty_points' => DB::raw('GREATEST(0, loyalty_points + ' . (int) $data['delta'] . ')'),
                'updated_at'     => now(),
            ]);
            // Mirror the change in the blits_ledger for traceability — every
            // admin adjustment leaves a paper trail beside organic redemptions.
            $newBalance = (int) Customer::where('id', $customer->id)->value('loyalty_points');
            DB::table('blits_ledger')->insert([
                'id'           => 'blt_' . Str::random(16),
                'customer_id'  => $customer->id,
                'delta'        => (int) $data['delta'],
                'balance_after'=> $newBalance,
                'reason'       => $data['reason'] ?? 'admin_adjustment',
                'created_at'   => now(),
            ]);
        });

        $fresh = Customer::find($id);
        return ['customer' => [
            'id'             => $fresh->id,
            'email'          => $fresh->email,
            'loyalty_points' => $fresh->loyalty_points,
            'loyalty_tier'   => $fresh->loyalty_tier,
        ]];
    }
}
