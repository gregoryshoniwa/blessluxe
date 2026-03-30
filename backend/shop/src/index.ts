import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storeCors } from "./middleware/cors.ts";
import { optionalApiKey } from "./middleware/auth.ts";
import { regionsRouter } from "./routes/regions.ts";
import { productsRouter } from "./routes/products.ts";
import { categoriesRouter } from "./routes/categories.ts";
import { cartsRouter } from "./routes/carts.ts";
import { variantsRouter } from "./routes/variants.ts";
import { adminRouter } from "./routes/admin.ts";
import { authRouter } from "./routes/auth.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
app.use("/store/product-variants", variantsRouter);
app.use("/store/carts", cartsRouter);

// Auth routes (login/logout/me/users)
app.use("/auth", authRouter);

// Admin API (protected by JWT)
app.use("/admin", adminRouter);

// Admin dashboard (static SPA)
app.use("/app", express.static(path.join(__dirname, "../admin-ui")));
app.get("/app/*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../admin-ui/index.html"));
});

app.listen(port, () => {
  console.log(`BLESSLUXE Shop Backend listening on http://localhost:${port}`);
  console.log(`Admin dashboard: http://localhost:${port}/app`);
});
