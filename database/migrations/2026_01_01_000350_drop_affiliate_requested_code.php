<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Codes are assigned automatically at approval, so applicants no longer ask for
 * one and nothing writes requested_code. Dropping it rather than leaving an
 * unpopulated column behind — that is exactly the dead schema this codebase
 * already had too much of.
 *
 * Admins can still override a code directly on the affiliate record, which is a
 * more useful escape hatch than a wish on an application form.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('affiliates', 'requested_code')) {
            Schema::table('affiliates', fn (Blueprint $t) => $t->dropColumn('requested_code'));
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('affiliates', 'requested_code')) {
            Schema::table('affiliates', fn (Blueprint $t) => $t->string('requested_code')->nullable()->after('code'));
        }
    }
};
