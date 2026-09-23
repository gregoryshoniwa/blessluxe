<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SiteLinks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** Which fixed links the shop shows, and who decides. */
class SiteLinksTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function everything_unbuilt_or_unlaunched_ships_hidden(): void
    {
        $links = $this->getJson('/api/store/site-links')->assertOk()->json('links');

        // Only what is both built and launched.
        $this->assertSame(['series'], array_column($links['header'], 'key'));
        // Returns, Contact and Terms are real pages now, so they are offered.
        $this->assertSame(['faq', 'track', 'returns', 'contact', 'terms'], array_column($links['help'], 'key'));
        $this->assertSame(['affiliate'], array_column($links['company'], 'key'));

        // The ones the SPA has no route for are not offered to anyone.
        foreach (['hive', 'showroom', 'shipping', 'about', 'careers'] as $key) {
            $this->assertFalse(SiteLinks::shows($key), $key);
        }
    }

    #[Test]
    public function staff_switch_one_on_and_the_shop_shows_it(): void
    {
        $admin = $this->actingAs(User::factory()->create(), 'web');

        $admin->putJson('/api/admin/site-links', ['links' => ['hive' => true, 'shipping' => true]])->assertOk();

        Auth::forgetGuards();
        $links = $this->getJson('/api/store/site-links')->json('links');
        $this->assertSame(['series', 'hive'], array_column($links['header'], 'key'));
        $this->assertContains('shipping', array_column($links['help'], 'key'));

        // Off again, and it leaves the menu.
        $this->actingAs(User::factory()->create(), 'web')->putJson('/api/admin/site-links', ['links' => ['hive' => false]])->assertOk();
        Auth::forgetGuards();
        $this->assertSame(['series'], array_column($this->getJson('/api/store/site-links')->json('links.header'), 'key'));
    }

    #[Test]
    public function hiding_a_link_hides_the_menu_entry_not_the_page(): void
    {
        // Hive ships hidden…
        $this->assertFalse(SiteLinks::shows('hive'));
        // …and still answers to anyone who has the address. This is a menu, not a lock.
        $this->getJson('/api/store/hive/feed')->assertOk();
    }

    #[Test]
    public function a_name_we_do_not_know_is_ignored_rather_than_stored(): void
    {
        $this->actingAs(User::factory()->create(), 'web')
            ->putJson('/api/admin/site-links', ['links' => ['hive' => true, 'not_a_link' => true]])->assertOk();

        $this->assertArrayNotHasKey('not_a_link', SiteLinks::settings());
        $this->assertTrue(SiteLinks::shows('hive'));
    }

    #[Test]
    public function the_policy_pages_quote_the_rules_the_code_actually_keeps(): void
    {
        $d = $this->getJson('/api/store/shop-info')->assertOk();

        // The returns page prints this number; it is the one the API enforces.
        $this->assertSame(30, $d->json('policy.return_window_days'));
        $this->assertSame(100, $d->json('policy.bees_per_usd'));

        // A channel nobody has filled in is never offered to a shopper.
        $this->assertSame([], array_diff(array_keys($d->json('info')), ['response', 'company_name']));
    }

    #[Test]
    public function staff_fill_in_the_contact_details_and_shoppers_see_them(): void
    {
        $this->actingAs(\App\Models\User::factory()->create(), 'web')
            ->putJson('/api/admin/shop-info', ['info' => ['whatsapp' => '+263771234567', 'email' => 'hello@blessluxe.com']])->assertOk();

        Auth::forgetGuards();
        $info = $this->getJson('/api/store/shop-info')->json('info');
        $this->assertSame(['+263771234567', 'hello@blessluxe.com'], [$info['whatsapp'], $info['email']]);
        $this->assertArrayNotHasKey('phone', $info);        // still blank, so still not offered
    }

    #[Test]
    public function only_staff_may_change_them(): void
    {
        Auth::forgetGuards();
        $this->putJson('/api/admin/site-links', ['links' => ['hive' => true]])->assertUnauthorized();
        $this->getJson('/api/admin/site-links')->assertUnauthorized();
        $this->putJson('/api/admin/shop-info', ['info' => ['email' => 'x@y.test']])->assertUnauthorized();
    }
}
