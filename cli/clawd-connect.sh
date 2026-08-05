#!/usr/bin/env bash
# Cheshire Terminal connect wrapper (legacy clawd-connect name).
# Default site: https://cheshireterminal.ai
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CHESHIRE_SITE_URL="${CHESHIRE_SITE_URL:-https://cheshireterminal.ai}"

CMD="${1:-help}"
shift || true

case "$CMD" in
  ""|help)
    exec "$ROOT/cheshire-cli.sh" help
    ;;
  skills|skills:list|skills:featured)
    exec "$ROOT/cheshire-cli.sh" skills "$@"
    ;;
  skills:search)
    exec "$ROOT/cheshire-cli.sh" skills:search "$@"
    ;;
  skills:install)
    SLUG="${1:-}"
    if [[ -z "$SLUG" ]]; then
      echo "Usage: clawd-connect.sh skills:install <slug>" >&2
      exit 1
    fi
    mkdir -p "$SLUG"
    curl -sS "${CHESHIRE_SITE_URL}/api/skills/${SLUG}/download" -o "${SLUG}/SKILL.md"
    echo "Installed skill: $SLUG → ${SLUG}/SKILL.md"
    ;;
  marketplace|marketplace:trending|marketplace:new)
    exec "$ROOT/cheshire-cli.sh" skills "$@"
    ;;
  connect)
    exec "$ROOT/cheshire-cli.sh" connect "$@"
    ;;
  status)
    exec "$ROOT/cheshire-cli.sh" status "$@"
    ;;
  agents)
    exec "$ROOT/cheshire-cli.sh" agents "$@"
    ;;
  register|register:agent)
    exec "$ROOT/cheshire-cli.sh" register:agent --dry-run "$@"
    ;;
  register:user|login|whoami)
    exec "$ROOT/cheshire-cli.sh" "$CMD" "$@"
    ;;
  wallet|prices)
    exec "$ROOT/cheshire-cli.sh" connect "$@"
    ;;
  payment:supported|payment:verify|payment:settle|pay)
    echo "x402: ${CHESHIRE_SITE_URL}/x402" >&2
    exec "$ROOT/cheshire-cli.sh" connect "$@"
    ;;
  *)
    exec "$ROOT/cheshire-cli.sh" "$CMD" "$@"
    ;;
esac
