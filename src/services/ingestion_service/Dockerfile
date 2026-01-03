# src/services/ingestion_service/Dockerfile

# ---- Builder Stage ----
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Copy package manager files and .npmrc if it exists for pnpm config
COPY package.json pnpm-lock.yaml ./
# COPY .npmrc .npmrc # Uncomment if you have a .npmrc file

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy configuration files required for the build process
COPY rollup.config.js ./
COPY babel.config.cjs ./
# COPY tsconfig.json ./ # Uncomment if you have a tsconfig.json at the root and it's needed for the build

# Copy all source code
COPY src ./src

# Build the project
# This command should generate the 'dist' directory
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

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Application specific environment variables should be set via docker-compose or orchestrator
# ENV PORT=3001 # Example, can be overridden

# Expose the port the app runs on (as defined in src/services/ingestion_service/index.ts)
EXPOSE 3001

# Define the command to run the application
# This points to the built entry file for the ingestion service.
CMD ["node", "dist/services/ingestion_service/index.js"]