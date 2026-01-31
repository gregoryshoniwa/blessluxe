import { model } from "@medusajs/framework/utils";

const ProductReview = model.define("product_review", {
  id: model.id().primaryKey(),
  product_id: model.text().index("idx_review_product_id"),
  customer_id: model.text().index("idx_review_customer_id"),
  order_id: model.text().nullable(),
  title: model.text(),
  content: model.text(),
  rating: model.number(),
  is_verified_purchase: model.boolean().default(false),
  status: model.enum(["pending", "approved", "rejected"]).default("pending"),
  admin_response: model.text().nullable(),
  helpful_count: model.number().default(0),
  images: model.json().nullable(),
  metadata: model.json().nullable(),
});

export default ProductReview;
