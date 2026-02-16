# MemoRable MCP Server — Docker image
# Runs on EC2 (Docker Compose with Redis).
#
# Build:  docker build -t memorable-mcp .
# Run:    docker run -p 8080:8080 -e MONGODB_URI=<uri> -e REDIS_URL=<url> memorable-mcp
#
# Node 23+ required: @modelcontextprotocol/sdk wildcard exports "./*"
# don't resolve correctly on Node 22 (LTS).

FROM public.ecr.aws/docker/library/node:23-slim

WORKDIR /app

# Install build tools for native modules (argon2)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev 2>&1 || \
    (echo "=== Retrying without native scripts ===" && \
     npm ci --omit=dev --ignore-scripts 2>&1)

COPY src/ src/
COPY tsconfig.json ./

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
