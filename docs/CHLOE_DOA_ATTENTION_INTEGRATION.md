# Chloe: memoRable Memory Module — Modular Attention & Thread Integration

> She looks at you when she talks to you. She remembers what you said when she comes back. That's the whole trick.

**Status:** Integration Spec
**Date:** 2026-02-14
**Author:** Claude (from Alan's design direction)
**Related:** [CHLOE_COCKTAIL_PARTY_AWARENESS.md](./CHLOE_COCKTAIL_PARTY_AWARENESS.md), [CHLOE_SENSORY_MEMORY_INTEGRATION.md](./CHLOE_SENSORY_MEMORY_INTEGRATION.md)
**Johnny5 Source:** [Physical-Ai-Hack-2026](https://github.com/alanchelmickjr/Physical-Ai-Hack-2026)
**Target Hardware:** Jetson Orin 8GB, OAK-D Pro v3 (2-DOF gantry), ReSpeaker 4-Mic, 7" TFT display

---

## The Modular Boundary

Two systems. Clean interface. No overlap.

```
┌─────────────────────────────────┐  ┌────────────────────────────────┐
│  JOHNNY5 / CHLOE                │  │  memoRable                     │
│  (Physical-Ai-Hack-2026 repo)  │  │  (memoRable repo)              │
│                                 │  │                                │
│  OWNS:                          │  │  OWNS:                         │
│  ├── VLA (emotive response)     │  │  ├── Per-person threads        │
│  ├── Gantry / gaze control      │  │  ├── Thread state (Redis)      │
│  ├── DOA processing (ReSpeaker) │  │  ├── Memory recall per person  │
│  ├── Face ID (OAK-D + WhoAmI)  │  │  ├── Attention focus scoring   │
│  ├── STT (Whisper x2)          │  │  ├── Open loop tracking        │
│  ├── TTS (Hume EVI / Kokoro)   │  │  ├── Thread summarization      │
│  ├── TFT display / expressions  │  │  ├── Long-term memory store    │
│  ├── Arm gestures               │  │  └── Relationship context      │
│  ├── Wheel navigation           │  │                                │
│  └── All hardware drivers       │  │  DOES NOT OWN:                 │
│                                 │  │  ├── Gaze / servos             │
│  DOES NOT OWN:                  │  │  ├── Voice / TTS / STT         │
│  ├── Memory persistence         │  │  ├── Emotion / VLA             │
│  ├── Thread tracking            │  │  ├── Display / TFT             │
│  ├── Attention salience         │  │  └── Any hardware              │
│  └── Conversation history       │  │                                │
└────────────────┬────────────────┘  └───────────────┬────────────────┘
                 │                                    │
                 │         INTERFACE                   │
                 └────────────┬───────────────────────┘
                              │
                    IPC messages + Redis
                    (typed, minimal, fast)
```

**Chloe decides what to do.** memoRable tells her what she knows.

Chloe's VLA handles all emotive behavior, speech, gaze, gesture. memoRable handles memory, threads, attention focus. The interface between them is a set of IPC messages and Redis keys. Neither system reaches into the other.

---

## Hard Constraint: 2 Whisper Streams on 8GB Orin

```
Whisper (small.en): ~500MB VRAM per stream
Orin 8GB shared memory (CPU + GPU)

Max simultaneous Whisper instances: 2
├── Stream A: Active speaker (full STT)
├── Stream B: Second speaker (full STT)
└── Everyone else: VAD + keyword only (no Whisper)

This means: Chloe can fully transcribe 2 people at once.
A third person gets voice-activity detection only until
one of the first two stops talking.
```

**Party implication:** 2 active conversation threads with full transcription. A third person can talk but Chloe won't have a full transcript until a Whisper stream frees up. At the party, people address Chloe one at a time (Alan will tell them), so in practice only 1 Whisper stream is active and the second is standby for fast switching.

---

## What memoRable Provides (The Memory Module)

### 1. Per-Person Conversation Threads

When Chloe's Johnny5 stack identifies a speaker (via DOA + face ID), it sends the person's identity to memoRable. memoRable creates or resumes a thread.

```typescript
// memoRable's thread state per person (stored in Redis)
interface ConversationThread {
  threadId: string;
  personId: string;          // WhoAmI face embedding ID
  personName?: string;       // Known name
  status: 'active' | 'paused' | 'concluded';

  // What was said (rolling buffer)
  recentTurns: Array<{
    speaker: 'person' | 'chloe';
    text: string;
    timestamp: string;
  }>;
  maxTurns: number;          // Default 50

  // Context from memoRable
  topic?: string;            // LLM-extracted, updated periodically
  loadedMemories: string[];  // Memory IDs surfaced for this person
  activeLoops: string[];     // Open loops involving this person
  relationshipSummary?: string; // Brief relationship context

  // Timing
  startedAt: string;
  lastActivity: string;
  pausedAt?: string;

  // Attention
  threadSalience: number;    // 0-100, how important right now
}
```

### 2. Attention Focus Scoring

memoRable scores which thread deserves focus. Chloe's VLA uses this to decide *who to address* when nobody is actively speaking to her.

```
THREAD SALIENCE (what memoRable computes):

1. RECENCY (40%)   — Who spoke to Chloe most recently?
2. LOOPS (25%)     — Does this person have pending open loops?
3. HISTORY (20%)   — How deep is the relationship?
4. URGENCY (15%)   — Time-sensitive topics? Emotional signals?

memoRable returns a ranked list:
  [ { personId: "dave", salience: 82 },
    { personId: "sarah", salience: 67 },
    { personId: "mike", salience: 45 } ]

Chloe's VLA decides what to DO with this ranking.
memoRable just provides it.
```

### 3. Memory Recall Per Person

When a person appears (face recognized), memoRable loads their context:

```
recall(personId: "dave") →
  {
    recentMemories: [
      "Dave visited Alan's workshop on Jan 15",
      "Dave is interested in robotics",
      "Dave promised to bring solder wire"
    ],
    openLoops: [
      { content: "Dave said he'd bring solder wire", status: "open" }
    ],
    relationshipHealth: 0.72,
    lastInteraction: "2026-01-15T14:30:00Z"
  }
```

This gives Chloe context before the person even speaks. When Dave says "Hey Chloe!", she already knows who he is and what they talked about last time.

### 4. Thread Pause / Resume

When Chloe switches from Dave to Sarah:
- Dave's thread → `status: 'paused'`, `pausedAt: now`
- All of Dave's recentTurns preserved in Redis
- Sarah's thread → `status: 'active'` (created or resumed)

When Dave speaks again:
- Sarah's thread → `status: 'paused'`
- Dave's thread → `status: 'active'`, recentTurns intact
- **Re-entry brief available:** "Dave was talking about Valentine's Day. Tone: friendly. No open items."

### 5. Thread → Memory on Conclusion

When a conversation ends (person leaves, or party is over):
- Thread summarized by LLM
- Significant moments extracted → `store_memory`
- Open loops captured → `create_loop`
- Thread archived, Redis key expires

---

## The Interface: IPC Messages

Johnny5 already has an IPC message bus with namespaced topics. memoRable connects via a lightweight bridge process that publishes/subscribes on this bus.

### Messages FROM Johnny5 TO memoRable

```
Topic: memorable.person_appeared
Payload: { personId, name?, azimuth, distance, timestamp }
When: OAK-D recognizes a face

Topic: memorable.speech_turn
Payload: { personId, text, timestamp, whisperStream: 0|1 }
When: Whisper completes a transcription for a speaker

Topic: memorable.person_departed
Payload: { personId, timestamp }
When: Person leaves OAK-D field of view for >10s

Topic: memorable.attention_switched
Payload: { fromPersonId, toPersonId, reason: 'spoke'|'gaze'|'salience' }
When: Chloe's VLA switches active speaker
```

### Messages FROM memoRable TO Johnny5

```
Topic: memorable.context_loaded
Payload: { personId, memories[], openLoops[], relationshipSummary, salience }
When: Person context loaded after person_appeared

Topic: memorable.thread_state
Payload: { personId, threadId, recentTurns[], topic?, reentryBrief? }
When: Thread created, resumed, or updated

Topic: memorable.attention_ranking
Payload: { ranked: [{ personId, salience }] }
When: Salience scores change (periodic, every 5s)

Topic: memorable.loop_detected
Payload: { personId, loopContent, loopId }
When: Open loop detected in conversation (async)
```

### Redis Keys (Shared State)

```
# Thread state (memoRable writes, Johnny5 reads)
chloe:thread:{personId}           → ConversationThread JSON
chloe:thread:ranking              → Sorted set of personId by salience

# Presence (Johnny5 writes, memoRable reads)
chloe:presence:{personId}         → { azimuth, distance, lastSeen }
chloe:presence:active             → Set of currently visible personIds

# Whisper allocation (Johnny5 writes, memoRable reads)
chloe:whisper:stream0             → personId currently on stream 0
chloe:whisper:stream1             → personId currently on stream 1
```

---

## DOA → Gaze: Johnny5's Domain

This is explicitly NOT memoRable's job. Documenting it here only to show the full picture.

Johnny5's `head_tracker.py` already does DOA → gantry tracking:
- `doa_reader.py` — ReSpeaker SRP-PHAT, azimuth every ~10ms
- `doa_spatial_fusion.py` — DOA + OAK-D depth fusion
- `head_tracker.py` — DOA → gantry servo commands

memoRable's only involvement: providing the **attention ranking** so that when nobody is speaking, Chloe's VLA knows which direction to "look" (toward the highest-salience person). The gantry command itself is Johnny5's.

```
When someone speaks:
  Johnny5 DOA → head_tracker → gantry snaps to speaker
  (memoRable not involved in gaze)

When nobody speaks:
  memoRable attention_ranking → Johnny5 VLA decides →
  head_tracker → gantry sweeps toward highest-salience person
  (memoRable provides data, Johnny5 acts)
```

---

## The Party Scenario: 3 People, 1 Chloe

```
Physical layout (bird's-eye):

         ┌─────────┐
         │ 7" TFT  │
         │ (Chloe) │
         └────┬────┘
              │
    30°       │        330°
  Dave ●      │      ● Sarah
              │
         60°  │
         Mike ●
              │
           (front)

3 people. All in the OAK-D field of view.
They address Chloe one at a time.
```

### Flow

```
T=0:00  Party. 3 people approach.
        Johnny5: OAK-D sees 3 faces → publishes person_appeared x3
        memoRable: loads context for Dave, Sarah, Mike
          → publishes context_loaded x3 with memories, loops
        Johnny5 VLA has full background on all 3 before anyone speaks.

T=0:15  Dave: "Hey Chloe, happy Valentine's Day!"
        Johnny5: Whisper stream 0 → transcribes Dave
          → publishes speech_turn { personId: "dave", text: "..." }
          → head_tracker snaps gantry to 30° (Dave)
        memoRable: creates thread for Dave
          → appends turn to Dave's recentTurns
          → publishes thread_state for Dave
        Johnny5 VLA: generates response using Dave's context
        Chloe: "Happy Valentine's Day, Dave!"

T=0:45  Sarah: "Chloe, do you remember me?"
        Johnny5: Whisper stream 0 → switches to Sarah's direction
          → publishes attention_switched { from: dave, to: sarah }
          → publishes speech_turn { personId: "sarah", text: "..." }
          → head_tracker snaps gantry to 330° (Sarah)
        memoRable: pauses Dave's thread, creates Sarah's thread
          → publishes thread_state for Sarah (with re-entry brief for Dave)
        Johnny5 VLA: uses Sarah's loaded context
        Chloe: "Of course, Sarah! We met at Alan's workshop."

T=1:30  Dave: "Chloe, what were we talking about?"
        Johnny5: DOA detects Dave at 30°
          → publishes attention_switched { from: sarah, to: dave }
          → head_tracker snaps to 30°
        memoRable: pauses Sarah's thread, RESUMES Dave's thread
          → Dave's recentTurns still there: "Happy Valentine's Day" exchange
          → publishes thread_state with full context
        Johnny5 VLA: has Dave's thread, generates contextual response
        Chloe: "You wished me happy Valentine's Day! How's your evening?"
```

**The magic moment:** Chloe turns back to Dave, and memoRable hands her the full thread. She doesn't skip a beat. The memory module gave her everything she needed. The VLA decided how to respond. Clean separation.

---

## Whisper Stream Allocation

```
2 Whisper streams. 3 people. Allocation strategy:

RULE: Active speaker always gets a Whisper stream.

Stream 0: Whoever is currently speaking to Chloe
Stream 1: Standby — pre-allocated to the most-likely-next speaker
           (highest salience person who isn't currently active)

When speaker switches:
  1. Stream 0 finishes current transcription (flush)
  2. Stream 0 re-targets new speaker's direction (beamform)
  3. Stream 1 moves to next-most-likely speaker

If two people talk simultaneously:
  Stream 0: Higher salience person
  Stream 1: Lower salience person
  Third person: VAD only (detect voice, no transcript)
  → When one finishes, stream freed for third

At the party, people address Chloe one at a time.
In practice: 1 active stream, 1 standby. Plenty of headroom.
```

---

## Compute Budget (Revised for 2 Whisper Streams)

```
ALWAYS RUNNING:
├── OAK-D face detection + WhoAmI       ~1.5 GB
├── ReSpeaker DOA (SRP-PHAT)            ~50 MB (CPU)
├── Whisper small.en stream 0            ~500 MB
├── Whisper small.en stream 1 (standby)  ~500 MB
├── Gantry servo control                 ~10 MB (CPU)
├── TFT display                          ~100 MB
├── Redis (thread state)                 ~50 MB
└── memoRable bridge process             ~100 MB (CPU)

BASELINE: ~2.8 GB

VLA / RESPONSE GENERATION:
├── Hume EVI (cloud)                     0 local
├── Response gen (cloud API)             0 local
├── OR Ollama local fallback             ~2 GB
└── OR Kokoro TTS local fallback         ~500 MB

WORST CASE (all local): ~5.3 GB of 8 GB → FITS
TYPICAL (cloud voice):  ~2.8 GB of 8 GB → COMFORTABLE

Room for 3 people: YES
Room for 4 people: YES (only 2 get full Whisper, others get VAD)
```

---

## What memoRable Needs to Implement

### In the memoRable Repo (This Repo)

1. **Conversation Thread Service** — CRUD for per-person threads in Redis
   - `createThread(personId)` → new thread
   - `appendTurn(personId, speaker, text)` → add to recentTurns
   - `pauseThread(personId)` → set status paused, save state
   - `resumeThread(personId)` → set status active, return state
   - `concludeThread(personId)` → summarize, store to MongoDB, expire Redis key
   - `getReentryBrief(personId)` → 2-3 sentence summary of paused thread
   - `getAttentionRanking()` → sorted list of personIds by salience

2. **IPC Bridge** — Lightweight process subscribing to Johnny5's IPC bus
   - Listens for: `memorable.person_appeared`, `memorable.speech_turn`, `memorable.person_departed`, `memorable.attention_switched`
   - Publishes: `memorable.context_loaded`, `memorable.thread_state`, `memorable.attention_ranking`, `memorable.loop_detected`
   - Translates between IPC format and memoRable's internal API

3. **Party Mode Context Loader** — Fast-path for loading person context
   - Pre-loads context for all visible people on `person_appeared`
   - Caches in Redis for <50ms retrieval
   - Uses existing `recall`, `getOpenLoops`, `getRelationshipPattern`

### In the Johnny5 Repo (NOT This Repo)

4. **memoRable IPC subscriber** — Listens for memoRable messages
5. **VLA integration** — Feeds thread context into response generation
6. **Whisper stream manager** — Allocates 2 streams by DOA direction
7. **Head tracker enhancement** — Uses attention ranking for idle gaze

---

## What This Does NOT Cover

**Covered in Alan's design docs:**
- Full sensor bridge architecture (CHLOE_SENSORY_MEMORY_INTEGRATION.md)
- Cross-conversation bridging (CHLOE_COCKTAIL_PARTY_AWARENESS.md)
- Multi-body continuity, Gun.js mesh, privacy filtering

**Chloe's domain (Johnny5 repo):**
- VLA emotive response system
- TFT expression rendering
- Gesture generation
- Voice synthesis / emotion
- All hardware drivers

---

## Success Criteria for Valentine's Day

| What Happens | memoRable's Job | Johnny5's Job |
|---|---|---|
| Person appears | Load their memory context | Recognize face, publish ID |
| Person speaks | Create/resume thread, store turns | Whisper STT, DOA tracking |
| Switch to new person | Pause old thread, resume new, provide re-entry brief | Snap gantry, switch Whisper stream |
| Return to first person | Thread intact, full context available | Snap gantry back, VLA responds with context |
| Nobody speaking | Provide attention ranking | VLA decides where to look |
| Party ends | Summarize all threads → long-term memory | Power down gracefully |

**The one metric:** When Chloe turns back to you, does she remember what you said? If yes, memoRable did its job.

---

*Modular. memoRable remembers. Chloe acts. No overlap.*
