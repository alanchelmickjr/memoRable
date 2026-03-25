# MemoRable Completion Plan

> **Created:** 2026-03-24
> **Branch:** `main` (cloud memory API + MCP server)
> **Baseline:** 51 tools, 1,586 tests, all services operational

This plan covers what's left to build, in priority order. Each phase can ship independently.

---

## Phase 1: Safety & Core Wiring (P0)

These block production use with vulnerable users (Alzheimer's patients, children).

### 1.1 Anger/Toxicity Content Filtering
**Status:** Detection exists (57 emotion types via Hume.ai). No action taken.
**Files:** `humeService.js`, `emotionalContextService.js`, `mcp_server/index.ts`
**Work:**
- Define content policy: which emotions trigger which actions at what thresholds
- Wire emotion detection output into ingestion pipeline (store_memory handler)
- Implement actions: flag, suppress, block, notify care circle
- Add audit trail for filtered content
- Test with synthetic toxic content

### 1.2 Wire Relevance Scorer to Active Context Frame
**Status:** Both exist separately. Salience can't see what you're doing.
**Files:** `salience_calculator.ts`, `context_frame.ts`, `mcp_server/index.ts`
**Work:**
- Pass active context frame into salience scoring at recall time
- Boost memories matching current context (location, people, activity, project)
- Test: set_context with location -> recall -> verify context-relevant memories rank higher

### 1.3 Deploy set_context Fix
**Status:** Fixed in code (memory.memory.text -> memory.text). Not deployed.
**Work:**
- Verify fix on branch
- Merge to main (triggers deploy)
- Verify on live endpoint

---

## Phase 2: Cross-Device & Enrichment (P1)

These enable the multi-device experience and richer memory storage.

### 2.1 Cross-Device Event Bus
**Status:** Proposal written (CROSS_DEVICE_EVENTS.md). Not built.
**Design:** Option A (MongoDB change streams) + Option C (get_recent_activity tool)
**Files:** `mcp_server/index.ts`, new `event_bus/` module
**Work:**
- Add `get_recent_activity` MCP tool (poll-based, simple)
- Add MongoDB change stream listener for real-time push
- Add session startup hook to load recent activity from other devices
- Store cursor position in session state
- Test: store memory via Claude.ai -> Claude Code sees it on next session start

### 2.2 Prosody Auto-Tagging at Ingest
**Status:** MCP tools exist. Pipeline not connected.
**Files:** `mcp_server/index.ts` (store_memory handler), `emotion_analyzer_client.ts`
**Work:**
- In store_memory handler, after salience scoring, call emotion analyzer
- Enrich memory document with prosody/emotion tags before MongoDB write
- Add prosody fields to memory schema (emotion type, confidence, valence, arousal)
- Test: store memory with emotional text -> verify emotion tags in stored document

### 2.3 Auto-Internalization (LoRA at Ingest)
**Status:** LoRA service works standalone. Not triggered by memory ingest.
**Files:** `mcp_server/index.ts`, `lora_service_client.ts`
**Work:**
- After store_memory, check if document meets internalization threshold (length, salience)
- Call lora_service_client.internalize() asynchronously (don't block ingest)
- Store weights_key alongside memory in MongoDB
- Use ensureAvailable() to auto-wake GPU if needed
- Test: store long document -> verify LoRA weights generated and stored

---

## Phase 3: Cold Start & Documentation (P2)

These enable new users and developers to get value quickly.

### 3.1 Synthetic Data Pipeline for Cold Start
**Status:** Generators exist in tests/synthetic/. No pipeline to warm up salience.
**Files:** `tests/synthetic/`, new `scripts/seed_salience.js`
**Work:**
- Build script that generates 66 days of realistic temporal patterns
- Seed learned_patterns collection with pre-computed patterns
- Seed accessHistory with realistic access patterns for FFT
- Make it idempotent (can re-run without duplicating)
- Test: run seed -> verify anticipate() returns meaningful predictions immediately

### 3.2 Complete MCP Tools Reference
**Status:** api-reference.md says 35 tools. Reality is 51.
**Files:** `docs/api-reference.md`
**Work:**
- Document all 51 tools with parameters, returns, and examples
- Organize by category (matches WIRING_STATUS.md categories)
- Add REST endpoint mapping for each tool

### 3.3 Archive Superseded Docs
**Status:** 3 Chloe vision docs superseded by CHLOE_MEMORABLE_INTEGRATION.md
**Work:**
- Move to docs/archive/:
  - CHLOE_COCKTAIL_PARTY_AWARENESS.md
  - CHLOE_SENSORY_MEMORY_INTEGRATION.md
  - CHLOE_DOA_ATTENTION_INTEGRATION.md
- Add "superseded by CHLOE_MEMORABLE_INTEGRATION.md" header to each

### 3.4 Write Missing Docs
- Memory lifecycle user guide (forget/restore/suppress/archive)
- Multi-device context architecture
- Energy-aware tasks guide
- Content filtering guide (once 1.1 is built)

---

## Phase 4: Hardening (P2)

### 4.1 Legacy Service Deprecation Audit
**Status:** 8 .js services of unclear purpose
**Work:**
- Audit each: confidenceService, taskHopper, responseRefinement, modelSelection, customModel, videoStream
- For each: keep (document), deprecate (mark), or remove (delete)

### 4.2 Commit Untracked Test Files
**Status:** 36 test files in git status, not committed
**Work:**
- Review each test file for secrets/hardcoded values
- Add to git, commit on feature branch, PR to main

### 4.3 Redis Encryption at Rest
**Status:** Redis on EC2 is local-only, not encrypted at rest
**Work:**
- Evaluate Redis encryption options on t4g.micro
- Implement or document as accepted risk for hobbyist tier

---

## Phase 5: Enterprise Features (Future)

These are for the enterprise/ALB tier. Already built once in ALB era, can be rebuilt.

| Feature | Notes |
|---------|-------|
| Horizontal MCP scaling | Stateless redesign for multi-tenant |
| Multi-tenant entity isolation | ENTITY_HIERARCHY_PLAN.md exists |
| Gun.js mesh | Edge sync for sensor net (robots, glasses, IoT) |
| MongoDB sharding | For 1M+ memories |
| AWS KMS for Tier3 | Key management for E2EE vault |
| Caregiver dashboard | Frontend (PORTAL_SPEC.md exists) |
| SDK packages | npm @memorable/sdk, pip memorable-sdk |
| Hume.ai + Twilio voice | Custom voice for companion personality |

---

## Tracking

Each phase gets its own branch (`claude/phase-1-safety`, etc.). PRs to main on completion. One concern per branch.

| Phase | Branch | Status |
|-------|--------|--------|
| Status & docs audit | `claude/project-status-and-doc-updates` | IN PROGRESS |
| Phase 1: Safety | TBD | NOT STARTED |
| Phase 2: Cross-device | TBD | NOT STARTED |
| Phase 3: Cold start & docs | TBD | NOT STARTED |
| Phase 4: Hardening | TBD | NOT STARTED |
| Phase 5: Enterprise | TBD | FUTURE |

---

*Update this doc as phases complete. Each phase ships independently.*
