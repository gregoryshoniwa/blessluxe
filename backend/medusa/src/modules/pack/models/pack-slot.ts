import { model } from "@medusajs/framework/utils";

/** One size slot in a campaign. */
const PackSlot = model.define("pack_slot", {
  id: model.id().primaryKey(),
  pack_campaign_id: model.text().index("idx_pack_slot_campaign_id"),
  variant_id: model.text().index("idx_pack_slot_variant_id"),
  size_label: model.text(),
  status: model.enum(["available", "reserved", "paid", "void"]).default("available"),
  /** Medusa customer id when reserved/paid */
  customer_id: model.text().nullable(),
  order_id: model.text().nullable(),
  line_item_id: model.text().nullable(),
  /** Human-facing code for pickup / fulfillment (unique when set). */
  collection_code: model.text().nullable(),
  reserved_until: model.dateTime().nullable(),
  /** reserved = pay later when pack completes; paid = checkout completed */
  commitment: model.enum(["none", "pay_now", "pay_when_complete"]).default("none"),
  metadata: model.json().nullable(),
});

export default PackSlot;
