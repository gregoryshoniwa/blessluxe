<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CartLineItem;
use App\Models\PackCampaign;
use App\Models\PackSlot;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Public pack endpoints — the customer-facing group-buy flow.
 *
 *   GET   /store/packs/{code}                — view a campaign + its slots
 *   POST  /store/packs/{code}/slots/{id}/reserve  — 10-minute hold
 *   POST  /store/packs/{code}/slots/{id}/release  — drop the hold
 *
 * Reservation creates a cart_line_item for the matching variant tagged
 * with the slot_id in metadata so the checkout flow can flip the slot to
 * `paid` once the order materialises.
 */
class PackController extends Controller
{
    public const RESERVATION_MINUTES = 10;

    /**
     * Sweeps expired reservations back to `available`. Runs on every read so
     * we don't need a cron — the storefront page itself heals the campaign.
     */
    private function reapExpired(string $campaignId): void
    {
        PackSlot::where('pack_campaign_id', $campaignId)
            ->where('status', 'reserved')
            ->whereNotNull('reserved_until')
            ->where('reserved_until', '<', now())
            ->update([
                'status'        => 'available',
                'customer_id'   => null,
                'reserved_until' => null,
                'updated_at'    => now(),
            ]);
    }

    /**
     * GET /api/store/packs
     *
     * Public catalogue of open campaigns. Closed/filled/cancelled campaigns
     * are hidden — they're stale conversion targets.
     */
    public function index()
    {
        $campaigns = PackCampaign::query()
            ->where('status', 'open')
            ->whereNull('deleted_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->with(['definition:id,title,handle,description,pack_kind'])
            ->withCount([
                'slots',
                'slots as slots_available' => fn ($q) => $q->where('status', 'available'),
                'slots as slots_paid'      => fn ($q) => $q->where('status', 'paid'),
            ])
            ->latest()
            ->get();

        return [
            'packs' => $campaigns->map(function (PackCampaign $c) {
                // Cherry-pick the first available slot's thumbnail as the
                // hero image so the listing tile has something to render.
                $firstSlot = $c->slots()
                    ->with('variant.product:id,thumbnail')
                    ->where('status', 'available')
                    ->first();
                return [
                    'public_code'    => $c->public_code,
                    'title'          => $c->title ?? $c->definition?->title,
                    'description'    => $c->definition?->description,
                    'thumbnail'      => optional($firstSlot?->variant?->product)->thumbnail,
                    'host_kind'      => $c->host_kind,
                    'expires_at'     => $c->expires_at?->toIso8601String(),
                    'slots_total'     => $c->slots_count,
                    'slots_available' => $c->slots_available,
                    'slots_paid'      => $c->slots_paid,
                ];
            }),
        ];
    }

    public function show(string $code)
    {
        $campaign = PackCampaign::query()
            ->where('public_code', strtoupper($code))
            ->whereNull('deleted_at')
            ->with(['definition'])
            ->first();
        if (! $campaign) {
            return response()->json(['error' => 'Pack not found.'], 404);
        }

        $this->reapExpired($campaign->id);

        $customerId = optional(Auth::guard('customer')->user())->id;

        $slots = PackSlot::query()
            ->where('pack_campaign_id', $campaign->id)
            ->with([
                'variant.product:id,title,handle,thumbnail',
                'variant.prices' => fn ($q) => $q->where('currency_code', 'usd'),
            ])
            ->orderBy('size_label')
            ->get()
            ->map(function (PackSlot $s) use ($customerId) {
                $price = optional($s->variant?->prices->first())->amount;
                return [
                    'id'            => $s->id,
                    'status'        => $s->status,
                    'is_mine'       => $customerId && $s->customer_id === $customerId,
                    'size_label'    => $s->size_label,
                    'reserved_until'=> $s->reserved_until?->toIso8601String(),
                    'product' => [
                        'id'        => $s->variant?->product?->id,
                        'title'     => $s->variant?->product?->title,
                        'handle'    => $s->variant?->product?->handle,
                        'thumbnail' => $s->variant?->product?->thumbnail,
                    ],
                    'variant' => [
                        'id'    => $s->variant?->id,
                        'title' => $s->variant?->title,
                        'price' => $price,
                        'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
                    ],
                ];
            });

        $totals = [
            'total'      => $slots->count(),
            'available'  => $slots->where('status', 'available')->count(),
            'reserved'   => $slots->where('status', 'reserved')->count(),
            'paid'       => $slots->where('status', 'paid')->count(),
        ];

        return [
            'campaign' => [
                'id'          => $campaign->id,
                'public_code' => $campaign->public_code,
                'title'       => $campaign->title,
                'status'      => $campaign->status,
                'host_kind'   => $campaign->host_kind,
                'expires_at'  => $campaign->expires_at?->toIso8601String(),
                'definition'  => $campaign->definition ? [
                    'title'       => $campaign->definition->title,
                    'description' => $campaign->definition->description,
                    'pack_kind'   => $campaign->definition->pack_kind,
                ] : null,
                'reservation_minutes' => self::RESERVATION_MINUTES,
            ],
            'totals' => $totals,
            'slots'  => $slots,
        ];
    }

    /**
     * Claim a slot for the signed-in customer for the next 10 minutes.
     * Atomic: takes a row lock on the slot so two simultaneous reserves
     * for the same slot don't both succeed. Adds the variant to the cart
     * with `metadata.pack_slot_id` so checkout knows to flip it to paid.
     */
    public function reserve(Request $request, string $code, string $slotId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in to reserve a slot.'], 401);
        }

        $campaign = PackCampaign::where('public_code', strtoupper($code))->whereNull('deleted_at')->first();
        if (! $campaign) return response()->json(['error' => 'Pack not found.'], 404);
        if ($campaign->status !== 'open') {
            return response()->json(['error' => 'Pack is no longer accepting reservations.'], 422);
        }

        $this->reapExpired($campaign->id);

        // abort(response()->json(...)) inside the transaction throws
        // HttpResponseException — DB::transaction rolls back, Laravel's
        // exception handler renders the JSON response. No try/catch needed.
        $result = DB::transaction(function () use ($slotId, $campaign, $customer, $request) {
            $slot = PackSlot::query()
                ->where('id', $slotId)
                ->where('pack_campaign_id', $campaign->id)
                ->lockForUpdate()
                ->first();
            if (! $slot) {
                abort(response()->json(['error' => 'Slot not found.'], 404));
            }
            $isMine = $slot->status === 'reserved' && $slot->customer_id === $customer->id;
            if ($slot->status !== 'available' && ! $isMine) {
                abort(response()->json(['error' => 'Sorry — someone else just claimed that slot.'], 409));
            }

            $slot->update([
                'status'         => 'reserved',
                'customer_id'    => $customer->id,
                'reserved_until' => now()->addMinutes(self::RESERVATION_MINUTES),
            ]);

            // Add (or upsert) a cart line for this slot so checkout sees it.
            $cartId = $request->session()->get('cart_id');
            if (! $cartId) {
                $cartId = 'cart_' . Str::random(20);
                DB::table('carts')->insert(['id' => $cartId, 'created_at' => now(), 'updated_at' => now()]);
                $request->session()->put('cart_id', $cartId);
            }

            $variant = ProductVariant::with(['prices' => fn ($q) => $q->where('currency_code', 'usd')])
                ->find($slot->variant_id);
            $unitPrice = (int) (optional($variant?->prices->first())->amount ?? 0);

            // One cart line per slot — keyed by slot_id, not just variant_id.
            $existing = DB::table('cart_line_items')
                ->where('cart_id', $cartId)
                ->whereRaw("JSON_EXTRACT(metadata, '$.pack_slot_id') = ?", [$slot->id])
                ->first();
            if (! $existing) {
                CartLineItem::create([
                    'id'         => 'cli_' . Str::random(20),
                    'cart_id'    => $cartId,
                    'variant_id' => $slot->variant_id,
                    'quantity'   => 1,
                    'unit_price' => $unitPrice,
                    'metadata'   => [
                        'pack_slot_id'     => $slot->id,
                        'pack_campaign_id' => $campaign->id,
                        'pack_public_code' => $campaign->public_code,
                    ],
                ]);
            }
            return ['slot' => $slot->fresh()];
        });

        return ['slot' => $result['slot'], 'reservation_minutes' => self::RESERVATION_MINUTES];
    }

    /** Release a slot the customer is currently holding. */
    public function release(Request $request, string $code, string $slotId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in to release a slot.'], 401);
        }

        $campaign = PackCampaign::where('public_code', strtoupper($code))->whereNull('deleted_at')->first();
        if (! $campaign) return response()->json(['error' => 'Pack not found.'], 404);

        DB::transaction(function () use ($slotId, $campaign, $customer, $request) {
            $slot = PackSlot::query()
                ->where('id', $slotId)
                ->where('pack_campaign_id', $campaign->id)
                ->where('customer_id', $customer->id)
                ->where('status', 'reserved')
                ->lockForUpdate()
                ->first();
            if (! $slot) return;
            $slot->update([
                'status'         => 'available',
                'customer_id'    => null,
                'reserved_until' => null,
            ]);
            // Drop the matching cart line.
            $cartId = $request->session()->get('cart_id');
            if ($cartId) {
                DB::table('cart_line_items')
                    ->where('cart_id', $cartId)
                    ->whereRaw("JSON_EXTRACT(metadata, '$.pack_slot_id') = ?", [$slot->id])
                    ->delete();
            }
        });

        return ['ok' => true];
    }

    /** Mark slot(s) paid + link them to an order line item. */
    public static function markPaidForOrder(string $orderId, array $items): void
    {
        // $items is the cart_snapshot items array — each may carry
        // metadata.pack_slot_id which we already passed through Paynow's
        // session. Flip each one to 'paid' and stamp the order link.
        foreach ($items as $it) {
            $slotId = $it['metadata']['pack_slot_id'] ?? null;
            if (! $slotId) continue;
            DB::table('pack_slots')
                ->where('id', $slotId)
                ->whereIn('status', ['reserved', 'available'])
                ->update([
                    'status'         => 'paid',
                    'order_id'       => $orderId,
                    'reserved_until' => null,
                    'updated_at'    => now(),
                ]);
        }
        // Promote the campaign to "filled" once every slot is paid.
        $touchedCampaigns = DB::table('pack_slots')
            ->whereIn('id', array_filter(array_map(fn ($it) => $it['metadata']['pack_slot_id'] ?? null, $items)))
            ->pluck('pack_campaign_id')
            ->unique();
        foreach ($touchedCampaigns as $campaignId) {
            $unpaid = DB::table('pack_slots')
                ->where('pack_campaign_id', $campaignId)
                ->where('status', '!=', 'paid')
                ->count();
            if ($unpaid === 0) {
                DB::table('pack_campaigns')
                    ->where('id', $campaignId)
                    ->update(['status' => 'filled', 'updated_at' => now()]);
            }
        }
    }
}
