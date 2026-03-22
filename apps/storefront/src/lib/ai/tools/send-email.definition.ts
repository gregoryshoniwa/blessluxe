import type { ToolDefinition } from '../types';

/**
 * Shared tool schema for text agent, server execute-tool, and Gemini Live (no server imports).
 */
export const SEND_EMAIL_TOOL_DEFINITION: ToolDefinition = {
  name: 'send_email',
  description:
    'Send a real email to the logged-in customer (same address as their account). For trending picks: call get_recommendations (e.g. type trending) first, then send_email with template product_recommendations, include_products from those results, optional content with product names. For a chat summary use conversation_summary with content. For ad-hoc mail use custom with subject and content.',
  parameters: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        enum: [
          'order_confirmation',
          'shipping_update',
          'style_guide',
          'product_recommendations',
          'wishlist_summary',
          'size_guide',
          'sale_alert',
          'conversation_summary',
          'custom',
        ],
        description: 'Email template to use',
      },
      subject: {
        type: 'string',
        description:
          'Required for template=custom; optional override for other templates (including conversation_summary)',
      },
      content: {
        type: 'string',
        description:
          'Body text for custom or conversation_summary; optional for product_recommendations (short intro). You may embed Medusa product ids (prod_…) in this text if include_products is omitted — they will be resolved to product cards.',
      },
      include_products: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Medusa product ids — the email will show each item with title, photo, price, and a link (not raw ids)',
      },
      schedule_for: {
        type: 'string',
        description: 'ISO timestamp to schedule for later (not supported yet)',
      },
    },
    required: ['template'],
  },
};
