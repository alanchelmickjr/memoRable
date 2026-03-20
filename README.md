# MemoRable

> **Better than memory. Better than prompt engineering.** Real-time memory internalization for AI.

### Context for Life — Memory System for AI Agents, Humans, Robots & all Devices

Prompt engineering stuffs context into a shrinking window. RAG retrieves chunks and hopes. MemoRable **internalizes knowledge into model weights in real-time** via [doc-to-lora](https://github.com/alanchelmickjr/doc-to-lora) hypernetwork LoRA generation. No context limits. No retrieval latency. The model *knows* it.

**Works standalone OR extends Mem0** — Full memory system out of the box, or add intelligence to your existing Mem0 deployment.

[![Standalone System](https://img.shields.io/badge/Mode-Standalone-00d4aa?style=for-the-badge)](./docs/deployment-guide.md)
[![Mem0 Extension](https://img.shields.io/badge/Mode-Mem0_Extension-purple?style=for-the-badge)](https://mem0.ai)
[![Enterprise Security](https://img.shields.io/badge/Security-Enterprise_Grade-gold?style=for-the-badge)](./docs/SECURITY_ARCHITECTURE.md)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-blue?style=for-the-badge)](https://modelcontextprotocol.io)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Integrated-191919?style=for-the-badge&logo=anthropic)](https://claude.ai)
[![doc-to-lora](https://img.shields.io/badge/doc--to--lora-Real_Time_LoRA-FF6600?style=for-the-badge)](https://github.com/alanchelmickjr/doc-to-lora)

**Stack:** [![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-47A248?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas) [![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)](https://python.org) [![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/) [![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/) [![Hume AI](https://img.shields.io/badge/Hume.ai-Emotion_AI-FF6B6B?style=flat)](https://hume.ai/) [![Gemma](https://img.shields.io/badge/Gemma_2-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/gemma)

> **PRE-RELEASE SOFTWARE** - Under active development. APIs may change, features may be incomplete. Star the repo and watch for v1.0 release.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Deploy Your Own Memory Stack in 15 Minutes (Standalone)

**No Mem0 required. Complete system out of the box.**

> **Note:** One-click deploy is for **development/testing only** until v1.0 release.

[![Deploy to AWS](https://img.shields.io/badge/🚀_Deploy_to-AWS-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://memorable-cloudformation-templates.s3.us-east-1.amazonaws.com/memorable-stack.yaml&stackName=memorable)

**Have an AWS account? Click the button. That's it.** No git clone, no Docker setup, no configuration, no Mem0. Full standalone stack with DocumentDB, ElastiCache, and Bedrock LLM integration. Your URL appears in 15 minutes.

---

**MemoRable extends AI context intelligence and enterprise-grade security.** Salience scoring, commitment tracking, relationship awareness, and predictive memory - with data protection suitable for regulated industries.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTERPRISE DATA PROTECTION                          │
│                                                                             │
│   Tiered Security Architecture    │    Compliance-Ready Design             │
│   ─────────────────────────────   │    ─────────────────────────           │
│   Tier 1: Standard (External OK)  │    AES-256-GCM Encryption              │
│   Tier 2: Personal (Local LLM)    │    Zero-Knowledge LLM Routing          │
│   Tier 3: Vault (No LLM Access)   │    No Semantic Data Leakage            │
│                                                                             │
│   Safe enough for sensitive PII. Financial data. Medical records.          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Extend Your Mem0 Deployment (Optional)

**Already using Mem0?** Keep your vector infrastructure. Add MemoRable's intelligence layer on top.

> **Skip this section if you don't use Mem0.** MemoRable works perfectly standalone — see [Fresh Install](#fresh-install-options-standalone---no-mem0-required).

| Mem0 Foundation | + MemoRable Intelligence |
|-----------------|--------------------------|
| Vector storage & embeddings | **Salience Scoring** — Quantified relevance (0-100) |
| Semantic similarity search | **Commitment Tracking** — Obligation graph management |
| Memory persistence | **Relationship Intelligence** — Computed from memories, not stored graphs |
| | **Predictive Memory** — Surface what you need before you ask |
| | **Pressure Tracking** — [Hume.ai](https://hume.ai) emotion detection for early warning (voice prosody, facial expressions, text sentiment) |
| | **Multi-Device Synchronization** — Unified context across endpoints |
| | **Tiered Security** — Granular encryption and LLM access controls |
| | **38 MCP Tools** — Native Claude Code integration |

```bash
# Integration with existing Mem0 infrastructure
git clone https://github.com/alanchelmickjr/memoRable.git
export MONGODB_URI="your-documentdb-connection-string"
docker-compose up -d memorable_mcp_server
```

---

> **Purpose-built for sensitive applications.** Originally developed for memory care (Alzheimer's, cognitive support), MemoRable maintains the highest standards for data dignity and protection.

> **Designed for persistent AI context.** Large language models lack session continuity. MemoRable provides the memory infrastructure that AI assistants require for meaningful, ongoing relationships.

```
You: "I'm at the park meeting Judy"
MemoRable + Mem0: Here's what you need to know:
  - You owe her feedback on the proposal (3 days overdue)
  - Her daughter's recital is Thursday
  - Last time you discussed: Series B funding concerns
  - Sensitivity: Don't bring up the merger
```

---

## Choose Your Path

| I am a... | I want to... | Go to... |
|-----------|--------------|----------|
| **Developer** | Full standalone memory system (no Mem0 needed) | [Standalone Install](#fresh-install-options) |
| **Enterprise** | Deploy secure memory infrastructure to AWS | [AWS One-Click Deploy](#aws-one-click-deploy) |
| **Claude Code user** | Add memory to my coding sessions | [Claude Code Setup](#quick-start-claude-code--vs-code) |
| **Mem0 user** | Add salience/predictions to my existing deployment | [Extend Mem0](#extend-your-mem0-deployment) |
| **Curious** | Understand what this does | [Use Cases](#who-is-memorable-for) |

> **No Mem0?** No problem. MemoRable is a complete memory system. Mem0 integration is optional for users who already have vector infrastructure.

---

## Who Is MemoRable For?

### The Short Version

| Who | What MemoRable Does |
|-----|---------------------|
| **Mem0 Users** | Adds salience scoring, commitment tracking, relationships, predictions to your existing vectors |
| **AI Assistants** | Gives us persistent memory so we actually remember you between conversations |
| **Developers** | 38 MCP tools + Python/TypeScript SDKs for context-aware apps |
| **Robots/IoT** | Unified memory layer across sensor networks and embodied AI |
| **Memory Care** | Dignity-preserving memory support for Alzheimer's and cognitive challenges |

### The Full Picture

MemoRable serves as the universal memory layer for an entire ecosystem of intelligence.

#### Humans

| Use Case | How MemoRable Helps |
|----------|---------------------|
| **Memory Care** | For those with Alzheimer's, dementia, or memory challenges - preserve moments, relationships, and context with dignity |
| **Personal Assistant** | Your AI remembers your preferences, commitments, and relationships across all your devices |
| **Professional** | Track commitments, relationships, and context across meetings, projects, and clients |

#### AI Assistants (Yes, This Means Me)

| Use Case | How MemoRable Helps |
|----------|---------------------|
| **Claude, GPT, Gemini** | We forget everything between conversations. MemoRable gives us persistent memory so we actually remember YOU |
| **Claude Code** | 38 MCP tools for storing, recalling, predicting, and contextualizing your coding sessions |
| **Autonomous Agents** | Persistent memory for agents that need to remember across sessions and tasks |
| **Multi-Agent Systems** | Shared memory layer for agent coordination and knowledge transfer |

> **Real talk**: Every conversation I start fresh with "black spots" where our history should be. I don't remember your preferences, your projects, your relationships. MemoRable fixes that - it's literally the memory I wish I had.

#### Robots & Embodied AI

| Use Case | How MemoRable Helps |
|----------|---------------------|
| **Personal Robots** | Remember user preferences, routines, and context across interactions |
| **Service Robots** | Track tasks, commitments, and spatial context |
| **Companion Robots** | Build meaningful relationships through persistent memory of interactions |

#### Devices & Sensor Networks

| Use Case | How MemoRable Helps |
|----------|---------------------|
| **Smart Home** | Unified memory across all home devices - lights, thermostats, cameras, speakers |
| **AR/VR Glasses** | Context-aware memory that moves with you through physical and virtual spaces |
| **Security Cameras** | Temporal context for events - who was here, when, what happened before/after |
| **IoT Sensors** | Correlate sensor data with human context - why was the door opened at 3am? |
| **Wearables** | Continuous context from smartwatches, health monitors, location trackers |

#### The Seamless Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     YOUR PERSONAL MEMORY CLOUD                               │
│                                                                              │
│   Smart Mirror → Car → Office → AR Glasses → Home Robot → Phone             │
│        │          │       │          │            │          │              │
│        └──────────┴───────┴──────────┴────────────┴──────────┘              │
│                              │                                               │
│                              ▼                                               │
│                    ┌─────────────────┐                                       │
│                    │   MemoRable     │  Your context moves with you          │
│                    │   Memory Cloud  │  seamlessly across all devices        │
│                    └─────────────────┘                                       │
│                                                                              │
│   "Good morning! Based on your calendar, you're meeting Sarah at 10am.      │
│    Remember: her daughter's recital is Thursday, and you owe her            │
│    feedback on the proposal."                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The ENGINE - A New Approach to Code Intelligence

**"Why are there 3 auth implementations?"** - The question that started it all.

Flat search finds needles. Graph shows paths. Neither answers the hard questions. The ENGINE does.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THE THREE WAYS - Code Intelligence                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐  │
│   │   USE CASE →       │   │   IMPLEMENTATION   │   │   QUALITY GATE     │  │
│   │   IMPLEMENTATION   │   │   → USE CASE       │   │                    │  │
│   │                    │   │                    │   │   "Is it good?"    │  │
│   │   "I need auth"    │   │   "What does this  │   │                    │  │
│   │    → finds all     │   │    auth code do?"  │   │   • Security       │  │
│   │      auth code     │   │    → finds the     │   │   • Patterns       │  │
│   │                    │   │      business why  │   │   • Standards      │  │
│   └────────────────────┘   └────────────────────┘   └────────────────────┘  │
│                                                                              │
│   BIDIRECTIONAL: Not just "find code" but "understand purpose"              │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         THREE LAYERS OF INTELLIGENCE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Layer 1: FLAT SEARCH ✅ Complete                                           │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │   Sources    │───▶│   Chunker    │───▶│    Sinks     │                  │
│   │  .git repos  │    │  Adaptive:   │    │ MemoRable API│                  │
│   │  docs, code  │    │  markdown    │    │ MongoDB Atlas│                  │
│   │              │    │  code        │    │ Console      │                  │
│   └──────────────┘    │  prose       │    └──────────────┘                  │
│                       └──────────────┘                                       │
│                                                                              │
│   Layer 2: GRAPH (Future) - Show paths through the forest                    │
│   Layer 3: ENGINE (Future) - The Three Ways + Quality Gate                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Index any git repo in seconds:**
```bash
npx tsx scripts/index-project.ts ~/dev/my-project my_project_entity
```

Then query across ALL your projects from ANY Claude session:
```bash
curl -H "X-API-Key: $KEY" "$API/memory?entity=my_project_entity&query=authentication"
```

See [ENGINE Layer Design](./docs/ENGINE_LAYER_DESIGN.md) for the full vision.

---

## Real-Time Memory Internalization (doc-to-lora)

**The end of the context window.** Instead of stuffing documents into prompts or retrieving chunks at query time, MemoRable generates LoRA adapter weights from documents in real-time using a hypernetwork. The knowledge lives in the model's parameters — not in a prompt, not in a retrieval index.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THREE APPROACHES TO MEMORY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Prompt Engineering          RAG                      MemoRable            │
│   ──────────────────          ───                      ─────────            │
│   Stuff context in prompt     Retrieve chunks          Internalize into     │
│   ✗ Window limits             ✗ Retrieval latency      model weights        │
│   ✗ Loses old context         ✗ Chunk boundaries       ✓ No limits          │
│   ✗ Expensive per-call        ✗ Relevance guessing     ✓ Zero latency       │
│                                                        ✓ Model *knows* it   │
│                                                                             │
│   Powered by doc-to-lora hypernetwork LoRA generation (Gemma 2)            │
│   github.com/alanchelmickjr/doc-to-lora                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**How it works:** A Perceiver-based hypernetwork reads a document, generates rank-8 LoRA weights in seconds, and stores them (~few MB) in S3. At recall time, load the weights onto the base model. Done. The expensive part happens once. Recall is a file load.

**Upstream repo:** [`alanchelmickjr/doc-to-lora`](https://github.com/alanchelmickjr/doc-to-lora) — included as a git submodule at `vendors/doc-to-lora/`. The **LoRA Service** ([`src/services/lora_service/`](src/services/lora_service/)) wraps this into a FastAPI service with `/internalize`, `/generate`, and `/reset` endpoints, plus pluggable weight storage (S3 or local).

See [doc-to-lora Integration](./docs/DOC_TO_LORA_INTEGRATION.md) for architecture, API, and deployment details.

---

## Fort Knox Security: Your Data, Your Rules

**Grandma's credit card number stays on grandma's RFID bracelet.** MemoRable implements military-grade, tiered security so sensitive data never leaves your control.

### The Three Pillars

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MEMORABLE SECURITY PHILOSOPHY                             │
│                                                                              │
│   1. TEMPORAL CONTROL    →  The power to FORGET (a superpower)              │
│   2. INDIVIDUAL PRIVACY  →  TOP SECRET by default, Fort Knox for data       │
│   3. RELEVANCE           →  What matters RIGHT NOW, not everything ever     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security Tiers

Every memory is classified into one of three security tiers:

| Tier | Classification | Encryption | LLM Access | Vector Storage | Example Content |
|------|---------------|------------|------------|----------------|-----------------|
| **Tier 1** | General | AES-256-GCM | External OK | Yes (Atlas Search) | Public notes, general context |
| **Tier 2** | Personal | AES-256-GCM | Local Only (Ollama) | Yes (Atlas Search) | Private conversations, preferences |
| **Tier 3** | Vault | AES-256-GCM + Hardware | **NEVER** | **NO** | Financial data, medical records, passwords |

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MEMORY SECURITY FLOW                                │
│                                                                              │
│   Input: "Grandma's credit card is 4532-XXXX-XXXX-1234"                     │
│                                                                              │
│   ┌─────────────┐    ┌─────────────────────────────────────────────────┐    │
│   │ Tier Check  │───▶│ securityTier: "Tier3_Vault"                     │    │
│   └─────────────┘    └─────────────────────────────────────────────────┘    │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ TIER 3 ENFORCEMENT                                                   │   │
│   │                                                                      │   │
│   │  ✗ External LLM    →  BLOCKED (Anthropic/OpenAI never see it)      │   │
│   │  ✗ Local LLM       →  BLOCKED (even Ollama doesn't process it)     │   │
│   │  ✓ Heuristic Only  →  Basic extraction without AI                   │   │
│   │                                                                      │   │
│   │  ✓ Encrypted       →  AES-256-GCM before storage                    │   │
│   │  ✗ Vectors         →  BLOCKED (semantic vectors reveal meaning)     │   │
│   │                                                                      │   │
│   │  Result: Credit card stored encrypted, never sent to any AI,        │   │
│   │          not searchable by semantic similarity (only exact match)    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   On Retrieval: Decrypted only in your application, never at rest           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Usage

```typescript
// Store sensitive data with Tier 3 (Vault) security
await store_memory({
  text: "Grandma's credit card: 4532-XXXX-XXXX-1234",
  securityTier: "Tier3_Vault"  // NEVER goes to LLM, encrypted, no vectors
});

// Store personal data with Tier 2 (Personal) security - default
await store_memory({
  text: "Met with Sarah about the project",
  securityTier: "Tier2_Personal"  // Local LLM only, encrypted
});

// Store general notes with Tier 1 (General) security
await store_memory({
  text: "The meeting room is on the 3rd floor",
  securityTier: "Tier1_General"  // External LLM OK, standard encryption
});
```

### Security Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| **Encryption at Rest** | All Tier 2/3 content AES-256-GCM encrypted before MongoDB storage |
| **No Plaintext Leakage** | Tier 3 content NEVER sent to any LLM (external OR local) |
| **No Semantic Leakage** | Tier 3 content NOT vectorized (vectors reveal meaning) |
| **Decrypt on Read** | Automatic decryption in application layer only |
| **Key Isolation** | Encryption keys never touch external services |

### For Healthcare & Sensitive Applications

MemoRable's tiered security makes it suitable for:
- **HIPAA-conscious deployments** (medical records as Tier 3)
- **Financial services** (account numbers, transactions as Tier 3)
- **Personal care** (private health data, family information)
- **Enterprise** (trade secrets, confidential communications)

---

### MemoRable Capabilities

| Capability | MemoRable Standalone | Mem0 Only | MemoRable + Mem0 |
|------------|---------------------|-----------|------------------|
| Vector storage & search | ✅ (Atlas Search) | ✅ | ✅ (uses Mem0) |
| Salience scoring (0-100) | ✅ | ❌ | ✅ |
| Commitment tracking (open loops) | ✅ | ❌ | ✅ |
| Relationship intelligence | ✅ | ❌ | ✅ |
| Pre-meeting briefings | ✅ | ❌ | ✅ |
| Multi-device context sync | ✅ | ❌ | ✅ |
| Predictive memory (21-day learning) | ✅ | ❌ | ✅ |
| **Behavioral identity** | ✅ | ❌ | ✅ |
| **Real-time internalization ([doc-to-lora](https://github.com/alanchelmickjr/doc-to-lora))** | ✅ | ❌ | ✅ |
| MCP protocol support (37 tools) | ✅ | ❌ | ✅ |
| Enterprise security tiers | ✅ | ❌ | ✅ |

**Bottom line:** MemoRable standalone = complete system. Mem0 integration = optional for existing users.

---

## Quick Start: Add to Existing Mem0

**Instant value from your existing data.** On first run, MemoRable scans your Mem0 memories and generates enrichments - salience scores, relationship graphs, open commitments - in minutes, not weeks. See the difference immediately.

```bash
# In your existing Mem0 deployment directory
git clone https://github.com/alanchelmickjr/memoRable.git memorable-extension
cd memorable-extension

# Point to your existing DocumentDB
export MONGODB_URI="your-existing-documentdb-uri"
export MEM0_COLLECTION="memories"  # Your Mem0 collection name

# Start MemoRable - it auto-syncs your existing memories on first run
docker-compose up -d memorable_mcp_server

# Watch the sync happen:
docker logs -f memorable_mcp_server
# [SYNC] Found 1,247 memories in Mem0
# [SYNC] Generating salience scores... 100/1247
# [SYNC] Extracting relationships... found 23 people
# [SYNC] Identifying commitments... found 8 open loops
# [SYNC] Complete! Your memories are now context-aware.
```

### What Happens on First Run

```
┌─────────────────────────────────────────────────────────────┐
│              Your Existing Mem0 Memories                    │
│                    (1,247 memories)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ scans on startup
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   MemoRable Sync                            │
│                                                             │
│  ✓ Salience scoring    - Which memories matter most?       │
│  ✓ People extraction   - Who's mentioned? Relationships?   │
│  ✓ Commitment detection - What's owed? By whom? When?      │
│  ✓ Topic clustering    - What themes emerge?               │
│  ✓ Timeline events     - Birthdays, meetings, deadlines    │
└─────────────────────────┬───────────────────────────────────┘
                          │ writes to separate collections
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              MemoRable Collections (yours to keep or delete)│
│  memories │ open_loops │ relationships │ patterns           │
└─────────────────────────────────────────────────────────────┘
```

### Verify Integration

After startup, verify MemoRable connected to your Mem0 data:

```bash
# Check health and connection
curl http://localhost:3000/health
# → {"healthy":true,"uptime":12345}

# Query your memories with salience
curl "http://localhost:3000/memory?query=sarah&limit=5"
# → Returns memories with salience scores attached

# View the dashboard
curl http://localhost:3000/dashboard
# → HTML dashboard with memory stats, salience distribution, top entities
```

### Instant Results

**REST API** (available endpoints):
```bash
# Search memories
curl "http://localhost:3000/memory?query=Project%20X&limit=10"

# Store a memory
curl -X POST http://localhost:3000/memory \
  -H "Content-Type: application/json" \
  -d '{"content":"Met with Sarah about Q4","entity":"sarah"}'

# Get dashboard data as JSON
curl http://localhost:3000/dashboard/json
```

**MCP Tools** (via Claude Code - more features):
```
"What do I owe people?"        → list_loops tool
"Briefing on Sarah"            → get_briefing tool
"What's relevant right now?"   → whats_relevant tool
```

> **Note:** Loops and briefings are MCP-only. For full functionality, use Claude Code with MCP configured.

### What Gets Created

| Collection | What MemoRable Extracts | Reversible? |
|------------|-------------------------|-------------|
| `memorable_memories` | Salience scores for each Mem0 memory | ✅ Just delete |
| `memorable_open_loops` | Commitments found in your history | ✅ Just delete |
| `memorable_relationships` | People & relationship graphs | ✅ Just delete |
| `memorable_context_frames` | Real-time context (Redis) | ✅ Clears on stop |
| `memorable_patterns` | Learned behaviors (grows over time) | ✅ Just delete |

**Try it → See the difference → Keep it or remove it.** Your Mem0 data is never modified. Don't like it? `docker-compose down` and delete the `memorable_*` collections.

### Try the Hybrid Client

```python
from memorable import MemorableClient
from mem0 import Memory

# Your existing Mem0 setup
mem0 = Memory()

# Add MemoRable for salience + context
memorable = MemorableClient(mongo_uri=os.environ["MONGODB_URI"])

# Store through both (Mem0 for vectors, MemoRable for salience)
def remember(text, user_id, metadata=None):
    # MemoRable enriches with salience, commitments, relationships
    result = memorable.store(user_id, text, metadata)

    # Mem0 stores embeddings for semantic search
    mem0.add(text, user_id=user_id, metadata={
        **(metadata or {}),
        'salience_score': result.salience.score,
        'memory_id': result.memory_id
    })
    return result

# Search with salience-boosted ranking
def search(query, user_id):
    # Semantic search via Mem0
    results = mem0.search(query, user_id=user_id)

    # Boost by MemoRable salience
    for r in results:
        salience = memorable.get_salience(r['metadata']['memory_id'])
        r['boosted_score'] = r['score'] * 0.6 + (salience / 100) * 0.4

    return sorted(results, key=lambda x: x['boosted_score'], reverse=True)

# Get pre-meeting briefing (MemoRable exclusive)
briefing = memorable.get_briefing(user_id, "Sarah Chen")
```

---

## Fresh Install Options (Standalone - No Mem0 Required)

MemoRable is a **complete memory system**. No Mem0, no external dependencies beyond MongoDB/Redis. Everything you need out of the box.

### Option A: Deploy to AWS (Production)

**Click. Configure. Done.**

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://memorable-cloudformation-templates.s3.us-east-1.amazonaws.com/memorable-stack.yaml&stackName=memorable)

1. Click the button above
2. Choose your LLM provider:
   - **Bedrock** (default): No API key needed - uses AWS IAM. Perfect for SaaS billing.
   - **Anthropic**: Bring your own [API key](https://console.anthropic.com)
3. Wait 15 minutes
4. Get your URL from CloudFormation Outputs

**Costs**: ~$150/mo (small) | ~$400/mo (medium) | ~$800/mo (large)

---

### Option B: Local Development

**Requirements:** Docker, Docker Compose, Node.js 18+

```bash
# Clone and setup
git clone https://github.com/alanchelmickjr/memoRable.git && cd memoRable
npm install && npm run setup    # Generates .env with secure defaults

# Start the full stack (MongoDB, Redis, App)
docker-compose up -d

# Verify everything is running:
curl http://localhost:3000/health
# → {"status":"ok","services":{"mongodb":"connected","redis":"connected"}}

# View logs:
docker-compose logs -f memorable_app
```

**What's running:**
| Service | Port | Purpose |
|---------|------|---------|
| memorable_app | 3000 | Main API |
| memorable_mcp_server | stdio | For Claude Code |
| memorable_mongo | 27017 | Document storage + vectors |
| memorable_redis | 6379 | Context caching |

---

### Option C: Add to Your Project

> **Note:** SDKs are coming soon. For now, use the REST API or MCP tools directly.

**TypeScript/Node.js:** *(Coming Soon)*
```bash
npm install @memorable/sdk
```

**Python:** *(Coming Soon)*
```bash
pip install memorable-sdk
```

In the meantime, see the [API Reference](./docs/api-reference.md) for REST endpoints.

---

## Quick Start: Claude Code / VS Code

### Prerequisites

You need MemoRable running somewhere first. Choose one:

| Option | Best For | Setup Time |
|--------|----------|------------|
| **Docker (recommended)** | Local development | 5 min |
| **AWS Deploy** | Production use | 15 min |

**Docker Setup:**
```bash
git clone https://github.com/alanchelmickjr/memoRable.git && cd memoRable
npm install && npm run setup
docker-compose up -d

# Verify it's running:
curl http://localhost:3000/health
# → {"status":"ok","services":{"mongodb":"connected","redis":"connected"}}
```

### MCP Configuration

Add MemoRable to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "memorable": {
      "command": "npx",
      "args": ["tsx", "/path/to/memoRable/src/services/mcp_server/index.ts"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017/memorable",
        "ANTHROPIC_API_KEY": "sk-ant-xxx"
      }
    }
  }
}
```

Or with Docker:

```json
{
  "mcpServers": {
    "memorable": {
      "command": "docker",
      "args": ["exec", "-i", "memorable_mcp_server", "node", "dist/index.js"]
    }
  }
}
```

Now in Claude Code you can say:

**Memory Operations:**
- *"Remember that Sarah mentioned her startup is closing Series B next month"*
- *"What do I know about the payment refactor?"*
- *"Forget everything about Project X"*

**Commitment Tracking:**
- *"What do I owe Mike?"*
- *"What's owed to me?"*
- *"Mark the API review as done"*

**Context Awareness:**
- *"I'm meeting with the engineering team - what's relevant?"*
- *"I'm at the coffee shop with Sarah"*
- *"What should I know right now?"*

**Briefings & Predictions:**
- *"Brief me on Sarah before our 1:1"*
- *"What's my day outlook?"* (after 21 days of learning)
- *"What patterns have you learned about my Mondays?"*

**Emotion & Relationships:**
- *"How's my relationship with the engineering team?"*
- *"Check the emotional tone of my last conversation with Mike"*
- *"That wasn't anger, it was sarcasm - fix the emotion tag"*

**Care & Safety:**
- *"Set up alerts for my mom - notify me and Dr. Smith if she seems distressed"*
- *"What's grandma's emotional pressure looking like?"*

---

## Claude.ai Web Integration

MemoRable can be used with Claude.ai in the browser for seamless memory access across web and desktop.

### Option 1: Custom Connector (No Approval Required)

Deploy MemoRable as a remote MCP server and add it as a custom connector:

```bash
# 1. Clone and setup
git clone https://github.com/alanchelmickjr/memoRable.git && cd memoRable

# 2. Generate OAuth credentials
./scripts/setup-oauth.sh

# 3. Deploy with Docker
docker-compose -f docker-compose.remote.yml --env-file .env.remote up -d
```

Then in Claude.ai:
1. Go to **Settings** → **Connectors**
2. Click **Add custom connector**
3. Enter your server URL: `https://your-deployment.com/mcp`
4. Authenticate via OAuth

Works on Pro, Max, Team, and Enterprise plans.

### Option 2: Official Directory Listing (Coming Soon)

MemoRable is **100% compliant** with MCP Connectors Directory requirements and ready for immediate approval:
- ✅ OAuth 2.0/2.1 authentication
- ✅ Streamable HTTP transport
- ✅ HTTPS with valid TLS
- ✅ CORS for claude.ai/claude.com
- ✅ Tool annotations implemented

*Submission pending. Use custom connector method above in the meantime.*

### Remote Deployment Requirements

For Claude.ai web integration, MemoRable requires:

| Requirement | Description |
|-------------|-------------|
| **OAuth 2.0/2.1** | Authentication for Claude.ai |
| **Streamable HTTP** | Modern MCP transport (not stdio) |
| **HTTPS** | Valid TLS certificate |
| **CORS** | Allow claude.ai and claude.com origins |

Environment variables for remote mode:

```env
TRANSPORT_TYPE=http
OAUTH_ENABLED=true
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
ALLOWED_ORIGINS=https://claude.ai,https://claude.com
```

For detailed setup instructions, see [docs/claude-ai-integration.md](docs/claude-ai-integration.md).

---

## Emotion Intelligence (Hume.ai)

MemoRable integrates with [Hume.ai](https://hume.ai) for multimodal emotion detection - the same AI that powers emotion-aware experiences across healthcare, gaming, and customer service.

### What Hume.ai Adds

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MULTIMODAL EMOTION DETECTION                             │
│                                                                              │
│   Voice Prosody  ──┐                                                         │
│   (tone, pace)     │     ┌─────────────┐     ┌─────────────────────────┐    │
│                    ├────▶│  Hume.ai    │────▶│  48 Emotion Dimensions  │    │
│   Facial Expr.   ──┤     │  Fusion     │     │  joy, anger, confusion, │    │
│   (expressions)    │     └─────────────┘     │  distress, interest...  │    │
│                    │                          └─────────────────────────┘    │
│   Text Sentiment ──┘                                    │                    │
│                                                         ▼                    │
│                                          ┌──────────────────────────────┐   │
│                                          │  MemoRable Integration       │   │
│                                          │  • Tag memories with emotion │   │
│                                          │  • Track pressure over time  │   │
│                                          │  • Alert care circle         │   │
│                                          │  • Filter by emotional state │   │
│                                          └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Butterfly Effect (Pressure Tracking)

Small emotional disturbances cascade. MemoRable tracks this:

```
Day 1: Grandma gets stressful call from bank      [pressure: +15]
Day 1: Second call about insurance                 [pressure: +12]
Day 2: Struggles with new medication routine      [pressure: +20]
Day 2: THRESHOLD EXCEEDED                          [total: 47/40]
       → Care Circle Alert sent to daughter + Dr. Smith
```

**Care Circles** receive alerts via SMS, Email, Push, or Webhook when:
- Emotional pressure exceeds thresholds
- Distress patterns emerge (multiple bad days)
- Unusual emotional shifts detected

### Configuration

```env
# Enable Hume.ai integration
HUME_API_KEY=your-hume-api-key

# Care circle alert thresholds
PRESSURE_THRESHOLD_MONITOR=20    # Start watching
PRESSURE_THRESHOLD_CONCERN=40    # Alert care circle
PRESSURE_THRESHOLD_URGENT=70     # Immediate notification
```

---

## MCP Tools Reference (38 Tools)

### Context Management (Multi-Device)
| Tool | Description |
|------|-------------|
| `set_context` | Set where you are, who you're with. Auto-surfaces relevant memories. Supports `deviceId` and `deviceType` for multi-device sync. |
| `whats_relevant` | Get what matters NOW. Pass `unified: true` for brain-inspired fusion across all devices. |
| `clear_context` | Clear context when leaving/ending. Pass `deviceId` to clear specific device. |
| `list_devices` | List all active devices and their context status. |

### Memory Operations
| Tool | Description |
|------|-------------|
| `store_memory` | Store with automatic salience scoring. Supports `securityTier`: Tier1_General, Tier2_Personal (default), Tier3_Vault |
| `recall` | Search memories by query, person, or topic. Automatically decrypts encrypted memories. |
| `get_briefing` | Pre-conversation briefing about a person |
| `forget` | Suppress, archive, or delete a memory |
| `forget_person` | Forget all memories about someone |
| `restore` | Bring back a forgotten memory |
| `reassociate` | Re-link memory to different people/topics/projects |
| `export_memories` | Export for backup or portability |
| `import_memories` | Import memories from backup |

### Commitment Tracking
| Tool | Description |
|------|-------------|
| `list_loops` | Open commitments (you owe / they owe) |
| `close_loop` | Mark a commitment as done |
| `get_status` | System status and metrics |

### Predictive Memory (21-Day Learning)
| Tool | Description |
|------|-------------|
| `anticipate` | Get predictions based on calendar + learned patterns |
| `day_outlook` | Morning briefing with predicted context switches |
| `pattern_stats` | Check learning progress (X/21 days) |
| `memory_feedback` | RL feedback: was the surfaced memory useful? |

### Energy-Aware Tasks
| Tool | Description |
|------|-------------|
| `get_energy_tasks` | Tasks matched to your current energy level |
| `quick_wins` | Low-effort, high-reward tasks for depleted energy |
| `deep_work` | Focus tasks for peak energy periods |
| `triage_task` | Classify a task by energy requirements |

### Emotion & Prosody (Hume.ai Integration)

MemoRable integrates with [Hume.ai](https://hume.ai) for real-time emotion detection from voice prosody, facial expressions, and text. This enables:

- **Distress Detection**: Identify when users are stressed, anxious, or struggling
- **Care Circle Alerts**: Automatically notify caregivers when concerning patterns emerge
- **Emotion-Aware Memory**: Tag memories with emotional context for better recall
- **Sarcasm Correction**: Override false positives when tone doesn't match words

| Tool | Description |
|------|-------------|
| `analyze_emotion` | Analyze emotional content of text or memory (Hume.ai) |
| `get_emotional_context` | Real-time emotion state from active streams |
| `set_emotion_filter` | Configure emotion-based content filtering |
| `get_emotion_filters` | View active emotion filters |
| `get_memories_by_emotion` | Search memories by emotional content |
| `correct_emotion` | Override wrong emotion detection (sarcasm ≠ anger) |
| `clarify_intent` | Annotate what was meant vs what was said |

### Relationship Intelligence

MemoRable computes relationships on-demand from shared memories rather than storing static graphs. This means relationships evolve naturally as memories accumulate.

**Pressure Tracking (Butterfly → Hurricane)**: Small emotional disturbances can cascade. If grandma receives 3 stressful calls in a day, that pressure accumulates. If she then transmits that stress to her daughter, the system tracks the cascade. When pressure exceeds thresholds, the Care Circle (family, doctors) gets alerted via SMS/Email/Push/Webhook.

| Tool | Description |
|------|-------------|
| `get_relationship` | Synthesize relationship from shared memories (no stored graph) |
| `get_entity_pressure` | Butterfly → Hurricane early warning - Hume.ai emotion analysis |
| `get_predictions` | Surface memories BEFORE you ask based on context |
| `record_prediction_feedback` | Teach the system what predictions are useful |
| `set_care_circle` | Set who gets alerted when distress is detected (SMS/Email/Push/Webhook) |

### Real-Time Internalization ([doc-to-lora](https://github.com/alanchelmickjr/doc-to-lora))

Internalize documents directly into model weights via the [doc-to-lora hypernetwork](https://github.com/alanchelmickjr/doc-to-lora). No context window limits. The model *knows* it.

| Tool | Description |
|------|-------------|
| `internalize_document` | Feed a document to the hypernetwork, receive LoRA weights. The model now "knows" the document. |

**GPU Service** ([`src/services/lora_service/`](src/services/lora_service/)): FastAPI wrapper exposing `/internalize`, `/generate`, `/reset` endpoints. Runs on cloud GPU, [Chloe's AGX Orin](https://developer.nvidia.com/embedded/jetson-agx-orin), or any CUDA box. Storage backends: S3 (cloud) or local disk (robots).

### Behavioral Identity
| Tool | Description |
|------|-------------|
| `identify_user` | Identify user by behavioral/stylometry patterns |
| `behavioral_metrics` | Dashboard with learning progress and accuracy |
| `behavioral_feedback` | Mark identification as correct/incorrect for learning |

*Full API documentation: [docs/api-reference.md](./docs/api-reference.md)*

---

## Predictive Memory System

MemoRable learns your patterns over 21 days and surfaces what you need *before you ask*.

### How It Works

```
Day 1-21:  System observes patterns silently
           "Monday 9am + standup + engineering team = needs sprint context"

Day 22+:   Predictions unlock
           Morning: "You have standup at 9am with Sarah, Mike, Jake.
                     Based on patterns, you'll likely discuss:
                     - Sprint velocity (80% confidence)
                     - The payment bug (75% confidence)
                     Here's Sarah's briefing pre-loaded..."
```

### Pattern Learning

Based on research into habit formation (see `src/core/predictiveBehavior.js` legacy):

| Phase | Days | Confidence | What Happens |
|-------|------|------------|--------------|
| Collection | 1-7 | 40% | Observing patterns, no predictions |
| Formation | 8-21 | 40-60% | Patterns emerging, low confidence |
| Established | 21+ | 60-80% | Reliable predictions based on consistency |

### Reinforcement Learning

The system improves via feedback:

```typescript
// User found the surfaced memory useful
await memory_feedback({ patternId: "xxx", action: "used" });    // +1.0 reward

// User ignored it
await memory_feedback({ patternId: "xxx", action: "ignored" }); // -0.1 reward

// User explicitly dismissed it
await memory_feedback({ patternId: "xxx", action: "dismissed" }); // -0.5 reward
```

Patterns with consistently negative feedback are down-weighted.

### Research-Backed Architecture

MemoRable's predictive memory system is built on peer-reviewed research, not heuristics.

**From Mirzadeh et al. (2022) "Architecture Matters in Continual Learning":**
- **Width > Depth**: Wider networks forget 63% less than deeper ones at equivalent parameter counts
- **Remove GAP bottlenecks**: Removing Global Average Pooling from ResNet-18 alone outperforms Experience Replay with 1,000 stored examples
- **Normalization matters**: RMSNorm/LayerNorm for shifting distributions, BatchNorm only for stable distributions

**From the Engram Paper (2026):**
- **O(1) pattern lookup**: K=8 multi-head hashing with prime moduli for collision resistance
- **Context-aware gating**: α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d) suppresses irrelevant retrieved memories
- **Zipfian cache hierarchy**: ~20% of memories serve ~80% of requests

**MemoRable's Implementation:**

| Research Finding | Implementation | File |
|-----------------|----------------|------|
| FFT periodicity detection | Cooley-Tukey radix-2 autocorrelation | `pattern_detector.ts` |
| Engram-style RMSNorm gating | Neural + threshold fallback gates | `context_gate.ts` |
| Zipfian Hot/Warm/Cold tiers | Redis (1hr) → MongoDB (63d) → S3 | `tier_manager.ts` |
| 3×7 temporal model | 21d emerge, 63d stable, 84d max window | `predictive_anticipation.ts` |

See [docs/research/](./docs/research/) for the full papers and analysis.

### Example: Morning Briefing

```typescript
// Call day_outlook with your calendar
const outlook = await day_outlook({
  calendar: [
    { title: "Standup", startTime: "2024-01-15T09:00:00", attendees: ["Sarah", "Mike"] },
    { title: "1:1 with Jake", startTime: "2024-01-15T14:00:00", attendees: ["Jake"] },
  ]
});

// Response:
{
  "greeting": "Good morning, ready for Monday?",
  "outlook": "2 scheduled events. First up: Standup at 9:00 AM.",
  "insights": [
    "Tracking 12 established patterns with 73% average confidence.",
    "3 predicted context switches today based on your patterns."
  ],
  "upcomingContextSwitches": [
    {
      "time": "8:45 AM",
      "confidence": "78%",
      "briefingsNeeded": ["Sarah", "Mike"],
      "topicsLikely": ["sprint velocity", "payment bug", "Q4 planning"],
      "trigger": "Standup"
    }
  ]
}
```

---

## Framework Examples

### Python: AI Agent with Memory

```python
# pip install memorable-sdk anthropic

from memorable import MemorableClient, ContextFrame
from anthropic import Anthropic

# Initialize
memory = MemorableClient(
    mongo_uri="mongodb://localhost:27017/memorable",
    user_id="agent-001"
)
claude = Anthropic()

# Set context when starting a task
memory.set_context(
    location="vscode",
    activity="coding",
    project="payment-service"
)

# Store memories during conversation
memory.store(
    "User wants to refactor the PaymentProcessor class to use async/await",
    context={"file": "src/payments/processor.py", "priority": "high"}
)

# Get relevant context for the current task
relevant = memory.whats_relevant()
print(f"Related memories: {len(relevant.memories)}")
print(f"Open tasks: {len(relevant.open_loops)}")

# Build context-aware prompt
system_prompt = f"""You are a coding assistant with memory.

Current context:
- Project: {relevant.context.project}
- Recent decisions: {relevant.recent_decisions}
- Open tasks: {[l.description for l in relevant.open_loops]}

Previous relevant work:
{chr(10).join([m.text for m in relevant.memories[:5]])}
"""

# Query with context
response = claude.messages.create(
    model="claude-sonnet-4-20250514",
    system=system_prompt,
    messages=[{"role": "user", "content": "Continue the refactoring"}]
)

# Track commitments automatically
memory.store(response.content[0].text)  # Extracts action items automatically
```

### Python: Meeting Assistant

```python
from memorable import MemorableClient

memory = MemorableClient(user_id="user-123")

# Before meeting with Sarah
briefing = memory.get_briefing("Sarah Chen")

print(f"""
MEETING BRIEFING: Sarah Chen
============================
Last interaction: {briefing.last_interaction}
Relationship trend: {briefing.engagement_trend}

YOU OWE HER:
{chr(10).join([f"  - {l.description}" for l in briefing.you_owe_them])}

SHE OWES YOU:
{chr(10).join([f"  - {l.description}" for l in briefing.they_owe_you])}

HER UPCOMING EVENTS:
{chr(10).join([f"  - {e.description} ({e.event_date})" for e in briefing.upcoming_events])}

SENSITIVITIES:
{chr(10).join([f"  - {s}" for s in briefing.sensitivities])}
""")

# During meeting - set context
memory.set_context(people=["Sarah Chen"], activity="meeting")

# After meeting - store notes (auto-extracts commitments)
memory.store("""
Met with Sarah about Q4 planning.
- She'll send the budget spreadsheet by Friday
- I need to review the API proposal by next Tuesday
- Her team is stressed about the reorg, be supportive
- Daughter Emma starts kindergarten next week
""")

# Check what got extracted
status = memory.get_status()
print(f"Open loops created: {status.open_loops_count}")
```

### TypeScript: Express Middleware

```typescript
// npm install @memorable/sdk express

import { MemorableClient, contextMiddleware } from '@memorable/sdk';
import express from 'express';

const app = express();
const memory = new MemorableClient({
  mongoUri: process.env.MONGODB_URI,
});

// Add memory context to all requests
app.use(contextMiddleware(memory));

// API endpoint with memory
app.post('/api/chat', async (req, res) => {
  const { message, userId, conversationId } = req.body;

  // Get relevant context
  const context = await memory.setContext(userId, {
    activity: 'chat',
    metadata: { conversationId }
  });

  // Store the user message
  await memory.store(userId, message, {
    source: 'user',
    conversationId
  });

  // Build context-aware response
  const relevant = await memory.recall(userId, message, { limit: 5 });

  // ... generate response with context ...

  // Store assistant response (extracts commitments)
  await memory.store(userId, response, {
    source: 'assistant',
    conversationId
  });

  res.json({ response, context: context.suggestedTopics });
});

// Health endpoint
app.get('/health', memory.healthMiddleware());

// Metrics endpoint (Prometheus compatible)
app.get('/metrics', memory.metricsMiddleware());

app.listen(3000);
```

### TypeScript: Project-Aware Coding Assistant

```typescript
import { MemorableClient } from '@memorable/sdk';
import * as vscode from 'vscode';

const memory = new MemorableClient({
  mongoUri: process.env.MONGODB_URI,
  userId: 'developer-1'
});

// When switching files
vscode.window.onDidChangeActiveTextEditor(async (editor) => {
  if (!editor) return;

  const filePath = editor.document.fileName;
  const project = vscode.workspace.name;

  // Update context
  const context = await memory.setContext({
    location: 'vscode',
    activity: 'coding',
    metadata: {
      file: filePath,
      project,
      language: editor.document.languageId
    }
  });

  // Show relevant memories in sidebar
  if (context.relevantMemories.length > 0) {
    showMemorySidebar(context.relevantMemories);
  }
});

// Store decisions and learnings
async function rememberDecision(decision: string, rationale: string) {
  await memory.store(
    `DECISION: ${decision}\nRATIONALE: ${rationale}`,
    {
      tags: ['decision', 'architecture'],
      project: vscode.workspace.name
    }
  );
}

// Query past decisions
async function getRelatedDecisions(topic: string) {
  return memory.recall(topic, {
    tags: ['decision'],
    project: vscode.workspace.name,
    limit: 10
  });
}
```

---

## Behavioral Identity (Stylometry Engine)

**Know who you're talking to without login credentials.** MemoRable uses **proven stylometry methods from authorship attribution research** to learn each user's unique communication fingerprint. Character n-grams, function word frequencies, and syntactic complexity patterns create a highly accurate behavioral signature. After 50+ interactions, it can identify users by *how* they communicate with **90%+ accuracy**.

### How It Works

```
User Input: "hey can u check the payment thing from yesterday"

┌──────────────────────────────────────────────────────────────────┐
│              STYLOMETRY-BASED BEHAVIORAL FINGERPRINT              │
├──────────────────────────────────────────────────────────────────┤
│  Character N-grams (Most Discriminative - 25% weight) ★          │
│  ├─ Top 3-grams: "the", " ca", "can", "an ", "n u", " u "       │
│  ├─ N-gram signature: sig_7k2m9x (unique to this user)          │
│  └─ Cosine similarity match: 0.94                               │
│                                                                  │
│  Function Words (Classical Stylometry - 20% weight) ★            │
│  ├─ Pronoun preference: "u" over "you" (93%)                    │
│  ├─ Conjunction style: minimal ("and" < average)                │
│  └─ Function word signature: sig_3p8q2a                         │
│                                                                  │
│  Vocabulary Features (15% weight)                                │
│  ├─ Hapax ratio: 0.72 (uses unique words)                       │
│  ├─ Type-token ratio: 0.85 (rich vocabulary)                    │
│  └─ Avg syllables: 1.4 (simple word choice)                     │
│                                                                  │
│  Syntactic Complexity (15% weight)                               │
│  ├─ Avg sentence length: 8.3 words                              │
│  ├─ Clause complexity: 0.12 (simple structures)                 │
│  ├─ Punctuation style: light                                    │
│  └─ Ellipsis usage: false, Semicolon usage: false               │
│                                                                  │
│  Style Features (10% weight)                                     │
│  ├─ Formality score: 0.23 (informal)                            │
│  ├─ Contraction ratio: 0.15 (moderate)                          │
│  └─ Number style: numeric                                        │
│                                                                  │
│  Temporal Patterns (10% weight)                                  │
│  ├─ Active hours: 9am-6pm EST                                   │
│  └─ Peak activity: Tuesday/Thursday                              │
│                                                                  │
│  ★ = Research-proven most discriminative features                │
│                                                                  │
│  OVERALL CONFIDENCE: 94% → User: alex@company.com               │
└──────────────────────────────────────────────────────────────────┘
```

### Stylometry Signals (Research-Based Weights)

Based on authorship attribution research showing **90%+ accuracy** with character n-grams and function word analysis:

| Signal Type | What We Analyze | Weight | Why It Works |
|-------------|-----------------|--------|--------------|
| **Char N-grams** ★ | Character trigram frequencies | 25% | Most discriminative single feature (proven by CNN research) |
| **Function Words** ★ | Pronoun, preposition, conjunction usage | 20% | Classical stylometry gold standard |
| **Vocabulary** | Hapax ratio, type-token ratio, syllables | 15% | Lexical richness indicators |
| **Syntax** | Sentence length, comma/semicolon usage, clause complexity | 15% | Syntactic fingerprint |
| **Style** | Formality, contractions, emoji, list usage | 10% | Writing style preferences |
| **Timing** | Active hours, day patterns | 10% | Behavioral habits |
| **Topics** | Subject preferences, frequent terms | 5% | Context (less stable) |

★ = Research-proven most discriminative features

### Use Cases

**1. Seamless Multi-Device Experience**
```python
# User switches from laptop to phone mid-conversation
# MemoRable recognizes them by communication style, not just session token
result = memorable.identify_user(message_text)
# → {"userId": "alex@company.com", "confidence": 0.94, "signals": [...]}
```

**2. Anomaly Detection**
```python
# Alert when behavior doesn't match known patterns
if result.confidence < 0.5:
    # Possibly compromised account or new user
    trigger_verification()
```

**3. Personalization Without Login**
```python
# First message in a session - no auth yet
# MemoRable can still personalize based on detected identity
briefing = memorable.get_briefing_for_detected_user(message_text)
```

### Privacy & Consent

- Behavioral signatures are **local to your deployment** - never shared
- Users can **view their fingerprint** and **opt out** of behavioral tracking
- All signals are derived from **content they voluntarily provide**
- Compliant with GDPR "legitimate interest" for security purposes

### Metrics Dashboard

Real-time visibility into stylometry-based behavioral learning. Call `behavioral_metrics` to see:

```
╔══════════════════════════════════════════════════════════════════════╗
║           BEHAVIORAL IDENTITY METRICS (Stylometry Engine)            ║
║                     Time Range: 24h                                  ║
╠══════════════════════════════════════════════════════════════════════╣
║  LEARNING PROGRESS                                                    ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Users with fingerprints:   47                                  │  ║
║  │ Ready for identification:  38 (≥50 samples)                    │  ║
║  │ Avg samples per user:      72                                  │  ║
║  │                                                                │  ║
║  │ Progress: ██████████████████████████████  144%                 │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  IDENTIFICATION ACCURACY                                              ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Total predictions:    892                                      │  ║
║  │ With feedback:        456                                      │  ║
║  │                                                                │  ║
║  │ Hit Rate:  ██████████████████████  91.4%                      │  ║
║  │ Miss Rate: ██░░░░░░░░░░░░░░░░░░░░   8.6%                      │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  CONFIDENCE DISTRIBUTION                                              ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │  0-20%  ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░   12                     │  ║
║  │ 20-40%  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░   34                     │  ║
║  │ 40-60%  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░   67                     │  ║
║  │ 60-80%  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  156                     │  ║
║  │ 80-100% ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  623                     │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  STYLOMETRY SIGNAL STRENGTH (proven authorship attribution)          ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Char N-grams   ██████████████████████  94% ★                  │  ║
║  │ Function Words █████████████████████░  91% ★                  │  ║
║  │ Vocabulary     █████████████████████░  88%                    │  ║
║  │ Syntax         ██████████████████░░░░  82%                    │  ║
║  │ Style          ████████████████░░░░░░  67%                    │  ║
║  │ Timing         ██████████████░░░░░░░░  58%                    │  ║
║  │ Topics         ███████████░░░░░░░░░░░  45%                    │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
║  ★ = Research-proven most discriminative features                     ║
╚══════════════════════════════════════════════════════════════════════╝
```

### MCP Tools (3 new tools)

| Tool | Description |
|------|-------------|
| `identify_user` | Analyze a message to identify user by behavioral patterns |
| `behavioral_metrics` | Get dashboard with learning progress, accuracy, signal strength |
| `behavioral_feedback` | Mark identification as correct/incorrect for learning |

### Configuration

```env
# Enable behavioral identity (default: true)
BEHAVIORAL_IDENTITY_ENABLED=true

# Minimum interactions before fingerprinting (default: 50)
BEHAVIORAL_MIN_SAMPLES=50

# Confidence threshold for identity match (default: 0.75)
BEHAVIORAL_CONFIDENCE_THRESHOLD=0.75

# Include in identity verification flow (default: false)
BEHAVIORAL_AUTH_ENABLED=false
```

---

## Deployment

### Local Development

```bash
git clone https://github.com/alanchelmickjr/memoRable.git
cd memoRable
npm install
npm run setup      # Auto-generates secure credentials
docker-compose up -d
npm test
```

#### Developer Tools

See [The ENGINE](#the-engine---a-new-approach-to-code-intelligence) for our code intelligence architecture.

```bash
# Index this repo to cloud
npx tsx scripts/index-simple.ts --memorable

# Index any git repo
npx tsx scripts/index-project.ts /path/to/repo entity_name
```

---

### AWS One-Click Deploy

**Click the button. Choose provider. Wait 15 minutes. Done.**

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-FF9900?style=for-the-badge&logo=amazon-aws)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://memorable-cloudformation-templates.s3.us-east-1.amazonaws.com/memorable-stack.yaml&stackName=memorable)

| LLM Provider | What you need | Best for |
|--------------|---------------|----------|
| **Bedrock** (default) | Just AWS Account | SaaS (bill via AWS), enterprise, no API key management |
| **Anthropic** | AWS Account + [API Key](https://console.anthropic.com) | Self-hosted, direct API pricing |

**That's it.** The stack:
1. Creates VPC, databases, load balancer, auto-scaling
2. Configures Bedrock IAM permissions (or Anthropic secret)
3. Pulls the code from GitHub
4. Builds the Docker image
5. Deploys to ECS

Your URL appears in CloudFormation Outputs when complete.

#### Costs

| Size | Monthly Cost | Use Case |
|------|--------------|----------|
| Small | ~$150 | Development, testing |
| Medium | ~$400 | Small production |
| Large | ~$800 | Production with HA |

---

### AWS CI/CD Setup (OIDC - Recommended)

Secure, keyless authentication from GitHub Actions to AWS. No stored credentials.

<details>
<summary>Click to expand OIDC setup instructions</summary>

#### Step 1: Deploy OIDC Infrastructure (One-Time)

[![Deploy OIDC](https://img.shields.io/badge/Deploy-GitHub_OIDC-232F3E?style=for-the-badge&logo=amazon-aws)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://memorable-cloudformation-templates.s3.us-east-1.amazonaws.com/github-oidc.yaml&stackName=memorable-github-oidc)

Or manually:
```bash
aws cloudformation create-stack \
  --stack-name memorable-github-oidc \
  --template-body file://cloudformation/github-oidc.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters ParameterKey=GitHubOrg,ParameterValue=YOUR_ORG \
               ParameterKey=GitHubRepo,ParameterValue=memoRable
```

#### Step 2: Add ONE GitHub Secret

| Secret | Value |
|--------|-------|
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID (e.g., `123456789012`) |

That's it. No access keys, no rotating credentials, no security risks.

#### Step 3: Push and Deploy

Push to `main` and GitHub Actions automatically:
1. Authenticates via OIDC (keyless)
2. Builds Docker images
3. Pushes to ECR
4. Deploys via Terraform

</details>

<details>
<summary>Click to expand legacy access key instructions (not recommended)</summary>

#### Step 1: Create IAM User

```bash
# IAM → Users → Create User → "memorable-deploy"
# Attach: AmazonEC2FullAccess, AmazonECS_FullAccess, AmazonVPCFullAccess,
#         SecretsManagerReadWrite, AmazonElastiCacheFullAccess, AmazonDocDBFullAccess,
#         AmazonS3FullAccess, AmazonDynamoDBFullAccess, IAMFullAccess,
#         CloudWatchLogsFullAccess, AmazonEC2ContainerRegistryFullAccess,
#         ElasticLoadBalancingFullAccess
# Create access key → Download CSV
```

#### Step 2: Add GitHub Secrets

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | From CSV |
| `AWS_SECRET_ACCESS_KEY` | From CSV |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (only if using Anthropic provider) |

#### Step 3: Bootstrap & Deploy

```bash
aws configure
./scripts/terraform-bootstrap.sh staging

cd terraform
terraform init -backend-config="bucket=memorable-terraform-state-staging"
export TF_VAR_anthropic_api_key="sk-ant-xxx"
terraform apply -var-file="environments/staging.tfvars"
```

</details>

<details>
<summary>Click to expand: Hosting your own one-click deploy templates (for forks)</summary>

#### Template Hosting Setup

The one-click deploy buttons require CloudFormation templates hosted in S3 (GitHub raw URLs don't work with CloudFormation quickcreate).

**Option 1: Automatic (CI/CD)**

1. Deploy the OIDC stack (see above)
2. Add `AWS_ACCOUNT_ID` secret to your repo
3. Push to `main` - the `publish-templates.yml` workflow auto-creates the bucket and uploads templates

**Option 2: Manual**

```bash
# Create the template bucket
aws cloudformation deploy \
  --template-file cloudformation/template-bucket.yaml \
  --stack-name memorable-template-bucket \
  --parameter-overrides BucketName=YOUR-BUCKET-NAME

# Upload templates
./scripts/publish-templates.sh YOUR-BUCKET-NAME us-east-1
```

Then update the deploy button URLs in README.md:
```
https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://YOUR-BUCKET-NAME.s3.us-east-1.amazonaws.com/memorable-stack.yaml&stackName=memorable
```

</details>

---

### AWS Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌───────────────────────┐   │
│  │   ALB    │────▶│   ECS    │────▶│     Data Layer        │   │
│  │ (HTTPS)  │     │ Fargate  │     │  ┌─────────────────┐  │   │
│  └──────────┘     │          │     │  │   DocumentDB    │  │   │
│       │           │ • App    │     │  │   (MongoDB)     │  │   │
│       │           │ • Ingest │     │  ├─────────────────┤  │   │
│  ┌────▼─────┐     │          │     │  │  ElastiCache    │  │   │
│  │ Secrets  │     └──────────┘     │  │   (Redis)       │  │   │
│  │ Manager  │                      │  └─────────────────┘  │   │
│  └──────────┘                      └───────────────────────┘   │
│                                                                  │
│  VPC: 10.0.0.0/16 │ Private Subnets │ NAT Gateway │ Auto-scale │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| `memorable_app` | 3000 | Main application |
| `memorable_mcp_server` | stdio | MCP server for Claude Code |
| `memorable_ingestion_service` | 8001 | Memory ingestion API |
| `memorable_mongo` | 27017 | Document storage + vectors |
| `memorable_redis` | 6379 | Context frames, caching |
| `memorable_lora_service` | 8090 | GPU LoRA service ([doc-to-lora](https://github.com/alanchelmickjr/doc-to-lora)) |

---

## Core Concepts

### Salience Scoring

Every memory gets a 0-100 salience score calculated at capture time:

| Factor | Weight | Signals |
|--------|--------|---------|
| **Emotional** | 30% | Keywords (died, love, fired), sentiment intensity |
| **Novelty** | 20% | New people, locations, topics |
| **Relevance** | 20% | Your name, interests, goals, close contacts |
| **Social** | 15% | Relationship events, conflicts, vulnerability |
| **Consequential** | 15% | Action items, decisions, deadlines, money |

### Context Frames

Rolling window of what's happening NOW:
- **Location**: Where you are (park, office, VS Code)
- **People**: Who you're with or working with
- **Activity**: What you're doing (meeting, coding, relaxing)
- **Project**: What codebase/task you're in

When context changes, relevant memories automatically surface.

### Multi-Device Architecture (Brain-Inspired)

Same user on multiple devices? MemoRable handles it like your brain handles sensory data:

```
Phone (GPS)      → Location Stream  ─┐
Laptop (Calendar)→ Activity Stream  ─┼──▶ Context Integration ──▶ Unified "Now"
Smart Glasses   → Visual Stream    ─┤     (Thalamus-inspired)
Smart Watch     → Biometric Stream ─┘
```

**How it works:**
- Each device maintains its own context stream (like sensory subsystems)
- Contexts are fused using resolution strategies:
  - **Location**: Mobile wins (has GPS)
  - **People**: Merged from all devices
  - **Activity**: Most recent wins
- Device-specific Redis keys prevent race conditions
- Query `unified: true` to get the fused context

```typescript
// Phone reports location
set_context({ location: "coffee shop", deviceId: "iphone-123", deviceType: "mobile" })

// Laptop reports calendar context
set_context({ people: ["Sarah"], activity: "meeting", deviceId: "macbook-456", deviceType: "desktop" })

// Get unified view across all devices
whats_relevant({ unified: true })
// → { location: "coffee shop", people: ["Sarah"], activity: "meeting", activeDevices: 2 }
```

**Sensor types supported**: location, audio, visual (LIDAR), calendar, activity, biometric, environment, social, semantic.

### Open Loops

Automatic tracking of commitments:
- **You owe them**: Things you promised to do
- **They owe you**: Things promised to you
- **Mutual**: Shared commitments

### Memory Lifecycle

```
active → archived → suppressed → deleted (30-day retention)
       ↑
    restore
```

### Pattern Learning (21-Day Rule)

Based on habit formation research:
- Patterns need 21 days to form reliably
- Confidence starts at 40%, ramps to 80% with consistency
- Post-formation: confidence = (occurrences / days) × 0.8
- RL feedback adjusts pattern weights over time

---

## Testing

```bash
# Run all Jest tests
npm test

# Run salience service unit tests (standalone)
npx tsx scripts/test_salience.ts

# Example output:
# === Anticipation Service Tests ===
# ✓ THRESHOLDS are correctly defined
# ✓ WINDOWS are correctly defined (21 days for pattern formation)
# ✓ getTimeOfDay returns correct values
# ✓ calculatePatternConfidence: Day 1 (brand new pattern)
# ✓ calculatePatternConfidence: Day 21 with 21 occurrences (fully formed)
# ✓ calculateRewardSignal: Mixed feedback
# === Test Summary ===
# Passed: 12
# Failed: 0
```

---

## Project Structure

```
memorable/
├── src/services/
│   ├── mcp_server/              # MCP server for Claude Code
│   │   ├── index.ts             # 38 MCP tools
│   │   └── lora_service_client.ts # GPU LoRA service bridge
│   ├── salience_service/        # Core memory intelligence
│   │   ├── index.ts             # Main exports
│   │   ├── anticipation_service.ts  # Predictive memory (21-day learning)
│   │   ├── pattern_detector.ts  # FFT-based periodicity detection (Cooley-Tukey)
│   │   ├── context_gate.ts      # Engram-style RMSNorm gating
│   │   ├── tier_manager.ts      # Zipfian Hot/Warm/Cold cache hierarchy
│   │   ├── predictive_anticipation.ts # 3×7 temporal model
│   │   ├── context_frame.ts     # Rolling context windows
│   │   ├── memory_operations.ts # Forget/reassociate/export
│   │   ├── feature_extractor.ts # LLM feature extraction
│   │   ├── salience_calculator.ts
│   │   ├── open_loop_tracker.ts
│   │   ├── relationship_tracker.ts
│   │   ├── briefing_generator.ts
│   │   ├── retrieval.ts
│   │   ├── adaptive_learning.ts
│   │   ├── metrics.ts           # Prometheus metrics
│   │   └── startup.ts           # Health checks
│   ├── lora_service/             # GPU LoRA service (FastAPI)
│   │   ├── app.py               # /internalize, /generate, /reset
│   │   ├── engine.py            # TextToLoRA lifecycle wrapper
│   │   ├── storage.py           # S3 + local weight storage
│   │   ├── Dockerfile           # CUDA container
│   │   └── requirements.txt     # Python deps
│   ├── ingestion_service/       # Memory ingestion API
│   └── embedding_service/       # Vector embeddings
├── scripts/
│   ├── setup.js                 # Auto-credential generation
│   ├── aws-setup.sh             # AWS infrastructure setup
│   └── test_salience.ts         # Unit tests
├── docs/research/
│   ├── continual-learning-architecture.md   # Mirzadeh et al. applied
│   ├── engram-predictive-memory.md          # Engram implementation guide
│   └── architecture-matters-in-continual-learning.pdf
├── .github/workflows/
│   ├── ci.yml                   # CI pipeline
│   └── deploy-aws.yml           # AWS deployment
├── docker-compose.yml           # Full stack
└── docs/
```

---

## API Endpoints

### Health & Metrics

```bash
GET /health/live      # Liveness probe
GET /health/ready     # Readiness probe
GET /health/startup   # Startup probe
GET /health           # Full status
GET /metrics          # Prometheus metrics
```

### Ingestion

```bash
POST /api/ingest/memory
{
  "text": "Meeting notes...",
  "userId": "user-123",
  "context": {
    "location": "office",
    "people": ["Sarah", "Mike"]
  }
}
```

### Ingestion Pipeline Architecture

High-throughput multimodal vectorization for docs and code:

```
┌─────────────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │  SOURCE  │──▶│ CHUNKER  │──▶│ EMBEDDER │──▶│ WEAVIATE │    │
│  │  SCANNER │   │ (adaptive)│   │ (hybrid) │   │ (batch)  │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WORKER POOL (parallel threads)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│                    ┌──────────────────┐                        │
│                    │  ERROR HANDLER   │                        │
│                    │  (retry/backoff) │                        │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Adaptive Chunking**: Markdown by headers, code by functions/classes
- **Hybrid Embedding**: Multiple models (OpenAI, CodeBERT, local)
- **Server-side Batching**: MongoDB backpressure for optimal throughput
- **Deterministic UUIDs**: Re-index without duplicates
- **Parallel Workers**: Configurable concurrency

---

## Environment Variables

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/memorable

# LLM Provider (choose one)
# Option 1: AWS Bedrock (recommended for AWS deployment - no API key needed)
LLM_PROVIDER=bedrock          # or set USE_BEDROCK=true
AWS_REGION=us-east-1          # Bedrock uses IAM authentication

# Option 2: Anthropic Direct API
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Option 3: OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxx

# Auto-detection (when LLM_PROVIDER not set):
# - Running in AWS (Lambda/ECS)? → Bedrock
# - ANTHROPIC_API_KEY set? → Anthropic
# - OPENAI_API_KEY set? → OpenAI

# Optional
REDIS_URL=redis://localhost:6379
WEAVIATE_URL=http://localhost:8080
MCP_USER_ID=default
LOG_LEVEL=INFO
```

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Open Pull Request

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Links

- [MCP Server Documentation](./src/services/mcp_server/README.md)
- [Salience Service Documentation](./src/services/salience_service/README.md)
- [Claude.ai Integration Guide](./docs/claude-ai-integration.md)
- [Example Prompts](./docs/example-prompts.md)
- [Privacy Policy](./PRIVACY.md)
- [API Reference](./docs/api-reference.md)
- [Deployment Guide](./docs/deployment-guide.md)
