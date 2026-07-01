<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;

class CheckInventoryTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'check_inventory',
            'description' => 'Check live stock for a product. Pass product_id or handle, optional size/colour.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'product_id' => ['type' => 'string'],
                    'handle'     => ['type' => 'string'],
                    'size'       => ['type' => 'string'],
                    'color'      => ['type' => 'string'],
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
            ->with(['variants'])
            ->first();
        if (! $product) return $this->fail('Product not found.');

        $size = trim((string) ($params['size'] ?? ''));
        $color = trim((string) ($params['color'] ?? ''));
        $rows = $product->variants->map(function ($v) {
            return [
                'variant_id' => $v->id,
                'title'      => $v->title,
                'sku'        => $v->sku,
                'inventory'  => $v->manage_inventory ? (int) $v->inventory_quantity : null,
                'in_stock'   => ! $v->manage_inventory || $v->inventory_quantity > 0,
            ];
        });
        if ($size !== '') {
            $rows = $rows->filter(fn ($r) => stripos((string) $r['title'], $size) !== false);
        }
        if ($color !== '') {
            $rows = $rows->filter(fn ($r) => stripos((string) $r['title'], $color) !== false);
        }
        return $this->ok([
            'product' => ['id' => $product->id, 'title' => $product->title, 'handle' => $product->handle],
            'rows'    => $rows->values()->all(),
        ]);
    }
}
