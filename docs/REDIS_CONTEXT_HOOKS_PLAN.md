# Redis Context Hooks - Attention

## The Gap: Mem0 Has No Attention

Mem0 stores memories. Mem0 retrieves memories. But Mem0 has no idea what matters RIGHT NOW.

**Mem0:** "Here's everything that matches your query"
**MemoRable:** "Here's what you NEED at this moment"

Attention is the killer feature. The focus window.

## Problem

Context is only loaded at session start. During a conversation:
- Context changes (set_context MCP tool)
- Relevant memories shift
- But Claude doesn't see updates until next session

## The Fix: UserPromptSubmit Hook → Attention Engine

Every prompt, before Claude responds:
1. Hook fires
2. Queries Redis for current context frame
3. Injects relevant context via `additionalContext`
4. Claude responds with fresh context

## Redis Key Structure

```
memorable:{entityId}:attention   → Attention focus window (what matters NOW)
memorable:{entityId}:context     → Current context frame (location, activity, people)
memorable:{entityId}:predictions → Pre-surfaced memories (passed attention filter)
memorable:{entityId}:loops       → Active commitments for this entity (scoped)
```

**:attention** is the key mem0 doesn't have. It's computed from:
- Recent activity patterns
- Current context frame
- Temporal signals (time of day, day of week)
- Entity hierarchy (what scope are we in)
- Salience scores of recent memories

## Hook Flow

```
┌─────────────────┐
│ User types      │
│ prompt          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ UserPromptSubmit│
│ hook fires      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1. Auth (reuse  │
│    session key) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. GET /context │
│    ?entity=X    │
│    (hits Redis) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Return       │
│ additionalContext│
│ with:           │
│ - Current frame │
│ - Predictions   │
│ - Relevant loops│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Claude sees     │
│ context, responds│
└─────────────────┘
```

## What Gets Injected (Attention Output)

Not everything. Not a query result. **What matters NOW.**

```markdown
## Focus Window (Attention)
Entity: memorable_project
Attention: auth, security, entity hierarchy (based on recent activity)

## Surfaced (3 of 847 memories)
These passed the attention filter:
- [salience:92] Entity scoping security concern from yesterday
- [salience:85] Auth flow discussion - knock/exchange
- [salience:78] Alan: "proper boundaries between items"

## Active Commitments (scoped to this entity)
- [You owe] Fix auth scoping
- [Owed to you] Review from Sarah
```

The difference:
- Mem0 would return 50 memories matching "auth"
- Attention returns 3 that matter RIGHT NOW based on current focus

## Implementation

**New hook:** `.claude/hooks/prompt-context.cjs`

```javascript
// Fires on UserPromptSubmit
// 1. Detect active entity (from CWD or cached)
// 2. GET /context?entity={entity}&include=predictions,loops
// 3. Return additionalContext with formatted context
```

**API endpoint needed:** `GET /context`
- Returns Redis context frame for entity
- Includes predictions if requested
- Includes scoped loops if requested
- Respects entity hierarchy (only sees own scope)

## Ties to Entity Hierarchy

- Hook detects active entity from git remote (same as session start)
- Context query scoped to that entity
- Master entity would see aggregated context
- Sub-entity sees only its own

## Performance

- Redis is fast (~1ms)
- Hook adds ~50-100ms per prompt (auth + query)
- Cache session API key (don't re-auth every prompt)
- Consider: skip if context unchanged (ETag/hash)

## Security

- Same auth as session start (knock/exchange or cached key)
- Entity scope enforced server-side
- No cross-entity context leakage
