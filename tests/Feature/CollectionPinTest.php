<?php

namespace Tests\Feature;

use App\Models\PackageItem;
use App\Services\Couriers;
use App\Services\PackForwarding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Handover security and the local/import split.
 *
 * sub_code identifies WHICH piece and is printed on the manifest; the PIN proves
 * WHO is collecting. Conflating the two would let anyone who saw a manifest — or
 * who guessed the pattern from a consignment code — walk off with a garment.
 */
class CollectionPinTest extends TestCase
{
    use RefreshDatabase;

    private function makePiece(): PackageItem
    {
        DB::table('packages')->insert([
            'id' => 'pkg_t', 'package_code' => 'BL-AAAA-BBBB-C',
            'order_id' => null, 'status' => 'delivered', 'is_pack' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return PackageItem::create([
            'id' => 'pkgi_t', 'package_id' => 'pkg_t',
            'product_title' => 'Dress', 'quantity' => 1, 'unit_price' => 100,
            'sub_code' => 'BL-AAAA-BBBB-C-01', 'status' => 'at_admin',
        ]);
    }

    #[Test]
    public function the_pin_is_not_derivable_from_the_public_sub_code(): void
    {
        $item = $this->makePiece();
        $pin = PackForwarding::ensureCollectionPin($item);

        $this->assertSame(6, strlen($pin));
        $this->assertStringNotContainsString($pin, $item->sub_code);
        // Ambiguous characters would be misread over a counter or a phone call.
        $this->assertDoesNotMatchRegularExpression('/[0O1I]/', $pin);
    }

    #[Test]
    public function the_pin_is_stable_once_issued(): void
    {
        $item = $this->makePiece();
        $first = PackForwarding::ensureCollectionPin($item);

        // Re-issuing would invalidate the code already shown to the buyer.
        $this->assertSame($first, PackForwarding::ensureCollectionPin($item->fresh()));
    }

    #[Test]
    public function a_wrong_pin_is_rejected_and_counted(): void
    {
        $item = $this->makePiece();
        PackForwarding::ensureCollectionPin($item);

        $this->assertFalse(PackForwarding::verifyCollectionPin($item->fresh(), 'WRONG1'));
        $this->assertSame(1, $item->fresh()->collection_attempts);
    }

    #[Test]
    public function the_correct_pin_is_accepted_case_insensitively(): void
    {
        $item = $this->makePiece();
        $pin = PackForwarding::ensureCollectionPin($item);

        // Customers read these aloud; case should not decide whether they get their goods.
        $this->assertTrue(PackForwarding::verifyCollectionPin($item->fresh(), strtolower($pin)));
    }

    #[Test]
    public function brute_force_is_stopped_after_ten_attempts(): void
    {
        $item = $this->makePiece();
        PackForwarding::ensureCollectionPin($item);

        for ($i = 0; $i < 10; $i++) {
            PackForwarding::verifyCollectionPin($item->fresh(), 'BADPIN');
        }

        $this->expectException(\RuntimeException::class);
        PackForwarding::verifyCollectionPin($item->fresh(), 'BADPIN');
    }

    #[Test]
    public function local_stock_attracts_no_courier_fee(): void
    {
        DB::table('products')->insert([
            ['id' => 'p_local',  'title' => 'Local',  'handle' => 'local',  'status' => 'published', 'sourcing' => 'local',  'created_at' => now(), 'updated_at' => now()],
            ['id' => 'p_import', 'title' => 'Import', 'handle' => 'import', 'status' => 'published', 'sourcing' => 'import', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->assertFalse(Couriers::productNeedsShipping('p_local'));
        $this->assertTrue(Couriers::productNeedsShipping('p_import'));

        // No imports in the basket => no shipping section at all, rather than a
        // confusing "$0.00 shipping" row.
        $this->assertSame([], Couriers::optionsFor(0));
        $this->assertCount(5, Couriers::optionsFor(1));
    }

    #[Test]
    public function couriers_are_priced_base_plus_per_item(): void
    {
        $q1 = Couriers::quote('cour_dhl', 1);
        $q3 = Couriers::quote('cour_dhl', 3);

        $this->assertSame(4500 + 600, $q1['amount']);
        $this->assertSame(4500 + 1800, $q3['amount']);
        $this->assertSame('DHL Express', $q1['courier']);

        // Cheapest and most expensive must genuinely differ, or choice is theatre.
        $this->assertLessThan(
            Couriers::quote('cour_dhl', 1)['amount'],
            Couriers::quote('cour_zimpost', 1)['amount'],
        );
    }
}
