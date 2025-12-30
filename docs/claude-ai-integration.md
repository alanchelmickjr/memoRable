# Claude.ai Web Integration Guide

This guide explains how to integrate MemoRable with Claude.ai for web-based memory access.

## Overview

MemoRable can be used with Claude.ai in two ways:

1. **Custom Connector** - Deploy your own MemoRable server and add it as a custom MCP connector
2. **Official Directory** - Use the pre-approved MemoRable connector from the Anthropic MCP Directory

## Prerequisites

- Claude.ai Pro, Max, Team, or Enterprise account
- A deployed MemoRable server with:
  - HTTPS with valid certificate
  - OAuth 2.0 enabled
  - Streamable HTTP transport

## Option 1: Custom Connector Setup

### Step 1: Deploy MemoRable Server

Deploy MemoRable as a remote MCP server using Docker:

```bash
# Clone the repository
git clone https://github.com/alanchelmickjr/memoRable.git
cd memoRable

# Generate OAuth credentials
./scripts/setup-oauth.sh

# Start with Docker Compose
docker-compose -f docker-compose.remote.yml up -d
```

### Step 2: Configure Environment

Create a `.env.remote` file:

```env
# Required OAuth Configuration
OAUTH_ENABLED=true
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
JWT_SECRET=your-jwt-secret

# Transport
TRANSPORT_TYPE=http
MCP_HTTP_PORT=8080

# CORS (Claude.ai origins)
ALLOWED_ORIGINS=https://claude.ai,https://claude.com

# Database
MONGODB_URI=mongodb://localhost:27017/memorable

# LLM Provider (optional - for enhanced feature extraction)
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Step 3: Set Up HTTPS

MemoRable requires HTTPS for Claude.ai integration. Options:

**Option A: Using a reverse proxy (recommended)**

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name memorable.yourdomain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Option B: Using AWS with ALB**

Deploy using the CloudFormation template which includes an Application Load Balancer with ACM certificate.

### Step 4: Add to Claude.ai

1. Go to [Claude.ai](https://claude.ai)
2. Navigate to **Settings** → **Connectors**
3. Click **Add custom connector**
4. Enter your server details:
   - **Name**: MemoRable
   - **URL**: `https://memorable.yourdomain.com/mcp`
   - **OAuth**: Enable and configure with your credentials
5. Click **Authorize** to complete OAuth flow

### Step 5: Verify Integration

In a new Claude.ai conversation, try:

```
What MCP tools do you have access to?
```

You should see MemoRable's 20 tools listed.

## Option 2: Official Directory Listing

Once MemoRable is approved in the Anthropic MCP Connectors Directory:

1. Go to [Claude.ai](https://claude.ai)
2. Navigate to **Settings** → **Connectors**
3. Browse the **Directory**
4. Find **MemoRable** and click **Add**
5. Authorize access to your MemoRable instance

## OAuth Flow Details

MemoRable implements OAuth 2.0 Authorization Code flow:

```
┌─────────────┐                                    ┌─────────────┐
│  Claude.ai  │                                    │  MemoRable  │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │ 1. GET /oauth/authorize                          │
       │     ?client_id=xxx                               │
       │     &redirect_uri=https://claude.ai/oauth/callback
       │     &response_type=code                          │
       │     &scope=read%20write                          │
       │─────────────────────────────────────────────────▶│
       │                                                  │
       │ 2. Redirect to redirect_uri                      │
       │    ?code=xxx                                     │
       │◀─────────────────────────────────────────────────│
       │                                                  │
       │ 3. POST /oauth/token                             │
       │    grant_type=authorization_code                 │
       │    code=xxx                                      │
       │    client_id=xxx                                 │
       │    client_secret=xxx                             │
       │─────────────────────────────────────────────────▶│
       │                                                  │
       │ 4. { access_token, refresh_token }               │
       │◀─────────────────────────────────────────────────│
       │                                                  │
       │ 5. POST /mcp (with Bearer token)                 │
       │─────────────────────────────────────────────────▶│
       │                                                  │
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/oauth/authorize` | GET | OAuth authorization |
| `/oauth/token` | POST | Token exchange |
| `/oauth/revoke` | POST | Token revocation |
| `/mcp` | POST | MCP JSON-RPC endpoint |

## Testing Your Integration

### Test Health Endpoint

```bash
curl https://memorable.yourdomain.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "transport": "http",
  "oauth": true
}
```

### Test OAuth Flow

```bash
# 1. Get authorization code (opens browser)
open "https://memorable.yourdomain.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://claude.ai/oauth/callback&response_type=code&scope=read%20write"

# 2. Exchange code for token
curl -X POST https://memorable.yourdomain.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

### Test MCP Endpoint

```bash
curl -X POST https://memorable.yourdomain.com/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

## Example Prompts for Claude.ai

Once connected, try these prompts in Claude.ai:

### Context-Aware Meeting Prep
```
I'm about to meet with Sarah Chen. What should I know?
```

### Memory Storage with Auto-Extraction
```
Remember that Mike promised to send the Q4 report by Friday.
```

### Predictive Day Outlook
```
What's my day outlook?
```

### Recall Past Conversations
```
What did I discuss with the engineering team last week?
```

## Troubleshooting

### "Invalid OAuth credentials"

Verify your `.env.remote` has correct values:
```bash
echo $OAUTH_CLIENT_ID
echo $OAUTH_CLIENT_SECRET
```

### "CORS error"

Ensure `ALLOWED_ORIGINS` includes Claude.ai domains:
```env
ALLOWED_ORIGINS=https://claude.ai,https://claude.com
```

### "Connection refused"

1. Check server is running: `docker ps`
2. Verify port is accessible: `curl http://localhost:8080/health`
3. Check firewall rules allow port 443/8080

### "Token expired"

Tokens expire after 1 hour by default. Claude.ai should automatically refresh tokens. If issues persist:
```env
OAUTH_TOKEN_EXPIRY=2h
OAUTH_REFRESH_EXPIRY=30d
```

## Security Best Practices

1. **Use strong secrets**: Generate with `openssl rand -hex 32`
2. **Enable HTTPS**: Never expose HTTP endpoints publicly
3. **Limit CORS origins**: Only allow claude.ai domains
4. **Monitor access logs**: Watch for suspicious patterns
5. **Rotate credentials**: Update OAuth secrets periodically
6. **Use Redis for tokens**: In production, configure Redis for token storage

## Rate Limits

MemoRable does not impose rate limits by default. For production:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Support

- **GitHub Issues**: https://github.com/alanchelmickjr/memoRable/issues
- **Documentation**: https://github.com/alanchelmickjr/memoRable/docs
