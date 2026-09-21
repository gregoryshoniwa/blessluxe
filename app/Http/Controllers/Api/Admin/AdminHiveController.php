<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\Hive;
use App\Services\HiveRewards;
use App\Services\HiveTalk;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Staff review of what members have reported in Bless Hive. */
class AdminHiveController extends Controller
{
    /** GET /api/admin/hive/reports?status=open */
    public function reports(Request $request)
    {
        $status = in_array($request->query('status'), ['open', 'upheld', 'dismissed'], true) ? $request->query('status') : 'open';

        $rows = DB::table('hive_reports as r')
            ->leftJoin('hive_profiles as rp', 'rp.customer_id', '=', 'r.reporter_id')
            ->where('r.status', $status)
            // A report about a child is always read first.
            ->orderByRaw("CASE WHEN r.reason = 'minor' THEN 0 ELSE 1 END")
            ->orderBy('r.created_at')
            ->limit(100)
            ->get(['r.*', 'rp.handle as reporter_handle']);

        $looks = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->whereIn('l.id', $rows->where('subject_type', 'look')->pluck('subject_id')->unique())
            ->get(['l.id', 'l.caption', 'l.images', 'l.video_url', 'l.embed_provider', 'l.embed_ref', 'l.status', 'l.reports_count', 'p.handle'])->keyBy('id');
        $pages = DB::table('hive_profiles')->whereIn('customer_id', $rows->where('subject_type', 'page')->pluck('subject_id')->unique())
            ->get(['customer_id', 'handle', 'display_name', 'suspended_at'])->keyBy('customer_id');

        // Comments, questions and answers: the words themselves, and whose they are.
        $talk = [];
        foreach (['comment' => ['hive_comments', 'body'], 'ask' => ['hive_asks', 'question'], 'answer' => ['hive_answers', 'body'], 'live' => ['hive_lives', 'title']] as $type => [$tbl, $col]) {
            $ids = $rows->where('subject_type', $type)->pluck('subject_id')->unique();
            if ($ids->isEmpty()) continue;
            foreach (DB::table("$tbl as t")->join('hive_profiles as p', 'p.customer_id', '=', 't.customer_id')->whereIn('t.id', $ids)
                ->get(['t.id', "t.$col as text", 't.status', 't.reports_count', 'p.handle', ...($type === 'ask' ? ['t.images'] : [])]) as $t) {
                $talk["$type:{$t->id}"] = ['id' => $t->id, 'text' => $t->text, 'status' => $t->status, 'reports' => (int) $t->reports_count,
                    'author' => $t->handle, 'images' => json_decode((string) ($t->images ?? ''), true) ?: []];
            }
        }

        return [
            'open_count' => DB::table('hive_reports')->where('status', 'open')->count(),
            'reports' => $rows->map(function ($r) use ($looks, $pages, $talk) {
                $look = $r->subject_type === 'look' ? ($looks[$r->subject_id] ?? null) : null;
                $page = $r->subject_type === 'page' ? ($pages[$r->subject_id] ?? null) : null;

                return [
                    'id' => $r->id, 'reason' => $r->reason, 'note' => $r->note, 'status' => $r->status,
                    'created_at' => \Illuminate\Support\Carbon::parse($r->created_at, config('app.timezone'))->toIso8601String(), 'reporter' => $r->reporter_handle, 'subject_type' => $r->subject_type,
                    'look' => $look ? ['id' => $look->id, 'caption' => $look->caption, 'images' => json_decode((string) $look->images, true) ?: [], 'video_url' => $look->video_url, 'embed' => \App\Services\HiveEmbeds::present($look->embed_provider, $look->embed_ref),
                        'status' => $look->status, 'reports' => (int) $look->reports_count, 'author' => $look->handle] : null,
                    'talk' => $talk["{$r->subject_type}:{$r->subject_id}"] ?? null,
                    'page' => $page ? ['handle' => $page->handle, 'display_name' => $page->display_name, 'suspended' => (bool) $page->suspended_at] : null,
                ];
            })->all(),
        ];
    }

    /**
     * PUT /api/admin/hive/reports/{id}  { decision: uphold|dismiss, suspend?: bool }
     * Uphold hides the look (or suspends the page); dismiss restores a look that
     * reports had hidden. Every open report about the same thing closes with it.
     */
    public function resolve(Request $request, string $id)
    {
        $data = $request->validate(['decision' => ['required', Rule::in(['uphold', 'dismiss'])], 'suspend' => ['sometimes', 'boolean']]);
        $report = DB::table('hive_reports')->where('id', $id)->first();
        if (! $report) return response()->json(['error' => 'Report not found.'], 404);

        $uphold = $data['decision'] === 'uphold';

        if ($report->subject_type === 'look') {
            Hive::setLookStatus($report->subject_id, $uphold ? 'hidden' : 'published');
            $ownerId = DB::table('hive_looks')->where('id', $report->subject_id)->value('customer_id');
        } elseif (HiveTalk::isTalk($report->subject_type)) {
            HiveTalk::setStatus($report->subject_type, $report->subject_id, $uphold ? 'hidden' : 'published');
            $ownerId = HiveTalk::ownerOf($report->subject_type, $report->subject_id);
        } else {
            $ownerId = $report->subject_id;
        }
        if ($uphold && ($report->subject_type === 'page' || ! empty($data['suspend'])) && $ownerId) {
            DB::table('hive_profiles')->where('customer_id', $ownerId)->update(['suspended_at' => now()]);
        }

        DB::table('hive_reports')->where('subject_type', $report->subject_type)->where('subject_id', $report->subject_id)->where('status', 'open')
            ->update(['status' => $uphold ? 'upheld' : 'dismissed', 'resolved_by' => 'user:' . Auth::guard('web')->id(), 'resolved_at' => now(), 'updated_at' => now()]);

        return ['ok' => true];
    }

    // ─── Challenges ────────────────────────────────────────────────────────

    /** GET /api/admin/hive/challenges */
    public function challenges()
    {
        return ['challenges' => DB::table('hive_challenges')->orderByDesc('starts_at')->limit(100)->get()
            ->map(fn ($c) => HiveRewards::presentChallenge($c))->all()];
    }

    /** POST /api/admin/hive/challenges · PUT /api/admin/hive/challenges/{id} */
    public function saveChallenge(Request $request, ?string $id = null)
    {
        $existing = $id ? DB::table('hive_challenges')->where('id', $id)->first() : null;
        if ($id && ! $existing) return response()->json(['error' => 'Challenge not found.'], 404);
        if ($existing?->awarded_at) return response()->json(['error' => "This challenge has been awarded and can't be changed."], 422);

        $data = $request->validate([
            'title'        => ['required', 'string', 'min:3', 'max:80'],
            'slug'         => ['nullable', 'string', 'max:40'],
            'description'  => ['nullable', 'string', 'max:400'],
            'prize_bees'   => ['required', 'integer', 'between:0,100000'],
            'winners'      => ['required', 'integer', 'between:1,10'],
            'starts_at'    => ['required', 'date'],
            'ends_at'      => ['required', 'date', 'after:starts_at'],
            'is_published' => ['sometimes', 'boolean'],
        ]);

        $slug = \Illuminate\Support\Str::slug(($data['slug'] ?? '') ?: $data['title']);
        $slug = substr($slug, 0, 40) ?: 'challenge';
        if (DB::table('hive_challenges')->where('slug', $slug)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            return response()->json(['errors' => ['slug' => ['Another challenge already uses that tag.']]], 422);
        }

        $row = [
            'slug' => $slug, 'title' => trim(strip_tags($data['title'])),
            'description' => ($d = trim(strip_tags((string) ($data['description'] ?? '')))) === '' ? null : $d,
            'prize_bees' => $data['prize_bees'], 'winners' => $data['winners'],
            'starts_at' => \Illuminate\Support\Carbon::parse($data['starts_at']), 'ends_at' => \Illuminate\Support\Carbon::parse($data['ends_at']),
            'is_published' => (bool) ($data['is_published'] ?? $existing?->is_published ?? false), 'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('hive_challenges')->where('id', $id)->update($row);
        } else {
            $id = 'chal_' . \Illuminate\Support\Str::ulid();
            DB::table('hive_challenges')->insert($row + ['id' => $id, 'created_at' => now()]);
        }

        return ['challenge' => HiveRewards::presentChallenge(DB::table('hive_challenges')->where('id', $id)->first())];
    }

    /** GET /api/admin/hive/challenges/{id}/entries — most-hearted first, to help judging. */
    public function entries(string $id)
    {
        $c = DB::table('hive_challenges')->where('id', $id)->first();
        if (! $c) return response()->json(['error' => 'Challenge not found.'], 404);

        return [
            'challenge' => HiveRewards::presentChallenge($c),
            'entries' => DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
                ->where('l.challenge_id', $id)->where('l.status', 'published')->whereNull('p.suspended_at')
                ->orderByDesc('l.likes_count')->orderByDesc('l.created_at')->limit(200)
                ->get(['l.id', 'l.images', 'l.caption', 'l.likes_count', 'l.comments_count', 'l.won_at', 'p.handle', 'p.display_name'])
                ->map(fn ($l) => ['id' => $l->id, 'image' => json_decode((string) $l->images, true)[0] ?? null, 'caption' => $l->caption,
                    'hearts' => (int) $l->likes_count, 'comments' => (int) $l->comments_count, 'won' => (bool) $l->won_at,
                    'handle' => $l->handle, 'name' => $l->display_name])->all(),
        ];
    }

    /** POST /api/admin/hive/challenges/{id}/award { look_ids: [] } — final. */
    public function award(Request $request, string $id)
    {
        $ids = $request->validate(['look_ids' => ['required', 'array', 'min:1', 'max:10'], 'look_ids.*' => ['string', 'max:64']])['look_ids'];

        $result = HiveRewards::award($id, array_values(array_unique($ids)));
        if (is_string($result)) return response()->json(['error' => $result], 422);

        return ['ok' => true, 'paid' => $result];
    }
}
