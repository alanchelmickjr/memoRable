# Auto-Indexing Diagnosis

## Summary

**Problem**: When a memory is stored with a project entity (e.g., `memorable_project`, `android_bot`), the system should auto-index that project's git repo. This feature does not exist.

**Current State**: All indexing is manual via CLI scripts. No auto-triggering.

---

## Current Indexing Architecture

### Manual Scripts (all require CLI execution)

| Script | Purpose | Command |
|--------|---------|---------|
| `scripts/index-simple.ts` | Index docs/ + README + CLAUDE.md | `npx tsx scripts/index-simple.ts --memorable` |
| `scripts/index-project.ts` | Index any git repo | `npx tsx scripts/index-project.ts /path/to/repo entity_name` |
| `scripts/index-repo.ts` | Index to Weaviate directly | `npx tsx scripts/index-repo.ts --all` |

### Storage Flow (store_memory in MCP)

```
store_memory(text, context)
    ↓
1. Extract features (LLM/heuristic)
2. Calculate salience score
3. Encrypt if Tier2/Tier3
4. Store to MongoDB (memories collection)
5. Store to TierManager → Weaviate vectors
6. Detect distress, notify care circle
    ↓
Done. NO auto-indexing.
```

### MemorableSink (used by index scripts)

Located: `src/services/ingestion_pipeline/sinks.ts`

- Authenticates via knock/exchange
- Stores chunks with entities: `[claude_code, memorable_project]` or `[claude_docs, memorable_project]`
- Adaptive rate limiting with exponential backoff

---

## What's Missing

### 1. Project Entity Detection

When `store_memory` is called with entities like:
- `memorable_project`
- `android_bot`
- Any top-level project entity

The system should recognize this as a "project" entity that may have an associated git repo.

### 2. Project Registry

Need a way to map project entities to their git repo paths:

```typescript
interface ProjectEntity {
  entityId: string;           // e.g., "memorable_project"
  repoPath?: string;          // e.g., "/Users/crackerjack/dev/GitHub/memoRable"
  repoUrl?: string;           // e.g., "https://github.com/alanchelmickjr/memoRable"
  indexed: boolean;
  lastIndexedAt?: string;
  chunkCount?: number;
}
```

### 3. Auto-Index Trigger

In `store_memory` (or a post-store hook), after detecting a project entity:

```typescript
// Pseudo-code for what should exist
if (isProjectEntity(entity) && !isIndexed(entity)) {
  const repoPath = getRepoPath(entity);
  if (repoPath) {
    await triggerRepoIndex(repoPath, entity);
  }
}
```

### 4. Index Status Tracking

Collection: `project_entities` or extend `entity_metadata`

Track:
- Which projects are indexed
- When last indexed
- Chunk count
- Index errors

---

## Why the 233 Memories Are Gone

1. MongoDB Atlas database was reset during development
2. No backup was triggered
3. Indexed repos (3 previously) were stored as memories with entity tags
4. When the database reset, all those memories (including indexed chunks) were lost

---

## Weaviate Status (Updated 2026-01-25)

**Finding**: Weaviate is NOT deployed in the AWS CloudFormation stack.

Current cloud infrastructure:
- MongoDB (ECS Fargate with EFS persistence)
- Redis (ElastiCache)
- ECS for the app

Weaviate is only referenced in:
- Local docker-compose setup
- Code that references `WEAVIATE_URL` env var

For cloud-only deployment:
- Weaviate vectors are not being stored
- All memory storage goes to MongoDB only
- Vector search relies on MongoDB Atlas Search or is disabled

---

## Proposed Solutions

### Option A: MCP-Triggered Auto-Index (Recommended)

1. Add `index_project` MCP tool that Claude can call
2. When Claude stores a memory for a new project, Claude can call `index_project`
3. Keeps control explicit but automated through Claude

### Option B: Post-Store Hook Auto-Index

1. After `store_memory`, check if entity is a project
2. Look up repo path from project registry
3. Queue background indexing job
4. More automatic but less control

### Option C: Hybrid

1. First memory for a project entity prompts: "Should I index the repo for {entity}?"
2. User confirms, indexing runs
3. Subsequent memories skip the prompt

---

## Files to Modify

1. `src/services/mcp_server/index.ts` - Add project detection, index trigger
2. `src/services/ingestion_pipeline/sinks.ts` - Already has MemorableSink, works
3. New: `src/services/project_registry.ts` - Store project → repo mappings
4. New: `src/services/auto_indexer.ts` - Background indexing service

---

## Questions for Discussion

1. **Repo Path Discovery**: How should the system know where a project's repo is?
   - Store path when entity is first created?
   - Infer from Claude's working directory?
   - Require explicit configuration?

2. **Re-indexing**: Should projects auto-reindex on changes?
   - Git hook integration?
   - Periodic re-index?
   - Manual only?

3. **Entity Type Detection**: How to distinguish project entities from person entities?
   - Naming convention (e.g., `_project` suffix)?
   - Explicit type field?
   - Presence of repo path?

4. **Weaviate for Cloud**: Should we add Weaviate Cloud Service to the deployment?
   - Or use MongoDB Atlas Search for vector similarity?
   - Current code supports both
