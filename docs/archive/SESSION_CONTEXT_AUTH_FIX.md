# Session Context: Auth Fix for MCP

> **DEPRECATED (Feb 2026):** This doc references the old ALB stack. Current stack is EC2 + Elastic IP at `52.9.62.72:8080` (us-west-1, ~$11/mo). MCP StreamableHTTP only — no REST endpoints. The hardcoded ALB URL and knock/exchange flow referenced below are from the old architecture.

**Date**: 2026-01-28
**Branch**: `claude/focus-attention-session-RbRse`
**Session**: https://claude.ai/code/session_01ERrsHytVJy49CtBX7N4NSi

## What Was Done

### 1. Disabled Loops in Session-Start Hook
**File**: `.claude/hooks/session-start-memorable.cjs`

Loops were causing session problems. Commented out:
- `getOpenLoops()` function (lines 68-76) - now returns empty array
- Open Loops output section (lines 167-180) - commented out

**Commit**: `80f0b3b` - "fix: disable loops loading in session start hook"

### 2. Fixed MCP Auto-Authentication
**File**: `src/services/mcp_server/api_client.ts`

**Problem**: MCP didn't auto-authenticate. Session-start hook had fallback URL, api_client.ts did not.

**Fix**: Added `DEFAULT_API_URL` constant (line 652):
```typescript
const DEFAULT_API_URL = 'http://52.9.62.72:8080';
```

Now `getApiClient()` always has a URL and will use REST mode with auto-auth.

**Commit**: `fd15c84` - "fix: add default API URL fallback to MCP api_client"

**Documentation**: `docs/MCP_AUTH_FIX.md`

## What Still Needs To Be Done

### 1. Test the Auth Fix
- Start new Claude Code session
- Verify MCP auto-authenticates (check logs for `[ApiClient] Authenticated successfully`)
- Verify tools work without manual curl auth

### 2. Re-enable Loops in Session-Start Hook
Once auth is confirmed working:
- Uncomment `getOpenLoops()` function (lines 68-72)
- Uncomment Open Loops output section (lines 169-180)
- Test that loops display correctly

### 3. Add Auth Segregation to Routes
**Critical**: Routes currently return ALL entities. Need to filter by authenticated user:
- `/loops` - should only return loops for the authenticated user
- `/memory` - should only return memories for the authenticated user
- Only "Claude" (system level) should see all entities

**Files to modify**: `src/server.js` - the REST endpoints need to use `req.auth.user_id` to filter queries.

### 4. Update `useRemoteApi()` Function
Currently (line 679-680):
```typescript
export function useRemoteApi(): boolean {
  return !!(process.env.API_BASE_URL || process.env.MEMORABLE_API_URL);
}
```

This doesn't account for the new DEFAULT_API_URL fallback. May need to update to always return true, or add the fallback here too.

## Key Files

| File | Purpose |
|------|---------|
| `.claude/hooks/session-start-memorable.cjs` | Session startup hook - loads context, auth, loops |
| `src/services/mcp_server/api_client.ts` | MCP's HTTP client for REST mode |
| `src/services/mcp_server/index.ts` | MCP server - uses apiClient |
| `src/server.js` | Main REST API server - has /loops, /memory endpoints |

## The Flow

```
Session Start:
1. session-start-memorable.cjs runs
2. Calls /auth/knock → gets challenge
3. Calls /auth/exchange → gets API key
4. Uses API key for /memory, /loops, etc.

MCP Server:
1. initializeDb() called at startup
2. If useRemoteApi() → creates ApiClient
3. ApiClient.authenticate() does knock/exchange
4. All tool calls use apiClient with auth
```

## Commands for Next Session

```bash
# Check current branch
git branch

# View recent commits
git log --oneline -5

# Re-enable loops (after testing auth)
# Edit .claude/hooks/session-start-memorable.cjs
# Uncomment lines 68-72 and 169-180
```
