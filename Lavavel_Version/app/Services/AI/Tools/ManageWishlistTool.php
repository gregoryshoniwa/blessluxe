<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ManageWishlistTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'manage_wishlist',
            'description' => 'Add / remove / view the customer wishlist.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'action'     => ['type' => 'string', 'enum' => ['add', 'remove', 'view', 'clear']],
                    'product_id' => ['type' => 'string'],
                    'handle'     => ['type' => 'string'],
                ],
                'required' => ['action'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $action = (string) ($params['action'] ?? '');
        if (! $context->isAuthenticated() && $action !== 'view') {
            return $this->fail('Sign in to manage your wishlist.');
        }
        $customer = $context->customer;

        if ($action === 'view') {
            if (! $customer) return $this->ok(['items' => []]);
            $rows = DB::table('wishlist_items')
                ->where('customer_id', $customer->id)
                ->join('products', 'products.id', '=', 'wishlist_items.product_id')
                ->select('products.id', 'products.handle', 'products.title', 'products.thumbnail')
                ->limit(20)
                ->get();
            return $this->ok(['items' => $rows->all()]);
        }

        $productId = $this->resolveProductId($params);
        if ($action === 'add' && $productId) {
            DB::table('wishlist_items')->updateOrInsert(
                ['customer_id' => $customer->id, 'product_id' => $productId],
                ['id' => 'wish_' . Str::random(20), 'created_at' => now()],
            );
            return $this->ok(['added' => true]);
        }
        if ($action === 'remove' && $productId) {
            DB::table('wishlist_items')
                ->where('customer_id', $customer->id)
                ->where('product_id', $productId)
                ->delete();
            return $this->ok(['removed' => true]);
        }
        if ($action === 'clear') {
            DB::table('wishlist_items')->where('customer_id', $customer->id)->delete();
            return $this->ok(['cleared' => true]);
        }
        return $this->fail('Unknown action or missing product.');
    }

    private function resolveProductId(array $params): ?string
    {
        if (! empty($params['product_id'])) return (string) $params['product_id'];
        if (! empty($params['handle'])) {
            return optional(Product::where('handle', $params['handle'])->first())->id;
        }
        return null;
    }
}
