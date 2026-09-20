<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Mail\AffiliateApprovedMail;
use App\Mail\AffiliatePayoutMail;
use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use App\Models\AffiliateSale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminAffiliateController extends Controller
{
    public function index(Request $request)
    {
        $q = Affiliate::query()
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('code', 'like', "%{$term}%")
                       ->orWhere('email', 'like', "%{$term}%");
                });
            })
            ->latest();
        $paginator = $q->paginate((int) min(100, max(10, (int) $request->query('limit', 25))));

        return [
            'affiliates' => collect($paginator->items())->map(fn ($a) => $this->shape($a)),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'code'             => ['required', 'string', 'max:60', 'regex:/^[A-Z0-9-]+$/', Rule::unique('affiliates', 'code')],
            'email'            => ['required', 'email', Rule::unique('affiliates', 'email')],
            'first_name'       => ['nullable', 'string', 'max:120'],
            'last_name'        => ['nullable', 'string', 'max:120'],
            'commission_rate'  => ['nullable', 'numeric', 'between:0,100'],
            'status'           => ['nullable', Rule::in(['pending', 'active', 'paused'])],
        ]);
        $a = Affiliate::create([
            'id'              => 'aff_' . Str::random(12),
            'code'            => strtoupper($data['code']),
            'email'           => strtolower(trim($data['email'])),
            'first_name'      => $data['first_name'] ?? null,
            'last_name'       => $data['last_name']  ?? null,
            'commission_rate' => $data['commission_rate'] ?? 10,
            'status'          => $data['status'] ?? 'pending',
        ]);
        return ['affiliate' => $this->shape($a)];
    }

    public function update(Request $request, string $id)
    {
        $a = Affiliate::findOrFail($id);
        $data = $request->validate([
            'commission_rate' => ['sometimes', 'numeric', 'between:0,100'],
            'status'          => ['sometimes', Rule::in(['pending', 'active', 'paused'])],
            'first_name'      => ['sometimes', 'nullable', 'string', 'max:120'],
            'last_name'       => ['sometimes', 'nullable', 'string', 'max:120'],
            // Codes are assigned automatically on approval; this is the override
            // for when a name-derived code isn't the one you want.
            'code'            => [
                'sometimes', 'string', 'max:60', 'regex:/^[A-Z0-9-]+$/i',
                Rule::unique('affiliates', 'code')->ignore($a->id),
            ],
        ]);

        // Codes are shared publicly and land in URLs — normalise so JANE10 and
        // jane10 can't become two different affiliates.
        if (isset($data['code'])) {
            $data['code'] = strtoupper($data['code']);
        }
        $wasPending = $a->status === 'pending';
        $a->update($data);

        // Approval pipeline: pending → active means the admin approved this
        // application. Send the welcome email + drop a customer-side
        // notification if a matching account exists.
        if ($wasPending && ($data['status'] ?? null) === 'active') {
            // Applicants choose and reserve their own code, so by now it exists.
            // Admin-created affiliates may not have one; they can be given a code
            // via the override field before going active.
            if (! $a->code) {
                return response()->json([
                    'error' => 'This affiliate has no share code yet. Set one before making them active.',
                ], 422);
            }

            if ($a->email) {
                try {
                    \Illuminate\Support\Facades\Mail::to($a->email)
                        ->send(new AffiliateApprovedMail($a->fresh()));
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('[affiliate approved mail] '.$e->getMessage());
                }
                $matchedCustomer = \App\Models\Customer::where('email', strtolower($a->email))->first();
                if ($matchedCustomer) {
                    \App\Services\Notifications::forCustomer(
                        $matchedCustomer,
                        kind:      'affiliate_approved',
                        title:     'You are now a BLESSLUXE affiliate',
                        body:      "Share code {$a->code} and earn {$a->commission_rate}% on every order.",
                        actionUrl: "/affiliate/{$a->code}/dashboard",
                    );
                }
            }
        }

        return ['affiliate' => $this->shape($a->fresh())];
    }

    public function destroy(string $id)
    {
        Affiliate::findOrFail($id)->delete();
        return ['ok' => true];
    }

    /**
     * GET /api/admin/affiliates/{id}
     *
     * Full detail with the running pending balance (earnings − payouts),
     * recent sales, and payout history.
     */
    public function show(string $id)
    {
        $affiliate = Affiliate::findOrFail($id);

        $sales = AffiliateSale::query()
            ->where('affiliate_id', $id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn ($s) => [
                'id'                => $s->id,
                'order_id'          => $s->order_id,
                'order_total'       => '$' . number_format($s->order_total / 100, 2),
                'commission_amount' => '$' . number_format($s->commission_amount / 100, 2),
                'status'            => $s->status,
                'created_at'        => $s->created_at?->toIso8601String(),
            ]);

        $payouts = AffiliatePayout::query()
            ->where('affiliate_id', $id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($p) => [
                'id'        => $p->id,
                'amount'    => '$' . number_format($p->amount / 100, 2),
                'amount_raw'=> (int) $p->amount,
                'method'    => $p->method,
                'status'    => $p->status,
                'reference' => $p->reference,
                'notes'     => $p->notes,
                'created_at'=> $p->created_at?->toIso8601String(),
            ]);

        $pendingCents = max(0, (int) $affiliate->total_earnings - (int) $affiliate->paid_out);

        return [
            'affiliate' => $this->shape($affiliate),
            'pending_balance'      => '$' . number_format($pendingCents / 100, 2),
            'pending_balance_raw'  => $pendingCents,
            'sales'   => $sales,
            'payouts' => $payouts,
        ];
    }

    /**
     * POST /api/admin/affiliates/{id}/payouts
     * { amount: cents, method?, reference?, notes? }
     *
     * Creates a payout row + bumps `paid_out` atomically + marks the matching
     * "pending" sales as "paid" up to the payout amount. The affiliate sees
     * the new balance immediately in their dashboard.
     */
    public function markPaid(Request $request, string $id)
    {
        $affiliate = Affiliate::findOrFail($id);
        $data = $request->validate([
            'amount'    => ['required', 'integer', 'min:1'],
            'method'    => ['nullable', 'string', 'max:32'],
            'reference' => ['nullable', 'string', 'max:120'],
            'notes'     => ['nullable', 'string', 'max:1000'],
        ]);

        $pending = max(0, (int) $affiliate->total_earnings - (int) $affiliate->paid_out);
        if ($data['amount'] > $pending) {
            return response()->json([
                'error' => 'Amount exceeds pending balance ($' . number_format($pending / 100, 2) . ').',
            ], 422);
        }

        $payout = null;
        DB::transaction(function () use ($affiliate, $data, &$payout) {
            $payout = AffiliatePayout::create([
                'id'            => 'apo_' . Str::random(16),
                'affiliate_id'  => $affiliate->id,
                'amount'        => (int) $data['amount'],
                'currency_code' => 'usd',
                'method'        => $data['method']    ?? 'bank_transfer',
                'status'        => 'paid',
                'reference'     => $data['reference'] ?? null,
                'notes'         => $data['notes']     ?? null,
            ]);
            Affiliate::where('id', $affiliate->id)->update([
                'paid_out'   => DB::raw('paid_out + ' . (int) $data['amount']),
                'updated_at' => now(),
            ]);
            // Mark the oldest pending sales as paid until we've covered the
            // payout amount. The audit trail then lines up: each sale's
            // status reflects whether it's been settled.
            $remaining = (int) $data['amount'];
            $pendingSales = AffiliateSale::query()
                ->where('affiliate_id', $affiliate->id)
                ->where('status', 'pending')
                ->orderBy('created_at')
                ->get();
            foreach ($pendingSales as $sale) {
                if ($remaining <= 0) break;
                $remaining -= (int) $sale->commission_amount;
                $sale->update(['status' => 'paid']);
            }
        });

        // Email the affiliate — outside the transaction so SMTP failure
        // doesn't roll back the payout the admin just recorded.
        if ($payout && $affiliate->email) {
            try {
                Mail::to($affiliate->email)->send(new AffiliatePayoutMail($affiliate->fresh(), $payout));
            } catch (\Throwable $e) {
                Log::warning('[affiliate payout mail] '.$e->getMessage());
            }
            // In-app notification on the matching customer account, if any.
            $cust = \App\Models\Customer::where('email', strtolower((string) $affiliate->email))->first();
            if ($cust) {
                \App\Services\Notifications::forCustomer(
                    $cust,
                    kind: 'affiliate_payout',
                    title: 'Payout sent · $' . number_format($payout->amount / 100, 2),
                    body: 'We just settled a payout for you via ' . ucwords(str_replace('_', ' ', (string) $payout->method)) . '.',
                    actionUrl: '/affiliate/' . $affiliate->code . '/dashboard',
                );
            }
        }

        return ['ok' => true];
    }

    /** GET /api/admin/affiliate-inbox — every thread with activity. */
    /**
     * A page of conversations. `q` searches, `filter=unread` narrows to threads
     * waiting on us — both server-side, because the browser only ever holds one
     * page and can't search what it hasn't loaded.
     */
    public function inbox(Request $request)
    {
        $page = \App\Services\Messages::adminInbox(
            $request->query('q'),
            $request->query('filter') === 'unread',
            (int) $request->query('page', 1),
        );

        return $page + [
            'unread_total'     => \App\Services\Messages::adminUnreadTotal(),
            'pending_requests' => DB::table('affiliate_product_requests')
                ->where('status', 'pending')->count(),
        ];
    }

    /** GET /api/admin/affiliates/{id}/messages */
    /** The admin's "@" search — the whole published catalogue. */
    public function mentions(Request $request)
    {
        return \App\Services\MessageRefs::search(
            null, true,
            (string) $request->query('tab', 'all'),
            $request->query('q'),
            (int) $request->query('page', 1),
        );
    }

    /**
     * Just the number, for the sidebar badge. One covered-index COUNT, so every
     * admin page can afford to ask for it on a timer.
     */
    public function inboxUnread()
    {
        return [
            'unread_total' => \App\Services\Messages::adminUnreadTotal(),
            // Rides the same poll so the sidebar needs no second request.
            'hive_reports_open' => \Illuminate\Support\Facades\DB::table('hive_reports')->where('status', 'open')->count(),
        ];
    }

    /** @see AffiliateStorefrontController::markMessagesRead */
    public function markMessagesRead(string $id)
    {
        $a = Affiliate::findOrFail($id);

        return ['marked' => \App\Services\Messages::markRead($a->id, 'admin')];
    }

    /** @see AffiliateStorefrontController::messages for the three shapes. */
    public function messages(Request $request, string $id)
    {
        $a = Affiliate::findOrFail($id);

        $before = $request->query('before');
        $after  = $request->query('after');

        // Only an OPEN needs the boundary (see the storefront twin). Order
        // matters: it has to be read before markRead erases it.
        $unread = ($before || $after)
            ? ['id' => null, 'count' => 0]
            : \App\Services\Messages::unreadBoundary($a->id, 'admin');
        if (! $request->boolean('peek') && ! $before) {
            \App\Services\Messages::markRead($a->id, 'admin');
        }

        $payload = \App\Services\Messages::window($a->id, $before, $after) + [
            'first_unread_id' => $unread['id'],
            'unread_count'    => $unread['count'],
            'read_upto_id'    => \App\Services\Messages::readUpto($a->id, 'admin'),
        ];

        // Scrollback and polls only need messages; the affiliate card and the
        // stock requests are loaded once, when the thread is opened.
        if ($before || $after) {
            return $payload;
        }

        return $payload + [
            'affiliate' => [
                'id' => $a->id, 'code' => $a->code, 'email' => $a->email,
                'first_name' => $a->first_name, 'last_name' => $a->last_name,
            ],
            'requests'  => DB::table('affiliate_product_requests')
                ->where('affiliate_id', $a->id)
                ->orderByDesc('created_at')
                ->limit(25)
                ->get()
                ->map(fn ($r) => (array) $r + ['images' => json_decode((string) $r->images, true) ?: []]),
        ];
    }

    public function reply(Request $request, string $id)
    {
        $a = Affiliate::findOrFail($id);
        $data = $request->validate(\App\Services\Messages::sendRules());
        $refs = \App\Services\MessageRefs::resolve(\App\Services\Messages::refsFromRequest($request), null, true);
        $paths = \App\Services\Messages::storeImages($request->file('images', []));
        $body = trim((string) ($data['body'] ?? ''));

        if ($body === '' && ! $paths && ! $refs) {
            return response()->json(['error' => 'That message was empty.'], 422);
        }

        $messageId = \App\Services\Messages::post(
            $a->id, 'admin',
            'user:' . optional(Auth::guard('web')->user())->id,
            $body, $paths, null, $refs,
        );
        $data['body'] = \App\Services\Messages::preview($body, $paths, $refs, 120);

        // Tell the affiliate, since they aren't sitting on the page — once per
        // unread burst, not once per message (see sendMessage on the other side).
        if ($a->customer_id && \App\Services\Messages::unreadFor($a->id, 'affiliate') === 1) {
            \App\Services\Notifications::forCustomer(
                $a->customer_id,
                'affiliate_message',
                'Message from BLESSLUXE',
                \Illuminate\Support\Str::limit($data['body'], 120),
                "/affiliate/{$a->code}/dashboard",
            );
        }

        return ['message' => \App\Services\Messages::find($messageId)];
    }

    /** PUT /api/admin/affiliate-requests/{id} — accept or decline a stock request. */
    public function resolveRequest(Request $request, string $id)
    {
        $req = DB::table('affiliate_product_requests')->where('id', $id)->first();
        if (! $req) return response()->json(['error' => 'Request not found.'], 404);

        $data = $request->validate([
            'status'     => ['required', 'in:accepted,declined'],
            'admin_note' => ['nullable', 'string', 'max:2000'],
            'product_id' => ['nullable', 'string'],
        ]);

        DB::table('affiliate_product_requests')->where('id', $id)->update([
            'status'     => $data['status'],
            'admin_note' => $data['admin_note'] ?? null,
            'product_id' => $data['product_id'] ?? null,
            'updated_at' => now(),
        ]);

        // The decision belongs in the conversation, not only in a status column.
        $verb = $data['status'] === 'accepted' ? 'accepted' : 'declined';
        \App\Services\Messages::post(
            $req->affiliate_id, 'admin',
            'user:' . optional(Auth::guard('web')->user())->id,
            "Your request \"{$req->title}\" was {$verb}." . ($data['admin_note'] ? "\n\n{$data['admin_note']}" : ''),
            [], $id,
        );

        $affiliate = Affiliate::find($req->affiliate_id);
        if ($affiliate?->customer_id) {
            \App\Services\Notifications::forCustomer(
                $affiliate->customer_id,
                'affiliate_request_' . $data['status'],
                "Stock request {$verb}",
                $req->title,
                "/affiliate/{$affiliate->code}/dashboard",
            );
        }

        return ['ok' => true];
    }

    private function shape(Affiliate $a): array
    {
        return [
            'id'             => $a->id,
            'code'           => $a->code,
            'email'          => $a->email,
            'first_name'     => $a->first_name,
            'last_name'      => $a->last_name,
            'commission_rate'=> (float) $a->commission_rate,
            'status'         => $a->status,
            'total_earnings' => '$' . number_format(((int) $a->total_earnings) / 100, 2),
            'paid_out'       => '$' . number_format(((int) $a->paid_out) / 100, 2),
        ];
    }
}
