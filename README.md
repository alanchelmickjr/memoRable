# MemoRable - Context-Aware Memory for AI Agents

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue?style=for-the-badge)](https://modelcontextprotocol.io)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Ready-191919?style=for-the-badge&logo=anthropic)](https://claude.ai)
[![Mem0 Compatible](https://img.shields.io/badge/Mem0-Compatible-purple?style=for-the-badge)](https://mem0.ai)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg?logo=python)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

**Memory that understands context.** MemoRable is a memory layer for AI agents that knows what matters based on where you are, who you're with, and what you're doing.

```
You: "I'm at the park meeting Judy"
MemoRable: Here's what you need to know:
  - You owe her feedback on the proposal (3 days overdue)
  - Her daughter's recital is Thursday
  - Last time you discussed: Series B funding concerns
  - Sensitivity: Don't bring up the merger
```

---

## Quick Start: Claude Code / VS Code

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
- *"Remember that Sarah mentioned her startup is closing Series B next month"*
- *"What do I owe Mike?"*
- *"I'm meeting with the engineering team - what's relevant?"*
- *"Forget everything about Project X"*

---

## MCP Tools Reference

### Context Management
| Tool | Description |
|------|-------------|
| `set_context` | Set where you are, who you're with. Auto-surfaces relevant memories. |
| `whats_relevant` | Get what matters NOW based on current context |
| `clear_context` | Clear context when leaving/ending |

### Memory Operations
| Tool | Description |
|------|-------------|
| `store_memory` | Store with automatic salience scoring |
| `recall` | Search memories by query, person, or topic |
| `get_briefing` | Pre-conversation briefing about a person |
| `forget` | Suppress, archive, or delete a memory |
| `forget_person` | Forget all memories about someone |
| `restore` | Bring back a forgotten memory |
| `reassociate` | Re-link memory to different people/topics/projects |
| `export_memories` | Export for backup or portability |

### Commitment Tracking
| Tool | Description |
|------|-------------|
| `list_loops` | Open commitments (you owe / they owe) |
| `close_loop` | Mark a commitment as done |
| `get_status` | System status and metrics |

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

## Mem0 Integration

MemoRable can work alongside or replace Mem0 for enhanced memory capabilities:

```python
from memorable import MemorableClient
from mem0 import Memory as Mem0Memory

# Use MemoRable for salience + Mem0 for vectors
class HybridMemory:
    def __init__(self):
        self.memorable = MemorableClient()
        self.mem0 = Mem0Memory()

    def add(self, text: str, user_id: str, metadata: dict = None):
        # MemoRable handles: salience, commitments, relationships
        result = self.memorable.store(user_id, text, metadata)

        # Mem0 handles: vector embeddings, semantic search
        self.mem0.add(text, user_id=user_id, metadata={
            **metadata,
            'salience_score': result.salience.score,
            'memory_id': result.memory_id
        })

        return result

    def search(self, query: str, user_id: str, **kwargs):
        # Semantic search via Mem0
        mem0_results = self.mem0.search(query, user_id=user_id, **kwargs)

        # Boost by MemoRable salience scores
        for result in mem0_results:
            memorable_data = self.memorable.get(result['metadata']['memory_id'])
            result['boosted_score'] = (
                result['score'] * 0.6 +
                (memorable_data.salience_score / 100) * 0.4
            )

        return sorted(mem0_results, key=lambda x: x['boosted_score'], reverse=True)

    def get_briefing(self, user_id: str, person: str):
        # MemoRable-specific: pre-conversation intelligence
        return self.memorable.get_briefing(user_id, person)
```

### Migration from Mem0

```python
from memorable import MemorableClient
from mem0 import Memory

# Export from Mem0
mem0 = Memory()
all_memories = mem0.get_all(user_id="user-123")

# Import to MemoRable with salience enrichment
memorable = MemorableClient()

for mem in all_memories:
    memorable.store(
        user_id="user-123",
        text=mem['memory'],
        context={
            'imported_from': 'mem0',
            'original_id': mem['id'],
            'created_at': mem['created_at']
        }
    )

print(f"Migrated {len(all_memories)} memories with salience enrichment")
```

---

## AWS Deployment

### Quick Deploy

```bash
git clone https://github.com/alanchelmickjr/memoRable.git
cd memorable

# Auto-generates secure credentials
npm run setup

# Start all services
docker-compose up -d
```

### Production (AWS)

```bash
# Deploy to AWS (ECS + DocumentDB + ElastiCache)
./scripts/aws-deploy.sh --region us-east-1 --environment production
```

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Route 53  │──│     ALB     │──│      ECS Fargate        │  │
│  │   (DNS)     │  │ (Load Bal.) │  │  ┌─────────────────┐    │  │
│  └─────────────┘  └─────────────┘  │  │ MemoRable App   │    │  │
│                                     │  │ Salience Service│    │  │
│  ┌─────────────┐  ┌─────────────┐  │  │ MCP Server      │    │  │
│  │  Secrets    │  │ CloudWatch  │  │  └─────────────────┘    │  │
│  │  Manager    │  │  (Metrics)  │  └─────────────────────────┘  │
│  └─────────────┘  └─────────────┘                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Data Layer                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ DocumentDB  │  │ ElastiCache │  │    Weaviate     │  │    │
│  │  │ (MongoDB)   │  │   (Redis)   │  │   (Vectors)     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| `memorable_app` | 3000 | Main application |
| `memorable_mcp_server` | stdio | MCP server for Claude Code |
| `memorable_ingestion_service` | 8001 | Memory ingestion API |
| `memorable_mongo` | 27017 | Document storage |
| `memorable_redis` | 6379 | Context frames, caching |
| `memorable_weaviate` | 8080 | Vector search |

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

---

## Project Structure

```
memorable/
├── src/services/
│   ├── mcp_server/           # MCP server for Claude Code
│   │   └── index.ts          # 14 MCP tools
│   ├── salience_service/     # Core memory intelligence
│   │   ├── index.ts          # Main exports
│   │   ├── context_frame.ts  # Rolling context windows
│   │   ├── memory_operations.ts  # Forget/reassociate/export
│   │   ├── feature_extractor.ts  # LLM feature extraction
│   │   ├── salience_calculator.ts
│   │   ├── open_loop_tracker.ts
│   │   ├── relationship_tracker.ts
│   │   ├── briefing_generator.ts
│   │   ├── retrieval.ts
│   │   ├── adaptive_learning.ts
│   │   ├── metrics.ts        # Prometheus metrics
│   │   └── startup.ts        # Health checks
│   ├── ingestion_service/    # Memory ingestion API
│   └── embedding_service/    # Vector embeddings
├── docker-compose.yml        # Full stack
├── scripts/
│   └── setup.js              # Auto-credential generation
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

---

## Environment Variables

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/memorable

# LLM (for salience extraction)
ANTHROPIC_API_KEY=sk-ant-xxx   # Recommended
OPENAI_API_KEY=sk-xxx          # Alternative

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
- [API Reference](./docs/api-reference.md)
- [Deployment Guide](./docs/deployment-guide.md)
