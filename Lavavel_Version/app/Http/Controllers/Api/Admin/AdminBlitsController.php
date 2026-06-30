<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\Blits;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminBlitsController extends Controller
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
            'settings' => Blits::settings(),
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
        ]);
        $patch = [];
        if (isset($data['per_usd']))              $patch[Blits::KEY_PER_USD]              = (int) $data['per_usd'];
        if (isset($data['max_discount_percent'])) $patch[Blits::KEY_MAX_DISCOUNT_PERCENT] = (string) $data['max_discount_percent'];
        if (isset($data['earn_per_usd']))         $patch[Blits::KEY_EARN_PER_USD]         = (string) $data['earn_per_usd'];
        if (isset($data['enabled']))              $patch[Blits::KEY_ENABLED]              = $data['enabled'] ? 'true' : 'false';
        return ['settings' => Blits::setConfig($patch)];
    }
}
