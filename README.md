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

**Predictive Memory**: After 21 days of learning your patterns, MemoRable surfaces what you need *before you ask*.

---

## Get Started in 2 Minutes

### Option A: Deploy to AWS (Production)

**Click. Enter API key. Done.**

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://raw.githubusercontent.com/alanchelmickjr/memoRable/main/cloudformation/memorable-stack.yaml&stackName=memorable)

1. Click the button above
2. Enter your [Anthropic API key](https://console.anthropic.com)
3. Wait 15 minutes
4. Get your URL from CloudFormation Outputs

**Costs**: ~$150/mo (small) | ~$400/mo (medium) | ~$800/mo (large)

---

### Option B: Local Development

```bash
git clone https://github.com/alanchelmickjr/memoRable.git && cd memoRable
npm install && npm run setup && docker-compose up -d
```

---

### Option C: Add to Your Project

**TypeScript/Node.js:**
```bash
npm install @memorable/sdk
```

**Python:**
```bash
pip install memorable-sdk
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
- *"What's my day outlook?"* (after 21 days of learning)

---

## MCP Tools Reference (19 Tools)

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

### Predictive Memory (21-Day Learning)
| Tool | Description |
|------|-------------|
| `anticipate` | Get predictions based on calendar + learned patterns |
| `day_outlook` | Morning briefing with predicted context switches |
| `pattern_stats` | Check learning progress (X/21 days) |
| `memory_feedback` | RL feedback: was the surfaced memory useful? |

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

---

### AWS One-Click Deploy

**Click the button. Enter your Anthropic key. Wait 15 minutes. Done.**

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-FF9900?style=for-the-badge&logo=amazon-aws)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=https://raw.githubusercontent.com/alanchelmickjr/memoRable/main/cloudformation/memorable-stack.yaml&stackName=memorable)

| What you need | Where to get it |
|---------------|-----------------|
| AWS Account | [aws.amazon.com](https://aws.amazon.com) |
| Anthropic API Key | [console.anthropic.com](https://console.anthropic.com) |

**That's it.** The stack:
1. Creates VPC, databases, load balancer, auto-scaling
2. Pulls the code from GitHub
3. Builds the Docker image
4. Deploys to ECS

Your URL appears in CloudFormation Outputs when complete.

#### Costs

| Size | Monthly Cost | Use Case |
|------|--------------|----------|
| Small | ~$150 | Development, testing |
| Medium | ~$400 | Small production |
| Large | ~$800 | Production with HA |

---

### AWS Advanced (Terraform)

For CI/CD pipelines, multi-environment, or infrastructure customization.

<details>
<summary>Click to expand Terraform instructions</summary>

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
| `ANTHROPIC_API_KEY` | `sk-ant-...` |

#### Step 3: Bootstrap & Deploy

```bash
aws configure
./scripts/terraform-bootstrap.sh staging

cd terraform
terraform init -backend-config="bucket=memorable-terraform-state-staging"
export TF_VAR_anthropic_api_key="sk-ant-xxx"
terraform apply -var-file="environments/staging.tfvars"
```

Or just push to `main` and GitHub Actions handles it.

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
│   │   └── index.ts             # 18 MCP tools
│   ├── salience_service/        # Core memory intelligence
│   │   ├── index.ts             # Main exports
│   │   ├── anticipation_service.ts  # Predictive memory (21-day learning)
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
│   ├── ingestion_service/       # Memory ingestion API
│   └── embedding_service/       # Vector embeddings
├── scripts/
│   ├── setup.js                 # Auto-credential generation
│   ├── aws-setup.sh             # AWS infrastructure setup
│   └── test_salience.ts         # Unit tests
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
