# MemoRable Wiring Status

**Generated:** 2026-01-21
**Last Updated:** 2026-01-21 (TierManager + AppropriatenessFilter + import_memories wiring)
**Purpose:** Track what's implemented, wired, vs placeholder

---

## Data Flow Architecture

```
                              INGEST FLOW
                              ───────────
store_memory()
    │
    ├──▶ MongoDB (memories collection)     ✅ WIRED
    │
    ├──▶ Salience Calculator               ✅ WIRED
    │         └──▶ Feature Extractor       ✅ WIRED
    │
    ├──▶ Open Loop Tracker                 ✅ WIRED
    │
    ├──▶ Emotion Analyzer (Hume.ai)        ✅ WIRED
    │         └──▶ Distress Scorer         ✅ WIRED
    │                   └──▶ Care Circle   ✅ WIRED
    │
    ├──▶ Prediction Hook Generator         ✅ WIRED
    │
    ├──▶ Pressure Vector Update            ✅ WIRED
    │         └──▶ Isolation Detection     ✅ WIRED
    │
    ├──▶ observeContext() (learned_patterns) ✅ WIRED
    │
    ├──▶ recordMemoryAccess() (accessHistory) ✅ WIRED
    │         └──▶ FFT Pattern Detector    ✅ WIRED
    │
    └──▶ TierManager.store()                  ✅ WIRED (today)
              ├──▶ Hot tier (Redis)          ✅ High salience → hot
              └──▶ Warm tier (MongoDB)       ✅ Default storage


                              RETRIEVAL FLOW
                              ──────────────
recall()
    │
    ├──▶ MongoDB query                     ✅ WIRED
    │
    ├──▶ Salience ranking                  ✅ WIRED
    │
    ├──▶ Context Gate (filter by context)  ✅ WIRED
    │         ├──▶ CompositeContextGate    ✅ WIRED
    │         ├──▶ SemanticContextGate     ✅ WIRED
    │         └──▶ AppropriatenessFilter   ✅ WIRED (today)
    │                   ├──▶ Location filter     ✅
    │                   ├──▶ Device filter       ✅
    │                   └──▶ Participant filter  ✅
    │
    ├──▶ recordMemoryAccess() (pattern learning) ✅ WIRED
    │
    ├──▶ TierManager.get() (tier promotion)   ✅ WIRED (today)
    │         └──▶ maybePromoteHot()          ✅ Auto-promotes to Redis
    │
    └──▶ Return results


                              PREDICTION FLOW
                              ───────────────
get_predictions()
    │
    ├──▶ Query prediction_hooks            ✅ WIRED
    │         └──▶ (hooks created at ingest) ✅ WIRED
    │
    ├──▶ Evaluate conditions               ✅ WIRED
    │
    └──▶ Surface memories


anticipate()
    │
    ├──▶ Query learned_patterns            ✅ WIRED
    │         └──▶ (patterns from observeContext) ✅ WIRED
    │
    ├──▶ FFT Pattern Analysis              ✅ WIRED (today)
    │         └──▶ recordMemoryAccess()    ✅ WIRED (today)
    │
    └──▶ Context Gate                      ✅ WIRED (today)


                              EVENT DAEMON FLOW (NEW)
                              ────────────────────────
ingest_event()
    │
    ├──▶ Event Queue                       ✅ WIRED (today)
    │
    ├──▶ Threat Pattern Detection          ✅ WIRED (today)
    │         ├──▶ Bank Card Scam          ✅
    │         ├──▶ SSN Scam                ✅
    │         ├──▶ Gift Card Scam          ✅
    │         ├──▶ IRS Impersonation       ✅
    │         ├──▶ Grandchild Emergency    ✅
    │         └──▶ Tech Support Scam       ✅
    │
    ├──▶ Guardian Action Router            ✅ WIRED (today)
    │         ├──▶ Phone Intercept         ✅
    │         ├──▶ Doorbell Assist         ✅
    │         ├──▶ Time Trigger            ✅
    │         ├──▶ Silence Detection       ✅
    │         └──▶ Sensor Alert            ✅
    │
    ├──▶ Care Circle Notification          ✅ WIRED
    │
    └──▶ Action Logging                    ✅ WIRED (today)
```

---

## Component Status

### FULLY WIRED (Code exists AND connected)

| Component | File | Connected In |
|-----------|------|--------------|
| Memory Storage | MongoDB | mcp_server/index.ts |
| Salience Calculator | salience_calculator.ts | mcp_server/index.ts |
| Feature Extractor | feature_extractor.ts | salience_calculator.ts |
| Open Loop Tracker | open_loop_tracker.ts | mcp_server/index.ts |
| Briefing Generator | briefing_generator.ts | mcp_server/index.ts |
| Context Frames | context_frame.ts | mcp_server/index.ts |
| Emotion Analyzer | emotion_analyzer_client.ts | mcp_server/index.ts |
| Distress Scorer | distress_scorer.ts | mcp_server/index.ts |
| Care Circle Notifications | notification_service/index.ts | mcp_server/index.ts |
| Multi-Modal Sessions | emotionalContextService.js | mcp_server/index.ts |
| Prediction Hooks (read) | prediction_hooks.ts | mcp_server/index.ts |
| Prediction Hooks (write) | mcp_server/index.ts | store_memory handler |
| Pressure Vectors | entity.ts | mcp_server/index.ts |
| Isolation Detection | entity.ts | addPressureVector() |
| Pattern Learning (simple) | anticipation_service.ts | observeContext() |
| **Context Gate** | context_gate.ts | mcp_server/index.ts (recall handler) |
| **FFT Pattern Detector** | pattern_detector.ts | mcp_server/index.ts (recall handler) |
| **Event Daemon** | event_daemon/index.ts | mcp_server/index.ts |
| **Threat Detection** | event_daemon/index.ts | THREAT_PATTERNS array |
| **Guardian Actions** | event_daemon/index.ts | handlePhoneCallContent, etc. |
| **Scheduled Checks** | event_daemon/index.ts | scheduleCheck() |
| **Tier Manager** | tier_manager.ts | mcp_server/index.ts (store_memory + recall) |
| **AppropriatenessFilter** | context_gate.ts | mcp_server/index.ts (recall handler) |
| **Video Stream Service** | videoStreamService.js | emotionalContextService.js (via use_video) |
| **Import Memories** | memory_operations.ts | mcp_server/index.ts (import_memories tool) |

### CODE EXISTS BUT NOT WIRED

| Component | File | What's Missing |
|-----------|------|----------------|
| (All major components now wired) | - | - |

### PLACEHOLDER / NOT STARTED

| Component | Status | Notes |
|-----------|--------|-------|
| HTTPS/TLS | ❌ | Needs ACM cert |
| Production Passphrase | ❌ | Using dev passphrase |
| CloudWatch Alarms | ❌ | Not configured |
| TypeScript SDK | ❌ | Not started |
| Python SDK | ❌ | Not started |
| Caregiver Dashboard | ❌ | Frontend needed |
| Face Recognition | ❌ | Phase 3 |
| Hume.ai + Twilio Voice | ❌ | Custom voice for Opus |

---

## MCP Tools Summary (43 Tools)

### Core Memory (9)
- store_memory, recall, forget, restore, reassociate, export_memories, **import_memories**, search_memories, resolve_open_loop

### Context Management (4)
- set_context, whats_relevant, clear_context, list_devices

### Briefings & Loops (3)
- get_briefing, list_loops, close_loop

### Predictions & Patterns (6)
- anticipate, day_outlook, pattern_stats, get_predictions, record_prediction_feedback, get_anticipated_context

### Emotions & Prosody (10)
- analyze_emotion, get_emotional_context, set_emotion_filter, get_emotion_filters, get_memories_by_emotion, correct_emotion, clarify_intent, start_emotional_session, stop_emotional_session, list_emotional_sessions

### Relationships & Pressure (5)
- get_relationship, get_entity_pressure, set_care_circle, get_tier_stats, get_pattern_stats

### Behavioral Identity (3)
- identify_user, behavioral_metrics, behavioral_feedback

### Event Daemon (4) - NEW
- ingest_event, schedule_check, get_daemon_status, set_entity_vulnerability

---

## The Recursive Callback - NOW WIRED

The system now has a **feedback loop** from retrieval to pattern learning:

```
CURRENT (WIRED):
store_memory() ──▶ observeContext() ──▶ learned_patterns
                                              │
recall()       ──▶ get memories              │
    │                   │                    │
    ├───contextGate()───┤                    │
    │                   │                    │
    └───recordAccess()──┼──▶ accessHistory ──┤
                        │                    │
                   return filtered           │
                                             │
anticipate()   ◀─────────────────────────────┘
    │
    └──▶ FFT analyzes accessHistory (21/63 day patterns)


EVENT DAEMON (PROACTIVE ARM):
external_event() ──▶ daemon evaluates ──▶ action taken
    │                      │                   │
    │                      ├──▶ prediction ────┤
    │                      │   hooks match     │
    │                      │                   │
    │                      ├──▶ threat ────────┼──▶ intercept
    │                      │   patterns        │
    │                      │                   │
    │                      └──▶ care circle ───┴──▶ notify
    │
    └──▶ No user asked. The system ACTS.
```

---

## Event Daemon - The Guardian

**Purpose:** Act on external events in real-time. No user request needed.

### Event Types Supported
- `phone_ring` - Phone call detected
- `phone_call_content` - Real-time call transcript (scam detection)
- `doorbell` - Visitor at door
- `email_received` - Incoming email
- `calendar_reminder` - Scheduled event
- `time_trigger` - Scheduled check (meal, medication, etc.)
- `sensor_alert` - Fall detection, smoke, etc.
- `device_input` - Generic device event
- `silence_detected` - No activity for threshold
- `location_change` - Entity moved
- `market_data` - Financial data stream
- `custom_webhook` - Custom integrations

### Threat Patterns (Scam Detection)
1. **Bank Card Scam** - "verify your credit card numbers"
2. **SSN Scam** - "verify your social security"
3. **Gift Card Scam** - "pay with gift cards"
4. **IRS Impersonation** - "warrant for arrest"
5. **Grandchild Emergency** - "don't tell mom, I need money"
6. **Tech Support Scam** - "your computer has a virus"

### Guardian Actions
- **intercept** - Take over call, terminate threat
- **notify** - Alert care circle
- **remind** - Deliver scheduled reminder
- **assist** - Help with task (doorbell, phone ID)
- **alert** - Urgent notification
- **log** - Record for pattern learning

---

## Files Modified Today

| File | Changes |
|------|---------|
| `src/services/event_daemon/index.ts` | NEW - Event daemon service |
| `src/services/mcp_server/index.ts` | Added event daemon tools, context gate in recall, recordMemoryAccess |
| `docs/WIRING_STATUS.md` | Updated with new wiring |

---

## REST Mode Coverage (MCP → API → Service)

**Problem:** MCP stdio protocol requires stdout be clean JSON-RPC. Logger was corrupting stdout.
Tools in REST mode need: server.js endpoint → ApiClient method → tool handler fallback.

### Status After Fix

| Tool | REST Endpoint | ApiClient | Fallback | Status |
|------|--------------|-----------|----------|--------|
| store_memory | POST /memory | storeMemory() | ✅ | DONE |
| recall | GET /memory | recall() | ✅ | DONE |
| get_briefing | GET /briefing | getBriefing() | ✅ | DONE |
| list_loops | GET /loops | listLoops() | ✅ | DONE |
| close_loop | POST /loops/:id/close | closeLoop() | ✅ | DONE |
| get_status | GET /status | getStatus() | ✅ | DONE |
| set_context | POST /context/sync | setContext() | ✅ | DONE |
| whats_relevant | GET /context/relevant | getRelevant() | ✅ | DONE |
| clear_context | DELETE /context | clearContext() | ✅ | DONE |
| list_devices | GET /devices | listDevices() | ✅ | DONE |
| forget | POST /memory/forget | forgetMemory() | ✅ | DONE |
| forget_person | POST /memory/forget-person | forgetPerson() | ✅ | DONE |
| restore | POST /memory/restore | restoreMemory() | ✅ | DONE |
| reassociate | POST /memory/reassociate | reassociateMemory() | ✅ | DONE |
| export_memories | POST /memory/export | exportMemories() | ✅ | DONE |
| import_memories | POST /memory/import | importMemories() | ✅ | DONE |
| search_memories | GET /memory/search | searchMemories() | ✅ | DONE |
| resolve_open_loop | POST /loops/:id/resolve | resolveOpenLoop() | ✅ | DONE |
| recall_vote | POST /memory/vote | voteOnMemories() | ✅ | DONE |
| get_tier_stats | GET /memory/tiers | getTierStats() | ✅ | DONE |
| anticipate | POST /anticipate | anticipate() | ✅ | DONE |
| day_outlook | GET /outlook | dayOutlook() | ✅ | DONE |
| pattern_stats | GET /patterns/stats | patternStats() | ✅ | DONE |
| get_pattern_stats | GET /patterns/stats | getPatternStats() | ✅ | DONE |
| memory_feedback | POST /patterns/feedback | memoryFeedback() | ✅ | DONE |
| get_predictions | POST /predictions | getPredictions() | ✅ | DONE |
| record_prediction_feedback | POST /predictions/feedback | recordPredictionFeedback() | ✅ | DONE |
| get_anticipated_context | POST /predictions/anticipated | getAnticipatedContext() | ✅ | DONE |
| analyze_emotion | POST /emotion/analyze | analyzeEmotion() | ✅ | DONE |
| get_emotional_context | GET /emotion/context | getEmotionalContext() | ✅ | DONE |
| start_emotional_session | POST /emotion/session/start | startEmotionalSession() | ✅ | DONE |
| stop_emotional_session | POST /emotion/session/stop | stopEmotionalSession() | ✅ | DONE |
| list_emotional_sessions | GET /emotion/sessions | listEmotionalSessions() | ✅ | DONE |
| set_emotion_filter | POST /emotion/filter | setEmotionFilter() | ✅ | DONE |
| get_emotion_filters | GET /emotion/filters | getEmotionFilters() | ✅ | DONE |
| get_memories_by_emotion | GET /emotion/memories | getMemoriesByEmotion() | ✅ | DONE |
| correct_emotion | POST /emotion/correct | correctEmotion() | ✅ | DONE |
| clarify_intent | POST /emotion/clarify | clarifyIntent() | ✅ | DONE |
| identify_user | POST /behavioral/identify | identifyUser() | ✅ | DONE |
| behavioral_metrics | GET /behavioral/metrics | behavioralMetrics() | ✅ | DONE |
| behavioral_feedback | POST /behavioral/feedback | behavioralFeedback() | ✅ | DONE |
| get_relationship | POST /relationship | getRelationship() | ✅ | DONE |
| get_entity_pressure | GET /pressure/:entityId | getEntityPressure() | ✅ | DONE |
| set_care_circle | POST /care-circle | setCareCircle() | ✅ | DONE |
| set_entity_vulnerability | POST /vulnerability | setEntityVulnerability() | ✅ | DONE |
| ingest_event | POST /events/ingest | ingestEvent() | ✅ | DONE |
| schedule_check | POST /events/schedule | scheduleCheck() | ✅ | DONE |
| get_daemon_status | GET /events/daemon/status | getDaemonStatus() | ✅ | DONE |

### Logger Fix (Phase 1)
- Default logger: ALL levels → stderr (was stdout for info/debug)
- Winston Console transport: `stderrLevels: ['error', 'warn', 'info', 'debug']`
- stdout now clean for MCP JSON-RPC protocol

---

## Next Steps (Priority Order)

### 1. Hume.ai + Twilio Voice
- Wire Opus with emotional voice presence
- Custom voices for companion personality

### 2. Appropriateness Filter in Recall
- Add security context filtering
- Device-aware memory surfacing

### 3. Tier Manager (Zipfian Cache)
- Hot/Warm/Cold memory caching
- Performance optimization

### 4. HTTPS/TLS
- ACM certificate
- ALB configuration

---

*Last Updated: 2026-01-21*
