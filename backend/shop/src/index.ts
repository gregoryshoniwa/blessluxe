import "./load-env.ts";
import express from "express";
import { storeCors } from "./middleware/cors.ts";
import { optionalApiKey } from "./middleware/auth.ts";
import { regionsRouter } from "./routes/regions.ts";
import { productsRouter } from "./routes/products.ts";
import { categoriesRouter } from "./routes/categories.ts";
import { headingsRouter } from "./routes/headings.ts";
import { cataloguesRouter } from "./routes/catalogues.ts";
import { reviewsRouter } from "./routes/reviews.ts";
import { campaignsRouter } from "./routes/campaigns.ts";
import { cartsRouter } from "./routes/carts.ts";
import { variantsRouter } from "./routes/variants.ts";
import { storeOrdersRouter } from "./routes/store-orders.ts";
import { storeAffiliatesRouter } from "./routes/store-affiliates.ts";
import { storePackagesRouter } from "./routes/store-packages.ts";
import { storeContentRouter } from "./routes/store-content.ts";
import { adminRouter } from "./routes/admin.ts";
import { authRouter } from "./routes/auth.ts";
import { customerAuthRouter } from "./routes/customer-auth.ts";

const app = express();
const port = Number(process.env.PORT || 9001);

app.use(express.json({ limit: "10mb" }));
app.use(storeCors());
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "./uploads"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, backend: "blessluxe-shop" });
});

// Store API (public, optional API key)
app.use("/store", optionalApiKey);
app.use("/store/regions", regionsRouter);
app.use("/store/products", productsRouter);
app.use("/store/product-categories", categoriesRouter);
app.use("/store/headings", headingsRouter);
app.use("/store/catalogues", cataloguesRouter);
app.use("/store/reviews", reviewsRouter);
app.use("/store/campaigns", campaignsRouter);
app.use("/store/product-variants", variantsRouter);
app.use("/store/carts", cartsRouter);
app.use("/store/orders", storeOrdersRouter);
app.use("/store/affiliates", storeAffiliatesRouter);
app.use("/store/packages", storePackagesRouter);
app.use("/store", storeContentRouter);

// Auth routes (admin login/logout/me/users)
app.use("/auth", authRouter);
// Storefront customer auth (signup/login/me/oauth)
app.use("/auth/customer", customerAuthRouter);

// Admin API (protected by JWT) — consumed by the Next.js admin at apps/admin/
app.use("/admin", adminRouter);

app.listen(port, () => {
  console.log(`BLESSLUXE Shop Backend listening on http://localhost:${port}`);
  console.log(`Admin app: http://localhost:3001`);
});
