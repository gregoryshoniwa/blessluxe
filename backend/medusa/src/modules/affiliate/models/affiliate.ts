import { model } from "@medusajs/framework/utils";

const Affiliate = model.define("affiliate", {
  id: model.id().primaryKey(),
  code: model.text().unique(),
  first_name: model.text(),
  last_name: model.text(),
  email: model.text().unique(),
  commission_rate: model.float().default(10),
  status: model.enum(["active", "inactive", "pending"]).default("pending"),
  total_earnings: model.bigNumber().default(0),
  paid_out: model.bigNumber().default(0),
  metadata: model.json().nullable(),
  sales: model.hasMany(() => AffiliateSale),
  payouts: model.hasMany(() => AffiliatePayout),
});

export default Affiliate;

// Forward-reference imports resolved by Medusa's module loader
import AffiliateSale from "./affiliate-sale";
import AffiliatePayout from "./affiliate-payout";
