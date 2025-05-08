# API Reference

## Ingestion Service
### `POST /api/ingest`
```typescript
interface IngestionRequest {
  rawInput: string;
  context: Record<string, any>;
}

interface IngestionResponse {
  mementoId: string;
  status: "processed" | "queued";
}
```

## Memory Management
### `GET /api/memories`
```typescript
interface MemoryQuery {
  query: string;
  emotionalContext?: string;
  limit?: number;
}

interface MemoryResult {
  id: string;
  content: string;
  relevanceScore: number;
}
```

[Component API Details](docs/6_components_reference.md) | [Error Codes](docs/8_troubleshooting_guide.md#error-codes)