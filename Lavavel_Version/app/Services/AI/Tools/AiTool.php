<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;

abstract class AiTool
{
    abstract public function definition(): array;

    /**
     * @return array{success: bool, data?: array, error?: string, ui_action?: array}
     */
    abstract public function execute(array $params, AgentContext $context): array;

    protected function ok(array $data = [], ?array $uiAction = null): array
    {
        $out = ['success' => true, 'data' => $data];
        if ($uiAction) $out['ui_action'] = $uiAction;
        return $out;
    }

    protected function fail(string $error): array
    {
        return ['success' => false, 'error' => $error];
    }
}
