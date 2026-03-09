#!/bin/sh
set -e

warn_missing() {
  var_name="$1"
  eval "var_value=\${$var_name}"

  if [ -z "$var_value" ]; then
    echo "[storefront env check] WARNING: $var_name is not set."
    return 1
  fi

  return 0
}

echo "[storefront env check] Validating runtime environment..."

missing_count=0

warn_missing "NEXT_PUBLIC_MEDUSA_BACKEND_URL" || missing_count=$((missing_count + 1))
warn_missing "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" || missing_count=$((missing_count + 1))

# Server routes can use GOOGLE_AI_API_KEY; client features can use NEXT_PUBLIC_GOOGLE_AI_API_KEY.
if [ -z "${GOOGLE_AI_API_KEY}" ] && [ -z "${NEXT_PUBLIC_GOOGLE_AI_API_KEY}" ]; then
  echo "[storefront env check] WARNING: GOOGLE_AI_API_KEY and NEXT_PUBLIC_GOOGLE_AI_API_KEY are both empty."
  missing_count=$((missing_count + 1))
fi

if [ "$missing_count" -gt 0 ]; then
  echo "[storefront env check] Startup will continue, but some features may not work until env vars are set."
else
  echo "[storefront env check] Environment looks good."
fi

exec node apps/storefront/server.js
