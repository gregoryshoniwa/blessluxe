import { BaseTool } from './base-tool';
import { SEND_EMAIL_TOOL_DEFINITION } from './send-email.definition';
import { getCustomerAccountForAgentEmail } from '@/lib/customer-email-lookup';
import {
  buildAgentEmailBody,
  isEmailConfigured,
  sendTransactionalEmail,
  type AgentEmailProductLine,
} from '@/lib/send-email-server';
import { fetchProductSummariesForEmail, toPublicImageUrl } from '@/lib/medusa-agent-catalog';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

/** Map common model mistakes / synonyms to a supported template. */
function normalizeEmailTemplate(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '_');
  const aliases: Record<string, string> = {
    trending: 'product_recommendations',
    trending_products: 'product_recommendations',
    new_arrivals: 'product_recommendations',
    recommendations: 'product_recommendations',
    recommended_products: 'product_recommendations',
  };
  return aliases[t] ?? raw.trim();
}

export class SendEmailTool extends BaseTool {
  definition: ToolDefinition = SEND_EMAIL_TOOL_DEFINITION;

  async execute(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
    try {
      return await this.executeInner(params, context);
    } catch (e) {
      console.error('[send_email]', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Email could not be sent due to an unexpected error.',
      };
    }
  }

  private async executeInner(params: Record<string, unknown>, context: AgentContext): Promise<ToolResult> {
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
          'Email sending is not configured on the server. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (same as Medusa / Nodemailer), or SENDGRID_API_KEY + SENDGRID_FROM. If both are set, SMTP is used unless STOREFRONT_EMAIL_PROVIDER=sendgrid.',
      };
    }

    const template = normalizeEmailTemplate(String(params.template || ''));
    const subjectOverride = typeof params.subject === 'string' ? params.subject.trim() : '';
    const customContent = typeof params.content === 'string' ? params.content : undefined;
    let includeProducts = Array.isArray(params.include_products)
      ? params.include_products.map((id) => String(id)).filter(Boolean)
      : [];
    if (typeof params.content === 'string') {
      const idsInContent = params.content.match(/prod_[a-zA-Z0-9]+/g) ?? [];
      includeProducts = [...new Set([...includeProducts, ...idsInContent])];
    }

    if (template === 'custom') {
      if (!subjectOverride) {
        return { success: false, error: 'For template "custom", provide a subject line.' };
      }
      if (!customContent?.trim()) {
        return { success: false, error: 'For template "custom", provide content (the email body).' };
      }
    }

    if (template === 'conversation_summary') {
      if (!customContent?.trim()) {
        return {
          success: false,
          error:
            'For template "conversation_summary", provide content with a concise summary of the conversation.',
        };
      }
    }

    const account = await getCustomerAccountForAgentEmail(context.customerId);
    if (account.dbError) {
      return { success: false, error: account.dbError };
    }
    const email = account.email ?? '';
    if (!email) {
      return { success: false, error: 'No email address on file for this account.' };
    }

    const firstRaw = account.firstName;

    const defaultSubject =
      template === 'conversation_summary'
        ? 'Your BLESSLUXE conversation summary'
        : `BLESSLUXE — ${template.replace(/_/g, ' ')}`;
    const subjectLine =
      template === 'custom'
        ? subjectOverride
        : subjectOverride || defaultSubject;

    let emailProducts: AgentEmailProductLine[] | undefined;
    if (includeProducts.length && template === 'product_recommendations') {
      const summaries = await fetchProductSummariesForEmail(includeProducts);
      emailProducts = summaries.map((p) => ({
        title: p.title,
        handle: p.handle,
        price: p.price,
        currency: p.currency || 'USD',
        thumbnail: p.thumbnail ? toPublicImageUrl(p.thumbnail) : undefined,
      }));
    }

    const { html, text } = buildAgentEmailBody({
      template,
      subjectLine,
      customContent:
        template === 'custom' || template === 'conversation_summary' || template === 'product_recommendations'
          ? customContent
          : undefined,
      customerFirstName: firstRaw,
      products: emailProducts?.length ? emailProducts : undefined,
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
