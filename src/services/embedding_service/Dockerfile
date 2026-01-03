# Placeholder Dockerfile for memorable_embedding_service
# This service will be responsible for generating embeddings for text data.

# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or pnpm-lock.yaml)
COPY package*.json ./
# If using pnpm, uncomment and adjust:
# COPY pnpm-lock.yaml ./

# Install app dependencies (skip prepare/husky hooks)
# If using pnpm, replace npm ci with pnpm install --frozen-lockfile
RUN npm ci --only=production --ignore-scripts

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (if any, adjust as needed)
# EXPOSE 3003

# Define the command to run the application
# CMD [ "node", "src/services/embedding_service/index.js" ]
CMD [ "node", "-e", "console.log('memorable_embedding_service placeholder started'); setInterval(() => {}, 1 << 30);" ]