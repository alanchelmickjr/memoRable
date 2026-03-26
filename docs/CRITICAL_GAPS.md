# Critical Gaps — Coder Handoff

**Generated:** 2026-03-26
**Purpose:** Actionable work items identified by code review. Pick these up in order of priority.

---

## Priority 1 — Safety-Critical (Fix First)

### 1. Emotion Detection → No Action
**What's broken:** Emotion detection and distress scoring are wired at ingest. The care circle notification exists. But anger/toxicity detection has no suppression or filtering action. The detection loop is complete; the response loop is broken.

**Where to look:**
- `src/services/salience_service/` — emotion analyzer
- `src/services/mcp_server/index.ts` — `analyze_emotion`, `get_entity_pressure` tools
- `WIRING_STATUS.md` — Emotion section

**What to build:** When toxicity/anger score exceeds threshold, trigger: (1) content flag on stored memory, (2) optional care circle alert, (3) MCP tool response indicating flagged content. Mirror the existing distress → care circle pattern.

---

### 2. Salience Scorer Is Blind to Active Context Frame
**What's broken:** The salience calculator scores memories at ingest but cannot see the current context frame (who the user is with, where they are, what activity is active). Relevance component (20% weight) is therefore underinformed.

**Where to look:**
- `src/services/salience_service/salience_calculator.ts` — relevance scoring
- `src/services/salience_service/session_continuity.ts` — context frame
- `SALIENCE_AUDIT_AND_CONTEXT_ARCHITECTURE.md`

**What to build:** Pass the active context frame into `calculateSalience()` at call time. The context frame is already in Redis — pull it before scoring and use location/activity/participants to boost the relevance component.

---

## Priority 2 — Wiring Incomplete

### 3. Prosody Pipeline Disconnected
**What's broken:** Hume.ai client exists. Emotion analysis tool exists. But the prosody pipeline (voice → emotion tags → memory annotation) is not connected to the ingest flow.

**Where to look:**
- `src/services/mcp_server/index.ts` — `analyze_emotion` tool
- `WIRING_STATUS.md` — Prosody section

**What to build:** When `store_memory` receives audio/prosody metadata, route it through `analyze_emotion` before salience scoring so emotional weight is based on voice tone, not just text content.

---

### 4. Auto-Internalization Not Triggered
**What's broken:** The LoRA service (`src/services/lora_service/`) works. The doc-to-lora submodule works. But ingest never triggers internalization — the bridge (`lora_service_client.ts`) is not called from `store_memory`.

**Where to look:**
- `src/services/mcp_server/lora_service_client.ts`
- `src/services/lora_service/app.py` — `/internalize` endpoint
- `DOC_TO_LORA_INTEGRATION.md`

**What to build:** After a memory hits a salience threshold (e.g. >80), queue it for internalization via `lora_service_client`. Don't block the ingest response — fire async. Add a `internalize_memory` MCP tool to trigger manually.

---

## Priority 3 — Scalability Blockers

### 5. Single Stateful MCP Server
**What's broken:** The MCP server holds in-memory state. Cannot run multiple instances. Blocks horizontal scaling and multi-tenant deployment.

**What to build:** Move all session/context state to Redis (already partially done). Stateless MCP handler that reads from Redis/MongoDB only. Then any number of instances can run behind a load balancer.

---

### 6. Redis Not Encrypted at Rest
**What's broken:** Redis stores hot-tier memories and context frames. For Alzheimer's/care deployments this is a compliance and safety issue — sensitive personal data unencrypted in memory.

**What to build:** Enable Redis AUTH + TLS. For Vault-tier memories, encrypt values before writing to Redis (not just at MongoDB layer). See `SECURITY_ARCHITECTURE.md` for the encryption primitives already in place.

---

## Priority 4 — Maintenance Debt

### 7. server.js Is 12,800 Lines
Not a bug, but a liability. Every feature addition increases the risk of breaking something unrelated. The dashboard routes, auth routes, admin routes, and memory API routes should each be an Express router in their own file.

**Suggested split:**
- `src/routes/auth.js`
- `src/routes/memory.js`
- `src/routes/admin.js`
- `src/routes/pages.js` (HTML-rendering routes)
- Dashboard already extracted to `src/services/dashboard/`

---

### 8. Documentation Drifted from Code
The following docs have stale counts or dead references. Update after any tool changes:

| Doc | Stale Info |
|-----|-----------|
| `docs/api-reference.md` | Says 35 MCP tools — actually 51 |
| `docs/DOCUMENTATION_GAPS.md` | Says 43 tools |
| `docs/READINESS_ANALYSIS.md` | References dead ALB (`memorable-alb-*.us-west-2.elb.amazonaws.com`) |
| `docs/ROADMAP.md` | Feb 2026 items marked as current |

---

## Reference — Architecture That Is Working

Don't touch these — they're correct and wired:

- Salience scoring at ingest (5-component, real-time) ✅
- Tiered security (General/Personal/Vault) with per-tier encryption ✅
- Open loop tracking (commitments, questions, follow-ups) ✅
- Prediction hook generation at ingest ✅
- Guardian/Event Daemon scam detection ✅
- Care circle alerts on distress ✅
- 51 MCP tools via StreamableHTTP ✅
- MongoDB Atlas + Redis dual storage ✅
- CI/CD (GitHub Actions) + HTTPS (Let's Encrypt) ✅
