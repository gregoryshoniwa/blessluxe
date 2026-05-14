/**
 * Server-side helpers for talking to the BLESSLUXE shop backend
 * (`http://localhost:9001` by default). Use these wherever the storefront
 * needs the shop_customer / shop_product_review / shop_affiliate / shop_order
 * tables to be the source of truth.
 *
 * URL resolution: prefers `SHOP_BACKEND_INTERNAL_URL` (set in Docker compose to
 * the service name e.g. `http://shop:9001`), otherwise rewrites localhost →
 * 127.0.0.1 to dodge a Node 24 + Express ECONNRESET issue when fetch()
 * resolves "localhost" to ::1 first.
 */

const PUBLIC_BASE =
  process.env.NEXT_PUBLIC_COMMERCE_BACKEND ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9001";

export const SHOP_BACKEND_URL = PUBLIC_BASE;

const SHOP_BACKEND_INTERNAL_URL = (
  process.env.SHOP_BACKEND_INTERNAL_URL?.trim() ||
  PUBLIC_BASE.replace(/^http:\/\/localhost(:|$)/i, "http://127.0.0.1$1")
).replace(/\/+$/, "");

interface ShopFetchOptions {
  method?: string;
  body?: unknown;
  bearer?: string | null;
  headers?: Record<string, string>;
}

export async function shopFetch<T>(
  path: string,
  opts: ShopFetchOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const headers: Record<string, string> = {
    accept: "application/json",
    connection: "close",
    ...(opts.headers || {}),
  };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (opts.bearer) {
    headers.authorization = `Bearer ${opts.bearer}`;
  }
  const url = path.startsWith("http") ? path : `${SHOP_BACKEND_INTERNAL_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    let data: T | null = null;
    let error: string | undefined;
    try {
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        error = (json.error as string) || (json.message as string) || res.statusText;
      }
      data = json as T;
    } catch {
      /* non-json */
    }
    return { ok: res.ok, status: res.status, data, error };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: (err as Error).message || "fetch failed",
    };
  }
}

// ─── Customer auth ───────────────────────────────────────────────────────

export interface ShopCustomer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  loyalty_points: number;
  loyalty_tier: "bronze" | "silver" | "gold" | "platinum";
  referral_code: string | null;
  marketing_consent: boolean;
  avatar_url: string | null;
  email_verified_at: string | null;
  created_at: string;
}

export async function shopBackendCustomerSignup(input: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  marketing_consent?: boolean;
}) {
  return shopFetch<{ token: string; customer: ShopCustomer }>("/auth/customer/signup", {
    body: input,
  });
}

export async function shopBackendCustomerLogin(email: string, password: string) {
  return shopFetch<{ token: string; customer: ShopCustomer }>("/auth/customer/login", {
    body: { email, password },
  });
}

export async function shopBackendCustomerOauth(input: {
  provider: string;
  subject: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}) {
  return shopFetch<{ token: string; customer: ShopCustomer }>("/auth/customer/oauth", {
    body: input,
  });
}

export async function shopBackendCustomerMe(token: string) {
  return shopFetch<{ customer: ShopCustomer }>("/auth/customer/me", { bearer: token });
}

// ─── Reviews ─────────────────────────────────────────────────────────────

export async function shopBackendListReviews(productId: string) {
  return shopFetch<{
    reviews: Array<Record<string, unknown>>;
    summary?: { average_rating: number; total_reviews: number };
  }>(`/store/reviews?product_id=${encodeURIComponent(productId)}&limit=200`);
}

export async function shopBackendCreateReview(input: {
  product_id: string;
  customer_id?: string;
  customer_email?: string;
  customer_name?: string;
  order_id?: string;
  title: string;
  content: string;
  rating: number;
}) {
  return shopFetch<{ review: Record<string, unknown> }>("/store/reviews", { body: input });
}

// ─── Affiliates ──────────────────────────────────────────────────────────

export interface ShopAffiliate {
  id: string;
  code: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  commission_rate: number;
  status: "active" | "inactive" | "pending";
  total_earnings: number;
  paid_out: number;
  created_at: string;
  updated_at: string;
}

export async function shopBackendApplyAffiliate(input: {
  email: string;
  first_name?: string;
  last_name?: string;
  notes?: string;
}) {
  return shopFetch<{ affiliate: Record<string, unknown> }>("/store/affiliates/apply", {
    body: input,
  });
}

/** Returns the authenticated customer's own affiliate record (if any). */
export async function shopBackendGetCustomerAffiliate(customerToken: string) {
  return shopFetch<{ affiliate: ShopAffiliate | null }>("/auth/customer/affiliate", {
    bearer: customerToken,
  });
}

// ─── Orders ──────────────────────────────────────────────────────────────

export interface ShopOrderInput {
  email?: string;
  customer_token?: string;
  currency_code: string;
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    /** Forwards pack-slot link so the backend can flip 'reserved' → 'paid'. */
    pack_slot_id?: string;
    pack_campaign_id?: string;
    metadata?: Record<string, unknown>;
  }>;
  shipping_total?: number;
  tax_total?: number;
  discount_total?: number;
  payment_method?: string;
  payment_status?: string;
  status?: string;
  region_id?: string;
  campaign_id?: string;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  order_number?: string;
}

export async function shopBackendCreateOrder(input: ShopOrderInput) {
  const { customer_token, ...body } = input;
  return shopFetch<{ order: Record<string, unknown> }>("/store/orders", {
    body,
    bearer: customer_token || null,
  });
}

// ─── Campaigns (active) ──────────────────────────────────────────────────

export interface ActiveCampaign {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  banner_url: string | null;
  banner_text: string | null;
  banner_cta_label: string | null;
  banner_cta_href: string | null;
  discount_percent: number | null;
  starts_at: string;
  ends_at: string;
  show_countdown: boolean;
}

export async function shopBackendActiveCampaigns() {
  return shopFetch<{ campaigns: ActiveCampaign[] }>("/store/campaigns");
}
