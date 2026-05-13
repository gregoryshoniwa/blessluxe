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

-- ─── Package tracking (every order yields one package; packs yield one package
--      with N items, each with its own sub-code so a customer can only claim
--      their slot piece — UPS/FedEx-style status timeline + Luhn-checked codes) ───
CREATE TABLE IF NOT EXISTS shop_package (
  id                       TEXT PRIMARY KEY,
  package_code             TEXT NOT NULL UNIQUE,            -- BL-XXXX-XXXX-Y format, Luhn-checked
  order_id                 TEXT NOT NULL REFERENCES shop_order(id) ON DELETE CASCADE,
  customer_id              TEXT REFERENCES shop_customer(id) ON DELETE SET NULL,
  customer_email           TEXT,
  status                   TEXT NOT NULL DEFAULT 'created',
  -- carriers: 'manual' (in-house), 'ups', 'fedex', 'dhl', 'usps', 'royal_mail', etc.
  carrier                  TEXT,
  carrier_tracking_number  TEXT,
  -- denormalised for quick rendering
  current_location         TEXT,
  estimated_delivery_at    TIMESTAMPTZ,
  shipped_at               TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  -- pack flag: if true, items have unique sub-codes (one per slot)
  is_pack                  BOOLEAN NOT NULL DEFAULT false,
  pack_campaign_id         TEXT,
  shipping_address         JSONB,
  notes                    TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_package_order ON shop_package(order_id);
CREATE INDEX IF NOT EXISTS idx_shop_package_customer ON shop_package(customer_id);
CREATE INDEX IF NOT EXISTS idx_shop_package_status ON shop_package(status);
CREATE INDEX IF NOT EXISTS idx_shop_package_code ON shop_package(package_code);

CREATE TABLE IF NOT EXISTS shop_package_item (
  id               TEXT PRIMARY KEY,
  package_id       TEXT NOT NULL REFERENCES shop_package(id) ON DELETE CASCADE,
  -- shop_order_line_item this item came from
  order_line_id    TEXT,
  variant_id       TEXT,
  product_id       TEXT,
  product_title    TEXT NOT NULL,
  variant_title    TEXT,
  sku              TEXT,
  quantity         INT NOT NULL DEFAULT 1,
  unit_price       INT,
  -- pack-specific fields
  pack_slot_id     TEXT,
  -- sub-code printed on the individual collection ticket; only one customer can
  -- claim it (validated against pack_slot.customer_id at scan time).
  sub_code         TEXT UNIQUE,
  claimed_at       TIMESTAMPTZ,
  claimed_by       TEXT,                                    -- shop_customer id of person who scanned
  status           TEXT NOT NULL DEFAULT 'pending',         -- pending, picked, packed, ready_for_collection, claimed, returned
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_package_item_package ON shop_package_item(package_id);
CREATE INDEX IF NOT EXISTS idx_shop_package_item_subcode ON shop_package_item(sub_code);
CREATE INDEX IF NOT EXISTS idx_shop_package_item_slot ON shop_package_item(pack_slot_id);

CREATE TABLE IF NOT EXISTS shop_package_event (
  id          TEXT PRIMARY KEY,
  package_id  TEXT NOT NULL REFERENCES shop_package(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  location    TEXT,
  notes       TEXT,
  created_by  TEXT,                                          -- shop_user id (admin) or 'system'
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_package_event_package ON shop_package_event(package_id);
CREATE INDEX IF NOT EXISTS idx_shop_package_event_created ON shop_package_event(created_at);

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

-- ─── Review reward tracking ─────────────────────────────────────────────
ALTER TABLE shop_product_review ADD COLUMN IF NOT EXISTS reward_credited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shop_product_review ADD COLUMN IF NOT EXISTS reward_credited_at TIMESTAMPTZ;

-- ─── Currencies (root + exchange rates) ────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_currency (
  code         TEXT PRIMARY KEY,                        -- 'usd', 'gbp'
  name         TEXT NOT NULL,
  symbol       TEXT,
  rate_to_root NUMERIC(20, 10) NOT NULL DEFAULT 1,      -- multiply root price by this
  is_root      BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Only one row may be the root currency at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_currency_one_root
  ON shop_currency((is_root)) WHERE is_root;

-- Seed common currencies; root defaults to USD on first install.
INSERT INTO shop_currency (code, name, symbol, rate_to_root, is_root, is_active, sort_order) VALUES
  ('usd', 'US Dollar',        '$',   1.0,  true,  true, 1),
  ('gbp', 'British Pound',    '£',   0.78, false, true, 2),
  ('eur', 'Euro',             '€',   0.92, false, true, 3),
  ('zar', 'South African Rand','R',  18.5, false, true, 4)
ON CONFLICT (code) DO NOTHING;

-- ─── Countries (allow/deny list for storefront access) ─────────────────
CREATE TABLE IF NOT EXISTS shop_country (
  code       TEXT PRIMARY KEY,                          -- ISO 3166-1 alpha-2
  name       TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_country_allowed ON shop_country(is_allowed);

-- ─── Generic key-value settings (review reward, etc.) ───────────────────
CREATE TABLE IF NOT EXISTS shop_setting (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FAQs (customer-facing, admin-managed) ───────────────────────────────
CREATE TABLE IF NOT EXISTS shop_faq (
  id         TEXT PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_faq_active ON shop_faq(is_active, sort_order);

-- ─── AI Models / Avatars (admin-managed virtual photoshoot subjects) ────
CREATE TABLE IF NOT EXISTS shop_model (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  gender          TEXT,                                     -- woman | man | nonbinary | child
  age_range       TEXT,                                     -- e.g. "20–30"
  ethnicity       TEXT,                                     -- short freeform descriptor
  prompt_template TEXT,                                     -- base identity prompt for AI generation
  primary_asset_id TEXT,                                    -- FK set after first asset is created
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_model_active ON shop_model(is_active, created_at);

CREATE TABLE IF NOT EXISTS shop_model_asset (
  id              TEXT PRIMARY KEY,
  model_id        TEXT NOT NULL REFERENCES shop_model(id) ON DELETE CASCADE,
  source_kind     TEXT NOT NULL DEFAULT 'upload',           -- upload | generated_image | generated_video
  media_type      TEXT NOT NULL DEFAULT 'image',            -- image | video | gif
  media_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  caption         TEXT,                                     -- e.g. "Front, neutral light"
  prompt          TEXT,                                     -- if generated, the prompt used
  generation_meta JSONB,                                    -- model name, durations, etc.
  status          TEXT NOT NULL DEFAULT 'ready',            -- pending | ready | failed
  status_message  TEXT,
  operation_name  TEXT,                                     -- Veo long-running operation handle
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_model_asset_model ON shop_model_asset(model_id, position);

-- ─── Product media (image | video | gif), primary-flag aware ─────────────
CREATE TABLE IF NOT EXISTS shop_product_media (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES shop_product(id) ON DELETE CASCADE,
  media_type      TEXT NOT NULL DEFAULT 'image',            -- image | video | gif
  media_url       TEXT NOT NULL,
  thumbnail_url   TEXT,                                     -- preview frame for videos
  alt_text        TEXT,
  source_kind     TEXT NOT NULL DEFAULT 'upload',           -- upload | generated_image | generated_video
  source_model_id TEXT REFERENCES shop_model(id) ON DELETE SET NULL,
  prompt          TEXT,
  generation_meta JSONB,
  status          TEXT NOT NULL DEFAULT 'ready',            -- pending | ready | failed
  status_message  TEXT,
  operation_name  TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_product_media_product ON shop_product_media(product_id, position);
CREATE INDEX IF NOT EXISTS idx_shop_product_media_primary ON shop_product_media(product_id, is_primary);

-- Only one primary media per product (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shop_product_media_primary
  ON shop_product_media(product_id) WHERE is_primary = true;

-- ─── Hero / announcement slides (image, video, gif) ──────────────────────
CREATE TABLE IF NOT EXISTS shop_announcement (
  id            TEXT PRIMARY KEY,
  position      TEXT NOT NULL DEFAULT 'hero',            -- hero | top_bar
  media_type    TEXT NOT NULL DEFAULT 'image',            -- image | video | gif
  media_url     TEXT NOT NULL,
  poster_url    TEXT,                                     -- preview frame for video
  heading       TEXT,
  subheading    TEXT,
  cta_label     TEXT,
  cta_href      TEXT,
  text_align    TEXT NOT NULL DEFAULT 'left',
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_announcement_pos ON shop_announcement(position, is_active, sort_order);

-- ─── Pack creation: allow customer-hosted campaigns ──────────────────────
-- The legacy pack_campaign.affiliate_id was NOT NULL, forcing every campaign
-- to be tied to an affiliate. Now a campaign can be hosted by a customer OR
-- an affiliate (one must be set, never both required).
ALTER TABLE pack_campaign ALTER COLUMN affiliate_id DROP NOT NULL;
ALTER TABLE pack_campaign ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES shop_customer(id) ON DELETE SET NULL;
ALTER TABLE pack_campaign ADD COLUMN IF NOT EXISTS host_kind TEXT NOT NULL DEFAULT 'affiliate' CHECK (host_kind IN ('affiliate', 'customer', 'admin'));
ALTER TABLE pack_campaign ADD COLUMN IF NOT EXISTS title TEXT;
CREATE INDEX IF NOT EXISTS idx_pack_campaign_customer_id ON pack_campaign(customer_id) WHERE deleted_at IS NULL;
