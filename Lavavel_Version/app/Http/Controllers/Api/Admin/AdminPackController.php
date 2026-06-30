<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PackCampaign;
use App\Models\PackDefinition;
use App\Models\PackSlot;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Admin endpoints for pack management. Two surfaces:
 *
 *   Definitions  — the "what's in the pack" template (single product or
 *                  a curated merge of multiple).
 *   Campaigns    — an instance of a definition being sold via a short
 *                  public_code at /shop/packs/{code}. Slots are minted
 *                  from the chosen product's variants when launched.
 */
class AdminPackController extends Controller
{
    // ─── Definitions ───────────────────────────────────────────────────

    public function indexDefinitions()
    {
        return [
            'definitions' => PackDefinition::query()
                ->with(['legacyProduct:id,title,handle', 'products:id,title,handle'])
                ->withCount('campaigns')
                ->latest()
                ->get()
                ->map(fn ($d) => $this->shapeDefinition($d)),
        ];
    }

    public function storeDefinition(Request $request)
    {
        $data = $request->validate([
            'title'       => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'pack_kind'   => ['required', Rule::in(['single', 'merge'])],
            'status'      => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'product_id'  => ['required_if:pack_kind,single', 'nullable', 'string', 'exists:products,id'],
            'product_ids' => ['required_if:pack_kind,merge', 'array', 'min:1'],
            'product_ids.*' => ['string', 'exists:products,id'],
        ]);

        $id     = 'pdef_' . Str::random(16);
        $handle = Str::slug($data['title']) . '-' . substr($id, -6);
        $kind   = $data['pack_kind'];

        return DB::transaction(function () use ($data, $id, $handle, $kind) {
            $def = PackDefinition::create([
                'id'          => $id,
                'product_id'  => $kind === 'single' ? $data['product_id'] : null,
                'pack_kind'   => $kind,
                'title'       => $data['title'],
                'handle'      => $handle,
                'description' => $data['description'] ?? null,
                'status'      => $data['status'] ?? 'draft',
            ]);

            if ($kind === 'merge') {
                foreach ($data['product_ids'] as $i => $pid) {
                    DB::table('pack_definition_product')->insert([
                        'id'                 => 'pdp_' . Str::random(16),
                        'pack_definition_id' => $def->id,
                        'product_id'         => $pid,
                        'position'           => $i,
                        'created_at'         => now(),
                    ]);
                }
            }
            return ['definition' => $this->shapeDefinition(
                $def->load(['legacyProduct:id,title,handle', 'products:id,title,handle'])->loadCount('campaigns')
            )];
        });
    }

    public function destroyDefinition(string $id)
    {
        $def = PackDefinition::findOrFail($id);
        // Cascade: also mark its open campaigns as cancelled so they don't
        // accept new reservations after the template's been pulled.
        $def->delete();
        PackCampaign::where('pack_definition_id', $id)
            ->where('status', 'open')
            ->update(['status' => 'cancelled', 'updated_at' => now()]);
        return ['ok' => true];
    }

    // ─── Campaigns ─────────────────────────────────────────────────────

    public function indexCampaigns()
    {
        return [
            'campaigns' => PackCampaign::query()
                ->with(['definition:id,title,handle,pack_kind'])
                ->withCount([
                    'slots',
                    'slots as slots_available' => fn ($q) => $q->where('status', 'available'),
                    'slots as slots_paid'      => fn ($q) => $q->where('status', 'paid'),
                ])
                ->latest()
                ->get()
                ->map(fn ($c) => $this->shapeCampaign($c)),
        ];
    }

    /**
     * POST /api/admin/packs/campaigns
     * { pack_definition_id, title?, expires_at? }
     *
     * Mints one pack_slot per variant of the underlying product(s).
     */
    public function launchCampaign(Request $request)
    {
        $data = $request->validate([
            'pack_definition_id' => ['required', 'string', 'exists:pack_definitions,id'],
            'title'              => ['nullable', 'string', 'max:140'],
            'expires_at'         => ['nullable', 'date'],
        ]);

        $def = PackDefinition::with('products:id', 'legacyProduct:id')->findOrFail($data['pack_definition_id']);

        // Collect every variant from the pack's product(s) — these become slots.
        $productIds = $def->pack_kind === 'single'
            ? array_filter([$def->product_id])
            : $def->products->pluck('id')->all();
        $variants = ProductVariant::whereIn('product_id', $productIds)
            ->orderBy('product_id')->orderBy('created_at')->get();
        if ($variants->isEmpty()) {
            return response()->json(['error' => 'Pack definition has no purchasable variants.'], 422);
        }

        return DB::transaction(function () use ($def, $data, $variants) {
            $campaignId = 'pcam_' . Str::random(16);
            $publicCode = $this->makePublicCode();
            $campaign = PackCampaign::create([
                'id'                 => $campaignId,
                'pack_definition_id' => $def->id,
                'host_kind'          => 'admin',
                'public_code'        => $publicCode,
                'status'             => 'open',
                'title'              => $data['title'] ?? ($def->title . ' drop'),
                'expires_at'         => $data['expires_at'] ?? null,
            ]);

            foreach ($variants as $v) {
                PackSlot::create([
                    'id'              => 'pslot_' . Str::random(16),
                    'pack_campaign_id' => $campaignId,
                    'variant_id'      => $v->id,
                    'size_label'      => $v->title,
                    'status'          => 'available',
                ]);
            }

            return [
                'campaign'    => $this->shapeCampaign(
                    $campaign->load(['definition:id,title,handle,pack_kind'])
                        ->loadCount([
                            'slots',
                            'slots as slots_available' => fn ($q) => $q->where('status', 'available'),
                            'slots as slots_paid'      => fn ($q) => $q->where('status', 'paid'),
                        ])
                ),
                'public_code' => $publicCode,
            ];
        });
    }

    public function cancelCampaign(string $id)
    {
        $campaign = PackCampaign::findOrFail($id);
        $campaign->update(['status' => 'cancelled']);
        // Release any live reservations so customers don't see frozen carts.
        PackSlot::where('pack_campaign_id', $id)
            ->where('status', 'reserved')
            ->update([
                'status'        => 'available',
                'customer_id'   => null,
                'reserved_until' => null,
                'updated_at'    => now(),
            ]);
        return ['ok' => true];
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private function shapeDefinition(PackDefinition $d): array
    {
        return [
            'id'          => $d->id,
            'title'       => $d->title,
            'handle'      => $d->handle,
            'description' => $d->description,
            'pack_kind'   => $d->pack_kind,
            'status'      => $d->status,
            'product_titles' => $d->pack_kind === 'single'
                ? array_filter([$d->legacyProduct?->title])
                : $d->products->pluck('title')->all(),
            'campaigns_count' => $d->campaigns_count ?? null,
            'created_at'      => $d->created_at?->toIso8601String(),
        ];
    }

    private function shapeCampaign(PackCampaign $c): array
    {
        return [
            'id'             => $c->id,
            'public_code'    => $c->public_code,
            'title'          => $c->title,
            'status'         => $c->status,
            'host_kind'      => $c->host_kind,
            'expires_at'     => $c->expires_at?->toIso8601String(),
            'created_at'     => $c->created_at?->toIso8601String(),
            'definition'     => $c->definition ? [
                'id'        => $c->definition->id,
                'title'     => $c->definition->title,
                'handle'    => $c->definition->handle,
                'pack_kind' => $c->definition->pack_kind,
            ] : null,
            'slots_total'     => $c->slots_count ?? null,
            'slots_available' => $c->slots_available ?? null,
            'slots_paid'      => $c->slots_paid ?? null,
        ];
    }

    /**
     * Short, human-friendly share code (10 chars, no ambiguous chars). Loops
     * until it gets one that isn't already taken — collisions are astro-
     * nomically unlikely but the check is cheap.
     */
    private function makePublicCode(): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 10; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (PackCampaign::where('public_code', $code)->exists());
        return $code;
    }
}
