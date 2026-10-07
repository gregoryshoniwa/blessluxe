<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\HomeTiles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** The home page's tile pictures: uploaded only, ordered by staff, capped, and public to read. */
class HomeTilesTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function staff_give_a_tile_several_pictures_and_put_them_in_order(): void
    {
        Storage::fake('public');
        config(['filesystems.default' => 'local']);
        DB::table('headings')->insert(['id' => 'head_w', 'name' => 'Women', 'handle' => 'women', 'rank' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs(User::factory()->create(), 'web');

        $keys = array_column($this->getJson('/api/admin/home-tiles')->assertOk()->json('tiles'), 'key');
        $this->assertSame(['series', 'hive', 'heading:head_w'], $keys);

        foreach (['a', 'b', 'c'] as $n) {
            $this->post('/api/admin/home-tiles/images', ['key' => 'series', 'image' => UploadedFile::fake()->image("$n.jpg", 600, 800)], ['Accept' => 'application/json'])->assertOk();
        }
        [$a, $b, $c] = HomeTiles::all()['series'];

        // Re-order and drop one; a URL that was never on the tile can't be slipped in.
        $this->putJson('/api/admin/home-tiles', ['key' => 'series', 'images' => [$c, 'https://evil.example/x.jpg', $a]])->assertOk();
        $this->assertSame([$c, $a], HomeTiles::all()['series']);
        Storage::disk('public')->assertMissing(ltrim(str_replace('/storage/', '', parse_url($b, PHP_URL_PATH)), '/'));

        // Unknown tiles are refused; so is a seventh picture.
        $this->post('/api/admin/home-tiles/images', ['key' => 'heading:nope', 'image' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertStatus(422);
        for ($i = 0; $i < 4; $i++) $this->post('/api/admin/home-tiles/images', ['key' => 'series', 'image' => UploadedFile::fake()->image("m$i.jpg")], ['Accept' => 'application/json'])->assertOk();
        $this->post('/api/admin/home-tiles/images', ['key' => 'series', 'image' => UploadedFile::fake()->image('over.jpg')], ['Accept' => 'application/json'])->assertStatus(422);

        Auth::forgetGuards();
        $this->assertCount(HomeTiles::MAX, $this->getJson('/api/store/home-tiles')->assertOk()->json('tiles.series'));
        $this->putJson('/api/admin/home-tiles', ['key' => 'series', 'images' => []])->assertUnauthorized();
    }
}
