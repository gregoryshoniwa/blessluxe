<?php

namespace App\Console\Commands;

use App\Services\Hive;
use App\Services\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Record the photo shape for looks posted before it was measured at post time.
 * Optional: the feed measures those in the browser anyway; this just stops the
 * frame adjusting once the photo arrives. Safe to run any number of times.
 */
class HiveMeasureLooks extends Command
{
    protected $signature = 'hive:measure-looks {--limit=5000}';
    protected $description = 'Store the photo shape of Bless Hive looks that are missing it';

    public function handle(): int
    {
        $done = 0; $skipped = 0;
        DB::table('hive_looks')->whereNull('ratio')->whereNull('embed_provider')->orderBy('id')
            ->limit((int) $this->option('limit'))->get(['id', 'images'])
            ->each(function ($l) use (&$done, &$skipped) {
                $first = json_decode((string) $l->images, true)[0] ?? null;
                $ratio = $first ? Hive::ratioOf(Media::get($first)) : null;
                if (! $ratio) { $skipped++; return; }
                DB::table('hive_looks')->where('id', $l->id)->update(['ratio' => $ratio]);
                $done++;
            });

        $this->info("Measured {$done} looks" . ($skipped ? ", skipped {$skipped} whose photo couldn't be read" : '') . '.');

        return self::SUCCESS;
    }
}
