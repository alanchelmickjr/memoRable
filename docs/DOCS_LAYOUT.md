# MemoRable Documentation Layout

> Master index of all documentation. This is a living project - the docs index themselves.

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Understand the architecture | [Architecture](#architecture--system-design) |
| Deploy MemoRable | [Operations](#deployment--operations) |
| Integrate with Claude | [Integration](#integration--external-systems) |
| Understand security | [Security](#security-privacy--encryption) |
| Learn the data models | [Data Models](#data-models--schemas) |
| Explore research | [Research](#research--advanced-concepts) |

---

## Architecture & System Design

### Core Architecture
| Document | Description |
|----------|-------------|
| [technical-architecture.md](./technical-architecture.md) | Complete system overview, microservices, Docker orchestration |
| [DATA_FLOW_DIAGRAM.md](./DATA_FLOW_DIAGRAM.md) | Data flow from ingestion through storage to retrieval |
| [SYSTEM_FLOW_DIAGRAM.md](./SYSTEM_FLOW_DIAGRAM.md) | Process orchestration and service interactions |
| [total_recall_specification.md](./total_recall_specification.md) | Memory Memento structure, temporal/spatial/emotional contexts |

### Advanced Patterns
| Document | Description |
|----------|-------------|
| [loom-architecture.md](./loom-architecture.md) | The Loom: weaving moments from seven threads |
| [specialist-ensemble.md](./specialist-ensemble.md) | Seven specialists architecture (digital twin) |
| [where-transforms-meaning.md](./where-transforms-meaning.md) | WHERE as context transformer |
| [ENGINE_LAYER_DESIGN.md](./ENGINE_LAYER_DESIGN.md) | Core processing engine design |

---

## Data Models & Schemas

| Document | Description |
|----------|-------------|
| [ingestion_service_domain_model.md](./ingestion_service_domain_model.md) | MemoryMemento, RawInputData, ProcessedInputData |
| [ingestion_service_architecture.md](./ingestion_service_architecture.md) | Pipeline: API → Preprocessing → Memento → Storage |
| [ingestion_service_requirements.md](./ingestion_service_requirements.md) | Functional requirements for ingestion |
| [ingestion_service_pseudocode.md](./ingestion_service_pseudocode.md) | Implementation reference |
| [embedding_service_strategy.md](./embedding_service_strategy.md) | Embedding model strategies |

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
| [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) | Pre-launch assessment |
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

---

## User Experience

| Document | Description |
|----------|-------------|
| [UI_AND_USER_SYSTEM_PLAN.md](./UI_AND_USER_SYSTEM_PLAN.md) | UI and system planning |
| [UI_INVENTORY.md](./UI_INVENTORY.md) | UI component catalog |
| [ROAD_TEST_PLAN.md](./ROAD_TEST_PLAN.md) | Real-world testing plan |
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
| [WIRING_STATUS.md](./WIRING_STATUS.md) | Component integration status |
| [DOCUMENTATION_GAPS.md](./DOCUMENTATION_GAPS.md) | Gap analysis: built vs documented |
| [REPO_INDEXING_DESIGN.md](./REPO_INDEXING_DESIGN.md) | Code search and retrieval |

---

## Archive (Historical)

| Document | Description |
|----------|-------------|
| [archive/memoRable_implementation_plan.md](./archive/memoRable_implementation_plan.md) | Original implementation plan |
| [archive/3_core_concepts.md](./archive/3_core_concepts.md) | Historical core concepts |
| [archive/4_user_guide.md](./archive/4_user_guide.md) | Historical user guide |
| [archive/5_api_reference.md](./archive/5_api_reference.md) | Historical API reference |
| [archive/6_components_reference.md](./archive/6_components_reference.md) | Historical components |

---

## Key Insights

1. **Real-Time Processing**: NNNA (batch) deprecated → Real-Time Relevance Engine at ingest
2. **Security-First**: Three encryption tiers with zero-knowledge for Tier3
3. **Seven Specialists**: Digital twin with specialized micro-models
4. **Research-Backed**: Continual learning, Engram patterns, 3x7 temporal model
5. **Self-Documenting**: The indexer indexes itself (living project)

---

*Last indexed: Auto-updated by `scripts/index-simple.ts`*
