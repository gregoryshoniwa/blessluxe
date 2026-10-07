<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Services\AI\GeminiService;
use App\Services\QuickSeries;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/** Admin → Quick process → Series: a supplier's post to a live series in one form. */
class QuickSeriesController extends Controller
{
    /** GET /api/admin/quick/series/options */
    public function options()
    {
        return [
            'catalogues' => QuickSeries::catalogues(),
            'suppliers'  => Supplier::orderBy('name')->get(['id', 'name', 'phone', 'link', 'country']),
            'origins'    => collect(QuickSeries::ORIGINS)->map(fn ($label, $code) => ['code' => $code, 'label' => $label])->values(),
            'open_days'  => QuickSeries::OPEN_DAYS,
            'defaults'   => QuickSeries::settings(),
            'reader'     => (new GeminiService())->isConfigured(),
        ];
    }

    /**
     * GET /api/admin/quick/series?q=&status=&page= — the table: newest first,
     * one row per series with what staff check at a glance.
     */
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $status = $request->query('status');

        $rows = \Illuminate\Support\Facades\DB::table('pack_campaigns as c')
            ->join('pack_definitions as d', 'd.id', '=', 'c.pack_definition_id')
            ->leftJoin('products as p', 'p.id', '=', 'd.product_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->whereNull('c.deleted_at')
            ->when(in_array($status, ['open', 'filled', 'closed', 'cancelled'], true), fn ($w) => $w->where('c.status', $status))
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('c.title', 'like', "%{$q}%")->orWhere('c.public_code', 'like', "%{$q}%")->orWhere('s.name', 'like', "%{$q}%")))
            ->orderByDesc('c.created_at')->orderByDesc('c.id')
            ->select('c.id', 'c.public_code', 'c.title', 'c.status', 'c.expires_at', 'c.created_at', 'p.id as product_id', 'p.thumbnail', 'p.origin_country', 's.name as supplier')
            ->selectSub(fn ($x) => $x->from('pack_slots')->whereColumn('pack_campaign_id', 'c.id')->whereNull('deleted_at')->selectRaw('count(*)'), 'slots')
            ->selectSub(fn ($x) => $x->from('pack_slots')->whereColumn('pack_campaign_id', 'c.id')->whereNull('deleted_at')->where('status', 'paid')->selectRaw('count(*)'), 'paid')
            ->selectSub(fn ($x) => $x->from('pack_slots as ps')->join('product_variants as v', 'v.id', '=', 'ps.variant_id')->whereColumn('ps.pack_campaign_id', 'c.id')->selectRaw('min(v.cost_price)'), 'cost')
            ->selectSub(fn ($x) => $x->from('pack_slots as ps')->join('variant_prices as vp', 'vp.variant_id', '=', 'ps.variant_id')->whereColumn('ps.pack_campaign_id', 'c.id')->where('vp.currency_code', 'usd')->selectRaw('min(vp.amount)'), 'price')
            ->paginate(25);

        return [
            'rows' => collect($rows->items())->map(fn ($r) => [
                'id'        => $r->id,
                'code'      => $r->public_code,
                'title'     => $r->title,
                'status'    => $r->status,
                'thumbnail' => $r->thumbnail,
                'product_id' => $r->product_id,
                'supplier'  => $r->supplier,
                'origin'    => $r->origin_country,
                'slots'     => (int) $r->slots,
                'paid'      => (int) $r->paid,
                'cost'      => $r->cost !== null ? (int) $r->cost : null,
                'price'     => $r->price !== null ? (int) $r->price : null,
                'expires_at' => $r->expires_at ? \Illuminate\Support\Carbon::parse($r->expires_at)->toIso8601String() : null,
                'created_at' => \Illuminate\Support\Carbon::parse($r->created_at)->toIso8601String(),
                'link'      => url("/shop/series/{$r->public_code}"),
            ]),
            'page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total(),
        ];
    }

    /** POST /api/admin/quick/series/read  { shots[] } — fills the form; saves nothing. */
    public function read(Request $request)
    {
        $request->validate([
            'shots'   => ['required', 'array', 'min:1', 'max:4'],
            'shots.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ]);
        if (! (new GeminiService())->isConfigured()) {
            return response()->json(['error' => 'The AI reader needs GOOGLE_AI_API_KEY — fill the form by hand for now.'], 422);
        }

        $images = array_map(fn ($f) => ['base64' => base64_encode(file_get_contents($f->getRealPath())), 'mime' => $f->getMimeType()], $request->file('shots'));
        try {
            return ['draft' => QuickSeries::read($images)];
        } catch (\Throwable $e) {
            Log::warning('[quick series read] ' . $e->getMessage());

            return response()->json(['error' => 'Couldn\'t read that one — try a clearer screenshot that shows the caption, or fill it in by hand.'], 422);
        }
    }

    /** POST /api/admin/quick/series  (multipart: fields + images[]) */
    public function store(Request $request)
    {
        // Nested fields arrive as JSON in a multipart form.
        foreach (['size_runs', 'supplier', 'catalogue_ids'] as $k) {
            if (is_string($request->input($k))) $request->merge([$k => json_decode($request->input($k), true)]);
        }
        $publish = $request->boolean('publish');

        $d = $request->validate([
            'title'          => ['required', 'string', 'max:120'],
            'description'    => ['nullable', 'string', 'max:3000'],
            'cost'           => ['required', 'numeric', 'min:0.5', 'max:10000'],
            'margin'         => ['required', 'integer', 'min:0', 'max:500'],
            'single_price'   => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'reference'      => ['nullable', 'string', 'max:60'],
            'ai_cost'        => ['nullable', 'numeric', 'min:0', 'max:5'],
            'supplier'       => ['nullable', 'array'],
            'supplier.id'    => ['nullable', 'string', 'exists:suppliers,id'],
            'supplier.name'  => ['nullable', 'string', 'max:120'],
            'supplier.phone' => ['nullable', 'string', 'max:40'],
            'supplier.link'  => ['nullable', 'string', 'max:300'],
            'origin'         => ['nullable', Rule::in(array_keys(QuickSeries::ORIGINS))],
            'size_runs'      => ['required', 'array', 'min:1', 'max:6'],
            'size_runs.*'    => ['array', 'min:2', 'max:20'],
            'size_runs.*.*'  => ['string', 'max:20'],
            'catalogue_ids'  => ['nullable', 'array'],
            'catalogue_ids.*' => ['string', 'exists:catalogues,id'],
            'open_days'      => ['nullable', 'integer', 'min:0', 'max:90'],
            'images'         => [$publish ? 'required' : 'nullable', 'array', 'max:10'],
            'images.*'       => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:20480'],
        ], [
            'images.required' => 'Add at least one photo — a series without a picture won\'t sell.',
            'size_runs.*.min' => 'Each size run needs at least two sizes.',
        ]);
        $d['publish'] = $publish;

        try {
            $r = QuickSeries::create($d, $request->file('images') ?? []);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return $r + ['links' => array_map(fn ($c) => url("/shop/series/{$c}"), $r['codes'])];
    }
}
