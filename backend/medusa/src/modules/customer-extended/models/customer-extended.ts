import { model } from "@medusajs/framework/utils";

const CustomerExtended = model.define("customer_extended", {
  id: model.id().primaryKey(),
  customer_id: model.text().unique(),
  phone: model.text().nullable(),
  date_of_birth: model.dateTime().nullable(),
  gender: model.enum(["female", "male", "non_binary", "prefer_not_to_say"]).nullable(),
  style_preferences: model.json().nullable(),
  size_profile: model.json().nullable(),
  loyalty_points: model.number().default(0),
  loyalty_tier: model.enum(["bronze", "silver", "gold", "platinum"]).default("bronze"),
  referral_code: model.text().unique().nullable(),
  referred_by: model.text().nullable(),
  marketing_consent: model.boolean().default(false),
  metadata: model.json().nullable(),
});

export default CustomerExtended;
