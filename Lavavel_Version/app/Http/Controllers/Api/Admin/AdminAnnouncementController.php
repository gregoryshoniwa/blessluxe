<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminAnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $q = Announcement::query()
            ->when($request->query('position'), fn ($q, $p) => $q->where('position', $p))
            ->orderBy('position')
            ->orderBy('sort_order');

        return [
            'announcements' => $q->get()->map(fn ($a) => $this->shape($a)),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'position'    => ['required', Rule::in(['hero', 'top_bar'])],
            'media_type'  => ['required', Rule::in(['image', 'video', 'gif'])],
            'media_url'   => ['required_without:media_file', 'nullable', 'string', 'max:1024'],
            'media_file'  => ['nullable', 'file', 'max:20480'],
            'poster_url'  => ['nullable', 'string', 'max:1024'],
            'heading'     => ['nullable', 'string', 'max:255'],
            'subheading'  => ['nullable', 'string', 'max:500'],
            'cta_label'   => ['nullable', 'string', 'max:120'],
            'cta_href'    => ['nullable', 'string', 'max:255'],
            'text_align'  => ['nullable', Rule::in(['left', 'center', 'right'])],
            'sort_order'  => ['nullable', 'integer'],
            'is_active'   => ['nullable', 'boolean'],
            'starts_at'   => ['nullable', 'date'],
            'ends_at'     => ['nullable', 'date'],
        ]);
        // If they uploaded a file, replace media_url with the stored URL.
        if ($request->hasFile('media_file')) {
            $path = $request->file('media_file')->store('announcements', 'public');
            $data['media_url'] = Storage::url($path);
        }
        $a = Announcement::create([
            'id'         => 'ann_' . Str::random(16),
            'position'   => $data['position'],
            'media_type' => $data['media_type'],
            'media_url'  => $data['media_url'],
            'poster_url' => $data['poster_url'] ?? null,
            'heading'    => $data['heading']    ?? null,
            'subheading' => $data['subheading'] ?? null,
            'cta_label'  => $data['cta_label']  ?? null,
            'cta_href'   => $data['cta_href']   ?? null,
            'text_align' => $data['text_align'] ?? 'left',
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'is_active'  => (bool) ($data['is_active'] ?? true),
            'starts_at'  => $data['starts_at'] ?? null,
            'ends_at'    => $data['ends_at']   ?? null,
        ]);
        return ['announcement' => $this->shape($a)];
    }

    public function update(Request $request, string $id)
    {
        $a = Announcement::findOrFail($id);
        $data = $request->validate([
            'position'    => ['sometimes', Rule::in(['hero', 'top_bar'])],
            'media_type'  => ['sometimes', Rule::in(['image', 'video', 'gif'])],
            'media_url'   => ['sometimes', 'nullable', 'string', 'max:1024'],
            'media_file'  => ['nullable', 'file', 'max:20480'],
            'poster_url'  => ['sometimes', 'nullable', 'string', 'max:1024'],
            'heading'     => ['sometimes', 'nullable', 'string', 'max:255'],
            'subheading'  => ['sometimes', 'nullable', 'string', 'max:500'],
            'cta_label'   => ['sometimes', 'nullable', 'string', 'max:120'],
            'cta_href'    => ['sometimes', 'nullable', 'string', 'max:255'],
            'text_align'  => ['sometimes', Rule::in(['left', 'center', 'right'])],
            'sort_order'  => ['sometimes', 'integer'],
            'is_active'   => ['sometimes', 'boolean'],
            'starts_at'   => ['sometimes', 'nullable', 'date'],
            'ends_at'     => ['sometimes', 'nullable', 'date'],
        ]);
        if ($request->hasFile('media_file')) {
            $path = $request->file('media_file')->store('announcements', 'public');
            $data['media_url'] = Storage::url($path);
        }
        $a->update($data);
        return ['announcement' => $this->shape($a->fresh())];
    }

    public function destroy(string $id)
    {
        Announcement::findOrFail($id)->delete();
        return ['ok' => true];
    }

    private function shape(Announcement $a): array
    {
        return [
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
            'is_active'  => (bool) $a->is_active,
            'starts_at'  => $a->starts_at?->toIso8601String(),
            'ends_at'    => $a->ends_at?->toIso8601String(),
        ];
    }
}
