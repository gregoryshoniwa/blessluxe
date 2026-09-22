<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PaymentSession;
use App\Services\Payments\Method;
use App\Services\Payments\Payments;
use Illuminate\Http\Request;

/** Which gateways are on, which method goes where, and what customers will see. */
class AdminPaymentsController extends Controller
{
    /** GET /api/admin/payments */
    public function index()
    {
        return $this->shape() + [
            'recent' => PaymentSession::orderByDesc('created_at')->limit(25)->get()->map(fn ($s) => [
                'reference' => $s->reference, 'provider' => $s->provider, 'method' => $s->method, 'kind' => $s->kind,
                'provider_reference' => $s->provider_reference,
                'status' => $s->status, 'provider_status' => $s->provider_status,
                'amount_label' => '$' . number_format($s->amount / 100, 2), 'email' => $s->email,
                'order_id' => $s->order_id, 'created_at' => $s->created_at?->toIso8601String(),
            ])->all(),
            'pending_count' => PaymentSession::where('status', 'pending')->where('created_at', '>=', now()->subHours(48))->count(),
        ];
    }

    /** PUT /api/admin/payments { gateways: {id: {enabled}}, routes: {method: gateway|null} } */
    public function update(Request $request)
    {
        $data = $request->validate([
            'gateways'           => ['sometimes', 'array'],
            'gateways.*.enabled' => ['boolean'],
            'routes'             => ['sometimes', 'array'],
            'routes.*'           => ['nullable', 'string', 'max:40'],
        ]);

        $result = Payments::setConfig($data);
        if (is_string($result)) return response()->json(['error' => $result], 422);

        return $this->shape();
    }

    /** POST /api/admin/payments/reconcile — ask the gateways about anything still pending. */
    public function reconcile()
    {
        $rows = PaymentSession::where('status', 'pending')->where('created_at', '>=', now()->subHours(48))
            ->where('created_at', '<=', now()->subSeconds(30))->orderBy('created_at')->limit(200)->get();
        $settled = 0;
        foreach ($rows as $s) {
            if (Payments::refresh($s, force: true)->status !== 'pending') $settled++;
        }

        return ['checked' => $rows->count(), 'settled' => $settled];
    }

    private function shape(): array
    {
        return [
            'settings' => Payments::settings(),
            'methods'  => collect(Method::ALL)->map(fn ($m, $id) => ['id' => $id, 'label' => $m['label'], 'hint' => $m['hint']])->values()->all(),
            'preview'  => Payments::checkoutOptions(),
        ];
    }
}
