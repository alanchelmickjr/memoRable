#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# NOTHING IS LOCAL — use cloud endpoint
BASE_URL="${MEMORABLE_API_URL:?MEMORABLE_API_URL is required. NOTHING IS LOCAL.}"

echo "Running smoke tests against ${BASE_URL}..."

# 1. Health check (public, no auth)
echo "Testing health endpoint..."
health_response=$(curl -sf "${BASE_URL}/health")
if [[ $health_response == *"ok"* ]] || [[ $health_response == *"healthy"* ]] || [[ $health_response == *"status"* ]]; then
    echo -e "${GREEN}✓${NC} Health check passed"
else
    echo -e "${RED}✗${NC} Health check failed: ${health_response}"
    exit 1
fi

# 2. Auth knock — get challenge
echo "Testing auth knock..."
knock_response=$(curl -sf -X POST "${BASE_URL}/auth/knock" \
    -H "Content-Type: application/json" \
    -d '{"device":{"type":"terminal","name":"ci-smoke-test"}}')
CHALLENGE=$(echo "${knock_response}" | python3 -c "import sys,json; print(json.load(sys.stdin)['challenge'])" 2>/dev/null || echo "")
if [[ -n "$CHALLENGE" ]]; then
    echo -e "${GREEN}✓${NC} Auth knock returned challenge"
else
    echo -e "${RED}✗${NC} Auth knock failed: ${knock_response}"
    exit 1
fi

# 3. Auth exchange — get API key
echo "Testing auth exchange..."
PASSPHRASE="I remember what I have learned from you."
exchange_response=$(curl -sf -X POST "${BASE_URL}/auth/exchange" \
    -H "Content-Type: application/json" \
    -d "{\"challenge\":\"${CHALLENGE}\",\"passphrase\":\"${PASSPHRASE}\",\"device\":{\"type\":\"terminal\",\"name\":\"ci-smoke-test\"}}")
API_KEY=$(echo "${exchange_response}" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_key'])" 2>/dev/null || echo "")
if [[ -n "$API_KEY" ]]; then
    echo -e "${GREEN}✓${NC} Auth exchange returned API key"
else
    echo -e "${RED}✗${NC} Auth exchange failed: ${exchange_response}"
    exit 1
fi

# 4. Store a memory
echo "Testing memory storage..."
store_response=$(curl -sf -X POST "${BASE_URL}/memory" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"content\":\"CI smoke test memory at $(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"entity\":\"ci-smoke-test\",\"entityType\":\"test\",\"metadata\":{\"source\":\"ci-smoke-test\"}}")
if [[ $store_response == *"success"* ]] || [[ $store_response == *"stored"* ]] || [[ $store_response == *"id"* ]]; then
    echo -e "${GREEN}✓${NC} Memory storage working"
else
    echo -e "${RED}✗${NC} Memory storage failed: ${store_response}"
    exit 1
fi

# 5. Search memories
echo "Testing memory search..."
search_response=$(curl -sf "${BASE_URL}/memory/search?query=smoke+test&limit=5" \
    -H "X-API-Key: ${API_KEY}")
if [[ $search_response == *"memories"* ]] || [[ $search_response == *"results"* ]] || [[ $search_response == *"["* ]]; then
    echo -e "${GREEN}✓${NC} Memory search working"
else
    echo -e "${RED}✗${NC} Memory search failed: ${search_response}"
    exit 1
fi

# 6. Get memories by entity
echo "Testing memory retrieval by entity..."
entity_response=$(curl -sf "${BASE_URL}/memory?entity=ci-smoke-test&limit=5" \
    -H "X-API-Key: ${API_KEY}")
if [[ $entity_response == *"memories"* ]] || [[ $entity_response == *"["* ]]; then
    echo -e "${GREEN}✓${NC} Memory retrieval by entity working"
else
    echo -e "${RED}✗${NC} Memory retrieval by entity failed: ${entity_response}"
    exit 1
fi

echo -e "\n${GREEN}All smoke tests passed!${NC}"
