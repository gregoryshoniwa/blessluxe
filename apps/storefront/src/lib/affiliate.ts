import { execute, query, queryOne } from "@/lib/db";
import { randomUUID } from "crypto";

export type AffiliateStatus = "active" | "inactive" | "pending";
export type PayoutMethod = "bank_transfer" | "paypal" | "stripe";

export interface AffiliateRecord {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string;
  commission_rate: number;
  status: AffiliateStatus;
  total_earnings: string;
  paid_out: string;
  metadata: Record<string, unknown> | null;
}

export interface AffiliateSaleRecord {
  id: string;
  affiliate_id: string;
  order_id: string;
  order_total: string;
  commission_amount: string;
  currency_code: string;
  status: "pending" | "approved" | "rejected";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AffiliatePayoutRecord {
  id: string;
  affiliate_id: string;
  amount: string;
  currency_code: string;
  method: PayoutMethod;
  status: "pending" | "processing" | "completed" | "failed";
  reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const MIN_PAYOUT_THRESHOLD = 50;
let ensureTablesPromise: Promise<void> | null = null;

async function ensureAffiliateTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate (
          id text PRIMARY KEY,
          code text UNIQUE NOT NULL,
          first_name text NOT NULL,
          last_name text NOT NULL,
          email text UNIQUE NOT NULL,
          commission_rate numeric NOT NULL DEFAULT 10,
          status text NOT NULL DEFAULT 'pending',
          total_earnings numeric NOT NULL DEFAULT 0,
          paid_out numeric NOT NULL DEFAULT 0,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_sale (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          order_id text NOT NULL,
          order_total numeric NOT NULL,
          commission_amount numeric NOT NULL,
          currency_code text NOT NULL DEFAULT 'usd',
          status text NOT NULL DEFAULT 'pending',
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_payout (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          amount numeric NOT NULL,
          currency_code text NOT NULL DEFAULT 'usd',
          method text NOT NULL DEFAULT 'bank_transfer',
          status text NOT NULL DEFAULT 'pending',
          reference text NULL,
          notes text NULL,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_post (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          caption text NOT NULL,
          image_url text NOT NULL,
          moderation_status text NOT NULL DEFAULT 'approved',
          moderation_notes text NULL,
          moderated_by text NULL,
          moderated_at timestamptz NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_media_asset (
          id text PRIMARY KEY,
          affiliate_id text NULL REFERENCES affiliate(id) ON DELETE SET NULL,
          customer_id text NULL REFERENCES customer_account(id) ON DELETE SET NULL,
          source text NOT NULL,
          original_url text NOT NULL,
          generated_url text NULL,
          published boolean NOT NULL DEFAULT false,
          published_post_id text NULL REFERENCES affiliate_social_post(id) ON DELETE SET NULL,
          prompt text NULL,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_post_tag (
          id text PRIMARY KEY,
          post_id text NOT NULL REFERENCES affiliate_social_post(id) ON DELETE CASCADE,
          product_handle text NULL,
          product_title text NOT NULL,
          product_url text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_like (
          id text PRIMARY KEY,
          post_id text NOT NULL REFERENCES affiliate_social_post(id) ON DELETE CASCADE,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          UNIQUE (post_id, customer_id)
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_comment (
          id text PRIMARY KEY,
          post_id text NOT NULL REFERENCES affiliate_social_post(id) ON DELETE CASCADE,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          content text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_social_follow (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          UNIQUE (affiliate_id, customer_id)
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_store_product (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          product_id text NOT NULL,
          product_handle text NOT NULL,
          product_title text NOT NULL,
          product_url text NOT NULL,
          image_url text NULL,
          variant_id text NULL,
          variant_title text NULL,
          price_amount numeric NULL,
          currency_code text NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          UNIQUE (affiliate_id, product_id)
        )`
      );

      await execute(
        `ALTER TABLE affiliate_social_post
         ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved'`
      );
      await execute(
        `ALTER TABLE affiliate_social_post
         ALTER COLUMN moderation_status SET DEFAULT 'approved'`
      );
      await execute(
        `UPDATE affiliate_social_post
         SET moderation_status = 'approved',
             updated_at = NOW()
         WHERE moderation_status = 'pending'`
      );
      await execute(
        `ALTER TABLE affiliate_social_post
         ADD COLUMN IF NOT EXISTS moderation_notes text NULL`
      );
      await execute(
        `ALTER TABLE affiliate_social_post
         ADD COLUMN IF NOT EXISTS moderated_by text NULL`
      );
      await execute(
        `ALTER TABLE affiliate_social_post
         ADD COLUMN IF NOT EXISTS moderated_at timestamptz NULL`
      );
      await execute(
        `ALTER TABLE affiliate_social_media_asset
         ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false`
      );
      await execute(
        `ALTER TABLE affiliate_social_media_asset
         ADD COLUMN IF NOT EXISTS published_post_id text NULL REFERENCES affiliate_social_post(id) ON DELETE SET NULL`
      );
    })();
  }

  await ensureTablesPromise;
}

export async function ensureAffiliateSchema() {
  await ensureAffiliateTables();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generateAffiliateCode(firstName: string, lastName: string) {
  const base = `${firstName}${lastName}`.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = (base || "AFF").slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

export async function getAffiliateByEmail(email: string) {
  await ensureAffiliateTables();
  return await queryOne<AffiliateRecord>(
    `SELECT id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata
     FROM affiliate
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );
}

export async function getAffiliateByCode(code: string) {
  await ensureAffiliateTables();
  return await queryOne<AffiliateRecord>(
    `SELECT id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata
     FROM affiliate
     WHERE lower(code) = lower($1)
     LIMIT 1`,
    [code]
  );
}

export async function createAffiliateApplication(input: {
  firstName: string;
  lastName: string;
  email: string;
  notes?: string;
}) {
  await ensureAffiliateTables();
  const existing = await getAffiliateByEmail(input.email);
  if (existing) {
    if (existing.status !== "active") {
      await execute(
        `UPDATE affiliate
         SET status = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [existing.id]
      );
      const upgraded = await getAffiliateByEmail(input.email);
      if (upgraded) return upgraded;
    }
    return existing;
  }

  const code = generateAffiliateCode(input.firstName, input.lastName);
  await execute(
    `INSERT INTO affiliate
      (id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, 10, 'active', 0, 0, $6::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      code,
      input.firstName,
      input.lastName,
      input.email,
      JSON.stringify({
        application_notes: input.notes || "",
        source: "storefront-application",
      }),
    ]
  );

  const created = await getAffiliateByEmail(input.email);
  if (!created) throw new Error("Failed to create affiliate application");
  return created;
}

export async function listAffiliateSales(affiliateId: string, limit = 50) {
  await ensureAffiliateTables();
  return await query<AffiliateSaleRecord>(
    `SELECT id, affiliate_id, order_id, order_total, commission_amount, currency_code, status, metadata, created_at
     FROM affiliate_sale
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [affiliateId, limit]
  );
}

export async function listAffiliatePayouts(affiliateId: string, limit = 20) {
  await ensureAffiliateTables();
  return await query<AffiliatePayoutRecord>(
    `SELECT id, affiliate_id, amount, currency_code, method, status, reference, notes, metadata, created_at
     FROM affiliate_payout
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [affiliateId, limit]
  );
}

export async function get30DayEarningsSeries(affiliateId: string) {
  await ensureAffiliateTables();
  const rows = await query<{ day: string; amount: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COALESCE(SUM(commission_amount), 0)::text AS amount
     FROM affiliate_sale
     WHERE affiliate_id = $1
       AND status = 'approved'
       AND created_at >= NOW() - INTERVAL '30 days'
     GROUP BY 1
     ORDER BY 1 ASC`,
    [affiliateId]
  );

  const map = new Map(rows.map((r) => [r.day, toNumber(r.amount)]));
  const points: Array<{ day: string; amount: number }> = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ day: key, amount: map.get(key) ?? 0 });
  }
  return points;
}

export function computeAvailableBalance(affiliate: AffiliateRecord, payouts: AffiliatePayoutRecord[]) {
  const total = toNumber(affiliate.total_earnings);
  const paidOut = toNumber(affiliate.paid_out);
  const pending = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((sum, payout) => sum + toNumber(payout.amount), 0);
  return Math.max(0, total - paidOut - pending);
}

export async function createCommissionFromOrder(input: {
  affiliateCode: string;
  orderId: string;
  orderTotal: number;
  currencyCode?: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureAffiliateTables();
  const affiliate = await getAffiliateByCode(input.affiliateCode);
  if (!affiliate || affiliate.status !== "active") return null;

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM affiliate_sale WHERE order_id = $1 AND affiliate_id = $2 LIMIT 1`,
    [input.orderId, affiliate.id]
  );
  if (existing) return affiliate;

  const commissionAmount = Number(
    ((input.orderTotal * affiliate.commission_rate) / 100).toFixed(2)
  );

  await execute(
    `INSERT INTO affiliate_sale
      (id, affiliate_id, order_id, order_total, commission_amount, currency_code, status, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, 'approved', $7::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      affiliate.id,
      input.orderId,
      input.orderTotal,
      commissionAmount,
      input.currencyCode || "usd",
      JSON.stringify(input.metadata || {}),
    ]
  );

  await execute(
    `UPDATE affiliate
     SET total_earnings = COALESCE(total_earnings, 0) + $1,
         updated_at = NOW()
     WHERE id = $2`,
    [commissionAmount, affiliate.id]
  );

  return await getAffiliateByCode(input.affiliateCode);
}

export async function requestAffiliatePayout(input: {
  affiliate: AffiliateRecord;
  amount: number;
  method: PayoutMethod;
  notes?: string;
  details?: Record<string, unknown>;
}) {
  await ensureAffiliateTables();
  const payouts = await listAffiliatePayouts(input.affiliate.id, 100);
  const available = computeAvailableBalance(input.affiliate, payouts);

  if (input.amount < MIN_PAYOUT_THRESHOLD) {
    throw new Error(`Minimum payout amount is $${MIN_PAYOUT_THRESHOLD}`);
  }
  if (input.amount > available) {
    throw new Error("Requested payout exceeds available balance");
  }

  await execute(
    `INSERT INTO affiliate_payout
      (id, affiliate_id, amount, currency_code, method, status, notes, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, 'usd', $4, 'pending', $5, $6::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      input.affiliate.id,
      input.amount,
      input.method,
      input.notes || null,
      JSON.stringify(input.details || {}),
    ]
  );
}

export function getPayoutThreshold() {
  return MIN_PAYOUT_THRESHOLD;
}

type SocialTagInput = {
  productTitle: string;
  productUrl: string;
  productHandle?: string;
};

export async function createAffiliateSocialPost(input: {
  affiliateId: string;
  caption: string;
  imageUrl: string;
  tags: SocialTagInput[];
}) {
  await ensureAffiliateTables();
  const postId = randomUUID();
  await execute(
    `INSERT INTO affiliate_social_post
      (id, affiliate_id, caption, image_url, moderation_status, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, 'approved', NOW(), NOW())`,
    [postId, input.affiliateId, input.caption, input.imageUrl]
  );

  for (const tag of input.tags) {
    await execute(
      `INSERT INTO affiliate_social_post_tag
        (id, post_id, product_handle, product_title, product_url, created_at)
       VALUES
        ($1, $2, $3, $4, $5, NOW())`,
      [
        randomUUID(),
        postId,
        tag.productHandle || null,
        tag.productTitle,
        tag.productUrl,
      ]
    );
  }
  return postId;
}

export async function toggleAffiliatePostLike(postId: string, customerId: string) {
  await ensureAffiliateTables();
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT id FROM affiliate_social_like WHERE post_id = $1 AND customer_id = $2 LIMIT 1`,
    [postId, customerId]
  );
  if (existing?.id) {
    await execute(`DELETE FROM affiliate_social_like WHERE id = $1`, [existing.id]);
    return { liked: false };
  }
  await execute(
    `INSERT INTO affiliate_social_like (id, post_id, customer_id, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [randomUUID(), postId, customerId]
  );
  return { liked: true };
}

export async function addAffiliatePostComment(postId: string, customerId: string, content: string) {
  await ensureAffiliateTables();
  await execute(
    `INSERT INTO affiliate_social_comment (id, post_id, customer_id, content, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [randomUUID(), postId, customerId, content]
  );
}

export async function toggleAffiliateFollow(affiliateId: string, customerId: string) {
  await ensureAffiliateTables();
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT id FROM affiliate_social_follow WHERE affiliate_id = $1 AND customer_id = $2 LIMIT 1`,
    [affiliateId, customerId]
  );
  if (existing?.id) {
    await execute(`DELETE FROM affiliate_social_follow WHERE id = $1`, [existing.id]);
    return { following: false };
  }
  await execute(
    `INSERT INTO affiliate_social_follow (id, affiliate_id, customer_id, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [randomUUID(), affiliateId, customerId]
  );
  return { following: true };
}

export async function getAffiliateSocialFeed(code: string, viewerCustomerId?: string) {
  await ensureAffiliateTables();
  const affiliate = await getAffiliateByCode(code);
  if (!affiliate) return null;

  const isOwner = !!viewerCustomerId
    ? await queryOne<Record<string, unknown>>(
        `SELECT id FROM customer_account
         WHERE id = $1
           AND lower(email) = lower($2)
         LIMIT 1`,
        [viewerCustomerId, affiliate.email]
      )
    : null;

  const posts = await query<Record<string, unknown>>(
    `SELECT p.id, p.caption, p.image_url, p.created_at, p.moderation_status, p.moderation_notes
     FROM affiliate_social_post p
     WHERE p.affiliate_id = $1
       AND ($2::boolean = true OR p.moderation_status <> 'rejected')
     ORDER BY p.created_at DESC
     LIMIT 100`,
    [affiliate.id, Boolean(isOwner?.id)]
  );

  const postIds = posts.map((p) => String(p.id));
  const tags = postIds.length
    ? await query<Record<string, unknown>>(
        `SELECT post_id, product_handle, product_title, product_url
         FROM affiliate_social_post_tag
         WHERE post_id = ANY($1::text[])`,
        [postIds]
      )
    : [];

  const likes = postIds.length
    ? await query<Record<string, unknown>>(
        `SELECT post_id, COUNT(*)::int AS count
         FROM affiliate_social_like
         WHERE post_id = ANY($1::text[])
         GROUP BY post_id`,
        [postIds]
      )
    : [];

  const comments = postIds.length
    ? await query<Record<string, unknown>>(
        `SELECT c.id, c.post_id, c.customer_id, c.content, c.created_at, a.full_name, a.avatar_url
         FROM affiliate_social_comment c
         INNER JOIN customer_account a ON a.id = c.customer_id
         WHERE c.post_id = ANY($1::text[])
         ORDER BY c.created_at DESC`,
        [postIds]
      )
    : [];

  const viewerLikes =
    viewerCustomerId && postIds.length
      ? await query<Record<string, unknown>>(
          `SELECT post_id
           FROM affiliate_social_like
           WHERE post_id = ANY($1::text[])
             AND customer_id = $2`,
          [postIds, viewerCustomerId]
        )
      : [];

  const followerCountRow = await queryOne<Record<string, unknown>>(
    `SELECT COUNT(*)::int AS count
     FROM affiliate_social_follow
     WHERE affiliate_id = $1`,
    [affiliate.id]
  );

  const isFollowing = viewerCustomerId
    ? await queryOne<Record<string, unknown>>(
        `SELECT id FROM affiliate_social_follow WHERE affiliate_id = $1 AND customer_id = $2 LIMIT 1`,
        [affiliate.id, viewerCustomerId]
      )
    : null;

  const tagsByPost = new Map<string, Record<string, unknown>[]>();
  for (const tag of tags) {
    const key = String(tag.post_id);
    const list = tagsByPost.get(key) || [];
    list.push(tag);
    tagsByPost.set(key, list);
  }

  const likeCountByPost = new Map(likes.map((l) => [String(l.post_id), Number(l.count || 0)]));
  const commentsByPost = new Map<string, Record<string, unknown>[]>();
  for (const comment of comments) {
    const key = String(comment.post_id);
    const list = commentsByPost.get(key) || [];
    list.push(comment);
    commentsByPost.set(key, list);
  }
  const likedSet = new Set(viewerLikes.map((l) => String(l.post_id)));

  const storeProducts = await query<Record<string, unknown>>(
    `SELECT id, product_id, product_handle, product_title, product_url, image_url, variant_id, variant_title, price_amount, currency_code
     FROM affiliate_store_product
     WHERE affiliate_id = $1
     ORDER BY created_at DESC`,
    [affiliate.id]
  );

  const mediaAssets = await query<Record<string, unknown>>(
    `SELECT id, generated_url, original_url, created_at, published, published_post_id
     FROM affiliate_social_media_asset
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [affiliate.id]
  );

  return {
    affiliate: {
      id: affiliate.id,
      code: affiliate.code,
      name: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
      status: affiliate.status,
      email: affiliate.email,
      followers: Number(followerCountRow?.count || 0),
      isFollowing: Boolean(isFollowing?.id),
    },
    posts: posts.map((post) => {
      const postId = String(post.id);
      return {
        ...post,
        tags: tagsByPost.get(postId) || [],
        likes: likeCountByPost.get(postId) || 0,
        likedByViewer: likedSet.has(postId),
        comments: commentsByPost.get(postId) || [],
      };
    }),
    products: storeProducts,
    media: mediaAssets,
  };
}

export async function createAffiliateMediaAsset(input: {
  affiliateId?: string | null;
  customerId?: string | null;
  source: string;
  originalUrl: string;
  generatedUrl?: string | null;
  prompt?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureAffiliateTables();
  const id = randomUUID();
  await execute(
    `INSERT INTO affiliate_social_media_asset
      (id, affiliate_id, customer_id, source, original_url, generated_url, prompt, metadata, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
    [
      id,
      input.affiliateId || null,
      input.customerId || null,
      input.source,
      input.originalUrl,
      input.generatedUrl || null,
      input.prompt || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return id;
}

export async function listAffiliateSocialModerationQueue(limit = 100) {
  await ensureAffiliateTables();
  return await query<Record<string, unknown>>(
    `SELECT p.id, p.caption, p.image_url, p.moderation_status, p.moderation_notes, p.created_at,
            a.code, a.email, a.first_name, a.last_name
     FROM affiliate_social_post p
     INNER JOIN affiliate a ON a.id = p.affiliate_id
     WHERE p.moderation_status = 'pending'
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function moderateAffiliateSocialPost(input: {
  postId: string;
  status: "approved" | "rejected";
  notes?: string;
  moderatedBy?: string;
}) {
  await ensureAffiliateTables();
  await execute(
    `UPDATE affiliate_social_post
     SET moderation_status = $1,
         moderation_notes = $2,
         moderated_by = $3,
         moderated_at = NOW(),
         updated_at = NOW()
     WHERE id = $4`,
    [input.status, input.notes || null, input.moderatedBy || null, input.postId]
  );
}

export async function listAffiliateSocialPostsForOwner(affiliateId: string) {
  await ensureAffiliateTables();
  const posts = await query<Record<string, unknown>>(
    `SELECT id, caption, image_url, moderation_status, created_at
     FROM affiliate_social_post
     WHERE affiliate_id = $1
     ORDER BY created_at DESC`,
    [affiliateId]
  );
  const postIds = posts.map((p) => String(p.id));
  const tags = postIds.length
    ? await query<Record<string, unknown>>(
        `SELECT id, post_id, product_handle, product_title, product_url
         FROM affiliate_social_post_tag
         WHERE post_id = ANY($1::text[])`,
        [postIds]
      )
    : [];
  const tagsByPost = new Map<string, Record<string, unknown>[]>();
  for (const tag of tags) {
    const key = String(tag.post_id);
    const list = tagsByPost.get(key) || [];
    list.push(tag);
    tagsByPost.set(key, list);
  }
  return posts.map((post) => ({
    ...post,
    tags: tagsByPost.get(String(post.id)) || [],
  }));
}

export async function getAffiliateSocialPostById(postId: string) {
  await ensureAffiliateTables();
  return await queryOne<Record<string, unknown>>(
    `SELECT p.id, p.affiliate_id, p.caption, p.image_url, a.email AS affiliate_email
     FROM affiliate_social_post p
     JOIN affiliate a ON a.id = p.affiliate_id
     WHERE p.id = $1`,
    [postId]
  );
}

export async function updateAffiliateSocialPost(input: {
  postId: string;
  caption: string;
  imageUrl: string;
  tags: SocialTagInput[];
}) {
  await ensureAffiliateTables();
  await execute(
    `UPDATE affiliate_social_post
     SET caption = $1,
         image_url = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [input.caption, input.imageUrl, input.postId]
  );
  await execute(`DELETE FROM affiliate_social_post_tag WHERE post_id = $1`, [input.postId]);
  for (const tag of input.tags) {
    await execute(
      `INSERT INTO affiliate_social_post_tag
        (id, post_id, product_handle, product_title, product_url, created_at)
       VALUES
        ($1, $2, $3, $4, $5, NOW())`,
      [randomUUID(), input.postId, tag.productHandle || null, tag.productTitle, tag.productUrl]
    );
  }
}

export async function deleteAffiliateSocialPost(postId: string) {
  await ensureAffiliateTables();
  await execute(`DELETE FROM affiliate_social_post WHERE id = $1`, [postId]);
}

export async function listAffiliateMediaAssets(affiliateId: string) {
  await ensureAffiliateTables();
  return await query<Record<string, unknown>>(
    `SELECT id, source, original_url, generated_url, prompt, created_at, published, published_post_id
     FROM affiliate_social_media_asset
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [affiliateId]
  );
}

export async function deleteAffiliateMediaAsset(id: string) {
  await ensureAffiliateTables();
  await execute(`DELETE FROM affiliate_social_media_asset WHERE id = $1`, [id]);
}

export async function queryAffiliateByMediaId(mediaId: string) {
  await ensureAffiliateTables();
  return await queryOne<Record<string, unknown>>(
    `SELECT m.id, m.affiliate_id, m.original_url, m.generated_url, m.prompt, m.published, m.published_post_id, a.email AS affiliate_email
     FROM affiliate_social_media_asset m
     JOIN affiliate a ON a.id = m.affiliate_id
     WHERE m.id = $1`,
    [mediaId]
  );
}

export async function publishAffiliateMediaAsset(mediaId: string, affiliateId: string) {
  await ensureAffiliateTables();
  const media = await queryOne<Record<string, unknown>>(
    `SELECT id, published, published_post_id
     FROM affiliate_social_media_asset
     WHERE id = $1 AND affiliate_id = $2
     LIMIT 1`,
    [mediaId, affiliateId]
  );
  if (!media) throw new Error("Media not found.");

  if (media.published) {
    return String(media.published_post_id || "");
  }

  await execute(
    `UPDATE affiliate_social_media_asset
     SET published = true,
         published_post_id = NULL
     WHERE id = $1`,
    [mediaId]
  );
  return "";
}

export async function unpublishAffiliateMediaAsset(mediaId: string, affiliateId: string) {
  await ensureAffiliateTables();
  await execute(
    `UPDATE affiliate_social_media_asset
     SET published = false
     WHERE id = $1 AND affiliate_id = $2`,
    [mediaId, affiliateId]
  );
}

export async function listAffiliateStoreProducts(affiliateId: string) {
  await ensureAffiliateTables();
  return await query<Record<string, unknown>>(
    `SELECT id, product_id, product_handle, product_title, product_url, image_url, variant_id, variant_title, price_amount, currency_code
     FROM affiliate_store_product
     WHERE affiliate_id = $1
     ORDER BY created_at DESC`,
    [affiliateId]
  );
}

export async function addAffiliateStoreProduct(input: {
  affiliateId: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  productUrl: string;
  imageUrl?: string;
  variantId?: string;
  variantTitle?: string;
  priceAmount?: number;
  currencyCode?: string;
}) {
  await ensureAffiliateTables();
  await execute(
    `INSERT INTO affiliate_store_product
      (id, affiliate_id, product_id, product_handle, product_title, product_url, image_url, variant_id, variant_title, price_amount, currency_code, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (affiliate_id, product_id)
     DO UPDATE SET
      product_handle = EXCLUDED.product_handle,
      product_title = EXCLUDED.product_title,
      product_url = EXCLUDED.product_url,
      image_url = EXCLUDED.image_url,
      variant_id = EXCLUDED.variant_id,
      variant_title = EXCLUDED.variant_title,
      price_amount = EXCLUDED.price_amount,
      currency_code = EXCLUDED.currency_code`,
    [
      randomUUID(),
      input.affiliateId,
      input.productId,
      input.productHandle,
      input.productTitle,
      input.productUrl,
      input.imageUrl || null,
      input.variantId || null,
      input.variantTitle || null,
      input.priceAmount || null,
      input.currencyCode || null,
    ]
  );
}

export async function removeAffiliateStoreProduct(affiliateId: string, productId: string) {
  await ensureAffiliateTables();
  await execute(
    `DELETE FROM affiliate_store_product
     WHERE affiliate_id = $1 AND product_id = $2`,
    [affiliateId, productId]
  );
}
