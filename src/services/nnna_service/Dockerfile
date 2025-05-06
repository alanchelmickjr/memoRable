# Placeholder Dockerfile for memorable_nnna_service
# This service will be responsible for Nocturnal Nurturing & Network Attunement.

# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or pnpm-lock.yaml)
COPY package*.json ./
# If using pnpm, uncomment and adjust:
# COPY pnpm-lock.yaml ./

# Install app dependencies
# If using pnpm, replace npm ci with pnpm install --frozen-lockfile
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# This service might not expose a port if it's only triggered by cron.
# EXPOSE XXXXX

# Define the command to run the application
# This could be a script that starts a cron daemon or a long-running process.
# CMD [ "node", "src/services/nnna_service/index.js" ]
CMD [ "node", "-e", "console.log('memorable_nnna_service placeholder started'); setInterval(() => {}, 1 << 30);" ]