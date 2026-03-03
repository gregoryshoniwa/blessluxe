import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pool } from './index';

async function migrate() {
  console.log('[migrate] Running AI agent database migration...');
  const sql = readFileSync(resolve(__dirname, 'migration.sql'), 'utf-8');

  try {
    await pool.query(sql);
    console.log('[migrate] Migration completed successfully.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
