<?php

namespace App\Console\Commands;

use App\Services\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Proves the media disk works end to end BEFORE anything depends on it:
 * write → read back → fetch over the public URL the way a browser would →
 * delete. A misconfigured bucket otherwise shows up as broken images days
 * later, with uploads that "succeeded".
 */
class MediaCheck extends Command
{
    protected $signature = 'media:check';
    protected $description = 'Verify the media disk: write, read, public URL, delete';

    public function handle(): int
    {
        $disk = config('media.disk');
        $driver = config("filesystems.disks.$disk.driver");

        $this->line("Media disk : <info>$disk</info> (driver: " . ($driver ?? 'NOT CONFIGURED') . ')');
        $this->line('Location   : ' . (Media::isRemote() ? '<info>object storage</info> — survives deploys' : '<comment>this machine\'s disk</comment> — fine locally, LOST on every deploy in Laravel Cloud'));

        if (! $driver) {
            $this->error("No disk named \"$disk\". In Laravel Cloud, attach a bucket with that disk name, redeploy, and check MEDIA_DISK.");
            return self::FAILURE;
        }

        try {
            $url = Media::put('_check', 'txt', $body = 'media-check ' . now()->toIso8601String());
            $this->line("Wrote      : $url");

            if (Media::get($url) !== $body) {
                $this->error('Read back something different from what was written.');
                return self::FAILURE;
            }
            $this->info('Read back  : ok');

            if (Media::isRemote()) {
                $res = Http::timeout(15)->get($url);
                if ($res->ok() && trim($res->body()) === $body) {
                    $this->info('Public URL : ok — browsers can load files from this bucket');
                } else {
                    $this->error("Public URL : HTTP {$res->status()}. The bucket is probably PRIVATE. Media needs a bucket created with PUBLIC visibility (it cannot be changed per file on R2).");
                    Media::delete($url);
                    return self::FAILURE;
                }
            }

            Media::delete($url);
            $this->info('Deleted    : ok');
        } catch (\Throwable $e) {
            $this->error('Failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->newLine();
        $this->info('The media disk is working.');

        return self::SUCCESS;
    }
}
