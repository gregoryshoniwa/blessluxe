import { NextResponse } from "next/server";
import { getCurrentCustomer, getTransactionForInvoice } from "@/lib/customer-account";
import { loadInvoiceLogoBytes } from "@/lib/load-invoice-logo";
import { buildInvoicePdfBuffer } from "@/lib/render-invoice-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseOrderNumber(param: string): string | null {
  const s = decodeURIComponent(param).trim().replace(/\.pdf$/i, "").trim();
  if (s.length < 2 || s.length > 96) return null;
  if (!/^[\w.-]+$/.test(s)) return null;
  return s;
}

export async function GET(request: Request, context: { params: Promise<{ invoiceRef: string }> }) {
  const { invoiceRef } = await context.params;
  const orderNumber = parseOrderNumber(String(invoiceRef ?? ""));
  if (!orderNumber) {
    return new NextResponse(null, { status: 404 });
  }

  const customer = await getCurrentCustomer();
  if (!customer) {
    const login = new URL("/account/login", request.url);
    login.searchParams.set("next", new URL(`/invoices/${encodeURIComponent(invoiceRef)}`, request.url).pathname);
    return NextResponse.redirect(login);
  }

  const data = await getTransactionForInvoice(String(customer.id), orderNumber);
  if (!data) {
    return new NextResponse(null, { status: 404 });
  }

  const { transaction, items } = data;
  const currency = String(transaction.currency_code || "usd");
  const amount = Number(transaction.amount || 0);
  const createdRaw = transaction.created_at;
  const created =
    createdRaw instanceof Date ? createdRaw : new Date(String(createdRaw));

  const lines =
    items.length > 0
      ? items.map((row) => {
          const q = Math.max(1, Number(row.quantity || 1));
          const unit = Number(row.unit_price || 0);
          return {
            description: String(row.product_title || "Item"),
            quantity: q,
            unitPrice: unit,
            lineTotal: q * unit,
          };
        })
      : [
          {
            description: "Order total",
            quantity: 1,
            unitPrice: amount,
            lineTotal: amount,
          },
        ];

  const billToName = String(
    customer.full_name ||
      `${String(customer.first_name || "").trim()} ${String(customer.last_name || "").trim()}`.trim() ||
      "Customer"
  );
  const billToEmail = String(customer.email || "");

  const logo = await loadInvoiceLogoBytes();

  let pdf: Buffer;
  try {
    pdf = await buildInvoicePdfBuffer(
      {
        orderNumber: String(transaction.order_number),
        issuedAt: created,
        status: String(transaction.status || "paid"),
        currencyCode: currency,
        total: amount,
        billToName,
        billToEmail,
        lines,
      },
      { logo }
    );
  } catch (err) {
    console.error("[invoices] PDF generation failed:", err);
    return NextResponse.json({ error: "Could not generate invoice PDF." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${String(transaction.order_number)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
