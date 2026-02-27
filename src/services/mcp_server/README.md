# MemoRable MCP Server

Model Context Protocol server for the Memory Salience System. Enables Claude Code, VS Code extensions, and other MCP-compatible clients to access persistent, salient memory.

## Quick Start

### For Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or VS Code settings):

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

### For Docker

```json
{
  "mcpServers": {
    "memorable": {
      "command": "docker",
      "args": ["exec", "-i", "memorable_mcp_server", "node", "dist/index.js"],
      "env": {}
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MCP_USER_ID` | No | User ID for multi-user setups (default: "default") |
| `ANTHROPIC_API_KEY` | No* | For LLM-powered feature extraction |
| `OPENAI_API_KEY` | No* | Alternative to Anthropic |
| `LLM_PROVIDER` | No | "anthropic" or "openai" (default: anthropic) |

*At least one LLM API key recommended for full salience features.

## Available Tools

### `store_memory`
Store a memory with automatic salience scoring.

```
Use this to remember important information, conversations, decisions, or commitments.
```

**Parameters:**
- `text` (required): The memory content
- `context`: Optional context (location, activity, mood)
- `useLLM`: Use LLM for richer extraction (default: true)

### `recall`
Search and retrieve relevant memories.

**Parameters:**
- `query` (required): What to search for
- `limit`: Max results (default: 10)
- `person`: Filter by person mentioned
- `minSalience`: Minimum salience 0-100

### `get_briefing`
Get a pre-conversation briefing about a person.

**Parameters:**
- `person` (required): Name of person
- `quick`: Quick vs full briefing

### `list_loops`
List open commitments and follow-ups.

**Parameters:**
- `owner`: "self" (you owe), "them" (they owe), "mutual"
- `person`: Filter by person
- `includeOverdue`: Include overdue items

### `close_loop`
Mark a commitment as completed.

**Parameters:**
- `loopId` (required): ID of loop to close
- `note`: Completion note

### `get_status`
Get system status and metrics.

## Available Resources

| URI | Description |
|-----|-------------|
| `memory://recent` | Recent high-salience memories |
| `memory://loops` | Open commitments |
| `memory://contacts` | Known contacts with relationship data |

## Available Prompts

### `daily_briefing`
Get a summary of what needs attention today.

### `person_context`
Get full context about a person before a conversation.

**Arguments:**
- `person` (required): Name of the person

## Example Usage in Claude

```
Human: What do I owe Sarah?