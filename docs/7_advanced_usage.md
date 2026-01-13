# Advanced Usage

## Security Tiers

Store memories with appropriate security classification:

```typescript
// Tier 3 (Vault) - Maximum security, no LLM, no vectors
await store_memory({
  text: "Credit card: 4532-XXXX-XXXX-1234",
  securityTier: "Tier3_Vault"
});

// Tier 2 (Personal) - Encrypted, local LLM only (default)
await store_memory({
  text: "Met with Sarah about the merger",
  securityTier: "Tier2_Personal"
});

// Tier 1 (General) - Standard security, external LLM OK
await store_memory({
  text: "The office is on the 3rd floor",
  securityTier: "Tier1_General"
});
```

## Custom Processing Pipelines

```typescript
const customPipeline = new PreprocessingPrism()
  .addStep({
    name: "pii-filter",
    execute: (input) => input.replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, "[REDACTED]")
  })
  .addStep({
    name: "sentiment-boost",
    execute: (input, context) => {
      // Boost salience for emotional content
      if (context.detectedEmotion) {
        context.salienceModifier = 1.2;
      }
      return input;
    }
  });
```

## Multi-Device Context Fusion

```typescript
// Phone reports location
await set_context({
  location: "coffee shop",
  deviceId: "iphone-123",
  deviceType: "mobile"
});

// Laptop reports calendar
await set_context({
  people: ["Sarah"],
  activity: "meeting",
  deviceId: "macbook-456",
  deviceType: "desktop"
});

// Get unified view (brain-inspired fusion)
const unified = await whats_relevant({ unified: true });
// Result: { location: "coffee shop", people: ["Sarah"], activity: "meeting" }
```

## Predictive Memory (21-Day Learning)

```typescript
// After 21 days of observation, patterns unlock
const outlook = await day_outlook({
  calendar: [
    { title: "Standup", startTime: "2024-01-15T09:00:00", attendees: ["Sarah", "Mike"] }
  ]
});

// Provide feedback to improve predictions
await memory_feedback({ patternId: "pattern_123", action: "used" });    // +1.0 reward
await memory_feedback({ patternId: "pattern_456", action: "ignored" }); // -0.1 reward
```

## Performance Optimization

```bash
# Environment variables for tuning
MEMORY_WINDOW_SHORT=1200000      # 20 minutes in ms
MEMORY_WINDOW_MEDIUM=3600000     # 1 hour
MEMORY_WINDOW_LONG=86400000      # 24 hours

# Redis connection pool
REDIS_POOL_SIZE=10

# LLM batching (reduces API calls)
LLM_BATCH_SIZE=10
LLM_BATCH_WAIT_MS=100
```

## Behavioral Identity Integration

```typescript
// Identify user by writing style (after 50+ samples)
const identity = await identify_user({ message: "hey can u check the thing" });
// Result: { userId: "alex@company.com", confidence: 0.94 }

// Get behavioral metrics
const metrics = await behavioral_metrics({ timeRange: "24h" });
```

---

[Back to User Guide](./4_user_guide.md) | [Security Architecture](./SECURITY_ARCHITECTURE.md) | [Scalability Analysis](./SCALABILITY_ANALYSIS.md)
