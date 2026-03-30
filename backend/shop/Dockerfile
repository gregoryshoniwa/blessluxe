# ─── BLESSLUXE Custom Shop Backend ────────────────────────
# Lightweight Express API replacing Medusa for catalog,
# cart, and inventory. Uses Node 22+ native TS strip.
# Build context must be the monorepo root (context: .)
# ─────────────────────────────────────────────────────────

FROM node:22-alpine AS base
WORKDIR /app

# ── Stage 1: Copy source and install deps ────────────────
FROM base AS deps
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/shop/package.json ./backend/shop/
COPY packages/eslint-config/package.json   ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
RUN pnpm install --frozen-lockfile --filter @blessluxe/shop-backend

# ── Stage 2: Production runner ───────────────────────────
FROM base AS runner
WORKDIR /app/backend/shop
ENV NODE_ENV=production

COPY --from=deps /app/node_modules           /app/node_modules
COPY --from=deps /app/backend/shop/node_modules ./node_modules
COPY backend/shop/ ./

RUN mkdir -p ./uploads

EXPOSE 9001
CMD ["node", "--experimental-strip-types", "--experimental-transform-types", "src/index.ts"]
