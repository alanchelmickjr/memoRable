# MCP Authentication Fix

> **DEPRECATED (Feb 2026):** This doc references the old ALB stack ($280/40min). Current stack is EC2 + Elastic IP at `52.9.62.72:8080` (us-west-1, ~$11/mo). MCP StreamableHTTP only — no REST endpoints. The hardcoded ALB URL referenced below is DEAD.

## Problem

MCP server doesn't authenticate itself automatically. Users have to manually run curl to authenticate via REST endpoints, then MCP works.

**Root cause**: The session-start hook has a fallback API URL, but `api_client.ts` does not. When env vars aren't set:
- Session-start hook → uses fallback URL → authenticates → works
- MCP → no fallback → returns null → uses DIRECT mode → fails

## Solution

Add the same fallback URL to `api_client.ts` that session-start hook uses:

```typescript
const DEFAULT_API_URL = 'http://52.9.62.72:8080';

export function getApiClient(): ApiClient | null {
  const baseUrl = process.env.API_BASE_URL || process.env.MEMORABLE_API_URL || DEFAULT_API_URL;
  // Now always has a URL, will use REST mode with auto-auth
}
```

## What This Fixes

1. **MCP auto-authenticates**: No manual curl needed
2. **Loops will work**: Once auth flows through, `/loops` endpoint will work (currently commented out in session-start, can re-enable)
3. **Consistent behavior**: Session-start hook and MCP use same URL fallback

## Related Issues

- Routes need auth segregation (user should only see their own entities, not all)
- Re-enable loops in session-start hook after confirming auth works
- Only "Claude" (system level) should see all entities

## Files Modified

- `src/services/mcp_server/api_client.ts` - Added DEFAULT_API_URL fallback

## Testing

1. Start new Claude Code session without env vars set
2. MCP should auto-authenticate (check logs for `[ApiClient] Authenticated successfully`)
3. Tools should work without manual curl auth
