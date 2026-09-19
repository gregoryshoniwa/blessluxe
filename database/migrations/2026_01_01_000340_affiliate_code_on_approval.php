<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Affiliate codes are minted on APPROVAL, not on application.
 *
 * Generating at application time reserved a share of the code namespace for every
 * applicant including the ones who are never approved, and the confirmation screen
 * promised "we've reserved JANE10 for you" before anyone had looked at the
 * application — a promise the brand had not actually made.
 *
 * MySQL permits multiple NULLs in a UNIQUE index, so pending applications simply
 * have no code yet and the uniqueness guarantee is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            $table->string('code')->nullable()->change();
            // What the applicant asked for, if anything. A request the admin can
            // honour at approval — never a reservation.
            $table->string('requested_code')->nullable()->after('code');
        });

        // Pending rows minted a code under the old flow; release it back to the
        // pool and keep it as the request, so approval can still honour it.
        DB::table('affiliates')
            ->where('status', 'pending')
            ->whereNotNull('code')
            ->update([
                'requested_code' => DB::raw('code'),
                'code'           => null,
                'updated_at'     => now(),
            ]);
    }

    public function down(): void
    {
        // Anything still pending needs a code back before the column can be
        // NOT NULL again.
        foreach (DB::table('affiliates')->whereNull('code')->get(['id', 'requested_code']) as $a) {
            DB::table('affiliates')->where('id', $a->id)->update([
                'code' => $a->requested_code ?: 'AFF' . strtoupper(substr(md5($a->id), 0, 6)),
            ]);
        }

        Schema::table('affiliates', function (Blueprint $table) {
            $table->dropColumn('requested_code');
            $table->string('code')->nullable(false)->change();
        });
    }
};
