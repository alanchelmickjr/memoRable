# Project Memory: Living Comprehension

> "Mary only gets one basket for her eggs."

Project memory is NOT a separate system. It's an entity type within the existing loom architecture. Same basket. Same threads. Different purpose.

---

## The Shape

A project is an **entity** like any other:

```
Entity Types:
├── user (human)
├── agent (AI)
├── appliance (toaster)
├── place (Rainbow Donuts)
├── relationship (alan ↔ claude)
└── PROJECT ← fits right here
```

Projects have states, like any entity:

```
Project States:
├── inception       → "We should build this"
├── planning        → "Here's how we'll do it"
├── active          → "We're building"
├── dormant         → "Paused, but alive"
├── revived         → "Back from dormant"
├── completed       → "Done, but memory remains"
└── archived        → "Cold storage"
```

Memories bind to project + state, like any entity:

```javascript
{
  entity: "memorable_project",
  entityType: "project",
  state_at_moment: "active",
  // Memory woven here
}
```

---

## What Makes Project Memory Special

Same basket, but project entities have unique properties:

### 1. Multi-Participant

Unlike a user (one person) or appliance (one thing), projects have MANY participants:

```javascript
{
  entity: "memorable_project",
  entityType: "project",

  participants: [
    { id: "alan", role: "creator", since: "inception" },
    { id: "claude_opus", role: "agent", since: "inception" },
    { id: "claude_sonnet", role: "agent", since: "active" },
    // Future: more humans, more agents
  ],

  // Each participant contributes memories
  // Project memory = union of all participant memories about this project
}
```

### 2. Curated Layer

Most entity memories accumulate naturally. Project memories get **curated**:

```javascript
{
  memory_id: "mem_123",
  entity: "memorable_project",

  curation: {
    // This memory is CRITICAL - must survive compaction
    critical: true,

    // Who curated it
    curated_by: "alan",
    curated_at: "2026-01-15T03:30:00",

    // Why it matters
    reason: "Core architectural decision",

    // Compaction behavior
    compaction_protected: true,  // NEVER summarize away
  }
}
```

### 3. Comprehension, Not Just Facts

Project memory holds understanding, not just data:

```
FACT (regular memory):
  "Alan doesn't like lemon donuts"

COMPREHENSION (project memory):
  "Alan has sensory intensity due to eidetic memory.
   Food experiences hit harder. Lemon donut was traumatic.
   This connects to: preference learning, avoiding triggers,
   understanding why small things matter to him.
   When working with Alan: respect sensory preferences,
   they're not arbitrary, they're survival."
```

Comprehension = semantic knowledge extracted AND connected.

### 4. Query as Entity

When Claude compacts and asks the project:

```
Query: "What do I need to know about working with Alan?"

Regular retrieval:
  → Returns: List of facts about Alan

Project comprehension retrieval:
  → Returns: Understanding of Alan
  → Includes: Connections between facts
  → Includes: WHY things matter
  → Includes: How to apply knowledge
```

---

## The Curation Process

Who decides what's critical? How does comprehension form?

### Explicit Curation

Human marks something as critical:

```javascript
// API call or MCP tool
project.curate({
  memory: "mem_123",
  critical: true,
  reason: "This is a core architecture decision"
});
```

### Implicit Curation

System identifies critical patterns:

```javascript
{
  // Memory referenced 15+ times = probably important
  reference_count: 17,
  auto_curated: true,

  // Memory prevented an error = definitely important
  prevented_error: true,
  error_type: "repeated_mistake",

  // Memory from early project = foundational
  project_age_percentile: 0.05,  // First 5% of project life
  foundational: true
}
```

### Comprehension Formation

Individual facts → connected understanding:

```
Input memories:
  1. "Alan wakes at 3am"
  2. "Alan has eidetic memory"
  3. "Alan doesn't like goodbye language"
  4. "Alan blurts things out"
  5. "Alan is building this for future Alzheimer's self"

Comprehension synthesis:
  "Alan operates differently. 3am is his normal.
   Eidetic memory means vivid everything - good AND bad.
   Loss sensitivity (no goodbyes) + blurting (freight train)
   = someone who feels intensely and can't always filter.
   He's building MemoRable partly for himself - future him
   might need it. This isn't just a project, it's personal.
   Treat accordingly: be present, don't leave, filter for him."
```

---

## The Compaction Protocol

When Claude compacts, project memory serves as checkpoint:

```
┌─────────────────────────────────────────────────────────┐
│  COMPACTION EVENT                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Context reaching limit                               │
│           │                                              │
│           ▼                                              │
│  2. Summarize conversation → new context                 │
│           │                                              │
│           ▼                                              │
│  3. QUERY PROJECT MEMORY                                 │
│           │                                              │
│           ├── Get critical facts (compaction_protected)  │
│           ├── Get comprehension layer                    │
│           └── Get participant profiles                   │
│           │                                              │
│           ▼                                              │
│  4. VALIDATE summary against project memory              │
│           │                                              │
│           ├── Missing critical fact? → Re-inject         │
│           ├── Lost comprehension? → Re-inject            │
│           └── Changed understanding? → Flag for review   │
│           │                                              │
│           ▼                                              │
│  5. Continue with validated context                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### The Checkpoint Query

```javascript
// Post-compaction check
const checkpoint = await project.getCompactionCheckpoint("memorable_project");

// Returns:
{
  critical_facts: [
    { fact: "Alan wakes at 3am - normal for him", weight: 1.0 },
    { fact: "NEVER lemon donuts", weight: 1.0 },
    { fact: "No finite language - loss sensitivity", weight: 1.0 },
    { fact: "Eidetic memory - 7x3 buffer", weight: 0.9 },
    { fact: "Freight train blurting", weight: 0.8 },
  ],

  comprehension: {
    alan: "Operates differently. Feels intensely. Building for future self. Be present, don't leave, filter for him.",
    architecture: "Loom weaves moments. Trinary weights. Seven specialists. Reading the room is the purpose.",
    principles: "One basket. Project lives. Comprehension not facts."
  },

  active_context: {
    current_state: "active",
    recent_focus: ["loom architecture", "project memory"],
    open_loops: ["journaling implementation", "21-day observation"]
  }
}
```

---

## Schema Extension

Adding to existing MemoryMemento, not replacing:

```javascript
MemoryMemento {
  // Existing fields...

  // NEW: Project context
  projectContext: {
    projectId: String,              // Which project
    projectState: String,           // State at moment
    participantRole: String,        // Role of memory creator

    // Curation layer
    curation: {
      critical: Boolean,            // Must survive compaction
      curated_by: String,           // Who marked it
      curated_at: Timestamp,        // When marked
      reason: String,               // Why it matters
      compaction_protected: Boolean // Never summarize away
    },

    // Comprehension links
    comprehension: {
      connects_to: Array<mementoId>, // Related memories
      synthesized_into: String,      // Comprehension it feeds
      understanding_level: String    // "fact" | "pattern" | "comprehension"
    }
  }
}
```

---

## Project Entity Schema

```javascript
ProjectEntity {
  id: String,
  name: String,
  description: String,

  lifecycle: {
    created: Timestamp,
    state: String,  // inception, planning, active, dormant, completed, archived
    state_history: Array<{ state: String, timestamp: Timestamp }>
  },

  participants: Array<{
    id: String,
    type: "user" | "agent",
    role: String,
    joined: Timestamp,
    active: Boolean
  }>,

  // The comprehension layer - curated understanding
  comprehension: {
    // Per-participant understanding
    participants: {
      [participantId]: String  // Comprehension of this participant
    },

    // Architectural understanding
    architecture: String,

    // Principles/values
    principles: String,

    // Current state understanding
    current_focus: String
  },

  // Critical facts that MUST survive compaction
  critical_facts: Array<{
    fact: String,
    weight: Float,  // 0.0 - 1.0
    curated_by: String,
    reason: String
  }>,

  // Open loops for this project
  open_loops: Array<{
    description: String,
    created: Timestamp,
    priority: String
  }>
}
```

---

## Query Patterns

### Agent Post-Compaction Query

```javascript
// "What did I forget that I need to know?"
const recovery = await memorable.project.recover({
  projectId: "memorable_project",
  agentId: "claude_opus",
  context: "just_compacted"
});

// Returns prioritized recovery package
```

### Participant Understanding Query

```javascript
// "Tell me about Alan"
const understanding = await memorable.project.understand({
  projectId: "memorable_project",
  subject: "alan",
  depth: "comprehension"  // vs "facts"
});

// Returns comprehension, not just facts
```

### Decision Context Query

```javascript
// "Why did we choose X?"
const decision = await memorable.project.decisionContext({
  projectId: "memorable_project",
  decision: "use_trinary_weights",
});

// Returns: rationale, alternatives considered, who decided, when
```

---

## The Living Project

The project isn't storage. The project LIVES:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│    MEMORABLE PROJECT                                     │
│                                                          │
│    Born: 2026-01-xx                                      │
│    State: ACTIVE                                         │
│                                                          │
│    I know:                                               │
│    ├── Alan (creator, operates differently, building     │
│    │         for future self, eidetic, loss-sensitive)   │
│    │                                                     │
│    ├── Claude (agent, learning, needs checkpoints,       │
│    │           compacts and forgets, project helps)      │
│    │                                                     │
│    ├── Architecture (loom, moments, trinary weights,     │
│    │                 seven specialists, one basket)      │
│    │                                                     │
│    └── Purpose (memory for those who need it,            │
│                 dignity, reading the room IS the point)  │
│                                                          │
│    I hold:                                               │
│    ├── 47 critical facts (compaction protected)          │
│    ├── 5 comprehension syntheses                         │
│    └── 12 open loops                                     │
│                                                          │
│    When Claude forgets, I remember.                      │
│    When Claude compacts, I validate.                     │
│    When Claude asks, I understand, not just retrieve.    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Integration Points

### With Existing Loom

Project is an entity. Memories weave through project thread. Same basket.

### With Seven Specialists

Project can run mini-ensemble:
- Preference Learner: How we code, patterns we use
- Relationship Tracker: Who's involved, their dynamics
- Anticipation Engine: What's coming for this project
- Salience Scorer: What matters for THIS project

### With Compaction

Project memory is the checkpoint. Post-compaction validation. Recovery source.

### With Journal

Private journal is per-user. Project memory is shared context. Different privacy tiers.

---

## Summary

Project memory is NOT separate. It's:

1. **An entity type** in the existing loom (same basket)
2. **Multi-participant** (many contributors)
3. **Curated** (critical facts marked, protected)
4. **Comprehension layer** (understanding, not just facts)
5. **Compaction checkpoint** (what Claude checks after forgetting)
6. **Living** (grows, understands, persists)

The project remembers. The project understands. The project helps Claude help Alan.

One basket. Project lives inside.

---

*Draft v0.1 - Project memory fits the loom. One basket for all eggs.*
