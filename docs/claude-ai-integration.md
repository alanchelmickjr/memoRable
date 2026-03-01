# Claude.ai MCP Integration Guide

**Last Updated:** 2026-03-01
**Status:** WORKING (51 tools connected via Claude.ai)

## Overview

MemoRable integrates with Claude.ai as a remote MCP connector. Claude.ai connects to
`https://api.memorable.chat/mcp` using OAuth 2.1 with PKCE. Once connected, Claude.ai
gets access to 51 memory tools — store, recall, predict, anticipate, emotional context,
and more.

## Live Endpoint

```
MCP URL: https://api.memorable.chat/mcp
Health:  https://api.memorable.chat/health
```

- HTTPS via nginx + Let's Encrypt (cert auto-renews, expires 2026-05-17)
- EC2 in us-west-1 behind Elastic IP
- CloudFormation stack: `memorable`

## Setup (Add to Claude.ai)

1. Go to [Claude.ai](https://claude.ai)
2. Navigate to **Settings** > **Integrations** (or **Connectors**)
3. Click **Add Integration** / **Add custom connector**
4. Enter: `https://api.memorable.chat/mcp`
5. Claude.ai auto-discovers OAuth endpoints and initiates auth flow
6. Approve access when prompted
7. Done — 51 tools available in every conversation

## How Claude.ai OAuth Actually Works

Claude.ai is a **public client** per the MCP spec (2025-03-26). It uses PKCE for
security instead of a client_secret. Here's what actually happens on the wire:

```
┌─────────────┐                                    ┌─────────────────┐
│  Claude.ai  │                                    │  api.memorable  │
└──────┬──────┘                                    └────────┬────────┘
       │                                                    │
       │ 1. GET /.well-known/oauth-authorization-server     │
       │────────────────────────────────────────────────────▶│
       │    ◀── discovery metadata (endpoints, PKCE, etc.)  │
       │                                                    │
       │ 2. POST /register (dynamic client registration)    │
       │    client_id may be email (e.g. alan@utilitron.io)  │
       │    OR Claude.ai may skip this entirely              │
       │────────────────────────────────────────────────────▶│
       │    ◀── { client_id, ... }                          │
       │                                                    │
       │ 3. GET /authorize                                  │
       │    ?client_id=alan@utilitron.io                    │
       │    &redirect_uri=https://claude.ai/oauth/callback  │
       │    &response_type=code                             │
       │    &code_challenge=SHA256(verifier)                │
       │    &code_challenge_method=S256                     │
       │────────────────────────────────────────────────────▶│
       │    ◀── redirect with ?code=xxx                     │
       │                                                    │
       │ 4. POST /token                                     │
       │    grant_type=authorization_code                   │
       │    code=xxx                                        │
       │    client_id=alan@utilitron.io                     │
       │    code_verifier=original_verifier                 │
       │    (+ client_secret — Claude.ai sends BOTH)        │
       │────────────────────────────────────────────────────▶│
       │    ◀── { access_token, refresh_token }             │
       │                                                    │
       │ 5. POST /mcp                                       │
       │    Authorization: Bearer <access_token>            │
       │    Content-Type: application/json                  │
       │    { "jsonrpc": "2.0", ... }                       │
       │────────────────────────────────────────────────────▶│
       │    ◀── MCP JSON-RPC response                       │
```

### Key Discoveries (learned the hard way, PRs #58-#63)

1. **Claude.ai uses email as client_id** — not a UUID from /register
2. **Claude.ai may skip /register entirely** — authorize must accept unregistered clients when PKCE is present
3. **Claude.ai sends BOTH client_secret AND code_verifier** — token validation must check `code_verifier` presence, not `!client_secret`
4. **The MCP URL must be `/mcp`** — Claude.ai POSTs to whatever URL you give it. If you enter `api.memorable.chat` (no path), it POSTs to `/` and gets 404
5. **CORS must include `Mcp-Session-Id`** — MCP protocol uses this header for session management
6. **Discovery must advertise `"none"` auth method** — `token_endpoint_auth_methods_supported: ['none', 'client_secret_post']`

## OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/oauth-authorization-server` | GET | OAuth discovery (REQUIRED by MCP spec) |
| `/register` | POST | Dynamic client registration (RFC 7591) |
| `/authorize` | GET | OAuth authorization (accepts PKCE public clients) |
| `/token` | POST | Token exchange (PKCE validates identity) |
| `/revoke` | POST | Token revocation |
| `/mcp` | POST | MCP StreamableHTTP JSON-RPC endpoint |
| `/health` | GET | Health check |

## Transport Security

- **In-flight:** All JSON-RPC traffic encrypted via TLS 1.2/1.3 (nginx + Let's Encrypt)
- **OAuth tokens:** JWT signed with server secret, transmitted only over HTTPS
- **CORS:** Locked to `https://claude.ai`, `https://claude.com`, and related origins
- **At rest:** MongoDB Atlas encrypts by default; Tier 2/3 memories get AES-256-GCM

## Tools Available (51)

### Core Memory (9)
store_memory, recall, recall_vote, forget, restore, reassociate, export_memories,
import_memories, search_memories

### Context Management (4)
set_context, whats_relevant, clear_context, list_devices

### Briefings & Loops (4)
get_briefing, list_loops, close_loop, resolve_open_loop

### Predictions & Patterns (6)
anticipate, day_outlook, pattern_stats, get_predictions, record_prediction_feedback,
get_anticipated_context

### Emotions & Prosody (10)
analyze_emotion, get_emotional_context, set_emotion_filter, get_emotion_filters,
get_memories_by_emotion, correct_emotion, clarify_intent, start_emotional_session,
stop_emotional_session, list_emotional_sessions

### Relationships & Pressure (5)
get_relationship, get_entity_pressure, set_care_circle, get_tier_stats, get_pattern_stats

### Behavioral Identity (3)
identify_user, behavioral_metrics, behavioral_feedback

### Event Daemon (4)
ingest_event, schedule_check, get_daemon_status, set_entity_vulnerability

### Additional Tools (6)
handoff_device, get_session_continuity, memory_feedback, get_salience_weights,
set_salience_weights, debug_salience

## Testing the Integration

### Quick Check (from any Claude.ai conversation)
```
What MCP tools do you have access to from MemoRable?
```

### Test OAuth Flow Manually
```bash
BASE="https://api.memorable.chat"

# 1. Discovery
curl -s "$BASE/.well-known/oauth-authorization-server" | python3 -m json.tool

# 2. Register a test client
REG=$(curl -s -X POST "$BASE/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://example.com/callback"],"client_name":"test","token_endpoint_auth_method":"none"}')
echo "$REG"

# 3. Get client_id from registration
CID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['client_id'])")

# 4. Generate PKCE pair
CV=$(openssl rand -base64 32 | tr -d '=+/' | head -c 43)
CC=$(echo -n "$CV" | openssl dgst -sha256 -binary | base64 | tr -d '=' | tr '+/' '-_')

# 5. Authorize (follow redirect to get code)
echo "Visit: $BASE/authorize?client_id=$CID&redirect_uri=https://example.com/callback&response_type=code&code_challenge=$CC&code_challenge_method=S256"

# 6. Exchange code for token (replace CODE with actual code from redirect)
curl -s -X POST "$BASE/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=CODE&client_id=$CID&redirect_uri=https://example.com/callback&code_verifier=$CV"

# 7. Test MCP endpoint
curl -s -X POST "$BASE/mcp" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Troubleshooting

### "invalid_client" at /authorize
- Claude.ai may use an unregistered client_id (email). This is expected — PKCE proves identity.
- Check that `code_challenge` is present in the request.

### "invalid_client" at /token
- Claude.ai sends BOTH `client_secret` AND `code_verifier`. Server must accept when `code_verifier` is present regardless of `client_secret`.
- Check server logs: `POST /token` should show `has_verifier=true`.

### 404 on POST /
- The MCP URL in Claude.ai must include the `/mcp` path. Enter `https://api.memorable.chat/mcp`, not just `https://api.memorable.chat`.

### CORS errors
- `Mcp-Session-Id` and `Accept` must be in `allowedHeaders`.
- `DELETE` must be in allowed methods (MCP session teardown).
- `Mcp-Session-Id` must be in `exposedHeaders`.

### Connection drops overnight
- OAuth tokens expire. Claude.ai should auto-refresh, but if the session dies, re-add the connector.

### Checking Server Logs
```bash
# Via SSM (no SSH key needed)
aws ssm send-command \
  --instance-ids "i-0b7bf983feabd6c00" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["docker logs memorable-mcp --tail 50"]'
```

### Runtime Log Level (nervous system)
```bash
# Tickle the nervous system — see everything
curl -X POST "https://api.memorable.chat/admin/log-level" \
  -H "Content-Type: application/json" \
  -d '{"level":"debug"}'

# Calm it back down
curl -X POST "https://api.memorable.chat/admin/log-level" \
  -H "Content-Type: application/json" \
  -d '{"level":"info"}'
```
