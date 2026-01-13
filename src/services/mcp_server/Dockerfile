FROM node:18-alpine

WORKDIR /usr/src/app

# Copy root package files for dependency installation
COPY package.json package-lock.json ./

# Install all dependencies (for running TypeScript directly)
RUN npm ci --ignore-scripts

# Install tsx for running TypeScript directly
RUN npm install tsx

# Copy source files maintaining relative structure
COPY src ./src

# Run MCP server using tsx (no compilation needed)
CMD ["./node_modules/.bin/tsx", "src/services/mcp_server/index.ts"]
