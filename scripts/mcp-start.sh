#!/usr/bin/env bash
# MCP server bootstrap — zero steps, just works.
# Ensures dependencies are installed, then starts the server.
# All output goes to stderr so stdout stays clean for JSON-RPC.

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Load .env if present (won't override existing env vars)
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi >&2 2>&1

# Install deps if missing (silent, fast if already installed)
if [ ! -d "node_modules/@modelcontextprotocol" ]; then
  npm install --silent --no-fund --no-audit >&2 2>&1
fi

# Report mode to stderr for diagnostics
if [ -n "${API_BASE_URL:-}" ] || [ -n "${MEMORABLE_API_URL:-}" ]; then
  echo "[mcp-start] REST mode → ${API_BASE_URL:-$MEMORABLE_API_URL}" >&2
else
  echo "[mcp-start] Direct mode (no API_BASE_URL set)" >&2
fi

exec node --import tsx/esm src/services/mcp_server/index.ts
