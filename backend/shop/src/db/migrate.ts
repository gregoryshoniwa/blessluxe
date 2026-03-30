import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./pool.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf-8"
  );
  console.log("Running shop schema migration...");
  await pool.query(sql);
  console.log("Shop schema migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
