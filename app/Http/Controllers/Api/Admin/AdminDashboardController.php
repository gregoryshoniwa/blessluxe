<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\ProductReview;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;

class AdminDashboardController extends Controller
{
    public function index()
    {
        $today      = now()->startOfDay();
        $weekAgo    = now()->subDays(7);

        $ordersToday = Order::query()->where('created_at', '>=', $today)->count();

        $revenueWeek = Order::query()
            ->where('created_at', '>=', $weekAgo)
            ->where('payment_status', 'paid')
            ->sum('total');

        $activeCustomers = Customer::query()
            ->where('last_login_at', '>=', now()->subDays(30))
            ->count();

        $lowStock = ProductVariant::query()
            ->where('manage_inventory', true)
            ->where('inventory_quantity', '<=', 5)
            ->count();

        $pendingReviews = ProductReview::query()
            ->where('status', 'pending')
            ->count();

        $recentOrders = Order::query()
            ->latest()
            ->limit(8)
            ->get(['id', 'order_number', 'email', 'total', 'currency_code', 'status', 'payment_status', 'created_at'])
            ->map(fn ($o) => [
                'id'             => $o->id,
                'order_number'   => $o->order_number,
                'email'          => $o->email,
                'total_label'    => '$' . number_format($o->total / 100, 2),
                'status'         => $o->status,
                'payment_status' => $o->payment_status,
                'created_at'     => $o->created_at?->toIso8601String(),
            ]);

        return [
            'stats' => [
                ['label' => 'Orders today',     'value' => (string) $ordersToday],
                ['label' => 'Revenue (7d)',     'value' => '$' . number_format(((int) $revenueWeek) / 100, 2)],
                ['label' => 'Active customers', 'value' => (string) $activeCustomers],
                ['label' => 'Low-stock SKUs',   'value' => (string) $lowStock],
            ],
            'pending_reviews' => $pendingReviews,
            'recent_orders'   => $recentOrders,
        ];
    }
}
