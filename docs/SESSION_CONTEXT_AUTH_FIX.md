# Session Context: Auth Fix for MCP

**Date**: 2026-01-28
**Branch**: `claude/merge-path-fixes-RbRse`
**Session**: https://claude.ai/code/session_01ERrsHytVJy49CtBX7N4NSi

## What Was Done

### 1. Disabled Loops in Session-Start Hook
**File**: `.claude/hooks/session-start-memorable.cjs`

Loops were causing session problems. Commented out:
- `getOpenLoops()` function (lines 70-74) - now returns empty array
- Open Loops output section (lines 172-185) - commented out

### 2. Fixed MCP Auto-Authentication
**File**: `src/services/mcp_server/api_client.ts`

**Problem**: MCP didn't auto-authenticate. Session-start hook had fallback URL, api_client.ts did not.

**Fix**: Added `DEFAULT_API_URL` constant (line 652):
```typescript
const DEFAULT_API_URL = 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
```

Now `getApiClient()` always has a URL and will use REST mode with auto-auth.

### 3. Added Context Limit to Session-Start Hook
**File**: `.claude/hooks/session-start-memorable.cjs`

**Problem**: Hook was loading too much context, filling context window to 100%.

**Fix**:
- Added `MAX_CONTEXT_CHARS` configurable via `MEMORABLE_MAX_CONTEXT` env var
  - Claude: 4000 (default)
  - Gemini: 16000
  - GPT-4: 8000
- Reduced docs from 5→2 items, truncated to 300 chars each
- Reduced project context from 10→3 items, truncated to 150 chars each
- Final output truncated if over limit, keeps most recent (end of output)

### 4. Merged Path Fixes
**Files**: `.claude/hooks/cc`, `.mcp.json`

Merged fixes from `claude/fix-mcp-memory-hooks-yKABO`:
- Removed hardcoded paths from MCP hooks configuration
- Use npx for portability instead of hardcoded cwd paths

## What Still Needs To Be Done

### 1. Test the Auth Fix
- Start new Claude Code session
- Verify MCP auto-authenticates (check logs for `[ApiClient] Authenticated successfully`)
- Verify tools work without manual curl auth

### 2. Re-enable Loops in Session-Start Hook
Once auth is confirmed working:
- Uncomment `getOpenLoops()` function (lines 70-74)
- Uncomment Open Loops output section (lines 172-185)
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
5. Output capped at 4000 chars max

MCP Server:
1. initializeDb() called at startup
2. getApiClient() uses DEFAULT_API_URL fallback
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
# Uncomment lines 70-74 and 172-185
```

## Branch Cleanup Status

| Branch | Status |
|--------|--------|
| `main` | current |
| `claude/merge-path-fixes-RbRse` | active - ready for PR |
| `claude/focus-attention-session-RbRse` | merged (PR #30) - DELETE |
| `claude/fix-mcp-memory-hooks-yKABO` | merged into path-fixes - DELETE |
| `claude/fix-hooks-loop-freeze-WMFhs` | superseded - DELETE |
| `claude/main-legacy-backup-kh8G7` | backup - KEEP |
