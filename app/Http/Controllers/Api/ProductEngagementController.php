<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\ProductEngagement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * What shoppers say about a product. Reading is public — a rating nobody can
 * see is worth nothing — while rating, hearting and commenting need an account,
 * because they pay Bees and have to be attributable.
 */
class ProductEngagementController extends Controller
{
    /** GET /api/store/products/{handle}/engagement */
    public function show(Request $request, string $handle)
    {
        $product = $this->find($handle);
        if (! $product) return response()->json(['error' => 'Not found'], 404);

        $customer = Auth::guard('customer')->user();
        $page = ProductEngagement::comments($product->id, [
            'stars' => $request->query('stars'),
            'sort'  => (string) $request->query('sort', 'recent'),
            'page'  => (int) $request->query('page', 1),
            'limit' => (int) $request->query('limit', 10),
        ]);

        return [
            'summary'  => ProductEngagement::summary($product->id, $customer?->id),
            'comments' => $this->mine($page['comments'], $customer?->id),
            'total'    => $page['total'],
            'page'     => $page['page'],
            'has_more' => $page['has_more'],
            'sorts'    => ProductEngagement::SORTS,
            'remaining_today' => $customer ? ProductEngagement::remainingToday($customer->id) : null,
        ];
    }

    /** POST /api/account/products/{handle}/rating  { stars } */
    public function rate(Request $request, string $handle)
    {
        $product = $this->find($handle);
        if (! $product) return response()->json(['error' => 'Not found'], 404);

        $data = $request->validate(['stars' => ['required', 'integer', 'min:1', 'max:5']]);
        $customer = $this->mustBeSignedIn();
        $paid = ProductEngagement::rate($customer->id, $product->id, (int) $data['stars']);

        return $this->state($product, $customer, $paid['bees']);
    }

    /** POST /api/account/products/{handle}/like */
    public function like(string $handle)
    {
        $product = $this->find($handle);
        if (! $product) return response()->json(['error' => 'Not found'], 404);

        $customer = $this->mustBeSignedIn();
        $r = ProductEngagement::toggleLike($customer->id, $product->id);

        return $this->state($product, $customer, $r['bees']);
    }

    /** POST /api/account/products/{handle}/comments  { body } */
    public function comment(Request $request, string $handle)
    {
        $product = $this->find($handle);
        if (! $product) return response()->json(['error' => 'Not found'], 404);

        $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $customer = $this->mustBeSignedIn();
        $r = ProductEngagement::comment($customer->id, $product->id, (string) $request->input('body'));
        if (is_string($r)) return response()->json(['error' => $r], 422);

        return $this->state($product, $customer, $r['bees']) + ['comment' => $r['comment']];
    }

    /** DELETE /api/account/product-comments/{id} */
    public function destroy(string $id)
    {
        $customer = $this->mustBeSignedIn();

        return ProductEngagement::deleteComment($customer->id, $id)
            ? ['ok' => true]
            : response()->json(['error' => 'Not found'], 404);
    }

    /** GET /api/store/products/trending */
    public function trending(Request $request)
    {
        $limit = min(24, max(1, (int) $request->query('limit', 8)));
        $ids = ProductEngagement::trendingIds($limit);
        if (! $ids) return ['products' => []];

        // Hand the ids to the product controller so pricing, exclusivity and the
        // affiliate shop's scoping are applied exactly as they are everywhere else.
        return app(ProductController::class)->byIds($ids);
    }

    // ─── Shared ────────────────────────────────────────────────────────────

    /** `/api/account` is only the `web` group — every controller here checks for itself. */
    private function mustBeSignedIn()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));

        return $customer;
    }

    private function find(string $handle): ?Product
    {
        return Product::where('handle', $handle)->orWhere('id', $handle)->first();
    }

    /** The whole answer after an action: what changed, and what it earned. */
    private function state(Product $product, $customer, int $bees): array
    {
        return [
            'summary'   => ProductEngagement::summary($product->id, $customer->id),
            'bees'      => $bees,
            'balance'   => (int) $customer->fresh()->loyalty_points,
            'remaining_today' => ProductEngagement::remainingToday($customer->id),
        ];
    }

    /** Only the author may be told a comment is theirs (it's what shows Delete). */
    private function mine(array $comments, ?string $customerId): array
    {
        return array_map(function ($c) use ($customerId) {
            $c['mine'] = $customerId !== null && $c['customer_id'] === $customerId;
            unset($c['customer_id']);

            return $c;
        }, $comments);
    }
}
