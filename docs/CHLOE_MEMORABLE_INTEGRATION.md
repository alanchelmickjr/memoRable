# Chloe <-> MemoRable Integration Contract

> Stop designing what already exists. Define the seam. Wire the pipe.

**Status:** Specification
**Date:** 2026-02-14
**For:** Both repos — [Physical-Ai-Hack-2026](https://github.com/alanchelmickjr/Physical-Ai-Hack-2026) and [memoRable](https://github.com/alanchelmickjr/memoRable)

---

## The Overlap Problem

We have been designing the same capabilities in both repos. This stops now.

| Capability | Chloe (robot repo) | memoRable (memory repo) | Who Owns It |
|---|---|---|---|
| DOA reading | `doa_reader.py` (BUILT) | Cocktail Party doc re-describes it | **Chloe** |
| Speaker identification | `speaker_fusion.py` (BUILT) | Cocktail Party doc re-designs it | **Chloe** |
| Spatial tracking | `spatial_tracker.py` (BUILT) | Sensory doc re-architects it | **Chloe** |
| DOA + depth fusion | `doa_spatial_fusion.py` (BUILT) | Sensory doc re-specifies it | **Chloe** |
| Head tracking | `head_tracker.py` (BUILT) | Not in memoRable | **Chloe** |
| IPC message bus | `ipc/bus.py` (BUILT) | Sensory doc designs a "Sensor Bridge" | **Chloe** |
| Context frames | Not in Chloe | `context_frame.ts` (BUILT) | **memoRable** |
| Attention window | Not in Chloe | `attention_manager.ts` (BUILT) | **memoRable** |
| Salience scoring | Not in Chloe | `salience_calculator.ts` (BUILT) | **memoRable** |
| Open loop tracking | Not in Chloe | `open_loop_tracker.ts` (BUILT) | **memoRable** |
| Relationship intelligence | Not in Chloe | salience service (BUILT) | **memoRable** |
| Temporal decay | Not in Chloe | `temporal_decay.ts` (BUILT) | **memoRable** |
| MemoRable REST client | `tools/memorable_client.py` (BUILT) | API endpoint (BUILT) | **Shared** |
| Conversation thread tracking | Not built anywhere | Designed in Cocktail Party doc | **Chloe** (state) + **memoRable** (memory) |
| Multi-conversation attention | Not built anywhere | Designed in Cocktail Party doc | **Split** (see below) |

**Rule: If Chloe already built it, memoRable doesn't redesign it. If memoRable already built it, Chloe calls the API.**

---

## The Contract: One Seam, One Protocol

Chloe and memoRable talk through exactly ONE interface: **the MemoRable MCP/REST API**.

No sensor data crosses this boundary. No raw audio. No DOA angles. No YOLO detections. What crosses is **meaning**: who spoke, what they said, how they felt, what it means.

```
┌─────────────────────────────────────────────────────┐
│                   CHLOE (Jetson Orin)                │
│                                                      │
│  HARDWARE          FUSION              COGNITION     │
│  ┌──────────┐     ┌──────────────┐    ┌───────────┐ │
│  │ReSpeaker │────>│speaker_fusion│───>│Conversation│ │
│  │OAK-D     │────>│doa_spatial   │    │ Manager    │ │
│  │Servos    │     │spatial_tracker│    │ (NEW)      │ │
│  └──────────┘     └──────────────┘    └─────┬─────┘ │
│                                              │       │
│                         Structured events only│       │
│                         (not raw sensor data) │       │
└──────────────────────────────────────────────┼───────┘
                                               │
                    ┌──────────────────────────┐│
                    │   memorable_client.py     ││
                    │   (already exists)        │◄── THE SEAM
                    └──────────────┬────────────┘
                                   │
                    MCP/REST API calls only
                    store_memory, recall, set_context,
                    whats_relevant, get_briefing, etc.
                                   │
                                   ▼
┌──────────────────────────────────────────────────────┐
│                  memoRable (Cloud/Edge)               │
│                                                       │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Ingestion  │ │  Salience    │ │  Attention     │  │
│  │ Pipeline   │ │  Calculator  │ │  Manager       │  │
│  └────────────┘ └──────────────┘ └────────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ Context    │ │  Open Loop   │ │  Relationship  │  │
│  │ Frame      │ │  Tracker     │ │  Intelligence  │  │
│  └────────────┘ └──────────────┘ └────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## What Chloe Owns (Robot Repo)

### Already Built
- **DOA reading** — `doa_reader.py` reads XMOS XVF-3000 via USB HID at 30Hz
- **Spatial tracking** — `spatial_tracker.py` runs YOLO + stereo depth on OAK-D VPU
- **DOA-depth fusion** — `doa_spatial_fusion.py` matches DOA angle to 3D person detections
- **Speaker fusion** — `speaker_fusion.py` combines face + voice + DOA into identified speakers
- **Head tracking** — `head_tracker.py` makes the robot look at whoever is talking
- **IPC bus** — `ipc/bus.py` with typed channels for voice/vision/audio/sensor/actuator
- **MemoRable client** — `tools/memorable_client.py` async REST client
- **Voice subsystem** — Hume EVI (cloud) with Kokoro/Vosk/Ollama local fallback
- **Recognition handler** — `tools/recognition_handler.py` bridges EVI tools to speaker fusion

### Needs to Be Built (in robot repo)

**1. ConversationManager** — The missing cognitive layer

This is the piece from the Cocktail Party doc that belongs in Chloe, NOT in memoRable. It manages live conversation state on the Jetson.

```python
# NEW FILE: conversation_manager.py
# Lives in Physical-Ai-Hack-2026 repo

class ConversationThread:
    """A live, tracked conversation between identified people."""
    thread_id: str
    participants: list[Speaker]        # From speaker_fusion.py
    status: str                        # 'active' | 'paused' | 'concluded'
    recent_turns: list[Turn]           # Rolling buffer (max 50)
    topic: str | None                  # LLM-extracted
    emotional_tone: str | None         # From Hume EVI
    spatial_cluster_azimuth: float     # Center direction of this group
    chloe_engagement: str              # 'participating' | 'monitoring' | 'ambient'
    thread_salience: float             # 0-100
    started_at: str
    last_activity: str

class ConversationManager:
    """Tracks multiple simultaneous conversations using existing sensor fusion."""

    def __init__(self, speaker_fusion, spatial_tracker, memorable_client):
        self.threads: dict[str, ConversationThread] = {}
        self.fusion = speaker_fusion       # ALREADY EXISTS
        self.tracker = spatial_tracker     # ALREADY EXISTS
        self.memory = memorable_client     # ALREADY EXISTS

    # --- Thread lifecycle (uses existing IPC bus events) ---

    def on_speaker_detected(self, speaker: Speaker):
        """IPC callback: audio.speaker_identified
        Groups speaker into existing thread or creates new one."""

    def on_speaker_silent(self, speaker_id: str, duration: float):
        """IPC callback: audio.vad goes false for a tracked speaker.
        If all participants silent >30s, pause thread."""

    def on_person_departed(self, person_id: str):
        """IPC callback: vision.person_lost
        Mark participant as departed. If last participant, conclude thread."""

    # --- Spatial clustering (uses existing doa_spatial_fusion) ---

    def cluster_speakers(self) -> list[list[Speaker]]:
        """Group speakers within 2m into conversation clusters.
        Uses spatial_tracker.get_detections() for 3D positions.
        No new hardware needed — this is software over existing data."""

    # --- Attention allocation ---

    def get_active_thread(self) -> ConversationThread | None:
        """The one thread Chloe is participating in."""

    def get_monitored_threads(self) -> list[ConversationThread]:
        """Threads Chloe is tracking but not speaking in (max 3)."""

    def should_switch_attention(self) -> ConversationThread | None:
        """Checks if a monitored thread's salience exceeds active thread.
        Trigger: name called, distress, high-salience topic."""

    # --- MemoRable integration (uses existing memorable_client.py) ---

    async def on_thread_created(self, thread: ConversationThread):
        """Load participant context from memoRable."""
        for p in thread.participants:
            if p.name:
                await self.memory.on_person_recognized(p.name, p.face_embedding)

    async def on_thread_concluded(self, thread: ConversationThread):
        """Store conversation summary in memoRable."""
        summary = self._summarize(thread)
        await self.memory.store(summary, entities=[p.name for p in thread.participants])

    async def on_commitment_detected(self, thread: ConversationThread, text: str):
        """Detected 'I'll bring the cake' — create open loop in memoRable."""
        await self.memory.store(text, metadata={"type": "commitment"})
```

**2. Perceptual Attention Tier System**

The three tiers (participating/monitoring/ambient) run ON the Jetson as a compute budget allocator. This is NOT a memoRable concern — it's about how much Jetson GPU/CPU to spend per audio stream.

```python
# NEW FILE: attention_tiers.py
# Lives in Physical-Ai-Hack-2026 repo

class AttentionTier(Enum):
    PARTICIPATING = "participating"   # Full STT + emotion + response gen
    MONITORING = "monitoring"         # STT + keyword spotting
    AMBIENT = "ambient"               # VAD + wake word only

class PerceptualAttention:
    """Allocates Jetson compute across conversation threads."""

    def __init__(self, conversation_manager):
        self.cm = conversation_manager

    def allocate(self) -> dict[str, AttentionTier]:
        """Assign tier to each thread based on thread_salience.
        Max 1 PARTICIPATING, max 3 MONITORING, rest AMBIENT."""

    def promote(self, thread_id: str):
        """Promote thread tier (ambient -> monitoring -> participating).
        Triggered by: name called, distress, salience spike."""

    def demote(self, thread_id: str):
        """Demote thread tier. Triggered by: silence, low salience."""
```

**3. ODAS Integration (replaces single-source DOA firmware)**

The built-in ReSpeaker firmware (`doa_reader.py`) tracks ONE speaker. For multi-conversation, replace with ODAS which tracks up to 4.

```python
# MODIFY: microphones/respeaker.py or NEW: microphones/odas.py
# Lives in Physical-Ai-Hack-2026 repo

class ODASMicrophone(MicrophoneArray):
    """ODAS-based multi-source DOA tracking.
    Replaces single-source XMOS firmware DOA for party scenarios.
    ODAS runs as separate C process, this reads its JSON output."""

    mic_type = MicrophoneType.ODAS

    def read_doa_raw(self) -> list[DOAReading]:
        """Returns up to 4 DOA sources with confidence."""

    def get_separated_streams(self) -> list[AudioStream]:
        """Returns beamformed audio per tracked source."""
```

---

## What MemoRable Owns (This Repo)

### Already Built
- Salience scoring (5 components, real-time at ingest)
- Attention window (Redis sorted set, threshold-based)
- Context frames (multi-dimensional, device-aware)
- Context integration ("thalamus" — fuses multiple device inputs)
- Open loop tracker
- Temporal decay
- Relationship intelligence
- Anticipation (21-day pattern learning)
- Session continuity + device handoff
- 37 MCP tools
- REST API with auth (challenge-response)

### Needs to Be Built (in this repo)

**1. Robot-optimized API endpoints**

The existing `memorable_client.py` in the robot repo already calls the REST API. What memoRable needs are endpoints tuned for the robot's access patterns:

```
POST /context/presence          # Person appeared/departed (fast, <50ms)
POST /memory/conversation       # Store conversation summary on conclude
POST /memory/commitment         # Open loop from detected commitment
GET  /context/people?ids=X,Y    # Batch load context for multiple present people
GET  /attention/threads         # What memories are relevant to THESE people NOW
```

These are thin wrappers over existing services — not new logic. The salience calculator, attention manager, and context frame system already do the work. These endpoints just expose the right access pattern for a robot that needs fast presence-triggered context loading.

**2. Conversation-aware memory surfacing**

When Chloe creates a ConversationThread with participants [Betty, Margaret], memoRable should surface:
- Recent memories involving Betty AND Margaret together
- Open loops for each participant
- Relationship state between them
- Cross-conversation relevance (if Betty's thread topic matches Margaret's thread topic)

This uses existing `whats_relevant` + `get_briefing` + `recall` — possibly a composite endpoint that batches them.

---

## What NEITHER Repo Should Build

These capabilities exist in hardware or open-source and should not be reimplemented:

| Capability | Use This | Don't Build |
|---|---|---|
| Multi-source DOA | ODAS (C, open source) | Custom SRP-PHAT in Python |
| Speaker separation | ODAS beamforming + SpeechBrain cleanup | Custom beamformer |
| Face recognition | WhoAmI + DeepFace (already working) | New face pipeline |
| Speech-to-text | Vosk/Whisper (already working) | Custom STT |
| Emotion from voice | Hume EVI (already working) | Custom emotion model |

---

## The Wire: IPC Events -> ConversationManager -> MemoRable API

The IPC bus already publishes these events. The ConversationManager subscribes and translates to memoRable API calls:

```
IPC EVENT                          CONVERSATION MANAGER              MEMORABLE API CALL
─────────────────────────────────────────────────────────────────────────────────────
audio.speaker_identified           cluster_speakers()                (none — local state)
  {speaker_id, azimuth, name}      assign to thread

vision.face_recognized             on_thread_created() if new        recall(person_name)
  {person_id, name, embedding}     thread with this person           get_briefing(person_name)

voice.conversation_turn            append to thread.recent_turns     (none — local buffer)
  {speaker_id, text, emotion}      check for commitments             store if commitment detected

voice.emotion_state                update thread.emotional_tone      (none — local state)
  {valence, arousal, dominant}     promote if distress

vision.person_lost                 on_person_departed()              (none yet)
  {person_id}                      if last person, conclude thread   store conversation summary

audio.vad = false (>30s)           pause thread                      (none — local state)

[chloe internal]                   on_thread_concluded()             store_memory(summary)
  thread concluded                 extract commitments               create open loops
```

---

## Identity: One System, Not Three

The `DUPLICATES_AND_OVERLAP.md` in the robot repo already flags this:

> Identity Storage has 2 systems: self-identity (`~/whoami/self_identity.pkl`) and face recognition (`~/whoami/last_seen.pkl`), neither integrated with MemoRable.

**Decision: MemoRable is the identity store. Period.**

- Face embeddings -> memoRable `remember_person()` (already in `memorable_client.py`)
- Voice embeddings -> memoRable `remember_person()` (extend to accept voice embeddings)
- Last seen -> memoRable context frame (already tracks presence)
- Self identity -> memoRable entity for "chloe" (already exists as entity concept)
- `.pkl` files -> cache only, memoRable is source of truth
- Gun.js -> edge sync/offline cache of memoRable data, not a separate identity store

This eliminates the 3-system identity problem (pkl files, Gun.js, memoRable) by making memoRable authoritative and everything else a cache.

---

## ReSpeaker 4-Mic: What's Actually Possible for Party Mode

Based on hardware research:

| Parameter | 4-Mic Array (current) | 6-Mic Array (upgrade option) |
|---|---|---|
| Simultaneous sources (ODAS) | 2-3 reliable | 3-4 reliable |
| Angular resolution | ~25-30 degrees | ~15-20 degrees |
| Beamformed stream quality | Moderate cross-talk | Better isolation |
| Cost | Already have it | ~$35 (ReSpeaker 6-Mic Circular) |
| ODAS config available | Yes | Yes |

**For 2-3 party conversations with the 4-mic array:**
- ODAS tracks up to 4 sources (Kalman-filtered)
- Speakers must be >25 degrees apart (typical at a party — groups cluster spatially)
- OAK-D visual tracking resolves ambiguity when DOA is close
- Beamformed audio per source has cross-talk — use neural cleanup (SpeechBrain) or accept partial
- The combo of DOA + face + voice embedding is enough for attribution even with audio bleed

**Recommendation:** Start with 4-mic + ODAS. If the angular resolution is insufficient in testing, the 6-mic is a drop-in replacement (same USB interface, ODAS has config for it, `MicrophoneArray` base class already supports both via `MicrophoneType` enum).

---

## Implementation Order

### Phase 1: Wire What Exists (no new hardware, no new memoRable features)

1. Deploy memoRable MCP server (get it responding on EC2)
2. Verify `memorable_client.py` connects and authenticates
3. Wire `vision.face_recognized` IPC event -> `memorable_client.on_person_recognized()`
4. Wire conversation end -> `memorable_client.on_conversation_end()`
5. Wire startup -> `memorable_client.on_startup()`
6. **Test:** Chloe recognizes Betty -> loads her history from memoRable -> responds with context

### Phase 2: Conversation Manager (new Chloe code, no new memoRable features)

7. Build `ConversationManager` class (subscribes to existing IPC events)
8. Build spatial clustering over existing `spatial_tracker.get_detections()`
9. Single-thread first: one ConversationThread per active conversation
10. Store conversation summaries in memoRable on conclude
11. **Test:** Chloe has conversation with Betty -> conversation ends -> summary stored -> next day Chloe recalls it

### Phase 3: ODAS Multi-Source (new hardware integration)

12. Install ODAS on Jetson, configure for ReSpeaker 4-mic
13. Build `ODASMicrophone` adapter implementing `MicrophoneArray` interface
14. Multi-source DOA feeds into ConversationManager spatial clustering
15. Build `AttentionTiers` compute allocator
16. **Test:** Two groups talking -> Chloe tracks both -> participates in one, monitors the other

### Phase 4: Cross-Conversation Intelligence (new memoRable + Chloe features)

17. Build cross-thread relevance in ConversationManager (compare topics across threads)
18. Build batch context endpoint in memoRable (`/context/people`)
19. Wire open loop detection from conversation turns
20. **Test:** Betty mentions roses in Thread A, Margaret mentions garden in Thread B -> Chloe bridges them

---

## What This Doc Replaces

The following docs in memoRable have **overlap with what Chloe already built**. They remain valid as design vision but should NOT be implemented as-is. This doc is the implementation contract:

- `CHLOE_COCKTAIL_PARTY_AWARENESS.md` — Vision doc. The ConversationThread design is good. The hardware/DOA sections duplicate what Chloe already has.
- `CHLOE_SENSORY_MEMORY_INTEGRATION.md` — Vision doc. The "Sensor Bridge" section duplicates Chloe's IPC bus. The memory integration patterns are the useful part.

**The rule going forward:** If it touches hardware or sensor processing, it's a Chloe concern. If it touches memory, salience, or context, it's a memoRable concern. The seam is `memorable_client.py`.

---

## File Map: What Goes Where

```
Physical-Ai-Hack-2026/              memoRable/
├── conversation_manager.py  (NEW)   ├── src/services/mcp_server/    (EXISTS)
├── attention_tiers.py       (NEW)   ├── src/services/salience_service/
├── microphones/odas.py      (NEW)   │   ├── attention_manager.ts    (EXISTS)
├── doa_reader.py            (EXISTS)│   ├── context_frame.ts        (EXISTS)
├── doa_spatial_fusion.py    (EXISTS)│   ├── salience_calculator.ts   (EXISTS)
├── speaker_fusion.py        (EXISTS)│   └── open_loop_tracker.ts    (EXISTS)
├── spatial_tracker.py       (EXISTS)├── docs/
├── head_tracker.py          (EXISTS)│   └── CHLOE_MEMORABLE_INTEGRATION.md (THIS)
├── ipc/bus.py               (EXISTS)│
├── tools/memorable_client.py(EXISTS)│
└── tools/recognition_handler.py     │
                                     └── API endpoints (enhance for robot patterns)
```

---

*No overlap. No redesign. One seam. Wire the pipe.*
