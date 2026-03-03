import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class SendEmailTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'send_email',
    description: 'Send an email to the customer — order confirmations, style guides, wishlists, or custom messages.',
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['order_confirmation', 'shipping_update', 'style_guide', 'product_recommendations', 'wishlist_summary', 'size_guide', 'sale_alert', 'custom'],
          description: 'Email template to use',
        },
        subject: { type: 'string', description: 'Email subject (for custom template)' },
        content: { type: 'string', description: 'Email body (for custom template)' },
        include_products: { type: 'array', items: { type: 'string' }, description: 'Product IDs to include' },
        schedule_for: { type: 'string', description: 'ISO timestamp to schedule for later' },
      },
      required: ['template'],
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    if (!context.isAuthenticated) {
      return { success: false, error: 'You must be logged in to receive emails.' };
    }

    const template = params.template as string;
    const scheduleFor = params.schedule_for as string | undefined;

    if (scheduleFor) {
      return { success: true, data: { scheduled: true, scheduledFor: scheduleFor, template } };
    }

    return { success: true, data: { sent: true, template, subject: params.subject || `BLESSLUXE: ${template.replace(/_/g, ' ')}` } };
  }
}
