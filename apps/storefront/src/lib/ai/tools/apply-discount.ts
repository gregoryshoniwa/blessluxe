import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

const MOCK_CODES: Record<string, { type: 'percent' | 'fixed'; value: number; minOrder?: number; description: string }> = {
  WELCOME10: { type: 'percent', value: 10, description: '10% off your first order' },
  LUXE20: { type: 'percent', value: 20, minOrder: 150, description: '20% off orders over $150' },
  FREESHIP: { type: 'fixed', value: 0, description: 'Free shipping on all orders' },
  SAVE25: { type: 'fixed', value: 25, minOrder: 100, description: '$25 off orders over $100' },
};

export class ApplyDiscountTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'apply_discount',
    description: 'Apply a promo/discount code to the cart or check if a code is valid.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Discount code to apply or validate' },
        action: { type: 'string', enum: ['apply', 'validate', 'remove'], description: 'Action to perform (default: apply)' },
      },
      required: ['code'],
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    const code = (params.code as string).toUpperCase();
    const action = (params.action as string) || 'apply';
    const discount = MOCK_CODES[code];

    if (!discount) {
      return { success: false, error: `The code "${code}" is not valid. Please check the code and try again.` };
    }

    const cartTotal = context.cartItems?.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0;
    if (discount.minOrder && cartTotal < discount.minOrder) {
      return { success: false, error: `This code requires a minimum order of $${discount.minOrder}. Your current cart total is $${cartTotal.toFixed(2)}.` };
    }

    if (action === 'remove') {
      return { success: true, data: { removed: true, code } };
    }

    const savings = discount.type === 'percent' ? cartTotal * (discount.value / 100) : discount.value;

    return {
      success: true,
      data: {
        code,
        applied: action === 'apply',
        valid: true,
        description: discount.description,
        savings: Math.round(savings * 100) / 100,
        type: discount.type,
        value: discount.value,
      },
    };
  }
}
