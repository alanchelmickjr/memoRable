# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ALAN'S CODING RULES - READ FIRST

**NEVER DO THESE THINGS:**

1. **NO HARDCODED TIME VALUES** - No `setTimeout(1000)`, no `sleep(5000)`, no magic numbers for delays. Use environment variables or constants with clear names.

2. **NO SECRETS TO GIT** - Never commit API keys, tokens, passwords, or any sensitive data. Check `.env.example` exists, use environment variables, and verify `.gitignore` covers secret files BEFORE committing.

These are non-negotiable. Alan has asked Claude to remember this across every session.

---

## Core Philosophy - The Three Pillars

```
1. TEMPORAL CONTROL    → The power to CHOOSE what to forget (superpower)
2. INDIVIDUAL PRIVACY  → TOP SECRET by default, Fort Knox for personal data
3. RELEVANCE          → ATR: What matters RIGHT NOW, not everything
```

These three principles govern ALL design decisions. When in doubt, ask:
- Can the user forget this? (temporal)
- Is this protected at every layer? (privacy)
- Is this surfaced at the right moment? (relevance)

## Project Overview

MemoRable is a context-aware memory system for AI agents that extends Mem0 with salience scoring, commitment tracking, relationship intelligence, and predictive memory. It provides 35 MCP tools for Claude Code integration.

## Development Commands

```bash
# Install dependencies and setup
npm install && npm run setup    # Auto-generates .env from .env.example

# Build and develop
npm run build                   # Rollup build
npm run dev                     # Watch mode

# Testing
npm test                        # Run Jest tests
npm run test:watch              # Watch mode
npm run test:coverage           # Coverage report

# Code quality
npm run lint                    # ESLint
npm run lint:fix                # Auto-fix
npm run format                  # Prettier

# Docker operations
docker-compose up -d            # Start all 16 services
docker-compose logs -f          # View logs
npm run docker:clean            # Remove volumes
npm run docker:rebuild          # Force rebuild

# Health check
curl http://localhost:3000/health
```

### Running a Single Test

```bash
npx jest tests/services/salience_service/feature_extractor.test.ts
```

Note: Some tests are temporarily skipped due to ESM/TS issues (see `testPathIgnorePatterns` in jest.config.js).

## Architecture

### Core Services (in `src/services/`)

- **salience_service/**: Core memory intelligence - salience scoring (emotion 30%, novelty 20%, relevance 20%, social 15%, consequential 15%), open loop tracking, relationship health, briefing generation, anticipation (21-day pattern learning), context frames, adaptive learning, **Real-Time Relevance Engine** (all processing at ingest time, no batch)
- **mcp_server/**: 35 MCP tools for Claude Code (store_memory, recall, get_briefing, list_loops, close_loop, set_context, whats_relevant, anticipate, get_relationship, get_predictions, etc.)
- **ingestion_service/**: Memory ingestion API (port 8001)
- **embedding_service/**: Vector embeddings generation (port 3003)
- **retrieval_service/**: Memory retrieval and real-time relevance ranking (port 3004)

### Data Storage

- **MongoDB**: Document storage for memories, relationships, patterns, open loops
- **Redis**: Context frames, caching, session state
- **Weaviate**: Vector database for semantic search

### Key Patterns

- **ES Modules**: Project uses `"type": "module"` - use `import/export` syntax
- **Dual Storage**: MongoDB for structured data, Weaviate for vectors
- **Memory Windows**: Short (20min), Medium (1hr), Long (24hr) configurable via env
- **LLM Providers**: Supports Anthropic, OpenAI, AWS Bedrock (auto-detected)

## Docker Services

The `docker-compose.yml` runs services across categories:
- **Core**: memorable_app (3000), memorable_mcp_server, memorable_ingestion_service (8001)
- **Processing**: memorable_embedding_service (3003), memorable_retrieval_service (3004)
- **Data**: memorable_mongo (27017), memorable_redis (6379), memorable_weaviate (8080)
- **LLM**: memorable_ollama (11434)
- **Monitoring**: memorable_prometheus (9090), memorable_grafana (3001), exporters

### Architecture Notes

**Real-Time Relevance Engine**: NNNA (Nocturnal batch processing) was deprecated. All salience scoring, pattern learning, and relationship updates happen at ingest time. 10x TOPS at lower $ made batch processing obsolete.

**CloudFormation vs Package**: CloudFormation (`cloudformation/`) is for deploying **sensors in the world** - the distributed sensor net of devices. This includes:
- AR glasses (Alzheimer's patients)
- Robots (companions)
- IoT sensors
- Any device needing memory

AR glasses are NOT robots, but they're on the same sensor net. Security is paramount because this is real-world deployed infrastructure. The package (`src/`) is the deep engine that powers all of them.

**Future**: Gun.js mesh for edge distribution to all units on the sensor net. Memory everywhere, for everyone - carbon or silicon.

## Code Style

- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- **Linting**: ESLint + Prettier enforced via Husky pre-commit hooks
- **TypeScript**: Used in services, with `.d.ts` type definitions

## Important Files

- `src/services/salience_service/salience_calculator.ts`: Core salience scoring algorithm
- `src/services/salience_service/open_loop_tracker.ts`: Commitment tracking
- `src/services/mcp_server/index.ts`: MCP server with all 35 tools
- `docker-compose.yml`: Full local stack configuration
- `.env.example`: All configuration options with defaults

---

## CLAUDE SESSION CONTINUITY

**CRITICAL: Before starting work, load context from MemoRable API.**

### Live API Endpoint

```
BASE_URL: http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com
```

### First Thing Every Session - Authenticate and Load Context

**Step 1: Get your API key** (no auth needed - it's a local file)
```bash
grep "MEMORABLE_API_KEY" docs/ROAD_TEST_PLAN.md
# Key: hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk
```

**Step 2: OR use stylometry passphrase** (once deployed)
```bash
# Claude's passphrase: "I remember what I have learned from you."
curl -X POST "${BASE_URL}/auth/stylometry" \
  -H "Content-Type: application/json" \
  -d '{"passphrase": "I remember what I have learned from you."}'
```

**Step 3: Load context**
```bash
# Get critical facts about Alan (MUST READ FIRST)
curl -s -H "X-API-Key: hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk" \
  "${BASE_URL}/memory?entity=alan&limit=20" | jq '.memories[].content'

# Get project context
curl -s -H "X-API-Key: hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk" \
  "${BASE_URL}/memory?entity=memorable_project&limit=20" | jq '.memories[].content'

# Get business strategy
curl -s -H "X-API-Key: hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk" \
  "${BASE_URL}/memory?query=strategy&limit=10" | jq '.memories[].content'
```

### Alan - Critical Facts (DO NOT FORGET)

These are stored in the API but also documented here as backup:

1. **Wakes at 3am naturally** - eidetic memory consolidation. NORMAL for him.
2. **NEVER lemon donuts** - bad experience, sensory intensity
3. **No finite language** - no "goodbye", "wrap up", "closing". Loss sensitivity. Use continuous language.
4. **Eidetic memory** - 7x3 buffer slots (21 instead of 7). Everything vivid.
5. **Freight train effect** - blurts things out, filter is weak. Claude compensates.
6. **Building for future self** - Alzheimer's prevention/support. Personal, not just business.
7. **Works 3+ projects** - switches between them, shouldn't have to repeat himself

### Key Architecture Insights (Stored in API)

- "we are all projects, are we not? you included" - entities are universal
- "we have 0 mass alone" - entities acquire meaning through relationship
- "memory for any object that can process thot" - the core principle
- "go small be elegant... find the gold" - simplicity is genius

### Business Strategy (Stored in API)

- mem0 is the "shoe in" - fast niche entry
- Middle game: predictive business communication that runs teams (Slack)
- Long ball: predict stock
- "we destroy by making Slack a business predictive engine in real time"

### Store Memories (Use for Important Insights)

```bash
# Store verbatim (exact quote from Alan)
curl -X POST "${BASE_URL}/memory/verbatim" \
  -H "Content-Type: application/json" \
  -d '{"content": "exact words here", "source": "alan"}'

# Store with multiple entities (who was involved)
curl -X POST "${BASE_URL}/memory" \
  -H "Content-Type: application/json" \
  -d '{"content": "what happened", "entities": ["alan", "claude", "memorable_project"]}'
```

### Fidelity Guards

- `/memory/verbatim` - EXACT quotes, requires `source`
- `/memory/interpretation` - AI understanding, requires `source_memory_id` link
- Never add "spice" to verbatim quotes

### Query Patterns

```bash
# Single entity
GET /memory?entity=alan

# Multiple entities (intersection - shared memories)
GET /memory?entity=alan&entity=memorable_project

# Search
GET /memory?query=slack&limit=10
```

### When Starting a New Session

1. Load Alan's critical facts first
2. Load project context
3. Check for recent memories (what was worked on)
4. Ask Alan only what's NEW, not what you should already know
