<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductImage;
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
        $q = Product::query()
            ->withCount('variants')
            ->with(['catalogues:id,name,handle'])
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
        $product = Product::with(['variants.prices', 'images', 'options.values', 'catalogues:id,name,handle'])
            ->findOrFail($id);

        return ['product' => [
            'id'          => $product->id,
            'title'       => $product->title,
            'handle'      => $product->handle,
            'subtitle'    => $product->subtitle,
            'description' => $product->description,
            'thumbnail'   => $product->thumbnail,
            'status'      => $product->status,
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
        $product = Product::findOrFail($id);
        $data = $request->validate([
            'title'         => ['sometimes', 'string', 'max:255'],
            'handle'        => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', Rule::unique('products', 'handle')->ignore($id)],
            'subtitle'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'description'   => ['sometimes', 'nullable', 'string'],
            'thumbnail'     => ['sometimes', 'nullable', 'string'],
            'status'        => ['sometimes', Rule::in(['draft', 'published'])],
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
        Product::findOrFail($id)->delete();
        return ['ok' => true];
    }

    // ─── Variants ───────────────────────────────────────────────────────

    public function storeVariant(Request $request, string $productId)
    {
        $product = Product::findOrFail($productId);
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
        $product = Product::findOrFail($productId);

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

        $path = $request->file('image')->store('products', 'public');
        $url  = Storage::url($path);  // /storage/products/xxx.jpg

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
        // Try to remove the actual file too. URL is `/storage/products/foo.jpg`
        // so strip the /storage/ prefix to get the disk-relative path.
        if (str_starts_with($image->url, '/storage/')) {
            Storage::disk('public')->delete(substr($image->url, strlen('/storage/')));
        }
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
}
