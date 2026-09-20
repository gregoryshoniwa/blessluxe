<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Customer;
use App\Services\AffiliateLook;
use App\Services\AI\GeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * An affiliate designing their own shop.
 *
 * Whatever they supply is shown to shoppers on a BLESSLUXE-branded page, so the
 * interesting tests here are the hostile and the careless ones: a link that
 * leaves the site, a colour nobody can read, someone else's slide, a banner
 * that would open blank.
 */
class AffiliateShopLookTest extends TestCase
{
    use RefreshDatabase;

    private array $cleanup = [];

    protected function tearDown(): void
    {
        foreach ($this->cleanup as $f) @unlink($f);
        parent::tearDown();
    }

    private function affiliate(string $n): Affiliate
    {
        DB::table('customers')->insert([
            'id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'),
            'first_name' => ucfirst($n), 'last_name' => 'T', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return Affiliate::create([
            'id' => "aff_$n", 'customer_id' => "cust_$n", 'code' => strtoupper($n), 'email' => "$n@example.com",
            'first_name' => ucfirst($n), 'commission_rate' => 10, 'status' => 'active',
        ]);
    }

    private function as(string $n): static
    {
        return $this->actingAs(Customer::find("cust_$n"), 'customer');
    }

    private function slide(string $affiliateId, array $attrs = []): string
    {
        $id = 'ahs_' . substr(md5(uniqid('', true)), 0, 12);
        DB::table('affiliate_hero_slides')->insert($attrs + [
            'id' => $id, 'affiliate_id' => $affiliateId, 'media_type' => 'image', 'media_url' => '/uploads/affiliate-hero/x.jpg',
            'source' => 'upload', 'heading' => 'Hers', 'focus' => 'center', 'position' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    /** What a shopper who opened JANE's link is served. */
    private function shopVia(string $code): void
    {
        $this->postJson('/api/store/affiliate/resolve', ['code' => $code])->assertOk();
    }

    // ─── Colour ────────────────────────────────────────────────────────────

    #[Test]
    public function a_colour_can_be_typed_as_hex_short_hex_or_rgb(): void
    {
        $this->affiliate('jane');

        foreach (['#C2338B' => '#C2338B', 'c2338b' => '#C2338B', '#036' => '#003366', 'rgb(194, 51, 139)' => '#C2338B', '194, 51, 139' => '#C2338B'] as $typed => $stored) {
            $this->as('jane')->putJson('/api/account/affiliate/look', ['theme_color' => $typed])
                ->assertOk()->assertJsonPath('look.theme_color', $stored);
        }
    }

    #[Test]
    public function nonsense_is_refused_with_an_explanation_not_stored(): void
    {
        $jane = $this->affiliate('jane');

        foreach (['red', '#GGGGGG', 'rgb(300,0,0)', 'url(javascript:alert(1))', '#C2338B; background:url(x)'] as $bad) {
            $this->as('jane')->putJson('/api/account/affiliate/look', ['theme_color' => $bad])
                ->assertStatus(422)->assertJsonStructure(['error']);
        }
        $this->assertNull($jane->fresh()->theme_color);
    }

    #[Test]
    public function a_colour_too_pale_for_white_text_is_deepened_and_they_are_told(): void
    {
        $this->affiliate('jane');

        $res = $this->as('jane')->putJson('/api/account/affiliate/look', ['theme_color' => '#FFEE00'])->assertOk();

        $saved = $res->json('look.theme_color');
        $this->assertNotSame('#FFEE00', $saved);
        // Every button in the shop is white-on-accent. Below 3:1 it can't be read.
        $this->assertGreaterThanOrEqual(3.0, AffiliateLook::contrastWithWhite($saved));
        $this->assertNotNull($res->json('notice'));
    }

    #[Test]
    public function every_preset_we_offer_is_itself_readable(): void
    {
        $this->assertCount(20, AffiliateLook::PRESETS);
        foreach (array_slice(AffiliateLook::PRESETS, 1) as $p) {   // [0] is the existing house gold
            $this->assertFalse(AffiliateLook::usable($p['hex'])['adjusted'], "{$p['name']} {$p['hex']} would be silently changed when picked");
        }
    }

    #[Test]
    public function the_shop_is_themed_only_for_shoppers_of_that_affiliate(): void
    {
        $this->affiliate('jane');
        $this->affiliate('sara');
        $this->as('jane')->putJson('/api/account/affiliate/look', ['theme_color' => '#1F8A87'])->assertOk();

        $this->shopVia('SARA');
        $this->assertNull($this->getJson('/api/store/affiliate/active')->json('affiliate.look.theme'));

        $this->shopVia('JANE');
        $theme = $this->getJson('/api/store/affiliate/active')->json('affiliate.look.theme');
        $this->assertSame('#1F8A87', $theme['--color-gold']);
        // Only CSS variables, only hex values — the client writes these onto <html>.
        foreach ($theme as $name => $value) {
            $this->assertMatchesRegularExpression('/^--color-[a-z-]+$/', $name);
            $this->assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $value);
        }
    }

    // ─── Top bar ───────────────────────────────────────────────────────────

    #[Test]
    public function top_bar_lines_are_cleaned_capped_and_only_shown_in_custom_mode(): void
    {
        $this->affiliate('jane');

        $this->as('jane')->putJson('/api/account/affiliate/look', [
            'top_bar_mode' => 'custom',
            'top_bar_messages' => ['  Welcome  to   my edit ', '<script>alert(1)</script>New Fridays', '', 'welcome to my edit', str_repeat('x', 90), 'four', 'five', 'six'],
        ])->assertOk();

        $this->shopVia('JANE');
        $bar = $this->getJson('/api/store/affiliate/active')->json('affiliate.look.top_bar');

        $this->assertSame('Welcome to my edit', $bar[0]);                 // whitespace collapsed
        $this->assertSame('alert(1)New Fridays', $bar[1]);                // tags stripped
        $this->assertNotContains('welcome to my edit', $bar);             // duplicate dropped
        $this->assertSame(60, mb_strlen($bar[2]));                        // length capped
        $this->assertCount(AffiliateLook::MAX_MESSAGES, $bar);            // count capped

        // Back to the default: their lines are kept, just not shown.
        $this->as('jane')->putJson('/api/account/affiliate/look', ['top_bar_mode' => 'default'])->assertOk();
        $this->assertNull($this->getJson('/api/store/affiliate/active')->json('affiliate.look.top_bar'));
        $this->assertCount(AffiliateLook::MAX_MESSAGES, $this->as('jane')->getJson('/api/account/affiliate/look')->json('look.top_bar_messages'));
    }

    // ─── Hero ──────────────────────────────────────────────────────────────

    #[Test]
    public function the_hero_is_theirs_only_in_their_shop_and_only_once_there_is_something_to_show(): void
    {
        $jane = $this->affiliate('jane');
        $this->affiliate('sara');
        DB::table('announcements')->insert([
            'id' => 'ann_1', 'position' => 'hero', 'media_type' => 'image', 'media_url' => '/brand.jpg', 'heading' => 'Brand',
            'sort_order' => 1, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $hero = fn () => array_column($this->getJson('/api/store/announcements?position=hero')->json('announcements'), 'heading');

        $this->assertSame(['Brand'], $hero());                                     // nobody's shop

        $this->shopVia('JANE');
        $this->slide($jane->id);
        $this->assertSame(['Brand'], $hero());                                     // she has a slide but never switched it on

        $jane->update(['hero_mode' => 'custom']);
        $this->assertSame(['Hers'], $hero());                                      // now it's hers

        DB::table('affiliate_hero_slides')->update(['is_active' => false]);
        $this->assertSame(['Brand'], $hero());                                     // custom but nothing live → never a blank hero

        DB::table('affiliate_hero_slides')->update(['is_active' => true]);
        $this->shopVia('SARA');
        $this->assertSame(['Brand'], $hero());                                     // and never in someone else's shop
    }

    #[Test]
    public function an_image_too_small_for_a_banner_is_refused_in_plain_words(): void
    {
        $this->affiliate('jane');

        $res = $this->as('jane')->post('/api/account/affiliate/look/slides', [
            'image' => UploadedFile::fake()->image('small.jpg', 800, 450),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertStringContainsString('too small', $res->json('errors.image.0'));
        $this->assertSame(0, DB::table('affiliate_hero_slides')->count());
    }

    #[Test]
    public function a_good_image_becomes_a_slide_and_its_button_cannot_leave_the_site(): void
    {
        $this->affiliate('jane');

        foreach (['https://evil.example/login', '//evil.example', 'javascript:alert(1)'] as $href) {
            $res = $this->as('jane')->post('/api/account/affiliate/look/slides', [
                'image' => UploadedFile::fake()->image('hero.jpg', 2400, 1350),
                'heading' => '<b>Summer</b> Edit', 'cta_label' => 'Shop', 'cta_href' => $href,
            ], ['Accept' => 'application/json'])->assertOk();

            $slide = collect($res->json('slides'))->last();
            $this->cleanup[] = public_path(ltrim($slide['media_url'], '/'));

            $this->assertNull($slide['cta_href'], "$href should have been dropped");
            $this->assertSame('Summer Edit', $slide['heading']);
        }

        // A real image wearing a .php name is turned away at the door.
        $this->as('jane')->post('/api/account/affiliate/look/slides', [
            'image' => UploadedFile::fake()->image('hero.php', 2400, 1350),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        $this->assertEmpty(glob(public_path('uploads/affiliate-hero/*.php')));

        $ok = $this->as('jane')->post('/api/account/affiliate/look/slides', [
            'image' => UploadedFile::fake()->image('hero.jpg', 2400, 1350), 'cta_href' => '/shop?heading=women',
        ], ['Accept' => 'application/json'])->assertOk();
        $slide = collect($ok->json('slides'))->last();
        $this->cleanup[] = public_path(ltrim($slide['media_url'], '/'));
        $this->assertSame('/shop?heading=women', $slide['cta_href']);
    }

    #[Test]
    public function only_a_real_youtube_link_is_accepted_and_only_its_id_is_kept(): void
    {
        $this->affiliate('jane');

        $this->as('jane')->postJson('/api/account/affiliate/look/slides', ['youtube_url' => 'https://evil.example/watch?v=dQw4w9WgXcQ'])->assertStatus(422);

        $slide = $this->as('jane')->postJson('/api/account/affiliate/look/slides', ['youtube_url' => 'https://youtu.be/dQw4w9WgXcQ?si=abc'])
            ->assertOk()->json('slides.0');

        $this->assertSame('youtube', $slide['media_type']);
        $this->assertSame('dQw4w9WgXcQ', $slide['youtube_id']);
        $this->assertSame('dQw4w9WgXcQ', DB::table('affiliate_hero_slides')->value('media_url'));
    }

    #[Test]
    public function there_is_a_limit_on_slides(): void
    {
        $jane = $this->affiliate('jane');
        foreach (range(1, AffiliateLook::MAX_SLIDES) as $i) $this->slide($jane->id);

        $this->as('jane')->postJson('/api/account/affiliate/look/slides', ['youtube_url' => 'https://youtu.be/dQw4w9WgXcQ'])->assertStatus(422);
    }

    #[Test]
    public function one_affiliate_cannot_touch_anothers_slides(): void
    {
        $jane = $this->affiliate('jane');
        $this->affiliate('sara');
        $hers = $this->slide($jane->id);

        $this->as('sara')->putJson("/api/account/affiliate/look/slides/$hers", ['heading' => 'Defaced'])->assertStatus(404);
        $this->as('sara')->deleteJson("/api/account/affiliate/look/slides/$hers")->assertStatus(404);
        $this->as('sara')->putJson('/api/account/affiliate/look/slides/order', ['ids' => [$hers]])->assertOk();

        $row = DB::table('affiliate_hero_slides')->where('id', $hers)->first();
        $this->assertSame('Hers', $row->heading);
        $this->assertSame(1, (int) $row->position);
    }

    #[Test]
    public function the_design_api_is_for_active_affiliates_only(): void
    {
        $this->getJson('/api/account/affiliate/look')->assertStatus(404);

        $this->affiliate('jane')->update(['status' => 'pending']);
        $this->as('jane')->getJson('/api/account/affiliate/look')->assertStatus(403);
    }

    // ─── AI wizard ─────────────────────────────────────────────────────────

    private function fakeModel(): void
    {
        $this->app->bind(GeminiService::class, fn () => new GeminiService('test-key'));
        Http::fake(['*generateContent*' => Http::response(['candidates' => [['content' => ['parts' => [
            ['inlineData' => ['mimeType' => 'image/png', 'data' => base64_encode('not-really-a-png')]],
        ]]]]])]);
    }

    #[Test]
    public function the_ai_is_asked_for_a_wide_textless_banner_and_the_result_is_kept_as_a_slide(): void
    {
        $jane = $this->affiliate('jane');
        $this->fakeModel();

        $res = $this->as('jane')->postJson('/api/account/affiliate/look/generate', [
            'prompt' => 'A woman in an emerald dress in a marble lobby', 'style' => 'Editorial studio',
        ])->assertOk();
        $url = $res->json('generated_url');
        $this->cleanup[] = public_path(ltrim($url, '/'));

        Http::assertSent(function ($req) {
            $body = $req->data();
            return ($body['generationConfig']['imageConfig']['aspectRatio'] ?? null) === '16:9'
                && str_contains($body['contents'][0]['parts'][0]['text'], 'no text');
        });
        $this->assertSame(AffiliateLook::AI_DAILY_LIMIT - 1, $res->json('remaining'));
        $this->assertStringStartsWith("/ai/affiliate-hero/{$jane->id}/", $url);

        $slide = $this->as('jane')->postJson('/api/account/affiliate/look/slides', ['generated_url' => $url, 'prompt' => 'x'])->assertOk()->json('slides.0');
        $this->assertSame('ai', $slide['source']);
    }

    #[Test]
    public function a_generated_url_must_be_a_render_made_for_this_affiliate(): void
    {
        $this->affiliate('jane');
        $sara = $this->affiliate('sara');

        $dir = public_path("ai/affiliate-hero/{$sara->id}");
        if (! is_dir($dir)) mkdir($dir, 0775, true);
        file_put_contents("$dir/abc-123.png", 'x');
        $this->cleanup[] = "$dir/abc-123.png";

        foreach (["/ai/affiliate-hero/{$sara->id}/abc-123.png", '/ai/affiliate-hero/aff_jane/../../../.env', '/logo.png', 'https://evil.example/x.png'] as $url) {
            $this->as('jane')->postJson('/api/account/affiliate/look/slides', ['generated_url' => $url])->assertStatus(422);
        }
        $this->assertSame(0, DB::table('affiliate_hero_slides')->count());
    }

    #[Test]
    public function ai_designs_are_capped_per_day_because_each_one_costs_money(): void
    {
        $jane = $this->affiliate('jane');
        $this->fakeModel();
        Cache::put("affiliate-hero-ai:{$jane->id}:" . now()->toDateString(), AffiliateLook::AI_DAILY_LIMIT, now()->endOfDay());

        $this->as('jane')->postJson('/api/account/affiliate/look/generate', ['prompt' => 'A woman in an emerald dress'])->assertStatus(429);
        Http::assertNothingSent();
    }

    #[Test]
    public function with_no_ai_key_the_wizard_says_so_instead_of_failing(): void
    {
        $this->affiliate('jane');
        $this->app->bind(GeminiService::class, fn () => tap(new GeminiService('x'), function ($g) {
            (fn () => $this->apiKey = null)->call($g);
        }));

        $this->as('jane')->postJson('/api/account/affiliate/look/generate', ['prompt' => 'A woman in an emerald dress'])->assertStatus(503);
        $this->assertFalse($this->as('jane')->getJson('/api/account/affiliate/look')->json('guide.ai.available'));
    }
}
