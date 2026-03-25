# MemoRable Roadmap

> **Updated:** 2026-03-24
> **Stack:** EC2 + Elastic IP (~$11/mo hobbyist) → ALB enterprise (future)
> **Status:** See `PROJECT_STATUS.md` for full service inventory

---

## DONE

| Feature | Status | Date |
|---------|--------|------|
| Entity-scoped loops | WORKING | Jan 2026 |
| Session start hook with hierarchy | WORKING | Jan 2026 |
| Knock/exchange auth | WORKING | Jan 2026 |
| 51 MCP tools (StreamableHTTP) | WORKING | Mar 2026 |
| Doc indexing (manual) | WORKING | Jan 2026 |
| Chloe integration contract | WORKING | Feb 2026 |
| Jarvis-style startup hooks | WORKING | Feb 2026 |
| Salience scoring (5 components) | WORKING | Jan 2026 |
| Feature extraction (LLM + heuristic) | WORKING | Jan 2026 |
| Open loop tracking + closure detection | WORKING | Jan 2026 |
| Care circle + distress scoring | WORKING | Jan 2026 |
| Event daemon (guardian) | WORKING | Jan 2026 |
| Emotion analysis (Hume.ai) | WIRED | Jan 2026 |
| EC2 + Elastic IP deployment | WORKING | Feb 2026 |
| HTTPS (api.memorable.chat) | WORKING | Mar 2026 |
| MCP OAuth (PKCE, public clients) | WORKING | Mar 2026 |
| Nervous system logging | WORKING | Mar 2026 |
| Bedrock LLM provider | WORKING | Mar 2026 |
| GPU auto-wake (lora_service_client) | WORKING | Mar 2026 |
| Love-filter personality injection | WORKING | Mar 2026 |
| CI tests aligned to cloud (not localhost) | WORKING | Mar 2026 |
| set_context bug fix (double-nested) | FIXED | Feb 2026 |

## NOW (Current Sprint — Mar 2026)

### P0: Safety & Core Wiring
1. **Wire anger/toxicity filtering** — emotion detected but NO action taken. Wire detection -> suppress/flag/block at ingest time. CRITICAL for Alzheimer's patients.
2. **Wire relevance scorer to active context frame** — salience can't see what you're doing. Blocks context-aware recall.
3. **Deploy set_context fix** — done in code, waiting for deploy to EC2.

### P1: Cross-Device & Prosody
4. **Cross-device event bus** — iPhone memories invisible to Claude Code. Implement MongoDB change streams + `get_recent_activity` tool (CROSS_DEVICE_EVENTS.md Option A+C).
5. **Wire prosody auto-tagging at ingest** — Hume.ai tools exist, pipeline not connected. Memory -> Hume analysis -> enriched memory at store time.

### P2: Cold Start & Docs
6. **Salience cold start pipeline** — 66-day learning window. Build synthetic data pipeline to warm up salience for new users.
7. **Update stale docs** — api-reference.md (35->51 tools), READINESS_ANALYSIS.md (ALB->EC2), archive superseded Chloe vision docs.

## NEXT (Hobbyist Tier)

- Auto-index on session start (prompt when docs changed)
- Redis attention context per-prompt
- Coordinated Claude pockets (entity-scoped context pre-loading)
- Compaction recovery (Redis time machine)
- Entity-as-kanban planning tools (everything is an entity, entities own entities)
- Auto-internalization (ingest -> LoRA weight generation)
- Document memory lifecycle (forget/restore/suppress user guide)
- Document multi-device context architecture
- Complete MCP tools reference (51 tools with examples)
- Legacy .js service deprecation audit

## FUTURE (Enterprise/ALB Tier — Adoption Phase)

> Not dead. Staged: hobbyist adoption → mem0 users tout → hackathon → corp pull.
> Cloud fleet deployment by context. Enterprise features already built once (ALB era) — can be rebuilt on current stack.

- Horizontal MCP server scaling (stateless redesign)
- Multi-tenant entity isolation
- Gun.js mesh for edge distribution
- MongoDB sharding strategy
- AWS KMS integration for Tier3 keys
- Caregiver dashboard (frontend)
- SDK packages (npm/pip)
- Hume.ai + Twilio voice (custom voice for companion)

## Decision Log

| Date | Decision |
|------|----------|
| 2026-03-24 | Robot branches NEVER target main. Main = cloud product. Separate scope. |
| 2026-03-24 | Chloe contributes to upstream via feature/jetson-agx-realtime-context |
| 2026-03-21 | Renamed robot branch: feature/chloe-tiered-models -> feature/jetson-agx-realtime-context |
| 2026-02-15 | Salience = relevant context = consistency (core equation) |
| 2026-02-15 | Everything is an entity; entities own entities; humans always top-level |
| 2026-02-15 | Kanban is a view on entity state, not a separate system |
| 2026-02-15 | Coordinated Claude pockets > one big context window |
| 2026-02-15 | Separated ALB enterprise docs from hobbyist tier |
| 2026-01-28 | Entity hierarchy for multi-tenant |
| 2026-01-28 | Loops scoped to sub-entity |
| 2026-01-28 | User-level hooks for cross-repo |

## Bugs Fixed (Recent)

| Date | Bug | Fix |
|------|-----|-----|
| 2026-03-21 | CI tests pointed at localhost not cloud | Aligned smoke + load tests to Elastic IP |
| 2026-03-21 | CI tests referenced server.js not MCP server | Aligned to deployed MCP server |
| 2026-02-15 | `set_context` crashes: `memory.memory.text` (double-nested) | Fixed to `memory.text` in context_frame.ts/.js |
| 2026-01-30 | `list_loops` returns memory chunks (190 "undefined" entries) | Fixed endpoint + cleaned collection |
