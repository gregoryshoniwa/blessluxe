<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How many of a piece have actually been bought — the honest half of the social
 * proof on a product card, next to the ratings and hearts anyone can leave.
 *
 * Denormalised for the same reason the rest are: a grid must never aggregate.
 * Moved when an order is paid and when one is refunded; backfilled here from
 * every paid order already on the books.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('purchases_count')->default(0);
        });

        // Units sold on orders that were paid and not refunded.
        $sold = DB::table('order_line_items as li')
            ->join('orders as o', 'o.id', '=', 'li.order_id')
            ->where('o.payment_status', 'paid')
            ->groupBy('li.product_id')
            ->pluck(DB::raw('SUM(li.quantity) as units'), 'li.product_id');

        foreach ($sold as $productId => $units) {
            DB::table('products')->where('id', $productId)->update(['purchases_count' => (int) $units]);
        }
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('purchases_count');
        });
    }
};
