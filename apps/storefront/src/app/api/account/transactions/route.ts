import { NextResponse } from "next/server";
import { createTransactionRecord, getCurrentCustomer, listTransactions } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const transactions = await listTransactions(String(customer.id));
  return NextResponse.json({ transactions });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json();

  const orderNumber = String(body.orderNumber || "").trim();
  const amount = Number(body.amount || 0);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!orderNumber || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid transaction payload." }, { status: 400 });
  }

  await createTransactionRecord(String(customer.id), {
    orderNumber,
    amount,
    currencyCode: String(body.currencyCode || "usd"),
    status: String(body.status || "paid"),
    invoiceUrl: body.invoiceUrl ? String(body.invoiceUrl) : null,
    items: items.map((item: unknown) => {
      const o = item as Record<string, unknown>;
      return {
        productId: String(o.productId || ""),
        productHandle: o.productHandle ? String(o.productHandle) : undefined,
        productTitle: String(o.productTitle || "Product"),
        quantity: Number(o.quantity || 1),
        unitPrice: Number(o.unitPrice || 0),
      };
    }),
  });
  return NextResponse.json({ ok: true });
}
