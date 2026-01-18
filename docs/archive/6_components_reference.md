# Component Reference

## MemorySteward
```typescript
class MemorySteward {
  public static recallMemories(query: MemoryQuery): Promise<MemoryResult[]>;
  public static archiveMemory(memento: Memento): Promise<void>;
}
```

## MementoConstructor
```typescript
interface Memento {
  id: string;
  content: string;
  emotionalContext: EmotionalVector;
  metadata: TemporalMetadata;
}

class MementoConstructor {
  public construct(rawInput: string): Memento;
}
```

[View full source](src/services/ingestion_service/memory_steward.ts:12)