/**
 * Server-only transactional email for the storefront (AI agent, account flows, pack notifications).
 * Same env as Medusa: **SMTP (Nodemailer)** or SendGrid. When both are configured, **SMTP is used by default**
 * so Nodemailer matches backend mail unless `STOREFRONT_EMAIL_PROVIDER=sendgrid`.
 */
import nodemailer from 'nodemailer';

/** Matches invoice brand / AI agent: prefer env, else BLESSLUXE &lt;info@blessluxe.com&gt; (read at send time). */
export function getDefaultTransactionalFrom(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.SENDGRID_FROM?.trim() ||
    "BLESSLUXE <info@blessluxe.com>"
  );
}

/** Reply-To for customer replies (same inbox as branded contact). */
export function getDefaultReplyToEmail(): string {
  return process.env.REPLY_TO_EMAIL?.trim() || process.env.SMTP_REPLY_TO?.trim() || "info@blessluxe.com";
}

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Overrides {@link getDefaultReplyToEmail} when set. */
  replyTo?: string;
}

export interface SendTransactionalEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider?: 'sendgrid' | 'smtp';
}

function getSendGridFrom(): { email: string; name?: string } {
  const raw = getDefaultTransactionalFrom();
  const m = raw.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (m) {
    return { name: m[1]?.trim(), email: m[2].trim() };
  }
  return { email: raw.trim() };
}

function sendGridKey(): string {
  const raw = process.env.SENDGRID_API_KEY;
  return typeof raw === 'string' ? raw.trim() : '';
}

function isSmtpReady(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

/**
 * Which outbound path to use. Default: **SMTP (Nodemailer) first** when host + auth are set, so a stray
 * `SENDGRID_API_KEY` does not block mail that is actually meant to go through Medusa-style SMTP.
 * Set `STOREFRONT_EMAIL_PROVIDER=sendgrid` to force SendGrid when both are configured.
 */
function resolveTransactionalProvider(): 'smtp' | 'sendgrid' | null {
  const explicit = process.env.STOREFRONT_EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'sendgrid') {
    return sendGridKey() ? 'sendgrid' : null;
  }
  if (explicit === 'smtp') {
    return isSmtpReady() ? 'smtp' : null;
  }
  if (isSmtpReady()) return 'smtp';
  if (sendGridKey()) return 'sendgrid';
  return null;
}

export function isEmailConfigured(): boolean {
  return resolveTransactionalProvider() !== null;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const provider = resolveTransactionalProvider();
  if (provider === 'smtp') {
    return sendViaSmtp(input);
  }
  if (provider === 'sendgrid') {
    return sendViaSendGrid(sendGridKey(), input);
  }

  return {
    ok: false,
    error:
      'Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (Nodemailer / same as Medusa), or SENDGRID_API_KEY + SENDGRID_FROM. Optional: STOREFRONT_EMAIL_PROVIDER=smtp|sendgrid.',
  };
}

async function sendViaSendGrid(
  apiKey: string,
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const from = getSendGridFrom();
  const replyEmail = (input.replyTo || getDefaultReplyToEmail()).trim();

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      reply_to: { email: replyEmail, name: 'BLESSLUXE' },
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
  const from = getDefaultTransactionalFrom();
  const replyTo = (input.replyTo || getDefaultReplyToEmail()).trim();
  const requireTLS = process.env.SMTP_REQUIRE_TLS === 'true';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure,
    requireTLS: requireTLS || undefined,
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
      replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text || undefined,
    });
    return { ok: true, provider: 'smtp', messageId: info.messageId };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, provider: 'smtp', error: formatSmtpFailureMessage(raw) };
  }
}

/** Nodemailer often returns "Invalid login" / 535 for bad SMTP_USER or SMTP_PASS — not storefront login. */
function formatSmtpFailureMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes('invalid login') ||
    lower.includes('authentication failed') ||
    lower.includes('535') ||
    lower.includes('534') ||
    (lower.includes('auth') && lower.includes('failed'))
  ) {
    return (
      'SMTP authentication failed (mail server rejected SMTP_USER / SMTP_PASS). ' +
      'For Gmail/Google Workspace use an App Password, not your normal account password. ' +
      'Confirm SMTP_HOST, SMTP_PORT, and that the account allows SMTP.'
    );
  }
  return raw;
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

/** Resolved catalog rows for product list blocks (no raw Medusa ids in customer-facing copy). */
export interface AgentEmailProductLine {
  title: string;
  handle: string;
  price: number;
  currency: string;
  thumbnail?: string;
}

/**
 * Public site origin for email links.
 *
 * Prefer **non–NEXT_PUBLIC** vars (`SITE_URL`, `NEXTAUTH_URL`): Next.js inlines `NEXT_PUBLIC_*`
 * at **build time**, so values added only in production `.env` at runtime are often missing.
 * `SITE_URL` / `NEXTAUTH_URL` are read when the server sends mail (runtime).
 */
function getStorefrontOrigin(): string {
  const raw =
    process.env.SITE_URL ||
    process.env.STOREFRONT_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_STORE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    '';
  let t = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!t || t === 'undefined') return '';
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }
  return t;
}

function normalizeEmailOrigin(raw: string): string {
  let t = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!t || t === 'undefined') return '';
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }
  return t.replace(/\/+$/, '');
}

/**
 * Absolute site origin for email product links.
 * Uses the same chain as `getStorefrontOrigin()` first; if everything is unset, uses
 * `DEFAULT_SITE_URL` or `EMAIL_DEFAULT_SITE_URL` (runtime env — set in `.env` / deployment).
 */
function getEmailShopBaseUrl(): string {
  const o = getStorefrontOrigin();
  if (o) return o.replace(/\/+$/, '');
  return normalizeEmailOrigin(
    String(process.env.DEFAULT_SITE_URL || process.env.EMAIL_DEFAULT_SITE_URL || '')
  );
}

function formatMoney(price: number, currency: string): string {
  const c = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

function buildProductListHtml(products: AgentEmailProductLine[]): string {
  const base = getEmailShopBaseUrl();
  const blocks: string[] = [];
  for (const p of products) {
    const href = `${base}/shop/${encodeURIComponent(p.handle)}`;
    const thumb = p.thumbnail?.trim();
    const imgCell = thumb
      ? `<td width="88" valign="top" style="padding-right:14px;">
          <img src="${escapeHtml(thumb)}" width="80" height="100" alt="${escapeHtml(p.title)}" style="display:block;border-radius:8px;object-fit:cover;border:1px solid rgba(201,168,79,0.25);" />
        </td>`
      : '';
    blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;">
      <tr>
        ${imgCell}
        <td valign="top" style="padding:14px 16px;border:1px solid rgba(201,168,79,0.35);border-radius:12px;background:#fdfcfa;">
          <a href="${escapeHtml(href)}" style="font-size:16px;font-weight:600;color:#1a1a1a;text-decoration:none;line-height:1.35;">${escapeHtml(p.title)}</a>
          <p style="margin:10px 0 0;font-size:15px;color:#c9a84f;font-weight:600;">${escapeHtml(formatMoney(p.price, p.currency))}</p>
          <p style="margin:12px 0 0;">
            <a href="${escapeHtml(href)}" style="display:inline-block;font-size:13px;color:#c9a84f;text-decoration:underline;letter-spacing:0.02em;">View on BLESSLUXE</a>
          </p>
        </td>
      </tr>
    </table>`);
  }
  return blocks.join('\n');
}

function buildProductListPlain(products: AgentEmailProductLine[]): string {
  const base = getEmailShopBaseUrl();
  return products
    .map((p) => {
      const href = `${base}/shop/${p.handle}`;
      return `• ${p.title} — ${formatMoney(p.price, p.currency)}\n  ${href}`;
    })
    .join('\n\n');
}

export function buildAgentEmailBody(params: {
  template: string;
  subjectLine: string;
  customContent?: string;
  customerFirstName?: string;
  productIds?: string[];
  /** When set (e.g. from Medusa), renders product cards instead of raw ids. */
  products?: AgentEmailProductLine[];
}): { html: string; text: string } {
  const name = params.customerFirstName || 'there';
  const productHtml = params.products?.length ? buildProductListHtml(params.products) : '';

  let inner = '';
  switch (params.template) {
    case 'custom': {
      const safe = escapeHtml(params.customContent || '').replace(/\n/g, '<br/>');
      inner = `<p style="margin:0;line-height:1.6;">${safe}</p>`;
      break;
    }
    case 'conversation_summary': {
      const safe = escapeHtml(params.customContent || '').replace(/\n/g, '<br/>');
      inner = `<p style="margin:0;line-height:1.6;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.6;">Here’s a summary of our chat:</p>
        <p style="margin:16px 0 0;line-height:1.6;">${safe}</p>`;
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
    case 'product_recommendations': {
      const highlights = params.customContent?.trim()
        ? `<p style="margin:16px 0 0;line-height:1.65;color:#3d3d3d;">${escapeHtml(params.customContent).replace(/\n/g, '<br/>')}</p>`
        : '';
      inner = `<p style="margin:0;line-height:1.65;">Hi ${escapeHtml(name)},</p>
        <p style="margin:16px 0 0;line-height:1.65;color:#3d3d3d;">Here are the pieces we picked for you — tap a product below to see live availability and pricing on our site.</p>${highlights}${productHtml}`;
      break;
    }
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

  const html = wrapAgentEmailHtml(inner, params.subjectLine);

  let text: string;
  if (params.template === 'custom' || params.template === 'conversation_summary') {
    text = `${params.subjectLine}\n\n${params.customContent || ''}`;
  } else if (params.template === 'product_recommendations' && params.products?.length) {
    const intro = [
      `Hi ${name},`,
      '',
      'Here are the pieces we picked for you — visit the links below for live availability and pricing.',
      params.customContent?.trim() ? `\n${params.customContent.trim()}` : '',
      '',
      buildProductListPlain(params.products),
      '',
      '— BLESSLUXE',
    ]
      .filter(Boolean)
      .join('\n');
    text = `${params.subjectLine}\n\n${intro}`;
  } else {
    text = `${params.subjectLine}\n\n${stripHtml(inner)}`;
  }
  return { html, text };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
