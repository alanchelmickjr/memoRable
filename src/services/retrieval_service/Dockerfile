# src/services/retrieval_service/Dockerfile
# Retrieval Service - Retrieves and ranks memories from the vector database

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
EXPOSE 3004

# Run with tsx (TypeScript executor)
CMD ["./node_modules/.bin/tsx", "src/services/retrieval_service/index.ts"]
