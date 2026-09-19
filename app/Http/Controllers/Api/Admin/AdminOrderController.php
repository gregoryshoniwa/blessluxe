<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Mail\OrderRefundMail;
use App\Models\AffiliateSale;
use App\Models\Order;
use App\Models\Package;
use App\Models\PaymentSession;
use App\Enums\FulfillmentStatus;
use App\Enums\PackageStatus;
use App\Services\Carriers;
use App\Services\OrderRefunds;
use App\Services\Shipping;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AdminOrderController extends Controller
{
    /** GET /api/admin/orders — list with filters + search. */
    public function index(Request $request)
    {
        $q = Order::query()
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('payment_status'), fn ($q, $s) => $q->where('payment_status', $s))
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('order_number', 'like', "%{$term}%")
                       ->orWhere('email', 'like', "%{$term}%");
                });
            })
            ->latest();
        $paginator = $q->paginate((int) min(100, max(10, (int) $request->query('limit', 25))));

        return [
            'orders' => collect($paginator->items())->map(fn ($o) => [
                'id'             => $o->id,
                'order_number'   => $o->order_number,
                'email'          => $o->email,
                'total_label'    => '$' . number_format($o->total / 100, 2),
                'status'         => $o->status,
                'payment_status' => $o->payment_status,
                'payment_method' => $o->payment_method,
                'created_at'     => $o->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * POST /api/admin/orders/{id}/packages
     *
     * Create the order's parcel when it has none. `BL-PACK-SMOKE` is the proof this
     * is needed: package creation runs once at payment, and if it failed or the
     * order predates it, there was no way back.
     *
     * Idempotent via ensurePackagesForOrder.
     */
    public function createPackage(string $id)
    {
        $order = Order::with('lineItems')->findOrFail($id);

        $ordinaryLines = $order->lineItems->reject(fn ($l) => (bool) ($l->metadata['pack_slot_id'] ?? null));
        if ($ordinaryLines->isEmpty()) {
            return response()->json([
                'error' => 'This order has only pack slots — those ship inside the campaign consignment, not as their own parcel.',
            ], 422);
        }

        $packages = Shipping::ensurePackagesForOrder($order);

        return [
            'packages' => $packages->map(fn ($p) => [
                'id'           => $p->id,
                'package_code' => $p->package_code,
                'status'       => $p->status,
                'is_pack'      => (bool) $p->is_pack,
            ])->values(),
        ];
    }

    /** GET /api/admin/orders/{id} — full detail bundle. */
    public function show(string $id)
    {
        $order = Order::with(['lineItems', 'customer:id,email,first_name,last_name,loyalty_points'])->findOrFail($id);
        $packages = Shipping::packagesForOrder($id);
        $package = $packages->first()?->load('events');
        $mySlotIds = DB::table('pack_slots')
            ->where('order_id', $id)
            ->whereNull('deleted_at')
            ->pluck('id')
            ->all();
        $session = PaymentSession::where('order_id', $id)->first();
        $affiliateSales = AffiliateSale::with('affiliate:id,code,email,commission_rate')
            ->where('order_id', $id)->get();

        return [
            'order' => [
                'id'             => $order->id,
                'order_number'   => $order->order_number,
                'email'          => $order->email,
                'status'         => $order->status,
                'payment_status' => $order->payment_status,
                'payment_method' => $order->payment_method,
                'currency_code'  => $order->currency_code,
                'subtotal'       => '$' . number_format($order->subtotal / 100, 2),
                'discount_total' => '$' . number_format(($order->discount_total ?? 0) / 100, 2),
                'shipping_total' => '$' . number_format(($order->shipping_total ?? 0) / 100, 2),
                'tax_total'      => '$' . number_format(($order->tax_total ?? 0) / 100, 2),
                'total'          => '$' . number_format($order->total / 100, 2),
                'shipping_address' => $order->shipping_address,
                'billing_address'  => $order->billing_address,
                'metadata'         => $order->metadata,
                'created_at'       => $order->created_at?->toIso8601String(),
                'customer'         => $order->customer ? [
                    'id'             => $order->customer->id,
                    'email'          => $order->customer->email,
                    'name'           => trim(($order->customer->first_name ?? '') . ' ' . ($order->customer->last_name ?? '')),
                    'loyalty_points' => $order->customer->loyalty_points,
                ] : null,
                'lines' => $order->lineItems->map(fn ($l) => [
                    'id'            => $l->id,
                    'title'         => $l->title,
                    'variant_title' => $l->variant_title,
                    'sku'           => $l->sku,
                    'quantity'      => $l->quantity,
                    'unit_price'    => '$' . number_format($l->unit_price / 100, 2),
                    'line_total'    => '$' . number_format(($l->unit_price * $l->quantity) / 100, 2),
                ]),
            ],
            // Kept for backwards compatibility with anything still reading a single
            // package; `packages` below is the one to use.
            'package' => $package ? [
                'id'           => $package->id,
                'package_code' => $package->package_code,
                'status'       => $package->status,
                'carrier'      => $package->carrier,
                'shipped_at'   => $package->shipped_at?->toIso8601String(),
                'delivered_at' => $package->delivered_at?->toIso8601String(),
            ] : null,

            // Every package this order has a stake in: its own parcel, plus any
            // pack consignment carrying one of its slots.
            'packages' => $packages->map(fn ($p) => array_merge(
                Carriers::payload($p->carrier, $p->carrier_tracking_number),
                [
                    'id'               => $p->id,
                    'package_code'     => $p->package_code,
                    'status'           => $p->status,
                    'status_label'     => PackageStatus::tryFrom((string) $p->status)?->label(),
                    'is_pack'          => (bool) $p->is_pack,
                    'leg'              => $p->leg,
                    'destination_kind' => $p->destination_kind,
                    'shipped_at'       => $p->shipped_at?->toIso8601String(),
                    'delivered_at'     => $p->delivered_at?->toIso8601String(),
                    'estimated_delivery' => Shipping::estimatedDelivery($p),
                    // For a consignment, name only THIS order's piece — admin sees
                    // the full manifest on the package screen, not here.
                    'our_pieces'       => $p->is_pack
                        ? $p->items()->whereIn('pack_slot_id', $mySlotIds)->get(['sub_code', 'size_label', 'status'])
                        : [],
                    'pack_public_code' => $p->pack_campaign_id
                        ? DB::table('pack_campaigns')->where('id', $p->pack_campaign_id)->value('public_code')
                        : null,
                ],
            ))->values(),

            'fulfillment' => [
                'status' => $order->fulfillment_status,
                'label'  => FulfillmentStatus::tryFrom((string) $order->fulfillment_status)?->label(),
                // BL-PACK-SMOKE proves this is needed: an order can end up with no
                // package at all and, until now, no way to recover.
                'can_create_package' => $packages->where('is_pack', false)->isEmpty()
                    && $order->lineItems->reject(fn ($l) => (bool) ($l->metadata['pack_slot_id'] ?? null))->isNotEmpty(),
            ],
            'payment_session' => $session ? [
                'reference'         => $session->reference,
                'provider'          => $session->provider,
                'provider_status'   => $session->provider_status,
                'provider_reference'=> $session->provider_reference,
                'created_at'        => $session->created_at?->toIso8601String(),
            ] : null,
            'affiliate_sales' => $affiliateSales->map(fn ($s) => [
                'id'                => $s->id,
                'status'             => $s->status,
                'commission_amount' => '$' . number_format($s->commission_amount / 100, 2),
                'affiliate' => $s->affiliate ? [
                    'code'             => $s->affiliate->code,
                    'email'            => $s->affiliate->email,
                    'commission_rate'  => $s->affiliate->commission_rate,
                ] : null,
            ]),
        ];
    }

    /**
     * POST /api/admin/orders/{id}/refund  { reason? }
     *
     * Heavy lifting lives in App\Services\OrderRefunds — this just wraps
     * the side-effects + the email notification.
     */
    public function refund(Request $request, string $id)
    {
        $order = Order::with('lineItems')->findOrFail($id);
        $data  = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $result = OrderRefunds::refund($order, $data['reason'] ?? null);

        if ($result['already_refunded']) {
            return response()->json(['error' => 'This order was already refunded.'], 409);
        }

        // Email the customer — outside the transaction OrderRefunds opened.
        if ($order->email) {
            try {
                Mail::to($order->email)->send(new OrderRefundMail($order->fresh(), $data['reason'] ?? null));
            } catch (\Throwable $e) {
                Log::warning('[refund mail] '.$e->getMessage());
            }
        }
        if ($order->customer_id) {
            \App\Services\Notifications::forCustomer(
                $order->customer_id,
                kind: 'order_refunded',
                title: 'Order ' . $order->order_number . ' refunded',
                body: 'A refund of $' . number_format($order->total / 100, 2) . ' is on its way.',
                actionUrl: '/account?tab=transactions',
            );
        }

        return ['ok' => true, 'refund' => $result];
    }
}
