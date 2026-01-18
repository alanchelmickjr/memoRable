# MemoRable API Reference

**Version:** 2.0.0
**Updated:** 2026-01-18

---

## Overview

MemoRable provides two API surfaces:
1. **MCP Tools** - 35 tools for Claude Code / MCP clients
2. **REST API** - HTTP endpoints for direct integration

---

## MCP Tools (35 Tools)

### Context Management

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `set_context` | `location?`, `people?`, `activity?`, `project?`, `deviceId?`, `deviceType?` | `ContextFrame` | Set current context. Auto-surfaces relevant memories. |
| `whats_relevant` | `unified?`, `deviceId?` | `RelevantMemories` | Get what matters NOW based on current context. |
| `clear_context` | `deviceId?`, `dimensions?` | `void` | Clear context when leaving/ending. |
| `list_devices` | - | `Device[]` | List all active devices and their context status. |

### Memory Operations

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `store_memory` | `text`, `context?`, `securityTier?`, `tags?` | `StoredMemory` | Store with automatic salience scoring. |
| `recall` | `query`, `person?`, `limit?`, `minSalience?` | `Memory[]` | Search memories by query, person, or topic. |
| `get_briefing` | `person` | `Briefing` | Pre-conversation briefing about a person. |
| `forget` | `memoryId`, `mode?` | `void` | Suppress, archive, or delete a memory. |
| `forget_person` | `personName` | `ForgottenCount` | Forget all memories about someone. |
| `restore` | `memoryId` | `Memory` | Bring back a forgotten memory. |
| `reassociate` | `memoryId`, `people?`, `tags?`, `project?` | `Memory` | Re-link memory to different associations. |
| `export_memories` | `userId?`, `password?` | `ExportedData` | Export for backup or portability. |
| `import_memories` | `data`, `password?` | `ImportResult` | Import memories from backup. |

### Commitment Tracking

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `list_loops` | `owner?`, `person?`, `overdue?` | `OpenLoop[]` | List open commitments. |
| `close_loop` | `loopId`, `note?` | `void` | Mark a commitment as done. |
| `get_status` | - | `SystemStatus` | System status and metrics. |

### Predictive Memory

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `anticipate` | `calendar?` | `Predictions` | Get predictions based on calendar + patterns. |
| `day_outlook` | `calendar?` | `DayOutlook` | Morning briefing with predicted context switches. |
| `pattern_stats` | - | `PatternStats` | Check learning progress (X/21 days). |
| `memory_feedback` | `patternId`, `action` | `void` | RL feedback: was the surfaced memory useful? |

### Behavioral Identity

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `identify_user` | `messageText` | `IdentityResult` | Identify user by behavioral patterns. |
| `behavioral_metrics` | `timeRange?` | `BehavioralDashboard` | Dashboard with learning progress, accuracy. |
| `behavioral_feedback` | `predictionId`, `correct` | `void` | Mark identification as correct/incorrect. |

### Emotion & Prosody

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `analyze_emotion` | `text` or `memoryId` | `EmotionAnalysis` | Analyze emotional content using Hume.ai. |
| `get_emotional_context` | - | `EmotionalState` | Get real-time emotion from active streams. |
| `set_emotion_filter` | `emotions`, `threshold`, `action` | `void` | Configure emotion-based content filtering. |
| `get_emotion_filters` | - | `EmotionFilter[]` | Get configured emotion filters. |
| `get_memories_by_emotion` | `emotion`, `minIntensity?` | `Memory[]` | Search memories by emotional content. |
| `correct_emotion` | `memoryId`, `correctEmotion` | `void` | Override wrong emotion detection. |
| `clarify_intent` | `memoryId`, `actualIntent` | `void` | Annotate what was meant vs said. |

### Relationship Intelligence

| Tool | Parameters | Returns | Description |
|------|------------|---------|-------------|
| `get_relationship` | `entityA`, `entityB` | `Relationship` | Synthesize relationship from shared memories. |
| `get_entity_pressure` | `entityId` | `EntityPressure` | Butterfly to Hurricane early warning. |
| `get_predictions` | `context?` | `PredictionHook[]` | Surface memories before you ask. |
| `record_prediction_feedback` | `hookId`, `useful` | `void` | Teach the system what predictions are useful. |
| `set_care_circle` | `entityId`, `caregivers` | `void` | Set who gets alerted when pressure is concerning. |

---

## REST API

### Base URLs

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3000` |
| Production | `https://your-deployment.com` |

### Authentication

```http
Authorization: Bearer <jwt_token>
```

Or for OAuth 2.0:
```http
Authorization: Bearer <access_token>
```

### Health Endpoints

```http
GET /health/live      # Liveness probe (200 if running)
GET /health/ready     # Readiness probe (200 if dependencies ready)
GET /health/startup   # Startup probe (200 after initialization)
GET /health           # Full status with component health
GET /metrics          # Prometheus metrics
```

### Memory Endpoints

#### Store Memory
```http
POST /api/memory
Content-Type: application/json

{
  "text": "Met with Sarah about Q4 planning",
  "userId": "user-123",
  "context": {
    "location": "office",
    "people": ["Sarah Chen"]
  },
  "securityTier": "Tier2_Personal"
}
```

Response:
```json
{
  "memoryId": "mem_abc123",
  "salience": {
    "score": 72,
    "factors": {
      "emotional": 0.6,
      "novelty": 0.4,
      "relevance": 0.8,
      "social": 0.7,
      "consequential": 0.5
    }
  },
  "openLoopsCreated": [
    {
      "loopId": "loop_xyz789",
      "description": "Review Q4 planning docs",
      "owner": "you",
      "person": "Sarah Chen"
    }
  ]
}
```

#### Recall Memories
```http
GET /api/memory?query=sarah&limit=10&minSalience=50
```

Response:
```json
{
  "memories": [
    {
      "memoryId": "mem_abc123",
      "text": "Met with Sarah about Q4 planning",
      "salience": 72,
      "createdAt": "2026-01-18T10:30:00Z",
      "people": ["Sarah Chen"],
      "tags": ["meeting", "planning"]
    }
  ],
  "total": 1
}
```

#### Get Briefing
```http
GET /api/briefing?person=Sarah%20Chen
```

Response:
```json
{
  "person": "Sarah Chen",
  "lastInteraction": "2026-01-18T10:30:00Z",
  "engagementTrend": "increasing",
  "youOweThem": [
    {
      "loopId": "loop_001",
      "description": "Send budget spreadsheet review",
      "dueDate": "2026-01-20"
    }
  ],
  "theyOweYou": [
    {
      "loopId": "loop_002",
      "description": "Quarterly metrics report",
      "dueDate": "2026-01-22"
    }
  ],
  "upcomingEvents": [
    {
      "description": "Daughter Emma's birthday",
      "date": "2026-02-15"
    }
  ],
  "sensitivities": [
    "Stressed about reorg - be supportive"
  ]
}
```

### Context Endpoints

#### Set Context
```http
POST /api/context
Content-Type: application/json

{
  "userId": "user-123",
  "location": "coffee shop",
  "people": ["Sarah Chen"],
  "activity": "meeting",
  "deviceId": "iphone-123",
  "deviceType": "mobile"
}
```

#### Get Relevant
```http
GET /api/context/relevant?userId=user-123&unified=true
```

### Ingestion Service (Port 8001)

#### Ingest Memory
```http
POST /api/ingest/memory
Content-Type: application/json

{
  "text": "Meeting notes from standup...",
  "userId": "user-123",
  "source": "slack",
  "metadata": {
    "channel": "#engineering",
    "timestamp": "2026-01-18T09:00:00Z"
  }
}
```

#### Bulk Ingest
```http
POST /api/ingest/bulk
Content-Type: application/json

{
  "memories": [
    {"text": "...", "userId": "..."},
    {"text": "...", "userId": "..."}
  ]
}
```

---

## Data Types

### SecurityTier

| Value | Description | LLM Access | Vector Storage |
|-------|-------------|------------|----------------|
| `Tier1_General` | Public data | External OK | Yes |
| `Tier2_Personal` | Personal data (default) | Local only | Yes |
| `Tier3_Vault` | Sensitive (PII, financial) | NEVER | NO |

### DeviceType

```typescript
type DeviceType =
  | 'desktop' | 'mobile' | 'tablet' | 'watch'
  | 'glasses' | 'voice_assistant' | 'car'
  | 'tv' | 'iot_sensor' | 'robot' | 'unknown';
```

### LoopOwnership

```typescript
type LoopOwnership = 'you_owe_them' | 'they_owe_you' | 'mutual';
```

### MemoryState

```typescript
type MemoryState = 'active' | 'archived' | 'suppressed' | 'deleted';
```

### FeedbackAction

```typescript
type FeedbackAction = 'used' | 'ignored' | 'dismissed';
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "Memory with ID mem_abc123 not found",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MEMORY_NOT_FOUND` | 404 | Memory ID doesn't exist |
| `UNAUTHORIZED` | 401 | Invalid or missing auth token |
| `FORBIDDEN` | 403 | Insufficient permissions for security tier |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/memory` POST | 100 | 1 minute |
| `/api/memory` GET | 1000 | 1 minute |
| `/api/ingest/*` | 500 | 1 minute |
| `/api/context/*` | 200 | 1 minute |

---

## SDKs

### Python
```bash
pip install memorable-sdk
```

```python
from memorable import MemorableClient

client = MemorableClient(
    base_url="http://localhost:3000",
    api_key="your-api-key"
)

# Store memory
result = client.store("Met with Sarah about Q4 planning")

# Recall
memories = client.recall("sarah", limit=10)

# Get briefing
briefing = client.get_briefing("Sarah Chen")
```

### TypeScript/Node.js
```bash
npm install @memorable/sdk
```

```typescript
import { MemorableClient } from '@memorable/sdk';

const client = new MemorableClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Store memory
const result = await client.store('Met with Sarah about Q4 planning');

// Recall
const memories = await client.recall('sarah', { limit: 10 });

// Get briefing
const briefing = await client.getBriefing('Sarah Chen');
```

---

## Changelog

### 2.0.0 (2026-01-18)
- Added 12 new MCP tools (35 total)
- Relationship intelligence: `get_relationship`, `get_entity_pressure`, `get_predictions`, `record_prediction_feedback`, `set_care_circle`
- Emotion tools: `analyze_emotion`, `get_emotional_context`, `set_emotion_filter`, `get_emotion_filters`, `get_memories_by_emotion`, `correct_emotion`, `clarify_intent`
- Added `import_memories` tool

### 1.0.0 (2026-01-01)
- Initial release with 23 MCP tools
- Core memory operations
- Context management
- Commitment tracking
- Predictive memory (21-day learning)
- Behavioral identity
