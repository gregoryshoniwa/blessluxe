import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class CheckInventoryTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'check_inventory',
    description: 'Check stock availability for a product, optionally for a specific size/color.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID' },
        size: { type: 'string', description: 'Size to check' },
        color: { type: 'string', description: 'Color to check' },
      },
      required: ['product_id'],
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    // Mock inventory data
    const variants = [
      { size: 'XS', color: 'Blush', quantity: 5 },
      { size: 'S', color: 'Blush', quantity: 8 },
      { size: 'M', color: 'Blush', quantity: 3 },
      { size: 'L', color: 'Blush', quantity: 0 },
      { size: 'XS', color: 'Black', quantity: 12 },
      { size: 'S', color: 'Black', quantity: 6 },
      { size: 'M', color: 'Black', quantity: 0 },
      { size: 'L', color: 'Black', quantity: 2 },
    ];

    const size = params.size as string | undefined;
    const color = params.color as string | undefined;

    let filtered = variants;
    if (size) filtered = filtered.filter((v) => v.size.toLowerCase() === size.toLowerCase());
    if (color) filtered = filtered.filter((v) => v.color.toLowerCase() === color.toLowerCase());

    return {
      success: true,
      data: {
        productId: params.product_id,
        availability: filtered.map((v) => ({
          size: v.size,
          color: v.color,
          inStock: v.quantity > 0,
          quantity: v.quantity,
          lowStock: v.quantity > 0 && v.quantity <= 3,
        })),
        anyInStock: filtered.some((v) => v.quantity > 0),
      },
    };
  }
}
