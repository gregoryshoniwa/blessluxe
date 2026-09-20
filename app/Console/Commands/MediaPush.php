<?php

namespace App\Console\Commands;

use App\Services\Media;
use Illuminate\Console\Command;
use Symfony\Component\Finder\Finder;

/**
 * One-off: copy every file that was saved on this machine's disk into the
 * media bucket, at the key the old URL maps to — so the old links (redirected
 * by MediaController) find them.
 *
 *   storage/app/public/products/x.jpg   →  products/x.jpg        (was /storage/products/x.jpg)
 *   public/ai/logos/y.png               →  ai/logos/y.png        (was /ai/logos/y.png)
 *   public/uploads/z.jpg                →  uploads/z.jpg         (was /uploads/z.jpg)
 *
 * Safe to run more than once: files already in the bucket are skipped. It only
 * ever copies — nothing local is deleted.
 */
class MediaPush extends Command
{
    protected $signature = 'media:push {--dry-run : List what would be copied without copying} {--force : Re-upload files that already exist}';
    protected $description = 'Copy locally stored uploads and AI renders into the media bucket';

    public function handle(): int
    {
        if (! Media::isRemote()) {
            $this->error('Files are being stored on this machine\'s disk, so there is no bucket to push to. This command is meant to run where a bucket is attached — in Laravel Cloud, use the environment\'s Commands tab.');
            return self::FAILURE;
        }

        // folder on this machine => key prefix in the bucket. Overridable so the
        // tests can point it at a scratch folder instead of a developer's real
        // (and large) uploads.
        $sources = config('media.push_sources') ?: [
            storage_path('app/public') => '',
            public_path('ai')          => 'ai/',
            public_path('uploads')     => 'uploads/',
        ];

        $copied = $skipped = $failed = 0; $bytes = 0;
        $dry = (bool) $this->option('dry-run');

        foreach ($sources as $root => $prefix) {
            if (! is_dir($root)) continue;

            foreach ((new Finder)->files()->in($root)->ignoreDotFiles(true) as $file) {
                $key = $prefix . str_replace('\\', '/', $file->getRelativePathname());

                if (! $this->option('force') && Media::disk()->exists($key)) { $skipped++; continue; }

                if ($dry) { $this->line("would copy  $key"); $copied++; $bytes += $file->getSize(); continue; }

                $stream = fopen($file->getRealPath(), 'r');
                try {
                    Media::disk()->put($key, $stream);
                    $copied++; $bytes += $file->getSize();
                    $this->line("copied  $key");
                } catch (\Throwable $e) {
                    $failed++;
                    $this->error("FAILED  $key — " . $e->getMessage());
                } finally {
                    if (is_resource($stream)) fclose($stream);
                }
            }
        }

        $this->newLine();
        $this->info(sprintf('%s %d file(s), %.1f MB · skipped %d already there · %d failed',
            $dry ? 'Would copy' : 'Copied', $copied, $bytes / 1048576, $skipped, $failed));

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
