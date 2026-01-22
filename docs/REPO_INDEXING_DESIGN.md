# Repo Indexing Design

## Problem

17k lines of docs. Claude can't hold it all. Makes assumptions instead of finding answers.

## Solution

Use what exists. Store doc chunks as memories with entity `claude_docs`. Query via existing API.

No new schema. No new infrastructure. Works now.

## How It Works

```
1. Index: Chunk docs → POST /memory with entity "claude_docs"
2. Query: GET /memory?entity=claude_docs&query=<search term>
3. Use: Claude gets relevant chunks, has context
```

## Chunking

- Split by markdown headers
- Max 1500 chars per chunk
- Keep header in metadata

## Build

One script: `scripts/index-docs.cjs`

- Reads all .md files from docs/, README.md, CLAUDE.md
- Chunks by section
- POSTs to memorable API with entity "claude_docs"
- Run once, re-run when docs change

## Query

Already works via existing API:

```bash
curl -H "X-API-Key: $KEY" \
  "http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com/memory?entity=claude_docs&query=weaviate+schema"
```

## Optional Enhancement

Add to SessionStart hook: query claude_docs based on current work, inject relevant chunks.

## Next

1. Alan approves
2. Build indexing script
3. Run it
4. Test queries
