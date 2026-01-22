# Repo Indexing Design

## Problem

17k lines of docs. Claude can't hold it all. Makes assumptions instead of finding answers.

## Architecture: Three Layers

1. **Flat Search** - Find specific things (needle in haystack)
2. **Graph** - See connections and flow (topographical view)
3. **Engine** - Compare use cases ↔ implementations + engineering review

### Layer 1: Flat Search

Use what exists. Store doc chunks as memories with entity `claude_docs`. Query via existing API.

```
Index: Chunk docs → POST /memory with entity "claude_docs"
Query: GET /memory?entity=claude_docs&query=<search term>
```

### Layer 2: Graph

Connect docs by relationships:
- This doc references that doc
- This concept flows into that concept
- These files work together for this use case

Shows the path through the forest, not just individual trees.

### Layer 3: Engine

Bidirectional comparison + quality review:
- "What do we have for auth?" → finds existing implementations
- "What is this auth code used for?" → finds use cases
- "Why are there 3 auth implementations?" → surfaces duplication/inconsistency
- Engineering final pass before code ships

## Phase 1: Flat Search (Now)

### Chunking
- Split by markdown headers
- Max 1500 chars per chunk
- Keep header in metadata

### Build
One script: `scripts/index-docs.cjs`
- Reads all .md files from docs/, README.md, CLAUDE.md
- Chunks by section
- POSTs to memorable API with entity "claude_docs"
- Run once, re-run when docs change

### Query
Already works via existing API:
```bash
curl -H "X-API-Key: $KEY" \
  "http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com/memory?entity=claude_docs&query=weaviate+schema"
```

## Phase 2: Graph (Future)

Build relationship mapping between docs/code.

## Phase 3: Engine (Future)

Bidirectional use case mapping + engineering review pass.

## Next

1. Alan approves
2. Build indexing script (Phase 1)
3. Run it
4. Test queries
5. Plan Phase 2 and 3
