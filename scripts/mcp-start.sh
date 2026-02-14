#!/usr/bin/env bash
# MCP server bootstrap — zero steps, just works.
# Ensures dependencies are installed, then starts the server.
# All output goes to stderr so stdout stays clean for JSON-RPC.

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Install deps if missing (silent, fast if already installed)
if [ ! -d "node_modules/@modelcontextprotocol" ]; then
  npm install --silent --no-fund --no-audit >&2 2>&1
fi

exec node --import tsx/esm src/services/mcp_server/index.ts
