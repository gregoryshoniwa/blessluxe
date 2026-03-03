import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class SetReminderTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'set_reminder',
    description: 'Set a reminder or subscribe to events — price drop alerts, back-in-stock, sale reminders, or custom timed reminders.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['price_drop', 'back_in_stock', 'sale_start', 'new_arrival', 'restock_reminder', 'event_reminder', 'wishlist_sale', 'cart_reminder'],
          description: 'Type of reminder or notification',
        },
        target: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            category: { type: 'string' },
            brand: { type: 'string' },
            style: { type: 'string' },
          },
          description: 'What to watch for',
        },
        conditions: {
          type: 'object',
          properties: {
            price_below: { type: 'number' },
            discount_percent: { type: 'number' },
            sizes: { type: 'array', items: { type: 'string' } },
          },
          description: 'Trigger conditions',
        },
        message: { type: 'string', description: 'Custom reminder message' },
        remind_at: { type: 'string', description: 'ISO timestamp for event_reminder' },
        channel: { type: 'string', enum: ['push', 'email', 'sms'], description: 'Notification channel' },
      },
      required: ['type'],
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    if (!context.isAuthenticated) {
      return { success: false, error: 'Please log in to set reminders.' };
    }

    const reminderType = params.type as string;
    const channel = (params.channel as string) || 'push';

    if (reminderType === 'event_reminder') {
      return {
        success: true,
        data: {
          reminderId: crypto.randomUUID(),
          type: reminderType,
          scheduledFor: params.remind_at,
          message: params.message,
          channel,
        },
      };
    }

    return {
      success: true,
      data: {
        subscriptionId: crypto.randomUUID(),
        type: reminderType,
        target: params.target,
        conditions: params.conditions,
        channel,
      },
    };
  }
}
