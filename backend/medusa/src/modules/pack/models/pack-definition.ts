import { model } from "@medusajs/framework/utils";

/** Wholesale pack: one Medusa product whose variants = one slot each (sizes). */
const PackDefinition = model.define("pack_definition", {
  id: model.id().primaryKey(),
  product_id: model.text().index("idx_pack_def_product_id"),
  title: model.text(),
  handle: model.text().unique(),
  description: model.text().nullable(),
  status: model.enum(["draft", "published"]).default("draft"),
  metadata: model.json().nullable(),
});

export default PackDefinition;
