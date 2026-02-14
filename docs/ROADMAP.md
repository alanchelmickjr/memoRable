# MemoRable Roadmap

## DONE

| Feature | Status | Date |
|---------|--------|------|
| Entity-scoped loops | WORKING | 2026-01-28 |
| Session start hook with hierarchy | WORKING | 2026-01-28 |
| Knock/exchange auth | WORKING | 2026-01-28 |
| 43+ MCP tools | WORKING | 2026-01-18 |
| Doc indexing (manual) | WORKING | 2026-01-28 |
| Dual MCP/HTTP hooks | WORKING | 2026-02-14 |
| Dead service cleanup | 3 deleted (confidence, responseRefinement, taskHopper) | 2026-02-14 |
| JS/TS consolidation | 21 duplicate .js files removed from salience_service | 2026-02-14 |
| Terraform purge | Directory + bootstrap script removed | 2026-02-14 |
| Hardcoded URL purge | opus-timer.cjs, env-only now | 2026-02-14 |
| Test suite green | 788/788 passing, 0 failures | 2026-02-14 |
| Legacy service audit | Audited 6 services: 3 deleted, 3 kept (SDK/future) | 2026-02-14 |

## NOW

- **Auto-index on session start** - Hook detects doc changes. Missing: actually index docs into MemoRable memory so `recall` returns hits. Memory is empty because nothing feeds it.
- **Cross-repo hooks (user-level)** - Move hooks to `~/.claude/hooks/` so MemoRable works in any project. Enables `claude "init project"` anywhere.

## NEXT

- **Redis attention context per-prompt** - Per-prompt context caching. Plan doc: `REDIS_CONTEXT_HOOKS_PLAN.md`
- **Smart context compaction** - PreCompact hook analyzes task complexity and signals optimal threshold (static threshold is dumb)
- **Dashboard auth** - Passphrase login for dashboards, session-based via Redis. Plan doc: `DASHBOARD_AUTH_PLAN.md`
- Anger/toxicity filtering
- Prosody tagging at ingest
- Gun.js mesh for edge

## Decision Log

| Date | Decision |
|------|----------|
| 2026-02-14 | Phase 1 cleanup: delete dead code before adding features |
| 2026-02-14 | .ts is canonical source in salience_service, .js dupes removed |
| 2026-02-14 | SDK services (customModel, modelSelection, scad) kept for future |
| 2026-01-28 | Entity hierarchy for multi-tenant |
| 2026-01-28 | Loops scoped to sub-entity |
| 2026-01-28 | User-level hooks for cross-repo |
