import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260328120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE IF EXISTS "pack_campaign" ADD COLUMN IF NOT EXISTS "gift_countdown_ends_at" timestamptz null;`
    );
    this.addSql(
      `ALTER TABLE IF EXISTS "pack_campaign" ADD COLUMN IF NOT EXISTS "gift_blits_prize" integer null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE IF EXISTS "pack_campaign" DROP COLUMN IF EXISTS "gift_blits_prize";`);
    this.addSql(`ALTER TABLE IF EXISTS "pack_campaign" DROP COLUMN IF EXISTS "gift_countdown_ends_at";`);
  }
}
