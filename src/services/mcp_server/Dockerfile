FROM node:20-alpine

# Create structure matching development layout
WORKDIR /app/services/mcp_server

# Install dependencies (including devDependencies for TypeScript build)
COPY src/services/mcp_server/package.json ./
RUN npm install

# Copy source files - maintain relative structure from development
# mcp_server at /app/services/mcp_server/
# salience_service at /app/services/salience_service/ (sibling)
COPY src/services/mcp_server/ ./
COPY src/services/salience_service/ ../salience_service/

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Run MCP server
CMD ["node", "dist/index.js"]
