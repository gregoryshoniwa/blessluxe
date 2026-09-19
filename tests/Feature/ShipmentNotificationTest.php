<?php

namespace Tests\Feature;

use App\Mail\ShipmentUpdateMail;
use App\Models\Package;
use App\Models\PackageItem;
use App\Services\PackForwarding;
use App\Services\Shipping;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Shipment notifications, and the leak they must never cause.
 *
 * A pack consignment is shared by every buyer in the campaign, so one event fans
 * out to many people. Each must receive ONLY their own piece and their own PIN.
 */
class ShipmentNotificationTest extends TestCase
{
    use RefreshDatabase;

    /** Two buyers sharing one consignment. */
    private function makeSharedConsignment(): Package
    {
        DB::table('products')->insert([
            'id' => 'prod_s', 'title' => 'Wrap Dress', 'handle' => 'wrap',
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_variants')->insert([
            ['id' => 'var_m', 'product_id' => 'prod_s', 'title' => 'M', 'created_at' => now(), 'updated_at' => now()],
            ['id' => 'var_l', 'product_id' => 'prod_s', 'title' => 'L', 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('pack_definitions')->insert([
            'id' => 'pdef_s', 'pack_kind' => 'single', 'title' => 'Drop', 'handle' => 'drop',
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('pack_campaigns')->insert([
            'id' => 'pcam_s', 'pack_definition_id' => 'pdef_s', 'host_kind' => 'admin',
            'public_code' => 'SHARED0001', 'status' => 'open',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        foreach ([['alice', 'var_m', 'M'], ['bob', 'var_l', 'L']] as [$who, $variant, $size]) {
            DB::table('orders')->insert([
                'id' => "order_{$who}", 'order_number' => 'BL-' . strtoupper($who),
                'email' => "{$who}@example.test", 'currency_code' => 'usd',
                'total' => 34900, 'subtotal' => 34900, 'shipping_total' => 0,
                'discount_total' => 0, 'tax_total' => 0,
                'status' => 'completed', 'payment_status' => 'paid',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('pack_slots')->insert([
                'id' => "pslot_{$who}", 'pack_campaign_id' => 'pcam_s', 'variant_id' => $variant,
                'size_label' => $size, 'status' => 'paid', 'order_id' => "order_{$who}",
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $package = Package::create([
            'id' => 'pkg_s', 'package_code' => 'BL-SHAR-EDXX-K',
            'order_id' => null, 'status' => 'created', 'is_pack' => true,
            'pack_campaign_id' => 'pcam_s', 'leg' => 'consignment',
        ]);

        foreach ([['alice', 'M', '-01'], ['bob', 'L', '-02']] as [$who, $size, $suffix]) {
            PackageItem::create([
                'id' => "pkgi_{$who}", 'package_id' => 'pkg_s',
                'pack_slot_id' => "pslot_{$who}", 'sub_code' => 'BL-SHAR-EDXX-K' . $suffix,
                'product_title' => 'Wrap Dress', 'size_label' => $size,
                'quantity' => 1, 'unit_price' => 34900, 'status' => 'pending',
            ]);
        }

        return $package->fresh();
    }

    #[Test]
    public function one_consignment_event_reaches_every_buyer_separately(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        Shipping::recordEvent($package, 'shipped', 'Istanbul', 'Left the supplier', 'system');

        Mail::assertSent(ShipmentUpdateMail::class, 2);

        // One Mail::to() per buyer — never a shared recipient list.
        Mail::assertSent(ShipmentUpdateMail::class, fn ($m) => $m->hasTo('alice@example.test'));
        Mail::assertSent(ShipmentUpdateMail::class, fn ($m) => $m->hasTo('bob@example.test'));
    }

    #[Test]
    public function no_buyer_can_see_another_buyers_piece(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        Shipping::recordEvent($package, 'shipped', null, null, 'system');

        Mail::assertSent(ShipmentUpdateMail::class, function ($mail) {
            $subCodes = array_map(fn ($p) => $p->sub_code, $mail->pieces);

            // Exactly one piece each, and it must be the one matching their order.
            if (count($subCodes) !== 1) return false;

            return $mail->hasTo('alice@example.test')
                ? $subCodes[0] === 'BL-SHAR-EDXX-K-01'
                : $subCodes[0] === 'BL-SHAR-EDXX-K-02';
        });
    }

    #[Test]
    public function repeating_a_status_does_not_notify_again(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        Shipping::recordEvent($package, 'shipped', 'Istanbul', 'First scan', 'system');
        Mail::assertSent(ShipmentUpdateMail::class, 2);

        // Admins legitimately log repeated scans; the event is appended but nobody
        // is emailed a second time.
        Shipping::recordEvent($package->fresh(), 'shipped', 'Dubai', 'Second scan', 'system');

        Mail::assertSent(ShipmentUpdateMail::class, 2);
        $this->assertSame(2, DB::table('package_events')->where('status', 'shipped')->count());
        $this->assertSame(1, DB::table('package_events')->where('status', 'shipped')->whereNotNull('notified_at')->count());
    }

    #[Test]
    public function arrival_at_blessluxe_carries_each_buyers_own_pin(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        Shipping::recordEvent($package, 'delivered', 'Harare', 'Collected from courier', 'system');

        $pins = PackageItem::whereNotNull('collection_pin')->pluck('collection_pin', 'id');
        $this->assertCount(2, $pins, 'Every live piece should get a PIN on arrival.');
        $this->assertNotSame($pins['pkgi_alice'], $pins['pkgi_bob'], 'PINs must be distinct per buyer.');

        Mail::assertSent(ShipmentUpdateMail::class, function ($mail) use ($pins) {
            $mine  = $mail->hasTo('alice@example.test') ? $pins['pkgi_alice'] : $pins['pkgi_bob'];
            $other = $mail->hasTo('alice@example.test') ? $pins['pkgi_bob'] : $pins['pkgi_alice'];

            $rendered = $mail->render();

            // Their own code must be present; the other buyer's must not appear at all.
            return str_contains($rendered, $mine) && ! str_contains($rendered, $other);
        });
    }

    #[Test]
    public function a_withdrawn_piece_gets_no_notification(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        PackageItem::where('id', 'pkgi_bob')->update(['status' => 'cancelled']);

        Shipping::recordEvent($package, 'shipped', null, null, 'system');

        // Only Alice is still in the pack.
        Mail::assertSent(ShipmentUpdateMail::class, 1);
        Mail::assertNotSent(ShipmentUpdateMail::class, fn ($m) => $m->hasTo('bob@example.test'));
    }

    #[Test]
    public function silent_events_notify_nobody(): void
    {
        Mail::fake();
        $package = $this->makeSharedConsignment();

        // Used for bookkeeping notes and by OrderRefunds, which sends its own mail.
        Shipping::recordEvent($package, 'shipped', null, 'Piece withdrawn.', 'system', silent: true);

        Mail::assertNothingSent();
    }
}
