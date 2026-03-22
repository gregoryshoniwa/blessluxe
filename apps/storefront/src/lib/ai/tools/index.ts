import { BaseTool } from './base-tool';
import { SendEmailTool } from './send-email';
import { VOICE_TOOLS } from './voice-tools';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

/** Full tool set for server-side agent (includes email). Voice uses `voice-tools` only. */
const ALL_TOOLS: BaseTool[] = [...VOICE_TOOLS, new SendEmailTool()];

const toolMap = new Map<string, BaseTool>();
for (const tool of ALL_TOOLS) {
  toolMap.set(tool.name, tool);
}

export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map((t) => t.definition);
}

export function getTool(name: string): BaseTool | undefined {
  return toolMap.get(name);
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(params, context);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

export { BaseTool } from './base-tool';
export type { ToolDefinition, ToolResult };
