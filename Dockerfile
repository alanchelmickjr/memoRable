# MemoRable MCP Server — Docker image
# Runs on EC2 (Docker Compose with Redis).
#
# Build:  docker build -t memorable-mcp .
# Run:    docker run -p 8080:8080 -e MONGODB_URI=<uri> -e REDIS_URL=<url> memorable-mcp
#

# ─── Stage 1: Build (native module compilation) ───────────────────────
FROM public.ecr.aws/docker/library/node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

# Install production deps. node:20 has build tools for native modules (argon2).
RUN npm ci --omit=dev 2>&1 || \
    (echo "=== Retrying without native scripts ===" && \
     npm ci --omit=dev --ignore-scripts && \
     cd node_modules/argon2 && npx --yes node-pre-gyp install --fallback-to-build 2>/dev/null || true)

COPY src/ src/
COPY tsconfig.json ./

# ─── Stage 2: Runtime ─────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

RUN npm install -g tsx

# MCP server defaults (overridden by docker-compose environment)
ENV TRANSPORT_TYPE=http
ENV MCP_HTTP_PORT=8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["tsx", "src/services/mcp_server/index.ts"]
