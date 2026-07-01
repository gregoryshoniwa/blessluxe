<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Region;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminRegionController extends Controller
{
    public function index()
    {
        return [
            'regions' => Region::orderBy('name')->get()->map(fn ($r) => $this->shape($r)),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:120'],
            'currency_code' => ['required', 'string', 'max:8'],
            'countries'     => ['nullable', 'array'],
            'countries.*'   => ['string', 'max:8'],
        ]);
        $r = Region::create([
            'id'            => 'reg_' . Str::random(12),
            'name'          => $data['name'],
            'currency_code' => strtolower($data['currency_code']),
            'countries'     => $data['countries'] ?? [],
        ]);
        return ['region' => $this->shape($r)];
    }

    public function update(Request $request, string $id)
    {
        $r = Region::findOrFail($id);
        $data = $request->validate([
            'name'          => ['sometimes', 'string', 'max:120'],
            'currency_code' => ['sometimes', 'string', 'max:8'],
            'countries'     => ['sometimes', 'array'],
            'countries.*'   => ['string', 'max:8'],
        ]);
        if (isset($data['currency_code'])) $data['currency_code'] = strtolower($data['currency_code']);
        $r->update($data);
        return ['region' => $this->shape($r->fresh())];
    }

    public function destroy(string $id)
    {
        Region::findOrFail($id)->delete();
        return ['ok' => true];
    }

    private function shape(Region $r): array
    {
        return [
            'id'            => $r->id,
            'name'          => $r->name,
            'currency_code' => $r->currency_code,
            'countries'     => is_array($r->countries) ? $r->countries : [],
        ];
    }
}
