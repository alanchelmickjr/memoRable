# Salience Audit & Context Architecture

> **Date**: 2026-02-15
> **Status**: Living document
> **Author**: Claude + Alan (architectural direction)
> **Branch**: claude/chloe-integration-doc

---

## The Core Equation

```
Context → Salience → Relevance → Consistency
```

**Consistency is NOT based on context.** Context is what you *get*. Salience is what you *need*. Salience determines what's relevant right now, and relevant context is what makes AI behavior consistent across sessions, devices, and entities.

Without salience, you drown in context. With salience, you surface what matters.

---

## Current Salience State (Audit Results)

### What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| Weight calculation | **WORKING** | 5 components, weighted sum, capped 0-100 |
| Feature extraction (LLM) | **WORKING** | 18 feature types, ~$0.002/memory, Haiku |
| Feature extraction (heuristic) | **WORKING** | Zero-cost fallback, pattern matching |
| Open loop tracking | **WORKING** | Batch-optimized, closure detection, reminders |
| Relationship tracking | **WORKING** | Engagement trends, snapshots, pressure |
| Context modifiers | **WORKING** | work_meeting, social_event, networking, one_on_one |
| Security tier routing | **WORKING** | Tier3=heuristic only, Tier2=local LLM, Tier1=external |

### What's Broken or Incomplete

| Component | Status | Issue |
|-----------|--------|-------|
| **Relevance scoring** | **BROKEN** | Does NOT see active context frame |
| Adaptive weight learning | Partial | Cold start: needs 20+ actioned retrievals (confidence=0 currently) |
| Anticipation service | Partial | Old service deprecated, new one unclear if wired |
| Pattern learning | Partial | Needs 21-63 days of data to stabilize |
| `set_context` tool | **BROKEN** | `determineMatchReasons()` accessed `memory.memory.text` (fix in this branch) |

### Default Weights

```
emotional:     0.30  (30%)  — Amygdala-driven encoding
novelty:       0.20  (20%)  — What's new gets priority
relevance:     0.20  (20%)  — Personal significance  ← THE PROBLEM
social:        0.15  (15%)  — Relationship events
consequential: 0.15  (15%)  — Downstream effects
```

### The Relevance Gap

**Test case**: Stored a memory about salience being the key to consistency *while actively working on salience*. Result:

```
salience: 12/100
  emotional:     0   (should be > 0, passionate insight)
  novelty:       50  (fair)
  relevance:     0   (WRONG — we're working on salience right now)
  social:        10
  consequential: 0   (WRONG — foundational design decision)
```

**Root cause**: `calculateRelevanceScore()` checks stored user profile data (interests, contacts, goals) but does NOT query the active context frame. It doesn't know what you're *doing right now*. The context frame system exists. The salience scorer doesn't read it.

**Fix**: Wire `calculateRelevanceScore()` to check the active context frame (activity, people, location) when scoring new memories. If someone stores a memory about "salience" while their context frame says activity="working on salience", relevance should spike.

---

## Entity Architecture (Alan's Direction)

### Everything is an Entity

Repos, humans, devices, projects, Claude instances, robots, AR glasses — all entities. The entity model is the backbone of everything.

```
Human (always top-level)
├── Device (phone, laptop, AR glasses, robot)
├── Project (repo, business, personal)
│   ├── Task (kanban item)
│   ├── Document (indexed, intelligence-built)
│   └── Sub-entity (module, service, feature)
├── Relationship (computed, not stored)
└── Context Frame (what matters NOW for this entity)
```

### Entity Ownership Rules

1. **Humans are always top-level entities** — they own everything below
2. **Robots and devices belong to humans** — never autonomous top-level
3. **Entities can own entities** — projects own tasks, tasks own subtasks
4. **Repos are entities** — indexed, with intelligence built on them
5. **Master sees all, children see only themselves** — scoped visibility

### Kanban as Entity State

A kanban board isn't a separate feature. It's a **view** on entity relationships and their states. Tasks are entities owned by project entities owned by human entities. The board is just a projection.

```
Entity: memorable_project
├── task: "Fix set_context bug"        state: done
├── task: "Wire relevance to context"  state: in_progress
├── task: "Build kanban MCP tools"     state: pending
└── task: "Deploy salience fix"        state: blocked_by: "Fix set_context bug"
```

States, transitions, blockers, dependencies — all entity metadata. No separate task system needed.

---

## Coordinated Intelligence (The Train Model)

### The Problem with Big Context

A single Claude instance with a massive context window is an engine without cars. It knows a lot but can't coordinate. Context windows fill up. Sessions end. Everything resets.

### The Solution: Pockets of Claude

Small contexts, each specialized, coordinated through entity relationships and shared salience:

```
Claude Instance A: "Working on salience_calculator.ts"
  Context: salience weights, feature extractor, test results
  Owns: Entity(salience_service)

Claude Instance B: "Working on context_frame.ts"
  Context: Redis frames, device model, memory surfacing
  Owns: Entity(context_frame)

Claude Instance C: "Reviewing PR"
  Context: diff, test coverage, architectural principles
  Owns: Entity(code_review)
```

Each pocket has its own context, pre-loaded with relevant entity intelligence. They don't need to hold everything — they need to hold what's **salient** for their task.

**The train**: Small contexts chained together beat one big engine. Each car carries what it needs. The engine (salience) decides what goes where.

### Pre-Computed Intelligence

Before a Claude instance starts work, MemoRable has already:
1. Indexed the entity (repo, project, person)
2. Built intelligence on it (patterns, relationships, key facts)
3. Scored what's salient for the current context
4. Pre-loaded the right memories into the right pocket

This is how Betty doesn't forget where she was — MemoRable knows before she asks.

---

## Bugs Fixed (This Session)

### 1. `determineMatchReasons()` — `memory.memory.text` crash

**File**: `src/services/salience_service/context_frame.ts` (line 770) and `.js` (line 491)

**Bug**: Accessed `memory.memory.text` (double-nested) when `retrieveMemoriesByQuery` returns objects with `.text` at the top level. Any call to `getRecentRelevant` that returned results crashed the entire `set_context` tool.

**Fix**: Changed to `memory.text` and `memory.extractedFeatures?.peopleMentioned || memory.peopleMentioned`.

**Impact**: `set_context` MCP tool was completely broken in direct mode. Fixed in both `.ts` and `.js`.

---

## What Needs Building

### Immediate (Wire the Gap)

1. **Wire relevance scorer to context frame** — `calculateRelevanceScore()` must check active context
2. **Deploy set_context fix** — push branch, rebuild Docker on EC2
3. **Verify adaptive learning is logging** — `markRetrievalAction()` may not be called during MCP recalls

### Near Term (Entity-as-Kanban)

4. **Entity state model** — add `state`, `owner`, `blockedBy`, `priority` to entity schema
5. **Kanban MCP tools** — `create_task`, `move_task`, `list_board`, `get_backlog`
6. **Entity ownership** — `parent_entity`, `child_entities` relationships
7. **Project indexing as entity intelligence** — repo index becomes entity knowledge

### Medium Term (Coordinated Context)

8. **Context pre-computation** — before Claude starts, pre-load salient entity data
9. **Multi-instance coordination** — entity-scoped context sharing between Claude pockets
10. **Anticipation service wiring** — confirm which implementation is active, wire it in

---

## Salience Scoring Reference

### Component Calculations

**Emotional** (amygdala): Keywords (15pts each, max 60) + sentiment intensity (max 40) + extreme bonus (+10) + intimacy (+15)

**Novelty** (hippocampus): New people (+25 each) + new location (+25) + unusual time (+20) + novel topics (max 30)

**Relevance** (prefrontal): User name (+30) + interests (max 30) + close contacts (max 40) + goals (max 30) + self action items (max 30) — **MISSING: active context frame check**

**Social** (mirror neurons): Relationship events (max 60) + conflict (+25) + intimacy (+35) + group size (+10) + agreements (max 20)

**Consequential** (executive): Action items (max 60) + decisions (max 40) + money (+20) + commitments (max 40) + deadlines (max 20)

### Context Modifiers (Multiplicative)

| Context | emotional | novelty | relevance | social | consequential |
|---------|-----------|---------|-----------|--------|---------------|
| work_meeting | 1.0 | 1.0 | 1.0 | 0.7 | 1.3 |
| social_event | 1.2 | 1.0 | 1.0 | 1.4 | 0.6 |
| networking | 1.0 | 1.4 | 1.0 | 1.0 | 1.2 |
| one_on_one | 1.0 | 1.0 | 1.3 | 1.0 | 1.0 |

### Adaptive Learning

- **Window**: 30 days of retrieval history
- **Min samples**: 20 actioned retrievals
- **Learning rate**: 0.3 (30% learned, 70% default)
- **Min confidence**: 0.5 to use learned weights
- **Current state**: confidence=0, weightsLearned=false (cold start)

---

*The model is the proof. The model is the patient. The model is why this product must exist.*
