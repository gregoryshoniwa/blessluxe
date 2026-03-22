import { executeTool } from '../tools';
import type { AgentContext, ToolCall, ToolCallResult, ToolResult, UIUpdate } from '../types';

export class ActionExecutor {
  async executeToolCalls(
    toolCalls: ToolCall[],
    context: AgentContext
  ): Promise<{ results: ToolCallResult[]; uiUpdates: UIUpdate[] }> {
    const results: ToolCallResult[] = [];
    const uiUpdates: UIUpdate[] = [];

    for (const call of toolCalls) {
      const result = await executeTool(call.name, call.arguments, context);
      results.push({
        toolCallId: call.id,
        name: call.name,
        result,
      });
      if (result.uiAction) {
        uiUpdates.push(result.uiAction);
      }
    }

    return { results, uiUpdates };
  }

  extractProducts(results: ToolCallResult[]): import('../types').ProductSummary[] {
    const products: import('../types').ProductSummary[] = [];

    for (const r of results) {
      const data = r.result.data as Record<string, unknown> | undefined;
      if (!data) continue;

      if (Array.isArray(data.products)) {
        products.push(...(data.products as import('../types').ProductSummary[]));
      }
      if (data.product && typeof data.product === 'object') {
        products.push(data.product as import('../types').ProductSummary);
      }
      if (Array.isArray(data.recommendations)) {
        products.push(...(data.recommendations as import('../types').ProductSummary[]));
      }
    }

    return products;
  }
}
