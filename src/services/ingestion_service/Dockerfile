# src/services/ingestion_service/Dockerfile
# Ingestion Service - Memory ingestion API

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
EXPOSE 8001

# Run with tsx (TypeScript executor)
CMD ["./node_modules/.bin/tsx", "src/services/ingestion_service/index.ts"]
