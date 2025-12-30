#!/bin/bash
#
# MemoRable OAuth Setup Script
# Generates secure OAuth 2.0 credentials for Claude.ai web integration
#
# Usage:
#   ./scripts/setup-oauth.sh [output-file]
#
# Example:
#   ./scripts/setup-oauth.sh .env.remote

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           MemoRable OAuth 2.0 Setup Script              ║"
echo "║                                                          ║"
echo "║  Generates secure credentials for Claude.ai integration ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Output file (default: .env.remote)
OUTPUT_FILE="${1:-.env.remote}"

# Check if output file exists
if [ -f "$OUTPUT_FILE" ]; then
    echo -e "${YELLOW}Warning: $OUTPUT_FILE already exists.${NC}"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Generating secure credentials...${NC}"

# Generate cryptographically secure random strings
OAUTH_CLIENT_ID=$(openssl rand -hex 16)
OAUTH_CLIENT_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

echo -e "${GREEN}Writing to $OUTPUT_FILE...${NC}"

cat > "$OUTPUT_FILE" << EOF
# MemoRable OAuth 2.0 Configuration
# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
#
# IMPORTANT: Keep these credentials secure!
# Never commit this file to version control.

# ===========================================
# Transport Configuration
# ===========================================

# Use HTTP transport for remote/web access
TRANSPORT_TYPE=http
MCP_HTTP_PORT=8080

# ===========================================
# OAuth 2.0 Configuration
# ===========================================

# Enable OAuth for Claude.ai web integration
OAUTH_ENABLED=true

# OAuth Client Credentials
# These are used by Claude.ai to authenticate
OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=$OAUTH_CLIENT_SECRET

# JWT Secret for signing access tokens
JWT_SECRET=$JWT_SECRET

# Token Expiration
OAUTH_TOKEN_EXPIRY=1h
OAUTH_REFRESH_EXPIRY=7d

# ===========================================
# CORS Configuration
# ===========================================

# Allow Claude.ai origins
ALLOWED_ORIGINS=https://claude.ai,https://claude.com

# ===========================================
# Database Configuration
# ===========================================

# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/memorable

# Redis for context frames (optional)
REDIS_URL=redis://localhost:6379

# ===========================================
# LLM Provider (choose one)
# ===========================================

# Option 1: AWS Bedrock (recommended - no API key needed)
# USE_BEDROCK=true
# AWS_REGION=us-east-1

# Option 2: Anthropic Direct API
# ANTHROPIC_API_KEY=sk-ant-xxx

# Option 3: OpenAI
# OPENAI_API_KEY=sk-xxx

# Auto-detect from environment
LLM_PROVIDER=auto

# ===========================================
# User Configuration
# ===========================================

# Default user ID for memory isolation
MCP_USER_ID=default

# ===========================================
# Logging
# ===========================================

LOG_LEVEL=info
NODE_ENV=production
EOF

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              OAuth credentials generated!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Credentials saved to: ${BLUE}$OUTPUT_FILE${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Review and update $OUTPUT_FILE with your settings"
echo ""
echo "2. Start the server with Docker:"
echo -e "   ${BLUE}docker-compose -f docker-compose.remote.yml --env-file $OUTPUT_FILE up -d${NC}"
echo ""
echo "3. Or start locally:"
echo -e "   ${BLUE}source $OUTPUT_FILE && npm run start:remote${NC}"
echo ""
echo "4. Configure your reverse proxy for HTTPS"
echo ""
echo "5. Add MemoRable to Claude.ai:"
echo "   - Go to Claude.ai → Settings → Connectors"
echo "   - Click 'Add custom connector'"
echo "   - Enter your server URL: https://your-domain.com/mcp"
echo "   - Use these OAuth credentials when prompted:"
echo ""
echo -e "     Client ID:     ${BLUE}$OAUTH_CLIENT_ID${NC}"
echo -e "     Client Secret: ${BLUE}$OAUTH_CLIENT_SECRET${NC}"
echo ""
echo -e "${YELLOW}Security reminder:${NC}"
echo "- Keep $OUTPUT_FILE secure and never commit it to git"
echo "- Add '$OUTPUT_FILE' to your .gitignore"
echo "- Rotate credentials periodically"
echo ""

# Add to .gitignore if not already present
if [ -f ".gitignore" ]; then
    if ! grep -q "^\.env\.remote$" .gitignore 2>/dev/null; then
        echo ".env.remote" >> .gitignore
        echo -e "${GREEN}Added .env.remote to .gitignore${NC}"
    fi
fi

echo -e "${GREEN}Setup complete!${NC}"
