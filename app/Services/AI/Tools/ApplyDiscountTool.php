<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;

class ApplyDiscountTool extends AiTool
{
    private const CODES = [
        'WELCOME10' => ['type' => 'percent', 'value' => 10, 'description' => '10% off your first order'],
        'LUXE20'    => ['type' => 'percent', 'value' => 20, 'min_order' => 15000, 'description' => '20% off orders over $150'],
        'FREESHIP'  => ['type' => 'fixed',   'value' => 0,  'description' => 'Free shipping on all orders'],
        'SAVE25'    => ['type' => 'fixed',   'value' => 2500, 'min_order' => 10000, 'description' => '$25 off orders over $100'],
    ];

    public function definition(): array
    {
        return [
            'name' => 'apply_discount',
            'description' => 'Validate or apply a promo code to the cart.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'code'   => ['type' => 'string'],
                    'action' => ['type' => 'string', 'enum' => ['apply', 'validate', 'remove']],
                ],
                'required' => ['code'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $code = strtoupper(trim((string) ($params['code'] ?? '')));
        $action = (string) ($params['action'] ?? 'apply');
        if ($action === 'remove') {
            return $this->ok(['removed' => $code]);
        }
        if (! isset(self::CODES[$code])) {
            return $this->fail("Code {$code} is not valid.");
        }
        $info = self::CODES[$code];

        // Compute cart total to validate min_order.
        $cartTotal = 0;
        if ($context->cart) {
            $cartTotal = (int) $context->cart->lineItems()->sum(\DB::raw('unit_price * quantity'));
        }
        if (! empty($info['min_order']) && $cartTotal < $info['min_order']) {
            return $this->fail("Code {$code} needs a minimum order of $" . number_format($info['min_order']/100, 2) . '.');
        }
        return $this->ok([
            'code'        => $code,
            'description' => $info['description'],
            'applied'     => $action === 'apply',
        ]);
    }
}
