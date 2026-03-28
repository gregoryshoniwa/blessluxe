import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260327214342 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack_definition" drop constraint if exists "pack_definition_handle_unique";`);
    this.addSql(`alter table if exists "pack_campaign" drop constraint if exists "pack_campaign_public_code_unique";`);
    this.addSql(`create table if not exists "pack_campaign" ("id" text not null, "pack_definition_id" text not null, "affiliate_id" text not null, "public_code" text not null, "status" text check ("status" in ('open', 'filling', 'ready_to_process', 'processing', 'fulfilled', 'cancelled')) not null default 'open', "expires_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pack_campaign_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_campaign_def_id" ON "pack_campaign" ("pack_definition_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_campaign_affiliate_id" ON "pack_campaign" ("affiliate_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pack_campaign_public_code_unique" ON "pack_campaign" ("public_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pack_campaign_deleted_at" ON "pack_campaign" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pack_definition" ("id" text not null, "product_id" text not null, "title" text not null, "handle" text not null, "description" text null, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pack_definition_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_def_product_id" ON "pack_definition" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pack_definition_handle_unique" ON "pack_definition" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pack_definition_deleted_at" ON "pack_definition" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pack_event" ("id" text not null, "pack_campaign_id" text not null, "event_type" text not null, "message" text null, "payload" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pack_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_event_campaign_id" ON "pack_event" ("pack_campaign_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_event_type" ON "pack_event" ("event_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pack_event_deleted_at" ON "pack_event" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pack_slot" ("id" text not null, "pack_campaign_id" text not null, "variant_id" text not null, "size_label" text not null, "status" text check ("status" in ('available', 'reserved', 'paid', 'void')) not null default 'available', "customer_id" text null, "order_id" text null, "line_item_id" text null, "reserved_until" timestamptz null, "commitment" text check ("commitment" in ('none', 'pay_now', 'pay_when_complete')) not null default 'none', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pack_slot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_slot_campaign_id" ON "pack_slot" ("pack_campaign_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_pack_slot_variant_id" ON "pack_slot" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pack_slot_deleted_at" ON "pack_slot" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "pack_campaign" cascade;`);

    this.addSql(`drop table if exists "pack_definition" cascade;`);

    this.addSql(`drop table if exists "pack_event" cascade;`);

    this.addSql(`drop table if exists "pack_slot" cascade;`);
  }

}
