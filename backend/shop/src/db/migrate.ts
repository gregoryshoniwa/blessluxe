import "../load-env.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./pool.ts";
import { ISO_COUNTRIES } from "./iso-countries.ts";
import { seedFaqs } from "./seed-faqs.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedCountries() {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM shop_country`
  );
  if (Number(rows[0]?.count || 0) > 0) return;
  console.log(`Seeding ${ISO_COUNTRIES.length} ISO countries...`);
  // Build a single parameterised INSERT to keep this fast and atomic.
  const values: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  ISO_COUNTRIES.forEach((c, idx) => {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
    params.push(c.code, c.name, false, idx);
  });
  await pool.query(
    `INSERT INTO shop_country (code, name, is_allowed, sort_order)
     VALUES ${values.join(", ")}
     ON CONFLICT (code) DO NOTHING`,
    params
  );
}

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf-8"
  );
  console.log("Running shop schema migration...");
  await pool.query(sql);
  await seedCountries();
  await seedFaqs();
  console.log("Shop schema migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
