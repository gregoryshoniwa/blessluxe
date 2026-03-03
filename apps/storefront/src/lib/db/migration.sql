-- ═══════════════════════════════════════════════════════════
-- BLESSLUXE AI Agent — Database Migration
-- Run against the same PostgreSQL used by Medusa/docker-compose
-- ═══════════════════════════════════════════════════════════

-- pgvector extension for embedding-based RAG search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Conversations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    TEXT NOT NULL UNIQUE,
  customer_id   TEXT,
  summary       TEXT,
  sentiment     TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  topics        TEXT[] DEFAULT '{}',
  products_discussed TEXT[] DEFAULT '{}',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session ON ai_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON ai_conversations(customer_id);

-- ─── Messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  tool_results    JSONB,
  products        JSONB,
  suggestions     TEXT[],
  ui_updates      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON ai_messages(created_at DESC);

-- ─── Customer Memories (vector store for RAG) ─────────────
CREATE TABLE IF NOT EXISTS ai_customer_memories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  embedding     vector(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_customer ON ai_customer_memories(customer_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON ai_customer_memories(content_type);

-- ─── Customer Interactions ────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_customer_interactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id       TEXT NOT NULL,
  interaction_type  TEXT NOT NULL,
  product_id        TEXT,
  category          TEXT,
  search_query      TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer ON ai_customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON ai_customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON ai_customer_interactions(created_at DESC);

-- ─── Customer Preferences ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_customer_preferences (
  customer_id             TEXT PRIMARY KEY,
  favorite_colors         TEXT[] DEFAULT '{}',
  favorite_styles         TEXT[] DEFAULT '{}',
  preferred_fits          TEXT[] DEFAULT '{}',
  avoided_styles          TEXT[] DEFAULT '{}',
  top_size                TEXT,
  bottom_size             TEXT,
  dress_size              TEXT,
  shoe_size               TEXT,
  price_sensitivity       TEXT,
  typical_budget_min      NUMERIC,
  typical_budget_max      NUMERIC,
  preferred_categories    TEXT[] DEFAULT '{}',
  favorite_brands         TEXT[] DEFAULT '{}',
  purchase_occasions      TEXT[] DEFAULT '{}',
  preferred_contact       TEXT,
  notification_frequency  TEXT,
  style_profile           TEXT,
  recommendations_accuracy NUMERIC DEFAULT 0.5,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Event Subscriptions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_event_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  target_id       TEXT,
  target_type     TEXT,
  conditions      JSONB DEFAULT '{}',
  channel         TEXT NOT NULL DEFAULT 'push',
  active          BOOLEAN NOT NULL DEFAULT true,
  triggered_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON ai_event_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_event ON ai_event_subscriptions(event_type);

-- ─── Reminders ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reminders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   TEXT NOT NULL,
  message       TEXT NOT NULL,
  context       JSONB DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'push',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_customer ON ai_reminders(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON ai_reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON ai_reminders(status);
