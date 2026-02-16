# MemoRable Roadmap

> **Updated:** 2026-02-15
> **Stack:** EC2 + Elastic IP (~$11/mo hobbyist) → ALB enterprise (future)

---

## DONE

| Feature | Status | Date |
|---------|--------|------|
| Entity-scoped loops | WORKING | Jan 2026 |
| Session start hook with hierarchy | WORKING | Jan 2026 |
| Knock/exchange auth | WORKING | Jan 2026 |
| 43 MCP tools (StreamableHTTP) | WORKING | Feb 2026 |
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

## NOW (Current Sprint)

- **Fix set_context bug** (memory.memory.text → memory.text) — done, needs deploy
- **Wire relevance scorer to active context frame** — salience can't see what you're doing
- **Entity-as-kanban planning tools** — everything is an entity, entities own entities
- **Salience cold start** — 66-day learning window, needle wild for 7+ days
- **Deploy and test context system end-to-end**

## NEXT (Hobbyist Tier)

- Auto-index on session start (prompt when docs changed)
- Redis attention context per-prompt
- Coordinated Claude pockets (entity-scoped context pre-loading)
- Compaction recovery (Redis time machine)
- Anger/toxicity filtering (detection exists, action missing)
- Prosody tagging at ingest

## FUTURE (Enterprise/ALB Tier — Adoption Phase)

> Not dead. Staged: hobbyist adoption → mem0 users tout → hackathon → corp pull.
> Cloud fleet deployment by context.

- ALB + ACM certificate for HTTPS
- Horizontal MCP server scaling (stateless redesign)
- Multi-tenant entity isolation
- Gun.js mesh for edge distribution
- MongoDB sharding strategy
- AWS KMS integration for Tier3 keys
- Caregiver dashboard (frontend)
- SDK packages (npm/pip)
- Grant proposal (Feb 16, 2026)

## Decision Log

| Date | Decision |
|------|----------|
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
| 2026-02-15 | `set_context` crashes: `memory.memory.text` (double-nested) | Fixed to `memory.text` in context_frame.ts/.js |
| 2026-01-30 | `list_loops` returns memory chunks (190 "undefined" entries) | Fixed endpoint + cleaned collection |
