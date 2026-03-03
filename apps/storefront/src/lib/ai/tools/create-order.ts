import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class CreateOrderTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'create_order',
    description: 'Create and place an order for the customer. Only use when customer explicitly confirms they want to purchase.',
    parameters: {
      type: 'object',
      properties: {
        use_cart: { type: 'boolean', description: 'Use items currently in cart' },
        shipping_address_id: { type: 'string', description: 'Saved shipping address ID' },
        payment_method: { type: 'string', description: 'Payment method ID' },
        discount_code: { type: 'string', description: 'Discount code to apply' },
        gift_message: { type: 'string', description: 'Gift message if this is a gift order' },
      },
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    if (!context.isAuthenticated) {
      return { success: false, error: 'You must be logged in to place an order. Would you like to sign in?' };
    }

    if (!context.cartItems?.length && params.use_cart) {
      return { success: false, error: 'Your cart is empty. Please add items before placing an order.' };
    }

    const orderId = `ORD-${Date.now()}`;
    const orderNumber = `BL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return {
      success: true,
      data: {
        orderId,
        orderNumber,
        total: context.cartItems?.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0,
        itemCount: context.cartItems?.length ?? 0,
        estimatedDelivery: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        discountApplied: params.discount_code ? true : false,
        giftMessage: params.gift_message,
      },
      uiAction: { type: 'navigate', payload: { path: `/checkout/confirmation?order=${orderNumber}` } },
    };
  }
}
