/**
 * DB-only customer lookup for email sending — avoids `next/headers` so modules that
 * import the tool registry (e.g. Gemini Live bundled for the client) do not pull in
 * `customer-account.ts`.
 */
import { queryOne } from '@/lib/db';

export async function getCustomerAccountForAgentEmail(customerId: string): Promise<{
  email: string | null;
  firstName?: string;
}> {
  const row = await queryOne<{
    email: string;
    first_name: string | null;
    full_name: string | null;
  }>(
    `SELECT email, first_name, full_name FROM customer_account WHERE id = $1 LIMIT 1`,
    [customerId]
  );
  if (!row?.email?.trim()) {
    return { email: null };
  }
  const firstName =
    (typeof row.first_name === 'string' && row.first_name.trim()) ||
    (typeof row.full_name === 'string' && row.full_name.split(/\s+/)[0]) ||
    undefined;
  return { email: row.email.trim(), firstName };
}
