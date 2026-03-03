import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class ManageCartTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'manage_cart',
    description: 'Add, remove, or update items in the shopping cart.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'update_quantity', 'clear', 'view'],
          description: 'Cart action to perform',
        },
        product_id: { type: 'string', description: 'Product ID' },
        variant_id: { type: 'string', description: 'Variant ID for specific size/color' },
        quantity: { type: 'number', description: 'Quantity (for add/update)' },
      },
      required: ['action'],
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const action = params.action as string;

    switch (action) {
      case 'view':
        return { success: true, data: { items: context.cartItems ?? [], itemCount: context.cartItems?.length ?? 0 } };
      case 'add':
        return {
          success: true,
          data: { added: true, productId: params.product_id, variantId: params.variant_id, quantity: params.quantity || 1 },
          uiAction: { type: 'show_products', payload: { action: 'add_to_cart', productId: params.product_id, variantId: params.variant_id, quantity: params.quantity || 1 } },
        };
      case 'remove':
        return {
          success: true,
          data: { removed: true, productId: params.product_id },
          uiAction: { type: 'show_products', payload: { action: 'remove_from_cart', productId: params.product_id } },
        };
      case 'update_quantity':
        return {
          success: true,
          data: { updated: true, productId: params.product_id, quantity: params.quantity },
          uiAction: { type: 'show_products', payload: { action: 'update_cart_quantity', productId: params.product_id, quantity: params.quantity } },
        };
      case 'clear':
        return {
          success: true,
          data: { cleared: true },
          uiAction: { type: 'show_products', payload: { action: 'clear_cart' } },
        };
      default:
        return { success: false, error: `Unknown cart action: ${action}` };
    }
  }
}
