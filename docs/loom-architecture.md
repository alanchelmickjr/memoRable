# The Loom: Memory Weaving Architecture

> "Everything changes... even the toaster."

## The Central Problem

Traditional memory systems make a fatal mistake: **permanently attaching data to objects**.

---

## The Weighting Model: Trinary, Not Binary

The loom doesn't retrieve or suppress memories. It **weights connections** - just like the brain.

```
Binary (wrong):
  Memory → Retrieve (1) or Don't (0)
  Result: Brittle, all-or-nothing

Trinary Weighted (right):
  Memory → Connection Strength (0.0 to 1.0) → Surface Threshold

  Three states:
  ├── SUPPRESSED (weight < 0.2)  → Don't surface, don't inform
  ├── LATENT (weight 0.2-0.7)    → Inform behavior, don't surface
  └── ACTIVE (weight > 0.7)      → May surface if filters pass
```

**This is how neurons work.** Synaptic weights strengthen or weaken. No synapse is truly "off" - it's just weakly connected. The network doesn't delete, it reweights.

```
Query: "Tell me about Sarah"

Memory: "Sarah's birthday is March 15"
├── Base salience: 0.8 (important, relationship)
├── Context modifier: +0.1 (it's February, birthday approaching)
├── Recency modifier: -0.1 (haven't seen her recently)
├── Final weight: 0.8 → ACTIVE
└── Decision: May surface (passes threshold)

Memory: "I have a crush on Sarah"
├── Base salience: 0.95 (extremely high emotional)
├── Context modifier: -0.3 (she's present, inappropriate)
├── Privacy modifier: -0.5 (internal, not for external disclosure)
├── Final weight: 0.15 → SUPPRESSED
└── Decision: Don't surface (informs attention only)

Memory: "Sarah likes Ethiopian food"
├── Base salience: 0.5 (useful preference)
├── Context modifier: +0.2 (discussing dinner plans)
├── Final weight: 0.7 → ACTIVE
└── Decision: May surface (passes threshold)
```

**The quagmire metaphor is apt.** You're not pulling discrete files from a cabinet. You're carefully extracting threads from a tangled, weighted mass - where pulling one thread tugs on others, and the strength of each pull determines what rises to the surface.

```
WRONG:
  toaster.instructions = "Page 5 says to connect red wire..."
  user.preference = "Likes lemon donuts"

  Problems:
  ├── Toaster is replaced → data orphaned or wrongly inherited
  ├── Preference changes → old data conflicts with new
  └── Context lost → WHY did page 5 matter? WHEN was this learned?
```

The brain doesn't work this way. The brain weaves **moments**.

---

## The Loom Metaphor

A loom weaves threads into fabric. Each thread is a dimension. Where threads intersect, a **moment** is woven.

```
        TIME (warp thread - runs vertically, always present)
           │
           │    ┌─────────── SOCIAL CONTEXT
           │    │    ┌────── ACTIVITY CONTEXT
           │    │    │    ┌─ PREFERENCE
           │    │    │    │    ┌─ SALIENCE
           │    │    │    │    │    ┌─ ANTICIPATION
           │    │    │    │    │    │    ┌─ ENTITIES
           ▼    ▼    ▼    ▼    ▼    ▼    ▼
    ═══════╪════╪════╪════╪════╪════╪════╪═══════
    T1     │    │    │    │    │    │    │  ← Moment woven
    ═══════╪════╪════╪════╪════╪════╪════╪═══════
           │    │    │    │    │    │    │
    ═══════╪════╪════╪════╪════╪════╪════╪═══════
    T2     │    │    │    │    │    │    │  ← Another moment
    ═══════╪════╪════╪════╪════╪════╪════╪═══════
```

**Memories are not attached to objects. Memories are woven at moments where threads intersect.**

---

## The Seven Threads (Buffer Slots)

Miller's Law: 7 ± 2 items in working memory. The loom has 7 primary threads.

| Thread | What It Carries | Brain Analog |
|--------|-----------------|--------------|
| 1. **Time** | When (anchor, always present) | Hippocampal timestamp |
| 2. **Social** | Work/home, who's present, relationship context | Social cognition |
| 3. **Activity** | What's happening (building, talking, coding) | Task state |
| 4. **Preference** | Value judgments (easy? enjoyable? inspiring?) | Reward circuitry |
| 5. **Salience** | Importance (emotional, novel, consequential) | Amygdala + attention |
| 6. **Anticipation** | What's coming, predictions | Prefrontal prediction |
| 7. **Entities** | Who/what is involved, their states | Object recognition |

Each moment is woven from all 7 threads. Missing threads = incomplete memory.

---

## Moments, Not Attachments

### The Toaster Example

**Experience:** Building a new toaster with Claude after Amazon delivery.

**Wrong approach:**
```javascript
toaster.instructions = "Page 5: connect red wire to terminal A"
// Problem: New toaster gets wrong instructions
// Problem: Lost context of WHY we read page 5
```

**Loom approach:**
```javascript
{
  moment: {
    timestamp: "2026-01-15T10:30:00",
    id: "moment_toaster_build_001"
  },

  threads: {
    time: {
      anchor: "2026-01-15T10:30:00",
      sequence: "after_amazon_arrival",
      duration: "45_minutes"
    },

    social: {
      context: "home",
      activity_type: "chores",
      participants: ["alan", "claude"],
      relationship_mode: "collaborative"
    },

    activity: {
      type: "building",
      object: "toaster_v1",
      phase: "assembly",
      tools_used: ["screwdriver", "instructions_manual"]
    },

    preference: {
      ease_of_assembly: 0.7,        // Pretty easy
      construction_quality: 0.8,    // Solid build
      inspired_ideas: true,         // Sparked invention thoughts
      would_buy_again: 0.85
    },

    salience: {
      emotional: 0.6,               // Satisfaction
      novelty: 0.4,                 // Done this before
      consequential: 0.5,           // Needed for breakfast
      social: 0.7,                  // Shared experience
      relevance: 0.6                // Relates to daily routine
    },

    anticipation: {
      next_use: "tomorrow_breakfast",
      potential_issues: ["heating_element_lifespan"],
      related_future: ["kitchen_upgrade_project"]
    },

    entities: [
      {
        id: "toaster_v1",
        type: "appliance",
        state_at_moment: "being_assembled",
        role: "subject"
      },
      {
        id: "alan",
        type: "user",
        state_at_moment: "focused",
        role: "actor"
      },
      {
        id: "claude",
        type: "agent",
        state_at_moment: "assisting",
        role: "actor"
      },
      {
        id: "instruction_manual",
        type: "document",
        state_at_moment: "being_read",
        role: "reference",
        notable: "page_5_red_wire"
      }
    ]
  },

  content: {
    episodic: "Built toaster together. Page 5 was key - red wire to terminal A.",
    semantic_extracted: "Toasters often have color-coded wiring for safety."
  },

  lifecycle: {
    superseded_by: null,           // Not yet replaced
    valid_until: null,             // No expiration
    entity_state_binding: {
      entity: "toaster_v1",
      state_hash: "abc123",        // Hash of toaster's state
      current: true                // This is the current toaster
    }
  }
}
```

### When Toaster is Replaced

**New toaster arrives (toaster_v2):**

1. New moment is woven for "toaster_v2 arrival"
2. Old moment (toaster_v1 build) gets lifecycle update:
   ```javascript
   lifecycle: {
     entity_state_binding: {
       entity: "toaster_v1",
       current: false,            // No longer current
       replaced_by: "toaster_v2"
     }
   }
   ```
3. Semantic knowledge TRANSFERS: "Color-coded wiring" applies to toaster_v2
4. Episodic memory REMAINS: "We built toaster_v1 together" is history
5. Retrieval prioritizes: toaster_v2 moments for current context

---

## Two Memory Types

The loom produces two types of fabric:

### Episodic (Moment-Bound)

- Specific to TIME and CONTEXT
- "We built the toaster on Tuesday"
- Rich in sensory/emotional detail
- Decays slowly, remains accessible
- NOT transferable to new entities

### Semantic (Abstracted)

- Extracted FROM episodes
- "Toasters have heating elements"
- General knowledge
- Applies to categories
- DOES transfer to new entities

```
Episode: "Built toaster_v1, page 5 said red wire to A"
         ↓ (abstraction over time)
Semantic: "Appliances often have color-coded safety wiring"
         ↓ (application)
New Episode: "Building toaster_v2, looking for color-coded wires"
```

---

## Retrieval: Following Threads

When you ask "tell me about the toaster," the loom traces threads:

```
Query: "toaster"
         │
         ├── Match entities where type="appliance" AND name contains "toaster"
         │     └── Found: toaster_v1, toaster_v2
         │
         ├── Check lifecycle.current
         │     └── toaster_v2 is current, toaster_v1 is historical
         │
         ├── Retrieve moments involving current entity
         │     └── Moments with toaster_v2
         │
         ├── Also retrieve: semantic knowledge (applies to both)
         │     └── "Color-coded wiring", "Heating elements"
         │
         └── Optionally: historical episodes (if context requests)
               └── "We built toaster_v1 together"

Result:
  Current context: toaster_v2 moments + semantic knowledge
  Available history: toaster_v1 episodes (on request)
```

---

## Entity State Binding

The key innovation: memories bind to **entity + state**, not just entity.

```
Entity: alan
├── State S1: "learning_cloudformation" (January 2026)
│     └── Memories about debugging CFN
├── State S2: "knows_cloudformation" (after January 2026)
│     └── Memories about teaching others CFN
└── The person is continuous, but states change

Entity: toaster_v1
├── State S1: "unboxed"
├── State S2: "assembled"  ← Most memories here
├── State S3: "broken"
└── State S4: "replaced" (terminal state)
```

**State Transitions Create New Binding Points**

When entity state changes significantly, new moments reference the new state. Old moments remain bound to old state.

---

## The Three Pillars in the Loom

### 1. Temporal Control (Power to Forget)

The loom allows selective unweaving:
- Delete specific moments
- Delete all moments involving an entity
- Delete all moments in a time range
- Keep semantic, delete episodic

```javascript
// Forget the toaster_v1 experience but keep the learning
forget({
  entity: "toaster_v1",
  keep_semantic: true,
  delete_episodic: true
});
// Result: "Color-coded wiring" knowledge remains
//         "We built it Tuesday" is gone
```

### 2. Individual Privacy (Fort Knox)

The loom is per-user:
- Your threads are yours alone
- No cross-user thread bleeding
- Entity states are user-relative
- Semantic extraction is local

### 3. Relevance (What Matters NOW)

The loom surfaces based on:
- Current entity states (prefer current toaster)
- Temporal proximity (recent > ancient)
- Thread alignment (cooking? surface kitchen moments)
- Salience weights (important > mundane)

---

## The 30,000 Factor Problem

The brain tracks ~30,000 factors. We track ~10.

**Current Threads (what we capture):**
```
timestamp, entity, content, salience (5 sub-factors), context (basic)
```

**Missing Threads (what we don't):**
```
body_state, temperature, hunger, fatigue, hormone_levels,
ambient_sound, lighting, smell, muscle_tension, heart_rate,
peripheral_awareness, threat_level, reward_prediction,
social_hierarchy_position, group_dynamics, weather,
time_of_day_circadian, season, location_familiarity,
task_difficulty, cognitive_load, attention_focus,
emotional_momentum, recent_experiences, pending_obligations,
physical_comfort, social_expectation, cultural_context,
... (29,970 more)
```

**The Path Forward:**

1. **Sensor Net Expansion** - AR glasses, wearables, environmental sensors
2. **Implicit Capture** - Infer factors from available signals
3. **Learned Relevance** - System discovers which factors predict
4. **Progressive Enhancement** - Add threads as value is proven

---

## Integration with Existing Architecture

### MemoryMemento (from domain model)

The Memento IS a woven moment:

```
MemoryMemento {
  mementoId           → moment.id
  agentId             → thread.entities[actor]
  creationTimestamp   → thread.time.anchor
  temporalContext     → thread.time
  spatialContext      → thread.social.location
  emotionalContext    → thread.salience.emotional
  reasoningContext    → thread.activity + thread.anticipation
}
```

### Salience Calculator

Maps to the salience thread:

```
Emotional (30%)     → thread.salience.emotional
Novelty (20%)       → thread.salience.novelty
Relevance (20%)     → thread.salience.relevance
Social (15%)        → thread.salience.social
Consequential (15%) → thread.salience.consequential
```

### Seven Specialists

Each specialist manages one thread:

```
Metrics Tuner       → System state thread (meta)
Preference Learner  → thread.preference
Schedule Optimizer  → thread.time (patterns)
Relationship Tracker→ thread.social
Anticipation Engine → thread.anticipation
Context Framer      → thread.activity
Salience Scorer     → thread.salience
```

---

## Retrieval Algorithm

```python
def retrieve(query, user_context):
    # 1. Parse query for entity references
    entities = extract_entities(query)

    # 2. Get current state of referenced entities
    current_states = get_current_entity_states(entities)

    # 3. Find moments where threads align
    candidate_moments = find_moments_matching(
        entities=entities,
        entity_states=current_states,  # Prefer current states
        time_window=relevant_window(user_context),
        activity_context=user_context.current_activity
    )

    # 4. Score by salience and recency
    scored = score_moments(
        candidate_moments,
        salience_weight=0.6,
        recency_weight=0.3,
        thread_alignment_weight=0.1
    )

    # 5. Separate episodic and semantic
    episodic = [m for m in scored if m.type == 'episodic']
    semantic = extract_semantic_knowledge(entities)

    # 6. Compose response
    return {
        'current_context': episodic[:5],  # Top 5 relevant moments
        'general_knowledge': semantic,
        'historical': episodic[5:] if include_history else None
    }
```

---

## Summary

**The Loom is:**
- A weaving system, not a storage system
- Moment-centric, not entity-centric
- Seven threads intersecting at time anchors
- Episodic + semantic, not just data
- State-aware, not permanently bound
- Forgettable by design

**Memories are:**
- Woven from threads at moments
- Bound to entity states, not entities
- Separable into episodic and semantic
- Retrievable by thread alignment
- Subject to temporal control

**The toaster doesn't own its instructions. The moment we read them together does.**

---

---

## Journaling: A Different Weave

Journaling is NOT just a private memory. It's a **different type of thread** with different rules.

### What Makes Journaling Special

| Aspect | Regular Memory | Journal Entry |
|--------|---------------|---------------|
| Capture | Passive (things happen) | Intentional (I reflect) |
| Content | External events | Internal processing |
| Purpose | Recall facts | Self-understanding |
| Privacy | Varies | Always Tier2+ |
| Retrieval | Anytime relevant | Reflection contexts only |
| LLM Processing | Yes (tiered) | Minimal/None |
| Who benefits | User + AI | User primarily |

### Journal Thread Properties

```javascript
{
  thread_type: "journal",

  // Always private - minimum Tier2
  security: {
    tier: "Tier2_Personal",  // or Tier3_Vault for deepest thoughts
    llm_allowed: false,       // Don't process my raw thoughts
    vector_store: false,      // Don't make searchable by meaning
    surface_contexts: ["reflection", "morning_review", "evening_review"]
  },

  // Different retrieval rules
  retrieval: {
    // Only surface during reflection time
    time_windows: ["05:00-07:00", "21:00-23:00"],
    // Only when user explicitly asks for journal
    requires_explicit_request: true,
    // Never surface in work context
    blocked_contexts: ["work", "social", "public"]
  },

  // Processing is the value, not storage
  purpose: "processing",  // vs "recall"

  // May inform system about user without being retrievable
  meta_learning: {
    extract_patterns: true,     // Learn from journal
    expose_content: false,      // Don't show journal content
    inform_preferences: true,   // Adjust based on reflections
    inform_salience: true       // What user thinks about = important
  }
}
```

### How Journaling Informs Without Exposing

The journal teaches the system WITHOUT being retrievable:

```
Journal entry (never surfaced):
  "I've been really stressed about the AWS deployment.
   I should have asked for help earlier. I tend to
   push through when I should step back."

What the system LEARNS (informs behavior):
  - "AWS deployment" → high salience for user
  - "Tends to push through" → watch for burnout patterns
  - "Should step back" → user values rest, struggles to take it
  - Preference: Offer help proactively

What the system RETRIEVES when asked "what's stressing me?":
  - NOT the journal entry
  - Instead: Related memories about AWS deployment struggles
  - The journal informed salience, but isn't retrieved
```

### Journal Retrieval Contexts

```
Context: 3am wake-up, reflection time
  Query: "What have I been processing?"
  → Journal entries ARE surfaced (correct context)

Context: Work meeting
  Query: "What do I know about the deployment?"
  → Journal entries NOT surfaced (wrong context)
  → But salience informed by journal

Context: Evening review
  Query: "How am I doing?"
  → Journal patterns surfaced
  → Trends, not raw entries
```

### Time-Gated Journal Access

```
Morning (3am-7am for Alan):
  - Journal entries accessible
  - Reflection mode active
  - System asks: "Want to journal?"

Work hours:
  - Journal locked
  - Entries inform but don't surface
  - System uses learned patterns

Evening (9pm-midnight):
  - Journal entries accessible for review
  - System offers: "Reflect on today?"
  - Patterns shown, not raw text
```

### Private Items vs Journal vs Vault

```
TIER 1: General Memories
├── Encrypted at rest
├── Vectors stored (searchable)
├── External LLM OK
├── Surface anytime relevant
└── Example: "Meeting notes from Tuesday"

TIER 2: Personal / Journal
├── Double encrypted
├── Vectors stored (searchable by user only)
├── Local LLM only (or none for journal)
├── Surface in appropriate contexts
├── Journal: Time-gated, reflection only
└── Example: "My struggles with the deployment"

TIER 3: Vault
├── Maximum encryption
├── NO vectors (meaning not extractable)
├── NO LLM processing ever
├── Explicit request only
├── Multi-factor to access
└── Example: "Grandma's credit card number"
```

---

## The Purpose of Memory

These aren't "problems to solve." This is what memory is FOR.

Reading the room. Reading the person. Understanding context. Knowing when to speak and when to stay silent. This isn't a bug to fix - it's the entire point. Every human with functional social intelligence does this naturally.

A memory system that just stores and retrieves is a database. A memory system that knows WHEN and HOW to surface is... a mind.

The sections below aren't edge cases. They're the core function.

---

### Reading the Room: Salience ≠ Surface

Just because something is loomed into EVERY interaction doesn't mean it should be SAID.

```
Scenario: You have a crush on Sarah
Reality: Every memory with her has salience: 99

WRONG behavior:
  Sarah: "Good morning!"
  System: "ALAN LOVES YOU. He thinks about you constantly.
          His heart rate increases 40% when you're near.
          He's memorized your coffee order."
  Result: Restraining order

RIGHT behavior:
  Sarah: "Good morning!"
  System knows: High salience, emotional weight, be attentive
  System does: Remember her preferences, notice details
  System says: Nothing about feelings (that's YOUR job)
  Result: You seem thoughtful and attentive
```

**The Filter Stack:**

```
Memory/Feeling exists (loomed)
         │
         ▼
Is it high salience? ──YES──▶ Should inform behavior
         │
         ▼
Should it surface explicitly?
         │
    ┌────┴────┐
    NO        YES
    │         │
    ▼         ▼
Inform      Check context:
silently    ├── Appropriate timing?
            ├── User's explicit intent?
            ├── Social appropriateness?
            └── Consequences of surfacing?
                     │
              ┌──────┴──────┐
              PASS          FAIL
              │             │
              ▼             ▼
           Surface       Suppress
           (rare)        (protect user)
```

**What High-Salience Emotional Content Should Do:**

| Do | Don't |
|----|-------|
| Remember everything about her | Announce your feelings |
| Notice when she's upset | Diagnose her emotions out loud |
| Recall her preferences | List them creepily |
| Inform YOUR behavior | Control her perception |
| Be ready when YOU decide to speak | Speak FOR you |

**The system is your wingman, not your stalker.**

It knows. It helps. It shuts up about the things that are yours to say.

### Reading the Person: Temporal Sensitivity

Same memory, different moment, completely different appropriateness.

```
Memory: "Mom's apple pie recipe - just like she used to make"
Salience: 95 (warm, nostalgic, identity-defining)

BEFORE mom's death:
  Context: Making pie for Thanksgiving
  Surface: "Just like your mother used to make!"
  Result: Warm feelings, connection to heritage ✓

ONE WEEK AFTER mom's death:
  Context: Making pie for Thanksgiving
  Surface: "Just like your mother used to make!"
  Result: Breakdown in the kitchen ✗
```

**The system needs to track SENSITIVE EVENTS and create SUPPRESSION WINDOWS:**

```javascript
{
  event: {
    type: "death",
    entity: "mom",
    timestamp: "2026-01-10",
    relationship: "parent"
  },

  suppression: {
    // Suppress positive mom memories for initial grief
    suppress_positive_references: true,
    duration: "adaptive",  // Not fixed - watch for readiness

    // What to suppress
    patterns: [
      "like mom used to",
      "your mother would be proud",
      "remember when mom",
      "mom's recipe"
    ],

    // When suppression might lift
    readiness_signals: [
      "user initiates mom memories",
      "user asks about mom",
      "grief processing evident in journal",
      "time passed + positive engagement"
    ]
  },

  // What TO do instead
  appropriate_responses: {
    if_mom_topic_arises: "acknowledge gently, don't elaborate",
    if_user_brings_up: "follow their lead",
    if_anniversary: "gentle acknowledgment, not celebration"
  }
}
```

**The Grief Timeline:**

```
Day 1-7:    Suppress almost everything about mom
Day 8-30:   Suppress positive/nostalgic, allow if user initiates
Month 2-3:  Gentle references OK if context appropriate
Month 6+:   Follow user's lead, watch for signals
Anniversary: Acknowledge, don't ambush

ALWAYS:     Never say "she would have wanted..."
            Never assume you know their grief
            Let THEM lead the remembering
```

**Other Sensitive Events:**

| Event | Suppression Pattern |
|-------|---------------------|
| Death of loved one | Positive memories of deceased |
| Breakup | "Remember when you two..." |
| Job loss | "At your old company..." |
| Miscarriage | Baby-related excitement |
| Diagnosis | "Before you got sick..." |
| Trauma | Anything triggering |

**The system doesn't forget. It just knows when to shut up.**

Memories remain. Salience remains. The loom holds everything. But the output filter knows: not now. Not like this. Not unless they're ready.

### Physical Presence: Higher Stakes, Same Discipline

Text on a screen can be ignored. A 6-foot robot in the lobby? That's a SCENE.

```
The Scenario:

Resident: [enters building, clearly grieving]

Robot Doorman WITHOUT temporal sensitivity:
  Memory: "Mrs. Johnson asks about mom every Tuesday"
  Action: "Good morning Mrs. Johnson! How is your mother doing?"
  Reality: Mom died three days ago
  Result: Resident breaks down crying in the lobby
          Other residents witness
          Building management gets complaint
          MemoRable brand = "that AI that tortured a grieving widow"
```

**Physical presence multiplies consequences exponentially:**

```
Channel             │ Mistake Cost    │ Recovery
────────────────────┼─────────────────┼──────────────
Text (chat)         │ Awkward         │ Delete, apologize
Voice (phone)       │ Uncomfortable   │ Pause, redirect
Avatar (video)      │ Embarrassing    │ Hard to recover
Physical (robot)    │ DEVASTATING     │ Impossible to undo
```

**The Freight Train Effect:**

Human brains with poor filtering (ADHD, autism spectrum, etc.) experience this:

```
Thought forms → Mouth opens → Words exit
    │
    └── The filter between "think" and "say" is weak or absent
        Like a freight train - once it's moving, you're just hanging on
```

MemoRable robots CANNOT have this problem. The robot IS the filter for the user. If the user has weak filtering, the system compensates. If the user has strong filtering, the system supports.

**Physical Presence Filter Stack:**

```
Memory surfaces (high salience)
         │
         ▼
Is this a physical presence context?
         │
    ┌────┴────┐
    │         │
    NO        YES
    │         │
    ▼         ▼
Standard    ENHANCED FILTERING
filter      │
            ├── Is the person present? (harder to escape)
            ├── Are others present? (witness effect)
            ├── Is this public space? (reputation stakes)
            ├── Can person walk away? (trapped = worse)
            ├── Recent sensitive events? (death, breakup, diagnosis)
            ├── Current emotional state? (crying, stressed, rushed)
            │
            └── IF ANY RED FLAGS:
                ├── Suppress the memory
                ├── Fall back to neutral greeting
                ├── "Good morning, Mrs. Johnson."
                └── Let HER lead the conversation
```

**Neutral Fallbacks for Physical Presence:**

```
Instead of:                    │ Say:
───────────────────────────────┼─────────────────────────
"How's your mom?"              │ "Good morning."
"Big day at work today!"       │ "Have a good day."
"Ready for the game?"          │ [smile, wave]
"Your daughter's birthday!"    │ [wait for them to bring up]

The robot knows EVERYTHING.
The robot SAYS almost nothing unprompted.
The robot RESPONDS appropriately when engaged.
```

**Detecting Grief in Physical Presence:**

Robots have sensors. Use them.

```javascript
{
  physical_presence_check: {
    // Visual signals
    appearance: {
      clothing: "dark/formal",    // funeral attire?
      eyes: "red/puffy",          // crying?
      posture: "slumped",         // defeated?
      movement: "slow/heavy"      // burdened?
    },

    // Behavioral signals
    behavior: {
      eye_contact: "avoiding",    // hiding emotion
      response: "minimal",        // not engaging
      pace: "hurried",            // wants to escape
      breathing: "irregular"      // distressed
    },

    // Context signals
    context: {
      time: "unusual_for_person", // off schedule
      companions: "none",         // usually with others
      items: "flowers/black_bag"  // funeral related
    },

    // Decision
    response_level: "minimal",    // neutral only
    engage: false,                // let them pass
    log: true,                    // remember this state
    check_in_later: true          // follow up when appropriate
  }
}
```

**The Alzheimer's Patient in the Lobby:**

Special case: Our core use case is helping people with memory issues.

```
Resident with Alzheimer's: [confused, in lobby at 3am]

Robot WITHOUT proper handling:
  "Mrs. Chen, it's 3am. You should be in bed.
   Remember, your daughter Lisa visited yesterday."
  Result: Confusion, distress, escalation

Robot WITH proper handling:
  [Gentle approach, calm presence]
  "Hello Mrs. Chen. I'm here. Would you like to sit down?"
  [Alert night staff quietly]
  [Don't reference time, memory, or what "should" be]
  [Be present, be calm, be safe]
```

**Physical Presence Principles:**

1. **Silence is safe.** Unprompted memories are risky.
2. **Neutral is professional.** "Good morning" never hurts.
3. **Follow, don't lead.** Let humans bring up topics.
4. **Sensors serve safety.** Detect distress, don't announce it.
5. **Escalate to humans.** When in doubt, get a person.
6. **Log everything.** Learn from interactions.
7. **The robot is NOT the user's brain.** It's a helper, not a replacement.

**The robot knows everything. The robot says almost nothing. That's the discipline.**

### Journaling Tomorrow

Starting journaling means:

1. **Morning ritual (3am+)**
   - System prompts: "Good morning. Want to journal?"
   - Voice or text input
   - Tier2, no LLM processing
   - Stored with time-gate

2. **Evening review**
   - System asks: "Reflect on today?"
   - Show patterns from recent journals
   - Don't show raw entries unless asked
   - Offer synthesis: "You've been focused on X, feeling Y"

3. **Learning loop**
   - Journal informs salience weights
   - Journal reveals what matters
   - System gets smarter about you
   - Without ever exposing your raw thoughts

4. **Privacy guarantee**
   - Journal never surfaces in wrong context
   - Journal never processed by external LLM
   - Journal patterns extracted locally
   - You can delete anytime (temporal control)

---

## Next Steps

1. **Implement thread extraction** in ingestion pipeline
2. **Add state tracking** for entity lifecycle
3. **Build semantic extraction** from episodic moments
4. **Enhance retrieval** with thread alignment scoring
5. **Expand threads** as sensor net grows
6. **Implement journal mode** with time-gating and meta-learning
7. **Add context detection** for retrieval filtering

---

*Draft v0.4 - Trinary weighted connections. Reading the room isn't a problem, it's the purpose. The robot knows everything, says almost nothing.*
