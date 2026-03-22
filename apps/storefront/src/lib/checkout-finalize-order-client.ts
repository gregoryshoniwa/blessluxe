import type { CartItem } from "@/stores/cart";

export type SerializedCartItem = {
  id: string;
  productId: string;
  handle?: string;
  title: string;
  quantity: number;
  unitPrice: number;
  affiliateCode?: string;
  blitsTopupUsd?: number;
};

export type StripePendingCheckout = {
  orderId: string;
  orderNumber: string;
  chargeUsd: number;
  selectedMethod: string;
  /** Set for Blits split when cash leg uses Stripe; used to reverse Blits if payment fails. */
  splitIdem: string | null;
  /** USD charged to card in a split checkout (for display on the Pay button). */
  remainderUsd?: number | null;
  items: SerializedCartItem[];
};

export const STRIPE_CHECKOUT_STORAGE_KEY = "blessluxe_stripe_checkout_pending";

export function serializeCartItemsForCheckout(items: CartItem[]): SerializedCartItem[] {
  return items.map((i) => ({
    id: i.id,
    productId: i.productId,
    handle: i.handle,
    title: i.title,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    affiliateCode: i.affiliateCode,
    blitsTopupUsd: i.blitsTopupUsd,
  }));
}

export function saveStripePendingCheckout(p: StripePendingCheckout): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STRIPE_CHECKOUT_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStripePendingCheckout(): StripePendingCheckout | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STRIPE_CHECKOUT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StripePendingCheckout;
  } catch {
    return null;
  }
}

export function clearStripePendingCheckout(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STRIPE_CHECKOUT_STORAGE_KEY);
}

export async function finalizeOrderAfterPayment(input: {
  pending: StripePendingCheckout;
  setPaymentMethod: (m: string) => void;
  setOrderComplete: (orderId: string, orderNumber: string) => void;
  clearCart: () => void;
}): Promise<void> {
  const { pending, setPaymentMethod, setOrderComplete, clearCart } = input;
  const { orderId, orderNumber, chargeUsd, selectedMethod, items } = pending;

  const topupLineItems = items.filter(
    (i) =>
      i.blitsTopupUsd != null &&
      i.blitsTopupUsd > 0 &&
      Math.abs(i.unitPrice - i.blitsTopupUsd) < 1e-6
  );

  if (selectedMethod !== "blits" && topupLineItems.length > 0) {
    const lines = topupLineItems.map((i) => ({
      amountUsd: Math.round(i.blitsTopupUsd! * i.quantity * 1e6) / 1e6,
    }));
    const creditRes = await fetch("/api/blits/credit-from-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    if (!creditRes.ok) {
      const creditJson = (await creditRes.json().catch(() => ({}))) as { error?: string };
      console.warn("Blits credit from checkout:", creditJson.error);
    }
  }

  try {
    await fetch("/api/affiliate/order-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        currencyCode: "usd",
        lineItems: items.map((item) => ({
          affiliateCode: item.affiliateCode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }),
    });
  } catch (e) {
    console.warn("Affiliate tracking failed:", e);
  }

  try {
    await fetch("/api/account/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        amount: chargeUsd,
        currencyCode: "usd",
        status: "paid",
        invoiceUrl: `/invoices/${orderNumber}.pdf`,
        items: items.map((item) => ({
          productId: item.productId,
          productHandle: item.handle || "",
          productTitle: item.title,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }),
    });
  } catch (e) {
    console.warn("Transaction persistence failed:", e);
  }

  setPaymentMethod(selectedMethod);
  setOrderComplete(orderId, orderNumber);
  clearCart();
}
