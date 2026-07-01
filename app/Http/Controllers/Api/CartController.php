<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartLineItem;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CartController extends Controller
{
    /**
     * GET /api/store/cart
     *
     * Returns the current cart for this session, creating an empty one if
     * none exists. Always returns 200 with a shaped cart so the SPA can
     * render either an empty or populated state without branching on 404.
     */
    public function show(Request $request)
    {
        return ['cart' => $this->shape($this->currentOrNewCart($request))];
    }

    /**
     * POST /api/store/cart/line-items
     * { variant_id, quantity }
     *
     * Adds the variant (or increments the existing line) and returns the
     * updated cart. Refuses unknown variants with 404, oversells with 422
     * when `manage_inventory` is on.
     */
    public function addItem(Request $request)
    {
        $data = $request->validate([
            'variant_id' => ['required', 'string'],
            'quantity'   => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $qty = (int) ($data['quantity'] ?? 1);

        $variant = ProductVariant::with(['prices' => fn ($q) => $q->where('currency_code', 'usd')])
            ->find($data['variant_id']);
        if (! $variant) {
            return response()->json(['error' => 'Variant not found'], 404);
        }

        $cart = $this->currentOrNewCart($request);

        // Roll up duplicates instead of creating a second line for the same SKU.
        $existing = $cart->lineItems()->where('variant_id', $variant->id)->first();
        if ($existing) {
            $newQty = $existing->quantity + $qty;
            $this->assertStock($variant, $newQty);
            $existing->update(['quantity' => $newQty]);
        } else {
            $this->assertStock($variant, $qty);
            // If the customer landed via /affiliate/shop/{code}, attribute
            // every fresh line they add to that affiliate. The code stays on
            // the line forever — even if the session attribution is cleared
            // later, the sale still belongs to whoever earned it.
            $affiliateCode = $request->session()->get('affiliate_code');
            $metadata = $affiliateCode ? ['affiliate_code' => $affiliateCode] : null;
            CartLineItem::create([
                'id'         => 'cli_' . Str::random(20),
                'cart_id'    => $cart->id,
                'variant_id' => $variant->id,
                'quantity'   => $qty,
                'unit_price' => optional($variant->prices->first())->amount ?? 0,
                'metadata'   => $metadata,
            ]);
        }

        return ['cart' => $this->shape($cart->fresh())];
    }

    /**
     * PUT /api/store/cart/line-items/{id}
     * { quantity }
     */
    public function updateItem(Request $request, string $id)
    {
        $data = $request->validate([
            'quantity' => ['required', 'integer', 'min:0', 'max:50'],
        ]);

        $cart = $this->currentOrNewCart($request);
        $line = $cart->lineItems()->where('id', $id)->first();
        if (! $line) {
            return response()->json(['error' => 'Line item not found'], 404);
        }

        if ($data['quantity'] === 0) {
            $line->delete();
        } else {
            $variant = ProductVariant::find($line->variant_id);
            if ($variant) {
                $this->assertStock($variant, $data['quantity']);
            }
            $line->update(['quantity' => $data['quantity']]);
        }

        return ['cart' => $this->shape($cart->fresh())];
    }

    /**
     * DELETE /api/store/cart/line-items/{id}
     */
    public function removeItem(Request $request, string $id)
    {
        $cart = $this->currentOrNewCart($request);
        $line = $cart->lineItems()->where('id', $id)->first();
        if ($line) {
            $line->delete();
        }
        return ['cart' => $this->shape($cart->fresh())];
    }

    /**
     * POST /api/store/cart/clear
     */
    public function clear(Request $request)
    {
        $cart = $this->currentOrNewCart($request);
        $cart->lineItems()->delete();
        return ['cart' => $this->shape($cart->fresh())];
    }

    // ─── Internals ──────────────────────────────────────────────────────

    /**
     * Throws ValidationException with a 422 when an inventory-managed variant
     * would be oversold. Lets `manage_inventory=false` variants accept any
     * quantity (treated as made-to-order / drop-ship).
     */
    private function assertStock(ProductVariant $variant, int $desiredQty): void
    {
        if (! $variant->manage_inventory) return;
        if ($desiredQty <= $variant->inventory_quantity) return;
        abort(response()->json([
            'error' => "Only {$variant->inventory_quantity} left in stock for this size.",
        ], 422));
    }

    /**
     * Fetch the cart bound to this session, or create a fresh one and remember
     * its id. The session cookie is the only durable handle — closing the
     * browser starts a new cart (which matches what shoppers expect).
     */
    private function currentOrNewCart(Request $request): Cart
    {
        $id = $request->session()->get('cart_id');
        if ($id) {
            $cart = Cart::find($id);
            if ($cart) return $cart;
        }
        $cart = Cart::create([
            'id' => 'cart_' . Str::random(20),
        ]);
        $request->session()->put('cart_id', $cart->id);
        return $cart;
    }

    private function shape(Cart $cart): array
    {
        $lines = $cart->lineItems()
            ->with([
                'variant.product',
                'variant.product.images' => fn ($q) => $q->orderBy('rank')->limit(1),
            ])
            ->get();

        $items = $lines->map(function (CartLineItem $line) {
            $variant = $line->variant;
            $product = $variant?->product;
            $thumb   = $product?->thumbnail ?? optional($product?->images?->first())->url;
            return [
                'id'           => $line->id,
                'variant_id'   => $line->variant_id,
                'product_id'   => $product?->id,
                'product_handle' => $product?->handle,
                'title'        => $product?->title ?? 'Item',
                'variant_title' => $variant?->title,
                'thumbnail'    => $thumb,
                'quantity'     => $line->quantity,
                'unit_price'   => $line->unit_price,
                'line_total'   => $line->unit_price * $line->quantity,
            ];
        });

        $subtotal = (int) $items->sum('line_total');

        return [
            'id'         => $cart->id,
            'items'      => $items,
            'item_count' => (int) $items->sum('quantity'),
            'subtotal'   => $subtotal,
            'currency_code' => 'usd',
        ];
    }
}
