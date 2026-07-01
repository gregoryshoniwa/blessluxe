<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Package;
use App\Services\Shipping;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class AdminPackageController extends Controller
{
    public function index(Request $request)
    {
        $q = Package::query()
            ->with('order:id,order_number,email')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('package_code', 'like', "%{$term}%")
                       ->orWhere('customer_email', 'like', "%{$term}%")
                       ->orWhereHas('order', fn ($qo) => $qo->where('order_number', 'like', "%{$term}%"));
                });
            })
            ->latest();
        $paginator = $q->paginate((int) min(100, max(10, (int) $request->query('limit', 25))));

        return [
            'packages' => collect($paginator->items())->map(fn ($p) => [
                'id'                      => $p->id,
                'package_code'            => $p->package_code,
                'order_number'            => $p->order?->order_number,
                'customer_email'          => $p->customer_email,
                'status'                  => $p->status,
                'carrier'                 => $p->carrier,
                'carrier_tracking_number' => $p->carrier_tracking_number,
                'current_location'        => $p->current_location,
                'shipped_at'              => $p->shipped_at?->toIso8601String(),
                'delivered_at'            => $p->delivered_at?->toIso8601String(),
                'created_at'              => $p->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    public function show(string $id)
    {
        $pkg = Package::with(['items', 'events', 'order:id,order_number,email,total'])->findOrFail($id);
        return [
            'package' => [
                'id'                      => $pkg->id,
                'package_code'            => $pkg->package_code,
                'order_id'                => $pkg->order_id,
                'order_number'            => $pkg->order?->order_number,
                'order_email'             => $pkg->order?->email,
                'customer_id'             => $pkg->customer_id,
                'customer_email'          => $pkg->customer_email,
                'status'                  => $pkg->status,
                'carrier'                 => $pkg->carrier,
                'carrier_tracking_number' => $pkg->carrier_tracking_number,
                'current_location'        => $pkg->current_location,
                'estimated_delivery_at'   => $pkg->estimated_delivery_at?->toIso8601String(),
                'shipped_at'              => $pkg->shipped_at?->toIso8601String(),
                'delivered_at'            => $pkg->delivered_at?->toIso8601String(),
                'shipping_address'        => $pkg->shipping_address,
                'notes'                   => $pkg->notes,
                'created_at'              => $pkg->created_at?->toIso8601String(),
                'items'                   => $pkg->items,
                'events'                  => $pkg->events,
            ],
        ];
    }

    /**
     * PUT /api/admin/packages/{id}
     * carrier / tracking number / estimated_delivery_at / notes / address
     */
    public function update(Request $request, string $id)
    {
        $pkg = Package::findOrFail($id);
        $data = $request->validate([
            'carrier'                 => ['sometimes', 'nullable', 'string', 'max:64'],
            'carrier_tracking_number' => ['sometimes', 'nullable', 'string', 'max:120'],
            'estimated_delivery_at'   => ['sometimes', 'nullable', 'date'],
            'notes'                   => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);
        $pkg->update($data);
        return ['package' => $pkg->fresh()];
    }

    /**
     * POST /api/admin/packages/{id}/events
     * { status, location?, notes? } — appends a timeline row + mirrors
     * status onto the package.
     */
    public function appendEvent(Request $request, string $id)
    {
        $pkg = Package::findOrFail($id);
        $data = $request->validate([
            'status'   => ['required', Rule::in(['created', 'picked', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'])],
            'location' => ['nullable', 'string', 'max:120'],
            'notes'    => ['nullable', 'string', 'max:500'],
        ]);
        Shipping::recordEvent(
            $pkg,
            $data['status'],
            $data['location'] ?? null,
            $data['notes']    ?? null,
            (string) optional(Auth::guard('web')->user())->id,
        );
        return ['package' => $pkg->fresh()->load('events')];
    }
}
