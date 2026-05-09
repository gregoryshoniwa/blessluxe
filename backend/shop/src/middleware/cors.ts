import cors from "cors";

/**
 * CORS for both /store/* (storefront) and /admin/* + /auth/* (admin app).
 * Combines STORE_CORS and ADMIN_CORS so a single global middleware covers
 * both surfaces — the admin's `POST /auth/login` is otherwise blocked by
 * the browser when its origin (e.g. http://localhost:3001) isn't allowed.
 */
export function storeCors() {
  const fromEnv = (key: string) =>
    (process.env[key] || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

  const origins = Array.from(
    new Set([
      ...fromEnv("STORE_CORS"),
      ...fromEnv("ADMIN_CORS"),
      "http://localhost:3000",
      "http://localhost:3001",
    ])
  );

  return cors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-publishable-api-key",
      "Accept",
    ],
  });
}
