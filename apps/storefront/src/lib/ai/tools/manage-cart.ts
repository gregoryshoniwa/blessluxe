import { BaseTool } from './base-tool';
import { resolveDefaultVariantIdForProduct } from '@/lib/medusa-agent-catalog';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class ManageCartTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'manage_cart',
    description:
      'Add, remove, or update items in the shopping cart. For add, prefer variant_id from search_products / view_product; otherwise pass product_id (Medusa) or handle to pick the first in-stock variant.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'update_quantity', 'clear', 'view'],
          description: 'Cart action to perform',
        },
        product_id: { type: 'string', description: 'Medusa product id' },
        handle: { type: 'string', description: 'Product handle when product_id is unknown' },
        variant_id: { type: 'string', description: 'Medusa line item variant id (best for add)' },
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

      case 'add': {
        let variantId = String(params.variant_id || '').trim();
        const quantity = Math.max(1, Number(params.quantity) || 1);
        const productId = String(params.product_id || '').trim();
        const handle = String(params.handle || '').trim();

        if (!variantId) {
          variantId =
            (await resolveDefaultVariantIdForProduct({
              product_id: productId || undefined,
              handle: handle || undefined,
            })) || '';
        }

        if (!variantId) {
          return {
            success: false,
            error:
              'Could not resolve a variant. Pass variant_id from product details, or product_id / handle for a published product.',
          };
        }

        return {
          success: true,
          data: { added: true, variantId, quantity },
          uiAction: { type: 'add_to_cart', payload: { variantId, quantity } },
        };
      }

      case 'remove':
        return {
          success: true,
          data: {
            removed: true,
            variantId: params.variant_id,
            productId: params.product_id,
          },
          uiAction: {
            type: 'remove_from_cart',
            payload: {
              variantId: params.variant_id,
              productId: params.product_id,
            },
          },
        };

      case 'update_quantity':
        return {
          success: true,
          data: {
            updated: true,
            variantId: params.variant_id,
            productId: params.product_id,
            quantity: params.quantity,
          },
          uiAction: {
            type: 'update_cart_quantity',
            payload: {
              variantId: params.variant_id,
              productId: params.product_id,
              quantity: params.quantity,
            },
          },
        };

      case 'clear':
        return {
          success: true,
          data: { cleared: true },
          uiAction: { type: 'clear_cart', payload: {} },
        };

      default:
        return { success: false, error: `Unknown cart action: ${action}` };
    }
  }
}
