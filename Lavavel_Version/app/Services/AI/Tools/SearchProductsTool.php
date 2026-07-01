<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;

class SearchProductsTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'search_products',
            'description' => "Search the live BLESSLUXE catalog. Supports Women, Men, Children, Sale departments and garment-level categories. Use this for any catalog claim — never hallucinate the assortment.",
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'query'      => ['type' => 'string', 'description' => 'Free-text search'],
                    'category'   => ['type' => 'string', 'description' => 'Heading or catalogue handle (women, men, children, sale, dresses, …).'],
                    'colors'     => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Colour filter'],
                    'sizes'      => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Size filter'],
                    'price_min'  => ['type' => 'number', 'description' => 'Minimum price in dollars'],
                    'price_max'  => ['type' => 'number', 'description' => 'Maximum price in dollars'],
                    'sort_by'    => ['type' => 'string', 'enum' => ['newest', 'price-asc', 'price-desc', 'featured'], 'description' => 'Sort order'],
                    'limit'      => ['type' => 'number', 'description' => 'Max results (1–12).'],
                ],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $limit = max(1, min(12, (int) ($params['limit'] ?? 6)));
        $query = trim((string) ($params['query'] ?? ''));
        $category = trim((string) ($params['category'] ?? ''));

        $q = Product::query()->where('status', 'published');
        if ($query !== '') {
            $q->where(function ($qq) use ($query) {
                $qq->where('title', 'like', "%{$query}%")
                   ->orWhere('subtitle', 'like', "%{$query}%")
                   ->orWhere('handle', 'like', "%{$query}%");
            });
        }
        if ($category !== '') {
            $q->whereHas('catalogues', function ($qq) use ($category) {
                $qq->where('handle', $category)
                   ->orWhereHas('heading', fn ($qh) => $qh->where('handle', $category));
            });
        }
        $sort = $params['sort_by'] ?? 'featured';
        match ($sort) {
            'newest'     => $q->orderByDesc('created_at'),
            'price-asc'  => $q->orderBy('created_at'),
            'price-desc' => $q->orderByDesc('created_at'),
            default      => $q->orderByDesc('created_at'),
        };

        $q->with([
            'variants' => fn ($qq) => $qq->orderBy('created_at'),
            'variants.prices' => fn ($qq) => $qq->where('currency_code', 'usd'),
        ]);

        $products = $q->limit($limit)->get()->map(function ($p) {
            $price = optional($p->variants->first()?->prices->first())->amount;
            $inStock = $p->variants->contains(fn ($v) => ! $v->manage_inventory || $v->inventory_quantity > 0);
            return [
                'id'         => $p->id,
                'handle'     => $p->handle,
                'title'      => $p->title,
                'subtitle'   => $p->subtitle,
                'thumbnail'  => $p->thumbnail,
                'price'      => $price,
                'price_label'=> $price !== null ? '$' . number_format($price / 100, 2) : null,
                'inStock'    => $inStock,
            ];
        })->all();

        return $this->ok([
            'products' => $products,
            'count'    => count($products),
        ]);
    }
}
