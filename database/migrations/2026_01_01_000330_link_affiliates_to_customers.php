<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Affiliates were joined to customers only by matching an email STRING, which
 * meant an affiliate was not really an account: change your email and the link
 * silently breaks, and anyone could apply on behalf of an address they don't own.
 *
 * Affiliates are now customers first. The application requires a signed-in
 * customer with a usable payout address, so approvals carry a real person behind
 * them and commission has somewhere to go.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            // Nullable: historic rows may predate any matching customer account,
            // and nullOnDelete keeps the earnings history if a customer is removed.
            $table->string('customer_id')->nullable()->after('id');
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index('customer_id');

            // Where commission is paid. Snapshotted at application time so a later
            // edit to the address book cannot silently redirect a payout.
            $table->json('payout_address')->nullable()->after('metadata');
        });

        // Backfill the link for anyone whose email already matches an account.
        foreach (DB::table('affiliates')->whereNull('customer_id')->get(['id', 'email']) as $aff) {
            $customerId = DB::table('customers')
                ->whereRaw('LOWER(email) = ?', [strtolower((string) $aff->email)])
                ->value('id');

            if ($customerId) {
                DB::table('affiliates')->where('id', $aff->id)->update([
                    'customer_id' => $customerId,
                    'updated_at'  => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            if (DB::getDriverName() === 'mysql') {
                $table->dropForeign(['customer_id']);
            }
            $table->dropIndex(['customer_id']);
            $table->dropColumn(['customer_id', 'payout_address']);
        });
    }
};
