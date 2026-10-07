<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\PackController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The series page as a stranger sees it, and the one message a group chat
 * never sends: "it's full".
 */
class SeriesPageTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $id, string $first, string $last): void
    {
        DB::table('customers')->insert(['id' => $id, 'email' => "$id@test.test", 'password' => bcrypt('x'), 'first_name' => $first, 'last_name' => $last, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function order(string $id, string $customerId): void
    {
        DB::table('orders')->insert(['id' => $id, 'order_number' => strtoupper($id), 'customer_id' => $customerId, 'email' => "$customerId@test.test",
            'payment_status' => 'paid', 'status' => 'pending', 'subtotal' => 9000, 'total' => 9000, 'currency_code' => 'usd', 'created_at' => now(), 'updated_at' => now()]);
    }

    /** A series of one piece in three sizes, with the given sizes already paid by the given customers. */
    private function series(array $paid = []): void
    {
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Silk Gown', 'handle' => 'silk-gown', 'status' => 'published', 'thumbnail' => '/storage/a.jpg', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_images')->insert([['id' => 'img_1', 'product_id' => 'prod_1', 'url' => '/storage/b.jpg', 'rank' => 1], ['id' => 'img_2', 'product_id' => 'prod_1', 'url' => '/storage/a.jpg', 'rank' => 0]]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'One size', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('variant_prices')->insert(['id' => 'vp_1', 'variant_id' => 'var_1', 'currency_code' => 'usd', 'amount' => 9000, 'created_at' => now()]);
        DB::table('pack_definitions')->insert(['id' => 'def_1', 'product_id' => 'prod_1', 'title' => 'Gown run', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pack_campaigns')->insert(['id' => 'camp_1', 'pack_definition_id' => 'def_1', 'public_code' => 'GOWN1', 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        foreach (['S', 'M', 'L'] as $size) {
            $by = $paid[$size] ?? null;
            DB::table('pack_slots')->insert(['id' => "slot_$size", 'pack_campaign_id' => 'camp_1', 'variant_id' => 'var_1', 'size_label' => $size,
                'status' => $by ? 'paid' : 'available', 'customer_id' => $by, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    #[Test]
    public function a_stranger_sees_who_is_in_as_initials_only_and_what_is_still_needed(): void
    {
        $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $this->customer('cust_tendai', 'Tendai', 'Kaseke');
        $this->series(['S' => 'cust_rudo', 'M' => 'cust_rudo']);   // Rudo took two sizes

        $d = $this->getJson('/api/store/series/GOWN1')->assertOk();

        // One avatar per PERSON, not per size; two initials and nothing more.
        $this->assertSame(['RM'], $d->json('campaign.people'));
        $this->assertSame([2, 1, 67], [$d->json('totals.paid'), $d->json('totals.needs'), $d->json('totals.fill_percent')]);

        // Initials sit only on paid sizes; an open one says nothing about anyone.
        $bySize = collect($d->json('slots'))->pluck('buyer', 'size_label')->all();
        $this->assertSame(['S' => 'RM', 'M' => 'RM', 'L' => null], ['S' => $bySize['S'], 'M' => $bySize['M'], 'L' => $bySize['L']]);
        $this->assertStringNotContainsString('Rudo', $d->getContent());
        $this->assertStringNotContainsString('Moyo', $d->getContent());

        // The gallery leads with the thumbnail, then the rest in rank order, no repeats.
        $this->assertSame(['/storage/a.jpg', '/storage/b.jpg'], $d->json('campaign.product.images'));
        $this->assertSame('$90.00', $d->json('campaign.product.price_label'));
    }

    #[Test]
    public function the_board_says_how_alive_it_is_and_what_just_happened(): void
    {
        $this->travelTo(now()->setTime(12, 0));             // "closes in 3 hours" must still be today, whatever time the suite runs
        $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $this->customer('cust_tendai', 'Tendai', 'Kaseke');
        $this->series(['S' => 'cust_rudo', 'M' => 'cust_tendai']);
        DB::table('pack_campaigns')->where('id', 'camp_1')->update(['expires_at' => now()->addHours(3)]);

        $d = $this->getJson('/api/store/series')->assertOk();

        // Open series, distinct people in, and what closes before midnight.
        $this->assertSame(['open' => 1, 'people' => 2, 'closing_today' => 1], $d->json('stats'));

        // The ticker: a size taken is news, as initials; it links back to the series.
        $a = $d->json('activity');
        $this->assertCount(2, $a);
        $this->assertEqualsCanonicalizing(['RM', 'TK'], array_column($a, 'initials'));
        $this->assertSame(['joined', 'GOWN1', 'Gown run'], [$a[0]['kind'], $a[0]['code'], $a[0]['series']]);
        $this->assertStringNotContainsString('Rudo', json_encode($a));
    }

    #[Test]
    public function the_moment_the_last_size_is_paid_every_buyer_is_told_once(): void
    {
        $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $this->customer('cust_tendai', 'Tendai', 'Kaseke');
        $this->series(['S' => 'cust_rudo', 'M' => 'cust_rudo']);
        $this->order('order_t', 'cust_tendai');

        // Tendai pays for the last size.
        DB::table('pack_slots')->where('id', 'slot_L')->update(['status' => 'reserved', 'customer_id' => 'cust_tendai']);
        PackController::markPaidForOrder('order_t', [['variant_id' => 'var_1', 'quantity' => 1, 'metadata' => ['pack_slot_id' => 'slot_L']]]);

        $this->assertSame('filled', DB::table('pack_campaigns')->where('id', 'camp_1')->value('status'));

        $told = DB::table('notifications')->where('kind', 'series_filled')->get();
        $this->assertEqualsCanonicalizing(['cust_rudo', 'cust_tendai'], $told->pluck('recipient_id')->all());   // Rudo once, despite two sizes
        $this->assertSame('Gown run is full', $told->first()->title);
        $this->assertSame('/shop/series/GOWN1', $told->first()->action_url);

        // Marking the same order paid again (a retried callback) tells nobody twice.
        PackController::markPaidForOrder('order_t', [['variant_id' => 'var_1', 'quantity' => 1, 'metadata' => ['pack_slot_id' => 'slot_L']]]);
        $this->assertSame(2, DB::table('notifications')->where('kind', 'series_filled')->count());
    }
}
