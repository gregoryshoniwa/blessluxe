<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ProductReview;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminReviewController extends Controller
{
    public function index(Request $request)
    {
        $q = ProductReview::query()
            ->with('product:id,title,handle')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('title', 'like', "%{$term}%")
                       ->orWhere('content', 'like', "%{$term}%")
                       ->orWhere('customer_email', 'like', "%{$term}%");
                });
            })
            ->latest();

        $paginator = $q->paginate((int) min(100, max(10, (int) $request->query('limit', 25))));

        return [
            'reviews' => collect($paginator->items())->map(fn ($r) => [
                'id'             => $r->id,
                'product_id'     => $r->product_id,
                'product_title'  => $r->product?->title,
                'product_handle' => $r->product?->handle,
                'customer_email' => $r->customer_email,
                'customer_name'  => $r->customer_name,
                'title'          => $r->title,
                'content'        => $r->content,
                'rating'         => (int) $r->rating,
                'status'         => $r->status,
                'admin_response' => $r->admin_response,
                'created_at'     => $r->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * PUT /api/admin/reviews/{id}
     * { status?, admin_response? }
     */
    public function update(Request $request, string $id)
    {
        $review = ProductReview::findOrFail($id);
        $data = $request->validate([
            'status'         => ['sometimes', Rule::in(['pending', 'approved', 'rejected'])],
            'admin_response' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        $review->update($data);
        return ['review' => [
            'id'             => $review->id,
            'status'         => $review->status,
            'admin_response' => $review->admin_response,
        ]];
    }

    public function destroy(string $id)
    {
        ProductReview::findOrFail($id)->delete();
        return ['ok' => true];
    }
}
