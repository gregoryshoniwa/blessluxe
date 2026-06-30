<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Customer wishlist. Persistent for signed-in customers via wishlist_items;
 * guests can keep a list in localStorage on the client and POST it to /merge
 * on first login so they don't lose their saved pieces.
 */
class WishlistController extends Controller
{
    /** GET /api/account/wishlist */
    public function index(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['items' => null];

        $rows = DB::table('wishlist_items')
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->pluck('product_id');

        $products = Product::query()
            ->whereIn('id', $rows)
            ->with(['variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                    'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                    'images' => fn ($q) => $q->orderBy('rank')->limit(1)])
            ->get()
            ->keyBy('id');

        // Preserve the wishlist's add order (most-recent first).
        $items = $rows->map(function ($pid) use ($products) {
            $p = $products->get($pid);
            if (! $p) return null;
            $price = optional($p->variants->first()?->prices->first())->amount;
            return [
                'id'          => $p->id,
                'handle'      => $p->handle,
                'title'       => $p->title,
                'subtitle'    => $p->subtitle,
                'thumbnail'   => $p->thumbnail ?? optional($p->images->first())->url,
                'price'       => $price,
                'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
            ];
        })->filter()->values();

        return ['items' => $items];
    }

    /** POST /api/account/wishlist { product_id } — idempotent toggle add. */
    public function add(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to save items.'], 401);
        $data = $request->validate(['product_id' => ['required', 'string', 'exists:products,id']]);
        DB::table('wishlist_items')->insertOrIgnore([
            'id'          => 'wli_' . Str::random(16),
            'customer_id' => $customer->id,
            'product_id'  => $data['product_id'],
            'created_at'  => now(),
        ]);
        return ['ok' => true];
    }

    /** DELETE /api/account/wishlist/{productId} */
    public function remove(Request $request, string $productId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to manage saved items.'], 401);
        DB::table('wishlist_items')
            ->where('customer_id', $customer->id)
            ->where('product_id', $productId)
            ->delete();
        return ['ok' => true];
    }

    /**
     * POST /api/account/wishlist/merge { product_ids: [...] }
     *
     * Called once on login: the client hands over any product IDs it had in
     * localStorage so the guest-side wishlist follows the customer into
     * their account.
     */
    public function merge(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Unauthorised.'], 401);
        $data = $request->validate([
            'product_ids' => ['nullable', 'array'],
            'product_ids.*' => ['string', 'exists:products,id'],
        ]);
        foreach ($data['product_ids'] ?? [] as $pid) {
            DB::table('wishlist_items')->insertOrIgnore([
                'id'          => 'wli_' . Str::random(16),
                'customer_id' => $customer->id,
                'product_id'  => $pid,
                'created_at'  => now(),
            ]);
        }
        return ['ok' => true];
    }
}
