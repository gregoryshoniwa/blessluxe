<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;

class CreateOrderTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'create_order',
            'description' => 'Hand off to the secure checkout. The agent does not place the order itself — it sends the customer to /checkout/payment after the cart is ready.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'use_cart'        => ['type' => 'boolean'],
                    'discount_code'   => ['type' => 'string'],
                    'gift_message'    => ['type' => 'string'],
                ],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        if (! $context->isAuthenticated()) {
            return $this->fail('Sign in to check out, then I can guide you the rest of the way.');
        }
        $hasItems = $context->cart && $context->cart->lineItems()->exists();
        if (! $hasItems) return $this->fail('Cart is empty.');
        return $this->ok(
            ['handoff' => '/checkout', 'message' => "Taking you to checkout."],
            uiAction: ['type' => 'navigate', 'target' => '/checkout'],
        );
    }
}
