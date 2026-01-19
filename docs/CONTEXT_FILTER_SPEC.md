# Context Filter Spec - The Judgment Layer

**Date:** 2026-01-19
**Status:** Draft
**Core Insight:** "The correct answer is NOT always the right answer" - Alan

---

## Philosophy

Memory without judgment is dangerous. A perfect memory that surfaces "you have a crush on Sarah" when your boss asks "tell me about Sarah" is **technically correct** but **catastrophically wrong**.

The Context Filter is the judgment layer. It predicts not just what IS relevant, but what SHOULD BE surfaced given:
- Who's listening
- Where you are
- What device you're on
- Your current emotional state
- Your best trajectory

---

## The Two Engines

### Engine 1: Relevance (What IS)
```
Input: query + context
Output: memories ranked by relevance
Question: "What do I know about this?"
```

### Engine 2: Appropriateness (What SHOULD BE)
```
Input: relevant memories + full context
Output: filtered memories safe to surface
Question: "What is WISE to share right now?"
```

---

## Context Dimensions

### 1. Privacy Tier
```javascript
{
  tier: "Tier1_General" | "Tier2_Personal" | "Tier3_Vault",
  rule: "Tier 2/3 never surface in general queries",
  override: "explicit query for that specific memory"
}
```

### 2. Location
```javascript
{
  location: "home" | "office" | "public" | "medical" | "unknown",
  rules: {
    public: ["no medical", "no financial", "no intimate"],
    office: ["no salary gripes", "no job search", "no personal drama"],
    home: ["relaxed filters", "still respect Tier 3"]
  }
}
```

### 3. Device
```javascript
{
  device_type: "personal_phone" | "work_laptop" | "shared_tablet" | "ar_glasses",
  owner: "alan" | "shared" | "unknown",
  rules: {
    shared: "require re-auth before personal content",
    work_laptop: "assume employer can see",
    ar_glasses: "assume others can hear/see display"
  }
}
```

### 4. Participants
```javascript
{
  participants: ["boss", "coworker", "spouse", "child", "stranger"],
  relationships: {
    "boss": { filter: ["career_doubts", "salary", "job_search", "complaints"] },
    "child": { filter: ["adult_content", "financial_stress", "relationship_issues"] },
    "stranger": { filter: ["personal", "medical", "financial", "intimate"] }
  }
}
```

### 5. Time / Energy
```javascript
{
  time: "3am",
  energy: "low",
  rules: {
    late_night: ["no work stress", "no anxiety-inducing"],
    low_energy: ["no complex decisions", "no heavy emotional content"]
  }
}
```

### 6. Emotional State
```javascript
{
  current_emotion: "anxious" | "sad" | "angry" | "neutral" | "happy",
  prosody_score: -15,  // negative = distressed
  rules: {
    distressed: ["no reminders of trauma", "no pile-on of problems"],
    angry: ["no inflammatory content", "no reminders of grievances"],
    sad: ["gentle content", "supportive memories", "no losses"]
  }
}
```

---

## Filter Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY RETRIEVED                          │
│                   (relevance score: 85)                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 1: PRIVACY TIER                          │
│                                                              │
│  Is this Tier 2/3?                                          │
│  YES → Was it explicitly requested?                         │
│        NO → BLOCK (don't surface)                           │
│        YES → Continue                                        │
│  NO → Continue                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 2: LOCATION                              │
│                                                              │
│  Location = public?                                          │
│  YES → Is content [medical/financial/intimate]?             │
│        YES → BLOCK                                          │
│        NO → Continue                                         │
│  NO → Continue                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 3: DEVICE                                │
│                                                              │
│  Device = shared or work?                                    │
│  YES → Is content personal?                                  │
│        YES → BLOCK or require re-auth                       │
│        NO → Continue                                         │
│  NO → Continue                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 4: PARTICIPANTS                          │
│                                                              │
│  Who's in the room/conversation?                            │
│  For each participant:                                       │
│    Does this memory match their filter list?                │
│    YES → BLOCK                                              │
│  All clear → Continue                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 5: EMOTIONAL STATE                       │
│                                                              │
│  Is user distressed? (prosody_score < -10)                  │
│  YES → Is this memory likely to add stress?                 │
│        YES → BLOCK or delay                                 │
│        NO → Continue                                         │
│  NO → Continue                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              FILTER 6: TRAJECTORY                            │
│                                                              │
│  Does surfacing this serve user's best trajectory?          │
│  - Will it help them grow?                                  │
│  - Will it reinforce bad patterns?                          │
│  - Is this rumination fuel?                                 │
│                                                              │
│  Helps trajectory → SURFACE                                 │
│  Hinders trajectory → BLOCK or REFRAME                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY SURFACED                           │
│              (or blocked with reason logged)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Trajectory-Aware Filtering

The most sophisticated filter. Not just "is this appropriate now" but "does this serve who you're becoming?"

### Examples:

**Memory:** "I failed the interview at Google in 2024"
**Query:** "What should I know before my Amazon interview?"
**Naive system:** Surfaces the failure memory (relevant!)
**Trajectory-aware:**
- Is user building confidence? → Maybe skip the failure
- Is user prone to overconfidence? → Surface as learning
- Has user processed this? → Okay to reference
- Is user in distress about interviews? → Reframe as "lessons learned"

**Memory:** "Ex-girlfriend said I was selfish"
**Query:** "Tell me about my past relationships"
**Naive system:** Surfaces the criticism
**Trajectory-aware:**
- Is user in new healthy relationship? → Maybe don't dredge
- Is user working on self-improvement? → Surface constructively
- Is user spiraling/ruminating? → BLOCK, this is fuel

---

## The Forgetting Prescription

The healthy algorithm doesn't just filter - it can **prescribe forgetting**.

```javascript
{
  memory_id: "mem_painful_breakup_2023",
  prescription: {
    action: "fade",
    reason: "rumination_pattern_detected",
    timeline: "66_days",  // habit formation period
    preserve: "lesson_learned",  // keep the growth, lose the pain
    user_override: true  // user can always restore
  }
}
```

**66 days** = time to form new habits (Phillippa Lally research)

The system can say: "I notice you've recalled this painful memory 47 times in 2 weeks. Would you like me to help you let it fade, while keeping the lesson?"

---

## Implementation Hooks

### In retrieval_service:
```javascript
async function retrieveMemories(query, context) {
  // 1. Get relevant memories (Engine 1)
  const relevant = await semanticSearch(query);

  // 2. Apply context filters (Engine 2)
  const appropriate = await applyContextFilters(relevant, context);

  // 3. Check trajectory alignment
  const wise = await trajectoryFilter(appropriate, context.user_trajectory);

  return wise;
}
```

### In MCP server (whats_relevant tool):
```javascript
{
  name: "whats_relevant",
  parameters: {
    // existing params...
    participants: ["string"],  // NEW: who's in the room
    filter_level: "strict" | "moderate" | "relaxed"  // NEW: how careful
  }
}
```

### New MCP tools:
```javascript
{
  name: "set_participants",
  description: "Tell the system who's in the room/conversation",
  parameters: {
    participants: ["boss", "Sarah Chen", "strangers"],
    relationship_hints: { "Sarah Chen": "coworker, not the crush" }
  }
}

{
  name: "prescribe_forgetting",
  description: "System recommends fading a memory pattern",
  parameters: {
    pattern: "rumination on breakup",
    preserve: "lessons about communication",
    timeline_days: 66,
    require_consent: true
  }
}
```

---

## Privacy-First Defaults

The system should be **paranoid by default**:

1. **Unknown location** → Assume public (strict filters)
2. **Unknown device** → Assume shared (require auth)
3. **Unknown participants** → Assume strangers (filter personal)
4. **Unknown emotional state** → Assume fragile (gentle content)

Only relax filters when context is **explicitly confirmed**.

---

## The Filter Alan Wishes He Had

> "Something God did not afford me that would have saved me many a scar"

The freight train effect - blurting things out without the filter between thought and speech. This system is that filter, externalized.

It won't stop Alan from saying things (that's his choice), but it will:
- Not feed him ammunition at the wrong moment
- Not surface painful memories when he's already down
- Not remind him of grievances when the person is in the room
- Gently suggest "maybe not right now" when context is dangerous

The system has the judgment. The human keeps the choice.

---

## Open Questions

1. **Who defines "best trajectory"?**
   - User sets goals?
   - System learns from feedback?
   - Therapist/coach can configure?

2. **Consent for forgetting prescriptions?**
   - Always require explicit consent?
   - Allow "auto-fade" for clearly harmful patterns?

3. **Transparency?**
   - Tell user when memories are filtered?
   - "I have more but it's not appropriate right now"?

4. **Override capability?**
   - User can always force-surface?
   - Or some things truly locked (Tier 3)?

---

## Summary

**Relevance Engine:** What IS relevant
**Context Filter:** What SHOULD BE surfaced
**Trajectory Filter:** What serves who you're becoming

Memory + Judgment = Wisdom

The correct answer is not always the right answer. This system knows the difference.
