/**
 * Loads environment variables from a chain of `.env` files BEFORE any other
 * module reads `process.env`. Must be imported first in `index.ts` (and any
 * one-shot script like `seed.ts` / `migrate.ts`).
 *
 * Order (earlier wins — later files only fill in vars that are still unset):
 *   1. backend/shop/.env          ← shop-backend specific overrides
 *   2. apps/storefront/.env.local ← shared keys (GOOGLE_AI_API_KEY, SMTP_*, etc.)
 *   3. <repo-root>/.env           ← deploy-time defaults
 *
 * Uses Node 22+ `process.loadEnvFile()` (available since 21.7).
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const candidates = [
  path.join(__dirname, "..", ".env"),
  path.join(repoRoot, "apps/storefront/.env.local"),
  path.join(repoRoot, ".env"),
];

for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  try {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore unreadable file */
  }
}
