#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SITE_ORIGIN="${SITE_ORIGIN:-https://xbilsenter.no}"
ADMIN_ORIGIN="${ADMIN_ORIGIN:-https://drift.xbilsenter.no}"
CORS_LIST="${CORS_LIST:-$SITE_ORIGIN,https://xbilsenter.no,https://www.xbilsenter.no}"

set_var() {
  local name="$1"
  local value="$2"
  echo "Setter $name = $value"
  npx vercel env rm "$name" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" production >/dev/null
}

set_var PUBLIC_SITE_ORIGIN "$SITE_ORIGIN"
set_var ADMIN_PUBLIC_URL "$ADMIN_ORIGIN"
set_var CORS_ORIGINS "$CORS_LIST"
set_var NODE_ENV production

echo "Ferdig."
