/**
 * Loads a rich CustomerProfile for the text agent (Gemini): account, learned preferences,
 * purchase history, browsing signals, and prior AI session summaries — without touching voice (Gemini Live).
 */
import type { CustomerProfile } from '../types';
import { getCustomerById } from '@/lib/customer-account';
import { PreferenceStore } from '../memory/preference-store';
import { InteractionStore } from '../memory/interaction-store';
import { ConversationStore } from '../memory/conversation-store';
import { query, queryOne } from '@/lib/db';

const preferenceStore = new PreferenceStore();
const interactionStore = new InteractionStore();
const conversationStore = new ConversationStore();

export async function loadCustomerProfileForAgent(customerId: string): Promise<CustomerProfile | null> {
  const [account, prefs] = await Promise.all([getCustomerById(customerId), preferenceStore.get(customerId)]);

  if (!account && !prefs) return null;

  const firstName =
    (typeof account?.first_name === 'string' && account.first_name.trim()) ||
    (typeof account?.full_name === 'string' && String(account.full_name).split(/\s+/)[0]) ||
    'Valued';
  const lastName =
    (typeof account?.last_name === 'string' && account.last_name.trim()) ||
    (typeof account?.full_name === 'string' && String(account.full_name).split(/\s+/).slice(1).join(' ')) ||
    'Customer';
  const email = typeof account?.email === 'string' ? account.email : '';
  const memberSince =
    account?.created_at instanceof Date
      ? account.created_at.toISOString()
      : typeof account?.created_at === 'string'
        ? account.created_at
        : new Date().toISOString();

  const base: CustomerProfile = {
    id: customerId,
    firstName,
    lastName,
    email,
    memberSince,
    loyaltyTier: 'Standard',
    ...(prefs ?? {}),
  };

  const [orderContext, interactionExtras, sessionExtras] = await Promise.all([
    loadPurchaseContext(customerId),
    loadInteractionContext(customerId),
    loadPriorSessionSummaries(customerId),
  ]);

  return {
    ...base,
    ...orderContext,
    ...interactionExtras,
    ...sessionExtras,
  };
}

async function loadPurchaseContext(customerId: string): Promise<Partial<CustomerProfile>> {
  try {
    const countRow = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM customer_transaction WHERE customer_id = $1`,
      [customerId]
    );
    const totalOrders = parseInt(countRow?.c ?? '0', 10);
    if (totalOrders === 0) {
      return { totalOrders: 0 };
    }

    const recentTx = await query<{ id: string; order_number: string; created_at: string }>(
      `SELECT id, order_number, created_at
       FROM customer_transaction
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [customerId]
    );

    const last = recentTx[0];
    const lastPurchaseDate = last?.created_at;

    const ids = recentTx.map((t) => t.id).filter(Boolean);
    if (ids.length === 0) {
      return { totalOrders, lastPurchaseDate };
    }

    const rows = await query<{
      order_number: string;
      product_title: string;
      quantity: string;
      unit_price: string;
      created_at: string;
    }>(
      `SELECT t.order_number, i.product_title, i.quantity, i.unit_price, t.created_at
       FROM customer_transaction t
       JOIN customer_transaction_item i ON i.transaction_id = t.id AND i.customer_id = t.customer_id
       WHERE t.customer_id = $1 AND t.id = ANY($2::text[])
       ORDER BY t.created_at DESC, i.created_at ASC`,
      [customerId, ids]
    );

    const lines: string[] = [];
    const titles: string[] = [];
    let currentOrder = '';
    for (const r of rows) {
      const label = `${r.order_number} (${new Date(r.created_at).toLocaleDateString()})`;
      if (label !== currentOrder) {
        currentOrder = label;
        lines.push(`Order ${label}:`);
      }
      const q = parseInt(String(r.quantity), 10) || 1;
      lines.push(`  - ${r.product_title} ×${q}`);
      titles.push(r.product_title);
    }

    return {
      totalOrders,
      lastPurchaseDate,
      purchaseHistorySummary: lines.length ? lines.join('\n') : undefined,
      recentProductTitles: titles.length ? [...new Set(titles)].slice(0, 15) : undefined,
    };
  } catch (err) {
    console.warn('[customer-intelligence] purchase context skipped:', err);
    return {};
  }
}

async function loadInteractionContext(customerId: string): Promise<Partial<CustomerProfile>> {
  try {
    const [stats, searches] = await Promise.all([
      interactionStore.getStats(customerId),
      interactionStore.getRecentSearches(customerId, 8),
    ]);
    return {
      interactionStats: stats,
      recentSearches: searches.length ? searches : undefined,
    };
  } catch (err) {
    console.warn('[customer-intelligence] interaction context skipped:', err);
    return {};
  }
}

async function loadPriorSessionSummaries(customerId: string): Promise<Partial<CustomerProfile>> {
  try {
    const convos = await conversationStore.getConversationsByCustomer(customerId, 5);
    const summaries = convos
      .map((c) => c.summary)
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    return summaries.length ? { priorConversationSummaries: summaries } : {};
  } catch (err) {
    console.warn('[customer-intelligence] session summaries skipped:', err);
    return {};
  }
}
