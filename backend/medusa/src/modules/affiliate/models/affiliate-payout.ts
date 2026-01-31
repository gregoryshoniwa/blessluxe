import { model } from "@medusajs/framework/utils";
import Affiliate from "./affiliate";

const AffiliatePayout = model.define("affiliate_payout", {
  id: model.id().primaryKey(),
  affiliate: model.belongsTo(() => Affiliate, { mappedBy: "payouts" }),
  amount: model.bigNumber(),
  currency_code: model.text().default("usd"),
  method: model.enum(["bank_transfer", "paypal", "stripe"]).default("bank_transfer"),
  status: model.enum(["pending", "processing", "completed", "failed"]).default("pending"),
  reference: model.text().nullable(),
  notes: model.text().nullable(),
  metadata: model.json().nullable(),
});

export default AffiliatePayout;
