# Cross-Device Memory Event Bus

**Created:** 2026-03-01
**Status:** Proposal
**Problem:** When Claude.ai on iPhone stores a memory, Claude Code doesn't know. Each
session starts blind to what other devices contributed. Memories exist in MongoDB but
no one tells the other agents.

---

## The Gap

```
iPhone (Claude.ai)              Claude Code (terminal)
      │                               │
      │ store_memory("alan had        │
      │   insight about branches")    │
      │──────────▶ MongoDB ◀──────────│ ← doesn't know this happened
      │                               │
      │                               │ "what did we talk about?"
      │                               │ ← has to search, guess, miss
```

Today, each Claude session is an island. MemoRable stores memories centrally (MongoDB),
but no event tells other connected sessions that something changed. The memories are
there — nobody rings the bell.

---

## Proposal: Memory Event Stream

### Architecture

```
                        ┌──────────────┐
                        │   MongoDB    │
                        │   (memories) │
                        └──────┬───────┘
                               │
                     ┌─────────┴─────────┐
                     │  MCP Server       │
                     │  (event emitter)  │
                     └─────────┬─────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
    │ iPhone session │ │ Claude Code  │ │ AR glasses   │
    │ (subscriber)   │ │ (subscriber) │ │ (subscriber) │
    └────────────────┘ └──────────────┘ └──────────────┘
```

### Option A: MongoDB Change Streams (Recommended)

MongoDB Atlas supports change streams natively. The MCP server watches the `memories`
collection and pushes events to connected sessions.

**How it works:**
1. MCP server opens a change stream on the `memories` collection
2. When any device stores/updates/deletes a memory, MongoDB emits a change event
3. MCP server broadcasts to all connected MCP sessions via SSE or notification

**Pros:**
- Zero new infrastructure (MongoDB Atlas already has it)
- Real-time (sub-second latency)
- Reliable (MongoDB handles resume tokens for reconnection)
- Free on Atlas M0 tier

**Cons:**
- Requires persistent connection from MCP server to MongoDB
- Need to filter — not every memory event matters to every session

**Implementation sketch:**
```typescript
// In MCP server startup
const changeStream = db.collection('memories').watch([
  { $match: { operationType: { $in: ['insert', 'update'] } } }
]);

changeStream.on('change', (change) => {
  const memory = change.fullDocument;
  const event = {
    type: 'memory_stored',
    id: memory._id,
    entity: memory.entity,
    source_device: memory.device_type,
    timestamp: new Date(),
    preview: memory.content?.substring(0, 100),
    salience: memory.salience_score,
  };

  // Broadcast to all connected MCP sessions (except origin)
  broadcastToSessions(event, { exclude: memory.session_id });
});
```

### Option B: MCP Notifications (MCP Spec Native)

The MCP protocol supports server-initiated notifications. When a memory is stored,
the server can push a `notifications/memory_stored` event to all connected clients.

**How it works:**
1. Client subscribes during MCP session initialization
2. Server sends JSON-RPC notifications (no response expected)
3. Client (Claude.ai, Claude Code) receives and acts on it

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "memory://alan/latest",
    "meta": {
      "source_device": "iphone",
      "entity": "alan",
      "preview": "branches are scope gates for iterative design",
      "salience": 0.87
    }
  }
}
```

**Pros:**
- Uses MCP protocol natively — no custom transport
- Claude.ai already supports MCP notifications
- Clean separation of concerns

**Cons:**
- Requires StreamableHTTP with SSE channel (already have this)
- Client must maintain connection to receive notifications
- Claude Code sessions are ephemeral — notifications only work while running

### Option C: Polling with Smart Cursor

For clients that can't maintain persistent connections (like Claude Code sessions that
start and stop), a polling approach with a cursor:

```typescript
// New MCP tool: get_recent_activity
{
  name: 'get_recent_activity',
  description: 'Get memories stored since last check',
  inputSchema: {
    since: 'ISO timestamp or cursor',
    devices: 'filter by source device (optional)',
    entities: 'filter by entity (optional)',
  }
}
```

**How it works:**
1. Claude Code session starts, calls `get_recent_activity` with last known timestamp
2. Gets all memories stored by other devices since then
3. Periodically polls (or checks on context load)

**Pros:**
- Works with ephemeral sessions
- No persistent connection needed
- Simple to implement

**Cons:**
- Not real-time (polling interval = latency)
- Must store cursor somewhere (auto-memory, env var, or server-side)

---

## Recommended Approach: A + C Combined

**Option A (Change Streams)** for real-time notification to connected sessions.
**Option C (Smart Cursor)** for session startup catch-up.

### Flow:

```
Claude Code starts a new session:
  1. Load auto-memory (last_activity_cursor)
  2. Call get_recent_activity(since=cursor) via MCP
  3. Receive: "iPhone stored 3 memories since your last session"
  4. Display digest to user
  5. Subscribe to live notifications for remainder of session
  6. On session end, save new cursor to auto-memory

iPhone stores a memory while Claude Code is running:
  1. MCP server detects via change stream
  2. Server sends MCP notification to Claude Code session
  3. Claude Code surfaces: "iPhone just stored: [preview]"
```

### Salience Filter

Not every memory event is worth interrupting for. Apply salience threshold:
- `salience >= 0.7` → immediate notification
- `salience >= 0.4` → batch in digest
- `salience < 0.4` → available on query, no notification

---

## Implementation Steps

1. **Add `get_recent_activity` MCP tool** — query memories by timestamp, device, entity
2. **Add session startup hook** — Claude Code calls `get_recent_activity` on session start
3. **Add MongoDB change stream listener** — watch `memories` collection
4. **Add MCP notification broadcast** — push events to connected StreamableHTTP sessions
5. **Add salience filter** — only notify for high-salience memories
6. **Store cursor in auto-memory** — persist last check timestamp across sessions

### Estimated Effort
- Steps 1-2: Small (new tool + hook adjustment)
- Steps 3-4: Medium (change stream wiring + session tracking)
- Step 5: Small (reuse existing salience calculator)
- Step 6: Small (auto-memory write in session hook)

---

## Future: Full Event Mesh

Once the memory event bus works, extend to:
- **Relationship events** — "iPhone detected new entity: Sarah"
- **Loop events** — "iPhone closed open loop: send Q4 report"
- **Emotional events** — "AR glasses detected elevated stress"
- **Prediction events** — "Pattern predicts: Alan will ask about stocks at 3am"

This is the nervous system extending across all devices on the sensor net.
