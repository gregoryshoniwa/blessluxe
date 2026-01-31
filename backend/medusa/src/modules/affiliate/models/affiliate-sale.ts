import { model } from "@medusajs/framework/utils";
import Affiliate from "./affiliate";

const AffiliateSale = model.define("affiliate_sale", {
  id: model.id().primaryKey(),
  affiliate: model.belongsTo(() => Affiliate, { mappedBy: "sales" }),
  order_id: model.text(),
  order_total: model.bigNumber(),
  commission_amount: model.bigNumber(),
  currency_code: model.text().default("usd"),
  status: model.enum(["pending", "approved", "rejected"]).default("pending"),
  metadata: model.json().nullable(),
});

export default AffiliateSale;
