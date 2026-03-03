import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class CheckOrderStatusTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'check_order_status',
    description: 'Check the status of an existing order by order number or ID.',
    parameters: {
      type: 'object',
      properties: {
        order_number: { type: 'string', description: 'Order number (e.g. BL-ABC123)' },
        order_id: { type: 'string', description: 'Order ID' },
      },
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    if (!context.isAuthenticated) {
      return { success: false, error: 'Please log in to check order status.' };
    }

    const orderNumber = params.order_number as string || params.order_id as string;
    if (!orderNumber) {
      return { success: false, error: 'Please provide an order number or order ID.' };
    }

    // Mock response — in production fetch from Medusa
    return {
      success: true,
      data: {
        orderNumber,
        status: 'shipped',
        statusLabel: 'Shipped',
        trackingNumber: 'ZW' + Math.random().toString().slice(2, 12),
        carrier: 'DHL',
        estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        items: context.cartItems?.slice(0, 2) ?? [],
        timeline: [
          { status: 'placed', date: new Date(Date.now() - 4 * 86400000).toISOString(), label: 'Order Placed' },
          { status: 'processing', date: new Date(Date.now() - 3 * 86400000).toISOString(), label: 'Processing' },
          { status: 'shipped', date: new Date(Date.now() - 1 * 86400000).toISOString(), label: 'Shipped' },
        ],
      },
    };
  }
}
