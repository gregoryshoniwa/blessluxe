<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;

class ToolRegistry
{
    /** @var array<string, AiTool> */
    private array $tools = [];

    public function __construct()
    {
        $this->register(new SearchProductsTool());
        $this->register(new ViewProductTool());
        $this->register(new CheckInventoryTool());
        $this->register(new ManageCartTool());
        $this->register(new ManageWishlistTool());
        $this->register(new CheckOrderStatusTool());
        $this->register(new ApplyDiscountTool());
        $this->register(new GetRecommendationsTool());
        $this->register(new BrowseWebsiteTool());
        $this->register(new CreateOrderTool());
        $this->register(new SendEmailTool());
        $this->register(new SetReminderTool());
    }

    public function register(AiTool $tool): void
    {
        $this->tools[$tool->definition()['name']] = $tool;
    }

    public function get(string $name): ?AiTool
    {
        return $this->tools[$name] ?? null;
    }

    /** @return list<array> Tool definitions for Gemini's functionDeclarations. */
    public function definitions(): array
    {
        return array_values(array_map(fn (AiTool $t) => $t->definition(), $this->tools));
    }

    public function execute(string $name, array $params, AgentContext $context): array
    {
        $tool = $this->get($name);
        if (! $tool) return ['success' => false, 'error' => "Unknown tool: {$name}"];
        try {
            return $tool->execute($params, $context);
        } catch (\Throwable $e) {
            \Log::warning("[tool:{$name}] ".$e->getMessage());
            return ['success' => false, 'error' => 'Tool failed: '.$e->getMessage()];
        }
    }
}
