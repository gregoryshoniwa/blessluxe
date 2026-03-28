import { model } from "@medusajs/framework/utils";

/** A running group-buy for one pack on an affiliate storefront. */
const PackCampaign = model.define("pack_campaign", {
  id: model.id().primaryKey(),
  pack_definition_id: model.text().index("idx_pack_campaign_def_id"),
  /** `affiliate.id` from affiliate module */
  affiliate_id: model.text().index("idx_pack_campaign_affiliate_id"),
  /** Short code for URLs (unique) */
  public_code: model.text().unique(),
  status: model
    .enum(["open", "filling", "ready_to_process", "processing", "fulfilled", "cancelled"])
    .default("open"),
  expires_at: model.dateTime().nullable(),
  /** UTC instant: pay at or before this time to earn `gift_blits_prize` Blits (server-validated). */
  gift_countdown_ends_at: model.dateTime().nullable(),
  /** Blits granted per qualifying line when `gift_allocation_type` is `fixed_per_payment`. */
  gift_blits_prize: model.number().nullable(),
  /**
   * `fixed_per_payment` — `gift_blits_prize` per line before deadline.
   * `equal_pool` / `fcfs_pool` — split `gift_blits_pool` after deadline among qualifying payments.
   * `custom_per_size` — `gift_custom_per_size` map (variant_id → blits) per line before deadline.
   */
  gift_allocation_type: model
    .enum(["fixed_per_payment", "equal_pool", "fcfs_pool", "custom_per_size"])
    .default("fixed_per_payment"),
  /** Total Blits pool for `equal_pool` and `fcfs_pool` (split after countdown). */
  gift_blits_pool: model.number().nullable(),
  /** JSON map of Medusa variant_id → Blits for `custom_per_size`. */
  gift_custom_per_size: model.json().nullable(),
  metadata: model.json().nullable(),
});

export default PackCampaign;
