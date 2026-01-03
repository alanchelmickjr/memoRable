# src/services/ingestion_service/Dockerfile

# ---- Builder Stage ----
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Copy package manager files
COPY package.json pnpm-lock.yaml ./

# Copy configuration files required for the build process BEFORE install
# (needed because prepare script runs during install)
COPY rollup.config.js ./
COPY babel.config.cjs ./

# Install all dependencies (including devDependencies for build)
# Use --ignore-scripts to skip prepare hook, we'll build manually
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy all source code
COPY src ./src

# Build the project
RUN pnpm build

# ---- Production Stage ----
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Set environment to production
ENV NODE_ENV=production

# Copy package.json and pnpm-lock.yaml from the builder stage
# (or from the context if they are guaranteed to be the same as used for prod dependencies)
COPY --from=builder /usr/src/app/package.json /usr/src/app/pnpm-lock.yaml ./
# COPY .npmrc .npmrc # Uncomment if you have a .npmrc file and it's needed for prod install

# Install only production dependencies (skip scripts, already built)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Application specific environment variables should be set via docker-compose or orchestrator
# ENV PORT=3001 # Example, can be overridden

# Expose the port the app runs on (as defined in src/services/ingestion_service/index.ts)
EXPOSE 3001

# Define the command to run the application
# This points to the built entry file for the ingestion service.
CMD ["node", "dist/services/ingestion_service/index.js"]