<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\Product;
use App\Models\Scopes\ExclusivityScope;
use App\Services\AffiliatePricing;
use App\Services\Exclusivity;
use App\Services\Messages;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Everything an affiliate does to run their own shop: browse the catalogue,
 * choose a line, price it, buy exclusivity, request stock, and talk to admin.
 *
 * All of it is scoped to the signed-in customer's own affiliate record — an
 * affiliate id is never taken from the request.
 */
class AffiliateStorefrontController extends Controller
{
    /** The affiliate for the signed-in customer, or null. */
    private function me(): ?Affiliate
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return null;

        return Affiliate::where('customer_id', $customer->id)->first();
    }

    private function mustBeActive(): Affiliate
    {
        $a = $this->me();
        if (! $a) abort(response()->json(['error' => 'You are not an affiliate.'], 404));
        if ($a->status !== 'active') {
            abort(response()->json(['error' => 'Your affiliate account is not active yet.'], 403));
        }
        return $a;
    }

    /**
     * GET /api/account/affiliate/gallery
     *
     * Everything BLESSLUXE sells, with base prices, what this affiliate has
     * already picked, and what their customers would pay.
     */
    public function gallery(Request $request)
    {
        $me = $this->mustBeActive();

        $mine = DB::table('affiliate_products')
            ->where('affiliate_id', $me->id)
            ->get()
            ->keyBy('product_id');

        $q = Product::withoutGlobalScope(ExclusivityScope::class)
            ->where('status', 'published')
            ->with([
                'variants.prices',
                'catalogues:id,name',
                // Hover video, same source the main shop uses.
                'media' => fn ($m) => $m->where('media_type', 'video')->orderBy('position'),
            ])
            ->when($request->query('q'), fn ($qq, $term) => $qq->where('title', 'like', "%{$term}%"))
            ->when($request->query('catalogue'), fn ($qq, $c) => $qq
                ->whereHas('catalogues', fn ($qc) => $qc->where('catalogues.id', $c)))
            ->orderBy('title');

        $paginator = $q->paginate((int) min(60, max(12, (int) $request->query('limit', 24))));

        return [
            'products' => collect($paginator->items())->map(function (Product $p) use ($me, $mine) {
                $base  = (int) (optional($p->variants->first()?->prices->first())->amount ?? 0);
                $row   = $mine->get($p->id);
                $price = AffiliatePricing::priceFor($me, $p->id, $base);
                $holder = Exclusivity::holderOf($p->id);

                return [
                    'id'         => $p->id,
                    'title'      => $p->title,
                    'handle'     => $p->handle,
                    'thumbnail'  => $p->thumbnail,
                    'catalogues' => $p->catalogues->pluck('name'),
                    'base_price' => $base,
                    'base_label' => '$' . number_format($base / 100, 2),
                    'video'      => $this->videoShape($p),
                    // Sizes and stock, shown only here — an affiliate deciding
                    // what to carry needs to know what can actually be supplied.
                    'variants'   => $p->variants->map(fn ($v) => [
                        'id'        => $v->id,
                        'title'     => $v->title,
                        'sku'       => $v->sku,
                        'tracked'   => (bool) $v->manage_inventory,
                        'stock'     => (int) $v->inventory_quantity,
                        // Untracked variants are made-to-order, so "0" would be
                        // misleading rather than informative.
                        'in_stock'  => ! $v->manage_inventory || $v->inventory_quantity > 0,
                    ])->values(),
                    'total_stock' => (int) $p->variants->sum(fn ($v) => $v->manage_inventory ? $v->inventory_quantity : 0),
                    'any_tracked' => $p->variants->contains(fn ($v) => (bool) $v->manage_inventory),
                    // What this affiliate's customers would pay today.
                    'your_price_label' => '$' . number_format($price['total'] / 100, 2),
                    'markup_label'     => $price['markup'] > 0 ? '+$' . number_format($price['markup'] / 100, 2) : null,
                    'selected'     => (bool) $row?->is_active,
                    'markup_type'  => $row->markup_type ?? null,
                    'markup_value' => $row->markup_value ?? null,
                    // Exclusivity, from this affiliate's point of view.
                    'exclusivity'  => [
                        'offered'    => (bool) $p->exclusivity_enabled && $p->exclusivity_fee,
                        'fee_label'  => $p->exclusivity_fee ? '$' . number_format($p->exclusivity_fee / 100, 2) : null,
                        'term_days'  => (int) $p->exclusivity_term_days,
                        'min_units'  => (int) $p->exclusivity_min_units,
                        'held_by_me' => $holder && $holder->affiliate_id === $me->id,
                        'held'       => (bool) $holder,
                    ],
                ];
            })->values(),
            'pagination' => [
                'page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
            'catalogues' => DB::table('catalogues')->orderBy('name')->get(['id', 'name']),
        ];
    }

    /**
     * Hover video, matching the shape ProductCard already understands so the
     * gallery behaves like the main shop rather than inventing its own.
     */
    private function videoShape(Product $p): ?array
    {
        $m = $p->relationLoaded('media')
            ? $p->media->first(fn ($x) => $x->media_type === 'video' && $x->status === 'ready')
            : null;
        if (! $m) return null;

        $ytId = $m->generation_meta['youtube_id'] ?? null;

        return [
            'kind'      => $m->source_kind === 'youtube' ? 'youtube' : 'upload',
            'url'       => $m->media_url,
            'thumbnail' => $m->thumbnail_url,
            'embed_url' => $ytId ? "https://www.youtube-nocookie.com/embed/{$ytId}" : null,
        ];
    }

    /** GET /api/account/affiliate/storefront — current settings + line. */
    public function storefront()
    {
        $me = $this->mustBeActive();

        return [
            'storefront' => [
                'mode'  => $me->storefront_mode,
                'title' => $me->storefront_title,
                'intro' => $me->storefront_intro,
                'default_markup_type'  => $me->default_markup_type,
                'default_markup_value' => $me->default_markup_value,
                'share_url' => url('/affiliate/shop/' . strtolower((string) $me->code)),
                'product_count' => DB::table('affiliate_products')
                    ->where('affiliate_id', $me->id)->where('is_active', true)->count(),
            ],
            'category_markups' => DB::table('affiliate_category_markups')
                ->join('catalogues', 'catalogues.id', '=', 'affiliate_category_markups.catalogue_id')
                ->where('affiliate_id', $me->id)
                ->get(['affiliate_category_markups.*', 'catalogues.name as catalogue_name']),
            'exclusives' => Exclusivity::forAffiliate($me->id),
        ];
    }

    /** PUT /api/account/affiliate/storefront */
    public function updateStorefront(Request $request)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'mode'  => ['sometimes', 'in:all,curated'],
            'title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'intro' => ['sometimes', 'nullable', 'string', 'max:500'],
            'default_markup_type'  => ['sometimes', 'nullable', 'in:percent,amount'],
            'default_markup_value' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
        ]);

        $patch = [];
        foreach (['mode' => 'storefront_mode', 'title' => 'storefront_title', 'intro' => 'storefront_intro'] as $in => $col) {
            if (array_key_exists($in, $data)) $patch[$col] = $data[$in];
        }
        foreach (['default_markup_type', 'default_markup_value'] as $k) {
            if (array_key_exists($k, $data)) $patch[$k] = $data[$k];
        }

        $me->update($patch);

        return $this->storefront();
    }

    /**
     * PUT /api/account/affiliate/products/{productId}
     * { selected, markup_type, markup_value }
     */
    public function setProduct(Request $request, string $productId)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'selected'     => ['sometimes', 'boolean'],
            'markup_type'  => ['sometimes', 'nullable', 'in:percent,amount'],
            'markup_value' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
        ]);

        $product = Product::withoutGlobalScope(ExclusivityScope::class)->find($productId);
        if (! $product) return response()->json(['error' => 'Product not found.'], 404);

        // Another affiliate's exclusive can't be added to a line.
        if (! Exclusivity::canSell($productId, $me)) {
            return response()->json(['error' => 'Another affiliate holds this piece exclusively.'], 409);
        }

        $existing = DB::table('affiliate_products')
            ->where('affiliate_id', $me->id)->where('product_id', $productId)->first();

        $row = [
            'affiliate_id' => $me->id,
            'product_id'   => $productId,
            'is_active'    => $data['selected'] ?? ($existing->is_active ?? true),
            'markup_type'  => array_key_exists('markup_type', $data) ? $data['markup_type'] : ($existing->markup_type ?? null),
            'markup_value' => array_key_exists('markup_value', $data) ? $data['markup_value'] : ($existing->markup_value ?? null),
            'updated_at'   => now(),
        ];

        if ($existing) {
            DB::table('affiliate_products')->where('id', $existing->id)->update($row);
        } else {
            DB::table('affiliate_products')->insert($row + ['id' => 'afp_' . Str::random(16), 'created_at' => now()]);
        }

        $base = (int) (optional($product->variants()->with('prices')->first()?->prices->first())->amount ?? 0);
        $price = AffiliatePricing::priceFor($me->fresh(), $productId, $base);

        return [
            'product_id'       => $productId,
            'selected'         => (bool) $row['is_active'],
            'your_price_label' => '$' . number_format($price['total'] / 100, 2),
            'markup_label'     => $price['markup'] > 0 ? '+$' . number_format($price['markup'] / 100, 2) : null,
        ];
    }

    /** PUT /api/account/affiliate/category-markups/{catalogueId} */
    public function setCategoryMarkup(Request $request, string $catalogueId)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'markup_type'  => ['nullable', 'in:percent,amount'],
            'markup_value' => ['nullable', 'integer', 'min:0', 'max:1000000'],
        ]);

        // Clearing a rule falls back to the storefront default.
        if (empty($data['markup_type']) || empty($data['markup_value'])) {
            DB::table('affiliate_category_markups')
                ->where('affiliate_id', $me->id)->where('catalogue_id', $catalogueId)->delete();
        } else {
            DB::table('affiliate_category_markups')->updateOrInsert(
                ['affiliate_id' => $me->id, 'catalogue_id' => $catalogueId],
                [
                    'id' => 'acm_' . Str::random(16),
                    'markup_type' => $data['markup_type'],
                    'markup_value' => $data['markup_value'],
                    'updated_at' => now(), 'created_at' => now(),
                ],
            );
        }

        return $this->storefront();
    }

    /** POST /api/account/affiliate/exclusivity/{productId} — begin a purchase. */
    public function buyExclusivity(string $productId)
    {
        $me = $this->mustBeActive();

        try {
            $started = Exclusivity::beginPurchase($productId, $me);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return [
            'exclusivity' => $started,
            // Payment is wired through Paynow next; until then admin can activate.
            'next' => 'payment',
        ];
    }

    // ─── Product requests ───────────────────────────────────────────────

    /** GET|POST /api/account/affiliate/requests */
    public function requests()
    {
        $me = $this->mustBeActive();

        return ['requests' => DB::table('affiliate_product_requests')
            ->where('affiliate_id', $me->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($r) => (array) $r + ['images' => json_decode((string) $r->images, true) ?: []])];
    }

    public function storeRequest(Request $request)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'title'    => ['required', 'string', 'max:160'],
            'note'     => ['nullable', 'string', 'max:2000'],
            'images'   => ['nullable', 'array', 'max:6'],
            'images.*' => ['image', 'max:6144'],
        ]);

        $paths = [];
        foreach ($request->file('images', []) as $file) {
            $name = 'req_' . Str::random(18) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads/affiliate-requests'), $name);
            $paths[] = '/uploads/affiliate-requests/' . $name;
        }

        $id = 'apr_' . Str::random(16);
        DB::table('affiliate_product_requests')->insert([
            'id' => $id, 'affiliate_id' => $me->id,
            'title' => $data['title'], 'note' => $data['note'] ?? null,
            'images' => json_encode($paths), 'status' => 'pending',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        // Post it into the conversation so admin sees it where they reply.
        Messages::post($me->id, 'affiliate', 'cust_' . Auth::guard('customer')->id(),
            "Product request: {$data['title']}" . ($data['note'] ? "\n\n{$data['note']}" : ''),
            $paths, $id);

        Notifications::forAllAdmins(
            'affiliate_product_request',
            'Affiliate product request',
            "{$me->code} asked about: {$data['title']}",
            '/admin/affiliates',
        );

        return ['request_id' => $id] + $this->requests();
    }

    // ─── Inbox ──────────────────────────────────────────────────────────

    /** GET /api/account/affiliate/messages */
    /**
     * Acknowledge the other side's messages without refetching the thread.
     *
     * Called when a message lands over the socket while the tab is actually
     * visible. Without it, reading is only ever recorded by the next full poll,
     * which is 30s once realtime connects — so the admin watches a single tick
     * long after their message was read.
     */
    public function markMessagesRead()
    {
        $me = $this->mustBeActive();

        return ['marked' => Messages::markRead($me->id, 'affiliate')];
    }

    /**
     * The thread, in three shapes (see Messages::window):
     *
     *   (none)      newest window — opening the inbox
     *   ?before=ID  the window older than ID — scrolling back
     *   ?after=ID   only what is newer than ID — the poll. Usually empty.
     *
     * `peek=1` reads without marking anything read. The poll keeps running in
     * a background tab, and a tab nobody is looking at must not tell the other
     * side their message was seen.
     */
    public function messages(Request $request)
    {
        $me = $this->mustBeActive();

        $before = $request->query('before');
        $after  = $request->query('after');

        // Only an OPEN needs to know where the unread began; a poll or a
        // scrollback never redraws that line, so they don't pay for the lookup.
        // Order matters: the boundary has to be read before markRead erases it.
        $unread = ($before || $after)
            ? ['id' => null, 'count' => 0]
            : Messages::unreadBoundary($me->id, 'affiliate');

        if (! $request->boolean('peek') && ! $before) {
            Messages::markRead($me->id, 'affiliate');
        }

        return Messages::window($me->id, $before, $after) + [
            // The realtime channel name is derived from this.
            'affiliate_id'    => $me->id,
            'first_unread_id' => $unread['id'],
            'unread_count'    => $unread['count'],
            // Ticks, for clients with no socket: my newest message they've read.
            'read_upto_id'    => Messages::readUpto($me->id, 'affiliate'),
        ];
    }

    /**
     * What an "@" in the composer searches: the catalogue, by tab and text.
     * Scoped to what THIS affiliate may see — see MessageRefs.
     */
    public function mentions(Request $request)
    {
        $me = $this->mustBeActive();

        return \App\Services\MessageRefs::search(
            $me, false,
            (string) $request->query('tab', 'all'),
            $request->query('q'),
            (int) $request->query('page', 1),
        );
    }

    public function sendMessage(Request $request)
    {
        $me = $this->mustBeActive();

        $data = $request->validate(Messages::sendRules());
        $refs = \App\Services\MessageRefs::resolve(Messages::refsFromRequest($request), $me, false);
        $paths = Messages::storeImages($request->file('images', []));
        $body = trim((string) ($data['body'] ?? ''));

        // Every ref the client sent was dropped (unknown / not theirs to see)
        // and there was nothing else — don't save an empty bubble.
        if ($body === '' && ! $paths && ! $refs) {
            return response()->json(['error' => 'That message was empty.'], 422);
        }

        $id = Messages::post($me->id, 'affiliate', 'cust_' . Auth::guard('customer')->id(), $body, $paths, null, $refs);
        $data['body'] = Messages::preview($body, $paths, $refs, 120);

        // One bell per unread burst, not per message. Each notification is a
        // row for EVERY admin, so someone typing ten short messages would
        // otherwise write ten rows per staff member to say one thing: "this
        // thread is waiting". The first unread message says it; the rest are
        // already covered until an admin reads the thread.
        if (Messages::unreadFor($me->id, 'admin') === 1) {
            Notifications::forAllAdmins(
                'affiliate_message',
                "Message from {$me->code}",
                $data['body'],
                "/admin/affiliate-inbox/{$me->id}",
            );
        }

        // Just the new message. Returning the whole thread made every send
        // cost as much as the conversation was long.
        return ['message' => Messages::find($id)];
    }
}
