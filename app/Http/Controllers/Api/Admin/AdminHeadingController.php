<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Heading;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminHeadingController extends Controller
{
    public function index()
    {
        return [
            'headings' => Heading::withCount('catalogues')->orderBy('rank')->get()->map(fn ($h) => $this->shape($h)),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'      => ['required', 'string', 'max:120'],
            'handle'    => ['required', 'string', 'max:120', 'regex:/^[a-z0-9-]+$/', Rule::unique('headings', 'handle')],
            'rank'      => ['nullable', 'integer'],
            'is_active' => ['nullable', 'boolean'],
            'is_sale'   => ['nullable', 'boolean'],
        ]);
        $heading = Heading::create([
            'id'        => 'head_' . Str::random(12),
            'name'      => $data['name'],
            'handle'    => strtolower($data['handle']),
            'rank'      => (int) ($data['rank'] ?? Heading::max('rank') + 1),
            'is_active' => (bool) ($data['is_active'] ?? true),
            'is_sale'   => (bool) ($data['is_sale']   ?? false),
        ]);
        return ['heading' => $this->shape($heading->loadCount('catalogues'))];
    }

    public function update(Request $request, string $id)
    {
        $heading = Heading::findOrFail($id);
        $data = $request->validate([
            'name'      => ['sometimes', 'string', 'max:120'],
            'handle'    => ['sometimes', 'string', 'max:120', 'regex:/^[a-z0-9-]+$/', Rule::unique('headings', 'handle')->ignore($id)],
            'rank'      => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
            'is_sale'   => ['sometimes', 'boolean'],
        ]);
        if (isset($data['handle'])) $data['handle'] = strtolower($data['handle']);
        $heading->update($data);
        return ['heading' => $this->shape($heading->loadCount('catalogues'))];
    }

    public function destroy(string $id)
    {
        Heading::findOrFail($id)->delete();
        return ['ok' => true];
    }

    private function shape(Heading $h): array
    {
        return [
            'id'              => $h->id,
            'name'            => $h->name,
            'handle'          => $h->handle,
            'rank'            => $h->rank,
            'is_active'       => (bool) $h->is_active,
            'is_sale'         => (bool) $h->is_sale,
            'catalogues_count' => $h->catalogues_count ?? null,
        ];
    }
}
