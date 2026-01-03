FROM node:20-alpine

WORKDIR /app

# Install dependencies (including devDependencies for TypeScript build)
COPY src/services/mcp_server/package.json ./
RUN npm install

# Copy source files
COPY src/services/mcp_server/ ./
COPY src/services/salience_service/ ./salience_service/

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Run MCP server
CMD ["node", "dist/index.js"]
