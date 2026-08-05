#!/usr/bin/env bash
# Cheshire Terminal CLI — thin shell entry for node runner.
# Default site: https://cheshireterminal.ai (CHESHIRE_SITE_URL override).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CHESHIRE_SITE_URL="${CHESHIRE_SITE_URL:-https://cheshireterminal.ai}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to run the Cheshire Terminal CLI" >&2
  exit 1
fi

exec node "$ROOT/cheshire-cli.mjs" "$@"
