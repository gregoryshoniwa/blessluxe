# ─── BLESSLUXE Next.js Storefront ────────────────────────
# Build context must be the monorepo root (context: .)
# so pnpm workspace dependencies resolve correctly.
#
# NEXT_PUBLIC_* vars are inlined at build time by Next.js,
# so they must be passed as build args (see docker-compose).
# ─────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# ── Stage 1: Install dependencies ───────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/storefront/package.json          ./apps/storefront/
COPY packages/ui/package.json              ./packages/ui/
COPY packages/config/package.json          ./packages/config/
COPY packages/types/package.json           ./packages/types/
COPY packages/eslint-config/package.json   ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build the storefront ───────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules              ./node_modules
COPY --from=deps /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY --from=deps /app/packages/                 ./packages/
COPY . .

# Next.js inlines NEXT_PUBLIC_* at build time
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_GOOGLE_AI_API_KEY
ARG NEXT_PUBLIC_AI_AGENT_PROVIDER=google
ARG NEXT_PUBLIC_AI_AGENT_MODEL=gemini-2.5-flash
ARG NEXT_PUBLIC_AI_MEMORY_ENABLED=true
ARG NEXT_PUBLIC_AI_VOICE_ENABLED=true
ARG NEXT_PUBLIC_VOICE_STT_PROVIDER=browser
ARG NEXT_PUBLIC_VOICE_TTS_PROVIDER=browser

ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_GOOGLE_AI_API_KEY=$NEXT_PUBLIC_GOOGLE_AI_API_KEY \
    NEXT_PUBLIC_AI_AGENT_PROVIDER=$NEXT_PUBLIC_AI_AGENT_PROVIDER \
    NEXT_PUBLIC_AI_AGENT_MODEL=$NEXT_PUBLIC_AI_AGENT_MODEL \
    NEXT_PUBLIC_AI_MEMORY_ENABLED=$NEXT_PUBLIC_AI_MEMORY_ENABLED \
    NEXT_PUBLIC_AI_VOICE_ENABLED=$NEXT_PUBLIC_AI_VOICE_ENABLED \
    NEXT_PUBLIC_VOICE_STT_PROVIDER=$NEXT_PUBLIC_VOICE_STT_PROVIDER \
    NEXT_PUBLIC_VOICE_TTS_PROVIDER=$NEXT_PUBLIC_VOICE_TTS_PROVIDER \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @blessluxe/storefront build

# ── Stage 3: Production runner (standalone output) ──────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/storefront/.next/standalone ./
COPY --from=builder /app/apps/storefront/.next/static     ./apps/storefront/.next/static
COPY --from=builder /app/apps/storefront/public            ./apps/storefront/public
COPY apps/storefront/docker-entrypoint.sh                  ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
CMD ["./docker-entrypoint.sh"]
