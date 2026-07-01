<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\ReturnRequest;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminReturnController extends Controller
{
    private const STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

    public function index(Request $request)
    {
        $status = $request->query('status');
        $rows = ReturnRequest::query()
            ->when($status, fn ($q) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->limit(200)
            ->with('items')
            ->get();
        return ['returns' => $rows->map(fn ($r) => $this->shape($r))];
    }

    public function show(string $id)
    {
        $r = ReturnRequest::query()->where('id', $id)->with('items')->first();
        if (! $r) abort(response()->json(['error' => 'Not found.'], 404));
        return ['return' => $this->shape($r, full: true)];
    }

    /**
     * PUT /api/admin/returns/{id}
     * { status, admin_notes?, refund_amount? }
     */
    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'status'        => ['required', Rule::in(self::STATUSES)],
            'admin_notes'   => ['nullable', 'string', 'max:2000'],
            'refund_amount' => ['nullable', 'integer', 'min:0'],
        ]);

        $r = ReturnRequest::query()->where('id', $id)->first();
        if (! $r) abort(response()->json(['error' => 'Not found.'], 404));

        DB::transaction(function () use ($r, $data) {
            $changed = $r->status !== $data['status'];
            $r->status      = $data['status'];
            $r->admin_notes = $data['admin_notes'] ?? $r->admin_notes;
            if (array_key_exists('refund_amount', $data)) {
                $r->refund_amount = (int) $data['refund_amount'];
            }
            if (in_array($data['status'], ['approved', 'rejected', 'refunded'], true)) {
                $r->resolved_at = $r->resolved_at ?? now();
            }
            $r->save();

            // On refund: optionally flag the source order as refunded if the
            // amount matches order total. Otherwise leave the order intact
            // so partial returns coexist with the original.
            if ($changed && $data['status'] === 'refunded') {
                $order = Order::find($r->order_id);
                if ($order && $order->payment_status === 'paid' && (int) $r->refund_amount >= (int) $order->total) {
                    $order->update(['status' => 'refunded', 'payment_status' => 'refunded']);
                }
            }
        });

        $r->load('items');
        // Notify the customer + admin team about the resolution.
        if (in_array($data['status'], ['approved', 'rejected', 'refunded'], true) && $r->customer_id) {
            $cust = Customer::find($r->customer_id);
            if ($cust) {
                $label = $data['status'] === 'rejected' ? 'declined' : $data['status'];
                Notifications::forCustomer(
                    $cust,
                    kind:      'return_' . $data['status'],
                    title:     'Return ' . $label . ' for order ' . optional($r->order)->order_number,
                    body:      $data['admin_notes'] ? $data['admin_notes'] : null,
                    actionUrl: '/account?tab=returns',
                );
            }
        }
        return ['return' => $this->shape($r, full: true)];
    }

    private function shape(ReturnRequest $r, bool $full = false): array
    {
        $base = [
            'id'             => $r->id,
            'order_id'       => $r->order_id,
            'order_number'   => optional($r->order)->order_number ?? optional(Order::find($r->order_id))->order_number,
            'customer_id'    => $r->customer_id,
            'customer_email' => optional(Customer::find($r->customer_id))->email,
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
        return $base;
    }
}
