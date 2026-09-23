<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\Bees;
use App\Services\ProductEngagement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminBeesController extends Controller
{
    public function index()
    {
        $stats = [
            'circulating' => (int) DB::table('customers')->sum('loyalty_points'),
            'customers_with_balance' => (int) DB::table('customers')->where('loyalty_points', '>', 0)->count(),
            'ledger_rows' => (int) DB::table('blits_ledger')->count(),
        ];
        $ledger = DB::table('blits_ledger')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get(['id', 'customer_id', 'delta', 'balance_after', 'reason', 'reference', 'created_at']);

        return [
            'settings'   => Bees::settings(),
            // What speaking up about a piece pays. Here because it is priced in
            // the same currency and staff think about both together.
            'engagement' => ProductEngagement::settings() + ['limits' => ProductEngagement::LIMITS],
            'stats'    => $stats,
            'recent_ledger' => $ledger,
        ];
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'per_usd'              => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'max_discount_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'earn_per_usd'         => ['sometimes', 'numeric', 'min:0', 'max:1000'],
            'enabled'              => ['sometimes', 'boolean'],
            'engagement'            => ['sometimes', 'array'],
            'engagement.rate'       => ['integer', 'min:0'],
            'engagement.like'       => ['integer', 'min:0'],
            'engagement.comment'    => ['integer', 'min:0'],
            'engagement.daily_cap'  => ['integer', 'min:0'],
            'engagement.min_length' => ['integer', 'min:1'],
        ]);

        if (! empty($data['engagement'])) {
            $result = ProductEngagement::setConfig($data['engagement']);
            if (is_string($result)) return response()->json(['error' => $result], 422);
        }
        $patch = [];
        if (isset($data['per_usd']))              $patch[Bees::KEY_PER_USD]              = (int) $data['per_usd'];
        if (isset($data['max_discount_percent'])) $patch[Bees::KEY_MAX_DISCOUNT_PERCENT] = (string) $data['max_discount_percent'];
        if (isset($data['earn_per_usd']))         $patch[Bees::KEY_EARN_PER_USD]         = (string) $data['earn_per_usd'];
        if (isset($data['enabled']))              $patch[Bees::KEY_ENABLED]              = $data['enabled'] ? 'true' : 'false';
        return [
            'settings'   => Bees::setConfig($patch),
            'engagement' => ProductEngagement::settings() + ['limits' => ProductEngagement::LIMITS],
        ];
    }
}
