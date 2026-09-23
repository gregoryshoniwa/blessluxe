<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Returns, Contact and Terms now exist as real pages, so switch their footer
 * links on. The defaults in SiteLinks only apply to a key that has never been
 * seeded — an install that already has the row keeps whatever is in it, which
 * is exactly why this is a migration rather than a change of default alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        $row = DB::table('settings')->where('key', \App\Services\SiteLinks::KEY)->value('value');
        $links = json_decode((string) $row, true);
        if (! is_array($links)) return;                 // never seeded; the defaults will do it

        foreach (['returns', 'contact', 'terms'] as $key) $links[$key] = true;

        DB::table('settings')->where('key', \App\Services\SiteLinks::KEY)
            ->update(['value' => json_encode($links), 'updated_at' => now()]);
    }

    public function down(): void
    {
        // Leaving a link switched on is harmless; switching it off would hide a
        // policy page from people who need it.
    }
};
