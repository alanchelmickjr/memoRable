# src/services/embedding_service/Dockerfile
# Embedding Service - Generates vector embeddings for text data

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
EXPOSE 3003

# Run with tsx (TypeScript executor)
CMD ["./node_modules/.bin/tsx", "src/services/embedding_service/index.ts"]
