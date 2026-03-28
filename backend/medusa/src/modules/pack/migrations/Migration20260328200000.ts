import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260328200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE IF EXISTS "pack_campaign" ADD COLUMN IF NOT EXISTS "gift_allocation_type" text NOT NULL DEFAULT 'fixed_per_payment';`
    );
    this.addSql(
      `ALTER TABLE IF EXISTS "pack_campaign" ADD COLUMN IF NOT EXISTS "gift_blits_pool" integer NULL;`
    );
    this.addSql(
      `ALTER TABLE IF EXISTS "pack_campaign" ADD COLUMN IF NOT EXISTS "gift_custom_per_size" jsonb NULL;`
    );
    this.addSql(`ALTER TABLE IF EXISTS "pack_slot" ADD COLUMN IF NOT EXISTS "collection_code" text NULL;`);
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_pack_slot_collection_code_unique" ON "pack_slot" ("collection_code") WHERE deleted_at IS NULL AND collection_code IS NOT NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "idx_pack_slot_collection_code_unique";`);
    this.addSql(`ALTER TABLE IF EXISTS "pack_slot" DROP COLUMN IF EXISTS "collection_code";`);
    this.addSql(`ALTER TABLE IF EXISTS "pack_campaign" DROP COLUMN IF EXISTS "gift_custom_per_size";`);
    this.addSql(`ALTER TABLE IF EXISTS "pack_campaign" DROP COLUMN IF EXISTS "gift_blits_pool";`);
    this.addSql(`ALTER TABLE IF EXISTS "pack_campaign" DROP COLUMN IF EXISTS "gift_allocation_type";`);
  }
}
