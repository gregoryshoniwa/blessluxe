<?php

namespace App\Services\AI\Tools;

use App\Models\Order;
use App\Models\Package;
use App\Services\AI\AgentContext;

class CheckOrderStatusTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'check_order_status',
            'description' => 'Look up an order by order number for the signed-in customer.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'order_number' => ['type' => 'string'],
                ],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        if (! $context->isAuthenticated()) {
            return $this->fail('Please sign in to check order status.');
        }
        $num = trim((string) ($params['order_number'] ?? ''));
        if ($num === '') return $this->fail('Order number is required.');

        $order = Order::query()
            ->where('customer_id', $context->customer->id)
            ->where('order_number', $num)
            ->first();
        if (! $order) return $this->fail('No order found with that number on your account.');

        $package = Package::query()->where('order_id', $order->id)->first();
        return $this->ok([
            'order_number'   => $order->order_number,
            'status'         => $order->status,
            'payment_status' => $order->payment_status,
            'total_label'    => '$' . number_format($order->total / 100, 2),
            'placed_at'      => $order->created_at?->toIso8601String(),
            'tracking_code'  => $package?->package_code,
            'carrier'        => $package?->carrier,
        ]);
    }
}
