<?php

namespace App\Services;

use App\Enums\FulfillmentStatus;
use App\Enums\PackageStatus;
use App\Enums\PieceStatus;
use App\Models\Order;
use App\Models\Package;
use App\Models\PackageEvent;
use App\Models\PackageItem;
use App\Support\Address;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Package + tracking helpers. The public-facing `package_code` is a short
 * BL-XXXX-XXXX-Y string with a Luhn-style check digit at the end, so a
 * customer who mistypes a digit gets a 404 instead of pulling up someone
 * else's tracking record.
 */
class Shipping
{
    /**
     * ─── Resolver seam ──────────────────────────────────────────────────
     *
     * Every lookup of "which package(s) belong to this order" goes through here.
     *
     * Six call sites used to run `Package::where('order_id', …)->first()` directly,
     * which hard-codes the assumption that an order has exactly one package. Pack
     * consignments break that: one package serves many buyers' orders and carries
     * no order_id at all, and a forwarded piece adds a second package to an order.
     *
     * Routing every read through these three methods means the storage shape can
     * change later by editing three method bodies instead of hunting call sites.
     */

    /**
     * All packages an order has a stake in — its own first, then any pack
     * consignment holding one of its slots. Ordered so `->first()` still returns
     * the order's own package, which keeps existing single-package callers correct.
     */
    public static function packagesForOrder(Order|string $order): Collection
    {
        $orderId = $order instanceof Order ? $order->id : $order;

        $own = Package::where('order_id', $orderId)->get();

        // pack_slots.order_id is the only link written at checkout; package_items
        // .pack_slot_id ties those slots to the consignment carrying them.
        $slotIds = DB::table('pack_slots')
            ->where('order_id', $orderId)
            ->whereNull('deleted_at')
            ->pluck('id');

        if ($slotIds->isEmpty()) return $own;

        $consignments = Package::where('is_pack', true)
            ->whereIn('id', DB::table('package_items')->whereIn('pack_slot_id', $slotIds)->pluck('package_id'))
            ->get();

        return $own->concat($consignments->reject(fn ($p) => $own->contains('id', $p->id)))->values();
    }

    /**
     * order id => tracking code, for a page of orders. Batched into three queries
     * rather than calling packagesForOrder() per row, which would be N+1 on the
     * 50-order account list. An order's own package wins over a consignment.
     */
    public static function trackingCodeMap(Collection|array $orderIds): array
    {
        $orderIds = collect($orderIds)->filter()->unique()->values();
        if ($orderIds->isEmpty()) return [];

        // Consignments first, so an order's own package overwrites them below.
        $slots = DB::table('pack_slots')
            ->whereIn('order_id', $orderIds)
            ->whereNull('deleted_at')
            ->pluck('order_id', 'id');            // slot id => order id

        $map = [];
        if ($slots->isNotEmpty()) {
            $itemPackages = DB::table('package_items')
                ->whereIn('pack_slot_id', $slots->keys())
                ->pluck('package_id', 'pack_slot_id');

            $codes = Package::whereIn('id', $itemPackages->values()->unique())
                ->pluck('package_code', 'id');

            foreach ($itemPackages as $slotId => $packageId) {
                if ($orderId = $slots[$slotId] ?? null) {
                    $map[$orderId] = $codes[$packageId] ?? null;
                }
            }
        }

        foreach (Package::whereIn('order_id', $orderIds)->pluck('package_code', 'order_id') as $orderId => $code) {
            $map[$orderId] = $code;
        }

        return array_filter($map);
    }

    /** The consignment carrying a given slot, if one has been minted yet. */
    public static function packageForSlot(string $slotId): ?Package
    {
        $packageId = DB::table('package_items')->where('pack_slot_id', $slotId)->value('package_id');

        return $packageId ? Package::find($packageId) : null;
    }

    /** A campaign's leg-1 consignment. Falls back to a query if the pointer is unset. */
    public static function consignmentForCampaign(string $campaignId): ?Package
    {
        return Package::where('pack_campaign_id', $campaignId)
            ->where('is_pack', true)
            ->first();
    }

    /** This buyer's own piece inside a consignment — the unit every buyer-facing view filters to. */
    public static function pieceForOrder(Order|string $order): ?PackageItem
    {
        $orderId = $order instanceof Order ? $order->id : $order;

        $slotIds = DB::table('pack_slots')
            ->where('order_id', $orderId)
            ->whereNull('deleted_at')
            ->pluck('id');

        return $slotIds->isEmpty()
            ? null
            : PackageItem::whereIn('pack_slot_id', $slotIds)->first();
    }

    /**
     * Recompute orders.fulfillment_status from the order's packages.
     *
     * DERIVED, never hand-set: call this from recordEvent / package creation /
     * markPaidForOrder, never from a controller. Anything else and the column
     * drifts from the packages it is supposed to summarise.
     */
    public static function syncOrderFulfillment(Order|string $order): FulfillmentStatus
    {
        $order = $order instanceof Order ? $order : Order::find($order);
        if (! $order) return FulfillmentStatus::Unfulfilled;

        $status = self::deriveFulfillment($order);

        // Only write on change — avoids pointless updated_at churn on every event.
        if ($order->fulfillment_status !== $status->value) {
            $order->forceFill(['fulfillment_status' => $status->value])->save();
        }

        return $status;
    }

    public static function deriveFulfillment(Order $order): FulfillmentStatus
    {
        // A refunded order is terminal regardless of where its parcels are.
        if ($order->status === 'refunded') return FulfillmentStatus::Cancelled;

        $packages = self::packagesForOrder($order);

        // A paid slot on a campaign that hasn't filled yet cannot progress — the
        // consignment doesn't leave until the last slot sells. But this only holds
        // while nothing has actually shipped: once goods are physically moving,
        // "waiting for the pack to fill" is a lie, so the real shipment wins.
        $awaitingPack = DB::table('pack_slots')
            ->join('pack_campaigns', 'pack_campaigns.id', '=', 'pack_slots.pack_campaign_id')
            ->where('pack_slots.order_id', $order->id)
            ->whereNull('pack_slots.deleted_at')
            ->where('pack_slots.status', 'paid')
            ->whereNotIn('pack_campaigns.status', ['filled', 'cancelled'])
            ->exists();

        $anythingMoving = $packages->contains(fn (Package $p) => $p->shipped_at !== null || $p->delivered_at !== null);

        if ($awaitingPack && ! $anythingMoving) return FulfillmentStatus::AwaitingPack;
        if ($packages->isEmpty()) return FulfillmentStatus::Unfulfilled;

        $mapped = $packages
            ->map(function (Package $p) {
                $s = PackageStatus::tryFrom((string) $p->status);
                if (! $s) return null;

                $mapped = FulfillmentStatus::fromPackageStatus($s);

                // A consignment's journey ends at BLESSLUXE, not at the buyer.
                // Reporting "Delivered" here would tell someone their parcel had
                // arrived while they were still waiting to collect it — so leg 1
                // tops out at "At BLESSLUXE" and the last mile is leg 2's to claim.
                if ($p->is_pack && $mapped === FulfillmentStatus::Delivered) {
                    return FulfillmentStatus::AtHub;
                }

                return $mapped;
            })
            ->filter();

        if ($mapped->isEmpty()) return FulfillmentStatus::Unfulfilled;

        // Any failure anywhere surfaces as the failure — a returned parcel is
        // more important to show than a delivered one.
        if ($failed = $mapped->first(fn (FulfillmentStatus $s) => $s->isFailure())) {
            return $failed;
        }

        // The order is only as far along as its least-advanced package. If they
        // disagree and at least one has shipped, that's a partial shipment.
        $min = $mapped->sortBy(fn (FulfillmentStatus $s) => $s->rank())->first();
        $max = $mapped->sortByDesc(fn (FulfillmentStatus $s) => $s->rank())->first();

        if ($min !== $max && $max->rank() >= FulfillmentStatus::Shipped->rank()) {
            return FulfillmentStatus::PartiallyShipped;
        }

        return $min;
    }

    /**
     * Create whatever packages an order needs, splitting its lines by destination.
     *
     * Ordinary lines go into the order's own parcel. Pack lines join their
     * campaign's shared consignment instead, which ships to BLESSLUXE and carries
     * no order_id of its own. An order can produce one, the other, or both.
     *
     * Idempotent. Replaces ensurePackageForOrder(), which assumed one package.
     */
    public static function ensurePackagesForOrder(Order $order): Collection
    {
        return DB::transaction(function () use ($order) {
            $lines = $order->lineItems()->get();

            $packLines    = $lines->filter(fn ($l) => (bool) ($l->metadata['pack_slot_id'] ?? null));
            $ordinaryLines = $lines->reject(fn ($l) => (bool) ($l->metadata['pack_slot_id'] ?? null));

            $out = collect();

            // An order of nothing but pack slots gets no parcel of its own — its
            // goods travel inside the consignment.
            if ($ordinaryLines->isNotEmpty()) {
                $out->push(self::ensureDirectPackage($order, $ordinaryLines));
            }

            foreach ($packLines->groupBy(fn ($l) => $l->metadata['pack_campaign_id'] ?? null) as $campaignId => $group) {
                if (! $campaignId) continue;
                $out->push(self::ensureConsignmentForCampaign((string) $campaignId));
            }

            self::syncOrderFulfillment($order);

            return $out->filter()->values();
        });
    }

    /** Backwards-compatible shim: the order's own parcel, if it has one. */
    public static function ensurePackageForOrder(Order $order): ?Package
    {
        return self::ensurePackagesForOrder($order)->firstWhere('is_pack', false);
    }

    private static function ensureDirectPackage(Order $order, Collection $lines): Package
    {
        $existing = Package::where('order_id', $order->id)->where('is_pack', false)->first();
        if ($existing) return $existing;

        $package = Package::create([
            'id'               => 'pkg_' . Str::random(16),
            'package_code'     => self::makeCode(),
            'order_id'         => $order->id,
            'customer_id'      => $order->customer_id,
            'customer_email'   => $order->email,
            'status'           => 'created',
            'shipping_address' => $order->shipping_address,
            'is_pack'          => false,
            'leg'              => 'direct',
            'destination_kind' => 'customer',
        ]);

        foreach ($lines as $line) {
            self::addItem($package, $line);
        }

        self::recordEvent($package, 'created', null, 'Order received — preparing your pieces.', 'system');

        return $package->fresh();
    }

    /**
     * The campaign's leg-1 consignment, created on the FIRST paid slot rather than
     * when the pack fills.
     *
     * Creating it early is what lets a pack buyer see a progress bar and a tracking
     * code on day one — otherwise they'd have nothing to look at until the last slot
     * sold, which is precisely the window where they most want reassurance.
     *
     * Idempotent: appends items for newly-paid slots, never removes existing ones
     * (sub_code positions must stay stable — a printed manifest may already exist).
     */
    public static function ensureConsignmentForCampaign(string $campaignId): ?Package
    {
        $campaign = DB::table('pack_campaigns')->where('id', $campaignId)->first();
        if (! $campaign) return null;

        return DB::transaction(function () use ($campaign, $campaignId) {
            $package = self::consignmentForCampaign($campaignId);

            if (! $package) {
                $hub = Fulfilment::settings();

                $package = Package::create([
                    'id'                => 'pkg_' . Str::random(16),
                    'package_code'      => self::makeCode(),
                    // NULL by design: a consignment belongs to a campaign, not to any
                    // one buyer's order. See the migration for why.
                    'order_id'          => null,
                    'customer_id'       => null,
                    'customer_email'    => $hub['hub_email'],
                    'status'            => 'created',
                    'is_pack'           => true,
                    'pack_campaign_id'  => $campaignId,
                    'leg'               => 'consignment',
                    'destination_kind'  => 'hub',
                    'destination_name'  => $hub['hub_name'],
                    'destination_email' => $hub['hub_email'],
                    'destination_phone' => $hub['hub_phone'],
                    // Snapshot, so the address it shipped to is preserved even if
                    // the hub later moves.
                    'shipping_address'  => array_filter($hub['hub_address'], fn ($v) => $v !== null),
                ]);

                DB::table('pack_campaigns')->where('id', $campaignId)->update([
                    'consignment_package_id' => $package->id,
                    'updated_at'             => now(),
                ]);

                self::recordEvent(
                    $package,
                    'created',
                    null,
                    'Pack opened — pieces are being collected.',
                    'system',
                );
            }

            self::syncConsignmentItems($package->fresh(), $campaignId);

            return $package->fresh();
        });
    }

    /** Append a package_item, with its sub_code, for every paid slot not yet listed. */
    private static function syncConsignmentItems(Package $package, string $campaignId): void
    {
        $alreadyListed = DB::table('package_items')
            ->where('package_id', $package->id)
            ->whereNotNull('pack_slot_id')
            ->pluck('pack_slot_id')
            ->all();

        $newSlots = DB::table('pack_slots')
            ->where('pack_campaign_id', $campaignId)
            ->where('status', 'paid')
            ->whereNull('deleted_at')
            ->whereNotIn('id', $alreadyListed ?: [''])
            ->orderBy('created_at')
            ->get();

        if ($newSlots->isEmpty()) return;

        // Positions continue from the highest already used — never reused, so a
        // printed manifest stays valid.
        $position = (int) DB::table('package_items')->where('package_id', $package->id)->count();

        foreach ($newSlots as $slot) {
            $position++;
            $line = $slot->line_item_id
                ? DB::table('order_line_items')->where('id', $slot->line_item_id)->first()
                : null;

            PackageItem::create([
                'id'            => 'pkgi_' . Str::random(16),
                'package_id'    => $package->id,
                'order_line_id' => $slot->line_item_id,
                'pack_slot_id'  => $slot->id,
                'sub_code'      => $package->package_code . '-' . str_pad((string) $position, 2, '0', STR_PAD_LEFT),
                'variant_id'    => $slot->variant_id,
                'product_id'    => $line->product_id ?? null,
                'product_title' => $line->title ?? 'Item',
                'variant_title' => $line->variant_title ?? $slot->size_label,
                'size_label'    => $slot->size_label,
                'sku'           => $line->sku ?? null,
                'thumbnail'     => $line->thumbnail ?? null,
                'quantity'      => (int) ($line->quantity ?? 1),
                'unit_price'    => (int) ($line->unit_price ?? 0),
                'status'        => PieceStatus::Pending->value,
            ]);

            self::recordEvent(
                $package,
                $package->status,
                null,
                'A slot was filled.',
                'system',
                silent: true,
            );
        }
    }

    private static function addItem(Package $package, $line): PackageItem
    {
        return PackageItem::create([
            'id'            => 'pkgi_' . Str::random(16),
            'package_id'    => $package->id,
            'order_line_id' => $line->id,
            'variant_id'    => $line->variant_id,
            'product_id'    => $line->product_id,
            'product_title' => $line->title,
            'variant_title' => $line->variant_title,
            'sku'           => $line->sku,
            'thumbnail'     => $line->thumbnail,
            'quantity'      => $line->quantity,
            'unit_price'    => $line->unit_price,
            'status'        => PieceStatus::Pending->value,
        ]);
    }

    /**
     * Append a status event AND mirror the latest state onto the parent
     * package so list views can read it in a single query.
     */
    /**
     * @param  bool  $silent  Suppress downstream notification (Phase 7). Used for
     *                        bookkeeping notes and by OrderRefunds, which sends its
     *                        own mail and must not double up.
     */
    public static function recordEvent(Package $package, string $status, ?string $location, ?string $notes, ?string $createdBy = null, bool $silent = false): PackageEvent
    {
        $event = PackageEvent::create([
            'id'         => 'pkge_' . Str::random(16),
            'package_id' => $package->id,
            'status'     => $status,
            'location'   => $location,
            'notes'      => $notes,
            'created_by' => $createdBy,
            'created_at' => now(),
        ]);

        $patch = ['status' => $status, 'updated_at' => now()];
        if ($location)                      $patch['current_location'] = $location;
        if (in_array($status, ['shipped', 'in_transit'], true) && ! $package->shipped_at) {
            $patch['shipped_at'] = now();
        }
        if ($status === 'delivered' && ! $package->delivered_at) {
            $patch['delivered_at'] = now();
        }
        $package->update($patch);

        // A consignment's status drives every piece inside it forward together,
        // up to the point where buyers diverge into collect-or-forward.
        if ($package->is_pack) {
            self::advancePieces($package->fresh(), $status);
        }

        // Keep the order-level summary in step. A consignment touches every buyer's
        // order, not just one, so resolve them through the slots it carries.
        foreach (self::orderIdsForPackage($package->fresh()) as $orderId) {
            self::syncOrderFulfillment($orderId);
        }

        // Tell the customer. $silent covers bookkeeping notes and callers that send
        // their own mail (OrderRefunds), so they don't double up.
        if (! $silent) {
            try {
                ShippingNotifier::onEvent($package->fresh(), $event);
            } catch (\Throwable $e) {
                // Never let a mail problem roll back a recorded shipment event.
                \Illuminate\Support\Facades\Log::warning('Shipment notification failed', [
                    'package' => $package->package_code,
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        return $event;
    }

    /**
     * Move every live piece in a consignment as leg 1 progresses.
     *
     * Cancelled pieces (withdrawn by a refund) and pieces that have already left
     * BLESSLUXE's custody are never touched.
     */
    private static function advancePieces(Package $package, string $status): void
    {
        // The consignment's journey is supplier -> courier -> BLESSLUXE. 'delivered'
        // here means BLESSLUXE has physically collected from the courier, which is
        // the moment distribution to buyers can begin — not the moment a buyer has
        // their goods.
        $next = match ($status) {
            'sourcing', 'picked', 'packed'                             => PieceStatus::Pending,
            'shipped', 'in_transit', 'at_courier', 'out_for_delivery'  => PieceStatus::InConsignment,
            'delivered'                                                => PieceStatus::AtAdmin,
            default                                                    => null,
        };

        if (! $next) return;

        DB::table('package_items')
            ->where('package_id', $package->id)
            ->whereNotIn('status', [
                PieceStatus::Cancelled->value,
                PieceStatus::Collected->value,
                PieceStatus::Forwarded->value,
                PieceStatus::Forwarding->value,
            ])
            ->update(['status' => $next->value, 'updated_at' => now()]);

        // Goods are with BLESSLUXE: every live piece now needs a collection PIN,
        // which is what the buyer presents and staff verify at handover.
        if ($next === PieceStatus::AtAdmin) {
            foreach ($package->items()->whereNull('collection_pin')->get() as $item) {
                if ($item->status !== PieceStatus::Cancelled->value) {
                    PackForwarding::ensureCollectionPin($item);
                }
            }
        }
    }

    /**
     * Every order a package affects. One for an ordinary package; N for a pack
     * consignment, which is shared by all the buyers whose slots it carries.
     *
     * @return array<int,string>
     */
    public static function orderIdsForPackage(Package $package): array
    {
        if (! $package->is_pack) {
            return array_filter([$package->order_id]);
        }

        $slotIds = DB::table('package_items')
            ->where('package_id', $package->id)
            ->whereNotNull('pack_slot_id')
            ->pluck('pack_slot_id');

        if ($slotIds->isEmpty()) return array_filter([$package->order_id]);

        return DB::table('pack_slots')
            ->whereIn('id', $slotIds)
            ->whereNotNull('order_id')
            ->distinct()
            ->pluck('order_id')
            ->all();
    }

    /**
     * The one shipment payload every surface renders from.
     *
     * Carries the six things tracking research says a customer needs: an expected
     * delivery date, a progress position (present even before dispatch), the carrier
     * NAME, the tracking number as a clickable URL, the full event history, and the
     * contents with thumbnails.
     *
     * $onlySlotIds filters the contents to one buyer's pieces. A pack consignment is
     * shared, so this filter is what keeps one buyer from seeing another's items —
     * it happens HERE, server-side, never with a v-if in Vue.
     *
     * @param  array<int,string>|null  $onlySlotIds
     */
    public static function shipmentPayload(Package $package, ?array $onlySlotIds = null, bool $includeSubCodes = false): array
    {
        $status = PackageStatus::tryFrom((string) $package->status);

        $items = $package->items()
            ->when($onlySlotIds !== null, fn ($q) => $q->whereIn('pack_slot_id', $onlySlotIds))
            ->get();

        $events = $package->events()->get();

        return array_merge(Carriers::payload($package->carrier, $package->carrier_tracking_number), [
            'code'               => $package->package_code,
            'is_pack'            => (bool) $package->is_pack,
            'status'             => $package->status,
            'status_label'       => $package->is_pack
                ? ($status?->consignmentLabel() ?? $package->status)
                : ($status?->label() ?? $package->status),
            'progress_index'     => $status?->progressIndex(),
            'is_failure'         => (bool) $status?->isFailure(),
            'current_location'   => $package->current_location,
            'estimated_delivery' => self::estimatedDelivery($package),
            'shipped_at'         => $package->shipped_at?->toIso8601String(),
            'delivered_at'       => $package->delivered_at?->toIso8601String(),
            'created_at'         => $package->created_at?->toIso8601String(),
            'items'              => $items->map(fn (PackageItem $i) => array_filter([
                'product_title' => $i->product_title,
                'variant_title' => $i->variant_title,
                'quantity'      => $i->quantity,
                'sku'           => $i->sku,
                'thumbnail'     => $i->thumbnail ?? null,
                // sub_code is a bearer collection credential — only ever included
                // for a caller that has already proven it holds that piece.
                'sub_code'      => $includeSubCodes ? ($i->sub_code ?? null) : null,
            ], fn ($v) => $v !== null))->values(),
            'events'             => $events->map(fn ($e) => [
                'status'       => $e->status,
                'status_label' => $package->is_pack
                    ? (PackageStatus::tryFrom((string) $e->status)?->consignmentLabel() ?? $e->status)
                    : (PackageStatus::tryFrom((string) $e->status)?->label() ?? $e->status),
                'location'     => $e->location,
                'notes'        => $e->notes,
                'created_at'   => $e->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    /**
     * "When will it arrive?" — the question customers open a tracking page to answer.
     *
     * Returns a real date when an admin has set one, otherwise an honest estimated
     * window derived from config/shipping.php. Never returns a fake-precise single
     * date for an estimate: `is_estimate` must reach the UI and change the wording.
     *
     * @return array{at:?string,from:?string,to:?string,is_estimate:bool}|null
     */
    public static function estimatedDelivery(Package $package): ?array
    {
        if ($package->estimated_delivery_at) {
            return [
                'at'          => $package->estimated_delivery_at->toIso8601String(),
                'from'        => null,
                'to'          => null,
                'is_estimate' => false,
            ];
        }

        // Nothing sensible to promise once a parcel has failed.
        $status = PackageStatus::tryFrom((string) $package->status);
        if ($status?->isFailure()) return null;

        if ($package->delivered_at) {
            return [
                'at'          => $package->delivered_at->toIso8601String(),
                'from'        => null,
                'to'          => null,
                'is_estimate' => false,
            ];
        }

        $country   = Address::normalize($package->shipping_address)['country'];
        $domestic  = $country === null || $country === strtoupper((string) config('shipping.domestic_country', 'ZW'));
        $transit   = (int) config('shipping.transit_days.' . ($domestic ? 'domestic' : 'international'), 5);
        $spread    = (int) config('shipping.estimate_spread_days', 2);

        // Count processing from dispatch once we know it, otherwise from creation.
        $anchor = $package->shipped_at
            ? $package->shipped_at->copy()
            : ($package->created_at?->copy() ?? now())->addDays((int) config('shipping.processing_days', 2));

        $mid  = $anchor->addDays($transit);
        $from = $mid->copy()->subDays($spread);
        $to   = $mid->copy()->addDays($spread);

        // An estimate that has already elapsed is worse than none: it tells the
        // customer their parcel is late without telling them anything useful, and
        // it makes the whole page look unmaintained. Say nothing instead, and let
        // the UI fall back to "we'll update this once it's on the move".
        if ($to->isPast()) return null;

        return [
            'at'          => null,
            'from'        => $from->toIso8601String(),
            'to'          => $to->toIso8601String(),
            'is_estimate' => true,
        ];
    }

    /**
     * Generate a `BL-XXXX-XXXX-Y` code where Y is a Luhn check digit over
     * the digit positions of the random body. Cheap collision-check loop
     * since BL-XXXX-XXXX gives ~36^8 possibilities.
     */
    public static function makeCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
        do {
            $a = '';
            $b = '';
            for ($i = 0; $i < 4; $i++) $a .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            for ($i = 0; $i < 4; $i++) $b .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            $check = self::luhnCheck($a . $b);
            $code = "BL-{$a}-{$b}-{$check}";
        } while (Package::where('package_code', $code)->exists());
        return $code;
    }

    public static function verifyCode(string $code): bool
    {
        // Format: BL-XXXX-XXXX-Y
        if (! preg_match('/^BL-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9])$/', strtoupper($code), $m)) return false;
        return self::luhnCheck($m[1] . $m[2]) === $m[3];
    }

    /**
     * Compute a Luhn-style check character over a 32-char alphabet so the
     * check digit lives in the same space as the body. Each char's index
     * in the alphabet is the "digit" — we double every other from the
     * right, sum the digits, take mod 32 and emit that index.
     */
    public static function luhnCheck(string $body): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $base     = strlen($alphabet);
        $sum      = 0;
        $reversed = strrev(strtoupper($body));
        for ($i = 0; $i < strlen($reversed); $i++) {
            $val = strpos($alphabet, $reversed[$i]);
            if ($val === false) return '0';
            if ($i % 2 === 0) {
                $val *= 2;
                if ($val >= $base) $val = (int) floor($val / $base) + ($val % $base);
            }
            $sum += $val;
        }
        $check = ($base - ($sum % $base)) % $base;
        return $alphabet[$check];
    }
}
