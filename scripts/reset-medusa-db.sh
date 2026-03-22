#!/usr/bin/env bash
# Destroy the Postgres database named in DATABASE_URL, recreate it, run Medusa
# migrations, then seed. Use the same DB as backend/medusa/.env (and typically
# AI_DATABASE_URL / storefront when pointed at this instance).
#
# Usage:
#   ./scripts/reset-medusa-db.sh --yes
# Or:  BLESSLUXE_RESET_DB=1 ./scripts/reset-medusa-db.sh
#
# Requires: psql (PostgreSQL client), Node/pnpm, running Postgres.
# Docker: ensure `docker compose up -d postgres` (or port 5432 reachable).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "--yes" && "${BLESSLUXE_RESET_DB:-}" != "1" ]]; then
  echo "This will DROP and recreate the database from DATABASE_URL (all Medusa + app data in that DB)."
  echo "Re-run with: $0 --yes"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client tools or use: docker compose exec -T postgres psql -U blessluxe -d postgres ..." >&2
  exit 1
fi

MEDUSA_ENV="$ROOT/backend/medusa/.env"
if [[ -f "$MEDUSA_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$MEDUSA_ENV"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Add it to backend/medusa/.env (see backend/medusa/.env.template)." >&2
  exit 1
fi

eval "$(
  node <<'NODE'
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
let u;
try {
  u = new URL(url);
} catch {
  console.error("Invalid DATABASE_URL");
  process.exit(1);
}
const db = u.pathname.replace(/^\//, "").split("?")[0];
if (!db) {
  console.error("No database name in DATABASE_URL path");
  process.exit(1);
}
const esc = (s) => JSON.stringify(s);
console.log("export PGHOST=" + esc(u.hostname));
console.log("export PGPORT=" + esc(u.port || "5432"));
console.log("export PGUSER=" + esc(decodeURIComponent(u.username)));
console.log("export PGPASSWORD=" + esc(decodeURIComponent(u.password)));
console.log("export PGDB=" + esc(db));
NODE
)"

export PGDATABASE=postgres

echo "→ Terminating connections and dropping database: $PGDB"
psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$PGDB'::name
  AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$PGDB";
CREATE DATABASE "$PGDB";
SQL

echo "→ medusa db:migrate"
pnpm --filter @blessluxe/backend db:migrate

echo "→ medusa seed"
pnpm --filter @blessluxe/backend seed

echo "Done. Recreate admin user if needed:"
echo "  cd backend/medusa && npx medusa user -e admin@example.com -p yourpassword"
