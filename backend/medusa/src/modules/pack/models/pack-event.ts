import { model } from "@medusajs/framework/utils";

/** Audit trail + notification hooks for pack campaigns. */
const PackEvent = model.define("pack_event", {
  id: model.id().primaryKey(),
  pack_campaign_id: model.text().index("idx_pack_event_campaign_id"),
  event_type: model.text().index("idx_pack_event_type"),
  message: model.text().nullable(),
  payload: model.json().nullable(),
});

export default PackEvent;
