# MemoRable Documentation Layout

> Master index of all documentation. This is a living project - the docs index themselves.

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Understand the architecture | [Architecture](#architecture--system-design) |
| Check readiness status | [Readiness](#readiness--status) |
| Deploy MemoRable | [Operations](#deployment--operations) |
| Integrate with Claude | [Integration](#integration--external-systems) |
| Understand security | [Security](#security-privacy--encryption) |
| Test the pipeline | [Testing & Synthetic Data](#testing--synthetic-data) |
| Explore research | [Research](#research--advanced-concepts) |

---

## Readiness & Status

| Document | Description |
|----------|-------------|
| [READINESS_ANALYSIS.md](./READINESS_ANALYSIS.md) | Current system state, what works, what's untested, blockers |
| [NEXT_STEPS_SYNTHETIC_PIPELINE.md](./NEXT_STEPS_SYNTHETIC_PIPELINE.md) | Synthetic data plan for 21/63-day pattern validation |
| [WIRING_STATUS.md](./WIRING_STATUS.md) | Component integration status (43 MCP tools) |
| [DOCUMENTATION_GAPS.md](./DOCUMENTATION_GAPS.md) | Gap analysis: built vs documented |
| [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) | Pre-launch assessment (293 tests passing) |

---

## Architecture & System Design

### Core Architecture
| Document | Description |
|----------|-------------|
| [DATA_FLOW_DIAGRAM.md](./DATA_FLOW_DIAGRAM.md) | Data flow from ingestion through storage to retrieval |
| [SYSTEM_FLOW_DIAGRAM.md](./SYSTEM_FLOW_DIAGRAM.md) | Process orchestration and service interactions |

### Advanced Patterns
| Document | Description |
|----------|-------------|
| [loom-architecture.md](./loom-architecture.md) | The Loom: weaving moments from seven threads |
| [specialist-ensemble.md](./specialist-ensemble.md) | Seven specialists architecture (digital twin) |
| [where-transforms-meaning.md](./where-transforms-meaning.md) | WHERE as context transformer |
| [ENGINE_LAYER_DESIGN.md](./ENGINE_LAYER_DESIGN.md) | Core processing engine design |

---

## Memory Intelligence

| Document | Description |
|----------|-------------|
| [project-memory.md](./project-memory.md) | Project as entity, curation, comprehension synthesis |
| [design/relationship-intelligence.md](./design/relationship-intelligence.md) | Pressure tracking, computed relationships, prediction |
| [CONTEXT_FILTER_SPEC.md](./CONTEXT_FILTER_SPEC.md) | Memory relevance filtering |
| [PERSONA_ENGINE_DESIGN.md](./PERSONA_ENGINE_DESIGN.md) | Identity synthesis from memories |

---

## Security, Privacy & Encryption

| Document | Description |
|----------|-------------|
| [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) | Three-tier encryption (General, Personal, Vault) |
| [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) | Authentication mechanisms |
| [PASSPHRASE_AUTH_SPEC.md](./PASSPHRASE_AUTH_SPEC.md) | Challenge-response auth protocol |
| [REST_MODE_SECURITY.md](./REST_MODE_SECURITY.md) | REST API security |
| [7_advanced_usage.md](./7_advanced_usage.md) | Security tiers, custom pipelines |

---

## Deployment & Operations

| Document | Description |
|----------|-------------|
| [deployment-guide.md](./deployment-guide.md) | Docker Compose, environment config, monitoring |
| [DEPLOYMENT_DIAGNOSTIC.md](./DEPLOYMENT_DIAGNOSTIC.md) | Troubleshooting and validation |
| [SCALABILITY_ANALYSIS.md](./SCALABILITY_ANALYSIS.md) | Scale projections (1K-1M users), cost models |
| [metrics-framework.md](./metrics-framework.md) | 3x7 temporal model, tuning levers |
| [metrics-landscape.md](./metrics-landscape.md) | CloudWatch integration, alert tiers |

---

## Integration & External Systems

| Document | Description |
|----------|-------------|
| [claude-ai-integration.md](./claude-ai-integration.md) | Claude.ai connector, OAuth 2.0, MCP |
| [example-prompts.md](./example-prompts.md) | Sample prompts for testing |
| [api-reference.md](./api-reference.md) | REST API documentation |
| [ROBOT_FLEET_DEPLOYMENT.md](./ROBOT_FLEET_DEPLOYMENT.md) | AR glasses, robots, IoT sensors |
| [SENSOR_PUBSUB_ARCHITECTURE.md](./SENSOR_PUBSUB_ARCHITECTURE.md) | Pub/Sub for sensor data |
| [CHLOE_SENSORY_MEMORY_INTEGRATION.md](./CHLOE_SENSORY_MEMORY_INTEGRATION.md) | Chloe: full-time awareness, sensory conjunction, multi-body continuity |

---

## Testing & Synthetic Data

| Document | Description |
|----------|-------------|
| [NEXT_STEPS_SYNTHETIC_PIPELINE.md](./NEXT_STEPS_SYNTHETIC_PIPELINE.md) | Full plan: generators, verification, pipeline analysis |
| [ROAD_TEST_PLAN.md](./ROAD_TEST_PLAN.md) | Real-world testing plan |
| [example-prompts.md](./example-prompts.md) | Sample prompts for testing |

---

## User Experience

| Document | Description |
|----------|-------------|
| [UI_AND_USER_SYSTEM_PLAN.md](./UI_AND_USER_SYSTEM_PLAN.md) | UI and system planning |
| [UI_INVENTORY.md](./UI_INVENTORY.md) | UI component catalog |
| [README_USER_TESTING_NOTES.md](./README_USER_TESTING_NOTES.md) | User feedback |
| [PORTAL_SPEC.md](./PORTAL_SPEC.md) | Portal specification |

---

## Research & Advanced Concepts

| Document | Description |
|----------|-------------|
| [research/continual-learning-architecture.md](./research/continual-learning-architecture.md) | Mirzadeh et al. application to memory |
| [research/engram-predictive-memory.md](./research/engram-predictive-memory.md) | O(1) pattern lookup, anticipatory memory |
| [research/testing-methodology.md](./research/testing-methodology.md) | Research claim validation |

---

## Project Management

| Document | Description |
|----------|-------------|
| [PROJECT_FLOW.md](./PROJECT_FLOW.md) | Development workflow |
| [REPO_INDEXING_DESIGN.md](./REPO_INDEXING_DESIGN.md) | Code search and retrieval |

---

## Archive (Historical - NNNA/Batch Era)

> These documents describe the deprecated NNNA (Nocturnal batch processing) architecture.
> Real-time processing replaced batch as of 2025. Kept for reference only.

| Document | Description |
|----------|-------------|
| [archive/total_recall_specification.md](./archive/total_recall_specification.md) | Memory Memento spec (NNNA-era) |
| [archive/technical-architecture.md](./archive/technical-architecture.md) | Old system overview with NNNA |
| [archive/ingestion_service_architecture.md](./archive/ingestion_service_architecture.md) | Old pipeline with NNNA schema updates |
| [archive/ingestion_service_requirements.md](./archive/ingestion_service_requirements.md) | Old requirements referencing NNNA |
| [archive/ingestion_service_domain_model.md](./archive/ingestion_service_domain_model.md) | Old data model with NNNA dependency |
| [archive/ingestion_service_pseudocode.md](./archive/ingestion_service_pseudocode.md) | Old implementation reference |
| [archive/memoRable_implementation_plan.md](./archive/memoRable_implementation_plan.md) | Original implementation plan |
| [archive/3_core_concepts.md](./archive/3_core_concepts.md) | Historical core concepts |
| [archive/4_user_guide.md](./archive/4_user_guide.md) | Historical user guide |
| [archive/5_api_reference.md](./archive/5_api_reference.md) | Historical API reference |
| [archive/6_components_reference.md](./archive/6_components_reference.md) | Historical components |

---

## Key Principles

1. **Real-Time Processing**: All salience scoring, pattern learning at ingest time (not batch)
2. **Cloud-First**: AWS us-west-2 staging, us-west-1 production. Push to deploy.
3. **Security-First**: Three encryption tiers with zero-knowledge for Tier3
4. **21/63-Day Pattern Windows**: Formation at 21 days, stability at 63 days (3x7 temporal model)
5. **43 MCP Tools**: Full memory intelligence accessible from any Claude Code project
6. **Self-Documenting**: The indexer indexes itself (living project)

---

*Last updated: 2026-01-23*
