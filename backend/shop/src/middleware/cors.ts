import cors from "cors";

export function storeCors() {
  const origins = (process.env.STORE_CORS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

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
