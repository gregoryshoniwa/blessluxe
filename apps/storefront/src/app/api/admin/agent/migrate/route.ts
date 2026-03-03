import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pool } from '@/lib/db';

/**
 * POST /api/admin/agent/migrate — Run the AI database migration
 * This creates all required tables and the pgvector extension.
 */
export async function POST() {
  try {
    const sqlPath = resolve(process.cwd(), 'src/lib/db/migration.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    await pool.query(sql);

    return NextResponse.json({
      success: true,
      message: 'AI agent database migration completed successfully.',
      tables: [
        'ai_conversations',
        'ai_messages',
        'ai_customer_memories',
        'ai_customer_interactions',
        'ai_customer_preferences',
        'ai_event_subscriptions',
        'ai_reminders',
      ],
    });
  } catch (err) {
    console.error('[API /admin/agent/migrate] error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Migration failed', details: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/agent/migrate — Check migration status
 */
export async function GET() {
  try {
    const tables = [
      'ai_conversations',
      'ai_messages',
      'ai_customer_memories',
      'ai_customer_interactions',
      'ai_customer_preferences',
      'ai_event_subscriptions',
      'ai_reminders',
    ];

    const results: Record<string, boolean> = {};

    for (const table of tables) {
      try {
        await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
        results[table] = true;
      } catch {
        results[table] = false;
      }
    }

    let pgvectorInstalled = false;
    try {
      await pool.query(`SELECT 'test'::vector(3)`);
      pgvectorInstalled = true;
    } catch {
      pgvectorInstalled = false;
    }

    const allReady = Object.values(results).every(Boolean) && pgvectorInstalled;

    return NextResponse.json({
      status: allReady ? 'ready' : 'pending',
      pgvector: pgvectorInstalled,
      tables: results,
    });
  } catch (err) {
    console.error('[API /admin/agent/migrate] GET error:', err);
    return NextResponse.json(
      { error: 'Cannot connect to database', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
