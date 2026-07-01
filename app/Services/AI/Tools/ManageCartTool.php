<?php

namespace App\Services\AI\Tools;

use App\Models\Cart;
use App\Models\CartLineItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\AI\AgentContext;
use Illuminate\Support\Str;

class ManageCartTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'manage_cart',
            'description' => 'Add / remove / update / view / clear the customer cart. Prefer variant_id; fall back to product_id or handle when unknown.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'action'     => ['type' => 'string', 'enum' => ['add', 'remove', 'update_quantity', 'clear', 'view']],
                    'variant_id' => ['type' => 'string'],
                    'product_id' => ['type' => 'string'],
                    'handle'     => ['type' => 'string'],
                    'quantity'   => ['type' => 'number'],
                ],
                'required' => ['action'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $action = (string) ($params['action'] ?? '');
        // Carts are session-scoped — the controller has already resolved
        // the right one via the customer's HTTP session cookie. Only spin
        // up a brand-new cart when none exists on this session.
        $cart = $context->cart;
        if (! $cart) {
            $cart = Cart::create(['id' => 'cart_' . Str::random(20)]);
        }

        if ($action === 'view') {
            $items = $cart->lineItems()->get()->map(fn ($it) => [
                'id'            => $it->id,
                'variant_id'    => $it->variant_id,
                'product_id'    => $it->product_id,
                'title'         => $it->title,
                'variant_title' => $it->variant_title,
                'quantity'      => (int) $it->quantity,
                'unit_label'    => '$' . number_format($it->unit_price / 100, 2),
            ])->all();
            return $this->ok([
                'cart_id' => $cart->id,
                'items'   => $items,
                'count'   => array_sum(array_column($items, 'quantity')),
            ]);
        }

        if ($action === 'clear') {
            $cart->lineItems()->delete();
            return $this->ok(['cart_id' => $cart->id, 'cleared' => true]);
        }

        if ($action === 'add') {
            $variant = $this->resolveVariant($params);
            if (! $variant) return $this->fail('Could not find that variant.');
            $qty = max(1, (int) ($params['quantity'] ?? 1));
            $price = optional($variant->prices()->where('currency_code', 'usd')->first())->amount ?? 0;
            $existing = $cart->lineItems()->where('variant_id', $variant->id)->first();
            if ($existing) {
                $existing->update(['quantity' => $existing->quantity + $qty]);
            } else {
                CartLineItem::create([
                    'id'            => 'line_' . Str::random(20),
                    'cart_id'       => $cart->id,
                    'variant_id'    => $variant->id,
                    'product_id'    => $variant->product_id,
                    'title'         => $variant->product?->title ?? 'Item',
                    'variant_title' => $variant->title,
                    'sku'           => $variant->sku,
                    'thumbnail'     => $variant->product?->thumbnail,
                    'quantity'      => $qty,
                    'unit_price'    => $price,
                ]);
            }
            return $this->ok([
                'cart_id' => $cart->id,
                'added'   => true,
                'message' => "Added {$qty}× {$variant->title} to cart.",
            ], uiAction: ['type' => 'open_cart_drawer']);
        }

        if ($action === 'update_quantity') {
            $variantId = (string) ($params['variant_id'] ?? '');
            $line = $cart->lineItems()->where('variant_id', $variantId)->first();
            if (! $line) return $this->fail('Item not in cart.');
            $qty = max(0, (int) ($params['quantity'] ?? 1));
            if ($qty === 0) $line->delete();
            else $line->update(['quantity' => $qty]);
            return $this->ok(['cart_id' => $cart->id, 'updated' => true]);
        }

        if ($action === 'remove') {
            $variantId = (string) ($params['variant_id'] ?? '');
            $cart->lineItems()->where('variant_id', $variantId)->delete();
            return $this->ok(['cart_id' => $cart->id, 'removed' => true]);
        }

        return $this->fail('Unknown action: '.$action);
    }

    private function resolveVariant(array $params): ?ProductVariant
    {
        $vid = trim((string) ($params['variant_id'] ?? ''));
        if ($vid !== '') return ProductVariant::with('product')->find($vid);

        $pid = trim((string) ($params['product_id'] ?? ''));
        $handle = trim((string) ($params['handle'] ?? ''));
        if ($pid === '' && $handle === '') return null;
        $product = Product::query()
            ->when($pid !== '', fn ($q) => $q->where('id', $pid))
            ->when($handle !== '', fn ($q) => $q->where('handle', $handle))
            ->with(['variants' => fn ($q) => $q->orderBy('created_at')])
            ->first();
        return $product?->variants->first();
    }
}
