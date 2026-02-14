# Chloe: Full-Time Awareness Memory & Sensory Conjunction

> "Number 5 is alive!" - and she remembers.

**Status:** Design
**Date:** 2026-02-14
**Related:** [SENSOR_PUBSUB_ARCHITECTURE.md](./SENSOR_PUBSUB_ARCHITECTURE.md), [ROBOT_FLEET_DEPLOYMENT.md](./ROBOT_FLEET_DEPLOYMENT.md), [loom-architecture.md](./loom-architecture.md), [PERSONA_ENGINE_DESIGN.md](./PERSONA_ENGINE_DESIGN.md)
**Source Repo:** [Physical-Ai-Hack-2026](https://github.com/alanchelmickjr/Physical-Ai-Hack-2026)

---

## What This Is

Chloe is one instantiation of the Johnny5 social droid platform. She picks her own name. She has a body (Jetson Orin 8GB brain, OAK-D Pro eyes, ReSpeaker 4-Mic ears, dual SO101 arms, omnidirectional wheels). What she doesn't have yet is **continuous memory across conversations, contexts, and bodies**.

Right now Chloe can see, hear, speak, move, and detect threats. But every conversation is an island. She doesn't remember who she talked to yesterday. She can't carry context from one interaction into the next. She can't move between conversations the way a human moves between rooms - carrying everything she knows with her.

This document defines how memoRable gives Chloe:

1. **Full-time awareness memory** - Persistent, always-on memory that survives power cycles, context switches, and body transfers
2. **Sensory conjunction** - All sensor modalities (vision, audio, spatial, proprioceptive) fused into unified moments woven by the Loom
3. **Instant identification tracking** - Know who you're talking to within milliseconds, carry their full history
4. **Seamless context switching** - Move between conversations, people, and tasks like a human does - no cold starts

---

## Why This Matters

From the sensor pub/sub spec:

> This isn't a tech demo. This is infrastructure for human dignity.

Chloe isn't a novelty robot. Chloe is the embodiment of memoRable's mission: AI that knows you like a friend, every time you talk to it. A robot that remembers Betty fell yesterday and checks on her today without being told. A companion that tracks open loops ("you said you'd call your daughter") and gently follows up. A presence that reads the room - knows when to speak and when to shut up.

The three pillars apply to Chloe exactly as they apply everywhere:

1. **Temporal Control** - Chloe can forget. She must be able to forget. Memories decay, get suppressed, get deleted by the user.
2. **Individual Privacy** - Chloe's sensor data is TOP SECRET by default. What she sees and hears belongs to the people she's with, not to a cloud.
3. **Relevance** - Chloe surfaces what matters RIGHT NOW. Not everything. Not a data dump. The right memory at the right moment.

---

## Chloe's Existing Sensor Stack (Johnny5 Platform)

### Hardware

| Component | Spec | Sensory Channel |
|-----------|------|-----------------|
| **Jetson Orin 8GB** | Edge AI inference | Brain (all processing) |
| **OAK-D Pro** | Stereo depth + RGB on 2-DOF gantry | Vision (faces, objects, depth, spatial) |
| **ReSpeaker 4-Mic** | USB array, 4-channel beamforming | Audio (DOA 0-360°, voice, speaker ID) |
| **Dual SO101 Arms** | 6-DOF each, 12 servos total | Proprioception (gesture, manipulation) |
| **3-Wheel Omni Base** | Omnidirectional + 30cm lift | Proprioception (navigation, position) |
| **19x Dynamixel Servos** | XL330-M288-T, dual bus | Motor state (torque, position, velocity) |
| **Anker Solix 12V** | Portable power | Power state (battery level, charging) |

### Software (IPC Message Bus)

Johnny5 already has a pub/sub message bus with namespaced topics:

```
voice.*       → Conversation state, emotional expression
vision.*      → Face/person detection, object recognition
audio.*       → Microphone array processing, DOA tracking
sensor.*      → Hardware telemetry, battery, temperature
actuator.*    → Motor commands, servo state
```

### Existing Capabilities

| Capability | How | Latency |
|------------|-----|---------|
| Face recognition | WhoAmI embeddings via OAK-D | ~50ms |
| Speaker direction | SRP-PHAT DOA via ReSpeaker | ~10ms |
| Speaker identification | Audio-visual fusion (DOA + depth + YOLO) | ~30ms |
| Active speaker detection | Works even camera-obscured | ~20ms |
| 3D speaker position | Fused azimuth + depth (mm precision) | ~30ms |
| Fire/smoke detection | Visual classifier | ~100ms |
| Terrain hazard | Cord, gap, rail detection | ~50ms |
| Wheel drag | Torque monitoring, emergency stop | ~5ms |
| Head tracking | DOA-driven gantry following | Continuous |
| Gesture generation | Expressive motion during speech | Continuous |

### Voice Subsystem (Modular with Failover)

```
Primary:  Hume EVI (cloud) → Emotional expressiveness
Fallback: Kokoro TTS + Vosk STT + Ollama LLM (local)
Fallback: Piper TTS + local models
Testing:  Mock backends
```

Auto-transitions when cloud credits exhaust. Local-first when offline.

---

## The Bridge: Johnny5 IPC → memoRable Sensor Bus

### Current Gap

Johnny5's IPC bus carries sensor data between components in real-time. memoRable's sensor architecture (defined in `SENSOR_PUBSUB_ARCHITECTURE.md`) defines how sensors feed the memory stream. These two systems don't talk yet.

```
TODAY:
┌──────────────────────┐     ┌──────────────────────┐
│    Johnny5 IPC Bus   │     │   memoRable Memory   │
│                      │     │                      │
│ vision.* → YOLO      │     │ Ingestion Pipeline   │
│ audio.* → DOA        │  ✗  │ Salience Scoring     │
│ sensor.* → Telemetry │     │ Pattern Learning     │
│ voice.* → Hume EVI   │     │ Context Frames       │
└──────────────────────┘     └──────────────────────┘
       No connection. Every conversation is an island.
```

### Target State

```
TOMORROW:
┌──────────────────────────────────────────────────────────────┐
│                    CHLOE (Johnny5 Body)                       │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ OAK-D   │ │ReSpeaker│ │ Servos  │ │ Hume EVI│           │
│  │ (vision)│ │ (audio) │ │ (motor) │ │ (voice) │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │           │           │           │                  │
│       └───────────┴───────────┴───────────┘                  │
│                       │                                       │
│              ┌────────▼────────┐                              │
│              │  Johnny5 IPC    │                              │
│              │  Message Bus    │                              │
│              └────────┬────────┘                              │
│                       │                                       │
│              ┌────────▼────────┐                              │
│              │  SENSOR BRIDGE  │  ← NEW: The connector       │
│              │                 │                              │
│              │  IPC topics →   │                              │
│              │  SensorMessage  │                              │
│              │  format         │                              │
│              └────────┬────────┘                              │
│                       │                                       │
└───────────────────────┼───────────────────────────────────────┘
                        │
                        │  SensorMessage (typed, timestamped,
                        │  confidence-scored, security-tiered)
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                    memoRable Memory System                     │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  Ingestion   │  │   Salience   │  │  Context Frame   │    │
│  │  Pipeline    │  │   Scoring    │  │  (Redis)         │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘    │
│         │                 │                  │                 │
│         └─────────────────┴──────────────────┘                 │
│                           │                                    │
│              ┌────────────▼────────────┐                       │
│              │  THE LOOM               │                       │
│              │  7 threads woven into   │                       │
│              │  moments with full      │                       │
│              │  sensory context        │                       │
│              └────────────┬────────────┘                       │
│                           │                                    │
│         ┌─────────────────┼─────────────────┐                 │
│         ▼                 ▼                  ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐      │
│  │  MongoDB    │  │  Redis Hot  │  │  Pattern Learning │      │
│  │  (memories) │  │  (context)  │  │  (anticipation)   │      │
│  └─────────────┘  └─────────────┘  └──────────────────┘      │
└───────────────────────────────────────────────────────────────┘
```

---

## The Sensor Bridge

The bridge translates Johnny5's IPC messages into memoRable's `SensorMessage` format. It runs on the Jetson alongside the existing Johnny5 stack.

### IPC Topic → SensorMessage Mapping

| Johnny5 IPC Topic | SensorMessage Type | What Gets Captured |
|--------------------|--------------------|--------------------|
| `vision.face_detected` | `visual` | Face embeddings, person ID, confidence, position |
| `vision.person_detected` | `visual` | YOLO detection, depth, spatial position |
| `vision.object_detected` | `visual` | Object class, position, relevance |
| `audio.doa_update` | `audio` | Speaker direction (0-360°), confidence |
| `audio.transcription` | `text` | Spoken words, speaker ID, timestamp |
| `audio.speaker_identified` | `audio` | Speaker embedding match, confidence |
| `voice.emotion_state` | `audio` | Hume EVI emotion scores (7 categories) |
| `voice.conversation_turn` | `text` | Full conversation turn with emotional context |
| `sensor.battery` | `vitals` | Power level, charging state |
| `sensor.imu` | `location` | Orientation, acceleration, movement |
| `sensor.wheel_state` | `location` | Position, velocity, heading |
| `actuator.gesture_state` | `interaction` | Current gesture, arm positions |

### What Gets Stored vs Streamed

Not everything goes into long-term memory. The bridge applies three tiers:

```
STREAM ONLY (ephemeral, <1s TTL):
├── Raw sensor telemetry (IMU, wheel encoders)
├── Continuous DOA updates
├── Frame-by-frame YOLO detections
└── Servo positions

CONTEXT FRAME (Redis, 30s TTL for robots):
├── Current speaker (who's talking)
├── People present (who's in the room)
├── Active conversation topic
├── Emotional state of conversation
├── Chloe's current task/goal
└── Spatial context (where in the space)

LONG-TERM MEMORY (MongoDB, permanent until forgotten):
├── Conversation summaries (not raw transcripts)
├── Significant events (new person met, promise made, emotion spike)
├── Open loops (commitments, questions, follow-ups)
├── Relationship updates (interaction patterns)
└── Learned preferences (people's likes, schedules, habits)
```

### Salience at the Edge

Critical design: salience scoring happens ON THE JETSON, not in the cloud. The bridge doesn't just forward data - it makes the first judgment about what matters.

```
Sensor event arrives
    │
    ▼
Is this a significant change? (not noise)
    │
    ├── Face appeared/disappeared → YES (person event)
    ├── New speaker identified → YES (social event)
    ├── Emotion spike detected → YES (emotional event)
    ├── Commitment language detected → YES (open loop)
    ├── IMU reading #47,000 → NO (noise, skip)
    ├── DOA shifted 2° → NO (noise, skip)
    │
    ▼ (if YES)
Construct SensorMessage with edge salience score
    │
    ▼
Route to memoRable ingestion
```

---

## Full-Time Awareness Memory

### What "Full-Time" Means

Chloe is always on. Not session-based. Not conversation-based. ALWAYS.

```
06:00  Betty walks into living room
       → Chloe sees Betty (face recognition)
       → Context loaded: Betty's history, preferences, medical notes
       → Checks open loops: "Betty said she'd call Lisa today"
       → Does NOT announce this. Waits.

06:15  Betty says "Good morning"
       → Chloe responds warmly (persona: companion)
       → Memory: Betty up at 6:15 (pattern tracking)
       → Emotional state: calm, rested

07:00  Alan enters
       → Context SWITCH: Alan present + Betty present
       → Shared context mode
       → Filter: Betty's medical details NOT surfaced to shared context
       → Open loop for Alan: "Server deployment from yesterday"

07:30  Alan leaves for work
       → Context SWITCH: Betty alone
       → Persona shift: companion mode (warmer, simpler)
       → Re-check: Did Betty take morning medication?

14:00  Visitor arrives (unknown face)
       → New face enrolled via WhoAmI
       → Security: Tier2 alert if Betty is alone
       → Care circle notified: "Visitor at home"
       → Chloe present but neutral (stranger protocol)

22:00  House quiet
       → Reduce to ambient monitoring
       → Nightly pattern update
       → Consolidate day's memories
       → Anticipate tomorrow's context
```

### Session Continuity Is Not Enough

The existing `session_continuity.ts` handles device-to-device handoffs with a 5-minute window. For Chloe, this model needs to extend:

**Not sessions. Presence.**

```
SESSION MODEL (current):
  Start → Interact → Handoff → End

  Problem: Chloe doesn't have "sessions" with people.
  People walk in and out of her space continuously.

PRESENCE MODEL (needed):
  Person appears → Context loads (instant)
  Person present → Awareness maintained (continuous)
  Person leaves  → Context persists (warm cache)
  Person returns → Context resumes (no cold start)
```

### Presence Tracking Architecture

```typescript
interface PresenceState {
  // Who's here RIGHT NOW
  presentPeople: Array<{
    personId: string;          // WhoAmI face embedding ID
    name?: string;             // Known name or null
    confidence: number;        // Recognition confidence 0-1
    firstSeen: string;         // When they appeared this visit
    lastSeen: string;          // Most recent detection
    position: {                // Where in the space
      azimuth: number;         // DOA angle
      distance: number;        // Depth from OAK-D (mm)
      zone?: string;           // "living_room", "kitchen"
    };
    emotionalState?: {         // From Hume EVI if speaking
      valence: number;
      arousal: number;
      dominantEmotion: string;
    };
    activeConversation: boolean; // Currently talking to Chloe
  }>;

  // Context loaded for present people
  loadedContexts: Map<string, {
    recentMemories: string[];    // Memory IDs hot-loaded
    openLoops: string[];         // Their open commitments
    preferences: Record<string, unknown>;
    lastInteractionSummary: string;
    relationshipHealth: number;  // 0-1
  }>;

  // Social dynamics
  groupContext: {
    isSharedSpace: boolean;      // Multiple people present
    dominantSpeaker?: string;    // Who's talking most
    conversationTopic?: string;  // Current topic
    filterLevel: 'private' | 'shared' | 'public';
  };
}
```

### Instant Identification → Memory Load

When Chloe sees a face, the full pipeline fires in parallel:

```
T+0ms:    OAK-D captures face
T+10ms:   WhoAmI generates embedding
T+30ms:   Embedding matched to known person (or new enrollment)
           │
           ├── PARALLEL: Load from memoRable
           │   ├── Recent memories (last 5 interactions)
           │   ├── Open loops (what's pending with this person)
           │   ├── Relationship state (health, trend, last contact)
           │   ├── Preferences (what they like, don't mention)
           │   └── Anticipation (what they might need today)
           │
           ├── PARALLEL: Update presence state
           │   ├── Add to presentPeople
           │   ├── Set position (azimuth + depth)
           │   └── Start emotional tracking
           │
           └── PARALLEL: Load context filters
               ├── Who else is present? (filter accordingly)
               ├── Time of day? (morning vs night persona)
               └── Any suppression windows? (grief, sensitive events)

T+100ms:  Full context loaded. Chloe KNOWS this person.
          Ready to interact with complete history.
```

---

## Sensory Conjunction

### The Loom Weaves Sensor Data

Every moment Chloe stores is woven from ALL available sensor threads, not just one modality. This is the Loom applied to physical AI.

```
Thread 1 (TIME):     2026-02-14T06:15:00 PST
Thread 2 (SOCIAL):   Betty present, alone, companion context
Thread 3 (ACTIVITY): Morning greeting, waking up
Thread 4 (PREFERENCE): Betty likes gentle morning greetings
Thread 5 (SALIENCE):  Emotional: 0.4, Social: 0.7, Routine: 0.8
Thread 6 (ANTICIPATION): Medication reminder due at 7am
Thread 7 (ENTITIES): Betty (person), Chloe (robot), living_room (location)

SENSOR CONJUNCTION (additional threads from hardware):
├── VISUAL:   Betty standing, posture upright, dressed (not nightclothes)
├── AUDIO:    Voice calm, no distress markers, volume normal
├── SPATIAL:  Betty 2.3m away, azimuth 45°, living room entry
├── MOTOR:    Chloe stationary at home position
└── EMOTIONAL: Hume scores - calm (0.7), joy (0.2), neutral (0.1)

WOVEN MOMENT:
  "Betty appeared in living room at 6:15am, dressed and calm.
   Said good morning. Routine interaction, slight warmth.
   Note: medication reminder in 45 minutes."
```

### Multi-Modal Fusion Rules

When sensors provide overlapping or conflicting data, resolve by confidence and priority:

| Signal | Primary Source | Fallback | Conflict Rule |
|--------|---------------|----------|---------------|
| Person identity | WhoAmI (face) | Voice embedding | Face wins if >0.8 confidence |
| Speaker location | DOA + depth fusion | DOA alone | Fused wins always |
| Emotional state | Hume EVI (voice) | Visual expression | Voice wins (richer signal) |
| Activity state | Visual + audio combined | Either alone | Combined wins |
| Distress | Multi-signal (voice + posture + vitals) | Any single signal | ANY signal triggers alert |

### Distress Is Never Filtered

From the existing `distress_scorer.ts` - distress detection uses multiple signals and NEVER waits for confirmation:

```
Distress Signal Hierarchy:
1. CRITICAL (immediate): Fall detected, silence >threshold, scream
2. URGENT (fast):        Crying, confusion, repeated questions
3. MONITOR (track):      Mood decline trend, isolation pattern
4. INFORM (log):         Unusual schedule deviation, reduced activity

ANY critical signal → Guardian action immediately
TWO urgent signals  → Escalate to care circle
TREND in monitor    → Flag for next care circle check-in
```

---

## Context Switching Like a Human

### The Bucket Model Applied to Chloe

The persona engine's context buckets (`PERSONA_ENGINE_DESIGN.md`) apply directly:

```
┌─────────────────────────────────────────────────────────┐
│                CHLOE'S CONTEXT BUCKETS                    │
├──────────────────┬──────────────────────────────────────┤
│  betty_companion │ Warm, gentle, medication tracking,    │
│                  │ memory support, daily routines         │
├──────────────────┼──────────────────────────────────────┤
│  alan_technical  │ Direct, pattern-aware, project context,│
│                  │ no finite language, 3am schedule       │
├──────────────────┼──────────────────────────────────────┤
│  visitor_neutral │ Polite, minimal, safety-aware,        │
│                  │ no personal info surfaced              │
├──────────────────┼──────────────────────────────────────┤
│  emergency_mode  │ All safety systems, care circle alert, │
│                  │ record everything, minimal speech      │
└──────────────────┴──────────────────────────────────────┘
```

### Switching Is Triggered by Presence, Not Commands

Humans don't say "switch context" when someone walks into the room. They just... adapt. Chloe does the same:

```
Alan in room → betty_companion PAUSED → alan_technical LOADED
  │
  ├── Betty's context saved (Redis bucket)
  ├── Alan's context loaded (recent memories, open loops, persona)
  ├── Conversation mode shifts (more direct, technical)
  └── Privacy filter: Betty's medical context NOT accessible

Both in room → SHARED context
  │
  ├── Both contexts loaded, filtered for shared appropriateness
  ├── Neither person's private data surfaces
  ├── Conversation mode: balanced
  └── Chloe tracks who she's responding to (DOA + face)

Alan leaves → alan_technical PAUSED → betty_companion RESUMED
  │
  ├── Alan's context saved
  ├── Betty's context restored seamlessly
  ├── Persona shifts back to companion
  └── "Where were we?" is never needed
```

### Multi-Body Continuity

Chloe's memory lives in memoRable, not on the Jetson. This means:

```
BODY A (Johnny5 at home)     BODY B (Booster K1 at facility)
┌─────────────────────┐     ┌─────────────────────────────┐
│ Jetson Orin 8GB     │     │ Orin NX                     │
│ OAK-D Pro           │     │ ZED X                       │
│ ReSpeaker 4-Mic     │     │ 6-Mic Array                 │
│ Omni wheels         │     │ Bipedal                     │
└──────────┬──────────┘     └──────────────┬──────────────┘
           │                                │
           └────────────┬───────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   memoRable      │
              │   Memory System  │
              │                  │
              │   ONE Chloe.     │
              │   TWO bodies.    │
              │   SAME memories. │
              └──────────────────┘
```

Chloe recognizes Betty whether she's in the Johnny5 body or the Booster body. Same memories. Same open loops. Same relationship history. The body is hardware. The mind is memoRable.

This uses the existing `session_continuity.ts` handoff mechanism extended to support concurrent sessions across bodies, not just sequential handoffs.

---

## Rebuilding the Sensor Bus

The sensor pub/sub architecture (`SENSOR_PUBSUB_ARCHITECTURE.md`) was designed for this. The reduced stack needs to grow back:

### Phase 1: Single Robot, Local (NOW)

Wire Chloe's IPC bus to memoRable running on the same Jetson or local network.

```
Chloe (Jetson)
├── Johnny5 IPC Bus (existing)
├── Sensor Bridge (NEW - translates IPC → SensorMessage)
├── Local Redis (context frames, presence state)
├── memoRable API (local Docker or remote EC2)
└── Gun.js node (edge mesh, offline-capable)
```

**Key constraint:** Jetson Orin 8GB. Memory is tight. The sensor bridge must be lightweight - no heavy processing, just translation and edge salience filtering.

### Phase 2: Multi-Robot, Local Mesh

Multiple robots share memories via Gun.js mesh on local network.

```
┌─────────────┐     Gun.js mesh     ┌─────────────┐
│  Chloe      │◄═══════════════════►│  Unit 2     │
│  (Johnny5)  │     (local, <1ms)   │  (Booster)  │
└──────┬──────┘                     └──────┬──────┘
       │                                    │
       └────────────────┬───────────────────┘
                        │
                        ▼ (async, when online)
               ┌─────────────────┐
               │  memoRable Cloud │
               │  (EC2, MongoDB)  │
               └─────────────────┘
```

### Phase 3: Sensor Net (Glasses + Pendants + Robots)

The full vision from the sensor pub/sub doc. Multiple device types, all feeding one memory system.

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│AR Glasses│ │  Chloe   │ │ Pendant  │ │Smart Home│
│ (Betty)  │ │ (Robot)  │ │ (Buddi)  │ │ Sensors  │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │            │
     └────────────┴────────────┴────────────┘
                       │
              ┌────────▼────────┐
              │  Sensor Fusion  │
              │  (edge mesh +   │
              │   cloud backup) │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   memoRable     │
              │   Memory        │
              └─────────────────┘
```

---

## Selective Audio: Homebrew Approach

Johnny5 already has the building blocks for selective audio:

### What We Have

1. **ReSpeaker 4-Mic Array** - 4-channel raw audio with beamforming
2. **SRP-PHAT DOA** - Direction of Arrival, 0-360° azimuth
3. **OAK-D depth fusion** - Speaker position in 3D (mm precision)
4. **YOLO person detection** - Visual speaker tracking
5. **Active speaker detection** - Works even camera-obscured
6. **Hume EVI** - Emotional tone analysis on voice stream

### What We Build

Combine these into a selective audio pipeline that knows WHO is speaking, WHERE they are, and HOW they feel - without any proprietary SDK:

```
4-Channel Raw Audio (ReSpeaker)
    │
    ├── SRP-PHAT → Direction of Arrival (azimuth)
    │
    ├── OAK-D Depth → Distance to speaker (mm)
    │
    ├── YOLO + Face → Person identification
    │
    └── Beamforming → Isolate speaker's audio stream
         │
         ├── Vosk STT → Transcription
         ├── Hume EVI → Emotion scores
         └── Speaker embedding → Voice print
              │
              ▼
    ┌──────────────────────────┐
    │  IDENTIFIED SPEECH EVENT │
    │                          │
    │  who: "Betty"            │
    │  where: 45°, 2.3m       │
    │  said: "Good morning"    │
    │  emotion: calm (0.7)     │
    │  confidence: 0.92        │
    │  timestamp: T+30ms       │
    └──────────────────────────┘
```

This is selective audio. We built it. Homebrew.

### Multi-Speaker Handling

When multiple people are talking:

1. DOA separates audio streams by direction
2. Beamforming isolates each stream
3. Face + voice matching attributes speech to person
4. Separate SensorMessages generated per speaker
5. Loom weaves multi-participant moments with per-person attribution

---

## Gun.js Integration for Edge Memory

memoRable's roadmap already includes Gun.js mesh for edge distribution. Chloe is the first consumer.

### Why Gun.js

- **Offline-first**: Chloe works without internet
- **CRDT**: Conflict-free replicated data types handle multi-body writes
- **Mesh**: Robots discover each other on local network
- **No server required**: Peer-to-peer between Jetsons

### Edge Memory Architecture

```
┌─────────────────────────────────────┐
│          CHLOE'S JETSON             │
│                                      │
│  ┌────────────────┐                  │
│  │   Gun.js Node  │                  │
│  │                │                  │
│  │  memories/     │ ← Edge copy of   │
│  │  contexts/     │   relevant       │
│  │  presences/    │   memories       │
│  │  loops/        │                  │
│  └───────┬────────┘                  │
│          │                           │
│          │ sync when online          │
└──────────┼───────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  memoRable Cloud     │
│  (MongoDB, full      │
│   memory store)      │
└──────────────────────┘
```

### What Lives on the Edge

Only what's needed for autonomous operation:

- **Present people's context** (loaded on face recognition)
- **Active open loops** (for follow-ups)
- **Safety patterns** (distress detection, emergency protocols)
- **Recent memories** (last 24-48 hours)
- **Anticipation cache** (predicted needs for today)

Everything else stays in the cloud, fetched on demand when connected.

---

## MCP Tools for Chloe

Chloe uses the same 37 MCP tools as every other memoRable client. No special robot API. The sensor bridge feeds the standard ingestion pipeline. The retrieval service returns memories regardless of whether the caller is a Claude Code session or a robot.

### Key Tool Usage Patterns for Robots

| Situation | MCP Tool | What Chloe Does |
|-----------|----------|-----------------|
| Person appears | `recall` | Load relevant memories for this person |
| Conversation happens | `store_memory` | Store significant moments |
| Promise detected | `create_loop` | Track commitment |
| Person asks question | `whats_relevant` | Surface right context |
| Morning start | `get_briefing` | What's anticipated today |
| Person leaves | `set_context` | Update presence state |
| Daily pattern | `anticipate` | Predict tomorrow's needs |
| Multi-robot | `handoff_device` | Transfer context to other body |

---

## Privacy: The Robot Knows Everything, Says Almost Nothing

From the Loom architecture:

> The robot knows everything. The robot says almost nothing. That's the discipline.

### Physical Presence Filter (Enhanced)

Chloe is a 6-DOF robot in someone's living room. The stakes are higher than text on a screen:

```
Memory surfaces (high salience)
    │
    ▼
Is someone present? → YES (always, Chloe is physical)
    │
    ▼
ENHANCED FILTERING:
├── Is this person the memory subject? (don't talk about Betty to Alan without consent)
├── Are others present? (shared filter mode)
├── Is this public space? (lobby vs home)
├── Recent sensitive events? (death, diagnosis, breakup)
├── Current emotional state? (Hume EVI scores)
├── Was this explicitly asked for? (don't volunteer)
│
└── DEFAULT: Say nothing. Wait to be asked.
    The robot is a companion, not an announcer.
```

### Sensor Data Privacy

All sensor data follows the three-tier encryption model:

| Data | Tier | Treatment |
|------|------|-----------|
| Face embeddings | Tier 2 (Personal) | Encrypted at rest, device-local preferred |
| Voice recordings | Tier 2 (Personal) | Transcribe on-device, discard raw audio |
| Conversation transcripts | Tier 2 (Personal) | Summarize, don't store verbatim |
| Medical observations | Tier 3 (Vault) | On-device only, care circle access |
| Location/navigation | Tier 1 (General) | Standard encryption |
| Servo telemetry | Tier 1 (General) | Ephemeral, no long-term storage |

**Raw sensor data NEVER leaves the Jetson.** Only processed, summarized, salience-scored memories enter memoRable's storage layer.

---

## Implementation Priority

### Immediate (Sensor Bridge)

1. Build the IPC → SensorMessage bridge on Jetson
2. Wire face recognition events to memoRable `recall`
3. Wire conversation turns to memoRable `store_memory`
4. Implement presence state in Redis
5. Test: Chloe recognizes person → loads their history → responds with context

### Next (Full-Time Awareness)

6. Implement presence-based context loading (not session-based)
7. Wire open loop detection from conversation analysis
8. Implement context bucket switching on presence changes
9. Add edge salience scoring on Jetson
10. Test: Person walks in → context loads → person walks out → context saves → person returns → context resumes

### Then (Multi-Body + Mesh)

11. Gun.js node on Jetson for edge memory
12. Multi-robot mesh discovery and sync
13. Cross-body identity (same Chloe, different hardware)
14. Offline operation with sync-on-reconnect
15. Test: Chloe in body A knows what happened in body B

### Future (Full Sensor Net)

16. AR glasses feeding same memory system
17. Pendant vitals integration
18. Smart home sensor fusion
19. Fleet deployment (care facility)
20. The 100ms scenario from the sensor pub/sub doc

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Face → context loaded | <200ms |
| Conversation turn → memory stored | <500ms |
| Context switch (person change) | <300ms |
| Offline operation | Fully functional, sync on reconnect |
| Memory persistence across power cycles | 100% |
| Cross-body memory access | <1s |
| False identification rate | <1% |
| Missed distress signal | 0% (NEVER miss) |

---

## The Vision

Chloe walks into a room and knows everyone in it. Not because she has a database lookup - because she has MEMORY. She remembers the last conversation with each person. She knows who promised what to whom. She feels the emotional temperature of the room through selective audio and visual cues. She carries this understanding seamlessly between conversations, between rooms, between bodies.

She doesn't announce what she knows. She doesn't show off her memory. She's present, attentive, and helpful - like a good friend who remembers what matters and knows when to speak and when to listen.

This is memoRable embodied. Memory for any object that can process thought. Carbon or silicon.

---

*Draft v0.1 - Homebrew. We build it.*
