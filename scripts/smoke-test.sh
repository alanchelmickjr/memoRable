#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Running smoke tests..."

# Test health endpoint
echo "Testing health endpoint..."
health_response=$(curl -s http://localhost:3000/health)
if [[ $health_response == *"healthy"* ]]; then
    echo -e "${GREEN}✓${NC} Health check passed"
else
    echo -e "${RED}✗${NC} Health check failed"
    exit 1
fi

# Test MongoDB connection
echo "Testing MongoDB connection..."
mongo_status=$(curl -s http://localhost:3000/health | jq -r '.mongodb')
if [[ $mongo_status == "connected" ]]; then
    echo -e "${GREEN}✓${NC} MongoDB connection verified"
else
    echo -e "${RED}✗${NC} MongoDB connection failed"
    exit 1
fi

# Test Redis connection
echo "Testing Redis connection..."
redis_status=$(curl -s http://localhost:3000/health | jq -r '.redis')
if [[ $redis_status == "connected" ]]; then
    echo -e "${GREEN}✓${NC} Redis connection verified"
else
    echo -e "${RED}✗${NC} Redis connection failed"
    exit 1
fi

# Test basic message processing
echo "Testing message processing..."
response=$(curl -s -X POST http://localhost:3000/api/process \
    -H "Content-Type: application/json" \
    -d '{"message": "test message", "context": {"type": "smoke-test"}}')

if [[ $response == *"success"* ]]; then
    echo -e "${GREEN}✓${NC} Message processing working"
else
    echo -e "${RED}✗${NC} Message processing failed"
    exit 1
fi

# Test model availability
echo "Testing model availability..."
models_response=$(curl -s http://localhost:3000/api/models/status)
if [[ $models_response == *"available"* ]]; then
    echo -e "${GREEN}✓${NC} Models are available"
else
    echo -e "${RED}✗${NC} Models check failed"
    exit 1
fi

echo -e "\n${GREEN}All smoke tests passed!${NC}"