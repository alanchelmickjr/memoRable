#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Running smoke tests..."

# Test Weaviate health
echo "Testing Weaviate..."
if curl -sf http://localhost:8080/v1/.well-known/ready > /dev/null; then
    echo -e "${GREEN}✓${NC} Weaviate is healthy"
else
    echo -e "${RED}✗${NC} Weaviate health check failed"
    exit 1
fi

# Test Ingestion service health
echo "Testing Ingestion service..."
ingestion_response=$(curl -sf http://localhost:8001/api/ingest/health)
if [[ $ingestion_response == *"UP"* ]]; then
    echo -e "${GREEN}✓${NC} Ingestion service is healthy"
else
    echo -e "${RED}✗${NC} Ingestion service health check failed"
    exit 1
fi

# Test Embedding service health
echo "Testing Embedding service..."
embedding_response=$(curl -sf http://localhost:3003/health)
if [[ $embedding_response == *"healthy"* ]]; then
    echo -e "${GREEN}✓${NC} Embedding service is healthy"
else
    echo -e "${RED}✗${NC} Embedding service health check failed"
    exit 1
fi

# Test Retrieval service health
echo "Testing Retrieval service..."
retrieval_response=$(curl -sf http://localhost:3004/health)
if [[ $retrieval_response == *"healthy"* ]]; then
    echo -e "${GREEN}✓${NC} Retrieval service is healthy"
else
    echo -e "${RED}✗${NC} Retrieval service health check failed"
    exit 1
fi

# Note: NNNA service (port 3005) was deprecated - all processing now happens at ingest time

# Test memory ingestion
echo "Testing memory ingestion..."
ingest_response=$(curl -sf -X POST http://localhost:8001/api/ingest \
    -H "Content-Type: application/json" \
    -d '{
        "sourceSystem": "MANUAL_INPUT",
        "agentId": "smoke-test-user",
        "contentType": "TEXT",
        "contentRaw": "Smoke test memory entry",
        "eventTimestamp": "2026-01-13T00:00:00.000Z"
    }')
if [[ $ingest_response == *"accepted"* ]]; then
    echo -e "${GREEN}✓${NC} Memory ingestion working"
else
    echo -e "${RED}✗${NC} Memory ingestion failed"
    exit 1
fi

# Test embedding generation
echo "Testing embedding generation..."
embed_response=$(curl -sf -X POST http://localhost:3003/embed \
    -H "Content-Type: application/json" \
    -d '{"text": "test embedding"}')
if [[ $embed_response == *"embedding"* ]]; then
    echo -e "${GREEN}✓${NC} Embedding generation working"
else
    echo -e "${RED}✗${NC} Embedding generation failed"
    exit 1
fi

# Test retrieval
echo "Testing memory retrieval..."
retrieve_response=$(curl -sf -X POST http://localhost:3004/retrieve \
    -H "Content-Type: application/json" \
    -d '{"userId": "smoke-test-user", "query": "test"}')
if [[ $retrieve_response == *"results"* ]]; then
    echo -e "${GREEN}✓${NC} Memory retrieval working"
else
    echo -e "${RED}✗${NC} Memory retrieval failed"
    exit 1
fi

echo -e "\n${GREEN}All smoke tests passed!${NC}"
