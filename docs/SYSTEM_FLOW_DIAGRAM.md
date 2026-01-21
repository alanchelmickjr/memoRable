# MemoRable System Flow Diagram

**Generated:** 2026-01-21
**Purpose:** Full system assessment for robotics community demo

---

## System Architecture Overview

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                    SENSOR NET                                │
                                    │   (Future: Gun.js mesh for edge distribution)               │
                                    └─────────────────────────────────────────────────────────────┘
                                                              │
          ┌──────────────────┬──────────────────┬─────────────┼────────────┬──────────────────┐
          ▼                  ▼                  ▼             ▼            ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐   ┌──────────┐  ┌──────────┐      ┌──────────┐
    │ AR       │      │ Robot    │      │ OSX      │   │ Claude   │  │ Slack    │      │ IoT      │
    │ Glasses  │      │ Companion│      │ Agent    │   │ Code     │  │ Bot      │      │ Sensors  │
    │ (Betty)  │      │ (Pepper) │      │ (macOS)  │   │ (MCP)    │  │ (XML)    │      │ (Home)   │
    └────┬─────┘      └────┬─────┘      └────┬─────┘   └────┬─────┘  └────┬─────┘      └────┬─────┘
         │                 │                 │              │             │                 │
         └────────────────┴─────────────────┴──────┬───────┴─────────────┴─────────────────┘
                                                    │
                                                    ▼
                    ┌──────────────────────────────────────────────────────────────┐
                    │                    AUTHENTICATION GATE                        │
                    │   Passphrase → Challenge → API Key (Argon2id, per-device)    │
                    │   POST /auth/knock → POST /auth/exchange                      │
                    └──────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────────┐
    │                                  AWS ALB (us-west-2)                                        │
    │                    memorable-alb-1679440696.us-west-2.elb.amazonaws.com                     │
    └────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
    │   REST API (server.js)    │   │   MCP Server (stdio/HTTP) │   │   Ingestion Service       │
    │   Port: 3000              │   │   Port: 8080 (HTTP mode)  │   │   Port: 8001              │
    │                           │   │                           │   │                           │
    │   ✅ /health              │   │   35 MCP Tools:           │   │   Bulk ingestion          │
    │   ✅ /auth/*              │   │   ✅ store_memory         │   │   Slack XML parsing       │
    │   ✅ /memory              │   │   ✅ recall               │   │   Batch processing        │
    │   ✅ /memory/verbatim     │   │   ✅ get_briefing         │   │                           │
    │   ✅ /memory/interpretation│  │   ✅ list_loops           │   │                           │
    │   ✅ /dashboard/*         │   │   ✅ close_loop           │   │                           │
    │   ✅ /user/*              │   │   ✅ set_context          │   │                           │
    │   ✅ /admin/*             │   │   ✅ whats_relevant       │   │                           │
    │   ✅ /project/*           │   │   ✅ anticipate           │   │                           │
    │   ✅ /frame/*             │   │   ✅ get_relationship     │   │                           │
    │   ✅ /backup/*            │   │   ✅ get_predictions      │   │                           │
    │   ✅ /prosody/*           │   │   + 24 more tools         │   │                           │
    │   ❌ /context (missing)   │   │                           │   │                           │
    │   ❌ /relationships       │   │   ⚠️ Needs DB init       │   │                           │
    │   ❌ /loops               │   │                           │   │                           │
    └─────────────┬─────────────┘   └─────────────┬─────────────┘   └─────────────┬─────────────┘
                  │                               │                               │
                  └───────────────────────────────┼───────────────────────────────┘
                                                  ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────────┐
    │                              SALIENCE SERVICE (Core Intelligence)                           │
    │                                                                                             │
    │   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐               │
    │   │  Salience Scoring   │  │  Open Loop Tracker  │  │  Relationship Intel │               │
    │   │                     │  │                     │  │                     │               │
    │   │  Emotion:    30%    │  │  Commitments        │  │  Entity Graph       │               │
    │   │  Novelty:    20%    │  │  Follow-ups         │  │  Pressure Tracking  │               │
    │   │  Relevance:  20%    │  │  Questions          │  │  Care Circles       │               │
    │   │  Social:     15%    │  │  Promises           │  │  Health Scores      │               │
    │   │  Consequential: 15% │  │                     │  │                     │               │
    │   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘               │
    │                                                                                             │
    │   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐               │
    │   │  Context Frames     │  │  Anticipation       │  │  Prosody Analysis   │               │
    │   │                     │  │  (21-day learning)  │  │                     │               │
    │   │  Device-aware       │  │                     │  │  Distress detection │               │
    │   │  Multi-device fusion│  │  Pattern matching   │  │  Recovery signals   │               │
    │   │  Location/Activity  │  │  Predictive surfacing│ │  Tension analysis   │               │
    │   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘               │
    └────────────────────────────────────────────────────────────────────────────────────────────┘
                                                  │
                  ┌───────────────────────────────┼───────────────────────────────┐
                  ▼                               ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
    │   MongoDB (DocumentDB)    │   │   Redis (ElastiCache)     │   │   Weaviate (Vectors)      │
    │   Port: 27017             │   │   Port: 6379              │   │   Port: 8080              │
    │                           │   │                           │   │                           │
    │   • Memories              │   │   • Context frames        │   │   • Semantic search       │
    │   • Relationships         │   │   • Session state         │   │   • Embeddings            │
    │   • Patterns              │   │   • Device contexts       │   │   • Similarity matching   │
    │   • Open loops            │   │   • OAuth tokens          │   │                           │
    │   • Users/Devices         │   │   • Rate limiting         │   │                           │
    └───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
                                                  │
                                                  ▼
    ┌────────────────────────────────────────────────────────────────────────────────────────────┐
    │                              LLM PROVIDERS (Auto-detected)                                  │
    │                                                                                             │
    │   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐               │
    │   │   AWS Bedrock       │  │   Anthropic Direct  │  │   OpenAI Direct     │               │
    │   │   (IAM auth)        │  │   (API key)         │  │   (API key)         │               │
    │   │   Claude 3.5        │  │   Claude            │  │   GPT-4             │               │
    │   └─────────────────────┘  └─────────────────────┘  └─────────────────────┘               │
    │                                                                                             │
    │   Used for: Salience enrichment, Briefing generation, Feature extraction                   │
    └────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Current Status (2026-01-21)

### ✅ WORKING (Live on AWS)

| Component | Status | Endpoint |
|-----------|--------|----------|
| Health Check | ✅ | `GET /health` |
| Auth Knock | ✅ | `POST /auth/knock` |
| Auth Exchange | ✅ | `POST /auth/exchange` |
| Device Management | ✅ | `GET /auth/devices` |
| Memory Store | ✅ | `POST /memory` |
| Memory Recall | ✅ | `GET /memory?entity=X` |
| Memory Verbatim | ✅ | `POST /memory/verbatim` |
| Dashboard JSON | ✅ | `GET /dashboard/json` |
| Dashboard HTML | ✅ | `GET /dashboard` |
| Mission Control | ✅ | `GET /dashboard/mission-control` |
| User Profile | ✅ | `GET /user/profile` |
| Admin Panel | ✅ | `GET /admin/dashboard` |
| Prosody Analysis | ✅ | `POST /prosody/analyze` |
| Project Management | ✅ | `POST /project` |
| Frame Management | ✅ | `GET/POST /frame` |
| Backup/Restore | ✅ | `GET/POST /backup` |

### ⚠️ MCP TOOLS (Connected but needs DB init)

| Tool | Status | Notes |
|------|--------|-------|
| list_devices | ✅ | Working |
| store_memory | ⚠️ | Needs salience DB init |
| recall | ⚠️ | Needs API key config |
| get_briefing | ⚠️ | Needs salience DB init |
| list_loops | ⚠️ | Needs salience DB init |
| set_context | ⚠️ | Needs salience DB init |
| anticipate | ⚠️ | Needs 21-day learning baseline |

### ❌ NOT IMPLEMENTED (REST API)

| Endpoint | Status | Priority |
|----------|--------|----------|
| `POST /context` | ❌ 404 | HIGH - needed for robots |
| `GET /relationships` | ❌ 404 | MEDIUM |
| `GET /loops` | ❌ 404 | MEDIUM |

---

## Data Flow - Memory Ingestion

```
1. DEVICE SENDS MEMORY
   ┌────────────────────────────────────────────────────────────────┐
   │ POST /memory                                                   │
   │ {                                                              │
   │   "content": "Betty asked about her daughter Sarah",           │
   │   "entities": ["betty", "sarah"],                             │
   │   "context": { "location": "living room", "time": "3pm" }     │
   │ }                                                              │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. PROSODY ANALYSIS (Real-time)
   ┌────────────────────────────────────────────────────────────────┐
   │ Analyze for:                                                   │
   │ • Distress signals (shouting, urgency, confusion)             │
   │ • Recovery signals (gratitude, clarity, connection)           │
   │ • Net score → recommendation: store/flag/suppress             │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. SALIENCE SCORING
   ┌────────────────────────────────────────────────────────────────┐
   │ Calculate salience (0-100):                                    │
   │ • Emotion weight: 30%                                          │
   │ • Novelty weight: 20%                                          │
   │ • Relevance weight: 20%                                        │
   │ • Social weight: 15%                                           │
   │ • Consequential weight: 15%                                    │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
4. OPEN LOOP DETECTION
   ┌────────────────────────────────────────────────────────────────┐
   │ Detect commitments, questions, promises:                       │
   │ • "I'll call Sarah tomorrow" → open loop                      │
   │ • "What time is my appointment?" → question                   │
   │ • "Don't forget to take medicine" → reminder                  │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
5. RELATIONSHIP UPDATE
   ┌────────────────────────────────────────────────────────────────┐
   │ Update entity graph:                                           │
   │ • betty ←→ sarah (relationship)                               │
   │ • Interaction count++                                          │
   │ • Pressure tracking                                            │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
6. STORAGE
   ┌────────────────────────────────────────────────────────────────┐
   │ MongoDB: Document with metadata                                │
   │ Redis: Context frame update                                    │
   │ Weaviate: Vector embedding for semantic search                │
   └────────────────────────────────────────────────────────────────┘
```

---

## Data Flow - Memory Retrieval (Predictive)

```
1. CONTEXT SIGNAL RECEIVED
   ┌────────────────────────────────────────────────────────────────┐
   │ Device reports: location=kitchen, time=8am, day=Monday        │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. PATTERN MATCHING (21-day learning)
   ┌────────────────────────────────────────────────────────────────┐
   │ Match against learned patterns:                                │
   │ • Monday 8am + kitchen → medication reminder                  │
   │ • Sarah visits on Sundays → anticipate family context         │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. PREDICTIVE SURFACING
   ┌────────────────────────────────────────────────────────────────┐
   │ Surface before asked:                                          │
   │ • "Betty usually takes her heart medication at 8am"           │
   │ • "Sarah mentioned visiting today"                            │
   └────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
4. FEEDBACK LOOP
   ┌────────────────────────────────────────────────────────────────┐
   │ User/device feedback:                                          │
   │ • used: reinforces pattern                                     │
   │ • ignored: weakens pattern                                     │
   │ • dismissed: actively deweights                                │
   └────────────────────────────────────────────────────────────────┘
```

---

## Robot/AR Integration Points

For robotics community - these are your integration points:

### 1. Context Sync (Highest Priority)
```bash
# Report device context (location, activity, people present)
POST /context/sync
{
  "deviceId": "robot_pepper_001",
  "deviceType": "robot",
  "userId": "betty",
  "context": {
    "location": "living_room",
    "activity": "conversation",
    "people": ["betty", "caregiver"]
  }
}
```

### 2. Memory Capture
```bash
# Store observations from robot sensors
POST /memory
{
  "content": "Betty smiled when looking at family photos",
  "entities": ["betty"],
  "context": {
    "source": "robot_vision",
    "confidence": 0.92,
    "sensor": "facial_expression"
  }
}
```

### 3. Predictive Queries
```bash
# Get what matters right now for Betty
GET /memory?entity=betty&limit=5

# Response includes:
# - adjusted_salience (temporal perspective)
# - open loops (things Betty owes/is owed)
# - relationship context
```

### 4. MCP Integration (for Claude-powered robots)
```typescript
// Using MCP tools directly
const result = await mcp.callTool('get_predictions', {
  context: {
    location: 'kitchen',
    activity: 'meal_prep',
    talking_to: ['betty']
  }
});
```

---

## What Needs to Be Built for Robotics

### HIGH PRIORITY

1. **`POST /context` endpoint** - Currently returns 404
   - Needed for real-time device context sync
   - Should route to existing `/context/sync`

2. **MCP Database Initialization**
   - `setupSalienceDatabase()` needs to be called
   - MongoDB collections need to be created

3. **Device Registration Flow for Robots**
   - Currently works for terminals
   - Need device types: `robot`, `ar_glasses`, `companion`, `pendant`

### MEDIUM PRIORITY

4. **REST endpoints for loops/relationships**
   - `GET /loops` - list open commitments
   - `GET /relationships?entity=X` - entity connections

5. **Webhook/Push Notifications**
   - Robots need to be notified of relevant memories
   - Currently pull-only

### LOW PRIORITY

6. **Edge Deployment (Gun.js)**
   - Mesh networking for offline operation
   - Local-first with sync when connected

---

## Test Commands

```bash
# Set these first
export ALB="http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com"
export API_KEY="memorable_terminal_e80c54cc5ec175ce60943bc90d44f5786a6d616e60980834"

# Health
curl -s "$ALB/health" | jq .

# Store memory
curl -s -X POST "$ALB/memory" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"content": "Test from robot", "entities": ["betty"]}' | jq .

# Recall
curl -s "$ALB/memory?entity=betty&limit=5" \
  -H "X-API-Key: $API_KEY" | jq .

# Dashboard
curl -s "$ALB/dashboard/json" \
  -H "X-API-Key: $API_KEY" | jq .summary
```

---

## The Three Pillars in Practice

| Pillar | Implementation | Robotics Relevance |
|--------|----------------|-------------------|
| **Temporal Control** | Memory forgetting, suppression, archival | Betty can forget painful memories |
| **Individual Privacy** | Security tiers (Tier1/2/3), encryption | Medical data stays Tier3 |
| **Relevance** | ATR scoring, predictive surfacing | Robot surfaces what matters NOW |

---

*Generated by Claude Code - January 2026*
*For robotics community demo*
