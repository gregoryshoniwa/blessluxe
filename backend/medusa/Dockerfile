# ─── BLESSLUXE Medusa Backend ────────────────────────────
# Build context must be the monorepo root (context: .)
# so pnpm workspace dependencies resolve correctly.
# ─────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# ── Stage 1: Install dependencies ───────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/medusa/package.json           ./backend/medusa/
COPY packages/types/package.json           ./packages/types/
COPY packages/config/package.json          ./packages/config/
COPY packages/eslint-config/package.json   ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build backend + admin dashboard ────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN pnpm --filter @blessluxe/backend build
# medusa build outputs admin to dist/public/admin/ but
# medusa start expects it at <project>/public/admin/
RUN cp -r /app/backend/medusa/dist/public /app/backend/medusa/public

# ── Stage 3: Production runner ──────────────────────────
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/ ./

EXPOSE 9000
WORKDIR /app/backend/medusa
CMD ["pnpm", "start"]
