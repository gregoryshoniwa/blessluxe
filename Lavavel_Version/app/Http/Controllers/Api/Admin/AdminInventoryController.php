<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminInventoryController extends Controller
{
    /** Variant-centric inventory list. Lets admins sort by stock + filter low-stock. */
    public function index(Request $request)
    {
        $q = ProductVariant::query()
            ->with('product:id,title,handle,thumbnail')
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('sku', 'like', "%{$term}%")
                       ->orWhereHas('product', fn ($qp) => $qp->where('title', 'like', "%{$term}%"));
                });
            })
            ->when($request->boolean('low_stock'), fn ($q) => $q->where('inventory_quantity', '<=', 5));

        $paginator = $q->orderBy('inventory_quantity')->paginate((int) min(100, max(10, (int) $request->query('limit', 50))));

        return [
            'variants' => collect($paginator->items())->map(fn ($v) => [
                'id'                 => $v->id,
                'sku'                => $v->sku,
                'title'              => $v->title,
                'product_id'         => $v->product_id,
                'product_title'      => $v->product?->title,
                'product_handle'     => $v->product?->handle,
                'manage_inventory'   => (bool) $v->manage_inventory,
                'inventory_quantity' => $v->inventory_quantity,
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
     * POST /api/admin/inventory/{variant_id}/adjust
     * { delta: int, reason?: string, notes?: string }
     *
     * Records the movement, then updates inventory_quantity atomically.
     */
    public function adjust(Request $request, string $variantId)
    {
        $variant = ProductVariant::findOrFail($variantId);
        $data = $request->validate([
            'delta'  => ['required', 'integer'],
            'reason' => ['nullable', 'string', 'max:64'],
            'notes'  => ['nullable', 'string', 'max:1000'],
        ]);

        DB::transaction(function () use ($variant, $data) {
            DB::table('inventory_movements')->insert([
                'id'         => 'inv_' . Str::random(16),
                'variant_id' => $variant->id,
                'delta'      => (int) $data['delta'],
                'reason'     => $data['reason'] ?? ($data['delta'] >= 0 ? 'adjustment' : 'adjustment'),
                'notes'      => $data['notes'] ?? null,
                'created_by' => optional(Auth::guard('web')->user())->id,
                'created_at' => now(),
            ]);
            ProductVariant::where('id', $variant->id)->update([
                'inventory_quantity' => DB::raw('GREATEST(0, inventory_quantity + ' . (int) $data['delta'] . ')'),
                'manage_inventory'   => true,
                'updated_at'         => now(),
            ]);
        });

        $fresh = ProductVariant::find($variant->id);
        return [
            'variant' => [
                'id'                 => $fresh->id,
                'sku'                => $fresh->sku,
                'inventory_quantity' => $fresh->inventory_quantity,
            ],
        ];
    }
}
