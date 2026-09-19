<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\PackageStatus;
use App\Enums\PieceStatus;
use App\Http\Controllers\Controller;
use App\Models\Package;
use App\Models\PackageItem;
use App\Services\Carriers;
use App\Services\Couriers;
use App\Services\Fulfilment;
use App\Services\PackForwarding;
use App\Services\Shipping;
use App\Support\Address;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminPackageController extends Controller
{
    public function index(Request $request)
    {
        $q = Package::query()
            ->with('order:id,order_number,email')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            // ?is_pack=1 isolates leg-1 consignments, which are the ones that need
            // manifest handling rather than a simple address label.
            ->when($request->query('is_pack') !== null, fn ($q) => $q->where('is_pack', (bool) $request->query('is_pack')))
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
                'carrier_label'           => Carriers::label($p->carrier),
                'carrier_tracking_url'    => Carriers::trackingUrl($p->carrier, $p->carrier_tracking_number),
                'is_pack'                 => (bool) $p->is_pack,
                'leg'                     => $p->leg,
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
                'items'                   => $this->manifest($pkg),
                'events'                  => $pkg->events,

                'carrier_label'        => Carriers::label($pkg->carrier),
                'carrier_tracking_url' => Carriers::trackingUrl($pkg->carrier, $pkg->carrier_tracking_number),
                'is_pack'              => (bool) $pkg->is_pack,
                'leg'                  => $pkg->leg,
                'destination'          => [
                    'kind'    => $pkg->destination_kind,
                    'name'    => $pkg->destination_name,
                    'email'   => $pkg->destination_email,
                    'phone'   => $pkg->destination_phone,
                    'address' => $pkg->shipping_address,
                ],
                // Admin gets the FULL manifest including every buyer — that's the
                // operational requirement for handing pieces over. Buyer-facing
                // endpoints filter to one buyer's slots instead.
                'pack' => $pkg->pack_campaign_id ? $this->packContext($pkg->pack_campaign_id) : null,
                'can_dispatch' => ! $pkg->is_pack || Fulfilment::hubIsShippable(),
            ],
        ];
    }

    /** Manifest rows, with the buyer each piece belongs to. Admin-only. */
    private function manifest(Package $pkg)
    {
        $items = $pkg->items()->get();
        if (! $pkg->is_pack) return $items;

        // Both tables have an `id`, so every column here must be qualified.
        $slotOrders = DB::table('pack_slots')
            ->leftJoin('orders', 'orders.id', '=', 'pack_slots.order_id')
            ->whereIn('pack_slots.id', $items->pluck('pack_slot_id')->filter())
            ->pluck('orders.order_number', 'pack_slots.id');

        return $items->map(function ($i) use ($slotOrders) {
            $i->buyer_order_number = $i->pack_slot_id ? ($slotOrders[$i->pack_slot_id] ?? null) : null;
            $i->piece_label = PieceStatus::tryFrom((string) $i->status)?->label();
            return $i;
        });
    }

    private function packContext(string $campaignId): ?array
    {
        $c = DB::table('pack_campaigns')->where('id', $campaignId)->first();
        if (! $c) return null;

        $stats = DB::table('pack_slots')
            ->where('pack_campaign_id', $campaignId)
            ->whereNull('deleted_at')
            ->selectRaw("COUNT(*) as total, SUM(status = 'paid') as paid")
            ->first();

        return [
            'public_code' => $c->public_code,
            'title'       => $c->title,
            'status'      => $c->status,
            'slots_total' => (int) ($stats->total ?? 0),
            'slots_paid'  => (int) ($stats->paid ?? 0),
        ];
    }

    /**
     * POST /api/admin/packages/{id}/items/{itemId}/handover
     *
     * Hand a piece to the buyer standing at the counter. They present the PIN that
     * only they were shown; sub_code alone is not enough, since it is printed on the
     * manifest and derivable from the consignment code.
     */
    public function handover(Request $request, string $id, string $itemId)
    {
        $item = PackageItem::where('package_id', $id)->where('id', $itemId)->firstOrFail();

        $data = $request->validate([
            'collection_pin' => ['required', 'string', 'max:12'],
        ]);

        try {
            if (! PackForwarding::verifyCollectionPin($item, $data['collection_pin'])) {
                return response()->json([
                    'error'    => 'That collection code does not match. Ask the customer to read it from their order page.',
                    'attempts' => $item->fresh()->collection_attempts,
                ], 422);
            }
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 429);
        }

        $adminId = (string) optional(Auth::guard('web')->user())->id;
        // Prefixed because users.id is an int and customers.id is a cust_* string,
        // and they share this column.
        PackForwarding::markCollected($item, 'user:' . $adminId);

        return ['item' => $item->fresh(), 'collected' => true];
    }

    /**
     * POST /api/admin/packages/{id}/items/{itemId}/dispatch
     *
     * Send a paid-for piece onward to the buyer's address.
     */
    public function dispatchPiece(string $id, string $itemId)
    {
        $item = PackageItem::where('package_id', $id)->where('id', $itemId)->firstOrFail();
        $slot = DB::table('pack_slots')->where('id', $item->pack_slot_id)->first();

        if (! $slot || $slot->delivery_preference !== PackForwarding::PREF_FORWARD) {
            return response()->json(['error' => 'This buyer chose to collect in person.'], 422);
        }
        if ($slot->forward_fee_status !== 'paid') {
            return response()->json(['error' => 'The forwarding fee has not been paid yet.'], 422);
        }

        $package = PackForwarding::dispatch($item, (string) optional(Auth::guard('web')->user())->id);

        return ['package' => $package];
    }

    /** GET /api/admin/couriers — all of them, including deactivated ones. */
    public function couriers()
    {
        return ['couriers' => Couriers::all()];
    }

    /** POST /api/admin/couriers */
    public function storeCourier(Request $request)
    {
        $data = $this->validateCourier($request, null);

        $id = 'cour_' . Str::slug($data['code'], '_');
        if (DB::table('couriers')->where('id', $id)->exists()) {
            $id .= '_' . Str::random(4);
        }

        if (! empty($data['is_default'])) {
            DB::table('couriers')->update(['is_default' => false]);
        }

        DB::table('couriers')->insert(array_merge([
            'id'           => $id,
            'is_active'    => true,
            'base_fee'     => 0,
            'per_item_fee' => 0,
            'sort_order'   => (int) DB::table('couriers')->max('sort_order') + 1,
            'created_at'   => now(),
            'updated_at'   => now(),
        ], $data));

        return ['couriers' => Couriers::all(), 'created' => $id];
    }

    /** PUT /api/admin/couriers/{id} — rates change; admin edits them here. */
    public function updateCourier(Request $request, string $id)
    {
        if (! DB::table('couriers')->where('id', $id)->exists()) {
            return response()->json(['error' => 'Courier not found.'], 404);
        }

        $data = $this->validateCourier($request, $id);

        // Exactly one default, or the buyer's pre-selection is ambiguous.
        if (! empty($data['is_default'])) {
            DB::table('couriers')->update(['is_default' => false]);
        }

        DB::table('couriers')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));

        $this->ensureADefaultExists();

        return ['couriers' => Couriers::all()];
    }

    /**
     * DELETE /api/admin/couriers/{id}
     *
     * A courier already carrying goods is DEACTIVATED, not deleted: removing it
     * would orphan the courier_id on live shipments and erase how those goods
     * actually travelled. Only a courier nothing references is truly removed.
     */
    public function destroyCourier(string $id)
    {
        $courier = DB::table('couriers')->where('id', $id)->first();
        if (! $courier) {
            return response()->json(['error' => 'Courier not found.'], 404);
        }

        $inUse = DB::table('pack_slots')->where('courier_id', $id)->exists()
            || DB::table('packages')->where('courier_id', $id)->exists()
            || DB::table('products')->where('default_courier_id', $id)->exists();

        if ($inUse) {
            DB::table('couriers')->where('id', $id)->update([
                'is_active'  => false,
                'is_default' => false,
                'updated_at' => now(),
            ]);
            $this->ensureADefaultExists();

            return [
                'couriers'    => Couriers::all(),
                'deactivated' => true,
                'message'     => 'This courier is carrying goods, so it has been deactivated rather than deleted. Existing shipments keep their history; buyers can no longer choose it.',
            ];
        }

        DB::table('couriers')->where('id', $id)->delete();
        $this->ensureADefaultExists();

        return ['couriers' => Couriers::all(), 'deleted' => true];
    }

    private function validateCourier(Request $request, ?string $id): array
    {
        $rules = [
            'code'         => [$id ? 'sometimes' : 'required', 'string', 'max:40', 'regex:/^[a-z0-9_-]+$/',
                               Rule::unique('couriers', 'code')->ignore($id)],
            'name'         => [$id ? 'sometimes' : 'required', 'string', 'max:120'],
            'description'  => ['nullable', 'string', 'max:200'],
            'base_fee'     => ['sometimes', 'integer', 'min:0', 'max:10000000'],
            'per_item_fee' => ['sometimes', 'integer', 'min:0', 'max:10000000'],
            'min_days'     => ['nullable', 'integer', 'min:0', 'max:365'],
            'max_days'     => ['nullable', 'integer', 'min:0', 'max:365'],
            'is_active'    => ['sometimes', 'boolean'],
            'is_default'   => ['sometimes', 'boolean'],
            'sort_order'   => ['sometimes', 'integer', 'min:0'],
        ];

        $data = $request->validate($rules);

        // A range that reads backwards would render as "14–3 days".
        $min = $data['min_days'] ?? null;
        $max = $data['max_days'] ?? null;
        if ($min !== null && $max !== null && $min > $max) {
            abort(422, 'The fastest delivery estimate cannot be longer than the slowest.');
        }

        return $data;
    }

    /** Never leave the buyer with no pre-selected courier. */
    private function ensureADefaultExists(): void
    {
        $hasDefault = DB::table('couriers')->where('is_active', true)->where('is_default', true)->exists();
        if ($hasDefault) return;

        $first = DB::table('couriers')->where('is_active', true)->orderBy('sort_order')->first();
        if ($first) {
            DB::table('couriers')->where('id', $first->id)->update(['is_default' => true, 'updated_at' => now()]);
        }
    }

    /** GET /api/admin/fulfilment-settings */
    public function settings()
    {
        return [
            'settings'   => Fulfilment::settings(),
            'shippable'  => Fulfilment::hubIsShippable(),
            'carriers'   => Carriers::options(),
        ];
    }

    /** PUT /api/admin/fulfilment-settings */
    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'hub_name'         => ['nullable', 'string', 'max:120'],
            'hub_email'        => ['nullable', 'email', 'max:190'],
            'hub_phone'        => ['nullable', 'string', 'max:40'],
            'hub_address'      => ['nullable', 'array'],
            'collection_point' => ['nullable', 'string', 'max:500'],
            'collection_hours' => ['nullable', 'string', 'max:200'],
            'forward_fee_default' => ['nullable', 'integer', 'min:0'],
        ]);

        $patch = [];
        if (array_key_exists('hub_name', $data))         $patch[Fulfilment::KEY_HUB_NAME] = $data['hub_name'];
        if (array_key_exists('hub_email', $data))        $patch[Fulfilment::KEY_HUB_EMAIL] = $data['hub_email'];
        if (array_key_exists('hub_phone', $data))        $patch[Fulfilment::KEY_HUB_PHONE] = $data['hub_phone'];
        if (array_key_exists('hub_address', $data))      $patch[Fulfilment::KEY_HUB_ADDRESS] = json_encode(Address::normalize($data['hub_address'] ?? []));
        if (array_key_exists('collection_point', $data)) $patch[Fulfilment::KEY_COLLECTION_POINT] = $data['collection_point'];
        if (array_key_exists('collection_hours', $data)) $patch[Fulfilment::KEY_COLLECTION_HOURS] = $data['collection_hours'];
        if (array_key_exists('forward_fee_default', $data)) $patch[Fulfilment::KEY_FORWARD_FEE] = $data['forward_fee_default'];

        return [
            'settings'  => Fulfilment::setConfig($patch),
            'shippable' => Fulfilment::hubIsShippable(),
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
            'status'   => ['required', Rule::enum(PackageStatus::class)],
            'location' => ['nullable', 'string', 'max:120'],
            'notes'    => ['nullable', 'string', 'max:500'],
        ]);
        // Dispatching a consignment to a blank address is unrecoverable: the goods
        // are gone and nobody knows where. Enforced server-side, never trusting a
        // disabled control in the admin UI.
        $dispatching = in_array($data['status'], ['shipped', 'in_transit', 'out_for_delivery', 'delivered'], true);
        if ($pkg->is_pack && $dispatching && ! Fulfilment::hubIsShippable()) {
            return response()->json([
                'error' => 'Set the BLESSLUXE hub address under Fulfilment settings before dispatching a pack consignment.',
            ], 422);
        }

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
