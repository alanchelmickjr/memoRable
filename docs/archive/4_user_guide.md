# User Guide

## Basic Usage
```typescript
// Example from ingestion integrator:
const integrator = new IngestionIntegrator();
await integrator.processInput({
  rawInput: "User memory",
  context: { emotionalState: "neutral" }
});
```

## Common Tasks
1. **Add Memory**
   ```bash
   curl -X POST /api/memories \
     -H "Content-Type: application/json" \
     -d '{"content": "Meeting notes", "context": {"priority": "high"}}'
   ```

2. **Retrieve Memories**
   ```typescript
   const memories = await MemorySteward.recallMemories({
     query: "meeting",
     emotionalContext: "neutral"
   });
   ```

## Workflow Diagram
![Ingestion Flow](docs/diagrams/ingestion-flow.png)

[Advanced usage](docs/7_advanced_usage.md) | [Troubleshooting](docs/8_troubleshooting_guide.md)