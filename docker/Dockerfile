# Use ECR Public to avoid Docker Hub rate limits
FROM public.ecr.aws/docker/library/node:18-alpine

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

# Install app dependencies (skip prepare/husky hooks)
RUN npm install --ignore-scripts

# Copy app source
COPY . .

# Build the application
RUN npm run build --if-present

# Create basic health check script
RUN echo '#!/bin/sh\n\
response=$(curl -s http://localhost:3000/health)\n\
if [ $? -ne 0 ]; then\n\
  echo "Failed to connect to health endpoint"\n\
  exit 1\n\
fi\n\
\n\
healthy=$(echo $response | grep -o "\"healthy\":true")\n\
if [ -z "$healthy" ]; then\n\
  echo "One or more services unhealthy"\n\
  exit 1\n\
fi\n\
\n\
exit 0' > /usr/local/bin/health.sh && \
chmod +x /usr/local/bin/health.sh

# Expose port
EXPOSE 3000

# Start the application server
CMD ["node", "src/server.js"]