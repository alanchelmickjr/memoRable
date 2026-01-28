# Auto-Index Hook Plan

## What Alan Wants

When session starts in a KNOWN repo:
1. Check if docs have changed since last index
2. Ask if he wants to re-index
3. Option to "always index" (skip asking)

## Implementation

### Session Start Hook Addition

```javascript
function checkDocsChanged() {
  // Compare git status or file mtimes against last index timestamp
  // Return: { changed: boolean, files: string[] }
}

function getLastIndexTime(apiKey, project) {
  // Query memorable for last index timestamp
  // GET /memory?entity={project}&query=index_timestamp&limit=1
}

// In main():
const docsChanged = checkDocsChanged();
if (docsChanged.changed) {
  parts.push('## Docs Changed Since Last Index');
  parts.push(`Files: ${docsChanged.files.join(', ')}`);
  parts.push('');
  parts.push('**Ask user:** Re-index docs? (or set AUTO_INDEX=true to skip asking)');
}
```

### Auto-Index Option

Environment variable: `MEMORABLE_AUTO_INDEX=true`

If set, hook runs indexing automatically without asking.

### Flow

```
Session Start
    │
    ▼
Known Repo? ──No──> First-time index prompt
    │
   Yes
    │
    ▼
Docs Changed? ──No──> Continue (no prompt)
    │
   Yes
    │
    ▼
AUTO_INDEX=true? ──Yes──> Run index silently
    │
   No
    │
    ▼
Inject "Docs changed, ask about re-indexing" into additionalContext
    │
    ▼
Claude asks Alan
    │
    ▼
Alan says yes/no/always
```

### "Always" Option

If Alan says "always", Claude should:
1. Run the index
2. Store preference: `MEMORABLE_AUTO_INDEX=true` in `.claude/settings.local.json`

## Questions

1. Check changes via git status or file mtime?
2. Index ALL docs or just changed files?
3. Store last-index timestamp where? (memorable API or local file)
