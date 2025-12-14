# Memory Salience Service

**Human-Like Memory Salience System v2.0**

## Overview

This service implements salience scoring at capture time, not overnight. The key insight: humans calculate salience at encoding time - the emotional spike happens when the thing happens, not eight hours later.

## Cost

- **Per memory**: ~$0.003 (single Haiku LLM call + computation)
- **Daily (50 memories)**: ~$0.20
- **Monthly**: ~$6-8

**Compared to nocturnal reinforcement: $120/day → $0.27/day (99.8% cheaper)**

## Components

### 1. Salience Calculator (`salience_calculator.ts`)

Computes memory salience using five components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Emotional | 0.30 | High emotion = better encoding |
| Novelty | 0.20 | New experiences get priority |
| Relevance | 0.20 | Relates to identity, goals, relationships |
| Social | 0.15 | Relationship events, status changes |
| Consequential | 0.15 | Downstream effects, action items |

### 2. Feature Extractor (`feature_extractor.ts`)

Single LLM call extracts:
- Emotional keywords and sentiment
- People mentioned and relationship events
- Topics, action items, decisions
- Commitments and dates
- Questions and mutual agreements

### 3. Open Loop Tracker (`open_loop_tracker.ts`)

Tracks unresolved exchanges:
- Commitments made/received
- Questions pending answers
- Topics unresolved
- Follow-ups needed

### 4. Timeline Tracker (`timeline_tracker.ts`)

Tracks other people's timelines:
- Their upcoming events
- Life changes (promotions, moves, etc.)
- Sensitive topics to be aware of

### 5. Relationship Tracker (`relationship_tracker.ts`)

Tracks relationship health:
- Interaction frequency and patterns
- Engagement trends
- Cold relationships needing attention

### 6. Briefing Generator (`briefing_generator.ts`)

Pre-conversation context assembly:
- What you owe them
- What they owe you
- Their upcoming events
- Sensitive topics
- Suggested conversation topics

### 7. Adaptive Learning (`adaptive_learning.ts`)

Learns what matters to you:
- Tracks what gets retrieved and acted upon
- Adjusts weights based on your patterns
- Personalizes salience over time

## Usage

### Initialize Service

```typescript
import { initializeSalienceService } from './salience_service';
import { getDatabase } from '../config/database';

const db = getDatabase();
await initializeSalienceService(db);
```

### Enrich Memory at Capture

```typescript
import { enrichMemoryWithSalience, type LLMClient } from './salience_service';

const result = await enrichMemoryWithSalience(
  {
    memoryId: 'mem_123',
    text: 'Sarah told me her mother passed away last week...',
    userId: 'user_456',
  },
  llmClient,
  userProfile
);

console.log(result.salience.score); // 78
console.log(result.openLoopsCreated); // Any commitments extracted
console.log(result.timelineEventsCreated); // Events in others' lives
```

### Generate Pre-Conversation Briefing

```typescript
import { generateBriefing, formatBriefing } from './salience_service';

const briefing = await generateBriefing(userId, contactId);
console.log(formatBriefing(briefing));
```

Output:
```
═══ BRIEFING: Sarah Chen ═══

📊 RELATIONSHIP:
   Met: Oct 15, 2025 (robotics floor tour)
   Last spoke: Dec 7, 2025 (8 days ago)
   Total interactions: 4
   Trend: 📈 Increasing

📅 THEIR UPCOMING EVENTS:
   ⚫ Mother's funeral - Thursday

🔄 OPEN LOOPS:
   You owe: Nothing
   Mutual: "Let's sync in January about warehouse automation pilot"

💡 SUGGESTED TOPICS:
   • Express condolences (if not done)

⚠️ SENSITIVITIES:
   • Recent loss - be careful about family topics
════════════════════════════════════════
```

### Salience-Weighted Retrieval

```typescript
import { retrieveWithSalience } from './salience_service';

const results = await retrieveWithSalience(vectorSearchCandidates, {
  query: 'what should I know about Sarah?',
  userId: 'user_456',
  temporalFocus: 'default',
});
```

## Integration with Ingestion Pipeline

```typescript
import { enrichMementoWithSalience, mergeSalienceIntoMemento } from './salience_service/ingestion_integration';

// After memento construction, before storage:
const result = await enrichMementoWithSalience(memento, {
  useLLM: true,
  llmClient: myLLMClient,
});

if (result.success) {
  const enrichedMemento = mergeSalienceIntoMemento(memento, result.enrichedData!);
  await storageService.store(enrichedMemento);
}
```

## Maintenance Tasks

### Daily

```typescript
import { runDailyMaintenance } from './salience_service';

const result = await runDailyMaintenance(userId);
// Updates recurring events, creates relationship snapshots
```

### Weekly

```typescript
import { runWeeklyMaintenance } from './salience_service';

const result = await runWeeklyMaintenance();
// Recalibrates adaptive weights for all users
```

## Database Collections

| Collection | Purpose |
|------------|---------|
| `open_loops` | Tracks commitments and open items |
| `person_timeline_events` | Other people's events |
| `relationship_patterns` | Interaction patterns |
| `relationship_snapshots` | Time-series relationship health |
| `retrieval_logs` | For adaptive weight learning |
| `learned_weights` | User-specific salience weights |
| `contacts` | Contact management |

## Configuration

### Context-Dependent Weights

Weights shift based on detected context:

- **Work meeting**: Boost consequential, reduce social
- **Social event**: Boost social and emotional
- **One-on-one**: Boost relevance and social
- **Networking**: Boost novelty and consequential

### Decay Settings

```typescript
const config = {
  decayRatePerDay: 0.01,  // 1% per day
  decayFloor: 0.3,        // Never below 30%
};
```

## What We're NOT Doing

1. ❌ No nightly batch processing
2. ❌ No memory replay simulations
3. ❌ No graph-based relationship modeling
4. ❌ No multi-model ensemble
5. ❌ No continuous physiological monitoring

Simple. Observable. Cheap. Effective.
