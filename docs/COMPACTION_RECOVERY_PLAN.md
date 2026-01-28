# Compaction Recovery - Rolling Time Machine

## The Problem

Claude's context window fills up → compacts → loses important stuff.
Depth camera data is BIG. Gets junked first. Critical context vanishes.

## The Solution: Redis Time Machine

Before compaction hits, snapshot critical context to Redis.
After compaction, hook recovers what matters.

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT WINDOW                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ [depth data] [depth data] [conversation] [decisions] [code]│ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         ↓ compaction coming                      │
│  ┌───────────────────────────────────────────────────┐          │
│  │ SNAPSHOT TO REDIS before junking                  │          │
│  │ - Critical decisions                              │          │
│  │ - Current task state                              │          │
│  │ - Depth camera summary (not raw data)             │          │
│  └───────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Redis Key Structure

```
memorable:{entity}:compaction:{timestamp}    → Full snapshot
memorable:{entity}:compaction:latest         → Most recent snapshot
memorable:{entity}:compaction:critical       → Always-preserve items
memorable:{entity}:compaction:window         → Rolling window (last N)
```

## Hook Events

### 1. Pre-Compaction Snapshot (if Claude Code supports it)

```javascript
// Hook: PreCompaction (hypothetical)
// Fires before Claude compacts context

function preCompaction() {
  // 1. Identify critical context
  const critical = extractCriticalContext();

  // 2. Summarize large data (depth camera → "robot at waypoint 3, obstacle detected left")
  const summarized = summarizeBulkData();

  // 3. Snapshot to Redis
  storeSnapshot({ critical, summarized, timestamp: Date.now() });
}
```

### 2. Post-Compaction Recovery (UserPromptSubmit hook)

```javascript
// On each prompt, check if we just compacted
function checkCompactionRecovery() {
  // 1. Check if context seems "thin" (heuristic)
  // 2. If thin, fetch latest snapshot from Redis
  // 3. Inject critical context via additionalContext
  // 4. "Double check" - verify important state
}
```

## The "Double Check" Pattern

After compaction, Claude's first response should verify:

```
## Recovery Check
Recovered from compaction snapshot (timestamp).
Verifying critical state:
- [ ] Current waypoint: 3
- [ ] Obstacle status: left side
- [ ] Tour progress: 60%
- [ ] Last decision: paused for obstacle

**Ask user:** Is this state correct? Anything I'm missing?
```

## Depth Camera Strategy

Raw depth data is TOO BIG. Never store raw. Always summarize:

```javascript
// BAD: Store raw depth frame (megabytes)
// GOOD: Store summary
{
  timestamp: "...",
  summary: "Clear path ahead, obstacle 2m left, wall 5m right",
  obstacles: [{ direction: "left", distance: 2, type: "unknown" }],
  decision: "proceed forward"
}
```

## Rolling Window

Keep last N compaction snapshots (configurable):

```
memorable:{entity}:compaction:window → [snap_1, snap_2, snap_3, ...]

// Can "time travel" back if needed:
// "What was my state 3 compactions ago?"
```

## Implementation Steps

1. [ ] Add compaction detection heuristic to UserPromptSubmit hook
2. [ ] Create snapshot storage in Redis (via API)
3. [ ] Add recovery injection to hook
4. [ ] Build "double check" prompt template
5. [ ] Add depth camera summarization for android-bot

## API Endpoints Needed

```
POST /context/snapshot     → Store compaction snapshot
GET  /context/snapshot     → Get latest snapshot
GET  /context/snapshot/:id → Get specific snapshot
GET  /context/window       → Get rolling window
```

## Questions

1. Does Claude Code have a PreCompaction hook? (check docs)
2. What's the heuristic for "just compacted"?
3. How many snapshots in rolling window? (suggest: 5)
