# src/services/nnna_service/Dockerfile
# NNNA Service - Nocturnal Nurturing & Network Attunement

FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package manager files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Install tsx for running TypeScript directly
RUN npm install tsx

# Copy source code
COPY src ./src

# Expose the port the app runs on
EXPOSE 3005

# Run with tsx (TypeScript executor)
CMD ["./node_modules/.bin/tsx", "src/services/nnna_service/index.ts"]
