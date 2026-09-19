<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Couriers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Courier management.
 *
 * The interesting case is deletion: a courier that has carried goods cannot simply
 * be removed, because doing so erases how those shipments actually travelled.
 */
class CourierCrudTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'name' => 'Admin', 'email' => 'admin@test.test',
            'password' => bcrypt('secret'),
        ]);
    }

    #[Test]
    public function an_admin_can_add_a_courier(): void
    {
        $this->actingAs($this->admin(), 'web')
            ->postJson('/api/admin/couriers', [
                'code' => 'kwik', 'name' => 'Kwik Cargo',
                'base_fee' => 1500, 'per_item_fee' => 250,
                'min_days' => 5, 'max_days' => 9,
            ])
            ->assertOk();

        $this->assertDatabaseHas('couriers', ['code' => 'kwik', 'name' => 'Kwik Cargo']);
        $this->assertSame(1500 + 250, Couriers::quote('cour_kwik', 1)['amount']);
    }

    #[Test]
    public function a_courier_code_must_be_unique(): void
    {
        $this->actingAs($this->admin(), 'web')
            ->postJson('/api/admin/couriers', ['code' => 'dhl', 'name' => 'Duplicate'])
            ->assertStatus(422);
    }

    #[Test]
    public function a_backwards_eta_range_is_rejected(): void
    {
        // "14–3 days" would render as nonsense to a customer.
        $this->actingAs($this->admin(), 'web')
            ->postJson('/api/admin/couriers', [
                'code' => 'oops', 'name' => 'Oops', 'min_days' => 14, 'max_days' => 3,
            ])
            ->assertStatus(422);
    }

    #[Test]
    public function an_unused_courier_is_deleted_outright(): void
    {
        $this->actingAs($this->admin(), 'web')
            ->deleteJson('/api/admin/couriers/cour_fedex')
            ->assertOk()
            ->assertJson(['deleted' => true]);

        $this->assertDatabaseMissing('couriers', ['id' => 'cour_fedex']);
    }

    #[Test]
    public function a_courier_carrying_goods_is_deactivated_not_deleted(): void
    {
        DB::table('pack_definitions')->insert([
            'id' => 'pdef_x', 'pack_kind' => 'single', 'title' => 'P', 'handle' => 'p',
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('pack_campaigns')->insert([
            'id' => 'pcam_x', 'pack_definition_id' => 'pdef_x', 'host_kind' => 'admin',
            'public_code' => 'XPACK00001', 'status' => 'open',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('products')->insert([
            'id' => 'prod_x', 'title' => 'D', 'handle' => 'd', 'status' => 'published',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_variants')->insert([
            'id' => 'var_x', 'product_id' => 'prod_x', 'title' => 'M',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('pack_slots')->insert([
            'id' => 'pslot_x', 'pack_campaign_id' => 'pcam_x', 'variant_id' => 'var_x',
            'status' => 'paid', 'courier_id' => 'cour_dhl',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->admin(), 'web')
            ->deleteJson('/api/admin/couriers/cour_dhl')
            ->assertOk()
            ->assertJson(['deactivated' => true]);

        // Still present, so the shipment's history stays intact...
        $this->assertDatabaseHas('couriers', ['id' => 'cour_dhl', 'is_active' => false]);
        // ...but no longer offered to buyers.
        $this->assertNotContains('cour_dhl', array_column(Couriers::optionsFor(1), 'courier_id'));
    }

    #[Test]
    public function deleting_the_default_promotes_another_one(): void
    {
        $default = DB::table('couriers')->where('is_default', true)->first();
        $this->assertNotNull($default);

        $this->actingAs($this->admin(), 'web')
            ->deleteJson("/api/admin/couriers/{$default->id}")
            ->assertOk();

        // A buyer must always have something pre-selected.
        $this->assertTrue(
            DB::table('couriers')->where('is_active', true)->where('is_default', true)->exists(),
            'Removing the default courier must promote another.'
        );
    }

    #[Test]
    public function setting_a_new_default_clears_the_old_one(): void
    {
        $this->actingAs($this->admin(), 'web')
            ->putJson('/api/admin/couriers/cour_dhl', ['is_default' => true])
            ->assertOk();

        $this->assertSame(1, DB::table('couriers')->where('is_default', true)->count());
        $this->assertTrue((bool) DB::table('couriers')->where('id', 'cour_dhl')->value('is_default'));
    }
}
