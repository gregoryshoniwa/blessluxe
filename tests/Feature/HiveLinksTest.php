<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Services\Hive;
use App\Services\HiveEmbeds;
use App\Services\Media;
use App\Services\RemoteImage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Looks made from links: a picture copied from another site, or a post on
 * YouTube / TikTok / Instagram / Facebook shown in a frame.
 *
 * Two things must hold. The server fetches a URL a member typed, so it must
 * never be steerable at our own network. And whatever gets framed is an address
 * WE built — a member's text never reaches an iframe's src.
 */
class HiveLinksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
        RemoteImage::$resolver = fn (string $host) => ['93.184.216.34'];      // a public address, no real DNS
    }

    protected function tearDown(): void
    {
        RemoteImage::$resolver = null;
        parent::tearDown();
    }

    private function member(string $n): Customer
    {
        DB::table('customers')->insert(['id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'), 'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now()]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update(['adult_confirmed_at' => now()]);
        Auth::forgetGuards();
        $this->actingAs($c, 'customer');

        return $c;
    }

    private function png(int $w = 2000, int $h = 2500): string
    {
        $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, imagecolorallocate($im, 201, 168, 76));
        ob_start(); imagepng($im); return (string) ob_get_clean();
    }

    private function share(array $body) { return $this->post('/api/account/hive/looks', $body, ['Accept' => 'application/json']); }

    // ─── Embeds ────────────────────────────────────────────────────────────

    #[Test]
    public function only_the_four_platforms_are_recognised_and_we_build_the_framed_address(): void
    {
        $cases = [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9'            => ['youtube',   'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
            'https://youtu.be/dQw4w9WgXcQ'                                => ['youtube',   'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
            'https://youtube.com/shorts/dQw4w9WgXcQ'                      => ['youtube',   'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
            'https://www.tiktok.com/@liza.line/video/7301234567890123456' => ['tiktok',    'https://www.tiktok.com/player/v1/7301234567890123456'],
            'https://www.instagram.com/p/Cx1_aBcDeF/?igsh=abc'            => ['instagram', 'https://www.instagram.com/p/Cx1_aBcDeF/embed/'],
            'https://www.instagram.com/reel/Cx1_aBcDeF/'                  => ['instagram', 'https://www.instagram.com/reel/Cx1_aBcDeF/embed/'],
            'https://m.facebook.com/lizaline/posts/1234567890'            => ['facebook',  'https://www.facebook.com/plugins/post.php'],
            'https://www.facebook.com/watch/?v=987654321'                 => ['facebook',  'https://www.facebook.com/plugins/video.php'],
        ];
        foreach ($cases as $url => [$provider, $starts]) {
            $e = HiveEmbeds::parse($url);
            $this->assertSame($provider, $e['provider'] ?? null, $url);
            $this->assertStringStartsWith($starts, HiveEmbeds::embedUrl($e['provider'], $e['ref']), $url);
        }

        foreach ([
            'http://www.youtube.com/watch?v=dQw4w9WgXcQ',                    // not https
            'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',             // look-alike host
            'https://evil.test/?u=https://www.instagram.com/p/Cx1_aBcDeF/',  // platform only in the query
            'https://www.instagram.com/liza.line/',                          // a profile, not a post
            'https://vimeo.com/12345', 'javascript:alert(1)', '<iframe src=https://evil.test>',
        ] as $bad) {
            $this->assertNull(HiveEmbeds::parse($bad), $bad);
        }
    }

    #[Test]
    public function a_link_becomes_a_look_whose_frame_address_never_contains_what_the_member_typed(): void
    {
        $this->member('rudo');
        Http::fake(['i.ytimg.com/*' => Http::response($this->png(480, 360), 200, ['Content-Type' => 'image/png'])]);

        $look = $this->share(['embed_url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x"><script>alert(1)</script>', 'caption' => 'My haul'])->assertOk()->json('look');

        $this->assertSame('youtube', $look['embed']['provider']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1&autoplay=1', $look['embed']['url']);
        $this->assertStringNotContainsString('script', json_encode($look['embed']));
        $this->assertCount(1, $look['images']);                         // YouTube's thumbnail, copied into our storage
        $this->assertTrue(Media::isUnder($look['images'][0], 'hive/looks/cust_rudo'));
        $this->assertSame('v:dQw4w9WgXcQ', DB::table('hive_looks')->value('embed_ref'));
    }

    #[Test]
    public function an_instagram_link_posts_without_a_cover_and_a_link_is_never_mixed_with_uploads_or_try_ons(): void
    {
        $this->member('rudo');
        Http::fake();

        $look = $this->share(['embed_url' => 'https://www.instagram.com/reel/Cx1_aBcDeF/'])->assertOk()->json('look');
        $this->assertSame([], $look['images']);                         // Instagram gives no thumbnail without an API key
        $this->assertSame('tall', $look['embed']['shape']);
        Http::assertNothingSent();

        $this->share(['embed_url' => 'https://vimeo.com/1'])->assertStatus(422);
        $this->share(['embed_url' => 'https://youtu.be/dQw4w9WgXcQ', 'images' => [UploadedFile::fake()->image('a.jpg')]])->assertStatus(422);
        $this->share(['embed_url' => 'https://youtu.be/dQw4w9WgXcQ', 'line_item_id' => 'line_x', 'fit' => 'true'])->assertStatus(422);
        $this->share(['caption' => 'nothing attached'])->assertStatus(422);
        $this->assertSame(1, DB::table('hive_looks')->count());
    }

    // ─── Pictures from a link ──────────────────────────────────────────────

    #[Test]
    public function a_picture_link_is_copied_shrunk_and_stored_as_ours(): void
    {
        $this->member('rudo');
        Http::fake(['cdn.example.com/*' => Http::response($this->png(), 200, ['Content-Type' => 'image/png'])]);

        $look = $this->share(['image_urls' => ['https://cdn.example.com/photos/dress.png?sig=abc'], 'images' => [UploadedFile::fake()->image('mine.jpg')]])->assertOk()->json('look');

        $this->assertCount(2, $look['images']);                         // an upload and a link, together
        $copied = $look['images'][1];
        $this->assertStringNotContainsString('cdn.example.com', $copied);
        $this->assertTrue(Media::isUnder($copied, 'hive/looks/cust_rudo'));
        [$w, $h] = getimagesizefromstring(Media::get($copied));
        $this->assertSame(RemoteImage::MAX_EDGE, max($w, $h));          // 2000×2500 came down to 1080 on the long edge
    }

    #[Test]
    public function the_server_cannot_be_pointed_at_its_own_network(): void
    {
        $this->member('rudo');
        Http::fake();

        foreach ([
            'https://127.0.0.1/secret.png', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x.png',
            'https://localhost/x.png', 'https://intranet/x.png', 'https://db.internal/x.png',
            'https://user:pass@cdn.example.com/x.png', 'https://cdn.example.com:8443/x.png',
        ] as $url) {
            $this->share(['image_urls' => [$url]])->assertStatus(422);
        }

        // A public-looking name that RESOLVES to a private address is refused too.
        RemoteImage::$resolver = fn () => ['10.0.0.5'];
        $this->share(['image_urls' => ['https://sneaky.example.com/x.png']])->assertStatus(422);
        RemoteImage::$resolver = fn () => ['93.184.216.34', '192.168.1.10'];        // any private answer spoils it
        $this->share(['image_urls' => ['https://sneaky.example.com/x.png']])->assertStatus(422);

        Http::assertNothingSent();
        $this->assertSame(0, DB::table('hive_looks')->count());
    }

    #[Test]
    public function a_redirect_is_followed_only_to_another_safe_address(): void
    {
        $this->member('rudo');
        RemoteImage::$resolver = fn (string $host) => $host === 'inside.example.com' ? ['10.1.2.3'] : ['93.184.216.34'];
        Http::fake([
            'short.example.com/ok'  => Http::response('', 302, ['Location' => 'https://cdn.example.com/real.png']),
            'cdn.example.com/*'     => Http::response($this->png(300, 300), 200),
            'short.example.com/bad' => Http::response('', 302, ['Location' => 'https://inside.example.com/admin.png']),
            'inside.example.com/*'  => Http::response($this->png(300, 300), 200),
        ]);

        $this->share(['image_urls' => ['https://short.example.com/ok']])->assertOk();
        $this->share(['image_urls' => ['https://short.example.com/bad']])->assertStatus(422);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'inside.example.com'));
    }

    #[Test]
    public function something_that_is_not_a_picture_is_refused_and_leaves_nothing_behind(): void
    {
        $this->member('rudo');
        Http::fake([
            'cdn.example.com/page'  => Http::response('<html><script>alert(1)</script></html>', 200, ['Content-Type' => 'image/png']),   // lies about its type
            'cdn.example.com/gone'  => Http::response('', 404),
        ]);

        $res = $this->share(['images' => [UploadedFile::fake()->image('mine.jpg')], 'image_urls' => ['https://cdn.example.com/page']])->assertStatus(422);
        $this->assertStringContainsString("isn't a picture", $res->json('errors.image_urls.0'));
        $this->share(['image_urls' => ['https://cdn.example.com/gone']])->assertStatus(422);

        $this->assertSame(0, DB::table('hive_looks')->count());
        $this->assertSame([], Storage::disk('public')->allFiles('hive/looks'));   // the upload that came with it was cleaned up
    }

    #[Test]
    public function inspecting_a_link_says_what_it_would_become(): void
    {
        $this->member('rudo');
        $inspect = fn (string $url) => $this->postJson('/api/account/hive/links/inspect', ['url' => $url]);

        $inspect('https://www.tiktok.com/@liza.line/video/7301234567890123456')->assertOk()->assertJsonPath('kind', 'embed')->assertJsonPath('embed.label', 'TikTok');
        $inspect('https://cdn.example.com/dress.jpg')->assertOk()->assertJsonPath('kind', 'image');
        $inspect('https://www.instagram.com/liza.line/')->assertStatus(422);       // a profile page: not a post, not a picture
        $inspect('https://10.0.0.1/x.jpg')->assertStatus(422);

        Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();
        $inspect('https://youtu.be/dQw4w9WgXcQ')->assertStatus(401);
    }
}
