import Medusa from "@medusajs/js-sdk";

// Medusa client configuration
const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

// Initialize Medusa JS SDK client
export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
});

// Re-export for convenience
export { MEDUSA_BACKEND_URL };
