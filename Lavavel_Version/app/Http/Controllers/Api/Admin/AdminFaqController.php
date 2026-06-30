<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * FAQ admin — kept thin (no model) since the `faqs` table is just a flat
 * list. Categories are an open string field, so an admin can group "Sizing"
 * vs "Shipping" by typing the same value across rows.
 */
class AdminFaqController extends Controller
{
    public function index()
    {
        $rows = DB::table('faqs')->orderBy('category')->orderBy('sort_order')->orderBy('created_at')->get();
        return [
            'faqs' => $rows->map(fn ($r) => $this->shape($r)),
            'categories' => $rows->pluck('category')->filter()->unique()->values(),
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'question'   => ['required', 'string', 'max:255'],
            'answer'     => ['required', 'string'],
            'category'   => ['nullable', 'string', 'max:64'],
            'sort_order' => ['nullable', 'integer'],
            'is_active'  => ['nullable', 'boolean'],
        ]);
        $id = 'faq_' . Str::random(16);
        DB::table('faqs')->insert([
            'id'         => $id,
            'question'   => $data['question'],
            'answer'     => $data['answer'],
            'category'   => $data['category']   ?? null,
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'is_active'  => (bool) ($data['is_active'] ?? true),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return ['faq' => $this->shape(DB::table('faqs')->where('id', $id)->first())];
    }

    public function update(Request $request, string $id)
    {
        $row = DB::table('faqs')->where('id', $id)->first();
        abort_unless($row, 404);
        $data = $request->validate([
            'question'   => ['sometimes', 'string', 'max:255'],
            'answer'     => ['sometimes', 'string'],
            'category'   => ['sometimes', 'nullable', 'string', 'max:64'],
            'sort_order' => ['sometimes', 'integer'],
            'is_active'  => ['sometimes', 'boolean'],
        ]);
        $data['updated_at'] = now();
        DB::table('faqs')->where('id', $id)->update($data);
        return ['faq' => $this->shape(DB::table('faqs')->where('id', $id)->first())];
    }

    public function destroy(string $id)
    {
        DB::table('faqs')->where('id', $id)->delete();
        return ['ok' => true];
    }

    private function shape($r): array
    {
        return [
            'id'         => $r->id,
            'question'   => $r->question,
            'answer'     => $r->answer,
            'category'   => $r->category,
            'sort_order' => (int) $r->sort_order,
            'is_active'  => (bool) $r->is_active,
            'updated_at' => $r->updated_at,
        ];
    }
}
