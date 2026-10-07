<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PackCampaign;
use App\Services\SeriesTalk;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** The conversation inside a series. Reading is public; posting needs an account. */
class SeriesTalkController extends Controller
{
    /** GET /api/store/series/{code}/talk?since=ISO */
    public function index(Request $request, string $code)
    {
        $campaign = $this->find($code);
        if (! $campaign) return response()->json(['error' => 'Series not found.'], 404);

        $viewer = Auth::guard('customer')->id();

        return [
            'items'    => SeriesTalk::timeline($campaign->id, $request->query('since'), $viewer),
            'starters' => SeriesTalk::STARTERS,
            'max'      => SeriesTalk::MAX_LENGTH,
            'now'      => now()->toIso8601String(),           // the page polls from here, not from its own clock
        ];
    }

    /** POST /api/account/series/{code}/talk  { body } */
    public function store(Request $request, string $code)
    {
        $campaign = $this->find($code);
        if (! $campaign) return response()->json(['error' => 'Series not found.'], 404);
        if ($campaign->status === 'cancelled') return response()->json(['error' => 'This series was cancelled.'], 422);

        $customer = $this->mustBeSignedIn();
        $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $r = SeriesTalk::post($customer->id, $campaign->id, (string) $request->input('body'));
        if (is_string($r)) return response()->json(['error' => $r], 422);

        return $r;
    }

    /** DELETE /api/account/series-posts/{id} */
    public function destroy(string $id)
    {
        $customer = $this->mustBeSignedIn();

        return SeriesTalk::remove($customer->id, $id) ? ['ok' => true] : response()->json(['error' => 'Not found'], 404);
    }

    /** PUT /api/admin/series-posts/{id}  { hidden } */
    public function setHidden(Request $request, string $id)
    {
        $request->validate(['hidden' => ['required', 'boolean']]);

        return SeriesTalk::setHidden($id, $request->boolean('hidden')) ? ['ok' => true] : response()->json(['error' => 'Not found'], 404);
    }

    private function find(string $code): ?PackCampaign
    {
        return PackCampaign::where('public_code', strtoupper($code))->whereNull('deleted_at')->first();
    }

    /** `/api/account` is only the `web` group — every controller here checks for itself. */
    private function mustBeSignedIn()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) abort(response()->json(['error' => 'Sign in required.'], 401));

        return $customer;
    }
}
