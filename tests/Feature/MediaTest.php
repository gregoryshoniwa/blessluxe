<?php

namespace Tests\Feature;

use App\Services\Media;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Where uploaded files live.
 *
 * Two promises are tested: files go to whatever disk is configured (so a bucket
 * in production, this machine in development, with no controller knowing
 * which), and a URL handed back by a browser only ever resolves to a file that
 * is genuinely ours.
 */
class MediaTest extends TestCase
{
    private function useBucket(): void
    {
        Storage::fake('media');
        config([
            'media.disk' => 'media',
            'filesystems.disks.media.driver' => 's3',           // "remote" for isRemote()
            'media.url'  => 'https://cdn.example.test',
        ]);
    }

    #[Test]
    public function an_upload_lands_on_the_configured_disk_and_returns_a_public_url(): void
    {
        $this->useBucket();

        $url = Media::upload(UploadedFile::fake()->image('dress.jpg', 600, 800), 'products');

        $this->assertStringStartsWith('https://cdn.example.test/products/', $url);
        Storage::disk('media')->assertExists(Media::key($url));
        $this->assertTrue(Media::isRemote());
    }

    #[Test]
    public function the_stored_name_comes_from_the_real_file_type_not_the_uploaders_filename(): void
    {
        $this->useBucket();

        $url = Media::upload(UploadedFile::fake()->image('holiday.php', 600, 800), 'uploads/chat');

        $this->assertStringEndsNotWith('.php', $url);
        $this->assertStringNotContainsString('holiday', $url);
    }

    #[Test]
    public function locally_it_behaves_exactly_as_the_app_always_has(): void
    {
        Storage::fake('public');
        config(['media.disk' => 'public', 'media.url' => null]);

        $url = Media::putRender('ai/logos', ['mime' => 'image/png', 'base64' => base64_encode('png-bytes')]);

        $this->assertStringStartsWith('/storage/ai/logos/', $url);
        $this->assertSame('png-bytes', Media::get($url));
        $this->assertFalse(Media::isRemote());
    }

    #[Test]
    public function a_url_resolves_to_a_key_only_if_it_is_ours(): void
    {
        $this->useBucket();

        // Ours, in every shape it has ever been saved in.
        $this->assertSame('products/a.jpg', Media::key('https://cdn.example.test/products/a.jpg'));
        $this->assertSame('products/a.jpg', Media::key('https://cdn.example.test/products/a.jpg?v=2'));
        $this->assertSame('products/a.jpg', Media::key('/storage/products/a.jpg'));
        $this->assertSame('ai/logos/x.png', Media::key('/ai/logos/x.png'));

        // Not ours. Each of these is something a browser could send to an
        // endpoint that deletes, reads or "keeps" a file by URL.
        foreach ([
            'https://evil.example/products/a.jpg',
            'https://cdn.example.test.evil.example/a.jpg',
            '/ai/affiliate-hero/aff_1/../../../.env',
            'https://cdn.example.test/../.env',
            "/ai/x.png\0.jpg",
            'javascript:alert(1)',
            '/ai/has space.png',
            '',
        ] as $hostile) {
            $this->assertNull(Media::key($hostile), "should not be ours: " . json_encode($hostile));
        }
    }

    #[Test]
    public function ownership_of_a_folder_can_be_checked_from_a_url(): void
    {
        $this->useBucket();

        $mine = Media::put('ai/affiliate-hero/aff_jane', 'png', 'x');

        $this->assertTrue(Media::isUnder($mine, 'ai/affiliate-hero/aff_jane'));
        $this->assertFalse(Media::isUnder($mine, 'ai/affiliate-hero/aff_sara'));
        // A folder whose name merely STARTS the same is a different folder.
        $this->assertFalse(Media::isUnder($mine, 'ai/affiliate-hero/aff_j'));
        $this->assertFalse(Media::isUnder('https://evil.example/ai/affiliate-hero/aff_jane/x.png', 'ai/affiliate-hero/aff_jane'));
    }

    #[Test]
    public function deleting_removes_the_file_and_foreign_urls_are_ignored(): void
    {
        $this->useBucket();
        $url = Media::put('uploads/chat', 'jpg', 'x');

        Media::delete('https://evil.example/' . Media::key($url));
        $this->assertTrue(Media::exists($url));

        Media::delete($url);
        $this->assertFalse(Media::exists($url));
        Media::delete($url);                       // twice is fine
        Media::delete(null);
    }

    #[Test]
    public function only_images_are_offered_to_the_image_model_as_references(): void
    {
        $this->useBucket();

        $img = Media::upload(UploadedFile::fake()->image('a.png', 50, 50), 'products');
        $txt = Media::put('products', 'png', 'this is not an image');

        $this->assertStringStartsWith('image/', Media::asReference($img)['mime']);
        $this->assertNull(Media::asReference($txt));
        $this->assertNull(Media::asReference('https://evil.example/a.png'));
    }

    // ─── After the move: old links, and copying what already exists ────────

    #[Test]
    public function old_links_are_pointed_at_the_same_file_in_the_bucket(): void
    {
        $this->useBucket();

        // Saved before the move, in the three shapes that exist in the database,
        // in sent emails and in chat messages.
        $this->get('/storage/products/a.jpg')->assertRedirect('https://cdn.example.test/products/a.jpg');
        $this->get('/ai/logos/x.png')->assertRedirect('https://cdn.example.test/ai/logos/x.png');
        $this->get('/uploads/affiliate-messages/m.jpg')->assertRedirect('https://cdn.example.test/uploads/affiliate-messages/m.jpg');
    }

    #[Test]
    public function the_redirect_can_only_ever_point_at_our_own_bucket(): void
    {
        $this->useBucket();

        foreach (['/ai/..%2f..%2f.env', '/storage/%2e%2e/%2e%2e/.env', '/uploads/https://evil.example/x.png', '/ai/a b.png'] as $hostile) {
            $res = $this->get($hostile);
            $to = (string) $res->headers->get('Location');
            $this->assertTrue(
                $res->status() === 404 || str_starts_with($to, 'https://cdn.example.test/'),
                "$hostile → {$res->status()} $to"
            );
            $this->assertStringNotContainsString('..', $to);
            $this->assertStringNotContainsString('evil.example', parse_url($to, PHP_URL_HOST) ?? '');
        }
    }

    #[Test]
    public function with_files_on_this_machine_a_missing_image_is_a_404_not_a_page(): void
    {
        config(['media.disk' => 'public', 'media.url' => null]);

        // Not the SPA's HTML with a 200 — that makes a broken image look like
        // a successful response.
        $this->get('/ai/logos/does-not-exist.png')->assertNotFound();
        $this->get('/uploads/nope.jpg')->assertNotFound();
    }

    #[Test]
    public function existing_files_can_be_copied_into_the_bucket_at_the_key_their_old_url_maps_to(): void
    {
        $this->useBucket();

        // A scratch copy of the three places files used to be written — never
        // the developer's real uploads.
        $tmp = storage_path('framework/testing/media-push-' . uniqid());
        config(['media.push_sources' => ["$tmp/storage" => '', "$tmp/ai" => 'ai/', "$tmp/uploads" => 'uploads/']]);
        $made = [];
        foreach (["$tmp/storage/_pushtest/a.jpg", "$tmp/ai/_pushtest/b.png", "$tmp/uploads/_pushtest/c.jpg"] as $f) {
            if (! is_dir(dirname($f))) mkdir(dirname($f), 0775, true);
            file_put_contents($f, 'x'); $made[] = $f;
        }

        try {
            $this->artisan('media:push', ['--dry-run' => true])->assertSuccessful();
            Storage::disk('media')->assertMissing('_pushtest/a.jpg');            // dry run copies nothing

            $this->artisan('media:push')->assertSuccessful();
            Storage::disk('media')->assertExists('_pushtest/a.jpg');             // was /storage/_pushtest/a.jpg
            Storage::disk('media')->assertExists('ai/_pushtest/b.png');          // was /ai/_pushtest/b.png
            Storage::disk('media')->assertExists('uploads/_pushtest/c.jpg');     // was /uploads/_pushtest/c.jpg

            // …which is exactly where the old-link redirect will look.
            $this->get('/ai/_pushtest/b.png')->assertRedirect(Media::url('ai/_pushtest/b.png'));

            $this->artisan('media:push')->expectsOutputToContain('Copied 0 file(s), 0.0 MB · skipped 3')->assertSuccessful();   // idempotent
            foreach ($made as $f) $this->assertFileExists($f);                   // and nothing local is deleted
        } finally {
            \Illuminate\Support\Facades\File::deleteDirectory($tmp);
        }
    }

    #[Test]
    public function pushing_refuses_to_run_when_there_is_no_bucket(): void
    {
        config(['media.disk' => 'public', 'media.url' => null]);

        $this->artisan('media:push')->assertFailed();
    }

    // ─── Finding the bucket, whatever it was named ─────────────────────────

    /** What Laravel Cloud does when a bucket is attached: define a disk, make it the default. */
    private function attachCloudBucket(string $diskName): void
    {
        Storage::fake($diskName);
        config([
            "filesystems.disks.$diskName.driver" => 's3',
            'filesystems.default' => $diskName,
            'media.url' => 'https://bucket.example.test',
        ]);
    }

    #[Test]
    public function a_bucket_that_was_named_public_is_found_with_no_setting_at_all(): void
    {
        // Exactly the production setup: the bucket took the name "public"
        // (replacing the local disk of that name) and MEDIA_DISK is not set.
        config(['media.disk' => null]);
        $this->attachCloudBucket('public');

        $this->assertSame('public', Media::diskName());
        $this->assertTrue(Media::isRemote());
        $this->assertStringStartsWith('https://bucket.example.test/products/', Media::upload(UploadedFile::fake()->image('a.jpg'), 'products'));
    }

    #[Test]
    public function a_media_disk_setting_that_matches_nothing_does_not_break_uploads(): void
    {
        // MEDIA_DISK=media was the documented instruction — but the bucket was
        // named something else. That must not take production uploads down.
        config(['media.disk' => 'media']);
        $this->attachCloudBucket('public');

        $this->assertSame('public', Media::diskName());
        $this->assertTrue(Media::isRemote());
        $this->artisan('media:check')->expectsOutputToContain('no such disk exists');
    }

    #[Test]
    public function any_other_bucket_name_works_too_and_an_explicit_setting_still_wins(): void
    {
        config(['media.disk' => null]);
        $this->attachCloudBucket('r2-uploads');
        $this->assertSame('r2-uploads', Media::diskName());

        // Two buckets: say which one.
        Storage::fake('media');
        config(['filesystems.disks.media.driver' => 's3', 'media.disk' => 'media']);
        $this->assertSame('media', Media::diskName());
    }

    #[Test]
    public function on_a_developers_machine_it_is_the_local_public_disk(): void
    {
        config(['media.disk' => null, 'filesystems.default' => 'local']);

        $this->assertSame('public', Media::diskName());
        $this->assertFalse(Media::isRemote());
    }
}
