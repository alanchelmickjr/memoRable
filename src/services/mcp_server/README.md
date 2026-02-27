# MemoRable MCP Server

Persistent, salient memory for AI agents. 51 tools via Model Context Protocol.

AI that knows you like a friend, every time you talk to it — not because it remembers everything, but because it remembers what matters.

## One-Click Install (Claude Code)

Clone the repo. It works.

```bash
git clone https://github.com/alanchelmickjr/memoRable.git
cd memoRable
# .mcp.json is already configured — Claude Code picks it up automatically
```

That's it. The `.mcp.json` tells Claude Code to start the MCP server via `scripts/mcp-start.sh`. Dependencies install on first run.

### Cloud API (recommended)

Set the API endpoint and the server connects to the cloud backend:

```bash
# In .env (auto-loaded by mcp-start.sh)
API_BASE_URL=https://api.memorable.chat
```

### Self-Hosted

Deploy your own stack on AWS (~$11/mo):

```bash
aws cloudformation deploy \
  --template-file cloudformation/memorable-ec2-stack.yaml \
  --stack-name memorable \
  --capabilities CAPABILITY_NAMED_IAM
```

## Features

- **51 MCP tools** with full annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
- **Salience scoring** — emotion 30%, novelty 20%, relevance 20%, social 15%, consequential 15%
- **Open loop tracking** — commitments and follow-ups never forgotten
- **Predictive memory** — 21-day pattern learning, memories surface before you ask
- **Multi-device context** — seamless handoff between desktop, phone, AR glasses
- **Security tiers** — Tier1 (general), Tier2 (personal, local LLM only), Tier3 (AES-256-GCM vault)
- **Entity pressure tracking** — butterfly effect early warning for relationships
- **Emotion fusion** — text, voice prosody, video, EVI multi-modal
- **OAuth 2.0** — full auth flow for remote deployment

## Working Examples

### Example 1: Store and Recall Memories

Store a memory, then retrieve it by semantic search:

```
Human: Remember that Sarah prefers morning meetings and is allergic to shellfish.

Claude: [calls store_memory]
  → text: "Sarah prefers morning meetings and is allergic to shellfish"
  → entities: ["sarah"]
  Result: Stored with salience 72 (social: high, consequential: medium — allergy is safety-critical)