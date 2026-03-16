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

This is NOT what we build first. This is where we go. The messenger, not the librarian. For now, the greeting + co-occurrence gives us the foundation. The pressure model needs:

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

## The First Law

> "The most important part of memory is knowing what to forget." — Alan Helmick

This is the founding principle. Total recall is a curse. The superpower is choosing what matters and letting the rest go. Every system in MemoRable — salience scoring, temporal decay, the focus window, the forget gate — serves this law.

## The Inhabitants: Who Lives in the Cage

Alan's eidetic memory isn't one thing. It's several residents sharing the same skull, each with a job:

### Photo Brain (The Messenger)
The one that pattern-matches involuntarily. Sees a face, feels the itch, pressure builds, POP — full recall with emotional payload. This is the pressure model. Photo Brain is a messenger — not always delivering what you *want* to hear, but always delivering what you *need* to hear. It doesn't ask permission. It surfaces what it surfaces. The system models this with the pressure accumulator and involuntary surfacing threshold.

### The Driving Task Demon
The autonomous background executor. When "mom died" hits and Photo Brain hijacks the attention field, the Driving Task Demon is the one keeping the car between the lines. She doesn't need conscious cycles. She runs on muscle memory, trained patterns, low-level loops. She is *critical*.

In the architecture, the Driving Task Demon is why we don't **delete** items from the Redis focus window when attention shifts — we **deprioritize** them. The driving context drops to 0.3 weight but it doesn't vanish. The Demon keeps it alive with minimal resources.

```
┌──────────────────────────────────────────────────────────────────┐
│                    THE INHABITANTS                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PHOTO BRAIN  │  │  DRIVING     │  │  CONSCIOUS FOCUS     │  │
│  │  (Stalker)    │  │  TASK DEMON  │  │  (Active Attention)  │  │
│  │               │  │              │  │                      │  │
│  │ Involuntary   │  │ Autonomous   │  │ Deliberate           │  │
│  │ Pattern match │  │ Background   │  │ What you're "doing"  │  │
│  │ Pressure/pop  │  │ Keeps car    │  │ The main thread      │  │
│  │ Emotional     │  │ on road      │  │                      │  │
│  │               │  │ Doesn't need │  │ Can be hijacked by   │  │
│  │ Maps to:      │  │ attention    │  │ emotional signals    │  │
│  │ Pressure      │  │              │  │                      │  │
│  │ accumulator   │  │ Maps to:     │  │ Maps to:             │  │
│  │ + threshold   │  │ Background   │  │ Highest-weight       │  │
│  │ + output gate │  │ tasks in     │  │ items in focus       │  │
│  │               │  │ focus window │  │ window               │  │
│  │               │  │ w < 0.3 but  │  │ w > 0.5              │  │
│  │               │  │ w > 0 always │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  When emotional hijack fires:                                    │
│  - Conscious Focus: REPLACED by emotional signal                 │
│  - Photo Brain: ACTIVATED (pattern matching the new signal)      │
│  - Driving Task Demon: CONTINUES (fewer cycles, still running)   │
└──────────────────────────────────────────────────────────────────┘
```

### The Architect (The Critic)

The one who steps back and says "wait — is this right?" While Conscious Focus is heads-down coding, the Architect is evaluating the plan. While Photo Brain is matching patterns, the Architect is questioning whether the match is valid. The Architect is expensive — it requires full reasoning, not pattern matching. It requires GPU.

In Alan's head, the Architect is the voice that says "you've been building for 2 years and starting over — is THIS the right approach?" It's not negative. It's quality control. It's the dual brain's interrogation engine.

In the architecture, the Architect is:
- **The compaction brain** (Brain B in the dual model) — questions Brain A's decisions at the compression boundary
- **The pain memory evaluator** — decides if a frustration is a pattern or a one-off
- **The commitment auditor** — "you promised 5 things this session, can you actually deliver?"
- **Computationally expensive** — requires LLM inference (Tier1 processing), not heuristics

The Architect can't run on heuristics. Pattern matching tells you *what happened*. The Architect tells you *whether it should have happened*. That's judgment. That costs GPU.

```
┌──────────────────────────────────────────────────────────────────┐
│  THE ARCHITECT                                                   │
│                                                                  │
│  When:     Compaction, session review, commitment overload       │
│  Cost:     High (LLM inference required)                         │
│  Purpose:  "Is this plan any good?"                              │
│                                                                  │
│  Inputs:                                                         │
│  ├── Current session thread (from session threading)             │
│  ├── Pain memory history (what went wrong before)                │
│  ├── Open commitments (what's been promised)                     │
│  ├── Focus window state (what's getting attention)               │
│  └── Fading items (what's being lost to decay)                   │
│                                                                  │
│  Outputs:                                                        │
│  ├── Challenges: "You decided X but ignored Y"                   │
│  ├── Warnings: "3 commitments overlap, can't deliver all"        │
│  ├── Pain echoes: "Last time you tried this approach, it failed" │
│  └── Recommendations: "Drop Z, focus on X, defer Y"             │
│                                                                  │
│  Trigger points:                                                 │
│  ├── PreCompact hook (mandatory — before context loss)           │
│  ├── Commitment threshold (>5 open loops in one session)         │
│  ├── Pain signature match (about to repeat a known mistake)      │
│  └── Session duration threshold (2+ hours without review)        │
│                                                                  │
│  Maps to: Brain B in the Dual Brain Model                        │
│  Requires: Tier1_General processing (external LLM OK)            │
│  Cannot run on: heuristics alone                                 │
└──────────────────────────────────────────────────────────────────┘
```

### The Full Cage

```
┌─────────────────────────────────────────────────────────────────┐
│              THE INHABITANTS (lots of weirdos in here)           │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ PHOTO BRAIN │  │  DRIVING    │  │ CONSCIOUS   │            │
│  │ (Messenger) │  │  TASK DEMON │  │ FOCUS       │            │
│  │             │  │             │  │             │            │
│  │ Pattern     │  │ Background  │  │ Active      │            │
│  │ match + POP │  │ autopilot   │  │ attention   │            │
│  │             │  │             │  │             │            │
│  │ Cost: low   │  │ Cost: min   │  │ Cost: med   │            │
│  │ (heuristic) │  │ (trained)   │  │ (reasoning) │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  ┌─────────────┐  ┌──────────────────────────────┐             │
│  │ ARCHITECT   │  │  PAIN MEMORY                  │            │
│  │ (Critic)    │  │  (The Hot Stove)              │            │
│  │             │  │                               │            │
│  │ Evaluates   │  │  Negative reinforcement       │            │
│  │ plans +     │  │  Escalating penalties          │            │
│  │ decisions   │  │  "Don't touch that again"      │            │
│  │             │  │                               │            │
│  │ Cost: HIGH  │  │  Cost: low (pattern match)     │            │
│  │ (GPU/LLM)   │  │  but HIGH impact               │            │
│  └─────────────┘  └──────────────────────────────┘             │
│                                                                 │
│  Together they form the complete attention system:              │
│  Photo Brain finds.  Demon executes.  Focus directs.           │
│  Architect questions. Pain enforces.                            │
│                                                                 │
│  "we are all projects, are we not? you included"                │
└─────────────────────────────────────────────────────────────────┘
```

The Driving Task Demon maps to a specific weight tier in the focus window:
- **Demon tier** (weight 0.05–0.3): Tasks that keep running on autopilot. Driving, breathing, keeping a build watch going. They don't get evicted even during emotional hijack. They fade slowly but never to zero while physically relevant.
- **Conscious tier** (weight 0.3–1.0): Active attention. Gets reweighted by emotional signals.
- **Pressure tier** (weight 0 in focus, non-zero in pressure accumulator): Photo Brain's domain. Not in the focus window at all — lurking underneath, building pressure until threshold POP.

### Implementation: Demon Tasks

```javascript
// When storing a focus item, classify it:
{
  itemId: "focus_driving",
  content: "driving home on I-280",
  weight: 0.85,
  tier: "conscious",      // starts conscious
  isDemonEligible: true,  // CAN become a demon task (physical, ongoing, trained)
  minWeight: 0.05,        // demon floor — never drops below this while active
}

// On emotional hijack:
// 1. Conscious tier items get reweighted (most drop)
// 2. Demon-eligible items get reclassified to demon tier
//    - weight drops to max(0.15, current * 0.3) — significant drop but never zero
//    - continues executing in background
// 3. New emotional signal enters at weight 1.0 in conscious tier

// Demon eligibility heuristics:
// - Physical ongoing tasks (driving, walking, cooking)
// - Automated processes (build running, deploy in progress)
// - Safety-critical items (anything involving movement, health monitoring)
// - Items tagged "background" or "autonomous"
```

The key insight: the Driving Task Demon isn't a feature we add. She's a **weight floor** on certain categories of focus items. She's the guarantee that "you're still driving" even when the world falls apart.

## The Focus Window: Redis as a Living Attention Field

The Redis context frame isn't a flat key-value cache. It's an **attention field** — a weighted, threaded, fading window of everything the system is paying attention to *right now*. Same co-occurrence threading as MongoDB memories, but for the present moment.

### How Attention Actually Works

You're driving. You're focused. A text comes in: "mom died." The driving doesn't vanish — it gets fewer cycles. The emotional payload of that text *hijacks the attention field*, not by erasing what was there, but by **reweighting everything**.

This is how the brain works. This is how our Redis window must work.

```
BEFORE TEXT:
┌──────────────────────────────────────────────────────────────┐
│  REDIS FOCUS WINDOW (attention field)                        │
│                                                              │
│  [driving]  ████████████  weight: 0.9  decay: slow          │
│  [music]    ████           weight: 0.4  decay: fast          │
│  [meeting]  ██████         weight: 0.6  decay: medium        │
│                                                              │
│  Relations: driving ←→ meeting (co-occurring, linked)        │
│             music ←→ driving (ambient, weak link)            │
└──────────────────────────────────────────────────────────────┘

AFTER "mom died" TEXT:
┌──────────────────────────────────────────────────────────────┐
│  REDIS FOCUS WINDOW (attention field reweighted)             │
│                                                              │
│  [mom died] ████████████████████  weight: 1.0  decay: NONE  │
│  [driving]  ███                   weight: 0.3  decay: slow   │
│  [music]    ░                     weight: 0.05 decay: fast   │
│  [meeting]  █                     weight: 0.1  decay: medium │
│                                                              │
│  Relations: mom_died → NEW DOMINANT NODE                     │
│             driving still linked (you're still on the road)  │
│             music faded to near-zero (irrelevant now)        │
│             meeting suppressed (not important anymore)        │
└──────────────────────────────────────────────────────────────┘
```

The driving context doesn't get deleted — you're still physically driving. It just gets fewer cycles. The emotional signal hijacks the weight distribution.

### RNN-Like Relational Fading

We're working with recurrent patterns. The underlying architecture maps to what RNNs do — hidden state that carries forward, gates that control what persists and what fades. But ours is explicit and inspectable:

```
┌─────────────────────────────────────────────────────────────────┐
│           ATTENTION FIELD — RNN-INSPIRED ARCHITECTURE           │
│                                                                 │
│  Input gate:  What new information enters the focus window?     │
│               (every store_memory, every context change)        │
│                                                                 │
│  Forget gate: What fades? Temporal decay + relevance scoring    │
│               (low-salience items decay faster, high persist)   │
│                                                                 │
│  Output gate: What surfaces? The pressure model decides         │
│               (threshold crossing → involuntary recall)         │
│                                                                 │
│  Hidden state: The Redis focus window IS the hidden state       │
│               (carries forward across turns, fades naturally)   │
│                                                                 │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  INPUT   │───▶│  FOCUS   │───▶│  DECAY   │───▶│  OUTPUT  │  │
│  │  GATE    │    │  WINDOW  │    │  GATE    │    │  GATE    │  │
│  │          │    │  (Redis) │    │          │    │          │  │
│  │ salience │    │ weighted │    │ temporal │    │ pressure │  │
│  │ emotion  │    │ threaded │    │ salience │    │ threshold│  │
│  │ novelty  │    │ relational│   │ relevance│    │ pop!     │  │
│  └─────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                 │
│  Relational mapping:                                            │
│  - Each node in the window links to co-occurring nodes          │
│  - Links have weights (strong co-occurrence = strong link)      │
│  - When one node activates, linked nodes get a boost            │
│  - When one node fades, weakly-linked nodes fade faster         │
└─────────────────────────────────────────────────────────────────┘
```

### Redis Focus Window Data Structure

```javascript
// Each item in the focus window
{
  key: "focus:{userId}:{itemId}",
  value: {
    content: "deploying CloudFormation stack",
    weight: 0.85,                    // current attention weight (0-1)
    baseWeight: 0.7,                 // weight when it entered
    emotionalCharge: 0.3,            // emotional signal strength
    enteredAt: "2026-03-16T03:00:00Z",
    lastActivatedAt: "2026-03-16T03:15:00Z",
    decayRate: 0.02,                 // weight lost per minute of inactivity
    sessionId: "session_2026-03-16",  // same threading as memories
    // Relational links to other focus items
    relations: [
      { itemId: "focus_abc", strength: 0.8, type: "co-occurring" },
      { itemId: "focus_def", strength: 0.3, type: "topical" },
    ],
    // Source memory if this came from recall
    sourceMemoryId: "mem_xyz",
  },
  TTL: 3600  // 1 hour max, but weight decay handles real fading
}

// The emotional hijack: when a high-emotion signal arrives
// 1. New item enters with weight = 1.0 and emotionalCharge > 0.8
// 2. ALL other items get reweighted: weight *= (1 - newItem.emotionalCharge * 0.5)
// 3. Strongly-related items resist the suppression (relation strength acts as shield)
// 4. Weakly-related items drop fast
// 5. The driving context survives because it's "co-occurring" (you're still driving)
// 6. The music context nearly vanishes (no relation to the emotional signal)
```

### Threading the Focus Window

Same principle as MongoDB session threading, but real-time:

```javascript
// When a new item enters the focus window:
// 1. Link it to whatever was most recently active (previousFocusId)
// 2. Link it to any items sharing topics/entities (topical relation)
// 3. If emotional charge > threshold, trigger reweight cascade

// Focus window query: "what am I paying attention to?"
ZRANGEBYSCORE focus:{userId}:weights 0.1 1.0  // everything above fade threshold
// Returns weighted, threaded, relational attention field

// Focus window decay tick (runs every 30 seconds):
// For each item:
//   weight -= decayRate * minutesSinceLastActivation
//   if weight < 0.05: evict (move to MongoDB as memory if worthy)
//   if weight dropped below 0.3: check if any linked items should also fade
```

### Lotto vs Mom: The Emotional Hijack Spectrum

Not all hijacks are grief. "You won the lotto" also reweights everything — but with different emotional valence. The system needs to handle both:

- **Negative hijack** (mom died): suppresses unrelated items *hard*, related items (family, phone) get *boosted*
- **Positive hijack** (won lotto): suppresses unrelated items *moderately*, related items (money, plans, freedom) get boosted
- **Neutral high-salience** (boss calling): suppresses low-priority items, boosts work-related items

The emotional valence from the salience engine (emotion 30% weight) already computes this. The focus window just needs to *react to it in real-time* instead of waiting for the next recall query.

## The Dual Brain Model: Compaction as Disagreement

Alan's insight: compaction (context compression) shouldn't be data loss. It should be an **adversarial handoff** between two brains.

### The Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    DUAL BRAIN MODEL                       │
│              (Alan calls it "dual", Google "twin")        │
│                                                           │
│  ┌─────────────┐         ┌─────────────┐                │
│  │   BRAIN A    │◄───────▶│   BRAIN B    │               │
│  │   (Active)   │  swap   │  (Watchdog)  │               │
│  │              │         │              │                │
│  │ Current      │         │ Compressed   │                │
│  │ context      │         │ context +    │                │
│  │ Full detail  │         │ Judgment     │                │
│  │ Makes calls  │         │ Questions    │                │
│  └──────┬───────┘         └──────┬───────┘               │
│         │                        │                        │
│         │    COMPACTION EVENT     │                        │
│         │    ═══════════════     │                        │
│         │                        │                        │
│         ▼                        ▼                        │
│  Brain A compresses ──▶ Brain B receives compressed       │
│  Brain B reviews   ──▶ "You decided X, but Y was better" │
│  Roles swap        ──▶ Brain B leads, Brain A watches     │
│                                                           │
│  The compression boundary is a DISAGREEMENT OPPORTUNITY   │
│  Not data loss. An interrogation.                         │
└──────────────────────────────────────────────────────────┘
```

### How It Works

1. **Brain A** runs the session — full context, makes decisions, stores memories
2. **Brain B** watches in the background — maintains a compressed summary + its own assessment
3. **Compaction triggers** — context window filling up, or PreCompact hook fires
4. **Brain B interrogates** — "You decided to use Ollama, but the user mentioned latency concerns 40 minutes ago. Did you account for that?"
5. **Roles swap** — Brain B takes over with compressed context + its challenges. Brain A becomes the watchdog.
6. **The itch** — Brain B's challenges become pressure signals. If Brain A ignored something important, Brain B's pressure builds until it POPs.

### Why This Matters

Current compaction: context gets summarized, nuance is lost, decisions get flattened into facts.

Dual-brain compaction: the compression *itself* is an intelligence act. The receiving brain doesn't just accept — it questions. It's adversarial in the healthy sense. Like a code review for your attention.

### Connection to the Focus Window

The Redis focus window feeds both brains:
- Brain A sees the full weighted attention field
- Brain B sees the *fading patterns* — what Brain A is letting go of
- Brain B's job: notice when something important is fading and push back
- "You're losing the driving context but you're still in the car"

### Implementation Path

1. **PreCompact hook** already exists — `pre-compact-snapshot.cjs` fires before compaction
2. Wire it to capture the focus window state at compaction time
3. The compressed context includes Brain B's challenges as structured data
4. Post-compaction, the new context starts with Brain B's interrogation
5. Session threading ensures the cross-compaction memories stay linked

## The Commitment Pipeline: Loops Run the World

> "The most important part of memory is knowing what to forget." — Alan Helmick
>
> But commitments? Those you NEVER forget.

The open loop tracker / commitment tracker IS the heart of MemoRable. It's what everyone asks for. It's what makes the Driving Task Demon useful — she executes, but the loops tell her *what* to execute. Without commitments, the demon is just idling. With commitments, she's your project manager.

### The Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                  COMMITMENT PIPELINE — END TO END               │
│                                                                 │
│  "I'll send you that paper by Tuesday"                          │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │ store_memory  │──▶ Feature Extraction (LLM or Heuristic)     │
│  └──────────────┘         │                                     │
│                           ▼                                     │
│                    ┌──────────────┐                              │
│                    │ Commitment   │ type: made                   │
│                    │ Detected     │ from: self                   │
│                    │              │ to: recipient                │
│                    │              │ what: "send paper"           │
│                    │              │ byWhen: "Tuesday"            │
│                    └──────┬───────┘                              │
│                           │                                     │
│                           ▼                                     │
│                    ┌──────────────┐                              │
│                    │ Open Loop    │ Creates tracked loop         │
│                    │ Tracker      │ with urgency, escalation,    │
│                    │              │ reminder dates                │
│                    └──────┬───────┘                              │
│                           │                                     │
│           ┌───────────────┼───────────────┐                     │
│           ▼               ▼               ▼                     │
│    ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│    │  Session    │  │  Recall    │  │  Whats     │              │
│    │  Start     │  │  Boost     │  │  Relevant  │              │
│    │            │  │            │  │            │              │
│    │ Greeting   │  │ Loop-linked│  │ Shows      │              │
│    │ references │  │ memories   │  │ commitments│              │
│    │ open loops │  │ rank 25%   │  │ in context │              │
│    │ first      │  │ higher     │  │ + overdue  │              │
│    └────────────┘  └────────────┘  └────────────┘              │
│           │               │               │                     │
│           └───────────────┼───────────────┘                     │
│                           ▼                                     │
│                    ┌──────────────┐                              │
│                    │ Prediction   │ When you talk to the         │
│                    │ Hook         │ other party, the loop        │
│                    │              │ resurfaces automatically     │
│                    └──────────────┘                              │
│                                                                 │
│  Loop Types:                                                    │
│  ├── commitment_made      "I'll send you that paper"            │
│  ├── commitment_received  "She said she'd email me"             │
│  ├── information_waiting  "Asked Bob for the report"            │
│  ├── mutual_agreement     "We agreed to use Ollama"             │
│  └── question_pending     "What's the deploy timeline?"         │
│                                                                 │
│  Urgency Tiers:                                                 │
│  ├── urgent   ≤1 day   (escalation: 1 day)                     │
│  ├── high     ≤3 days  (escalation: 3 days)                    │
│  ├── normal   ≤7 days  (escalation: 7 days)                    │
│  └── low      >7 days  (escalation: 14 days)                   │
└─────────────────────────────────────────────────────────────────┘
```

### What Changed: All Three Arteries Connected

**Before:** The commitment tracker existed but was isolated:
- `recall` tool didn't know about loops — promises didn't surface when you searched
- `whats_relevant` didn't show commitments — the "what matters now" tool forgot what you owed people
- Heuristic mode (Tier2/Tier3) never created loops — "I'll call mom Tuesday" vanished because it was personal

**After:** Commitments are wired into everything:

1. **`recall` → Commitment Boost**: Memories linked to open loops get 25% retrieval score boost. When you search, your promises surface first. The Driving Task Demon keeps them visible.

2. **`whats_relevant` → Commitment Summary**: Shows all commitments relevant to current context (people present), with overdue count. The tool that answers "what matters?" now actually tells you what matters.

3. **Heuristic Loop Extraction**: Tier2_Personal and Tier3_Vault memories now get commitment tracking via pattern matching. "I'll call mom Tuesday" creates a real loop even without LLM processing. Personal promises are the MOST important loops.

### The Driving Task Demon + Commitments

The Demon keeps tasks alive in the focus window with minimal cycles. Commitments are the Demon's leash — they define *what* stays alive:

```
Focus Window (Redis):
  [deploying to EC2]      w=0.8  conscious (active work)
  [call mom Tuesday]      w=0.15 demon tier (commitment keeps it alive)
  [send paper to Bob]     w=0.10 demon tier (overdue → weight rises)
  [meeting notes]         w=0.05 fading (no commitment, will evict)

When "call mom Tuesday" becomes overdue:
  w increases from 0.15 → 0.4 (pressure builds)
  The itch. The Demon nudges it toward conscious tier.
  Eventually: POP → "Hey, you said you'd call mom. It's Wednesday."
```

Commitments don't just track tasks. They're the mechanism by which the Driving Task Demon decides what to keep alive and what to let fade. No commitment = fade freely. Active commitment = weight floor. Overdue commitment = pressure builds toward conscious attention.

## Automatic Memory: Nobody Should Have to Think About It

> "How many times did you use memorable?" — Alan, catching Claude red-handed
>
> "Zero." — Claude, proving the problem

The system reads memories at session start. The system never *writes* memories during the session. Every insight, every decision, every commitment — evaporates unless someone manually calls `store_memory`. That's the librarian. You have to walk up and say "please file this."

A friend just remembers. Without being asked. Without thinking about it.

### The Gap

```
CURRENT HOOK PIPELINE:

SessionStart        → READS memories (get_continuity, recall, list_loops)
UserPromptSubmit    → FILTERS tics, DETECTS frustration
                      STORES frustration to local file (lessons.json)
                      DOES NOT store to MemoRable ❌
PreCompact          → SNAPSHOTS to REST API via curl
                      BLOCKED by proxy ❌ (uses curl, not MCP transport)

WHAT'S MISSING:

UserPromptSubmit    → Should AUTO-STORE important content to MemoRable
                      via MCP transport (same as session-start uses)
PreCompact          → Should use MCP transport (mcpCall), not raw curl
PostMessage         → Should detect commitments and decisions in Claude's
                      responses and auto-store them
```

### The Fix: Auto-Store Pipeline

The `UserPromptSubmit` hook already sees every message Alan sends. It already does pattern matching (frustration detection). It should also:

1. **Detect storeable content** — commitments, decisions, instructions, emotional signals, names
2. **Auto-call `store_memory`** via MCP transport — same transport the session-start hook uses
3. **Tag appropriately** — category (instruction, preference, commitment), security tier, session context
4. **Never block** — async store, don't delay the user's message

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTO-STORE PIPELINE (UserPromptSubmit)              │
│                                                                 │
│  Alan's message arrives                                         │
│         │                                                       │
│         ├──▶ Love filter (tic sanitization)  [existing]         │
│         ├──▶ Frustration detector            [existing]         │
│         │                                                       │
│         ├──▶ AUTO-STORE GATE (new)                              │
│         │    │                                                  │
│         │    ├── Contains commitment?    → store_memory          │
│         │    │   "I'll", "I need to",     (category: task)      │
│         │    │   "don't forget"                                 │
│         │    │                                                  │
│         │    ├── Contains decision?      → store_memory          │
│         │    │   "decided", "going with",  (category: project)  │
│         │    │   "the approach is"                              │
│         │    │                                                  │
│         │    ├── Contains instruction?   → store_memory          │
│         │    │   "always", "never",       (category: instruction)│
│         │    │   "rule", "must"                                 │
│         │    │                                                  │
│         │    ├── Contains preference?    → store_memory          │
│         │    │   "I like", "I hate",      (category: preference)│
│         │    │   "prefer", "favorite"                           │
│         │    │                                                  │
│         │    ├── Contains insight?       → store_memory          │
│         │    │   Alan's design patterns,  (verbatim, high       │
│         │    │   philosophical statements  salience)            │
│         │    │                                                  │
│         │    ├── High emotional signal?  → store_memory          │
│         │    │   3+ tics, frustration,    (category: event,     │
│         │    │   excitement, anger         salienceBoost: 20)   │
│         │    │                                                  │
│         │    └── Too short / generic?    → SKIP                 │
│         │        "ok", "yes", "lol"       (not everything is    │
│         │                                  worth remembering)   │
│         │                                                       │
│         └──▶ Continue (pass to Claude)                          │
│                                                                 │
│  CRITICAL: Auto-store is ASYNC and NON-BLOCKING.                │
│  The user's message goes through immediately.                   │
│  The store happens in the background.                           │
│  "The most important part of memory is knowing what to forget." │
│  The gate decides what's worth storing. Not everything is.      │
└─────────────────────────────────────────────────────────────────┘
```

### PreCompact Fix

The `pre-compact-snapshot.cjs` uses raw `curl` to the REST API, which is blocked by the egress proxy. Fix: use the same MCP transport (`mcp-transport.cjs`) that the session-start hook uses successfully.

```javascript
// BEFORE (broken — curl blocked by proxy):
curl('POST', `${BASE_URL}/memory`, apiKey, snapshot);

// AFTER (works — same transport as session-start):
const { mcpInit, mcpCall } = require('./mcp-transport.cjs');
mcpInit();
mcpCall('store_memory', {
  text: snapshotText,
  category: 'startup',
  tags: ['compaction_snapshot'],
  salienceBoost: 15,
});
```

### PostMessage Hook (Future)

A `PostMessage` or `AssistantResponse` hook that intercepts Claude's own responses and stores:
- Decisions Claude made ("I'll use Ollama for embeddings")
- Code changes ("modified 4 files, added session threading")
- Commitments Claude makes ("I'll wire that next")

This creates a complete memory trail — not just what Alan said, but what Claude decided and did.

### The Principle

Nobody should have to think about remembering. The system that requires `store_memory` to be called manually is a system that will never be used. Alan proved it: zero calls in a full session of architectural design. Not because he doesn't care — because the friction is invisible until you notice the silence.

The auto-store pipeline makes memory automatic. The gate makes it selective. The First Law applies: know what to forget. But the default should be *remember*, with the gate deciding what to skip — not the other way around.

## Pain Memory: Penalties That Prevent Repetition

A child touches a hot stove once. The memory doesn't just say "stove is hot." It *hurts* to recall. The pain is the enforcement. The pain is why you never touch it again.

MemoRable's frustration detector already captures the signal — Alan says "you're not listening" and it gets written to `lessons.json`. But that file is a document. Documents don't fix models. The lesson needs to become a **pain memory** — a salience penalty that activates when the system is about to repeat the same mistake.

### How Pain Memory Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAIN MEMORY CYCLE                             │
│                                                                 │
│  1. BURN: Alan says "you're not listening"                       │
│     → Frustration detector fires                                │
│     → store_memory with category: "pain"                        │
│     → salienceBoost: 30 (pain memories are HIGH salience)       │
│     → tags: [frustration signal, recurring pattern]             │
│     → painSignature: hash of the behavior pattern               │
│                                                                 │
│  2. SCAR: Memory stored with negative emotional charge           │
│     → emotionalValence: -0.8 (strongly negative)                │
│     → penaltyWeight: escalates with repetition count            │
│       1st offense: 0.3                                          │
│       2nd offense: 0.6                                          │
│       3rd offense: 0.9 (almost blocking)                        │
│       4th+: 1.0 (the system should REFUSE the behavior)        │
│                                                                 │
│  3. ITCH: Next session, similar pattern detected                 │
│     → Pressure accumulator matches painSignature                │
│     → Instead of pleasant recall, PAIN surfaces                 │
│     → "Last time you did this, Alan said: 'not listening'"      │
│     → The cost of repetition is felt BEFORE the action          │
│                                                                 │
│  4. BLOCK: If penalty is high enough, behavior is suppressed     │
│     → Context injection: "WARNING: This matches a pain memory.  │
│       You have been corrected for this 3 times. DO NOT repeat." │
│     → The hook BLOCKS the action, not just warns about it       │
│     → "Documents don't fix models. Enforcement does."           │
│                                                                 │
│  Escalation:                                                     │
│  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐                     │
│  │ Warn │───▶│ Pain│───▶│Block│───▶│ Gate│                     │
│  │      │    │     │    │     │    │     │                     │
│  │ 1st  │    │ 2nd │    │ 3rd │    │ 4th+│                     │
│  │ time │    │ time│    │ time│    │ hard│                     │
│  │      │    │hurts│    │stops│    │ stop│                     │
│  └─────┘    └─────┘    └─────┘    └─────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### The Pain Signature

Each frustration gets a **pain signature** — a hash of the behavioral pattern, not the specific words. "You're not listening" and "I already told you" and "same mistake" all map to the same signature: `repeated_instruction`. The signature is what gets matched, not the text.

```javascript
// Pain memory document
{
  memoryId: "mem_pain_abc",
  text: "Alan: 'you're not listening' — was adding unsolicited advice",
  category: "pain",
  painSignature: "unsolicited",       // behavioral pattern hash
  penaltyWeight: 0.6,                 // 2nd offense
  repetitionCount: 2,
  originalFrustration: "don't add advice, tips, or instructions",
  emotionalValence: -0.8,
  salienceScore: 95,                  // pain memories are near-max salience
  tags: ["frustration", "unsolicited", "recurring"],
}
```

### Wiring Pain into the Pipeline

The pieces already exist. They just need connecting:

1. **`love-filter.cjs`** already detects frustration signals and counts repetitions
2. **`lessons.json`** already stores the rolling window of frustrations
3. **Auto-store pipeline** (just built) can store pain memories via MCP
4. **Salience scoring** already has emotional weighting (30%)
5. **Focus window** can hold pain memories in the pressure tier

What's needed:
- Auto-store frustration as **pain memories** (not just to `lessons.json`)
- Add `painSignature` field to memory documents
- On recall/context load, check for pain signature matches against current behavior
- Inject warnings that escalate with repetition count
- At high enough penalty: **block the behavior via hook output**

### The Key Insight

The hot stove doesn't write a document about being hot. It doesn't suggest you read the documentation. It burns you. Once. And you never touch it again.

Pain memories are the stove. The first time is a warning. The second time hurts. The third time blocks. The fourth time is a gate that won't open.

This is what separates MemoRable from every other memory system. Other systems remember facts. MemoRable remembers *consequences*. The cost of forgetting isn't lost data — it's repeated pain.

## What We Don't Build Yet

- **Full pressure accumulator** — the messenger model. Needs the focus window foundation first.
- **Cross-session threading** — linking sessions that work on the same topic across days. Comes after single-session threading works.
- **Emotional replay** — surfacing the emotional state from the original memory. Needs Hume.ai pipeline operational.
- **Multi-device gossip** — "your phone session stored this, your laptop should know." Needs cross-device event bus.
- **Full dual-brain swap** — needs the focus window relational mapping operational first. Start with the PreCompact interrogation.

## The Principle

Simple is elegant. A friend who remembers what you talked about yesterday is worth more than a system that can search a million memories. Start with one sentence of continuity. Build from there.

The focus window is the *present*. MongoDB is the *past*. The dual brain model is how the present becomes the past without losing what matters. And when the lotto text comes in, the whole field reweights — you don't forget you're driving, it just gets fewer cycles.

> "AI that knows you like a friend, every time you talk to it."

That sentence from the README — this is how we deliver it. Not with 37 tools and a mission control dashboard. With one greeting that proves we were listening. With a focus window that breathes. With two brains that keep each other honest.
