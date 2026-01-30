# MCP list_loops Bug Fix + MemoRable Optimization

**Date:** 2026-01-30
**Author:** Claude + Alan
**Status:** Analysis Complete, Awaiting Implementation

---

## Executive Summary

The `list_loops` MCP tool is fundamentally broken. It performs semantic search on the memories collection instead of querying the actual `open_loops` collection. This single bug caused:
- 190+ "undefined" entries polluting every session start
- ~16k tokens of noise per `list_loops` call
- Complete failure of commitment tracking functionality

---

## The Bugs (Two Issues)

### Bug 1: api_client.ts calls wrong endpoint
**Location:** `src/services/mcp_server/api_client.ts:318-340`

### What It Does (WRONG)
```typescript
async listLoops(options?: {
  person?: string;
  owner?: 'self' | 'them' | 'mutual';
  includeOverdue?: boolean;
}): Promise<unknown[]> {
  // WRONG: Semantic search on memories collection
  const query = options?.person
    ? `open commitment ${options.person}`
    : 'open commitment follow-up';

  const result = await this.recall(query, {
    entity: options?.person,
    limit: 50,
  });

  // WRONG: Substring filtering on memory content
  return result.memories.filter(m =>
    m.content.toLowerCase().includes('commit') ||
    m.content.toLowerCase().includes('promise') ||
    m.content.toLowerCase().includes('follow up') ||
    m.content.toLowerCase().includes('owe')
  );
}
```

### Why It's Wrong
1. Calls `this.recall()` which searches the **memories** collection
2. Returns indexed documentation chunks that happen to contain words like "commit"
3. Never touches the **open_loops** collection where real commitments live
4. The `/loops` endpoint in `server.js:10285` works correctly but is never called

### What It Should Do (CORRECT)
```typescript
async listLoops(options?: {
  person?: string;
  owner?: 'self' | 'them' | 'mutual';
  includeOverdue?: boolean;
}): Promise<unknown[]> {
  const params: Record<string, string> = {};
  if (options?.person) params.person = options.person;
  if (options?.owner) params.owner = options.owner;
  if (options?.includeOverdue !== undefined) {
    params.includeOverdue = String(options.includeOverdue);
  }

  const result = await this.request<{ loops: unknown[]; count: number }>(
    'GET',
    '/loops',
    undefined,
    params
  );

  return result.loops;
}
```

### Bug 2: open_loops collection contains memories
**Location:** MongoDB `open_loops` collection (DATA issue, not code)

Even after fixing Bug 1, the `/loops` endpoint returns memories because the `open_loops` collection was polluted with memory documents:

**What's in there (WRONG):**
```json
{
  "id": "mem_1769397607120_xea61f1f0",
  "content": "MemoRable core philosophy...",
  "entity": "claude_docs",
  "salience": 60
}
```

**What should be there:**
```json
{
  "id": "loop_abc123",
  "description": "Send report to Mike",
  "type": "commitment",
  "owner": "self",
  "otherParty": "Mike",
  "dueDate": "2026-02-01",
  "status": "open"
}
```

**Root Cause:** The doc indexer or memory ingestion wrote to `open_loops` instead of `memories`.

**Fix:** Clean the collection and ensure proper loop extraction at ingest time.

---

## Downstream Effects

### Session Start Hook Pollution
The `session-start-memorable.cjs` hook calls `list_loops` to show open commitments. Because `list_loops` returns doc chunks, the hook receives objects without `description` fields, resulting in:

```
- [Owed to you] undefined
- [Owed to you] undefined
... (190+ times)
```

This was documented in CLAUDE.md as the "January 2026 3-day stupid incident."

### Context Bloat
Each `list_loops` call returns ~16k tokens of indexed documentation instead of a compact list of actual commitments. This fills context rapidly and provides zero value.

### Pattern Learning Broken
Pattern stats show 0 days of data despite 4+ days of memories. The system can't learn patterns from commitment tracking if commitments aren't being tracked.

---

## Additional Findings

### 1. Doc Index Duplicates
Same documentation sections indexed multiple times:
- "MEDIUM PRIORITY" from SYSTEM_FLOW_DIAGRAM.md appears 3x
- Many other duplicates exist

**Fix:** Deduplicate on `source_file + section` combination before insert.

### 2. Compaction Snapshots as Memories
The PreCompact hook stores entire JSON conversation transcripts (80k+ chars) as memories. These pollute recall results.

**Fix:** Store compaction snapshots to a separate collection or with a distinct entity that's excluded from normal recall.

### 3. Entity Mixing
Personal memories about Alan are mixed with indexed documentation under similar entities. Searching for "alan said" returns doc chunks.

**Fix:** Use distinct entity namespaces:
- `alan` - personal facts, quotes, preferences
- `claude_docs` - indexed documentation (already exists, but recall doesn't filter)
- `session:{id}` - session-specific context

### 4. Missing Endpoints
- `get_tier_stats` returns 404 - endpoint doesn't exist
- Either implement or remove from MCP tools

### 5. recall_vote Underutilized
The `recall_vote` tool exists but is never used. This would teach the system what memories are actually relevant.

---

## Implementation Plan

### Phase 1: Fix list_loops (CRITICAL)
1. Update `api_client.ts:listLoops()` to call `/loops` endpoint
2. Verify `/loops` endpoint returns proper schema
3. Update session-start hook to handle new response format
4. Test: `list_loops` should return actual commitments, not doc chunks

### Phase 2: Deduplicate Doc Index
1. Add unique constraint on `source_file + section + chunk_index`
2. Or dedupe on insert in indexing script
3. Clean existing duplicates

### Phase 3: Separate Compaction Storage
1. Create `compaction_snapshots` collection
2. Update PreCompact hook to write there
3. Exclude from normal recall queries

### Phase 4: Entity Namespace Clarity
1. Document entity naming conventions
2. Update recall to filter by entity type when appropriate
3. Consider `entity_type` field: `personal`, `documentation`, `session`

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/mcp_server/api_client.ts` | Fix `listLoops()` to call `/loops` |
| `.claude/hooks/session-start-memorable.cjs` | Handle proper loop schema |
| `src/server.js` | Verify `/loops` response format |

---

## Testing

After fix:
```bash
# MCP tool should return actual commitments
curl -H "X-API-Key: $KEY" "$URL/loops?owner=self"

# Should return something like:
{
  "loops": [
    {
      "id": "loop_123",
      "description": "Send report to Mike",
      "owner": "self",
      "person": "Mike",
      "dueDate": "2026-02-01"
    }
  ],
  "count": 1
}
```

---

## Success Criteria

1. `list_loops` returns <1k tokens (not 16k)
2. Session start shows actual commitments (not "undefined")
3. Pattern stats begin accumulating days
4. Recall for personal queries returns personal memories, not docs
