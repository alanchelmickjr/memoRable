#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-/home/user/memoRable}"

# Install dependencies (npm install is idempotent and cache-friendly)
if [ -f package.json ]; then
  npm install 2>&1
fi

# Build the project (rollup)
if [ -f rollup.config.js ]; then
  npm run build 2>&1
fi

# Generate .env from .env.example if it doesn't exist
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "[session-start] Created .env from .env.example"
fi

# Set the MCP API URL for hooks
if [ -n "${MEMORABLE_API_URL:-}" ]; then
  echo "export MCP_URL=\"${MEMORABLE_API_URL}\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi
