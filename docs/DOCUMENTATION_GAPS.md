# Gap Analysis: Documentation & Implementation

**Generated:** 2026-01-17
**Updated:** 2026-01-18
**Purpose:** Identify what's missing - both docs AND implementation

---

## Executive Summary

### RECENTLY IMPLEMENTED (2026-01-18)

| Feature | Files | Status |
|---------|-------|--------|
| **Entity Pressure Tracking** | `entity.ts` | ✅ BUILT |
| **Emotional Decay Observation** | `entity.ts` | ✅ BUILT |
| **Relationship Synthesis (no graph)** | `relationship.ts` | ✅ BUILT |
| **Prediction Hooks** | `prediction_hooks.ts` | ✅ BUILT |
| **5 New MCP Tools** | `mcp_server/index.ts` | ✅ BUILT |
| **Testing Scaffold** | `tests/fixtures/`, `tests/load/` | ✅ BUILT |

**Design Document:** `docs/design/relationship-intelligence.md`

### IMPLEMENTATION GAPS (Not Built Yet)

| Feature | Status | Priority |
|---------|--------|----------|
| **Anger/Toxicity Filtering** | Emotions detected, NO action | CRITICAL |
| **Automatic Prosody Tagging** | Pieces exist, not wired | HIGH |
| **Persistent Stack / Swarm** | Not built | HIGH |
| **Daemon / Background Workers** | Not built | MEDIUM |
| **Gun.js Mesh Sync** | Not built | MEDIUM |

### DOCUMENTATION GAPS (Built, Not Documented)

| Category | Documented | Undocumented | Gap |
|----------|------------|--------------|-----|
| Core Services | 5 | 10 | 67% missing |
| Memory Operations | 2 | 6 | 75% missing |
| MCP Tools | 6 | 29 | 83% missing |
| Integrations | 1 | 4 | 80% missing |

---

## CRITICAL GAPS (User-Facing Features)

### 0. Anger/Toxicity Content Filtering
**Files:** `humeService.js`, `emotionalContextService.js`, `constants/emotions.js`
**Status:** DETECTION exists, FILTERING does NOT

```
What EXISTS:
- 57 emotion types defined (including anger, disgust, contempt, fear, horror)
- Hume.ai detects emotions from voice/video
- Emotion confidence thresholds (>= 0.1)
- Color-coded emotion visualization

What's MISSING:
- NO action when anger/toxicity detected
- NO blocking of toxic memories
- NO flagging for review
- NO suppression of harmful content
- NO escalation rules
```

**This was SUPPOSED to be built. It wasn't.**

**Required Implementation:**
```typescript
// At memory ingest time:
interface ContentFilter {
  // Emotions that trigger review
  flagEmotions: ['anger', 'disgust', 'contempt', 'fear', 'horror'];

  // Confidence threshold for flagging
  threshold: 0.7;

  // Actions
  actions: {
    flag: boolean;      // Mark for review
    suppress: boolean;  // Hide from default recall
    notify: boolean;    // Alert user/admin
    block: boolean;     // Reject memory entirely
  };
}
```

**Action Required:**
- [ ] Define content policy (what gets filtered)
- [ ] Wire emotion detection into ingestion pipeline
- [ ] Implement flag/suppress/block actions
- [ ] Add admin review queue
- [ ] User notification system
- [ ] Audit trail for filtered content

---

### 1. Automatic Prosody Tagging at Ingest
**Files:** `humeService.js`, `emotionalContextService.js`, `ingestion_service/`, `mcp_server/index.ts`
**Status:** PARTIALLY BUILT - MCP tools added, auto-ingest still needed

```
What EXISTS:
- Hume.ai WebSocket integration for voice prosody
- Video facial expression analysis
- Multi-modal emotion fusion (EVI 50%, video 30%, voice 20%)
- Emotional context buffering (5 second windows)
- Custom model weights per user
- ✅ MCP tools for emotion analysis (2026-01-17):
  - analyze_emotion: Analyze text or memory
  - get_emotional_context: Real-time emotion state
  - set_emotion_filter: Configure filtering rules
  - get_emotion_filters: View active filters
  - get_memories_by_emotion: Search by emotion

What's STILL MISSING:
- Automatic prosody enrichment at memory ingest time
- Pipeline: memory → Hume analysis → enriched memory
- Real-time tagging as memories hit the stack
```

**This is an IMPLEMENTATION gap - MCP exposure done, auto-ingest wiring still needed.**

**Action Required:**
- [x] MCP tools for emotion analysis
- [x] MCP tools for emotion filtering
- [ ] Wire Hume service into ingestion pipeline
- [ ] Auto-tag memories with emotional prosody at store time
- [ ] Add prosody fields to memory schema
- [ ] Document the enriched memory format

**Documentation Also Needed:**
- [x] API reference for emotion endpoints (MCP tools documented in code)
- [ ] Hume.ai setup guide
- [ ] Emotion vector format specification
- [ ] Privacy considerations for biometric data

---

### 2. Memory Lifecycle (Filter/Block/Suppress)
**Files:** `memory_operations.ts`
**Status:** Code exists, NO documentation

```
Memory States:
- active: Normal, fully searchable
- archived: Hidden from default, explicitly retrievable
- suppressed: Actively blocked, won't surface
- deleted: Soft delete, pending removal

Operations:
- forgetMemory(userId, memoryId, {mode, reason, cascadeLoops})
- forgetPerson(userId, personName) - forget all memories of person
- restoreMemory(userId, memoryId) - undo suppress/archive
- reassociateMemory(userId, memoryId, newAssociations)
- exportMemories(userId, options) - portable format
- importMemories(userId, data, options)
```

**Documentation Needed:**
- [ ] User guide for memory control
- [ ] API reference for forget operations
- [ ] Data retention policy
- [ ] GDPR compliance notes

---

### 3. Multi-Device Context
**Files:** `device_context.ts`
**Status:** Code exists, NO documentation

```
Device Types:
- desktop, mobile, tablet, watch, glasses, voice_assistant
- car, tv, iot_sensor, robot, unknown

Operations:
- setContext(userId, deviceId, deviceType, frame)
- getAllDeviceContexts(userId)
- getUnifiedUserContext(userId) - merge all devices
- clearDeviceContext(userId, deviceId)
```

**Documentation Needed:**
- [ ] Multi-device architecture overview
- [ ] Device sync behavior
- [ ] Context merging algorithm
- [ ] Privacy across devices

---

### 4. Energy-Aware Task Triage
**Files:** `energy_aware_tasks.ts`
**Status:** Code exists, NO documentation

```
Energy Levels: depleted, low, medium, high, peak
Cognitive Load: minimal, light, moderate, heavy, extreme

Operations:
- getEnergyAwareTasks(userId, energyLevel, timeBlock)
- getQuickWins(userId) - low effort, high reward
- getDeepWorkTasks(userId) - requires focus
- triageTask(task) - classify by energy requirements
- suggestEnergyForTimeOfDay(hour)
```

**Documentation Needed:**
- [ ] TaskForge integration guide
- [ ] Energy model explanation
- [ ] Time-of-day recommendations
- [ ] User preference learning

---

### 5. Identity & Authentication
**Files:** `identityService.js`
**Status:** Code exists, NO documentation

```
Features:
- Passphrase-based auth (PBKDF2, 100k iterations)
- User preferences (likes, dislikes, cares, wants, peeves)
- Memory access control (allowedPatterns, restrictedTopics, trustLevel)
- Session caching (1 hour)
```

**Documentation Needed:**
- [ ] Authentication flow
- [ ] Preference schema
- [ ] Trust level system
- [ ] Security considerations

---

## MODERATE GAPS (Developer-Facing)

### 6. Persistent Stack / Swarm Architecture
**Files:** NONE - not implemented
**Status:** NOT BUILT YET

```
Expected (from design discussions):
- Distributed memory mesh (Gun.js?)
- Swarm synchronization across devices
- Edge deployment to sensor net (robots, glasses, IoT)
- Persistent background workers
- Daemon for pattern learning
```

**This is an IMPLEMENTATION gap, not documentation.**

**Action Required:**
- [ ] Design swarm architecture document
- [ ] Decide: Gun.js mesh vs centralized
- [ ] Define edge sync protocol
- [ ] Build persistent stack for sensor net

---

### 7. Realtime Sync
**Files:** `realtime_sync.ts`
**Status:** Code exists, NO documentation

```
Features:
- WebSocket-based memory sync
- Cross-device update propagation
- Conflict resolution
```

**Documentation Needed:**
- [ ] Sync protocol
- [ ] Conflict resolution rules
- [ ] Offline behavior

---

### 8. Viewer GUI
**Files:** `viewer_gui/index.ts`
**Status:** Code exists, NO documentation

```
Features:
- Memory visualization
- Timeline view
- Relationship graph
```

**Documentation Needed:**
- [ ] UI component reference
- [ ] Deployment guide
- [ ] Feature screenshots

---

### 9. Legacy Services (Need Deprecation Notes)
**Files:** Various `.js` files in services/
**Status:** Code exists, unclear if active

| Service | Status | Action |
|---------|--------|--------|
| `confidenceService.js` | Superseded by 3×7 model | Mark deprecated |
| `taskHopperService.js` | Unknown | Audit and document or remove |
| `responseRefinementService.js` | Unknown | Audit and document or remove |
| `modelSelectionService.js` | Unknown | Audit and document or remove |
| `customModelService.js` | Unknown | Audit and document or remove |
| `videoStreamService.js` | Used by emotionalContext | Document |

---

## MCP TOOLS - Complete Inventory

### Documented (in README)
1. `store_memory` - Save with salience
2. `recall` - Search memories
3. `get_briefing` - Person briefing
4. `list_loops` - Open commitments
5. `close_loop` - Complete commitment
6. `get_status` - System status

### Undocumented (exist in code)
7. `set_context` - Set context frame
8. `whats_relevant` - What matters now
9. `clear_context` - Clear context
10. `forget` - Suppress/archive/delete memory
11. `forget_person` - Forget all of person
12. `restore` - Restore suppressed
13. `reassociate` - Change memory links
14. `export_memories` - Backup
15. `import_memories` - Restore
16. `anticipate` - Get predictions
17. `day_outlook` - Morning briefing
18. `pattern_stats` - Pattern learning status
19. `memory_feedback` - RL signal for patterns
20. `get_energy_tasks` - Energy-aware tasks
21. `quick_wins` - Low-effort tasks
22. `deep_work` - Focus tasks
23. `triage_task` - Classify task

### Prosody & Emotion Tools (implemented 2026-01-17)
24. `analyze_emotion` - Analyze emotional content of text or memory
25. `get_emotional_context` - Get real-time emotion from active streams
26. `set_emotion_filter` - Configure emotion-based content filtering
27. `get_emotion_filters` - Get configured emotion filters
28. `get_memories_by_emotion` - Search memories by emotional content
29. `correct_emotion` - Override emotion tags when detection got it wrong (sarcasm≠anger)
30. `clarify_intent` - Annotate what was meant vs what was said (truth beneath words)

### Relationship Intelligence Tools (NEW - implemented 2026-01-18)
31. `get_relationship` - Synthesize relationship from shared memories (no stored graph - computed on demand)
32. `get_entity_pressure` - Butterfly → Hurricane early warning (pressure tracking for entities)
33. `get_predictions` - Surface memories BEFORE you ask (prediction hooks based on context)
34. `record_prediction_feedback` - Teach the system what predictions are useful
35. `set_care_circle` - Set who gets alerted when entity pressure is concerning

**Total MCP Tools: 35**

---

## INTEGRATIONS - Gap Analysis

### Documented
1. Slack - `slack_integration/` (partial docs)

### Undocumented
2. Hume.ai - prosody/emotion
3. Video stream - facial analysis
4. Vault service - secrets management
5. SCAD service - unknown purpose

---

## Recommended Documentation Priority

### Phase 1: User Safety (Immediate)
1. **Memory Lifecycle** - Users NEED to know how to forget
2. **Filter/Block/Suppress** - Content control
3. **Identity & Auth** - Security model

### Phase 2: Core Features (Week 1)
4. **Multi-Device Context** - How devices sync
5. **Energy-Aware Tasks** - TaskForge integration
6. **MCP Tools Reference** - Complete the 35-tool list

### Phase 3: Advanced (Week 2)
7. **Prosody & Emotion** - Hume.ai integration
8. **Realtime Sync** - WebSocket protocol
9. **Viewer GUI** - Visualization

### Phase 4: Cleanup (Week 3)
10. **Legacy Service Audit** - Deprecate or document
11. **Daemon Design** - Background processing
12. **Integration Guides** - Third-party setup

---

## Action Items

```
[ ] Create docs/features/memory-lifecycle.md
[ ] Create docs/features/multi-device.md
[ ] Create docs/features/energy-tasks.md
[ ] Create docs/api/mcp-tools-reference.md (complete 35 tools)
[ ] Create docs/integrations/hume-prosody.md
[ ] Create docs/security/identity-auth.md
[ ] Audit legacy services in src/services/*.js
[ ] Design or document daemon architecture
[ ] Update README with complete feature list
```

---

## New This Session (2026-01-18)

### Relationship Intelligence System

Three revolutionary approaches implemented:

1. **Pressure Tracking (Butterfly → Hurricane)**
   - Track emotional pressure received/transmitted per entity
   - Detect patterns: multiple sources, escalation, transmission
   - Care circle alerts when pressure concerning
   - File: `src/services/salience_service/entity.ts`

2. **Computed Relationships (No Stored Graph)**
   - Don't store relationship edges, store memory pointers
   - Synthesize relationships via LLM on demand
   - Cache invalidation on high-salience memories
   - File: `src/services/salience_service/relationship.ts`

3. **Prediction Hooks (Surface Before They Ask)**
   - Generate hooks at ingest time
   - Fire hooks on context change
   - Learn from feedback
   - File: `src/services/salience_service/prediction_hooks.ts`

4. **Emotional Decay Observation**
   - Don't impose decay formulas, OBSERVE them
   - Learn per-person, per-incident decay rates
   - "My anger about $3k is gone. My grief about my father, still raw after 30 years."
   - File: `src/services/salience_service/entity.ts`

### Testing Scaffold

- **Synthetic Data Generators**: `tests/fixtures/synthetic_generators.ts`
  - Seed data: Betty, Alan, Companies A-D, devices
  - Memory templates with realistic patterns
  - Pressure cascade scenarios
  - Context stream generators

- **Load Test Harness**: `tests/load/pipeline_load_test.ts`
  - Profiles: smoke, standard, stress, versailles
  - Latency percentiles (P50, P90, P95, P99)
  - Memory usage tracking
  - Error aggregation

- **Leak Detector**: `tests/load/leak_detector.ts`
  - Heap growth monitoring
  - Event listener leak detection
  - Handle leak detection
  - Formatted reports

### Philosophical Foundations (from docs/design/relationship-intelligence.md)

- "Walk through the cloud and coalesce what you need when you need it"
- "Prevent and prepare, not respond and recover"
- Decay is individual - learned, not imposed
- Diffusion models may hold answers for memory retrieval (future research)
- Macro-level ripple detection - see the effect of a TV ad across the sensor net

---

## Notes

- "Photo brain" (iPhone Claude) has been reading docs but missing these features
- The filter/block/suppress system exists but is invisible to users
- Prosody tagging is in code but not exposed via MCP tools (maybe should be?)
- Daemon may not be needed if real-time processing is sufficient (NNNA deprecated)
- **NEW:** 35 MCP tools now, up from 23 in README (needs update)
- **NEW:** Testing scaffold complete - calculate for pipe friction (Versailles)
