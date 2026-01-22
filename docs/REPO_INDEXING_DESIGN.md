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

## Phase 1: Flat Search ✅ COMPLETE

### Chunking (AdaptiveChunker)
- **Markdown**: Split by headers (h1-h4)
- **Code**: Split by functions/classes
- **Prose**: Split by paragraphs
- Max 1500 chars per chunk with 100 char overlap
- Metadata: sourceFile, sourceType, section, lineStart/End

### Tools Built

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/index-simple.ts` | Index MemoRable repo | `npx tsx scripts/index-simple.ts --memorable` |
| `scripts/index-project.ts` | Index ANY git repo | `npx tsx scripts/index-project.ts /path project_name` |

### Architecture

```
Sources → AdaptiveChunker → Sinks (MemoRable API, Weaviate, Console)
         (markdown/code)    (pluggable storage)
```

Key files:
- `src/services/ingestion_pipeline/index.ts` - Chunker, BatchManager, WorkerPool
- `src/services/ingestion_pipeline/sinks.ts` - MemorableSink, ConsoleSink, MultiSink
- `src/services/ingestion_pipeline/weaviate_sink.ts` - Weaviate storage

### Query
```bash
# Query indexed docs
curl -H "X-API-Key: $KEY" \
  "$API/memory?entity=claude_docs&query=weaviate+schema"

# Query specific project
curl -H "X-API-Key: $KEY" \
  "$API/memory?entity=android_bot&query=grpc"
```

### Status
- MemoRable docs: **1400+ chunks indexed**
- android-bot: **indexing in progress**

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
