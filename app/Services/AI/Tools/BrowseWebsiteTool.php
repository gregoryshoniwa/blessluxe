<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;

class BrowseWebsiteTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'browse_website',
            'description' => 'Drive UI navigation. The client routes to the target path.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'action'    => ['type' => 'string', 'enum' => ['navigate', 'scroll']],
                    'target'    => ['type' => 'string', 'description' => 'Path or query, e.g. /shop, /shop?heading=men, /shop/<handle>, /cart.'],
                    'scroll_to' => ['type' => 'string', 'description' => 'Element id or section name'],
                ],
                'required' => ['action'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        $action = (string) ($params['action'] ?? 'navigate');
        $target = (string) ($params['target'] ?? '');
        $scrollTo = (string) ($params['scroll_to'] ?? '');
        return $this->ok(
            ['action' => $action, 'target' => $target, 'scroll_to' => $scrollTo],
            uiAction: ['type' => $action, 'target' => $target, 'scroll_to' => $scrollTo],
        );
    }
}
