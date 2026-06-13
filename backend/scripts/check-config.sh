#!/usr/bin/env bash
# Pre-deploy guard: fail fast if wrangler.toml still has placeholder IDs.
# Run automatically via the "predeploy" npm/bun script, or manually:
#   bash scripts/check-config.sh

set -euo pipefail

TOML="$(dirname "$0")/../wrangler.toml"
ERRORS=0

if grep -q '00000000000000000000000000000001' "$TOML"; then
  echo "ERROR: wrangler.toml KV namespace ID is still a placeholder."
  echo "       Run: wrangler kv namespace list"
  echo "       Then update the 'id' and 'preview_id' under [[kv_namespaces]]."
  ERRORS=$((ERRORS + 1))
fi

if grep -q '00000000-0000-0000-0000-000000000001' "$TOML"; then
  echo "ERROR: wrangler.toml D1 database ID is still a placeholder."
  echo "       Run: wrangler d1 list"
  echo "       Then update the 'database_id' under [[d1_databases]]."
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Deploy aborted: replace placeholder IDs in wrangler.toml before deploying."
  exit 1
fi

echo "wrangler.toml config OK."
