<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderLineItem;
use App\Models\ReturnItem;
use App\Models\ReturnRequest;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Customer-facing returns endpoints.
 *
 * Eligibility window: 30 days from order paid date. Customer picks which
 * line items + quantities they want to return, optionally a reason. The
 * request lands in `status=requested` and waits for an admin decision.
 */
class ReturnController extends Controller
{
    private const WINDOW_DAYS = 30;

    public function index()
    {
        $customer = $this->mustBeSignedIn();
        $rows = ReturnRequest::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->with('items')
            ->get();
        return ['returns' => $rows->map(fn ($r) => $this->shape($r))];
    }

    /**
     * POST /api/account/returns
     * { order_number, reason?, items: [{ order_line_item_id, quantity, reason? }] }
     */
    public function store(Request $request)
    {
        $customer = $this->mustBeSignedIn();
        $data = $request->validate([
            'order_number'             => ['required', 'string'],
            'reason'                   => ['nullable', 'string', 'max:1000'],
            'items'                    => ['required', 'array', 'min:1'],
            'items.*.order_line_item_id' => ['required', 'string'],
            'items.*.quantity'         => ['required', 'integer', 'min:1'],
            'items.*.reason'           => ['nullable', 'string', 'max:80'],
        ]);

        $order = Order::query()
            ->where('customer_id', $customer->id)
            ->where('order_number', $data['order_number'])
            ->first();
        if (! $order) abort(response()->json(['error' => 'Order not found.'], 404));
        if ($order->payment_status !== 'paid' || $order->status === 'refunded' || $order->status === 'cancelled') {
            abort(response()->json(['error' => 'This order is not eligible for return.'], 422));
        }
        if ($order->created_at && $order->created_at->lt(now()->subDays(self::WINDOW_DAYS))) {
            abort(response()->json(['error' => 'The 30-day return window has closed for this order.'], 422));
        }

        $lineIds = collect($data['items'])->pluck('order_line_item_id')->all();
        $lines = OrderLineItem::query()->whereIn('id', $lineIds)->where('order_id', $order->id)->get()->keyBy('id');
        if ($lines->count() !== count(array_unique($lineIds))) {
            abort(response()->json(['error' => 'One or more items don\'t belong to this order.'], 422));
        }
        foreach ($data['items'] as $row) {
            $line = $lines->get($row['order_line_item_id']);
            if ((int) $row['quantity'] > (int) $line->quantity) {
                abort(response()->json(['error' => 'Return quantity exceeds purchased quantity.'], 422));
            }
        }

        $return = DB::transaction(function () use ($order, $customer, $data) {
            $return = ReturnRequest::create([
                'id'          => 'ret_' . Str::random(20),
                'order_id'    => $order->id,
                'customer_id' => $customer->id,
                'status'      => 'requested',
                'reason'      => $data['reason'] ?? null,
            ]);
            foreach ($data['items'] as $row) {
                ReturnItem::create([
                    'id'                 => 'rti_' . Str::random(20),
                    'return_id'          => $return->id,
                    'order_line_item_id' => $row['order_line_item_id'],
                    'quantity'           => (int) $row['quantity'],
                    'reason'             => $row['reason'] ?? null,
                ]);
            }
            return $return->load('items');
        });

        Notifications::forAllAdmins(
            kind:      'return_requested',
            title:     'Return requested for ' . $order->order_number,
            body:      ($customer->email ?: 'customer') . ' filed a return request.',
            actionUrl: '/admin/returns',
        );

        return ['return' => $this->shape($return)];
    }

    public function show(string $id)
    {
        $customer = $this->mustBeSignedIn();
        $r = ReturnRequest::query()->where('id', $id)->where('customer_id', $customer->id)->with('items')->first();
        if (! $r) abort(response()->json(['error' => 'Not found.'], 404));
        return ['return' => $this->shape($r)];
    }

    private function mustBeSignedIn()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));
        return $customer;
    }

    private function shape(ReturnRequest $r): array
    {
        return [
            'id'             => $r->id,
            'order_number'   => optional($r->order)->order_number ?? optional(Order::find($r->order_id))->order_number,
            'status'         => $r->status,
            'reason'         => $r->reason,
            'admin_notes'    => $r->admin_notes,
            'refund_amount'  => (int) $r->refund_amount,
            'refund_label'   => '$' . number_format(((int) $r->refund_amount) / 100, 2),
            'resolved_at'    => $r->resolved_at?->toIso8601String(),
            'created_at'     => $r->created_at?->toIso8601String(),
            'items'          => $r->items->map(fn ($i) => [
                'order_line_item_id' => $i->order_line_item_id,
                'quantity'           => (int) $i->quantity,
                'reason'             => $i->reason,
            ]),
        ];
    }
}
