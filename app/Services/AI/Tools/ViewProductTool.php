<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;

class ViewProductTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'view_product',
            'description' => 'Fetch full detail for one product (variants, sizes, prices, availability).',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'product_id' => ['type' => 'string', 'description' => 'Internal product id'],
                    'handle'     => ['type' => 'string', 'description' => 'URL handle / slug'],
                ],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $id = trim((string) ($params['product_id'] ?? ''));
        $handle = trim((string) ($params['handle'] ?? ''));
        if ($id === '' && $handle === '') return $this->fail('Provide product_id or handle.');

        $product = Product::query()
            ->where('status', 'published')
            ->when($id !== '', fn ($q) => $q->where('id', $id))
            ->when($handle !== '', fn ($q) => $q->where('handle', $handle))
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at'),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank'),
            ])
            ->first();
        if (! $product) return $this->fail('Product not found.');

        $price = optional($product->variants->first()?->prices->first())->amount;
        return $this->ok([
            'product' => [
                'id'          => $product->id,
                'handle'      => $product->handle,
                'title'       => $product->title,
                'subtitle'    => $product->subtitle,
                'description' => $product->description,
                'thumbnail'   => $product->thumbnail,
                'price'       => $price,
                'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
                'inStock'     => $product->variants->contains(fn ($v) => ! $v->manage_inventory || $v->inventory_quantity > 0),
            ],
            'variants' => $product->variants->map(fn ($v) => [
                'id'                 => $v->id,
                'title'              => $v->title,
                'sku'                => $v->sku,
                'inventory_quantity' => (int) $v->inventory_quantity,
                'manage_inventory'   => (bool) $v->manage_inventory,
                'price'              => optional($v->prices->first())->amount,
            ])->all(),
        ]);
    }
}
