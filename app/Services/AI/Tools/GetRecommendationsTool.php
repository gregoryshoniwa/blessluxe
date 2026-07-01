<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;

class GetRecommendationsTool extends AiTool
{
    private const TYPE_TITLES = [
        'for_you'         => 'Picked For You',
        'complete_outfit' => 'Complete Your Outfit',
        'similar_to'      => 'You Might Also Like',
        'trending'        => 'Trending In Your Style',
        'new_for_you'     => 'New Arrivals For You',
        'occasion'        => 'Perfect For The Occasion',
        'gift'            => 'Gift Ideas',
        'restock'         => 'Time To Reorder?',
    ];

    public function definition(): array
    {
        return [
            'name' => 'get_recommendations',
            'description' => 'Personalised product picks from the live catalogue. Use type=trending for general recs, type=for_you when the customer is logged in.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'type'       => ['type' => 'string', 'enum' => array_keys(self::TYPE_TITLES)],
                    'category'   => ['type' => 'string'],
                    'budget'     => ['type' => 'number'],
                    'limit'      => ['type' => 'number'],
                ],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $type = (string) ($params['type'] ?? 'trending');
        $limit = max(1, min(12, (int) ($params['limit'] ?? 6)));
        $budget = isset($params['budget']) ? (float) $params['budget'] : null;
        $category = trim((string) ($params['category'] ?? ''));

        $q = Product::query()
            ->where('status', 'published')
            ->orderByDesc('updated_at')
            ->with([
                'variants' => fn ($qq) => $qq->orderBy('created_at'),
                'variants.prices' => fn ($qq) => $qq->where('currency_code', 'usd'),
            ]);
        if ($category !== '') {
            $q->whereHas('catalogues', function ($qq) use ($category) {
                $qq->where('handle', $category)
                   ->orWhereHas('heading', fn ($qh) => $qh->where('handle', $category));
            });
        }
        $items = $q->limit($limit * 2)->get();
        if ($budget !== null) {
            $cents = (int) round($budget * 100);
            $items = $items->filter(function ($p) use ($cents) {
                $price = optional($p->variants->first()?->prices->first())->amount;
                return $price !== null && $price <= $cents;
            });
        }
        $items = $items->take($limit)->map(function ($p) {
            $price = optional($p->variants->first()?->prices->first())->amount;
            return [
                'id'          => $p->id,
                'handle'      => $p->handle,
                'title'       => $p->title,
                'subtitle'    => $p->subtitle,
                'thumbnail'   => $p->thumbnail,
                'price'       => $price,
                'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
                'inStock'     => $p->variants->contains(fn ($v) => ! $v->manage_inventory || $v->inventory_quantity > 0),
            ];
        })->values()->all();

        return $this->ok([
            'title'           => self::TYPE_TITLES[$type] ?? 'Recommendations',
            'recommendations' => $items,
            'count'           => count($items),
        ]);
    }
}
