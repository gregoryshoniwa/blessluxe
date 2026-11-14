<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Deleting a product from the admin.
 *
 * A piece sitting in anyone's bag used to make the delete fail with nothing but
 * "Could not delete." — `cart_line_items.variant_id` is the one foreign key onto
 * a variant that doesn't cascade, and a bag is a session nobody can see or empty.
 */
class AdminProductDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create(['name' => 'Admin', 'email' => 'admin@test.test', 'password' => bcrypt('secret')]);
    }

    private function product(string $id): void
    {
        DB::table('products')->insert(['id' => $id, 'title' => ucfirst($id), 'handle' => $id,
            'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        foreach (['S', 'M'] as $size) {
            DB::table('product_variants')->insert(['id' => "{$id}_$size", 'product_id' => $id, 'title' => $size,
                'manage_inventory' => true, 'inventory_quantity' => 3, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function inABag(string $variantId, string $cartId = 'cart_1'): void
    {
        DB::table('carts')->insertOrIgnore(['id' => $cartId, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cart_line_items')->insert(['id' => "line_{$cartId}_{$variantId}", 'cart_id' => $cartId,
            'variant_id' => $variantId, 'quantity' => 1, 'unit_price' => 5000, 'created_at' => now(), 'updated_at' => now()]);
    }

    #[Test]
    public function a_product_in_someones_bag_can_still_be_deleted(): void
    {
        $this->product('gown');
        $this->product('tote');
        $this->inABag('gown_M');
        $this->inABag('tote_S');

        $this->actingAs($this->admin(), 'web')->deleteJson('/api/admin/products/gown')->assertOk();

        $this->assertDatabaseMissing('products', ['id' => 'gown']);
        $this->assertDatabaseMissing('product_variants', ['product_id' => 'gown']);
        $this->assertDatabaseMissing('cart_line_items', ['variant_id' => 'gown_M']);
        // The bag itself, and the other piece in it, are left alone.
        $this->assertDatabaseHas('carts', ['id' => 'cart_1']);
        $this->assertDatabaseHas('cart_line_items', ['variant_id' => 'tote_S']);
    }

    #[Test]
    public function a_size_in_someones_bag_can_still_be_deleted(): void
    {
        $this->product('gown');
        $this->inABag('gown_M');
        $this->inABag('gown_S');

        $this->actingAs($this->admin(), 'web')->deleteJson('/api/admin/products/gown/variants/gown_M')->assertOk();

        $this->assertDatabaseMissing('product_variants', ['id' => 'gown_M']);
        $this->assertDatabaseMissing('cart_line_items', ['variant_id' => 'gown_M']);
        $this->assertDatabaseHas('cart_line_items', ['variant_id' => 'gown_S']);
    }
}
