import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { isEmailConfigured, sendTransactionalEmail, wrapAgentEmailHtml } from "@/lib/send-email-server";

export const dynamic = "force-dynamic";

/**
 * Sends a one-line test message to the logged-in account email.
 * Use after setting SENDGRID_* or SMTP_* to verify the storefront can send mail.
 */
export async function POST() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Sign in first, then try again." }, { status: 401 });
  }

  const email = typeof customer.email === "string" ? customer.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "No email on your account." }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured. Set SENDGRID_API_KEY + SENDGRID_FROM, or SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM (and restart the dev server).",
      },
      { status: 400 }
    );
  }

  const subject = "BLESSLUXE — email test";
  const inner = `<p style="margin:0;line-height:1.6;">This is a test message from your BLESSLUXE storefront. If you received it, outbound email is configured correctly.</p>`;
  const html = wrapAgentEmailHtml(inner, subject);

  const result = await sendTransactionalEmail({
    to: email,
    subject,
    html,
    text: "This is a test message from your BLESSLUXE storefront. If you received it, outbound email is configured correctly.",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Send failed.", provider: result.provider },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    to: email,
    provider: result.provider,
    messageId: result.messageId,
  });
}
