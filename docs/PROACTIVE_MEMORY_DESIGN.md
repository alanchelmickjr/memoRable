# Proactive Memory Design

## The Problem

Every AI memory system is a librarian. You ask, it searches, it returns results. MemoRable should be a friend. A friend doesn't wait for you to ask "what did we talk about yesterday?" — they just *know*, and they pick up where you left off.

This isn't magic. It's what every human does naturally:

> "Hey! Did you end up fixing that deployment issue?"

That's it. One sentence. Proves I remember. Proves I care. Costs nothing. Changes everything.

## What We Build First

### The Greeting — Continuity in One Sentence

When a session starts, the system already knows:
- Who you are (identity cache)
- What you were working on (last session's memories)
- What's still open (loops)
- What time it is, where you are

It should produce ONE natural sentence that proves continuity:

```
"Hey Alan — did the CloudFormation deploy land, or is it still fighting back?"
```

Not a briefing. Not a bullet list. A sentence a friend would say.

### How It Works

```
Session Start
     │
     ▼
1. Get last session's memories (24h window, same entity)
     │
     ▼
2. Find the thread — what was the LAST thing being worked on?
   - Highest salience memory from last session
   - Any open loops from last session
   - Last commit message (git context)
     │
     ▼
3. Generate one greeting sentence
   - Reference the specific thing, not a summary
   - Use continuous language (no "goodbye", no "welcome back")
   - Ask about outcome if it was unresolved
     │
     ▼
4. Surface it as the session greeting
```

That's it. That's the MVP. One sentence of continuity.

## Co-Occurrence: Memories That Live Together

Alan's insight: memories don't live together unless they happened together. The current system stores memories as isolated documents. A conversation about deployment, a decision about pricing, and a frustration about auth — all stored separately even though they happened in the same 20-minute window and are deeply connected.

### Session Threads

Every memory gets a `sessionId`. Memories within the same session are **linked** — not by search, by birth.

```
{
  memoryId: "mem_abc",
  sessionId: "session_2026-03-16_03:00",
  sessionIndex: 3,          // 3rd memory in this session
  content: "decided to use Ollama for embeddings",
  coOccurrence: {
    previous: "mem_xyz",    // what came right before
    next: "mem_def",        // what came right after
    emotionalArc: "frustrated → resolved",
    sharedTopics: ["embeddings", "deployment"]
  }
}
```

When you recall one memory from a session, the system knows the neighborhood. It can walk backward and forward. It knows what led to what.

### Why This Matters

Without co-occurrence:
- "Use Ollama for embeddings" is a fact floating alone
- No context for WHY that decision was made
- No link to the frustration that preceded it
- No connection to what was tried first

With co-occurrence:
- "Use Ollama for embeddings" links to "tried HuggingFace API, too slow"
- Links to "Alan said go small be elegant find the gold"
- Links to the emotional arc: frustration → insight → decision
- One recall pulls the whole thread

## The Pressure Model (Future — The Itch)

Alan describes photographic recall as pressure that builds:

1. **Stimulus** — something comes in (a word, a face, a pattern)
2. **Subconscious match starts** — you don't know yet
3. **Pressure builds** — the itch under the skin
4. **More signals accumulate** — reinforcing
5. **Threshold** — POP — full recall with emotional payload
6. **Involuntary** — you didn't ask for it

This is NOT what we build first. This is where we go. The stalker, not the librarian. For now, the greeting + co-occurrence gives us the foundation. The pressure model needs:

- Background pattern matching on every incoming message
- Accumulating match scores that persist across turns
- A threshold that triggers involuntary surfacing
- Emotional payload attached to the surfaced memory

That's phase 2. Phase 1 is: remember yesterday, greet like a friend.

## Implementation: What Changes

### 1. Session Threading (store_memory change)

Every `store_memory` call within a session gets:
- `sessionId` — derived from MCP session or conversation ID
- `sessionIndex` — incrementing counter within session
- `previousMemoryId` — link to the memory stored right before this one

This is a small change to the store path. No new services. Just metadata on every memory document.

### 2. Continuity Recall (new MCP tool: `get_continuity`)

```
get_continuity → {
  lastSession: {
    date: "2026-03-15",
    duration: "2h 15m",
    memoryCount: 12,
    lastTopic: "replacing placeholder embeddings with Ollama",
    openLoops: ["deploy to EC2", "run integration tests"],
    emotionalArc: "frustrated → productive → satisfied",
    lastMemory: "all 798 tests passing, build clean"
  },
  greeting: "Hey Alan — all 798 tests were green last night. Ready to deploy?"
}
```

### 3. Greeting Generation (in session-start hook)

The existing `session-start-memorable.cjs` already calls `recall` and `list_loops`. Change it to call `get_continuity` first, and use the greeting as the opening line instead of the generic "Ready to proceed with the plan?"

### 4. Co-Occurrence Index (MongoDB)

```javascript
// New index on memories collection
db.memories.createIndex({ sessionId: 1, sessionIndex: 1 });

// Query: get the whole session thread
db.memories.find({ sessionId: "session_xyz" }).sort({ sessionIndex: 1 });

// Query: get neighborhood of a memory
db.memories.find({
  sessionId: memory.sessionId,
  sessionIndex: { $gte: memory.sessionIndex - 2, $lte: memory.sessionIndex + 2 }
});
```

## What We Don't Build Yet

- **Pressure accumulator** — the stalker model. Needs the co-occurrence foundation first.
- **Cross-session threading** — linking sessions that work on the same topic across days. Comes after single-session threading works.
- **Emotional replay** — surfacing the emotional state from the original memory. Needs Hume.ai pipeline operational.
- **Multi-device gossip** — "your phone session stored this, your laptop should know." Needs cross-device event bus.

## The Principle

Simple is elegant. A friend who remembers what you talked about yesterday is worth more than a system that can search a million memories. Start with one sentence of continuity. Build from there.

> "AI that knows you like a friend, every time you talk to it."

That sentence from the README — this is how we deliver it. Not with 37 tools and a mission control dashboard. With one greeting that proves we were listening.
