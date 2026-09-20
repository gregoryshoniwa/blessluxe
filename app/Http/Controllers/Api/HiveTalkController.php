<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Services\Hive;
use App\Services\HiveTalk;
use App\Services\Media;
use App\Services\MessageRefs;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Comments, Ask and Activity. Reading is public; taking part needs an 18+ member. */
class HiveTalkController extends Controller
{
    // ─── Comments ──────────────────────────────────────────────────────────

    /** GET /api/store/hive/looks/{id}/comments?before=ID */
    public function comments(Request $request, string $id)
    {
        return HiveTalk::comments($id, $this->me(), $request->query('before'));
    }

    /** POST /api/account/hive/looks/{id}/comments { body } */
    public function storeComment(Request $request, string $id)
    {
        $me = $this->member();
        $body = $this->clean($request->validate(['body' => ['required', 'string', 'max:500']])['body']);
        if ($body === '') return response()->json(['errors' => ['body' => ['Write something first.']]], 422);

        $look = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.id', $id)->where('l.status', 'published')->first(['l.id', 'l.customer_id', 'p.handle']);
        if (! $look) return response()->json(['error' => 'That look is no longer here.'], 404);

        return ['comment' => HiveTalk::addComment($look, $me, $body)];
    }

    /** DELETE /api/account/hive/comments/{id} */
    public function destroyComment(string $id)
    {
        $me = $this->member(requireAdult: false);

        return HiveTalk::deleteComment($id, $me) ? ['ok' => true] : response()->json(['error' => 'Comment not found.'], 404);
    }

    // ─── Ask ───────────────────────────────────────────────────────────────

    /** GET /api/store/hive/asks?before=&occasion=&mine=1 */
    public function asks(Request $request)
    {
        $me = $this->me();
        $occasion = in_array($request->query('occasion'), Hive::OCCASIONS, true) ? $request->query('occasion') : null;
        $mine = $request->boolean('mine') && $me ? $me->customer_id : null;

        return HiveTalk::asks($me, $request->query('before'), $occasion, $mine) + [
            'occasions' => Hive::OCCASIONS,
            'reward'    => HiveTalk::ACCEPTED_ANSWER_BEES,
        ];
    }

    /** GET /api/store/hive/asks/{id} */
    public function ask(string $id)
    {
        $data = HiveTalk::ask($id, $this->me());

        return $data ? $data + ['reward' => HiveTalk::ACCEPTED_ANSWER_BEES] : response()->json(['error' => 'That question is no longer here.'], 404);
    }

    /** POST /api/account/hive/asks  (multipart: question, details?, occasion?, images[]?) */
    public function storeAsk(Request $request)
    {
        $me = $this->member();
        $data = $request->validate([
            'question' => ['required', 'string', 'min:8', 'max:200'],
            'details'  => ['nullable', 'string', 'max:600'],
            'occasion' => ['nullable', Rule::in(Hive::OCCASIONS)],
            'images'   => ['nullable', 'array', 'max:' . HiveTalk::MAX_ASK_IMAGES],
            'images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:6144'],
        ], ['question.min' => 'Say a little more so people can help.']);

        $urls = array_map(fn ($f) => Media::upload($f, "hive/asks/{$me->customer_id}"), $request->file('images') ?? []);

        $id = 'ask_' . Str::ulid();
        DB::table('hive_asks')->insert([
            'id' => $id, 'customer_id' => $me->customer_id,
            'question' => $this->clean($data['question']),
            'details'  => ($d = $this->clean($data['details'] ?? '')) === '' ? null : $d,
            'occasion' => $data['occasion'] ?? null,
            'images'   => $urls ? json_encode($urls) : null,
            'votes'    => count($urls) >= 2 ? json_encode(array_fill(0, count($urls), 0)) : null,
            'status'   => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return HiveTalk::ask($id, $me);
    }

    /** DELETE /api/account/hive/asks/{id} */
    public function destroyAsk(string $id)
    {
        $me = $this->member(requireAdult: false);
        $ask = DB::table('hive_asks')->where('id', $id)->where('customer_id', $me->customer_id)->first();
        if (! $ask) return response()->json(['error' => 'Question not found.'], 404);

        foreach (json_decode((string) ($ask->images ?? ''), true) ?: [] as $url) {
            if (Media::isUnder($url, "hive/asks/{$me->customer_id}")) Media::delete($url);
        }
        DB::table('hive_asks')->where('id', $id)->delete();

        return ['ok' => true];
    }

    /** POST /api/account/hive/asks/{id}/vote { option } */
    public function vote(Request $request, string $id)
    {
        $me = $this->member();
        $option = (int) $request->validate(['option' => ['required', 'integer', 'between:0,3']])['option'];

        $votes = HiveTalk::vote($id, $me, $option);
        if ($votes === null) return response()->json(['error' => "That vote didn't count."], 422);

        $mine = (int) DB::table('hive_ask_votes')->where('ask_id', $id)->where('customer_id', $me->customer_id)->value('option');

        return ['votes' => $votes, 'votes_total' => array_sum($votes), 'my_vote' => $mine];
    }

    /** POST /api/account/hive/asks/{id}/answers { body?, refs? } */
    public function storeAnswer(Request $request, string $id)
    {
        $me = $this->member();
        $data = $request->validate(['body' => ['nullable', 'string', 'max:500'], 'refs' => ['nullable', 'array', 'max:6']]);

        $ask = DB::table('hive_asks')->where('id', $id)->where('status', 'published')->first();
        if (! $ask) return response()->json(['error' => 'That question is no longer here.'], 404);
        if ($ask->customer_id === $me->customer_id) return response()->json(['error' => "This is your question — reply by accepting the answer that helps."], 422);

        $body = $this->clean($data['body'] ?? '');
        $refs = MessageRefs::resolve($data['refs'] ?? [], Affiliate::where('customer_id', $me->customer_id)->first(), false);
        if ($body === '' && ! $refs) return response()->json(['errors' => ['body' => ['Write a suggestion or tag a piece.']]], 422);

        HiveTalk::addAnswer($ask, $me, $body === '' ? null : $body, $refs);

        return HiveTalk::ask($id, $me);
    }

    /** DELETE /api/account/hive/answers/{id} — your own, unless it has been accepted (it was paid for). */
    public function destroyAnswer(string $id)
    {
        $me = $this->member(requireAdult: false);
        $ans = DB::table('hive_answers')->where('id', $id)->where('customer_id', $me->customer_id)->first();
        if (! $ans) return response()->json(['error' => 'Answer not found.'], 404);
        if ($ans->accepted_at) return response()->json(['error' => "An accepted answer can't be removed."], 422);

        DB::transaction(function () use ($ans) {
            DB::table('hive_answers')->where('id', $ans->id)->delete();
            if ($ans->status === 'published') DB::table('hive_asks')->where('id', $ans->ask_id)->where('answers_count', '>', 0)->decrement('answers_count');
        });

        return ['ok' => true];
    }

    /** POST /api/account/hive/asks/{id}/accept { answer_id } */
    public function accept(Request $request, string $id)
    {
        $me = $this->member();
        $answerId = $request->validate(['answer_id' => ['required', 'string', 'max:64']])['answer_id'];

        $result = HiveTalk::accept($id, $answerId, $me);
        if (is_string($result)) return response()->json(['error' => $result], 422);

        return HiveTalk::ask($id, $me) + ['awarded' => $result['bees']];
    }

    // ─── Activity ──────────────────────────────────────────────────────────

    /** GET /api/account/hive/activity */
    public function activity()
    {
        return HiveTalk::activity($this->member(requireAdult: false)->customer_id);
    }

    /** POST /api/account/hive/activity/read */
    public function activityRead()
    {
        HiveTalk::markActivityRead($this->member(requireAdult: false)->customer_id);

        return ['ok' => true];
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    private function clean(?string $text): string
    {
        return trim(preg_replace('/[ \t]+/', ' ', strip_tags((string) $text)));
    }

    private function me(): ?object
    {
        $c = Auth::guard('customer')->user();

        return $c ? Hive::profile($c) : null;
    }

    private function member(bool $requireAdult = true): object
    {
        $me = $this->me();
        if (! $me) abort(response()->json(['error' => 'Sign in to join Bless Hive.'], 401));
        if ($me->suspended_at) abort(response()->json(['error' => 'Your page has been suspended.'], 403));
        if ($requireAdult && ! $me->adult_confirmed_at) {
            abort(response()->json(['error' => 'Please confirm you are 18 or older to take part.', 'needs' => 'adult_confirmation'], 403));
        }

        return $me;
    }
}
