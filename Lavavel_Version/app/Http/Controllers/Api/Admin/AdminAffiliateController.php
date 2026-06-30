<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use App\Models\AffiliateSale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        ]);
        $a->update($data);
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

        DB::transaction(function () use ($affiliate, $data) {
            AffiliatePayout::create([
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
