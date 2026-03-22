/**
 * Server-only transactional email for the storefront (AI agent, account flows).
 * Uses the same env convention as Medusa: SendGrid **or** SMTP, not both required here —
 * we pick SendGrid if SENDGRID_API_KEY is set, else SMTP if SMTP_HOST is set.
 */
import nodemailer from 'nodemailer';

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendTransactionalEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider?: 'sendgrid' | 'smtp';
}

function getSendGridFrom(): { email: string; name?: string } {
  const raw = process.env.SENDGRID_FROM || process.env.SMTP_FROM || 'noreply@blessluxe.com';
  const m = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (m) {
    return { name: m[1]?.trim(), email: m[2].trim() };
  }
  return { email: raw.trim() };
}

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SENDGRID_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (apiKey) {
    return sendViaSendGrid(apiKey, input);
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    return sendViaSmtp(input);
  }

  return {
    ok: false,
    error:
      'Email is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM, or SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (same as Medusa backend).',
  };
}

async function sendViaSendGrid(
  apiKey: string,
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const from = getSendGridFrom();

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      subject: input.subject,
      content: [
        ...(input.text ? [{ type: 'text/plain', value: input.text }] : []),
        { type: 'text/html', value: input.html },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      provider: 'sendgrid',
      error: `SendGrid HTTP ${res.status}: ${errText.slice(0, 400)}`,
    };
  }

  const messageId = res.headers.get('x-message-id') || undefined;
  return { ok: true, provider: 'sendgrid', messageId };
}

async function sendViaSmtp(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const from = process.env.SMTP_FROM || process.env.SENDGRID_FROM || 'noreply@blessluxe.com';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text || undefined,
    });
    return { ok: true, provider: 'smtp', messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, provider: 'smtp', error: msg };
  }
}

/** BLESSLUXE-branded HTML wrapper for agent emails */
export function wrapAgentEmailHtml(bodyHtml: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;font-family:Georgia,serif;background:#faf8f5;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    ${preheader ? `<p style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</p>` : ''}
    <p style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#c9a84f;margin:0 0 8px;">BLESSLUXE</p>
    <div style="border:1px solid rgba(201,168,79,0.35);border-radius:12px;padding:24px;background:#fff;">
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#888;margin-top:24px;">Luxury fashion for women, men &amp; children</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAgentEmailBody(params: {
  template: string;
  subjectLine: string;
  customContent?: string;
  customerFirstName?: string;
  productIds?: string[];
}): { html: string; text: string } {
  const name = params.customerFirstName || 'there';
  const ids = params.productIds?.length
    ? `<p style="margin:16px 0 0;font-size:13px;color:#666;">Referenced product IDs: ${escapeHtml(params.productIds.join(', '))}</p>`
    : '';

  let inner = '';
  switch (params.template) {
    case 'custom': {
      const safe = escapeHtml(params.customContent || '').replace(/\n/g, '<br/>');
      inner = `<p style="margin:0;line-height:1.6;">${safe}</p>`;
      break;
    }
    case 'order_confirmation':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">Thank you for your order with BLESSLUXE. This message confirms we’ve received your request. For full details and tracking, visit your account or use the link we sent at checkout.</p>`;
      break;
    case 'shipping_update':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">Here’s an update on your shipment. Check your order confirmation email for tracking, or reply if you need help.</p>`;
      break;
    case 'style_guide':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">As requested, here are style notes from your BLESSLUXE stylist. Pair classic silhouettes with one statement accessory, and keep hemlines balanced for your frame.</p>`;
      break;
    case 'product_recommendations':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">We picked these pieces based on what you’ve been browsing. Open the site to see live availability and pricing.</p>`;
      break;
    case 'wishlist_summary':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">Here’s a snapshot of your saved wishlist items. Sign in anytime to move them to your cart.</p>`;
      break;
    case 'size_guide':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">Sizing can vary by designer. Use our size guide on each product page, and contact us if you’d like a fit check before ordering.</p>`;
      break;
    case 'sale_alert':
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">There’s something special happening at BLESSLUXE — browse the sale section for limited-time offers on curated pieces.</p>`;
      break;
    default:
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">${escapeHtml(params.subjectLine)}</p>`;
  }

  inner += ids;
  const html = wrapAgentEmailHtml(inner, params.subjectLine);
  const text =
    params.template === 'custom'
      ? `${params.subjectLine}\n\n${params.customContent || ''}`
      : `${params.subjectLine}\n\n${stripHtml(inner)}`;
  return { html, text };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
