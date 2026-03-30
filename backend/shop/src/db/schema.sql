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
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variant_product ON shop_product_variant(product_id);

-- Links a variant to its option values (e.g. Size=M, Color=Red)
CREATE TABLE IF NOT EXISTS shop_variant_option_value (
  variant_id      TEXT NOT NULL REFERENCES shop_product_variant(id) ON DELETE CASCADE,
  option_value_id TEXT NOT NULL REFERENCES shop_product_option_value(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

-- Variant prices (per-region or default)
CREATE TABLE IF NOT EXISTS shop_variant_price (
  id            TEXT PRIMARY KEY,
  variant_id    TEXT NOT NULL REFERENCES shop_product_variant(id) ON DELETE CASCADE,
  region_id     TEXT REFERENCES shop_region(id),
  currency_code TEXT NOT NULL DEFAULT 'usd',
  amount        INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
