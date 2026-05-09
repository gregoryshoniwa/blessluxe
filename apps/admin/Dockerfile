# ─── BLESSLUXE Next.js Admin ─────────────────────────────
# Build context must be the monorepo root (context: .)
# so pnpm workspace dependencies resolve correctly.
# ─────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# ── Stage 1: Install dependencies ───────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json               ./apps/admin/
COPY packages/ui/package.json              ./packages/ui/
COPY packages/config/package.json          ./packages/config/
COPY packages/types/package.json           ./packages/types/
COPY packages/eslint-config/package.json   ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build the admin ────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/ ./packages/
COPY . .

ARG NEXT_PUBLIC_SHOP_BACKEND=http://localhost:9001
ENV NEXT_PUBLIC_SHOP_BACKEND=$NEXT_PUBLIC_SHOP_BACKEND

RUN pnpm --filter @blessluxe/admin build

# ── Stage 3: Runtime ────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/admin ./apps/admin

EXPOSE 3001
WORKDIR /app/apps/admin
CMD ["pnpm", "start", "--", "--port", "3001"]
