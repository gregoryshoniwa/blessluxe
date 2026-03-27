#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

POSTGRES_USER="${POSTGRES_USER:-blessluxe}"
POSTGRES_DB="${POSTGRES_DB:-blessluxe}"
STOCK_LOCATION_ID="${STOCK_LOCATION_ID:-sl_main_warehouse}"
STOCK_LOCATION_NAME="${STOCK_LOCATION_NAME:-Main Warehouse}"

echo "→ Backfilling Medusa inventory (idempotent)..."
echo "  postgres_user=$POSTGRES_USER db=$POSTGRES_DB stock_location=$STOCK_LOCATION_ID"

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
BEGIN;

INSERT INTO stock_location (id, name, created_at, updated_at)
VALUES ('${STOCK_LOCATION_ID}', '${STOCK_LOCATION_NAME}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales_channel_stock_location (sales_channel_id, stock_location_id, id, created_at, updated_at)
SELECT
  sc.id,
  '${STOCK_LOCATION_ID}',
  'scsl_' || sc.id || '_${STOCK_LOCATION_ID}',
  NOW(),
  NOW()
FROM sales_channel sc
WHERE NOT EXISTS (
  SELECT 1
  FROM sales_channel_stock_location s
  WHERE s.sales_channel_id = sc.id
    AND s.stock_location_id = '${STOCK_LOCATION_ID}'
    AND s.deleted_at IS NULL
);

UPDATE product_variant
SET manage_inventory = true,
    allow_backorder = false,
    updated_at = NOW()
WHERE deleted_at IS NULL;

INSERT INTO inventory_item (id, sku, title, requires_shipping, created_at, updated_at)
SELECT
  'ii_' || pv.id,
  NULLIF(pv.sku, ''),
  LEFT(COALESCE(NULLIF(pv.title, ''), pv.id), 255),
  true,
  NOW(),
  NOW()
FROM product_variant pv
WHERE pv.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_item ii
    WHERE ii.id = 'ii_' || pv.id
  );

INSERT INTO product_variant_inventory_item (variant_id, inventory_item_id, id, required_quantity, created_at, updated_at)
SELECT
  pv.id,
  'ii_' || pv.id,
  'pvi_' || pv.id,
  1,
  NOW(),
  NOW()
FROM product_variant pv
WHERE pv.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM product_variant_inventory_item pvi
    WHERE pvi.variant_id = pv.id
      AND pvi.inventory_item_id = 'ii_' || pv.id
      AND pvi.deleted_at IS NULL
  );

INSERT INTO inventory_level (
  id,
  inventory_item_id,
  location_id,
  stocked_quantity,
  reserved_quantity,
  incoming_quantity,
  raw_stocked_quantity,
  raw_reserved_quantity,
  raw_incoming_quantity,
  created_at,
  updated_at
)
SELECT
  'il_' || pv.id,
  'ii_' || pv.id,
  '${STOCK_LOCATION_ID}',
  CASE
    WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 13) = 0 THEN 2
    WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 11) = 0 THEN 3
    WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 7) = 0 THEN 5
    ELSE 12
  END,
  0,
  0,
  jsonb_build_object(
    'value',
    (
      CASE
        WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 13) = 0 THEN 2
        WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 11) = 0 THEN 3
        WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 7) = 0 THEN 5
        ELSE 12
      END
    )::text,
    'precision',
    20
  ),
  jsonb_build_object('value', '0', 'precision', 20),
  jsonb_build_object('value', '0', 'precision', 20),
  NOW(),
  NOW()
FROM product_variant pv
WHERE pv.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_level il
    WHERE il.inventory_item_id = 'ii_' || pv.id
      AND il.location_id = '${STOCK_LOCATION_ID}'
      AND il.deleted_at IS NULL
  );

UPDATE inventory_level
SET raw_stocked_quantity = jsonb_build_object('value', stocked_quantity::text, 'precision', 20),
    raw_reserved_quantity = jsonb_build_object('value', reserved_quantity::text, 'precision', 20),
    raw_incoming_quantity = jsonb_build_object('value', incoming_quantity::text, 'precision', 20)
WHERE deleted_at IS NULL;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM stock_location WHERE deleted_at IS NULL) AS stock_locations,
  (SELECT COUNT(*) FROM inventory_item WHERE deleted_at IS NULL) AS inventory_items,
  (SELECT COUNT(*) FROM product_variant_inventory_item WHERE deleted_at IS NULL) AS variant_links,
  (SELECT COUNT(*) FROM inventory_level WHERE deleted_at IS NULL) AS inventory_levels,
  (SELECT COUNT(*) FROM inventory_level WHERE deleted_at IS NULL AND stocked_quantity <= 3) AS low_stock_variants;
SQL

echo "✓ Inventory backfill complete."
