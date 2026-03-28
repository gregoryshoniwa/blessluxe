import { queryOne } from "@/lib/db";
import { getCampaignById, getPackDefinitionById, listSlotsForCampaign } from "@/lib/packs";
import {
  sendTransactionalEmail,
  wrapAgentEmailHtml,
  isEmailConfigured,
  getDefaultReplyToEmail,
} from "@/lib/send-email-server";

export type PackEmailKind =
  | "slot_paid"
  | "pack_complete"
  | "participant_left"
  | "participant_joined"
  | "refund_requested"
  | "pack_closed_cancelled"
  | "pack_closed_rejected";

function getStorefrontOrigin(): string {
  const raw =
    process.env.SITE_URL ||
    process.env.STOREFRONT_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  let t = String(raw ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!t || t === "undefined") return "";
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  return t;
}

/** Exported for campaign close / refunds — all storefront participants with an email. */
export async function collectPackParticipantEmails(campaignId: string): Promise<string[]> {
  const slots = await listSlotsForCampaign(campaignId);
  const ids = new Set<string>();
  for (const s of slots) {
    const meta = s.metadata && typeof s.metadata === "object" && !Array.isArray(s.metadata)
      ? (s.metadata as Record<string, unknown>)
      : {};
    const sf = typeof meta.storefront_customer_id === "string" ? meta.storefront_customer_id.trim() : "";
    if (sf) ids.add(sf);
    else if (s.customer_id && !String(s.customer_id).startsWith("cus_")) {
      ids.add(String(s.customer_id));
    }
  }
  if (ids.size === 0) return [];
  const emails = new Set<string>();
  for (const cid of ids) {
    const row = await queryOne<{ email: string }>(`SELECT email FROM customer_account WHERE id = $1 LIMIT 1`, [cid]);
    const e = row?.email?.trim();
    if (e) emails.add(e.toLowerCase());
  }
  return [...emails];
}

function packPageUrl(affiliateCode: string, publicCode: string): string {
  const base = getStorefrontOrigin();
  const path = `/affiliate/shop/${encodeURIComponent(affiliateCode)}/pack/${encodeURIComponent(publicCode)}`;
  return base ? `${base}${path}` : path;
}

export async function sendPackCampaignEmails(input: {
  campaignId: string;
  /** Optional; resolved from campaign affiliate if omitted. */
  affiliateCode?: string;
  kind: PackEmailKind;
  detail?: string;
}): Promise<{ sent: number; skipped: boolean }> {
  if (!isEmailConfigured()) {
    return { sent: 0, skipped: true };
  }

  const campaign = await getCampaignById(input.campaignId);
  if (!campaign) return { sent: 0, skipped: true };

  const affRow = await queryOne<{ code: string }>(`SELECT code FROM affiliate WHERE id = $1 LIMIT 1`, [
    campaign.affiliate_id,
  ]);
  const affiliateCode = (input.affiliateCode || affRow?.code || "").trim();

  const def = await getPackDefinitionById(campaign.pack_definition_id);
  const title = def?.title || "Group pack";
  const link = affiliateCode ? packPageUrl(affiliateCode, campaign.public_code) : "";

  const recipients = await collectPackParticipantEmails(input.campaignId);
  if (recipients.length === 0) return { sent: 0, skipped: false };

  let subject = `Pack update: ${title}`;
  let body = "";

  switch (input.kind) {
    case "slot_paid":
      subject = `Pack progress: a size was paid — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">Good news: another size in your group pack has been paid.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:14px 0 0;line-height:1.6;font-size:13px;color:#444;">The buyer was emailed a <strong>collection code</strong> for this size so they can collect or track the exact item at handoff.</p>
        <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">View pack status</a>` : ""}</p>`;
      break;
    case "pack_complete":
      subject = `Pack complete — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">Every size in this group pack is now paid. The pack is ready for processing.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        <p style="margin:14px 0 0;line-height:1.6;font-size:13px;color:#444;">Each buyer received a unique <strong>collection code</strong> by email for their size—use these codes when handing over or shipping items.</p>
        <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">Open pack page</a>` : ""}</p>`;
      break;
    case "participant_left":
      subject = `Pack update: someone left — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">A participant has left this group pack. Status may have changed.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">View pack status</a>` : ""}</p>`;
      break;
    case "participant_joined":
      subject = `Pack update: someone joined — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">A new participant has reserved a size in this group pack.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">View pack status</a>` : ""}</p>`;
      break;
    case "refund_requested":
      subject = `Pack update: refund requested — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">A participant has requested a refund before processing.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">View pack status</a>` : ""}</p>`;
      break;
    case "pack_closed_cancelled":
      subject = `Pack cancelled — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">This group pack was <strong>cancelled</strong> by the host or administration. Loyalty points were not penalized for this closure.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:16px 0 0;line-height:1.6;">If you had completed payment, the equivalent value has been credited to your Blits wallet on this account.</p>`;
      break;
    case "pack_closed_rejected":
      subject = `Pack not proceeding — ${title}`;
      body = `<p style="margin:0;line-height:1.6;">This group pack was <strong>closed / rejected</strong> by the host or administration. Loyalty points were not penalized for this closure.</p>
        <p style="margin:16px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong></p>
        ${input.detail ? `<p style="margin:12px 0 0;line-height:1.6;">${escapeHtml(input.detail)}</p>` : ""}
        <p style="margin:16px 0 0;line-height:1.6;">If you had completed payment, the equivalent value has been credited to your Blits wallet on this account.</p>`;
      break;
    default:
      body = `<p style="margin:0;">${escapeHtml(input.detail || "Pack update.")}</p>`;
  }

  const html = wrapAgentEmailHtml(body, subject);
  let sent = 0;
  for (const to of recipients) {
    const r = await sendTransactionalEmail({
      to,
      subject,
      html,
      text: stripHtml(body),
      replyTo: getDefaultReplyToEmail(),
    });
    if (r.ok) sent += 1;
  }

  return { sent, skipped: false };
}

/** Direct email to the buyer with pickup / tracking code (one per paid size). */
export async function notifyPackBuyerPickupCode(input: {
  storefrontCustomerId: string;
  collectionCode: string;
  sizeLabel: string;
  orderId: string;
  campaignId: string;
}): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    return { sent: false };
  }
  const row = await queryOne<{ email: string }>(
    `SELECT email FROM customer_account WHERE id = $1 LIMIT 1`,
    [input.storefrontCustomerId]
  );
  const to = row?.email?.trim();
  if (!to) {
    return { sent: false };
  }

  const campaign = await getCampaignById(input.campaignId);
  if (!campaign) return { sent: false };

  const def = await getPackDefinitionById(campaign.pack_definition_id);
  const title = def?.title || "Group pack";

  const affRow = await queryOne<{ code: string }>(`SELECT code FROM affiliate WHERE id = $1 LIMIT 1`, [
    campaign.affiliate_id,
  ]);
  const affiliateCode = (affRow?.code || "").trim();
  const link = affiliateCode ? packPageUrl(affiliateCode, campaign.public_code) : "";
  const origin = getStorefrontOrigin();
  const lookupPath = `/pack-collection/${encodeURIComponent(input.collectionCode)}`;
  const lookupUrl = origin ? `${origin}${lookupPath}` : lookupPath;

  const subject = `Your collection code — ${title} (${input.sizeLabel})`;
  const body = `<p style="margin:0;line-height:1.6;">Thank you for your payment. Use this code to <strong>collect or track the exact item you bought</strong> in this group pack.</p>
    <p style="margin:20px 0;padding:16px 20px;background:#faf8f5;border:1px solid #e8e0d5;border-radius:12px;font-family:ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:0.06em;color:#1a1a1a;">${escapeHtml(input.collectionCode)}</p>
    <p style="margin:12px 0 0;line-height:1.6;">Pack: <strong>${escapeHtml(title)}</strong><br/>Size: <strong>${escapeHtml(input.sizeLabel)}</strong><br/>Order: <strong>${escapeHtml(input.orderId)}</strong></p>
    <p style="margin:14px 0 0;line-height:1.6;font-size:13px;color:#555;">Verification link: <a href="${escapeHtml(lookupUrl)}" style="color:#c9a84f;word-break:break-all;">${escapeHtml(lookupUrl)}</a></p>
    <p style="margin:20px 0 0;">${link ? `<a href="${escapeHtml(link)}" style="color:#c9a84f;font-weight:600;">Open pack page</a>` : ""}</p>`;

  const html = wrapAgentEmailHtml(body, subject);
  const r = await sendTransactionalEmail({
    to,
    subject,
    html,
    text: stripHtml(body),
    replyTo: getDefaultReplyToEmail(),
  });
  return { sent: r.ok };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
