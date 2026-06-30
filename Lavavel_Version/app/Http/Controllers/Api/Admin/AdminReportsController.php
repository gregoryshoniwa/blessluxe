<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminReportsController extends Controller
{
    /**
     * GET /api/admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
     *
     * Period summary + daily series + top products. Defaults to the last
     * 30 days when no range is given.
     */
    public function sales(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);

        $orders = DB::table('orders')
            ->where('payment_status', 'paid')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', ['refunded', 'cancelled']);

        $summary = [
            'orders'        => (clone $orders)->count(),
            'revenue_cents' => (int) (clone $orders)->sum('total'),
            'subtotal_cents'=> (int) (clone $orders)->sum('subtotal'),
            'discount_cents'=> (int) (clone $orders)->sum('discount_total'),
        ];
        $aov = $summary['orders'] > 0 ? (int) round($summary['revenue_cents'] / $summary['orders']) : 0;

        $daily = DB::table('orders')
            ->selectRaw('DATE(created_at) as day, COUNT(*) as orders, SUM(total) as revenue')
            ->where('payment_status', 'paid')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', ['refunded', 'cancelled'])
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $top = DB::table('order_line_items')
            ->join('orders', 'orders.id', '=', 'order_line_items.order_id')
            ->selectRaw('order_line_items.product_id, order_line_items.title,
                         SUM(order_line_items.quantity) as units,
                         SUM(order_line_items.unit_price * order_line_items.quantity) as revenue')
            ->where('orders.payment_status', 'paid')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereNotIn('orders.status', ['refunded', 'cancelled'])
            ->groupBy('order_line_items.product_id', 'order_line_items.title')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'summary' => [
                'orders'             => $summary['orders'],
                'revenue_label'      => $this->money($summary['revenue_cents']),
                'subtotal_label'     => $this->money($summary['subtotal_cents']),
                'discount_label'     => $this->money($summary['discount_cents']),
                'aov_label'          => $this->money($aov),
            ],
            'daily' => $daily->map(fn ($d) => [
                'day'           => $d->day,
                'orders'        => (int) $d->orders,
                'revenue'       => (int) $d->revenue,
                'revenue_label' => $this->money((int) $d->revenue),
            ]),
            'top_products' => $top->map(fn ($t) => [
                'product_id'    => $t->product_id,
                'title'         => $t->title,
                'units'         => (int) $t->units,
                'revenue_label' => $this->money((int) $t->revenue),
            ]),
        ];
    }

    /** GET /api/admin/reports/customers */
    public function customers(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);
        $signups = (int) DB::table('customers')->whereBetween('created_at', [$from, $to])->count();
        $totalCustomers = (int) DB::table('customers')->count();
        $repeat = (int) DB::table('orders')
            ->where('payment_status', 'paid')
            ->whereNotNull('customer_id')
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('customer_id')
            ->havingRaw('COUNT(*) > 1')
            ->get()
            ->count();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'summary' => [
                'new_signups'      => $signups,
                'total_customers'  => $totalCustomers,
                'repeat_buyers'    => $repeat,
            ],
        ];
    }

    /** GET /api/admin/reports/affiliates — top by commission earned. */
    public function affiliates(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);
        $top = DB::table('affiliate_sales')
            ->join('affiliates', 'affiliates.id', '=', 'affiliate_sales.affiliate_id')
            ->selectRaw('affiliates.id, affiliates.code, affiliates.email,
                         COUNT(*) as sales,
                         SUM(affiliate_sales.commission_amount) as commission')
            ->whereBetween('affiliate_sales.created_at', [$from, $to])
            ->groupBy('affiliates.id', 'affiliates.code', 'affiliates.email')
            ->orderByDesc('commission')
            ->limit(10)
            ->get();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'top' => $top->map(fn ($t) => [
                'code'             => $t->code,
                'email'            => $t->email,
                'sales'            => (int) $t->sales,
                'commission_label' => $this->money((int) $t->commission),
            ]),
        ];
    }

    /* ───── CSV exports ────────────────────────────────────────────── */

    public function exportOrders(Request $request): StreamedResponse
    {
        [$from, $to] = $this->resolveRange($request);
        $filename = "orders_{$from->toDateString()}_to_{$to->toDateString()}.csv";

        return new StreamedResponse(function () use ($from, $to) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['order_number', 'email', 'total_cents', 'currency', 'status', 'payment_status', 'payment_method', 'created_at']);
            DB::table('orders')
                ->whereBetween('created_at', [$from, $to])
                ->orderBy('created_at')
                ->each(function ($row) use ($out) {
                    fputcsv($out, [
                        $row->order_number, $row->email, (int) $row->total, $row->currency_code,
                        $row->status, $row->payment_status, $row->payment_method, $row->created_at,
                    ]);
                });
            fclose($out);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function exportCustomers(Request $request): StreamedResponse
    {
        $filename = 'customers_' . now()->toDateString() . '.csv';
        return new StreamedResponse(function () {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['email', 'first_name', 'last_name', 'phone', 'loyalty_points', 'loyalty_tier', 'marketing_consent', 'created_at']);
            DB::table('customers')->orderBy('created_at')->each(function ($row) use ($out) {
                fputcsv($out, [
                    $row->email, $row->first_name, $row->last_name, $row->phone,
                    (int) $row->loyalty_points, $row->loyalty_tier, (int) $row->marketing_consent, $row->created_at,
                ]);
            });
            fclose($out);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function exportProducts(Request $request): StreamedResponse
    {
        $filename = 'products_' . now()->toDateString() . '.csv';
        return new StreamedResponse(function () {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['handle', 'title', 'subtitle', 'status', 'variants', 'created_at']);
            DB::table('products')
                ->leftJoin('product_variants', 'product_variants.product_id', '=', 'products.id')
                ->selectRaw('products.handle, products.title, products.subtitle, products.status, products.created_at, COUNT(product_variants.id) as variants')
                ->groupBy('products.id', 'products.handle', 'products.title', 'products.subtitle', 'products.status', 'products.created_at')
                ->orderBy('products.created_at')
                ->each(function ($row) use ($out) {
                    fputcsv($out, [
                        $row->handle, $row->title, $row->subtitle, $row->status,
                        (int) $row->variants, $row->created_at,
                    ]);
                });
            fclose($out);
        }, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /* ───── Helpers ───────────────────────────────────────────────── */

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolveRange(Request $request): array
    {
        $to   = $request->query('to')   ? Carbon::parse($request->query('to'))->endOfDay()   : Carbon::now()->endOfDay();
        $from = $request->query('from') ? Carbon::parse($request->query('from'))->startOfDay() : $to->copy()->subDays(30)->startOfDay();
        return [$from, $to];
    }

    private function money(int $cents): string
    {
        return '$' . number_format($cents / 100, 2);
    }
}
