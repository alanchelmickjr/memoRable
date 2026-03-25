# MemoRable Readiness Analysis

**Date**: 2026-01-23
**Updated**: 2026-03-24
**Status**: Production (EC2 + Elastic IP, api.memorable.chat)

> **NOTE (Mar 2026):** Original doc referenced ALB stack (`memorable-alb-*.us-west-2.elb.amazonaws.com`)
> which was decommissioned Feb 2026. Infrastructure now runs on EC2 + Elastic IP (~$11/mo vs $122/mo).
> See `PROJECT_STATUS.md` for current state and `deployment-guide.md` for current stack.

---

## Infrastructure Status

| Component | Status | Notes |
|-----------|--------|-------|
| EC2 + Elastic IP (us-west-1) | LIVE | 52.9.62.72:8080 (t4g.micro, ~$11/mo) |
| ~~ALB (us-west-2)~~ | DEAD | Decommissioned Feb 2026 |
| HTTPS (api.memorable.chat) | LIVE | nginx + Let's Encrypt, cert expires 2026-05-17 |
| Auth (knock/exchange) | WORKING | Passphrase-based, 5min challenge TTL |
| MongoDB Atlas | CONNECTED | Cloud, encrypted at rest |
| REST API (/memory, /auth) | WORKING | Store, recall, vote all functional |
| MCP Server (stdio + HTTP) | WORKING | 51 tools, StreamableHTTP on port 8080 |
| MCP OAuth (PKCE) | WORKING | Claude.ai public client support (PRs #58-#63) |
| CI/CD | ACTIVE | Push to main triggers deploy |
| Session-start hook | WORKING | Auth + context loading on Claude Code start |

## What Works Today

- **Memory storage**: Store via MCP, persists to MongoDB Atlas, word-based recall + vector search
- **Authentication**: Knock/exchange flow, per-device API keys, OAuth/PKCE for Claude.ai
- **MCP tools**: 51 tools available via stdio + StreamableHTTP
- **Session context**: Hook loads project context, docs, open loops on start
- **Salience scoring**: Real-time at ingest (emotion 30%, novelty 20%, relevance 20%, social 15%, consequential 15%)
- **HTTPS**: api.memorable.chat with auto-renewing cert
- **Bedrock LLM**: AWS IAM role, no API keys needed
- **Tests**: 46 suites, 1,586 passing (was 293 in Jan)

## What's Deployed But Untested

| Feature | Code Status | Test Status | Gap |
|---------|-------------|-------------|-----|
| FFT pattern detection | Implemented | NO TESTS | Critical - 21/63 day windows |
| Predictive anticipation | Implemented | NO TESTS | Need synthetic data |
| Context gate/filter | Implemented | NO TESTS | Need multi-context scenarios |
| Entity pressure tracking | Implemented | NO TESTS | Need cascade scenarios |
| Emotion analysis | Implemented | NO TESTS | Need prosody data |
| Tier manager (hot/warm/cold) | Implemented | NO TESTS | Need access pattern data |
| Event daemon (guardian) | Implemented | NO TESTS | Need external event simulation |
| Behavioral identity | Implemented | NO TESTS | Need multi-user patterns |
| Care circle alerts | Implemented | NO TESTS | Need vulnerability scenarios |

## The 66-Day Problem

Pattern learning requires **21 days** to form and **63 days** to stabilize. Without synthetic data:
- No pattern will form until 21 days after first user stores memories
- No pattern will be reliable until 63 days in
- If we reset, users start over

**Solution**: Synthetic data pipeline that pre-loads realistic temporal patterns so the system is "warm" from day 1.

## Security Posture

| Layer | Status |
|-------|--------|
| HTTPS | Required in prod, HTTP allowed in dev (ALLOW_HTTP_DEV) |
| Passphrase auth | Working, dev passphrase public |
| API key per-device | Working, revocable |
| Tier1 (General) | Implemented, external LLM OK |
| Tier2 (Personal) | Implemented, local LLM only (default) |
| Tier3 (Vault) | Implemented, E2EE, no LLM, encrypted at rest |
| No secrets in git | Enforced by .gitignore + CLAUDE.md rules |

## Test Coverage

- **293 passing tests** (as of LAUNCH_READINESS.md audit)
- **0 pattern formation tests** (critical gap)
- **0 pipeline throughput tests** (unknown ceiling)
- **0 memory leak tests** (unknown stability under load)

## Production Blockers

1. **No synthetic data pipeline** - can't validate pattern learning works
2. **MCP HTTP transport** - just fixed, needs deployment verification
3. **No load testing** - don't know throughput limits
4. **Tool count mismatch** - docs say 35, reality is 43 (cosmetic but confusing)

## Production Ready (No Blockers)

1. Auth flow
2. Memory CRUD
3. MCP stdio transport
4. Session hooks
5. CI/CD pipeline
6. MongoDB persistence
7. Salience scoring (heuristic)
8. Multi-project support
