#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# NOTHING IS LOCAL — use cloud endpoint
BASE_URL="${MEMORABLE_API_URL:?MEMORABLE_API_URL is required. NOTHING IS LOCAL.}"

echo "Running smoke tests against ${BASE_URL}..."

# 1. Health check
echo "Testing health endpoint..."
health_response=$(curl -sf "${BASE_URL}/health")
if echo "${health_response}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='healthy'" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Health check passed"
else
    echo -e "${RED}✗${NC} Health check failed: ${health_response}"
    exit 1
fi

# 2. OAuth discovery
echo "Testing OAuth discovery..."
oauth_response=$(curl -sf "${BASE_URL}/.well-known/oauth-authorization-server")
if echo "${oauth_response}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'token_endpoint' in d" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} OAuth discovery working"
else
    echo -e "${RED}✗${NC} OAuth discovery failed: ${oauth_response}"
    exit 1
fi

# 3. OAuth protected resource metadata
echo "Testing protected resource metadata..."
resource_response=$(curl -sf "${BASE_URL}/.well-known/oauth-protected-resource")
if echo "${resource_response}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '/mcp' in d.get('resource','')" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Protected resource metadata working"
else
    echo -e "${RED}✗${NC} Protected resource metadata failed: ${resource_response}"
    exit 1
fi

# 4. Dynamic client registration
echo "Testing dynamic client registration..."
reg_response=$(curl -sf -X POST "${BASE_URL}/register" \
    -H "Content-Type: application/json" \
    -d "{\"redirect_uris\":[\"${BASE_URL}/oauth/callback\"],\"client_name\":\"ci-smoke-test\",\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"token_endpoint_auth_method\":\"none\"}")
if echo "${reg_response}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'client_id' in d" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Dynamic client registration working"
else
    echo -e "${RED}✗${NC} Dynamic client registration failed: ${reg_response}"
    exit 1
fi

# 5. MCP endpoint responds
echo "Testing MCP endpoint..."
mcp_status=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"ping","id":1}')
if [[ "$mcp_status" -gt 0 ]] && [[ "$mcp_status" -lt 500 ]]; then
    echo -e "${GREEN}✓${NC} MCP endpoint responding (HTTP ${mcp_status})"
else
    echo -e "${RED}✗${NC} MCP endpoint failed (HTTP ${mcp_status})"
    exit 1
fi

# 6. Landing page
echo "Testing landing page..."
landing_status=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/")
if [[ "$landing_status" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Landing page serving"
else
    echo -e "${RED}✗${NC} Landing page failed (HTTP ${landing_status})"
    exit 1
fi

echo -e "\n${GREEN}All smoke tests passed!${NC}"
