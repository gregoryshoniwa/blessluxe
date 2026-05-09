-- BLESSLUXE Shop Backend Schema
-- Drop-safe: uses IF NOT EXISTS everywhere

-- Admin users
CREATE TABLE IF NOT EXISTS shop_user (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  first_name TEXT,
  last_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'admin',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_user_email ON shop_user(email);

CREATE TABLE IF NOT EXISTS shop_region (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'usd',
  countries     TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_product_category (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  handle             TEXT NOT NULL UNIQUE,
  description        TEXT,
  parent_category_id TEXT REFERENCES shop_product_category(id),
  rank               INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Headings & Catalogues (storefront navigation hierarchy) ───
-- shop_heading is the top-level menu item (e.g. "Women", "Men", "Sale").
-- Each heading owns N catalogues (e.g. "Dresses", "Tops", "Bags").
-- Products are linked to catalogues via shop_product_catalogue_map.

CREATE TABLE IF NOT EXISTS shop_heading (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  handle      TEXT NOT NULL UNIQUE,
  description TEXT,
  rank        INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_sale     BOOLEAN NOT NULL DEFAULT false,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_heading_rank ON shop_heading(rank);

CREATE TABLE IF NOT EXISTS shop_catalogue (
  id          TEXT PRIMARY KEY,
  heading_id  TEXT NOT NULL REFERENCES shop_heading(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  handle      TEXT NOT NULL UNIQUE,
  description TEXT,
  thumbnail   TEXT,
  rank        INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_catalogue_heading ON shop_catalogue(heading_id);
CREATE INDEX IF NOT EXISTS idx_shop_catalogue_rank ON shop_catalogue(rank);

CREATE TABLE IF NOT EXISTS shop_product_tag (
  id    TEXT PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS shop_product (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  handle      TEXT NOT NULL UNIQUE,
  description TEXT,
  subtitle    TEXT,
  thumbnail   TEXT,
  status      TEXT NOT NULL DEFAULT 'published',
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_product_image (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  rank       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_image_product ON shop_product_image(product_id);

CREATE TABLE IF NOT EXISTS shop_product_category_map (
  product_id  TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES shop_product_category(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS shop_product_tag_map (
  product_id TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES shop_product_tag(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE IF NOT EXISTS shop_product_option (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  rank       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_option_product ON shop_product_option(product_id);

CREATE TABLE IF NOT EXISTS shop_product_option_value (
  id        TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES shop_product_option(id) ON DELETE CASCADE,
  value     TEXT NOT NULL,
  rank      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_option_value_option ON shop_product_option_value(option_id);

CREATE TABLE IF NOT EXISTS shop_product_variant (
  id                 TEXT PRIMARY KEY,
  product_id         TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  sku                TEXT UNIQUE,
  manage_inventory   BOOLEAN NOT NULL DEFAULT false,
  inventory_quantity INT NOT NULL DEFAULT 0,
  allow_backorder    BOOLEAN NOT NULL DEFAULT false,
  cost_price         INT,
  weight_grams       INT,
  received_at        TIMESTAMPTZ,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- backfill columns for existing tables (no-ops if already present)
ALTER TABLE shop_product_variant ADD COLUMN IF NOT EXISTS cost_price INT;
ALTER TABLE shop_product_variant ADD COLUMN IF NOT EXISTS weight_grams INT;
ALTER TABLE shop_product_variant ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_variant_product ON shop_product_variant(product_id);

-- Links a variant to its option values (e.g. Size=M, Color=Red)
CREATE TABLE IF NOT EXISTS shop_variant_option_value (
  variant_id      TEXT NOT NULL REFERENCES shop_product_variant(id) ON DELETE CASCADE,
  option_value_id TEXT NOT NULL REFERENCES shop_product_option_value(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

-- Variant prices (per-region or default)
CREATE TABLE IF NOT EXISTS shop_variant_price (
  id              TEXT PRIMARY KEY,
  variant_id      TEXT NOT NULL REFERENCES shop_product_variant(id) ON DELETE CASCADE,
  region_id       TEXT REFERENCES shop_region(id),
  currency_code   TEXT NOT NULL DEFAULT 'usd',
  amount          INT NOT NULL,
  sale_amount     INT,
  sale_starts_at  TIMESTAMPTZ,
  sale_ends_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE shop_variant_price ADD COLUMN IF NOT EXISTS sale_amount INT;
ALTER TABLE shop_variant_price ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ;
ALTER TABLE shop_variant_price ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_variant_price_variant ON shop_variant_price(variant_id);

-- Cart
CREATE TABLE IF NOT EXISTS shop_cart (
  id         TEXT PRIMARY KEY,
  region_id  TEXT REFERENCES shop_region(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_cart_line_item (
  id         TEXT PRIMARY KEY,
  cart_id    TEXT NOT NULL REFERENCES shop_cart(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES shop_product_variant(id),
  quantity   INT NOT NULL DEFAULT 1,
  unit_price INT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cart_line_cart ON shop_cart_line_item(cart_id);

-- Orders (created from carts at checkout)
CREATE TABLE IF NOT EXISTS shop_order (
  id              TEXT PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,
  cart_id         TEXT REFERENCES shop_cart(id),
  email           TEXT,
  currency_code   TEXT NOT NULL DEFAULT 'usd',
  total           INT NOT NULL DEFAULT 0,
  subtotal        INT NOT NULL DEFAULT 0,
  shipping_total  INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  shipping_address JSONB,
  billing_address  JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_order_line_item (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES shop_order(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  variant_title TEXT,
  sku        TEXT,
  thumbnail  TEXT,
  quantity   INT NOT NULL DEFAULT 1,
  unit_price INT NOT NULL,
  metadata   JSONB
);
CREATE INDEX IF NOT EXISTS idx_order_line_order ON shop_order_line_item(order_id);

-- ─── Product ↔ catalogue map (links products to catalogues from the heading hierarchy) ───
CREATE TABLE IF NOT EXISTS shop_product_catalogue_map (
  product_id   TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  catalogue_id TEXT NOT NULL REFERENCES shop_catalogue(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, catalogue_id)
);
CREATE INDEX IF NOT EXISTS idx_product_catalogue_catalogue ON shop_product_catalogue_map(catalogue_id);

-- ─── Customers (storefront end-users) ───
CREATE TABLE IF NOT EXISTS shop_customer (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  password           TEXT,
  first_name         TEXT,
  last_name          TEXT,
  phone              TEXT,
  date_of_birth      DATE,
  gender             TEXT,
  marketing_consent  BOOLEAN NOT NULL DEFAULT false,
  loyalty_points     INT NOT NULL DEFAULT 0,
  loyalty_tier       TEXT NOT NULL DEFAULT 'bronze',
  referral_code      TEXT UNIQUE,
  referred_by        TEXT,
  style_preferences  JSONB,
  size_profile       JSONB,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_customer_email ON shop_customer(email);
CREATE INDEX IF NOT EXISTS idx_shop_customer_referral ON shop_customer(referral_code);

-- ─── Product reviews ───
CREATE TABLE IF NOT EXISTS shop_product_review (
  id                   TEXT PRIMARY KEY,
  product_id           TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  customer_id          TEXT REFERENCES shop_customer(id) ON DELETE SET NULL,
  customer_email       TEXT,
  customer_name        TEXT,
  order_id             TEXT,
  title                TEXT NOT NULL,
  content              TEXT NOT NULL,
  rating               INT NOT NULL,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
  status               TEXT NOT NULL DEFAULT 'pending',
  admin_response       TEXT,
  helpful_count        INT NOT NULL DEFAULT 0,
  images               JSONB,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_review_product ON shop_product_review(product_id);
CREATE INDEX IF NOT EXISTS idx_shop_review_customer ON shop_product_review(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_review_status ON shop_product_review(status);

-- ─── Affiliates (codes, sales attribution, payouts) ───
CREATE TABLE IF NOT EXISTS shop_affiliate (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  first_name      TEXT,
  last_name       TEXT,
  email           TEXT NOT NULL UNIQUE,
  commission_rate NUMERIC(6,3) NOT NULL DEFAULT 10,
  status          TEXT NOT NULL DEFAULT 'pending',
  total_earnings  INT NOT NULL DEFAULT 0,
  paid_out        INT NOT NULL DEFAULT 0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_affiliate_code ON shop_affiliate(code);

CREATE TABLE IF NOT EXISTS shop_affiliate_sale (
  id                TEXT PRIMARY KEY,
  affiliate_id      TEXT NOT NULL REFERENCES shop_affiliate(id) ON DELETE CASCADE,
  order_id          TEXT NOT NULL,
  order_total       INT NOT NULL,
  commission_amount INT NOT NULL,
  currency_code     TEXT NOT NULL DEFAULT 'usd',
  status            TEXT NOT NULL DEFAULT 'pending',
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_affiliate_sale_affiliate ON shop_affiliate_sale(affiliate_id);

CREATE TABLE IF NOT EXISTS shop_affiliate_payout (
  id            TEXT PRIMARY KEY,
  affiliate_id  TEXT NOT NULL REFERENCES shop_affiliate(id) ON DELETE CASCADE,
  amount        INT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'usd',
  method        TEXT NOT NULL DEFAULT 'bank_transfer',
  status        TEXT NOT NULL DEFAULT 'pending',
  reference     TEXT,
  notes         TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_affiliate_payout_affiliate ON shop_affiliate_payout(affiliate_id);

-- ─── Marketing campaigns (Black Friday, seasonal sales, etc.) ───
CREATE TABLE IF NOT EXISTS shop_campaign (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  handle             TEXT NOT NULL UNIQUE,
  description        TEXT,
  banner_url         TEXT,
  banner_text        TEXT,
  banner_cta_label   TEXT,
  banner_cta_href    TEXT,
  discount_percent   NUMERIC(5,2),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  show_countdown     BOOLEAN NOT NULL DEFAULT true,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_campaign_active ON shop_campaign(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS shop_campaign_product (
  campaign_id TEXT NOT NULL REFERENCES shop_campaign(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, product_id)
);

-- ─── Inventory movements (receipts, adjustments, sales) ───
-- Each row records a delta to the variant's stock so we can age inventory and
-- compute velocity / turnover.
CREATE TABLE IF NOT EXISTS shop_inventory_movement (
  id          TEXT PRIMARY KEY,
  variant_id  TEXT NOT NULL REFERENCES shop_product_variant(id) ON DELETE CASCADE,
  delta       INT NOT NULL,
  reason      TEXT NOT NULL,            -- 'receive' | 'sale' | 'adjustment' | 'return'
  reference   TEXT,                     -- order id, PO number, etc.
  notes       TEXT,
  cost_per_unit INT,                    -- snapshot of cost when received
  created_by  TEXT,                     -- shop_user.id or 'system'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_movement_variant ON shop_inventory_movement(variant_id);
CREATE INDEX IF NOT EXISTS idx_shop_inventory_movement_created ON shop_inventory_movement(created_at);

-- ─── Customer auth (sessions) — for storefront login against shop_customer ───
ALTER TABLE shop_customer ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE shop_customer ADD COLUMN IF NOT EXISTS oauth_subject TEXT;
ALTER TABLE shop_customer ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE shop_customer ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE shop_customer ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_shop_customer_oauth ON shop_customer(oauth_provider, oauth_subject);

CREATE TABLE IF NOT EXISTS shop_customer_session (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES shop_customer(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_customer_session_token ON shop_customer_session(token);

-- ─── Order updates: add fields needed for finance reporting ───
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES shop_customer(id);
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES shop_region(id);
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS payment_status TEXT;
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS discount_total INT NOT NULL DEFAULT 0;
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS tax_total INT NOT NULL DEFAULT 0;
ALTER TABLE shop_order ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES shop_campaign(id);
ALTER TABLE shop_order_line_item ADD COLUMN IF NOT EXISTS unit_cost INT;
CREATE INDEX IF NOT EXISTS idx_shop_order_customer ON shop_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_order_created ON shop_order(created_at);
CREATE INDEX IF NOT EXISTS idx_shop_order_status ON shop_order(status);
