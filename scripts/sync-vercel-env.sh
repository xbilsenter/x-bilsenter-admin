#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Fant ikke $ENV_FILE"
  exit 1
fi

cd "$ROOT"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

sync_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Hopper over $name (tom)"
    return
  fi
  echo "Oppdaterer $name ..."
  npx vercel env rm "$name" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" production
}

for var in \
  USE_SUPABASE \
  DATABASE_URL \
  SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY \
  SUPABASE_STORAGE_BUCKET \
  JWT_SECRET \
  INGEST_SECRET \
  VEGVESEN_API_KEY \
  PUBLIC_SITE_ORIGIN \
  ADMIN_PUBLIC_URL \
  CORS_ORIGINS \
  NODE_ENV; do
  sync_var "$var"
done

echo "Ferdig. Kjør redeploy i Vercel eller: git commit --allow-empty -m 'redeploy' && git push"
