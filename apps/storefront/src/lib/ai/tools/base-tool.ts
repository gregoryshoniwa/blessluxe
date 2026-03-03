import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export abstract class BaseTool {
  abstract definition: ToolDefinition;
  abstract execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult>;

  get name(): string {
    return this.definition.name;
  }
}
