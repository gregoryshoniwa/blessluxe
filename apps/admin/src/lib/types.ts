export interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
}

export interface Heading {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  rank: number;
  is_active: boolean;
  is_sale: boolean;
  metadata: Record<string, unknown> | null;
  catalogue_count?: number;
  catalogues?: Catalogue[];
  created_at: string;
  updated_at: string;
}

export interface Catalogue {
  id: string;
  heading_id: string;
  heading_name?: string;
  heading_handle?: string;
  name: string;
  handle: string;
  description: string | null;
  thumbnail: string | null;
  rank: number;
  is_active: boolean;
  product_count?: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  subtitle: string | null;
  thumbnail: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  manage_inventory: boolean;
  inventory_quantity: number;
  allow_backorder: boolean;
  cost_price?: number | null;
  weight_grams?: number | null;
  received_at?: string | null;
  options?: Record<string, string>;
  prices?: VariantPrice[];
}

export interface VariantPrice {
  id?: string;
  variant_id?: string;
  region_id?: string | null;
  currency_code: string;
  amount: number;
  sale_amount?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
}

export interface ProductOption {
  id: string;
  title: string;
  rank: number;
  values: Array<{ id: string; value: string; rank: number }>;
}

export interface ProductTag {
  id: string;
  value: string;
  product_count?: number;
}

export interface Campaign {
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
  is_active: boolean;
  show_countdown: boolean;
  product_count?: number;
  products?: Array<{ id: string; title: string; handle: string; thumbnail: string | null }>;
}

export interface Customer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  loyalty_points: number;
  loyalty_tier: "bronze" | "silver" | "gold" | "platinum";
  referral_code: string | null;
  marketing_consent: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  product_title?: string;
  product_handle?: string;
  product_thumbnail?: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  title: string;
  content: string;
  rating: number;
  is_verified_purchase: boolean;
  status: "pending" | "approved" | "rejected";
  admin_response: string | null;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface Affiliate {
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
  sales?: AffiliateSale[];
  payouts?: AffiliatePayout[];
}

export interface AffiliateSale {
  id: string;
  affiliate_id: string;
  order_id: string;
  order_total: number;
  commission_amount: number;
  currency_code: string;
  status: string;
  created_at: string;
}

export interface AffiliatePayout {
  id: string;
  affiliate_id: string;
  amount: number;
  currency_code: string;
  method: string;
  status: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  name: string;
  currency_code: string;
  countries: string[];
}

// ─── Packs ────────────────────────────────────────────────────────────────

export interface PackDefinition {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  status: "draft" | "published";
  product_id: string;
  product_title: string | null;
  product_thumbnail: string | null;
  campaign_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PackCampaign {
  id: string;
  public_code: string;
  status:
    | "open"
    | "filling"
    | "ready_to_process"
    | "processing"
    | "fulfilled"
    | "cancelled";
  expires_at: string | null;
  gift_blits_prize: number | null;
  gift_blits_pool: number | null;
  gift_allocation_type: string;
  gift_countdown_ends_at: string | null;
  definition_title: string;
  definition_handle: string;
  product_title: string | null;
  product_thumbnail: string | null;
  affiliate_code: string | null;
  affiliate_email: string | null;
  total_slots: number;
  paid_slots: number;
  created_at: string;
}

export interface PackSlot {
  id: string;
  pack_campaign_id: string;
  campaign_code: string | null;
  variant_id: string;
  variant_title: string | null;
  sku: string | null;
  size_label: string;
  status:
    | "available"
    | "reserved"
    | "paid"
    | "fulfilled"
    | "cancelled"
    | "released";
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  order_id: string | null;
  commitment: string;
  collection_code: string | null;
  reserved_until: string | null;
  created_at: string;
}

export interface PackStats {
  definitions: number;
  campaigns_by_status: Record<string, number>;
  slots_by_status: Record<string, number>;
}
