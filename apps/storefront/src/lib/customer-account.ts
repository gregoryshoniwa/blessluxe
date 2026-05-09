import { cookies } from "next/headers";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { execute, query, queryOne } from "@/lib/db";
import {
  shopBackendCustomerSignup,
  shopBackendCustomerLogin,
  shopBackendCustomerOauth,
  shopBackendCustomerMe,
} from "@/lib/shop-backend-client";

const SESSION_COOKIE = "customer_session";
const SHOP_TOKEN_COOKIE = "bl_shop_customer_token";
const SESSION_DAYS = 30;

let ensurePromise: Promise<void> | null = null;

async function ensureSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS customer_account (
          id text PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NULL,
          provider text NOT NULL DEFAULT 'credentials',
          email_verified boolean NOT NULL DEFAULT false,
          first_name text NULL,
          last_name text NULL,
          full_name text NULL,
          avatar_url text NULL,
          bio text NULL,
          address jsonb NULL,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_session (
          token text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_email_verification (
          id text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          token text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL,
          used boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_transaction (
          id text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          order_number text NOT NULL,
          amount numeric NOT NULL,
          currency_code text NOT NULL DEFAULT 'usd',
          status text NOT NULL DEFAULT 'paid',
          invoice_url text NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_transaction_item (
          id text PRIMARY KEY,
          transaction_id text NOT NULL REFERENCES customer_transaction(id) ON DELETE CASCADE,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          product_id text NOT NULL,
          product_handle text NULL,
          product_title text NOT NULL,
          quantity integer NOT NULL DEFAULT 1,
          unit_price numeric NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_customer_transaction_item_customer_product
         ON customer_transaction_item(customer_id, product_id)`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_customer_transaction_item_customer_handle
         ON customer_transaction_item(customer_id, product_handle)`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_support_ticket (
          id text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          subject text NOT NULL,
          message text NOT NULL,
          status text NOT NULL DEFAULT 'open',
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_social_post (
          id text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          content text NOT NULL,
          image_url text NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_social_comment (
          id text PRIMARY KEY,
          post_id text NOT NULL REFERENCES customer_social_post(id) ON DELETE CASCADE,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          content text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_inbox_message (
          id text PRIMARY KEY,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          category text NOT NULL DEFAULT 'notification',
          title text NOT NULL,
          body text NOT NULL,
          is_read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
    })();
  }

  await ensurePromise;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export async function createCustomerAccount(input: {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  provider?: "credentials" | "google";
}) {
  await ensureSchema();
  const email = input.email.trim().toLowerCase();
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM customer_account WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  if (existing) throw new Error("An account with this email already exists.");

  const firstName = input.firstName || "";
  const lastName = input.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const provider = input.provider || "credentials";

  // Source of truth lives on the shop backend.
  let id: string;
  let shopToken: string | null = null;
  if (provider === "credentials" && input.password) {
    const res = await shopBackendCustomerSignup({
      email,
      password: input.password,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
    });
    if (!res.ok || !res.data) {
      throw new Error(res.error || "Could not create account on shop backend.");
    }
    id = res.data.customer.id;
    shopToken = res.data.token;
  } else {
    // Google OAuth path is handled by findOrCreateGoogleCustomer; this branch
    // exists only for back-compat callers passing provider="google".
    id = `cust_${randomUUID().replace(/-/g, "")}`;
  }

  // Maintain a local shadow row so transaction/inbox/etc. tables (which FK
  // customer_id) keep working. We DO NOT store the password locally — the
  // shop backend is the password authority.
  await execute(
    `INSERT INTO customer_account
      (id, email, password_hash, provider, email_verified, first_name, last_name, full_name, metadata, created_at, updated_at)
     VALUES
      ($1, $2, NULL, $3, $4, $5, $6, $7, '{}'::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, email, provider, provider === "google", firstName, lastName, fullName || null]
  );

  if (shopToken) await setShopCustomerToken(shopToken);

  await seedCustomerStarterData(id);
  try {
    const { seedInitialLoyaltyForNewCustomer } = await import("@/lib/pack-loyalty");
    await seedInitialLoyaltyForNewCustomer(id);
  } catch {
    /* pack loyalty schema optional at bootstrap */
  }
  const account = await getCustomerById(id);
  if (!account) throw new Error("Failed to create account.");
  return account;
}

async function setShopCustomerToken(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SHOP_TOKEN_COOKIE,
    value: token,
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function getShopCustomerToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SHOP_TOKEN_COOKIE)?.value || null;
}

async function seedCustomerStarterData(customerId: string) {
  const tx1 = randomUUID();
  const tx2 = randomUUID();
  await execute(
    `INSERT INTO customer_transaction
      (id, customer_id, order_number, amount, currency_code, status, invoice_url, created_at)
     VALUES
      ($1, $3, 'BL-STARTER-001', 249.00, 'usd', 'paid', '/invoices/BL-STARTER-001.pdf', NOW() - INTERVAL '21 days'),
      ($2, $3, 'BL-STARTER-002', 129.00, 'usd', 'paid', '/invoices/BL-STARTER-002.pdf', NOW() - INTERVAL '9 days')`,
    [tx1, tx2, customerId]
  );

  await execute(
    `INSERT INTO customer_inbox_message
      (id, customer_id, category, title, body, is_read, created_at)
     VALUES
      ($1, $3, 'notification', 'Welcome to BLESSLUXE', 'Your account is ready. Complete your profile for faster checkout.', false, NOW() - INTERVAL '2 days'),
      ($2, $3, 'message', 'Style Team', 'Share your preferences on your personal page to get better recommendations.', false, NOW() - INTERVAL '1 day')`,
    [randomUUID(), randomUUID(), customerId]
  );
}

export async function getCustomerById(id: string) {
  await ensureSchema();
  return await queryOne<Record<string, unknown>>(
    `SELECT id, email, provider, email_verified, first_name, last_name, full_name, avatar_url, bio, address, metadata, created_at
     FROM customer_account
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
}

export async function getCustomerByEmail(email: string) {
  await ensureSchema();
  return await queryOne<Record<string, unknown>>(
    `SELECT id, email, password_hash, provider, email_verified, first_name, last_name, full_name, avatar_url, bio, address, metadata
     FROM customer_account
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
}

export async function findOrCreateGoogleCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  oauthSubject?: string;
  avatarUrl?: string;
}) {
  await ensureSchema();
  const email = input.email.trim().toLowerCase();
  const subject = input.oauthSubject || email;

  // 1) Source of truth: shop backend. Idempotent — finds-or-creates a
  //    shop_customer keyed on (oauth_provider, oauth_subject) → email → new.
  const res = await shopBackendCustomerOauth({
    provider: "google",
    subject,
    email,
    first_name: input.firstName,
    last_name: input.lastName,
    avatar_url: input.avatarUrl,
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Could not sync Google account to shop backend.");
  }
  const { customer, token } = res.data;
  await setShopCustomerToken(token);

  // 2) Local shadow row in customer_account. Two cases:
  //    (a) A row already exists for this email — re-use its id (it owns
  //        existing transactions, posts, inbox, etc., which we must not
  //        orphan). We leave its id untouched even if shop_customer.id
  //        differs — they're linked by email, which is unique on both sides.
  //    (b) No row yet — create one with shop_customer.id so future writes
  //        share the same id space.
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT id, first_name, last_name, full_name FROM customer_account WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  const localId = existing ? String(existing.id) : String(customer.id);

  if (existing) {
    // Refresh the row's name/provider/email_verified, but keep the id.
    await execute(
      `UPDATE customer_account
         SET provider = 'google',
             email_verified = true,
             first_name = COALESCE(NULLIF(first_name, ''), $2),
             last_name = COALESCE(NULLIF(last_name, ''), $3),
             full_name = COALESCE(NULLIF(full_name, ''), $4),
             updated_at = NOW()
       WHERE id = $1`,
      [
        localId,
        customer.first_name || input.firstName || "",
        customer.last_name || input.lastName || "",
        [customer.first_name || input.firstName, customer.last_name || input.lastName]
          .filter(Boolean)
          .join(" ") || null,
      ]
    );
  } else {
    await execute(
      `INSERT INTO customer_account
         (id, email, password_hash, provider, email_verified, first_name, last_name, full_name, metadata, created_at, updated_at)
       VALUES
         ($1, $2, NULL, 'google', true, $3, $4, $5, '{}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        localId,
        email,
        customer.first_name || input.firstName || "",
        customer.last_name || input.lastName || "",
        [customer.first_name || input.firstName, customer.last_name || input.lastName]
          .filter(Boolean)
          .join(" ") || null,
      ]
    );

    // Seed starter data only on first creation.
    await seedCustomerStarterData(localId);
    try {
      const { seedInitialLoyaltyForNewCustomer } = await import("@/lib/pack-loyalty");
      await seedInitialLoyaltyForNewCustomer(localId);
    } catch {
      /* optional */
    }
  }

  return await getCustomerById(localId);
}

export async function authenticateCustomer(email: string, password: string) {
  // Authoritative login is the shop backend. The local shadow row is reused
  // if a customer_account already exists for this email (so we don't orphan
  // their transactions / inbox / posts on the unique email constraint).
  await ensureSchema();
  const res = await shopBackendCustomerLogin(email, password);
  if (!res.ok || !res.data) return null;

  const { customer, token } = res.data;
  await setShopCustomerToken(token);

  const existing = await queryOne<Record<string, unknown>>(
    `SELECT id FROM customer_account WHERE lower(email) = lower($1) LIMIT 1`,
    [String(customer.email)]
  );
  const localId = existing ? String(existing.id) : String(customer.id);

  if (existing) {
    await execute(
      `UPDATE customer_account
         SET first_name = COALESCE(NULLIF(first_name, ''), $2),
             last_name = COALESCE(NULLIF(last_name, ''), $3),
             email_verified = $4 OR email_verified,
             updated_at = NOW()
       WHERE id = $1`,
      [
        localId,
        customer.first_name || "",
        customer.last_name || "",
        Boolean(customer.email_verified_at),
      ]
    );
  } else {
    await execute(
      `INSERT INTO customer_account
         (id, email, password_hash, provider, email_verified, first_name, last_name, full_name, metadata, created_at, updated_at)
       VALUES
         ($1, $2, NULL, 'credentials', $3, $4, $5, $6, '{}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        localId,
        String(customer.email),
        Boolean(customer.email_verified_at),
        customer.first_name || "",
        customer.last_name || "",
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
      ]
    );
  }

  return await getCustomerById(localId);
}

export async function createSession(customerId: string) {
  await ensureSchema();
  const token = randomBytes(32).toString("hex");
  await execute(
    `INSERT INTO customer_session (token, customer_id, expires_at, created_at)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval, NOW())`,
    [token, customerId, String(SESSION_DAYS)]
  );

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await execute(`DELETE FROM customer_session WHERE token = $1`, [token]);
  }
  cookieStore.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  // Also clear the shop backend session cookie so future calls hit /auth/customer/login again.
  cookieStore.set({
    name: SHOP_TOKEN_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function getCurrentCustomer() {
  await ensureSchema();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await queryOne<{ customer_id: string }>(
    `SELECT customer_id
     FROM customer_session
     WHERE token = $1
       AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  if (!session) return null;
  return await getCustomerById(session.customer_id);
}

export async function createEmailVerification(customerId: string) {
  await ensureSchema();
  const token = randomBytes(24).toString("hex");
  await execute(
    `INSERT INTO customer_email_verification
      (id, customer_id, token, expires_at, used, created_at)
     VALUES
      ($1, $2, $3, NOW() + INTERVAL '24 hours', false, NOW())`,
    [randomUUID(), customerId, token]
  );
  return token;
}

export async function verifyEmailToken(token: string) {
  await ensureSchema();
  const row = await queryOne<{ customer_id: string }>(
    `SELECT customer_id
     FROM customer_email_verification
     WHERE token = $1
       AND used = false
       AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  if (!row) return false;

  await execute(
    `UPDATE customer_email_verification
     SET used = true
     WHERE token = $1`,
    [token]
  );
  await execute(
    `UPDATE customer_account
     SET email_verified = true, updated_at = NOW()
     WHERE id = $1`,
    [row.customer_id]
  );
  return true;
}

export async function updateCustomerProfile(
  customerId: string,
  input: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    avatarUrl?: string;
    bio?: string;
    address?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await ensureSchema();
  await execute(
    `UPDATE customer_account
     SET first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         full_name = COALESCE($3, full_name),
         avatar_url = COALESCE($4, avatar_url),
         bio = COALESCE($5, bio),
         address = COALESCE($6::jsonb, address),
         metadata = COALESCE($7::jsonb, metadata),
         updated_at = NOW()
     WHERE id = $8`,
    [
      input.firstName ?? null,
      input.lastName ?? null,
      input.fullName ?? null,
      input.avatarUrl ?? null,
      input.bio ?? null,
      input.address ? JSON.stringify(input.address) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      customerId,
    ]
  );
}

/** Merge into existing `customer_account.metadata` (read–merge–write). */
export async function mergeCustomerMetadata(customerId: string, patch: Record<string, unknown>) {
  const row = await getCustomerById(customerId);
  const prev =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  await updateCustomerProfile(customerId, { metadata: { ...prev, ...patch } });
}

export async function listTransactions(customerId: string) {
  await ensureSchema();
  return await query<Record<string, unknown>>(
    `SELECT id, order_number, amount, currency_code, status, invoice_url, created_at
     FROM customer_transaction
     WHERE customer_id = $1
     ORDER BY created_at DESC`,
    [customerId]
  );
}

/** Order + line items for a single customer (e.g. PDF invoice). */
export async function getTransactionForInvoice(customerId: string, orderNumber: string) {
  await ensureSchema();
  const tx = await queryOne<{
    id: string;
    order_number: string;
    amount: unknown;
    currency_code: string;
    status: string;
    created_at: unknown;
  }>(
    `SELECT id, order_number, amount, currency_code, status, created_at
     FROM customer_transaction
     WHERE customer_id = $1 AND order_number = $2
     LIMIT 1`,
    [customerId, orderNumber]
  );
  if (!tx) return null;
  const items = await query<{
    product_title: string;
    quantity: unknown;
    unit_price: unknown;
  }>(
    `SELECT product_title, quantity, unit_price
     FROM customer_transaction_item
     WHERE transaction_id = $1 AND customer_id = $2
     ORDER BY created_at`,
    [tx.id, customerId]
  );
  return { transaction: tx, items };
}

export async function createTransactionRecord(
  customerId: string,
  input: {
    orderNumber: string;
    amount: number;
    currencyCode?: string;
    status?: string;
    invoiceUrl?: string | null;
    items: Array<{
      productId: string;
      productHandle?: string;
      productTitle: string;
      quantity: number;
      unitPrice: number;
    }>;
  }
) {
  await ensureSchema();
  const transactionId = randomUUID();
  await execute(
    `INSERT INTO customer_transaction
      (id, customer_id, order_number, amount, currency_code, status, invoice_url, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      transactionId,
      customerId,
      input.orderNumber,
      Number(input.amount || 0),
      input.currencyCode || "usd",
      input.status || "paid",
      input.invoiceUrl || null,
    ]
  );

  for (const item of input.items) {
    if (!String(item.productId || "").trim()) continue;
    await execute(
      `INSERT INTO customer_transaction_item
        (id, transaction_id, customer_id, product_id, product_handle, product_title, quantity, unit_price, created_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        randomUUID(),
        transactionId,
        customerId,
        String(item.productId),
        item.productHandle ? String(item.productHandle) : null,
        String(item.productTitle || "Product"),
        Math.max(1, Number(item.quantity || 1)),
        Math.max(0, Number(item.unitPrice || 0)),
      ]
    );
  }
}

export async function listTickets(customerId: string) {
  await ensureSchema();
  return await query<Record<string, unknown>>(
    `SELECT id, subject, message, status, created_at, updated_at
     FROM customer_support_ticket
     WHERE customer_id = $1
     ORDER BY created_at DESC`,
    [customerId]
  );
}

export async function createTicket(customerId: string, subject: string, message: string) {
  await ensureSchema();
  await execute(
    `INSERT INTO customer_support_ticket
      (id, customer_id, subject, message, status, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, 'open', NOW(), NOW())`,
    [randomUUID(), customerId, subject, message]
  );
}

export async function listPosts() {
  await ensureSchema();
  return await query<Record<string, unknown>>(
    `SELECT p.id, p.customer_id, p.content, p.image_url, p.created_at,
            c.full_name, c.avatar_url
     FROM customer_social_post p
     INNER JOIN customer_account c ON c.id = p.customer_id
     ORDER BY p.created_at DESC
     LIMIT 100`
  );
}

export async function createPost(customerId: string, content: string, imageUrl?: string) {
  await ensureSchema();
  await execute(
    `INSERT INTO customer_social_post
      (id, customer_id, content, image_url, created_at)
     VALUES
      ($1, $2, $3, $4, NOW())`,
    [randomUUID(), customerId, content, imageUrl || null]
  );
}

export async function listComments(postId: string) {
  await ensureSchema();
  return await query<Record<string, unknown>>(
    `SELECT cm.id, cm.post_id, cm.customer_id, cm.content, cm.created_at, c.full_name, c.avatar_url
     FROM customer_social_comment cm
     INNER JOIN customer_account c ON c.id = cm.customer_id
     WHERE cm.post_id = $1
     ORDER BY cm.created_at ASC`,
    [postId]
  );
}

export async function createComment(customerId: string, postId: string, content: string) {
  await ensureSchema();
  await execute(
    `INSERT INTO customer_social_comment
      (id, post_id, customer_id, content, created_at)
     VALUES
      ($1, $2, $3, $4, NOW())`,
    [randomUUID(), postId, customerId, content]
  );
}

export async function listInbox(customerId: string) {
  await ensureSchema();
  return await query<Record<string, unknown>>(
    `SELECT id, category, title, body, is_read, created_at
     FROM customer_inbox_message
     WHERE customer_id = $1
     ORDER BY created_at DESC`,
    [customerId]
  );
}

export async function markInboxRead(customerId: string, id: string) {
  await ensureSchema();
  await execute(
    `UPDATE customer_inbox_message
     SET is_read = true
     WHERE id = $1 AND customer_id = $2`,
    [id, customerId]
  );
}

