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

# Build the application
RUN npm run build --if-present

# Create basic health check script
RUN echo '#!/bin/sh\n\
curl -f http://localhost:3000/health\n\
exit $?' > /usr/local/bin/health.sh && \
chmod +x /usr/local/bin/health.sh

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"]