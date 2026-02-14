# Chloe: Cocktail Party Awareness — Multi-Conversation Contextual Tracking

> "I can be in four conversations at the same time and not lose seam or context."
> — Alan, describing what Chloe needs to do

**Status:** Design
**Date:** 2026-02-14
**Related:** [CHLOE_SENSORY_MEMORY_INTEGRATION.md](./CHLOE_SENSORY_MEMORY_INTEGRATION.md), [loom-architecture.md](./loom-architecture.md), [PERSONA_ENGINE_DESIGN.md](./PERSONA_ENGINE_DESIGN.md)

---

## The Problem

At a party, a human with photographic memory does something no current AI can do: they track four conversations simultaneously, hold context for each, jump between them without losing the thread, and weave connections across all of them. Alan does this naturally with his eidetic 7x3 buffer. Chloe needs to do it too.

The existing architecture handles:
- Multi-speaker identification (DOA + face + voice embedding)
- Context frames (who's present, where, what activity)
- Attention management (salience-weighted memory window)
- Presence state tracking (person appears → load their context)

What it does NOT handle:
- **Multiple simultaneous conversation threads** as first-class objects
- **Per-conversation context persistence** while attention is elsewhere
- **Re-entry without cold start** — picking up where you left off in conversation B after spending 5 minutes in conversation A
- **Cross-conversation awareness** — when something said in conversation A is relevant to conversation B
- **Attention allocation** — how much processing to give each thread based on priority signals

This is the cocktail party problem. Not speaker separation (hardware solves that). Conversational coherence across parallel threads.

---

## What Chloe Already Has

### Hardware That Solves Speaker Separation

The ReSpeaker 4-Mic array with SRP-PHAT DOA gives directional audio at ~10ms latency. The OAK-D Pro v3 gives stereo depth + RGB. Together they solve the "who is talking and where" problem:

```
ReSpeaker 4-Mic Array
├── 4-channel raw audio
├── SRP-PHAT → Direction of Arrival (0-360° azimuth, ~10ms)
├── Beamforming → Isolate audio by direction
└── Speaker embedding → Voice fingerprint

OAK-D Pro v3
├── Stereo depth (mm precision)
├── RGB face detection → WhoAmI embedding (~50ms)
├── Active speaker detection (~20ms)
└── Person tracking (YOLO + depth)

FUSED OUTPUT per speaker:
  who:    "Betty" (face + voice match, confidence 0.92)
  where:  azimuth 45°, distance 2.3m, zone "living room"
  said:   "Did you see the news about the merger?"
  tone:   concerned (Hume EVI: anxiety 0.4, surprise 0.3)
  time:   2026-02-14T18:23:07.445Z
```

This is solved. The hardware gives Chloe per-speaker, per-direction, identified audio streams in real time. The cocktail party problem at the signal level is handled by physics — 4 mics + depth camera + beamforming.

### What's Missing: The Cognitive Layer

Speaker separation is the ear. What's missing is the brain's ability to maintain **multiple conversation states in parallel**. A human at a party doesn't just hear four conversations — they hold the *thread* of each one, know what was said 10 minutes ago in each, and can re-enter any of them without saying "sorry, what were you talking about?"

---

## Design: Conversation Thread Architecture

### Core Concept: ConversationThread

A ConversationThread is a first-class object representing an ongoing multi-turn exchange between identified participants. It is NOT a memory. It is a **live working state** that may eventually produce memories.

```typescript
interface ConversationThread {
  threadId: string;                    // UUID

  // Participants
  participants: Array<{
    personId: string;                  // WhoAmI face embedding ID
    name?: string;                     // Known name
    role: 'active' | 'listening' | 'departed';
    lastSpoke: string;                 // ISO8601
    turnCount: number;                 // How many turns they've taken
    position: {                        // Last known physical position
      azimuth: number;
      distance: number;
    };
  }>;

  // Thread state
  status: 'active' | 'paused' | 'concluded';
  topic?: string;                      // Current topic (LLM-extracted)
  topicHistory: string[];              // Topic drift tracking
  emotionalTone: string;               // Dominant emotional tone

  // Spatial anchor
  spatialCluster: {
    centerAzimuth: number;             // Average direction of this group
    spreadDegrees: number;             // How spread out the group is
    zone?: string;                     // Room zone if mapped
  };

  // Conversation buffer (rolling window, NOT permanent storage)
  recentTurns: Array<{
    speakerId: string;
    text: string;
    timestamp: string;
    emotion?: string;
    confidence: number;                // Transcription confidence
  }>;
  maxTurns: number;                    // Rolling buffer size (default: 50)

  // Context loaded for this thread
  loadedMemories: string[];            // Memory IDs surfaced for participants
  activeLoops: string[];               // Open loops relevant to these people

  // Chloe's engagement
  chloeEngagement: 'participating' | 'monitoring' | 'ambient';
  lastChloeUtterance?: string;         // What Chloe last said in this thread
  pendingResponse?: string;            // Something Chloe wants to say when appropriate

  // Timing
  startedAt: string;
  lastActivity: string;
  pausedAt?: string;                   // When attention shifted away

  // Salience
  threadSalience: number;              // 0-100, how important is this thread right now
}
```

### Thread Lifecycle

```
BIRTH: Two or more people start talking in proximity
  │
  ├── DOA clusters detected (speakers within 60° arc)
  ├── Face IDs resolved
  ├── New ConversationThread created
  ├── Participants' contexts loaded from memoRable
  │   ├── Recent memories with each person
  │   ├── Open loops involving them
  │   ├── Relationship state
  │   └── Anticipation (what they might need)
  │
  ▼
ACTIVE: Conversation is ongoing
  │
  ├── Turns appended to recentTurns buffer
  ├── Topic extracted/updated every N turns
  ├── Emotional tone tracked
  ├── Chloe participates OR monitors
  │
  ▼
PAUSED: Conversation lulls or Chloe's attention shifts
  │
  ├── Thread state preserved in Redis
  ├── recentTurns buffer intact
  ├── Topic and emotional state frozen
  ├── Chloe can re-enter any time
  │   └── Re-entry briefing available:
  │       "Betty and Margaret were discussing the garden.
  │        Betty mentioned the roses aren't blooming.
  │        Tone was relaxed. No open items."
  │
  ▼
CONCLUDED: Participants disperse or topic naturally ends
  │
  ├── Thread summarized (LLM)
  ├── Significant moments extracted → memoRable memories
  ├── Open loops captured
  ├── Relationship interactions recorded
  └── Thread archived, buffer freed
```

---

## Multi-Thread Attention Manager

### Alan's 7x3 Buffer, Implemented

Alan's eidetic memory gives him a 7x3 working buffer — 21 slots instead of the typical 7. He can hold 3-4 active conversation contexts simultaneously because each conversation occupies 5-7 slots and he has room for all of them.

Chloe's implementation:

```
┌─────────────────────────────────────────────────────────┐
│              CHLOE'S CONVERSATION ATTENTION              │
│                                                         │
│  Thread Pool (max 8 simultaneous threads)               │
│                                                         │
│  ┌─────────────────────────────────────────┐            │
│  │ PARTICIPATING (max 1)                   │            │
│  │ Thread: Betty & Margaret - garden       │ ◄── FOCUS  │
│  │ Salience: 85  Turns: 23  Duration: 8m  │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
│  ┌─────────────────────────────────────────┐            │
│  │ MONITORING (max 3)                      │            │
│  │ Thread: Alan & Tom - robotics   Sal: 72 │ ◄── TRACK │
│  │ Thread: Kids group - game       Sal: 45 │ ◄── TRACK │
│  │ Thread: Door arrivals           Sal: 60 │ ◄── TRACK │
│  └─────────────────────────────────────────┘            │
│                                                         │
│  ┌─────────────────────────────────────────┐            │
│  │ AMBIENT (unlimited)                     │            │
│  │ All other audio streams                 │ ◄── DETECT │
│  │ Only triggers on: name, distress,       │            │
│  │   topic match, new person arrival       │            │
│  └─────────────────────────────────────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Three Engagement Tiers

**1. PARTICIPATING** — Chloe is actively in this conversation.
- Full transcription and understanding
- Chloe generates responses
- All participants' contexts fully loaded
- Emotional tracking per turn
- Open loop detection active

**2. MONITORING** — Chloe is tracking but not speaking.
- Full transcription continues
- Topic tracking active
- Emotional shift detection (alert if distress)
- Name detection (if someone mentions Chloe or a known person)
- Periodic context updates (every 30s)
- Chloe can interject if high-salience event detected

**3. AMBIENT** — Background awareness.
- Keyword detection only (Chloe's name, distress words, known names)
- No full transcription (save compute)
- Speaker count tracking (new voice = potential new thread)
- Volume/tone anomaly detection (yelling, crying, laughter)
- Promotes to MONITORING if trigger detected

### Attention Switching

```
TRIGGERS FOR ATTENTION SHIFT:

Promote AMBIENT → MONITORING:
  ├── Chloe's name spoken
  ├── Distress keywords detected
  ├── Known person's name mentioned
  ├── Sudden volume change
  ├── New face appears (unknown person)
  └── Laughter (social signal)

Promote MONITORING → PARTICIPATING:
  ├── Someone addresses Chloe directly (gaze + name)
  ├── Topic matches Chloe's active loops
  ├── Participant shows distress
  ├── Participant asks a question Chloe can answer
  └── Thread salience exceeds threshold (85+)

Demote PARTICIPATING → MONITORING:
  ├── Conversation pauses (>30s silence)
  ├── Higher-salience thread needs attention
  ├── Chloe is dismissed ("thanks, Chloe")
  └── Topic moves to private territory (reading the room)

Demote MONITORING → AMBIENT:
  ├── Thread concluded (participants disperse)
  ├── Thread idle for >5 minutes
  ├── Thread salience drops below threshold
  └── Attention pool at capacity (need room)
```

---

## Spatial Conversation Clustering

### How Chloe Groups Speakers Into Conversations

People at a party cluster spatially. A conversation between Betty and Margaret happens at one location; Alan and Tom are across the room. The ReSpeaker's DOA + OAK-D depth gives spatial coordinates for every speaker.

```
SPATIAL CLUSTERING ALGORITHM:

1. For each detected speaker, get (azimuth, distance) tuple
2. Convert to approximate (x, y) in room coordinates:
   x = distance * cos(azimuth)
   y = distance * sin(azimuth)
3. Cluster using proximity threshold (default: 2m)
   - Speakers within 2m of each other = same conversation cluster
   - Speakers >2m apart = different conversations
4. Assign each cluster a ConversationThread
5. Track cluster stability over time (20s window)
   - If someone moves between clusters → participant migration

EDGE CASES:
  - One person between two groups → assign to the group they're facing
    (face orientation from OAK-D)
  - Large group (5+) that splits → detect sub-cluster formation
  - Person talking to themselves → solo thread, low priority
  - Phone call → one-sided audio, flag as possible phone conversation
```

### Participant Migration

```
Betty moves from Kitchen Group → Living Room Group

1. DOA + depth tracks Betty's position over 5s window
2. Betty leaves Kitchen cluster (distance > threshold for 5s)
3. Kitchen thread: Betty.role = 'departed', pausedAt = now
4. Betty enters Living Room cluster
5. Living Room thread: add Betty as participant
6. Load Betty's context into Living Room thread
7. Cross-reference: anything from Kitchen thread relevant here?
   └── If Betty was discussing recipes and Living Room is talking
       about dinner → flag connection for Chloe
```

---

## Cross-Conversation Awareness

### The Real Superpower

What makes Alan's multi-conversation ability extraordinary isn't just tracking — it's **connecting**. He hears something in conversation A that's relevant to conversation B, and he bridges them. Chloe needs this.

```
CROSS-THREAD RELEVANCE ENGINE:

Every N turns (configurable, default: 5 turns per thread):
  1. Extract current topic/entities from each active thread
  2. Compare across all MONITORING and PARTICIPATING threads
  3. Score cross-thread relevance:
     - Shared entities (same person mentioned in two threads): HIGH
     - Shared topics (same subject in two threads): MEDIUM
     - Emotional echo (distress in one, related person in another): HIGH
     - Open loop connection (loop owner in one, loop subject in other): HIGH

  If cross-thread relevance > threshold:
    ├── Queue as pendingResponse in relevant thread
    ├── Wait for natural conversation break
    └── Chloe can bridge: "Betty, Margaret was just saying
         the same thing about the roses — you two should talk!"

CONSTRAINTS:
  - NEVER bridge private/sensitive information across threads
  - Apply physical presence filter (from loom-architecture.md)
  - Check: would a thoughtful human share this? If no → suppress
  - Bridging is a suggestion, not an interruption
```

---

## Thread-Level Memory Integration

### What Gets Remembered vs. What's Working State

```
WORKING STATE (Redis, ephemeral):
├── recentTurns buffer (rolling 50 turns per thread)
├── Current topic per thread
├── Participant positions
├── Emotional tone
├── Chloe's pending responses
└── Thread salience scores

BECOMES MEMORY (MongoDB, permanent) WHEN:
├── Thread concludes → Summary extracted and stored
├── High-salience moment detected mid-thread:
│   ├── Someone makes a commitment ("I'll bring the cake")
│   ├── Emotional peak (crying, anger, extreme joy)
│   ├── Decision made ("we're moving to Portland")
│   ├── New relationship signal (introduction, reconnection)
│   └── Distress detected (always captured immediately)
├── Open loop created (commitment/question/agreement)
└── Relationship interaction recorded (per participant pair)

NEVER BECOMES MEMORY:
├── Idle chatter below salience threshold
├── Repeated/circular conversation
├── Ambient noise classified as non-speech
└── Anything the user has suppression rules for
```

### Re-Entry Briefing

When Chloe shifts attention back to a paused thread, she needs a briefing — not the whole transcript, just what matters:

```
RE-ENTRY BRIEFING GENERATION:

Input: paused ConversationThread
Output: 2-3 sentence briefing

Template:
  "[Participants] were discussing [topic].
   [Key development since Chloe last engaged].
   [Emotional state]. [Any open items or flags]."

Example:
  "Betty and Margaret were comparing garden techniques.
   Margaret mentioned her tomatoes have blight — Betty offered
   to bring neem oil tomorrow. Tone is warm and helpful.
   Note: Betty promised neem oil (open loop created)."

This briefing is internal to Chloe — she doesn't say it out loud.
It's loaded into her active context so she can re-enter seamlessly.
```

---

## Compute Budget & Priority

### Edge Processing on Jetson Orin 8GB

The Jetson has limited compute. Running full NLP on 4+ simultaneous audio streams will saturate it. Priority allocation:

```
COMPUTE ALLOCATION BY TIER:

PARTICIPATING (1 thread):    ~40% of inference budget
├── Full STT (Vosk/Whisper)
├── Full emotion analysis (Hume EVI or local)
├── Per-turn topic extraction
├── Open loop detection
├── Response generation
└── Cross-thread relevance check

MONITORING (up to 3 threads): ~15% each, ~45% total
├── Full STT (lighter model acceptable)
├── Keyword spotting (names, distress, topics)
├── Topic tracking (every 5 turns, not every turn)
├── Emotional shift detection (threshold-based, not continuous)
└── Periodic cross-thread check

AMBIENT (all others):          ~15% total
├── Voice Activity Detection only
├── Keyword spotting (wake word + distress)
├── Speaker count estimation
└── Volume anomaly detection

RESERVED:                      ~5%
└── Headroom for spikes (sudden promotion of ambient → monitoring)
```

### Graceful Degradation

```
If compute saturated:
  1. Reduce MONITORING threads from 3 → 2
  2. Increase topic extraction interval (5 turns → 10 turns)
  3. Disable cross-thread relevance for lowest-salience thread
  4. Switch emotion analysis to threshold-only (no continuous scoring)
  5. NEVER degrade PARTICIPATING thread quality
  6. NEVER degrade distress detection (safety is non-negotiable)
```

---

## Thread Salience Scoring

### Why Some Conversations Matter More

Not all conversations are equal. Chloe needs to allocate attention based on what matters:

```
THREAD SALIENCE COMPONENTS:

1. PARTICIPANT SALIENCE (40%)
   ├── Relationship health with each participant
   ├── Open loops involving participants
   ├── Recency of last interaction
   └── Care priority (Betty > random guest)

2. TOPIC SALIENCE (25%)
   ├── Matches Chloe's active goals/tasks
   ├── Matches known interests of key people
   ├── Emotional weight of topic
   └── Consequential potential (decisions, commitments)

3. ENGAGEMENT SIGNALS (20%)
   ├── Someone addressed Chloe
   ├── Question asked that Chloe can answer
   ├── Help requested
   └── Gaze directed at Chloe

4. URGENCY SIGNALS (15%)
   ├── Distress detection (overrides everything)
   ├── Time-sensitive topic (medication, appointment)
   ├── Escalating emotional intensity
   └── Safety concern (fall risk, confusion)
```

---

## Privacy in Multi-Conversation Mode

### Reading the Room With Multiple Rooms

From loom-architecture.md's physical presence filter, extended for multi-thread:

```
PER-THREAD PRIVACY RULES:

1. Each thread has independent privacy context
2. Information from Thread A does NOT surface in Thread B unless:
   ├── It's publicly known information
   ├── The source participant is present in both threads
   └── It passes the "thoughtful human" test
3. Medical/health information: NEVER crosses threads
4. Emotional disclosures: NEVER crosses threads
5. Financial information: NEVER crosses threads
6. Gossip detection: If Thread A discusses someone in Thread B,
   Chloe does NOT relay or reference it

EXAMPLE:
  Thread A: Betty tells Chloe she's worried about her test results
  Thread B: Margaret asks "How's Betty doing?"

  WRONG: "She's worried about test results"
  RIGHT: "She seemed well when I saw her earlier" (or say nothing)

The filter stack from loom-architecture.md applies per-thread,
independently, with the additional constraint that cross-thread
information flow is blocked by default.
```

---

## Implementation Phases

### Phase 1: Single-Thread Enhancement (Foundation)
- Extend existing ContextFrame with ConversationThread support
- One active thread at a time (current behavior, formalized)
- Thread lifecycle: birth → active → concluded
- Summary extraction on conclusion → memoRable memory
- Re-entry briefing generation

### Phase 2: Multi-Thread Tracking (The Real Work)
- Spatial clustering from DOA + depth
- Thread pool with 3 engagement tiers
- Attention switching logic
- Per-thread recentTurns buffer in Redis
- Compute budget allocation on Jetson

### Phase 3: Cross-Thread Intelligence (The Superpower)
- Cross-thread relevance engine
- Participant migration tracking
- Bridge suggestions (connecting conversations)
- Thread salience scoring with all 4 components

### Phase 4: Learned Patterns (Adaptive)
- Pattern learning: which threads Chloe prioritizes (adaptive weights)
- Party layout learning (recurring gatherings, usual clusters)
- Person-pair conversation prediction (who usually talks to whom)
- Topic prediction from participant combinations

---

## Key Design Decisions

1. **Threads are ephemeral, memories are permanent.** Threads live in Redis and die when the party's over. Only the significant moments become memories. This is the temporal control pillar — most of what's said at a party doesn't matter and shouldn't be stored.

2. **Speaker separation is a hardware problem, not a software problem.** The ReSpeaker 4-Mic + OAK-D Pro v3 solve this at the physics level. Don't waste compute on software diarization when you have directional microphones with DOA built in.

3. **Attention is a scarce resource, allocate it.** The Jetson has 8GB. You can't run full NLP on everything. Three tiers (participating/monitoring/ambient) mirror how human attention actually works — you're not processing every conversation equally, you're prioritizing.

4. **Cross-conversation bridging is the differentiator.** Anyone can transcribe. The value is in connecting: "Margaret was just saying the same thing." This is what Alan does with his 7x3 buffer. This is what makes the robot feel like a real participant, not a recording device.

5. **Privacy per thread, not per room.** A party is not one context — it's many simultaneous private contexts overlapping in space. Chloe must treat each conversation thread as its own privacy domain.

---

## Connection to Existing Architecture

| Existing Component | How It Connects |
|---|---|
| `context_frame.ts` | ConversationThread extends the frame with per-thread context. Multiple threads = multiple sub-frames under one spatial frame. |
| `attention_manager.ts` | Thread salience feeds into attention. Each thread's memories compete for the 100-slot attention window. |
| `device_context.ts` | AudioSensorData already has `speakers[]` with diarization. Thread creation consumes this. |
| `context_integration.ts` | The thalamus merges thread contexts with device contexts. Thread context is a new input stream. |
| `salience_calculator.ts` | Thread-level salience uses same 5-component model, applied to conversation moments instead of stored memories. |
| `open_loop_tracker.ts` | Threads generate open loops in real time as commitments are detected mid-conversation. |
| `distress_scorer.ts` | Distress detection runs on ALL tiers, always. A distress signal in an ambient thread immediately promotes it. |
| `session_continuity.ts` | Thread state is part of session handoff. If Chloe switches bodies mid-party, threads transfer. |
| Loom (7 threads) | Each ConversationThread produces woven moments via the Loom when salience threshold is met. |

---

## What Attention Labs Got Wrong

Attention Labs bet on software-layer audio intelligence. But microphone hardware is shipping with AI built in — DOA, beamforming, speaker separation at the silicon level. The ReSpeaker already does this. The next generation of mics will do it better. The signal processing layer is being commoditized into the hardware.

The value isn't in separating the audio. It's in **understanding what's being said across multiple streams simultaneously and maintaining coherent context for each one**. That's a memory problem, not an audio problem. That's memoRable's territory.
