<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Catalogue;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminCatalogueController extends Controller
{
    public function index()
    {
        return [
            'catalogues' => Catalogue::query()
                ->with('heading:id,name,handle')
                ->withCount('products')
                ->orderBy('rank')
                ->get()
                ->map(fn ($c) => $this->shape($c)),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'heading_id' => ['required', 'string', 'exists:headings,id'],
            'name'       => ['required', 'string', 'max:120'],
            'handle'     => ['required', 'string', 'max:120', 'regex:/^[a-z0-9-]+$/', Rule::unique('catalogues', 'handle')],
            'rank'       => ['nullable', 'integer'],
            'is_active'  => ['nullable', 'boolean'],
        ]);
        $catalogue = Catalogue::create([
            'id'         => 'cat_' . Str::random(12),
            'heading_id' => $data['heading_id'],
            'name'       => $data['name'],
            'handle'     => strtolower($data['handle']),
            'rank'       => (int) ($data['rank'] ?? Catalogue::where('heading_id', $data['heading_id'])->max('rank') + 1),
            'is_active'  => (bool) ($data['is_active'] ?? true),
        ]);
        return ['catalogue' => $this->shape($catalogue->load('heading:id,name,handle')->loadCount('products'))];
    }

    public function update(Request $request, string $id)
    {
        $catalogue = Catalogue::findOrFail($id);
        $data = $request->validate([
            'heading_id' => ['sometimes', 'string', 'exists:headings,id'],
            'name'       => ['sometimes', 'string', 'max:120'],
            'handle'     => ['sometimes', 'string', 'max:120', 'regex:/^[a-z0-9-]+$/', Rule::unique('catalogues', 'handle')->ignore($id)],
            'rank'       => ['sometimes', 'integer'],
            'is_active'  => ['sometimes', 'boolean'],
        ]);
        if (isset($data['handle'])) $data['handle'] = strtolower($data['handle']);
        $catalogue->update($data);
        return ['catalogue' => $this->shape($catalogue->load('heading:id,name,handle')->loadCount('products'))];
    }

    public function destroy(string $id)
    {
        Catalogue::findOrFail($id)->delete();
        return ['ok' => true];
    }

    private function shape(Catalogue $c): array
    {
        return [
            'id'             => $c->id,
            'name'           => $c->name,
            'handle'         => $c->handle,
            'rank'           => $c->rank,
            'is_active'      => (bool) $c->is_active,
            'heading_id'     => $c->heading_id,
            'heading_name'   => $c->heading?->name,
            'heading_handle' => $c->heading?->handle,
            'products_count' => $c->products_count ?? null,
        ];
    }
}
