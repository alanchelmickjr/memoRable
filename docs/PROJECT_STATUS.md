# MemoRable Project Status

> **Updated:** 2026-03-24
> **Branch:** `main` (cloud memory API + MCP server)
> **Deployed:** api.memorable.chat (EC2 us-west-1, ~$11/mo)
> **Tests:** 46 suites, 1,586 tests, 100% passing

---

## What's Live

The cloud memory API + MCP server is deployed and operational. HTTPS via nginx + Let's Encrypt (cert expires 2026-05-17). CI/CD fires on merge to main.

### Services (Production on Main)

| Service | Status | Notes |
|---------|--------|-------|
| **MCP Server** (51 tools) | COMPLETE | OAuth/PKCE, StreamableHTTP + stdio, Bedrock LLM |
| **Salience Service** (392 exports) | COMPLETE | 5-component scoring, real-time at ingest |
| **Ingestion Service** | 95% | Pipeline wired, NNNA stub intentionally deprecated |
| **Retrieval Service** | COMPLETE | MongoDB text + vector search, salience filtering |
| **Embedding Service** | COMPLETE | Ollama + deterministic hash fallback |
| **LoRA Service** (doc-to-lora) | COMPLETE | FastAPI, `/internalize` `/generate` `/reset`, S3+local storage |
| **Event Daemon** (Guardian) | OPERATIONAL | Threat detection (6 scam patterns), care circle alerts |
| **Notification Service** | COMPLETE | Care circle, distress alerts |
| **Device Auth (mTLS)** | COMPLETE | Device onboarding, certificate management |
| **Encryption (E2EE)** | COMPLETE | PII protection via tweetnacl |
| **Slack Integration** | OPERATIONAL | Message ingestion |
| **SCAD Service** | COMPLETE | 3D OpenSCAD model generation |
| **Vault Service** | STUB | Architecture doc only |
| **Viewer GUI** | STUB | Scaffolding |
| **Dashboard** | STUB | Scaffolding |

### Infrastructure

| Component | Status | Details |
|-----------|--------|---------|
| EC2 (t4g.micro) | LIVE | Instance i-0b7bf983feabd6c00, Elastic IP 52.9.62.72 |
| HTTPS | LIVE | api.memorable.chat, nginx + Let's Encrypt |
| MongoDB Atlas | LIVE | Cloud, encrypted at rest |
| Redis | LIVE | Local on EC2, not encrypted at rest |
| Docker Compose | 16 services | App, MCP, ingestion, embedding, retrieval, mongo, redis, weaviate, ollama, lora, prometheus, grafana, exporters |
| CI/CD | ACTIVE | GitHub Actions: lint -> test -> integration -> load -> smoke |
| GPU Spot Template | READY | memorable-gpu-spot.yaml, $50/mo hard cap, not deployed |

### MCP Tools (51 Total)

| Category | Count | Tools |
|----------|-------|-------|
| Core Memory | 9 | store_memory, recall, forget, restore, reassociate, export/import, search, resolve_open_loop |
| Context | 4 | set_context, whats_relevant, clear_context, list_devices |
| Briefings & Loops | 3 | get_briefing, list_loops, close_loop |
| Predictions & Patterns | 6 | anticipate, day_outlook, pattern_stats, get_predictions, record_prediction_feedback, get_anticipated_context |
| Emotions & Prosody | 10 | analyze_emotion, get_emotional_context, set/get_emotion_filter(s), get_memories_by_emotion, correct_emotion, clarify_intent, start/stop/list_emotional_session(s) |
| Relationships & Pressure | 5 | get_relationship, get_entity_pressure, set_care_circle, get_tier_stats, get_pattern_stats |
| Behavioral Identity | 3 | identify_user, behavioral_metrics, behavioral_feedback |
| Event Daemon | 4 | ingest_event, schedule_check, get_daemon_status, set_entity_vulnerability |
| LoRA | 1 | internalize_document |
| Session | 4 | get_session_continuity, get_continuity, handoff_device, recall_vote |
| System | 2 | get_status, dev_clear_collection |

---

## What's Not Wired (Implementation Gaps)

| Feature | What Exists | What's Missing | Priority |
|---------|-------------|----------------|----------|
| **Anger/Toxicity Filtering** | 57 emotion types detected via Hume.ai | No action on detection (suppress/block/flag) | CRITICAL |
| **Prosody Auto-Tagging** | MCP tools, Hume.ai integration | Pipeline from ingest -> Hume -> enriched memory | HIGH |
| **Cross-Device Event Bus** | Proposal (CROSS_DEVICE_EVENTS.md) | MongoDB change streams, get_recent_activity tool | HIGH |
| **Auto-Internalization** | LoRA service works standalone | Ingest -> LoRA weight generation not connected | MEDIUM |
| **Relevance Scorer <-> Context** | Both exist separately | Salience can't see active context frame | HIGH |
| **Cold Start Seed Data** | Synthetic generators in tests/ | No pipeline to warm up salience for new users | MEDIUM |
| **SDK Packages** | Not started | npm @memorable/sdk, pip memorable-sdk | FUTURE |
| **Gun.js Mesh** | Not started | Edge sync for sensor net | FUTURE |
| **Horizontal Scaling** | Single stateful MCP server | Stateless redesign for multi-tenant | FUTURE |
| **Database Sharding** | Not started | MongoDB sharding for 1M+ memories | FUTURE |

---

## Documentation State

### Current & Authoritative
- WIRING_STATUS.md (last updated 2026-03-01)
- CHLOE_MEMORABLE_INTEGRATION.md (integration contract)
- AUTH_ARCHITECTURE.md / PASSPHRASE_AUTH_SPEC.md
- deployment-guide.md (EC2 + Elastic IP)
- claude-ai-integration.md (MCP setup)

### Stale (Needs Update)
- **api-reference.md** — says 35 tools, actually 51
- **READINESS_ANALYSIS.md** — references dead ALB, wrong infrastructure
- **DOCUMENTATION_GAPS.md** — says 43 tools, actually 51; some gaps now closed
- **ROADMAP.md** — "NOW" items from Feb 2026 still listed as current

### Superseded (Should Be Archived)
- CHLOE_COCKTAIL_PARTY_AWARENESS.md (replaced by CHLOE_MEMORABLE_INTEGRATION.md)
- CHLOE_SENSORY_MEMORY_INTEGRATION.md (replaced by CHLOE_MEMORABLE_INTEGRATION.md)
- CHLOE_DOA_ATTENTION_INTEGRATION.md (replaced by CHLOE_MEMORABLE_INTEGRATION.md)

### Missing (Needs Writing)
- Complete MCP tools reference (51 tools with examples)
- Memory lifecycle user guide (forget/restore/suppress)
- Multi-device context architecture
- Content filtering guide (anger/toxicity)
- Energy-aware tasks guide

---

## Separate Branches

| Branch | Purpose | Relationship to Main |
|--------|---------|---------------------|
| `main` | Memory API + MCP server (the product) | Deploys on merge |
| `feature/jetson-agx-realtime-context` | Chloe robot (Jetson AGX, tiered models, Int4) | NEVER merges to main |
| `claude/oauth-pkce-python-client` | Python client OAuth | PR candidate for main |

**Rule:** Robot branches never target main. Main is the cloud product.

---

*This document is the source of truth for project status. Update on significant changes.*
