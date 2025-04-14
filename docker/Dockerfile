FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    jpeg-dev \
    cairo-dev \
    giflib-dev \
    pango-dev \
    libtool \
    autoconf \
    automake \
    curl

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Copy model preloading script
COPY scripts/preload-models.js ./scripts/

# Build the application
RUN npm run build --if-present

# Preload models and warm up cache
RUN node scripts/preload-models.js

# Create health check script
RUN echo '#!/bin/sh\n\
curl -f http://localhost:3000/health && \
curl -f http://localhost:3000/models/status\n\
exit $?' > /usr/local/bin/health.sh && \
chmod +x /usr/local/bin/health.sh

# Expose port
EXPOSE 3000

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Start the application with proper signals handling
CMD ["node", "src/index.js"]