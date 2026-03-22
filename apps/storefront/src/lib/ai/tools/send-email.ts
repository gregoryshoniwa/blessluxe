import { BaseTool } from './base-tool';
import { getCustomerAccountForAgentEmail } from '@/lib/customer-email-lookup';
import {
  buildAgentEmailBody,
  isEmailConfigured,
  sendTransactionalEmail,
} from '@/lib/send-email-server';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class SendEmailTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'send_email',
    description:
      'Send a real email to the logged-in customer (same address as their account). Requires server email config (SendGrid or SMTP). Use template names for structured messages, or custom + subject + content for ad-hoc notes.',
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
            'custom',
          ],
          description: 'Email template to use',
        },
        subject: { type: 'string', description: 'Required for template=custom; optional override for other templates' },
        content: { type: 'string', description: 'Body text for template=custom' },
        include_products: {
          type: 'array',
          items: { type: 'string' },
          description: 'Product IDs to mention in the email (listed in the message)',
        },
        schedule_for: { type: 'string', description: 'ISO timestamp to schedule for later (not supported yet)' },
      },
      required: ['template'],
    },
  };

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    if (!context.isAuthenticated || !context.customerId) {
      return { success: false, error: 'The customer must be logged in to receive emails.' };
    }

    if (params.schedule_for) {
      return {
        success: false,
        error:
          'Scheduled email is not enabled yet. Send the email now without schedule_for, or ask the customer to check back later.',
      };
    }

    if (!isEmailConfigured()) {
      return {
        success: false,
        error:
          'Email sending is not configured on the server. Set SENDGRID_API_KEY + SENDGRID_FROM, or SMTP_HOST + SMTP_USER + SMTP_PASS + SMTP_FROM (see Medusa .env.template).',
      };
    }

    const template = String(params.template || '');
    const subjectOverride = typeof params.subject === 'string' ? params.subject.trim() : '';
    const customContent = typeof params.content === 'string' ? params.content : undefined;
    const includeProducts = Array.isArray(params.include_products)
      ? params.include_products.map((id) => String(id)).filter(Boolean)
      : [];

    if (template === 'custom') {
      if (!subjectOverride) {
        return { success: false, error: 'For template "custom", provide a subject line.' };
      }
      if (!customContent?.trim()) {
        return { success: false, error: 'For template "custom", provide content (the email body).' };
      }
    }

    const account = await getCustomerAccountForAgentEmail(context.customerId);
    const email = account.email ?? '';
    if (!email) {
      return { success: false, error: 'No email address on file for this account.' };
    }

    const firstRaw = account.firstName;

    const defaultSubject = `BLESSLUXE — ${template.replace(/_/g, ' ')}`;
    const subjectLine =
      template === 'custom'
        ? subjectOverride
        : subjectOverride || defaultSubject;

    const { html, text } = buildAgentEmailBody({
      template,
      subjectLine,
      customContent: template === 'custom' ? customContent : undefined,
      customerFirstName: firstRaw,
      productIds: includeProducts.length ? includeProducts : undefined,
    });

    const result = await sendTransactionalEmail({
      to: email,
      subject: subjectLine,
      html,
      text,
    });

    if (!result.ok) {
      return {
        success: false,
        error: result.error || 'Email could not be sent.',
      };
    }

    return {
      success: true,
      data: {
        sent: true,
        to: email,
        template,
        subject: subjectLine,
        provider: result.provider,
        messageId: result.messageId,
      },
    };
  }
}
