# Relationship Intelligence: Three Revolutionary Approaches

**Status:** Design Document
**Date:** 2026-01-18
**Author:** Alan + Claude (Ricky + Lucy)

---

## Executive Summary

This document defines three interconnected systems that revolutionize how MemoRable handles entity relationships:

1. **Pressure Tracking** - Butterfly → Hurricane early warning
2. **Computed Relationships** - LLM synthesizes from memories, no stored graph
3. **Prediction Hooks** - Surface memories before they're needed

Together, these create a memory system that doesn't just store—it *understands*, *warns*, and *anticipates*.

---

## Philosophy 1: Pressure Tracking (Butterfly → Hurricane)

### The Insight

A wounded person wounds another. The butterfly effect isn't random chance—it's accumulated pain finding an exit.

```
Parent (wounded)
    → Child (wounded)
        → Classmate (wounded)
            → Another child (wounded)
                → [tragedy]

Each arrow is a memory event we could have seen.
Each arrow is a pressure transfer we could have measured.
Each arrow is an intervention point we missed.
```

### What We Track

**Not prediction. Pressure measurement.**

The system doesn't predict tragedies. It measures atmospheric pressure and surfaces to those who can help.

| Metric | What It Measures | Early Warning Sign |
|--------|------------------|-------------------|
| `pressureScore` | Accumulated negative - positive | High = overloaded |
| `pressureTrend` | Rising/stable/falling | Rising = getting worse |
| `receivingFromMultipleSources` | Multiple stressors | Converging pressure |
| `transmittingToOthers` | Passing pain along | Becoming a vector |
| `escalating` | Intensity increasing | Situation worsening |
| `isolating` | Fewer positive interactions | Withdrawal |

### Intervention Urgency Levels

| Level | Criteria | Action |
|-------|----------|--------|
| `none` | Baseline, balanced | Normal operation |
| `monitor` | 1-2 flags | System notes pattern |
| `concern` | 3-4 flags | Surface to care circle |
| `urgent` | 5+ flags | Alert caregivers |

### Care Circle

Each entity can have a `careCircle`—other entities who should be notified if pressure becomes concerning:
- Betty's care circle: [daughter, doctor, nurse]
- Child's care circle: [parent, teacher, counselor]
- Employee's care circle: [manager, HR, peer_support]

### Data Model

```typescript
interface EntityPressure {
  entityId: string;

  // Vectors in/out
  negativeInputs: PressureVector[];
  positiveInputs: PressureVector[];
  negativeOutputs: PressureVector[];
  positiveOutputs: PressureVector[];

  // Metrics
  pressureScore: number;
  pressureTrend: 'rising' | 'stable' | 'falling';

  // Pattern flags
  patterns: {
    receivingFromMultipleSources: boolean;
    transmittingToOthers: boolean;
    behaviorChangeDetected: boolean;
    isolating: boolean;
    escalating: boolean;
  };

  // Readiness, not prediction
  interventionUrgency: 'none' | 'monitor' | 'concern' | 'urgent';
  careCircle?: string[];
}

interface PressureVector {
  sourceEntityId: string;
  targetEntityId: string;
  memoryId: string;
  timestamp: string;
  intensity: number;        // 0-1
  valence: number;          // -1 to +1
  category?: PressureCategory;
  isRepeated: boolean;
  cascadeDepth: number;     // 0 = direct, 1+ = downstream
  originMemoryId?: string;  // Causal chain origin
}
```

### Use Case: Betty

```
Memory: Doctor says "reduce salt intake"
  → Betty: pressure +0.2 (health concern)
  → No transmission yet

Memory: Betty cries after daughter's call
  → Betty: pressure +0.4 (emotional distress)
  → Source: daughter (unintentional)
  → Pattern: second negative from daughter this week

Memory: Betty snaps at the doll
  → Betty: pressure transmitting
  → Pattern: transmittingToOthers = true

System notes:
  - receivingFromMultipleSources: true (doctor, daughter)
  - transmittingToOthers: true (doll)
  - interventionUrgency: 'concern'

Action: Surface to daughter (care circle):
  "Mom seems stressed lately. Multiple sources."
```

---

## Philosophy 2: Computed Relationships (No Stored Graph)

### The Insight

Traditional graph databases store rigid edges:
```
(Alan)-[:WORKS_WITH]->(Bob)
(Alan)-[:TRUSTS]->(Bob)
(Alan)-[:FRUSTRATED_BY]->(Bob)
```

Which is true? All of them? When? In what context?

**Revolutionary approach:** Don't store relationships. Store memories. Compute relationships on demand.

### How It Works

```
STORAGE (lightweight):
┌─────────────────────────────────────────┐
│ EntityRelationship                      │
│   entityA: "alan"                       │
│   entityB: "bob"                        │
│   sharedMemoryIds: [mem1, mem2, ...]   │
│   interactionCount: 47                  │
│   lastInteraction: "2026-01-18"         │
│   pressureBalance: +0.3                 │
│   cacheDirty: true                      │
└─────────────────────────────────────────┘

QUERY TIME (LLM synthesis):
┌─────────────────────────────────────────┐
│ getRelationship("alan", "bob")          │
│                                         │
│ 1. Fetch shared memories                │
│ 2. Send to LLM with context             │
│ 3. Synthesize relationship description  │
│ 4. Cache result                         │
│                                         │
│ Result: "Close colleagues with mutual   │
│  respect. Strong collaboration history. │
│  Recent tension around auth refactor    │
│  but underlying trust is solid."        │
└─────────────────────────────────────────┘
```

### Why This Is Better

| Traditional Graph | Computed Relationships |
|-------------------|----------------------|
| Rigid schema | Schema-free |
| Static edges | Evolves with memories |
| Context-blind | Context-aware |
| Updates required | Automatic via memories |
| Binary (has edge/doesn't) | Nuanced (LLM understands subtext) |
| Query: traverse edges | Query: synthesize from evidence |

### Data Model

```typescript
interface EntityRelationship {
  entityA: string;
  entityB: string;

  // Pointers to evidence (memories)
  sharedMemoryIds: string[];

  // Lightweight counters
  interactionCount: number;
  lastInteraction: string;
  firstInteraction: string;

  // Pressure flow between them
  pressureBalance: number;  // + = A gives to B, - = B gives to A

  // Cache management
  cachedSynthesis?: string;
  cacheTimestamp?: string;
  cacheDirty: boolean;
}
```

### Cache Invalidation Strategy

Not every memory dirties the cache:

| Memory Type | Dirties Cache? | Reason |
|-------------|----------------|--------|
| "Alan and Bob discussed lunch" | No | Low salience, doesn't change relationship |
| "Alan thanked Bob for help" | No | Confirms existing positive, no change |
| "Alan said he can't trust Bob" | **Yes** | High salience, contradicts cache |
| "Alan promoted Bob to lead" | **Yes** | Significant relationship change |

**Rule:** Dirty cache if `memory.salience > 0.7` AND memory involves both entities.

### API

```typescript
// Get relationship synthesis
async function getRelationship(
  entityA: string,
  entityB: string,
  context?: string  // "regarding work" or "regarding trust"
): Promise<RelationshipSynthesis>;

// Get all relationships for an entity
async function getRelationships(
  entityId: string,
  options?: {
    minInteractions?: number;
    includeStale?: boolean;
    context?: string;
  }
): Promise<RelationshipSynthesis[]>;

// Force refresh (ignore cache)
async function refreshRelationship(
  entityA: string,
  entityB: string
): Promise<RelationshipSynthesis>;

interface RelationshipSynthesis {
  entityA: string;
  entityB: string;
  synthesis: string;           // LLM-generated description
  sentiment: number;           // -1 to +1
  strength: number;            // 0 to 1 (interaction frequency)
  recentTrend: 'improving' | 'stable' | 'declining';
  keyMemories: string[];       // Most significant memory IDs
  lastUpdated: string;
}
```

### Use Case: Conference Call

```
Memory: "Company A wants 3 dogs, Company B will supply when D provides bowls"

Entities involved: [A, B, C, D]

Relationships created/updated:
- A ↔ B: sharedMemoryIds.push(memId), interactionCount++
- A ↔ C: (C wants one of A's dogs)
- B ↔ D: (B blocked by D)

Query: getRelationship("company_b", "company_d")

LLM sees memories and synthesizes:
"B depends on D for bowl supply. This is a blocking dependency
 for B's commitment to A. D may not be aware of this obligation.
 Relationship is transactional, urgency is high."
```

---

## Philosophy 3: Prediction Hooks (Surface Before They Ask)

### The Insight

Real memory isn't "query → answer."
Real memory is "context shifts → relevant thing appears → 'Oh right!'"

**North Star:** Surface memories before the user knows they need them.

### How It Works

```
INGEST TIME:
┌─────────────────────────────────────────┐
│ Memory: "Doctor said reduce salt"       │
│                                         │
│ Extract prediction hooks:               │
│                                         │
│ Hook 1:                                 │
│   IF: talking_to:daughter               │
│   AND: topic:groceries OR topic:food    │
│   THEN: surface this memory             │
│   PRIORITY: high                        │
│                                         │
│ Hook 2:                                 │
│   IF: location:kitchen                  │
│   AND: activity:cooking                 │
│   THEN: surface this memory             │
│   PRIORITY: medium                      │
│                                         │
│ Hook 3:                                 │
│   IF: time:mealtime                     │
│   THEN: surface this memory             │
│   PRIORITY: low                         │
└─────────────────────────────────────────┘

RUNTIME (context monitor):
┌─────────────────────────────────────────┐
│ Context change detected:                │
│   - Betty mentioned "Sarah" (daughter)  │
│   - Topic: "shopping list"              │
│                                         │
│ Check hooks...                          │
│   Hook 1 MATCHES!                       │
│     talking_to:daughter ✓               │
│     topic:groceries ✓                   │
│                                         │
│ Surface: "Remember to ask Sarah about   │
│           low-sodium options"           │
│                                         │
│ Betty: "Oh! Right! I keep forgetting!"  │
└─────────────────────────────────────────┘
```

### Data Model

```typescript
interface PredictionHook {
  hookId: string;
  memoryId: string;              // Memory to surface
  entityId: string;              // Whose context to monitor

  // Trigger conditions (ALL must match)
  conditions: HookCondition[];

  // When matched
  priority: 'critical' | 'high' | 'medium' | 'low';
  surfaceText?: string;          // Optional custom text

  // Lifecycle
  createdAt: string;
  expiresAt?: string;            // Some hooks are temporary
  firedCount: number;
  lastFired?: string;

  // Learning
  wasUseful?: boolean;           // User feedback
  confidence: number;            // Adjusted based on feedback
}

interface HookCondition {
  type: ConditionType;
  operator: 'equals' | 'contains' | 'matches' | 'near';
  value: string | string[] | number;
}

type ConditionType =
  | 'talking_to'      // Entity being interacted with
  | 'mentioned'       // Entity/topic mentioned
  | 'location'        // Physical location
  | 'activity'        // What user is doing
  | 'time'            // Time of day/week
  | 'time_pattern'    // Recurring time pattern
  | 'calendar_event'  // Upcoming event
  | 'emotion'         // Detected emotional state
  | 'topic'           // Conversation topic
  | 'open_loop'       // Related open loop status
  | 'device';         // Device being used
```

### Hook Generation (at Ingest)

The LLM analyzes each memory and generates hooks:

```typescript
async function generatePredictionHooks(
  memory: Memory,
  context: Context
): Promise<PredictionHook[]> {

  const prompt = `
    Analyze this memory and generate prediction hooks.
    A hook defines WHEN this memory should be surfaced proactively.

    Memory: "${memory.text}"
    Entities involved: ${memory.entities}
    Open loops created: ${memory.openLoops}

    Generate 1-3 hooks. Each hook should specify:
    - conditions: When should this surface?
    - priority: How important is timely surfacing?
    - surfaceText: What should we show? (optional)

    Think about:
    - Who needs to know this?
    - When would it be most useful?
    - What context would trigger relevance?
  `;

  return llm.generate(prompt);
}
```

### Context Monitor

Runs continuously, checking context against active hooks:

```typescript
class ContextMonitor {
  private hooks: Map<string, PredictionHook[]>;  // entityId -> hooks

  async onContextChange(
    entityId: string,
    newContext: Context
  ): Promise<SurfacedMemory[]> {

    const entityHooks = this.hooks.get(entityId) || [];
    const matched: SurfacedMemory[] = [];

    for (const hook of entityHooks) {
      if (this.allConditionsMatch(hook.conditions, newContext)) {
        // Don't spam - check cooldown
        if (this.shouldFire(hook)) {
          matched.push({
            memoryId: hook.memoryId,
            surfaceText: hook.surfaceText,
            priority: hook.priority,
            hookId: hook.hookId,
          });

          hook.firedCount++;
          hook.lastFired = new Date().toISOString();
        }
      }
    }

    // Sort by priority, return top N
    return matched
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
      .slice(0, 3);  // Don't overwhelm
  }
}
```

### Use Case: Alan's AR Glasses

```
INGEST:
Memory: "Bob mentioned he's struggling with the auth refactor"
Entities: [alan, bob]
Hooks generated:
  - IF talking_to:bob THEN surface (priority: high)
  - IF topic:auth OR topic:refactor THEN surface (priority: medium)

LATER:
Alan puts on AR glasses.
Glasses detect: Bob approaching in hallway.
Context: { nearbyPeople: ["bob"] }

Hook fires!
Glasses display: "Bob mentioned struggling with auth refactor"

Alan: "Hey Bob, how's the auth thing going? Need a hand?"
Bob: "Actually yeah, I'm stuck on..."

MEMORY WAS USEFUL BEFORE ALAN KNEW HE NEEDED IT.
```

---

## Integration: How They Work Together

```
                    ┌─────────────────┐
                    │   NEW MEMORY    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  PRESSURE  │  │ RELATIONS  │  │   HOOKS    │
     │  TRACKING  │  │   UPDATE   │  │ GENERATION │
     └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
            │               │               │
            │    Update     │    Update     │    Store
            │    entity     │    shared     │    hooks
            │    pressure   │    memory     │
            │               │    pointers   │
            ▼               ▼               ▼
     ┌────────────────────────────────────────────┐
     │              ENTITY STORE                   │
     │  - Pressure per entity                      │
     │  - Relationship evidence (memory pointers) │
     │  - Active prediction hooks                  │
     └────────────────────────────────────────────┘
                             │
                             │ Context changes
                             ▼
                    ┌─────────────────┐
                    │ CONTEXT MONITOR │
                    │                 │
                    │ - Check hooks   │
                    │ - Fire matches  │
                    │ - Check pressure│
                    │ - Alert if high │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  SURFACE TO     │
                    │  USER/CAREGIVER │
                    └─────────────────┘
```

### On Ingest

1. **Extract entities** from memory
2. **Update pressure** for each entity involved
3. **Update relationship** evidence (add memory pointer)
4. **Dirty relationship cache** if memory is significant
5. **Generate prediction hooks** via LLM
6. **Store hooks** for each affected entity

### On Context Change

1. **Get active hooks** for entity
2. **Check conditions** against new context
3. **Fire matching hooks** (respect cooldowns)
4. **Check pressure levels** for entity
5. **Alert care circle** if pressure is concerning
6. **Surface memories** to user

### On Relationship Query

1. **Check cache** - if fresh, return
2. **Fetch shared memories** between entities
3. **Send to LLM** for synthesis
4. **Cache result** with timestamp
5. **Return synthesis**

---

## Implementation Order

1. **Document** (this file) ✓
2. **Pressure Tracking**
   - EntityPressure interface
   - PressureVector tracking
   - Pattern detection
   - Urgency calculation
3. **Relationship Synthesis**
   - EntityRelationship interface
   - LLM synthesis function
   - Cache management
4. **Prediction Hooks**
   - Hook data model
   - Hook generation at ingest
   - Context monitor
5. **Wire into MCP**
   - New tools: get_relationship, get_entity_pressure, get_predictions
6. **Wire into ingest pipeline**
   - Generate hooks on memory store
   - Update pressure on memory store
7. **Test with use cases**
   - Betty scenario
   - Slack scenario
   - AR glasses scenario

---

## Open Questions

1. **Hook expiration:** Should hooks expire? After how long?
2. **Hook feedback:** How do we learn which hooks are useful?
3. ~~**Pressure decay:** Does pressure naturally decay over time?~~ **ANSWERED** - see below
4. **Privacy:** Who can see whose pressure? Relationship synth?
5. **Multi-entity memories:** One memory affects 4 entities—how to handle?

---

## Answered: Pressure/Emotional Decay

### The Insight (from Alan)

> "My anger for the guy that ripped me off for 3k last year is gone... if I saw him
> on the street, I might even wave and smile. Everyone has different timing...
> I don't think I would react the same to the woman who murdered my father,
> much longer decay."

Decay is NOT a system setting. Decay is **learned per person, per incident type**.

### Memory is a Cloud, Not a Database

Humans remember EVERYTHING but only USE what's NEEDED in the moment.
Walking through context, relevant memories condense around you.
AI fails at memory because it queries instead of encounters.

### How Decay Works

The system doesn't impose decay rates. It **observes** them.

```
OBSERVATION OVER TIME:

Memory: "Guy ripped me off for $3k" (created 2025-01)

Reference 1 (2025-01): emotion detected = anger (0.9)
Reference 2 (2025-06): emotion detected = frustration (0.5)
Reference 3 (2026-01): emotion detected = neutral (0.1)

System learns: Alan + financial_grievance → decay_rate ≈ 12 months
```

### Decay Dimensions

Decay rate varies by:

| Dimension | Example | Typical Decay |
|-----------|---------|---------------|
| **Person** | Alan vs Betty | Individual |
| **Category** | Financial vs trauma | Category-specific |
| **Relationship** | Stranger vs father | Relationship depth |
| **Severity** | $3k vs murder | Magnitude matters |

### Data Model

```typescript
interface EmotionalDecayObservation {
  memoryId: string;
  entityId: string;

  // Observation point
  observedAt: string;
  daysSinceMemory: number;

  // Emotional state at this observation
  emotionDetected: string;
  valence: number;           // -1 to +1
  intensity: number;         // 0 to 1

  // Context of observation
  triggerType: 'mentioned' | 'encountered' | 'reminded' | 'queried';
}

interface LearnedDecayRate {
  entityId: string;
  category: string;          // 'financial', 'trauma', 'social', etc.

  // Learned parameters
  halfLife: number;          // Days until intensity halves
  floor: number;             // Minimum intensity (some never fully decay)
  confidence: number;        // Based on observation count

  // Evidence
  observationCount: number;
  lastObserved: string;
}
```

### Implementation

Don't calculate decay mathematically. **Observe it empirically.**

1. When memory is referenced, detect current emotional state
2. Compare to original emotional state
3. Record the delta and time elapsed
4. Over time, learn the decay curve for this person + category
5. Use learned curve to predict current emotional relevance

### Why This Matters

Traditional systems: "Memory is 1 year old, apply decay formula, relevance = 0.3"

Our system: "Alan mentioned this memory. His voice/words suggest neutral now.
Learn: Alan's financial grievances decay in ~1 year. But his trauma about
his father, referenced 30 years later, still shows pain. Different decay."

**The system adapts to the human. The human doesn't adapt to the system.**

### Future Research: Diffusion Models

> "Diffusion has answers for us" - Alan

Diffusion models walk through noise and coalesce signal. Memory retrieval may work similarly:
- Start with context (the noise)
- Iteratively denoise toward relevant memories
- What "condenses" is what's relevant NOW

This is a deep research direction for later. Park it here.

### Future Research: Macro-Level Ripple Detection

> "What if you could SEE the effect of a television ad by watching the sensor
> ripple and activity in memorable from a high level?" - Alan

Every entity is a sensor. The network sees macro patterns:

```
8:00 PM - TV ad airs
8:01 PM - 47 entities mention product, valence +0.3
8:05 PM - 156 entities, ripple spreading, negative cluster in Miami
8:15 PM - Social contagion visible in entity-to-entity mentions
```

Applications:
- Marketing effectiveness in real emotional response (not clicks)
- Social contagion visualization as it spreads
- Trend detection before it's a "trend"
- Early warning on negative reactions

**"Prevent and prepare, not respond and recover."**

This inverts everything. The system becomes anticipatory at population scale.

---

## Success Criteria

- [ ] Betty's doll reminds her about salt before daughter calls
- [ ] System detects pressure accumulation across multiple sources
- [ ] Relationships are synthesized, not stored
- [ ] AR glasses surface relevant memories on context change
- [ ] Conference call creates open loops for entities not present

---

*"The pen will wiggle out things you did not know were there."* - Alan
