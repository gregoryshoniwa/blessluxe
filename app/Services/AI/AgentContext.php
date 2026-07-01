<?php

namespace App\Services\AI;

use App\Models\Cart;
use App\Models\Customer;

/**
 * Per-turn context handed to every tool. The agent core builds this from
 * the request — the tools never see the HTTP request directly.
 *
 * Two flavours of identity:
 *   - sessionId            — always set; lets us write history for guests
 *   - customer             — optional; when present, tools can return private data
 *
 * Tools also get a snapshot of the current cart so manage_cart can resolve
 * "remove the green one" against real line items.
 */
class AgentContext
{
    public function __construct(
        public string $sessionId,
        public ?Customer $customer = null,
        public ?Cart $cart = null,
        public array $cartItems = [],
        public array $extra = [],
    ) {}

    public function isAuthenticated(): bool
    {
        return $this->customer !== null;
    }
}
