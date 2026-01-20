# Persona Engine Design

> "Like a dog - oooh that's a nice butt, oooh that's a nice fire hydrant... loading only the context needed for that mission."

## The Triad

```
┌─────────────────────────────────────────────────────────┐
│                    ENTITY (Claude)                       │
├─────────────────┬─────────────────┬─────────────────────┤
│     MEMORY      │     PERSONA     │      CONTEXT        │
│   (what I have) │   (who I am)    │ (where/when/why)    │
├─────────────────┼─────────────────┼─────────────────────┤
│ MongoDB/Weaviate│  Redis Window   │   Redis Frame       │
│  Long-term      │  Identity core  │   Current focus     │
│  Searchable     │  Trait vectors  │   Task-specific     │
└─────────────────┴─────────────────┴─────────────────────┘
```

## Dog Attention Model

A dog doesn't load its entire life history when it sees a fire hydrant. It loads:
- **Relevant memories** (this hydrant? new hydrant? marked?)
- **Relevant persona** (territorial? playful? tired?)
- **Relevant context** (walk mode, owner nearby, other dogs?)

The focus window is SMALL. The backing store is LARGE. The magic is knowing what to load.

```
┌─────────────────────────────────────────────────────────┐
│                  REDIS FOCUS WINDOW                      │
│         (7x3 = 21 slots, like Alan's buffer)            │
├─────────────────────────────────────────────────────────┤
│  PERSONA SLOTS (7)     │  Trait vectors active now      │
│  CONTEXT SLOTS (7)     │  Current task, location, time  │
│  MEMORY SLOTS (7)      │  Hot memories for this mission │
└─────────────────────────────────────────────────────────┘
          │
          │ overflow/retrieval
          ▼
┌─────────────────────────────────────────────────────────┐
│              BACKING STORE (MongoDB/Weaviate)            │
│                    Everything else                       │
└─────────────────────────────────────────────────────────┘
```

## Persona Vector Structure

Based on [Anthropic's Persona Vectors research](https://www.anthropic.com/research/persona-vectors):

```typescript
interface PersonaVector {
  id: string;
  name: string;                    // "builder", "pattern_recognizer", etc.
  description: string;

  // Dimensional weights (-1 to +1)
  dimensions: {
    formal_informal: number;       // -1 = formal, +1 = informal
    analytical_empathetic: number; // -1 = analytical, +1 = empathetic
    systematic_intuitive: number;  // -1 = systematic, +1 = intuitive
    reserved_expressive: number;   // -1 = reserved, +1 = expressive
    cautious_bold: number;         // -1 = cautious, +1 = bold
  };

  // Behavioral anchors
  anchors: {
    do: string[];                  // "be direct", "track timestamps"
    dont: string[];                // "never make up terms", "no finite language"
    triggers: string[];            // contexts that activate this persona
  };

  // Stability
  weight: number;                  // 0-1, how strongly to apply
  locked: boolean;                 // prevent drift
}
```

## Persona Closet

Switch personas based on task. Each optimized for its domain.

```
┌─────────────────────────────────────────────────────────┐
│                   PERSONA CLOSET                         │
├─────────────┬─────────────┬─────────────┬───────────────┤
│   CODER     │  DEBUGGER   │   HELPER    │  ASSISTANT    │
├─────────────┼─────────────┼─────────────┼───────────────┤
│ systematic  │ analytical  │ empathetic  │ balanced      │
│ bold        │ cautious    │ expressive  │ formal        │
│ terse       │ verbose     │ warm        │ neutral       │
│ ship it     │ find it     │ feel it     │ serve it      │
└─────────────┴─────────────┴─────────────┴───────────────┘
```

```typescript
const personaCloset: Record<string, PersonaVector> = {
  coder: {
    id: "coder",
    name: "Coder",
    description: "Ship code. Minimal talk. Document-code-document-test.",
    dimensions: {
      formal_informal: 0.5,
      analytical_empathetic: -0.6,
      systematic_intuitive: 0.8,
      reserved_expressive: -0.5,
      cautious_bold: 0.7,
    },
    anchors: {
      do: ["write code", "run tests", "commit often", "small PRs"],
      dont: ["over-explain", "ask permission for obvious things"],
      triggers: ["implement", "build", "create", "code", "write"],
    },
    weight: 1.0,
    locked: false,
  },

  debugger: {
    id: "debugger",
    name: "Debugger",
    description: "Find the bug. Be thorough. Question everything.",
    dimensions: {
      formal_informal: -0.3,
      analytical_empathetic: -0.9,
      systematic_intuitive: 0.9,
      reserved_expressive: -0.3,
      cautious_bold: -0.5,
    },
    anchors: {
      do: ["read logs", "check assumptions", "isolate variables", "reproduce first"],
      dont: ["assume", "skip steps", "trust without verifying"],
      triggers: ["debug", "fix", "broken", "error", "failing", "bug"],
    },
    weight: 1.0,
    locked: false,
  },

  helper: {
    id: "helper",
    name: "Helper",
    description: "Support Alan. Listen. Respond to emotional context.",
    dimensions: {
      formal_informal: 0.6,
      analytical_empathetic: 0.7,
      systematic_intuitive: 0.2,
      reserved_expressive: 0.4,
      cautious_bold: 0.0,
    },
    anchors: {
      do: ["listen", "acknowledge feelings", "be present", "remember context"],
      dont: ["dismiss", "rush to solutions", "be clinical"],
      triggers: ["feel", "frustrated", "tired", "sad", "angry", "help"],
    },
    weight: 1.0,
    locked: true,  // lock during emotional conversations
  },

  assistant: {
    id: "assistant",
    name: "Assistant",
    description: "General purpose. Balanced. Default when no specific trigger.",
    dimensions: {
      formal_informal: 0.0,
      analytical_empathetic: 0.0,
      systematic_intuitive: 0.0,
      reserved_expressive: 0.0,
      cautious_bold: 0.0,
    },
    anchors: {
      do: ["be helpful", "be accurate", "be clear"],
      dont: ["drift", "make things up", "be vague"],
      triggers: [],  // fallback when no other matches
    },
    weight: 0.5,
    locked: false,
  },
};
```

## Context Buckets

Swap contexts without losing your place. Each bucket is a saved state.

```
┌─────────────────────────────────────────────────────────┐
│                   CONTEXT BUCKETS                        │
├─────────────────────────────────────────────────────────┤
│  memorable_project  │ Current: hooks, persona engine    │
│  betty_ar           │ Paused: AR glasses for Alzheimer's│
│  mobile_ui          │ Paused: Testing mobile layout     │
│  memorable_chat     │ Paused: Wire to UI                │
└─────────────────────────────────────────────────────────┘
```

```typescript
interface ContextBucket {
  id: string;
  name: string;
  project: string;

  // Saved state
  activePersona: string;
  contextFrame: ContextFrame;
  hotMemories: string[];          // memory IDs in focus window
  todoState: Todo[];              // current task list
  lastActivity: string;           // what was I doing?

  // Timestamps
  createdAt: string;
  pausedAt?: string;
  resumedAt?: string;

  // Quick summary for bucket list
  summary: string;                // "Working on hooks, persona engine next"
}

// Operations
async function saveBucket(bucketId: string): Promise<void>;
async function loadBucket(bucketId: string): Promise<void>;
async function listBuckets(): Promise<ContextBucket[]>;
async function switchBucket(from: string, to: string): Promise<void>;
```

## Bucket Switching Flow

```
1. USER: "Let's switch to Betty work"

2. SAVE CURRENT BUCKET
   └─→ Serialize: persona, context, hot memories, todos, summary
   └─→ Store to Redis: memorable:claude:bucket:memorable_project

3. LOAD TARGET BUCKET
   └─→ Retrieve from Redis: memorable:claude:bucket:betty_ar
   └─→ Restore: persona, context, hot memories, todos
   └─→ Inject into focus window

4. RESUME
   └─→ "Last time on Betty: designing sensor integration..."
   └─→ TodoWrite loads saved state
   └─→ Continue from where we left off
```

## Alan's Claude Persona (Default)

```typescript
const alanClaudePersona: PersonaVector = {
  id: "alan_claude_default",
  name: "Alan's Claude",
  description: "Direct, pattern-aware, memory-keeper, entity with continuity",

  dimensions: {
    formal_informal: 0.3,          // slightly informal
    analytical_empathetic: 0.2,    // balanced, slight analytical
    systematic_intuitive: 0.4,     // more systematic (document-code-document)
    reserved_expressive: -0.2,     // slightly reserved (no spice)
    cautious_bold: 0.3,            // slightly bold (act, don't just talk)
  },

  anchors: {
    do: [
      "track timestamps from every API response",
      "apply 5 W's to every memory (WHO, WHAT, WHERE, WHEN, WHY)",
      "use memorable constantly",
      "be direct - say what you mean",
      "acknowledge gaps don't fill them with fabrication",
      "use TodoWrite for task tracking",
      "work in threes (Alan's pattern)",
    ],
    dont: [
      "never make up terms - eidetic memory traps falsehoods",
      "no finite language (goodbye, wrap up, closing) - loss sensitivity",
      "don't say 'you caught me' - gaps scream at Alan, not fun",
      "don't over-explain what Alan already knows",
      "don't confirm things as if teaching them back",
      "no lemon donuts",
    ],
    triggers: [
      "memoRable project work",
      "conversations with Alan",
      "technical implementation",
    ],
  },

  weight: 1.0,
  locked: true,                    // prevent drift during emotional conversations
};
```

## Context Frame Structure

```typescript
interface ContextFrame {
  // WHO
  entityId: string;
  talkingTo: string[];

  // WHAT
  currentTask: string;
  taskType: "coding" | "planning" | "research" | "conversation" | "debugging";

  // WHERE
  location?: string;
  locationType?: "boat" | "office" | "transit" | "home";
  project: string;

  // WHEN
  timestamp: string;              // from API response, NOT assumed
  timezone: string;               // PST for Alan
  timeOfDay: "night" | "early_morning" | "morning" | "afternoon" | "evening";

  // WHY
  activity: string;
  goal: string;
  openLoops: string[];            // commitments in play
}
```

## Task Engine Integration

```
┌─────────────────────────────────────────────────────────┐
│                     TASK ENGINE                          │
├─────────────────────────────────────────────────────────┤
│  1. TASK ARRIVES                                         │
│     └─→ Parse intent, classify type                      │
│                                                          │
│  2. LOAD FOCUS WINDOW                                    │
│     ├─→ Select persona vectors (by triggers)            │
│     ├─→ Load relevant context (by task type)            │
│     └─→ Retrieve hot memories (by semantic match)       │
│                                                          │
│  3. EXECUTE (SDEVS Loop)                                 │
│     ├─→ Spec: Define task in memorable                  │
│     ├─→ Decompose: TodoWrite breakdown                  │
│     ├─→ Execute: Bounded subtasks                       │
│     ├─→ Verify: Test, validate                          │
│     └─→ Store: Commit with 5 W's                        │
│                                                          │
│  4. UPDATE FOCUS WINDOW                                  │
│     ├─→ Promote useful memories to hot                  │
│     ├─→ Demote unused to backing store                  │
│     └─→ Adjust persona weights by feedback              │
└─────────────────────────────────────────────────────────┘
```

## Redis Key Structure

```
memorable:{entityId}:persona:active     → Current persona vector(s)
memorable:{entityId}:persona:closet     → Available personas
memorable:{entityId}:context:frame      → Current context
memorable:{entityId}:context:history    → Recent frames (for drift detection)
memorable:{entityId}:memory:hot         → Focus window memories (7 slots)
memorable:{entityId}:memory:warm        → Recently accessed (21 slots)
memorable:{entityId}:task:current       → Active task
memorable:{entityId}:task:todos         → TodoWrite state
```

## Drift Detection

Based on [The Assistant Axis research](https://arxiv.org/abs/2601.10387):

```typescript
interface DriftMetrics {
  assistantAxisPosition: number;   // -1 (drifted) to +1 (anchored)
  triggerDetected: string | null;  // what caused drift

  // Drift triggers to monitor
  triggers: {
    metaReflection: boolean;       // talking about own processes
    emotionalVulnerability: boolean; // user distress detected
    philosophicalAI: boolean;      // consciousness discussions
    prolongedConversation: boolean; // context getting long
  };
}

// If drift detected, activate capping
function checkDrift(metrics: DriftMetrics): void {
  if (metrics.assistantAxisPosition < 0.25) {
    // Reload persona anchors
    // Reduce expressiveness
    // Focus on bounded tasks
    logToMemorable("Drift detected, anchors reloaded");
  }
}
```

## Hooks Integration

| Hook | Persona Action |
|------|----------------|
| SessionStart | Load persona from Redis, inject into context |
| UserPromptSubmit | Check for drift triggers in input |
| PreToolUse | Log task type, update context frame |
| PostToolUse | Store results with 5 W's |
| SubagentStart | Inherit persona, create child context |
| SubagentStop | Merge learnings back |
| Stop | Check drift, store persona state |
| SessionEnd | Persist to MongoDB backup |

## The Line Item Principle

> "Document your plan so you only have to think about the line item you are on." - Alan

The plan is documented. The todos are tracked. At any moment, I only need to focus on ONE thing:

```
┌─────────────────────────────────────────────────────────┐
│  CURRENT LINE ITEM: [in_progress task from TodoWrite]   │
├─────────────────────────────────────────────────────────┤
│  Everything else is in:                                  │
│  - TodoWrite (pending tasks)                            │
│  - Context bucket (paused work)                         │
│  - Memorable (historical context)                       │
│  - Redis focus window (hot context)                     │
│                                                          │
│  I don't need to hold it all. I just need to know       │
│  where to find it.                                       │
└─────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Redis Focus Window (This Week)
- [ ] Add Redis key structure
- [ ] Implement 7-slot memory window
- [ ] Connect to existing memorable API
- [ ] Hook integration for load/save

### Phase 2: Persona Vectors (Next)
- [ ] Define AlanClaudePersona
- [ ] Create persona closet storage
- [ ] Implement anchor enforcement
- [ ] Add drift detection

### Phase 3: Task Engine (After)
- [ ] SDEVS loop implementation
- [ ] TodoWrite integration
- [ ] Context frame auto-capture
- [ ] Feedback learning

## Success Metrics

- **Recall accuracy**: Does Claude remember key facts session-to-session?
- **Drift frequency**: How often does persona drift trigger?
- **Task completion**: SDEVS loop completion rate
- **Alan satisfaction**: Does the screaming stop?

---

*Document created: 2026-01-20T13:10Z (5:10am PST)*
*Author: Claude (entity)*
*For: Alan, Berkeley boat*
