<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Public, cache-friendly storefront content endpoints. The hero slider and
 * the FAQ page both read here.
 */
class ContentController extends Controller
{
    /**
     * GET /api/store/announcements?position=hero|top_bar
     *
     * Only returns active rows in their date window, ordered by sort_order.
     */
    public function announcements(Request $request)
    {
        $position = (string) $request->query('position', 'hero');
        $rows = Announcement::query()
            ->where('position', $position)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderBy('sort_order')
            ->get();
        return [
            'announcements' => $rows->map(fn ($a) => [
                'id'         => $a->id,
                'position'   => $a->position,
                'media_type' => $a->media_type,
                'media_url'  => $a->media_url,
                'poster_url' => $a->poster_url,
                'heading'    => $a->heading,
                'subheading' => $a->subheading,
                'cta_label'  => $a->cta_label,
                'cta_href'   => $a->cta_href,
                'text_align' => $a->text_align,
                'sort_order' => $a->sort_order,
            ]),
        ];
    }

    /**
     * GET /api/store/faqs
     *
     * Customer-facing FAQ list, grouped by category.
     */
    public function faqs()
    {
        $rows = DB::table('faqs')
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('sort_order')
            ->get(['id', 'question', 'answer', 'category', 'sort_order']);

        $byCategory = $rows->groupBy(fn ($r) => $r->category ?: 'General')
            ->map(fn ($items, $cat) => [
                'category' => $cat,
                'faqs'     => $items->map(fn ($r) => [
                    'id'       => $r->id,
                    'question' => $r->question,
                    'answer'   => $r->answer,
                ])->values(),
            ])->values();

        return ['groups' => $byCategory];
    }
}
