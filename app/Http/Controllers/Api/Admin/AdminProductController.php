<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Media;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Scopes\ExclusivityScope;
use App\Models\ProductImage;
use App\Models\ProductMedia;
use App\Models\ProductVariant;
use App\Models\VariantPrice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminProductController extends Controller
{
    /** Paginated list with light variant + catalogue stats. */
    public function index(Request $request)
    {
        $q = Product::withoutGlobalScope(ExclusivityScope::class)
            ->withCount('variants')
            ->with(['catalogues:id,name,handle', 'images' => fn ($qq) => $qq->orderBy('rank')->limit(1)])
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('title', 'like', "%{$term}%")
                       ->orWhere('handle', 'like', "%{$term}%");
                });
            })
            ->latest();

        $paginator = $q->paginate((int) min(60, max(10, (int) $request->query('limit', 25))));

        return [
            'products' => collect($paginator->items())->map(fn ($p) => [
                'id'         => $p->id,
                'title'      => $p->title,
                'handle'     => $p->handle,
                'thumbnail'  => $p->thumbnail ?: optional($p->images->first())->url,
                'status'     => $p->status,
                'variants_count' => $p->variants_count,
                'catalogues' => $p->catalogues->pluck('name'),
                'updated_at' => $p->updated_at?->toIso8601String(),
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
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->with(['variants.prices', 'images', 'media', 'options.values', 'catalogues:id,name,handle'])
            ->findOrFail($id);

        return ['product' => [
            'id'          => $product->id,
            'title'       => $product->title,
            'handle'      => $product->handle,
            'subtitle'    => $product->subtitle,
            'description' => $product->description,
            'thumbnail'   => $product->thumbnail,
            'status'      => $product->status,
            // Decides whether this product attracts a courier fee at all.
            'sourcing'    => $product->sourcing,
            'default_courier_id' => $product->default_courier_id,
            'catalogue_ids' => $product->catalogues->pluck('id'),
            'variants'    => $product->variants->map(fn ($v) => [
                'id'                 => $v->id,
                'title'              => $v->title,
                'sku'                => $v->sku,
                'inventory_quantity' => $v->inventory_quantity,
                'manage_inventory'   => (bool) $v->manage_inventory,
                'cost_price'         => $v->cost_price,
                'price'              => optional($v->prices->firstWhere('currency_code', 'usd'))->amount,
            ]),
            'images' => $product->images->map(fn ($i) => ['id' => $i->id, 'url' => $i->url, 'rank' => $i->rank]),
            'video'  => ($v = $product->media->firstWhere('media_type', 'video')) ? $this->videoShape($v) : null,
        ]];
    }

    /** Minimum-viable create: title + handle + (optional) catalogues + one variant. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'title'         => ['required', 'string', 'max:255'],
            'handle'        => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', Rule::unique('products', 'handle')],
            'subtitle'      => ['nullable', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'thumbnail'     => ['nullable', 'string'],
            'status'        => ['nullable', Rule::in(['draft', 'published'])],
            // 'local' stock is already in Zimbabwe and attracts no courier fee;
            // 'import' is carried in by a courier the buyer chooses and pays for.
            'sourcing'      => ['nullable', Rule::in(['local', 'import'])],
            'default_courier_id' => ['nullable', 'string'],
            'catalogue_ids' => ['nullable', 'array'],
            'catalogue_ids.*' => ['string', 'exists:catalogues,id'],
            'price'         => ['nullable', 'integer', 'min:0'], // cents
        ]);

        return DB::transaction(function () use ($data) {
            $product = Product::create([
                'id'          => 'prod_' . Str::random(16),
                'title'       => $data['title'],
                'handle'      => strtolower($data['handle']),
                'subtitle'    => $data['subtitle']    ?? null,
                'description' => $data['description'] ?? null,
                'thumbnail'   => $data['thumbnail']   ?? null,
                'status'      => $data['status']      ?? 'draft',
                'sourcing'    => $data['sourcing']    ?? 'local',
                'default_courier_id' => $data['default_courier_id'] ?? null,
            ]);
            if (! empty($data['catalogue_ids'])) {
                $product->catalogues()->sync($data['catalogue_ids']);
            }
            // Default-shape a single "One Size" variant so the product can sell.
            $variant = ProductVariant::create([
                'id'               => 'var_' . Str::random(16),
                'product_id'       => $product->id,
                'title'            => 'One Size',
                'sku'              => $product->handle . '-onesize',
                'manage_inventory' => true,
                'inventory_quantity' => 0,
            ]);
            if (isset($data['price'])) {
                VariantPrice::create([
                    'id'            => 'vpr_' . Str::random(12),
                    'variant_id'    => $variant->id,
                    'currency_code' => 'usd',
                    'amount'        => (int) $data['price'],
                ]);
            }
            return ['product' => $this->show($product->id)['product']];
        });
    }

    public function update(Request $request, string $id)
    {
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($id);
        $data = $request->validate([
            'title'         => ['sometimes', 'string', 'max:255'],
            'handle'        => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', Rule::unique('products', 'handle')->ignore($id)],
            'subtitle'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'description'   => ['sometimes', 'nullable', 'string'],
            'thumbnail'     => ['sometimes', 'nullable', 'string'],
            'status'        => ['sometimes', Rule::in(['draft', 'published'])],
            'sourcing'      => ['sometimes', Rule::in(['local', 'import'])],
            'default_courier_id' => ['sometimes', 'nullable', 'string'],
            'catalogue_ids' => ['sometimes', 'array'],
            'catalogue_ids.*' => ['string', 'exists:catalogues,id'],
        ]);
        if (isset($data['handle'])) $data['handle'] = strtolower($data['handle']);
        $cats = $data['catalogue_ids'] ?? null;
        unset($data['catalogue_ids']);

        DB::transaction(function () use ($product, $data, $cats) {
            $product->update($data);
            if ($cats !== null) $product->catalogues()->sync($cats);
        });

        return ['product' => $this->show($id)['product']];
    }

    public function destroy(string $id)
    {
        Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($id)->delete();
        return ['ok' => true];
    }

    // ─── Variants ───────────────────────────────────────────────────────

    public function storeVariant(Request $request, string $productId)
    {
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($productId);
        $data = $request->validate([
            'title'              => ['required', 'string', 'max:120'],
            'sku'                => ['nullable', 'string', 'max:120', Rule::unique('product_variants', 'sku')],
            'manage_inventory'   => ['nullable', 'boolean'],
            'inventory_quantity' => ['nullable', 'integer', 'min:0'],
            'cost_price'         => ['nullable', 'integer', 'min:0'],
            'price'              => ['nullable', 'integer', 'min:0'],
        ]);

        return DB::transaction(function () use ($product, $data) {
            $variant = ProductVariant::create([
                'id'                 => 'var_' . Str::random(16),
                'product_id'         => $product->id,
                'title'              => $data['title'],
                'sku'                => $data['sku'] ?? null,
                'manage_inventory'   => (bool) ($data['manage_inventory']   ?? true),
                'inventory_quantity' => (int)  ($data['inventory_quantity'] ?? 0),
                'cost_price'         => $data['cost_price'] ?? null,
            ]);
            if (isset($data['price'])) {
                VariantPrice::create([
                    'id'            => 'vpr_' . Str::random(12),
                    'variant_id'    => $variant->id,
                    'currency_code' => 'usd',
                    'amount'        => (int) $data['price'],
                ]);
            }
            return ['variant' => $variant];
        });
    }

    public function updateVariant(Request $request, string $productId, string $variantId)
    {
        $variant = ProductVariant::where('product_id', $productId)->where('id', $variantId)->firstOrFail();
        $data = $request->validate([
            'title'              => ['sometimes', 'string', 'max:120'],
            'sku'                => ['sometimes', 'nullable', 'string', 'max:120', Rule::unique('product_variants', 'sku')->ignore($variantId)],
            'manage_inventory'   => ['sometimes', 'boolean'],
            'inventory_quantity' => ['sometimes', 'integer', 'min:0'],
            'cost_price'         => ['sometimes', 'nullable', 'integer', 'min:0'],
            'price'              => ['sometimes', 'integer', 'min:0'],
        ]);
        $price = $data['price'] ?? null;
        unset($data['price']);

        DB::transaction(function () use ($variant, $data, $price) {
            $variant->update($data);
            if ($price !== null) {
                VariantPrice::updateOrCreate(
                    ['variant_id' => $variant->id, 'currency_code' => 'usd'],
                    ['id' => 'vpr_' . Str::random(12), 'amount' => (int) $price]
                );
            }
        });

        return ['variant' => $variant->fresh()];
    }

    public function destroyVariant(string $productId, string $variantId)
    {
        ProductVariant::where('product_id', $productId)->where('id', $variantId)->firstOrFail()->delete();
        return ['ok' => true];
    }

    // ─── Images ────────────────────────────────────────────────────────

    /**
     * POST /api/admin/products/{id}/images
     *
     * Accepts a multipart `image` upload. Stores it under storage/app/public/products/
     * (publicly served via /storage/products/...). Creates a shop_product_images
     * row and returns the saved URL + id.
     *
     * Sets the saved URL as the product's thumbnail if no thumbnail is set yet.
     */
    public function uploadImage(Request $request, string $productId)
    {
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($productId);

        // When PHP rejects the upload pre-Laravel (file > upload_max_filesize
        // or post_max_size), $_FILES is empty and the request body is gone.
        // The default validation error is "The image failed to upload",
        // which isn't actionable. Sniff the limit ourselves and return a
        // friendly message that points at the actual problem.
        $upload = $request->files->get('image');
        if ($upload && ! $upload->isValid()) {
            $err  = $upload->getErrorMessage();
            $limit = ini_get('upload_max_filesize') ?: '?';
            return response()->json([
                'error' => "Upload failed: {$err} (server limit: upload_max_filesize = {$limit}).",
            ], 422);
        }

        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:20480'], // 20 MB
        ]);

        $url = Media::upload($request->file('image'), 'products');

        $maxRank = (int) ProductImage::where('product_id', $product->id)->max('rank');
        $image = ProductImage::create([
            'id'         => 'img_' . Str::random(16),
            'product_id' => $product->id,
            'url'        => $url,
            'rank'       => $maxRank + 1,
        ]);

        // Promote the first uploaded image to the product thumbnail.
        if (! $product->thumbnail) {
            $product->update(['thumbnail' => $url]);
        }

        return [
            'image' => [
                'id'   => $image->id,
                'url'  => $image->url,
                'rank' => $image->rank,
            ],
        ];
    }

    public function destroyImage(string $productId, string $imageId)
    {
        $image = ProductImage::where('product_id', $productId)->where('id', $imageId)->firstOrFail();
        // Remove the file too. Media ignores any URL that isn't one of ours
        // (a product image can also be an external link).
        Media::delete($image->url);
        $image->delete();
        return ['ok' => true];
    }

    /** Reorder images for the product (drag-and-drop persistence). */
    public function reorderImages(Request $request, string $productId)
    {
        $data = $request->validate([
            'order'   => ['required', 'array'],
            'order.*' => ['string'],
        ]);
        foreach ($data['order'] as $i => $imageId) {
            ProductImage::where('product_id', $productId)->where('id', $imageId)
                ->update(['rank' => $i]);
        }
        return ['ok' => true];
    }

    /**
     * POST /api/admin/products/{id}/video
     * Either a `video` file upload or a `youtube_url`. One video per product —
     * setting a new one replaces the old (and deletes the old uploaded file).
     */
    public function setVideo(Request $request, string $id)
    {
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($id);
        $data = $request->validate([
            'video'       => ['required_without:youtube_url', 'nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime', 'max:102400'], // 100 MB
            'youtube_url' => ['required_without:video', 'nullable', 'string', 'max:500'],
        ]);

        if ($request->hasFile('video')) {
            $mediaUrl   = Media::upload($request->file('video'), 'products/videos');
            $sourceKind = 'upload';
            $meta       = null;
            $thumb      = null;
        } else {
            $ytId = $this->youtubeId((string) $data['youtube_url']);
            if (! $ytId) {
                return response()->json(['error' => "That doesn't look like a valid YouTube link."], 422);
            }
            $mediaUrl   = $data['youtube_url'];
            $sourceKind = 'youtube';
            $meta       = ['youtube_id' => $ytId];
            $thumb      = "https://img.youtube.com/vi/{$ytId}/hqdefault.jpg";
        }

        $this->removeVideoMedia($product->id);

        $media = ProductMedia::create([
            'id'              => 'pmed_' . Str::random(16),
            'product_id'      => $product->id,
            'media_type'      => 'video',
            'media_url'       => $mediaUrl,
            'thumbnail_url'   => $thumb,
            'source_kind'     => $sourceKind,
            'generation_meta' => $meta,
            'status'          => 'ready',
            'position'        => 0,
        ]);

        return ['video' => $this->videoShape($media)];
    }

    /** DELETE /api/admin/products/{id}/video */
    public function destroyVideo(string $id)
    {
        $this->removeVideoMedia($id);
        return ['ok' => true];
    }

    private function removeVideoMedia(string $productId): void
    {
        foreach (ProductMedia::where('product_id', $productId)->where('media_type', 'video')->get() as $m) {
            if ($m->source_kind === 'upload') Media::delete($m->media_url);
            $m->delete();
        }
    }

    /** Accepts watch?v=, youtu.be/, shorts/ and embed/ URL forms. */
    private function youtubeId(string $url): ?string
    {
        return preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)([A-Za-z0-9_-]{6,20})~', $url, $m)
            ? $m[1]
            : null;
    }

    private function videoShape(ProductMedia $m): array
    {
        $ytId = $m->generation_meta['youtube_id'] ?? null;
        return [
            'kind'       => $m->source_kind === 'youtube' ? 'youtube' : 'upload',
            'url'        => $m->media_url,
            'thumbnail'  => $m->thumbnail_url,
            'youtube_id' => $ytId,
            'embed_url'  => $ytId ? "https://www.youtube-nocookie.com/embed/{$ytId}" : null,
        ];
    }
}
