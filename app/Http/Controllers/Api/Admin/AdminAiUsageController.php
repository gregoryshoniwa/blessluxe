<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AiUsageLog;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

/**
 * GET /api/admin/ai-usage
 *
 * The Google AI cost dashboard: estimated spend across every surface
 * (Show Room tools, LUXE agent, admin studio), broken down by period,
 * surface, media kind and customer — the groundwork for billing customers
 * for AI tool usage later.
 */
class AdminAiUsageController extends Controller
{
    public function index()
    {
        $base = AiUsageLog::query();

        $window = fn ($from) => (clone $base)->where('created_at', '>=', $from)
            ->selectRaw('COUNT(*) as calls, COALESCE(SUM(cost), 0) as cost')
            ->first();

        $today  = $window(now()->startOfDay());
        $week   = $window(now()->subDays(7));
        $month  = $window(now()->subDays(30));
        $all    = (clone $base)->selectRaw('COUNT(*) as calls, COALESCE(SUM(cost), 0) as cost')->first();

        $since30 = now()->subDays(30);

        $bySurface = AiUsageLog::where('created_at', '>=', $since30)
            ->groupBy('surface')
            ->selectRaw('surface, COUNT(*) as calls, COALESCE(SUM(units), 0) as units, COALESCE(SUM(cost), 0) as cost')
            ->orderByDesc(DB::raw('SUM(cost)'))
            ->get();

        $byKind = AiUsageLog::where('created_at', '>=', $since30)
            ->groupBy('kind')
            ->selectRaw('kind, COUNT(*) as calls, COALESCE(SUM(units), 0) as units, COALESCE(SUM(cost), 0) as cost')
            ->orderByDesc(DB::raw('SUM(cost)'))
            ->get();

        $topCustomers = AiUsageLog::where('created_at', '>=', $since30)
            ->whereNotNull('customer_id')
            ->groupBy('customer_id')
            ->selectRaw('customer_id, COUNT(*) as calls, COALESCE(SUM(cost), 0) as cost')
            ->orderByDesc(DB::raw('SUM(cost)'))
            ->limit(15)
            ->get();
        $customers = Customer::whereIn('id', $topCustomers->pluck('customer_id'))
            ->get(['id', 'email', 'first_name', 'last_name'])
            ->keyBy('id');

        $recent = AiUsageLog::latest('created_at')->limit(50)->get();
        $recentCustomers = Customer::whereIn('id', $recent->pluck('customer_id')->filter()->unique())
            ->get(['id', 'email'])
            ->keyBy('id');

        return [
            'totals' => [
                'today'   => ['calls' => (int) $today->calls,  'cost' => round((float) $today->cost, 4)],
                'week'    => ['calls' => (int) $week->calls,   'cost' => round((float) $week->cost, 4)],
                'month'   => ['calls' => (int) $month->calls,  'cost' => round((float) $month->cost, 4)],
                'all'     => ['calls' => (int) $all->calls,    'cost' => round((float) $all->cost, 4)],
            ],
            'by_surface' => $bySurface->map(fn ($r) => [
                'surface' => $r->surface,
                'calls'   => (int) $r->calls,
                'units'   => round((float) $r->units, 1),
                'cost'    => round((float) $r->cost, 4),
            ]),
            'by_kind' => $byKind->map(fn ($r) => [
                'kind'  => $r->kind,
                'calls' => (int) $r->calls,
                'units' => round((float) $r->units, 1),
                'cost'  => round((float) $r->cost, 4),
            ]),
            'top_customers' => $topCustomers->map(function ($r) use ($customers) {
                $c = $customers->get($r->customer_id);
                return [
                    'customer_id' => $r->customer_id,
                    'email'       => $c?->email,
                    'name'        => $c ? trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? '')) : null,
                    'calls'       => (int) $r->calls,
                    'cost'        => round((float) $r->cost, 4),
                ];
            }),
            'recent' => $recent->map(fn ($r) => [
                'surface'    => $r->surface,
                'kind'       => $r->kind,
                'model'      => $r->model,
                'units'      => (float) $r->units,
                'cost'       => (float) $r->cost,
                'customer'   => $r->customer_id ? ($recentCustomers->get($r->customer_id)?->email ?? $r->customer_id) : null,
                'created_at' => $r->created_at?->toIso8601String(),
            ]),
            'rates' => [
                'image'         => (float) env('AI_COST_IMAGE', 0.067),
                'video_per_sec' => (float) env('AI_COST_VIDEO_PER_SEC', 0.10),
                'text_call'     => (float) env('AI_COST_TEXT_CALL', 0.002),
            ],
        ];
    }
}
