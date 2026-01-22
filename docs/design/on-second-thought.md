# On Second Thought: Recall Reconsideration Loop

## The Human Pattern

Humans don't recall once. They recall, evaluate, and reconsider:

```
1st thought: "Where are my keys?" → kitchen counter
2nd thought: "Wait, I wore my jacket..." → jacket pocket
3rd thought: "No, I changed jackets..." → coat rack
4th thought: "Right, I put them in the bowl by the door" → found
```

Each iteration **refines the search** based on what the previous recall triggered. The first answer isn't wrong - it's a stepping stone. The brain uses each recall as a new query vector.

This is NOT the same as "was this useful?" feedback. This is **active reconsideration** - the recalled memory itself changes what you're looking for next.

---

## What Exists Today

| Mechanism | What It Does | Limitation |
|-----------|-------------|------------|
| `memory_feedback` | "Was this pattern useful?" | Binary, no refinement |
| `record_prediction_feedback` | "What did you do with this?" | Action-based, post-hoc |
| `correct_emotion` | "The emotion tag was wrong" | Corrects metadata, not relevance |
| Salience scoring | Ranks at ingest time | Static until explicitly updated |
| Retrieval formula | `semantic * 0.6 + salience * decay * 0.4` | Single-pass, no iteration |

**Gap**: No mechanism for iterative recall refinement. One query → one ranked list → done.

---

## The On Second Thought Loop

### Core Concept

A recall session becomes a **conversation with memory**, not a single query:

```
recall("project deadlines")
  → returns 5 memories
  → user/agent evaluates: "memory #3 is closest but not quite"
  → reconsider(session, vote={mem3: "warm", mem1: "cold", mem5: "hot"})
  → system re-queries using mem5's vector as anchor, suppressing mem1's direction
  → returns 5 NEW memories, weighted toward mem5's semantic neighborhood
  → "Yes, that's it" OR another reconsideration round
```

### The Vote Taxonomy

Not just good/bad. Temperature-based (intuitive, fast):

| Vote | Meaning | System Action |
|------|---------|---------------|
| `hot` | This is exactly right | Boost this vector direction, boost memory salience |
| `warm` | Getting closer | Slight boost, use as secondary anchor |
| `cold` | Not what I meant | Suppress this vector direction |
| `wrong` | Actively misleading | Suppress hard, lower context-association |
| `spark` | Not what I asked but triggered something | Use as lateral jump - new query seed |

The `spark` vote is key. It's the "on second thought" moment - the memory wasn't the answer but it *triggered* the right thought. This is how human associative memory works.

---

## Architecture

### New Components

```
┌─────────────────────────────────────────────┐
│              RECALL SESSION                  │
│                                             │
│  recall() ──→ [ranked memories]             │
│       ↓                                     │
│  EVALUATE (user/agent votes on each)        │
│       ↓                                     │
│  reconsider()                               │
│    - hot memories → anchor vectors          │
│    - cold memories → suppression vectors    │
│    - spark memories → lateral query seeds   │
│       ↓                                     │
│  RE-RANK / RE-QUERY                         │
│    - Adjusted vector: hot_avg - cold_avg    │
│    - New semantic search with refined vector│
│       ↓                                     │
│  [refined memories] → EVALUATE again?       │
│       ↓                                     │
│  RESOLVE (accept final set)                 │
│    - Update salience scores                 │
│    - Strengthen context associations        │
│    - Train per-entity recall patterns       │
└─────────────────────────────────────────────┘
```

### Session State (Redis)

```typescript
interface RecallSession {
  sessionId: string;
  entityId: string;
  originalQuery: string;
  rounds: RecallRound[];
  resolved: boolean;
  createdAt: Date;
  ttl: number; // Auto-expire unresolved sessions
}

interface RecallRound {
  roundNumber: number;
  queryVector: number[];        // The vector used for this round
  results: ScoredMemory[];      // What was returned
  votes: Map<string, Vote>;     // memoryId → vote
  anchorVector?: number[];      // Computed from hot votes
  suppressionVector?: number[]; // Computed from cold votes
  sparkSeeds?: string[];        // Memory IDs that triggered lateral jumps
}

type Vote = 'hot' | 'warm' | 'cold' | 'wrong' | 'spark';
```

### Vector Arithmetic

The refinement uses simple vector operations:

```typescript
function computeRefinedVector(round: RecallRound): number[] {
  const hotVectors = getVectorsForVote(round, 'hot');
  const warmVectors = getVectorsForVote(round, 'warm');
  const coldVectors = getVectorsForVote(round, 'cold');

  // Weighted centroid of positive signals
  const anchor = weightedAverage([
    ...hotVectors.map(v => ({ vec: v, weight: 1.0 })),
    ...warmVectors.map(v => ({ vec: v, weight: 0.4 })),
  ]);

  // Suppression direction
  const suppress = average(coldVectors);

  // Refined = anchor pushed away from cold zone
  return vectorSubtract(anchor, vectorScale(suppress, 0.3));
}
```

For `spark` votes, a **separate lateral query** is spawned using the spark memory's vector directly - it's a branch, not a refinement of the main path.

---

## MCP Tools

### `recall_session_start`

Opens a recall session. Returns session ID and first-round results.

```typescript
{
  name: "recall_session_start",
  params: {
    query: string;          // Initial query
    entity?: string;        // Entity context
    limit?: number;         // Results per round (default: 5)
    maxRounds?: number;     // Safety cap (default: 4)
  },
  returns: {
    sessionId: string;
    round: 1;
    memories: ScoredMemory[];
  }
}
```

### `recall_vote`

Vote on memories in the current round. Triggers re-ranking.

```typescript
{
  name: "recall_vote",
  params: {
    sessionId: string;
    votes: Record<string, Vote>; // memoryId → hot/warm/cold/wrong/spark
  },
  returns: {
    round: number;              // Next round number
    memories: ScoredMemory[];   // Refined results
    sparkBranches?: ScoredMemory[]; // Lateral results from spark votes
    converged: boolean;         // System thinks results are stable
  }
}
```

### `recall_resolve`

Accept the current results. Triggers learning updates.

```typescript
{
  name: "recall_resolve",
  params: {
    sessionId: string;
    acceptedMemoryIds?: string[]; // Which memories were actually useful
    note?: string;                // Optional context for learning
  },
  returns: {
    updated: number;  // How many memories had salience adjusted
    learned: boolean; // Whether a new pattern was stored
  }
}
```

---

## Learning Effects

When a session resolves, the system learns:

1. **Salience adjustment**: Hot/accepted memories get salience boost for this entity+context combination
2. **Association strengthening**: Memories that were hot together become more associated
3. **Suppression memory**: Cold/wrong memories in this context get a negative context weight (not globally lowered - just for this query pattern)
4. **Spark patterns**: If spark memories consistently lead to resolution, they become prediction hooks ("when X is recalled, also surface Y")
5. **Round count signal**: Sessions that resolve in 1 round = good initial recall. Sessions needing 4 rounds = the salience/ranking needs tuning for this entity

---

## Constraints & Safety

- **Max 4 rounds** by default (configurable). Prevents infinite loops.
- **Session TTL**: 5 minutes. Unresolved sessions auto-expire.
- **No global salience changes from votes alone** - only context-specific weights adjust. A memory isn't "bad" globally just because it was cold in one context.
- **Privacy**: Session state is ephemeral (Redis with TTL). Vote history stored only as aggregate patterns, not individual session logs.
- **Three Pillars alignment**:
  - Temporal: Sessions expire, votes don't create permanent marks
  - Privacy: No session logs, only aggregate learning
  - Relevance: Directly improves ATR (Always The Right memory at the right time)

---

## How This Fits the Architecture

```
EXISTING:
  recall() → single query → ranked list → done

WITH ON SECOND THOUGHT:
  recall_session_start() → first pass
       ↕ (iterative)
  recall_vote() → refined pass (up to maxRounds)
       ↓
  recall_resolve() → learning update
       ↓
  Future recall() calls benefit from learned patterns
```

The existing `recall` tool stays unchanged for simple lookups. The session-based tools are for when precision matters - finding the RIGHT memory, not just A memory.

---

## Relationship to Existing Feedback

| Existing Tool | Scope | Timing |
|---------------|-------|--------|
| `memory_feedback` | Single prediction | After surfacing |
| `record_prediction_feedback` | Single hook | After action |
| **`recall_vote`** (new) | Recall session | During retrieval |

The new tools are **inline with retrieval** - they happen DURING the search, not after. This is the key difference. Existing feedback is retrospective. On Second Thought is real-time refinement.

---

## Implementation Priority

**Phase 1 (Simple)**:
- `recall_vote` as a single feedback tool (no sessions, no vector arithmetic)
- Just vote hot/cold on recall results → adjust salience scores
- ~100 lines of new code

**Phase 2 (Sessions)**:
- Redis session state
- Multi-round iteration
- Vector refinement math

**Phase 3 (Learning)**:
- Aggregate patterns from resolved sessions
- Spark → prediction hook generation
- Per-entity recall preference learning
