# MemoRable Data Flow Architecture

## Visual Data Flow

```
                                    EXTERNAL INPUTS
                    ┌───────────────────────────────────────────────────┐
                    │                                                   │
     ┌──────────────▼──────────────┐    ┌──────────────▼──────────────┐
     │         MCP Server          │    │      Ingestion Service      │
     │    (23 Claude Code Tools)   │    │        (Port 8001)          │
     │         (stdio/HTTP)        │    │                             │
     │                             │    │  POST /api/ingest           │
     │  store_memory, recall,      │    │  - Text, Audio, Video       │
     │  anticipate, get_briefing,  │    │  - Code, System Logs        │
     │  list_loops, close_loop...  │    │  - User Interactions        │
     └──────────────┬──────────────┘    └──────────────┬──────────────┘
                    │                                   │
                    │         ┌─────────────────────────┘
                    │         │
                    ▼         ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    INGESTION PIPELINE                           │
     │  ┌────────────┐   ┌────────────┐   ┌────────────────────────┐  │
     │  │ Validate   │──▶│ Preprocess │──▶│ Memento Constructor    │  │
     │  │ Request    │   │ Content    │   │ (Create MemoryMemento) │  │
     │  └────────────┘   └────────────┘   └──────────┬─────────────┘  │
     │                                                │                │
     │                          ┌─────────────────────┘                │
     │                          ▼                                      │
     │  ┌─────────────────────────────────────────────────────────┐   │
     │  │              ENRICHMENT & EXTRACTION                     │   │
     │  │                                                          │   │
     │  │  ┌─────────────────┐    ┌─────────────────────────┐     │   │
     │  │  │ Feature Extract │    │   Entity Extraction     │     │   │
     │  │  │ - Action Items  │    │   - People Mentioned    │     │   │
     │  │  │ - Commitments   │    │   - Places, Dates       │     │   │
     │  │  │ - Dates         │    │   - Organizations       │     │   │
     │  │  │ - Open Loops    │    └─────────────────────────┘     │   │
     │  │  └─────────────────┘                                     │   │
     │  │                                                          │   │
     │  │  ┌─────────────────┐    ┌─────────────────────────┐     │   │
     │  │  │ Salience Score  │    │   Emotional Context     │     │   │
     │  │  │ (5 Components)  │    │   - Valence, Arousal    │     │   │
     │  │  │ emotion:    30% │    │   - Dominant Emotion    │     │   │
     │  │  │ novelty:    20% │    │   - Hume AI Analysis    │     │   │
     │  │  │ relevance:  20% │    └─────────────────────────┘     │   │
     │  │  │ social:     15% │                                     │   │
     │  │  │ consequent: 15% │                                     │   │
     │  │  └─────────────────┘                                     │   │
     │  └─────────────────────────────────────────────────────────┘   │
     └─────────────────────────────────────────────────────────────────┘
                    │
                    │
                    ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                      DATA STORAGE LAYER                         │
     │                                                                  │
     │  ┌─────────────────────┐    ┌─────────────────────────────┐    │
     │  │    MongoDB          │    │       Weaviate              │    │
     │  │   (Port 27017)      │    │      (Port 8080)            │    │
     │  │                     │    │                             │    │
     │  │  Collections:       │    │  Vector Storage:            │    │
     │  │  - memories         │    │  - 1024-dim embeddings      │    │
     │  │  - open_loops       │    │  - Semantic similarity      │    │
     │  │  - contacts         │    │  - Nearest neighbor search  │    │
     │  │  - relationship_    │    │                             │    │
     │  │    patterns         │    │                             │    │
     │  │  - learned_weights  │    │                             │    │
     │  │  - state_changes    │    │                             │    │
     │  │  - retrieval_logs   │    │                             │    │
     │  └─────────────────────┘    └─────────────────────────────┘    │
     │                                                                  │
     │  ┌─────────────────────┐    ┌─────────────────────────────┐    │
     │  │    Redis            │    │       Ollama                │    │
     │  │   (Port 6379)       │    │      (Port 11434)           │    │
     │  │                     │    │                             │    │
     │  │  - Context Frames   │    │  - Local LLM inference      │    │
     │  │  - Session State    │    │  - Feature extraction       │    │
     │  │  - Cache            │    │  - Briefing generation      │    │
     │  │  - Real-time Sync   │    │                             │    │
     │  └─────────────────────┘    └─────────────────────────────┘    │
     └─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                 RETRIEVAL & INTELLIGENCE                        │
     │                                                                  │
     │  ┌─────────────────────────────────────────────────────────┐   │
     │  │              Retrieval Service (Port 3004)               │   │
     │  │                                                          │   │
     │  │  Score = (semantic_similarity * 0.6) +                   │   │
     │  │          (salience/100 * decay * 0.4)                    │   │
     │  │                                                          │   │
     │  │  Context Boosts:                                         │   │
     │  │  - Upcoming contact events: +0.15                        │   │
     │  │  - Deadline proximity:      +0.10                        │   │
     │  │  - Active relationships:    +recency                     │   │
     │  └─────────────────────────────────────────────────────────┘   │
     │                                                                  │
     │  ┌─────────────────────┐    ┌─────────────────────────────┐    │
     │  │ Relationship Intel  │    │    Anticipation Service     │    │
     │  │                     │    │                             │    │
     │  │ - Interaction trend │    │ - 21-day pattern learning   │    │
     │  │ - Cold contacts     │    │ - Day-ahead predictions     │    │
     │  │ - Health scores     │    │ - Calendar awareness        │    │
     │  │ - Next action       │    │ - Context anticipation      │    │
     │  └─────────────────────┘    └─────────────────────────────┘    │
     │                                                                  │
     │  ┌─────────────────────────────────────────────────────────┐   │
     │  │                 Briefing Generator                       │   │
     │  │                                                          │   │
     │  │  ConversationBriefing:                                   │   │
     │  │  - Top memories with justification                       │   │
     │  │  - Open loops requiring attention                        │   │
     │  │  - Relationship status                                   │   │
     │  │  - Upcoming events                                       │   │
     │  └─────────────────────────────────────────────────────────┘   │
     └─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │              REAL-TIME RELEVANCE ENGINE                         │
     │              (Replaced NNNA - batch processing is dead)         │
     │                                                                  │
     │  ┌─────────────────────────────────────────────────────────┐   │
     │  │  All processing happens AT INGEST TIME, not overnight:  │   │
     │  │                                                          │   │
     │  │  - Salience scoring:     REAL-TIME on memory creation   │   │
     │  │  - Pattern learning:     CONTINUOUS, event-driven       │   │
     │  │  - Relationship updates: IMMEDIATE on new interaction   │   │
     │  │  - Schema evolution:     STREAMING as data flows        │   │
     │  │                                                          │   │
     │  │  WHY: 10x TOPS at lower $ makes real-time feasible.     │   │
     │  │  Robots don't sleep. AR glasses can't wait until 2 AM.  │   │
     │  └─────────────────────────────────────────────────────────┘   │
     │                                                                  │
     │  Future: Gun.js mesh for edge distribution to units/robots     │
     └─────────────────────────────────────────────────────────────────┘
```

## External API Calls (Outbound)

```
     ┌─────────────────────────────────────────────────────────────────┐
     │                    EXTERNAL SERVICES                            │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │                   LLM PROVIDERS                            │ │
     │  │                                                            │ │
     │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │ │
     │  │  │ Anthropic   │  │  OpenAI     │  │  AWS Bedrock    │   │ │
     │  │  │             │  │             │  │                 │   │ │
     │  │  │ Claude 3/3.5│  │ GPT-4o-mini │  │ Claude via AWS  │   │ │
     │  │  │ Haiku/Sonnet│  │             │  │ (IAM Auth)      │   │ │
     │  │  │ /Opus       │  │             │  │                 │   │ │
     │  │  └─────────────┘  └─────────────┘  └─────────────────┘   │ │
     │  │                                                            │ │
     │  │  Used for: Feature extraction, briefing generation,        │ │
     │  │            open loop detection, salience explanation       │ │
     │  └───────────────────────────────────────────────────────────┘ │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │                    HUME AI                                 │ │
     │  │         (Emotion Intelligence Platform)                    │ │
     │  │                                                            │ │
     │  │  WebSocket: wss://api.hume.ai/v0/stream/models            │ │
     │  │  Batch API: https://api.hume.ai/v0/batch/jobs             │ │
     │  │  Custom:    https://api.hume.ai/v0/custom/models          │ │
     │  │                                                            │ │
     │  │  Data Sent:           Data Received:                       │ │
     │  │  - Audio chunks       - Emotion scores (7 categories)      │ │
     │  │  - Video frames       - Expression intensities             │ │
     │  │  - Text transcripts   - Prosodic features                  │ │
     │  │  - Multimodal combo   - Language emotion markers           │ │
     │  └───────────────────────────────────────────────────────────┘ │
     └─────────────────────────────────────────────────────────────────┘
```

## Data Classification & Encryption Boundaries

```
     ┌─────────────────────────────────────────────────────────────────┐
     │                    ENCRYPTION TIERS                             │
     │         (Per vault_service/ARCHITECTURE.md)                     │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │  TIER 1: GENERAL MEMORIES (AES-256-GCM)                   │ │
     │  │                                                            │ │
     │  │  - Standard encrypted storage                              │ │
     │  │  - Fast retrieval for daily use                            │ │
     │  │  - Key: user password + device salt                        │ │
     │  │  - Searchable via encrypted indexes                        │ │
     │  └───────────────────────────────────────────────────────────┘ │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │  TIER 2: PERSONAL JOURNAL (FORT KNOX)                     │ │
     │  │                                                            │ │
     │  │  - ChaCha20-Poly1305 + AES-256-GCM layered                │ │
     │  │  - Hardware key required (YubiKey, Secure Enclave)        │ │
     │  │  - Zero-knowledge: server NEVER sees plaintext            │ │
     │  │  - Client-side encryption ONLY                            │ │
     │  │  - No cloud backup without explicit MFA                   │ │
     │  └───────────────────────────────────────────────────────────┘ │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │  TIER 3: DATA VAULT (TRILLION DOLLAR SECURITY)            │ │
     │  │                                                            │ │
     │  │  - Multi-party computation                                 │ │
     │  │  - Shamir Secret Sharing (3-of-5 key holders)             │ │
     │  │  - Air-gapped signing required                             │ │
     │  │  - Audit log with cryptographic proof                      │ │
     │  │  - Self-destruct on tamper detection                       │ │
     │  └───────────────────────────────────────────────────────────┘ │
     │                                                                  │
     │  ┌───────────────────────────────────────────────────────────┐ │
     │  │  ALZHEIMER'S CONSIDERATION                                 │ │
     │  │                                                            │ │
     │  │  - Trusted caregiver key escrow                            │ │
     │  │  - Biometric backup (fingerprint/face)                     │ │
     │  │  - Recovery phrase with family verification                │ │
     │  │  - Gradual access degradation, not cliff                   │ │
     │  └───────────────────────────────────────────────────────────┘ │
     └─────────────────────────────────────────────────────────────────┘
```

## MongoDB Collections Map

```
     memories
     ├── memoryId (UUID)
     ├── userId
     ├── text
     ├── salienceScore (0-100)
     ├── state (active|archived|suppressed|deleted)
     ├── deviceId / deviceType
     ├── emotionalContext
     │   ├── valence (-1 to 1)
     │   ├── arousal (0 to 1)
     │   └── dominantEmotion
     ├── temporalContext
     │   ├── eventTimestamp
     │   └── chronologicalCertainty
     ├── spatialContext
     │   ├── locationCoordinates
     │   └── locationName
     ├── reasoningContext
     │   ├── causalLinks[]
     │   └── associatedGoals[]
     └── createdAt / updatedAt

     open_loops
     ├── userId
     ├── contactId
     ├── type (commitment|deadline|question|promised|request)
     ├── owner (self|other)
     ├── status (open|closed|expired)
     ├── dueDate
     └── urgency (low|medium|high|critical)

     contacts
     ├── userId
     ├── name
     ├── externalId
     └── metadata (email, etc.)

     relationship_patterns
     ├── userId
     ├── contactId
     ├── interactionTrend (increasing|stable|decreasing|dormant)
     ├── daysSinceLastInteraction
     └── healthScore

     state_changes (AUDIT TRAIL)
     ├── memoryId
     ├── userId
     ├── previousState
     ├── newState
     ├── reason
     └── changedAt
```

## Environment Variables by Category

### Database Credentials (NEVER LOG)
```
MONGODB_URI, MONGO_USER, MONGO_PASSWORD
REDIS_URL, REDIS_PASSWORD
WEAVIATE_URL, WEAVIATE_API_KEY
```

### API Keys (NEVER LOG)
```
ANTHROPIC_API_KEY, OPENAI_API_KEY
HUME_API_KEY
WEATHER_API_KEY, GEOLOCATION_API_KEY
OLLAMA_API_KEY
```

### Security/OAuth (NEVER LOG)
```
JWT_SECRET, API_KEY
OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET
```

### Service Configuration (Safe to Log)
```
NODE_ENV, PORT, LOG_LEVEL, LOG_FORMAT
INGESTION_SERVICE_PORT, EMBEDDING_SERVICE_PORT, RETRIEVAL_SERVICE_PORT
LLM_PROVIDER, USE_BEDROCK, TRANSPORT_TYPE
```

### Memory Windows (Safe to Log)
```
MEMORY_WINDOW_SHORT=1200000   (20 min)
MEMORY_WINDOW_MEDIUM=3600000  (1 hr)
MEMORY_WINDOW_LONG=86400000   (24 hr)
```

## Security Status

### FIXED (docker-compose.yml)
| Issue | Status | Fix |
|-------|--------|-----|
| Weaviate anonymous access | FIXED | API key auth required |
| Grafana default password | FIXED | No default, explicit required |
| Prometheus public exposure | FIXED | Internal network only |

### FIXED (MCP server code)
| Issue | Status | Fix |
|-------|--------|-----|
| OAuth tokens in-memory | FIXED | Encrypted Redis storage with AES-256-GCM |
| Export unencrypted | FIXED | Password param for encrypted exports |

### IMPLEMENTED (models)
| Issue | Status | Fix |
|-------|--------|-----|
| Security tier classification | ADDED | `SecurityTier` type in models |
| Memory classification | ADDED | `securityTier` field on MemoryMemento |

### DOCUMENTED (requires setup)
| Issue | Implementation | See |
|-------|---------------|-----|
| TLS between services | Certificate setup | SECURITY_ARCHITECTURE.md |
| External API plaintext | Route by tier to Ollama | SECURITY_ARCHITECTURE.md |
| Storage encryption | Encrypt-before-store | SECURITY_ARCHITECTURE.md |
| Ingestion API auth | API key middleware | SECURITY_ARCHITECTURE.md |
| Stylometry as biometric | Tier 3 + MFA | SECURITY_ARCHITECTURE.md |

## Critical Security Rules

```
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   NEVER in git. NEVER in logs. NEVER in plain text.                  ║
║                                                                       ║
║   1. Personal memories = most precious treasures                      ║
║   2. Personal memories = most guarded secrets                         ║
║   3. Encryption at EVERY level                                        ║
║   4. Repo = code, Docker = data (NEVER MIXED)                         ║
║   5. The ability to CHOOSE what you forget is a SUPERPOWER            ║
║   6. SecurityTier defaults to Tier2_Personal (safe default)           ║
║   7. Stylometry = biometric PII, treat as Tier 3                      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

## Service Ports Summary

| Service | Port | Purpose |
|---------|------|---------|
| MemoRable App | 3000 | Main application |
| Ingestion | 8001 | Memory ingestion API |
| Embedding | 3003 | Vector generation |
| Retrieval | 3004 | Memory retrieval + real-time relevance |
| MCP HTTP | 8080 | MCP over HTTP (when enabled) |
| MongoDB | 27017 | Document storage |
| Redis | 6379 | Cache/context |
| Weaviate | 8080 | Vector database |
| Ollama | 11434 | Local LLM |
| Prometheus | 9090 | Metrics |
| Grafana | 3001 | Dashboards |
