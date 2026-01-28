# Temporal Decay Implementation

## What We Have

1. **salience_calculator.ts:353-369**
   - `calculateDecayModifier(daysSinceCapture)` - 1% per day, floor at 30%
   - `calculateRetrievalBoost(currentScore, retrievalCount)` - diminishing returns boost

2. **retrieval.ts:305-330**
   - `boostOnRetrieval()` - calls boost and updates MongoDB

3. **tier_manager.ts**
   - Hot/warm/cold tiers with TTLs
   - `runMaintenance()` for demotion

4. **redis.js**
   - `attention:4w` hash (who/what/when/where)
   - Hot memory TTLs (1 hour)
   - Context frames (30 min TTL)

## What We Need

### 1. Effective Salience (computed on access)

```
effective_salience = base_salience * decay_modifier * access_boost

Where:
- decay_modifier = max(0.3, 1.0 - (days_old * 0.01))
- access_boost = 1.0 + (access_count * 0.02), capped at 1.5
```

**DO NOT** update MongoDB on every access. Compute dynamically.

### 2. Attention Manager

The `:attention` key determines what gets surfaced. It's a Redis sorted set:

```
memorable:{userId}:attention → ZSET of memoryIds scored by effective_salience
```

Memories enter attention when:
- New memory stored (salience > threshold)
- Memory accessed (gets boost)
- Context changes (relevance recalculated)

Memories leave attention when:
- effective_salience drops below threshold
- TTL expires (natural fade)
- Explicitly suppressed

### 3. Attention Threshold

```
ATTENTION_THRESHOLD = 40  // Out of 100
```

- High-salience memories (70+) stay in attention longer
- Medium-salience (40-70) fade faster
- Low-salience (<40) may never enter attention

### 4. Implementation

#### New File: `src/services/salience_service/temporal_decay.ts`

```typescript
/**
 * Compute effective salience at query time.
 * Does NOT update database - pure computation.
 */
export function computeEffectiveSalience(
  baseSalience: number,
  createdAt: Date,
  accessCount: number
): number {
  const daysOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Decay: 1% per day, floor at 30%
  const decayModifier = Math.max(0.3, 1.0 - (daysOld * 0.01));

  // Access boost: +2% per access, capped at 50% bonus
  const accessBoost = Math.min(1.5, 1.0 + (accessCount * 0.02));

  return baseSalience * decayModifier * accessBoost;
}
```

#### New File: `src/services/salience_service/attention_manager.ts`

```typescript
/**
 * Manages the attention window - what's surfaced NOW.
 */
export class AttentionManager {
  private redis: RedisClient;

  /**
   * Add memory to attention window.
   * Called on: new memory, memory access, context change.
   */
  async addToAttention(userId: string, memoryId: string, effectiveSalience: number): Promise<void>;

  /**
   * Get current attention window.
   * Returns memoryIds sorted by effective salience.
   */
  async getAttention(userId: string, limit?: number): Promise<string[]>;

  /**
   * Prune memories that have faded below threshold.
   * Called periodically or on getAttention.
   */
  async pruneAttention(userId: string): Promise<number>;

  /**
   * Refresh attention based on context change.
   * Recalculates relevance for all memories in attention.
   */
  async refreshForContext(userId: string, context: ContextFrame): Promise<void>;
}
```

#### Redis Key Updates

```javascript
// Add to redis.js

const ATTENTION_TTL = 86400;  // 24 hours - daily refresh

export async function addToAttention(userId, memoryId, score) {
  const key = `memorable:${userId}:attention`;
  await client.zAdd(key, { score, value: memoryId });
  await client.expire(key, ATTENTION_TTL);
}

export async function getAttention(userId, limit = 10) {
  const key = `memorable:${userId}:attention`;
  return await client.zRevRange(key, 0, limit - 1);
}

export async function pruneAttention(userId, threshold = 40) {
  const key = `memorable:${userId}:attention`;
  return await client.zRemRangeByScore(key, 0, threshold);
}
```

### 5. Integration Points

1. **On memory store** (`memory_operations.ts`):
   - Calculate initial salience
   - If > threshold, add to attention

2. **On memory retrieve** (`retrieval.ts`):
   - Compute effective salience
   - Update attention score
   - Boost via `boostOnRetrieval`

3. **On context change** (`context_frame.ts`):
   - Trigger attention refresh
   - Recalculate relevance component for attention window

4. **On session start** (hook):
   - Prune attention
   - Surface top N from attention

### 6. No Cron Jobs

Per "Real-Time Relevance Engine" architecture note:
- All processing happens at ingest/access time
- No batch jobs
- Decay computed dynamically, not applied via cron

### 7. Testing

```bash
npx jest tests/services/salience_service/temporal_decay.test.ts
npx jest tests/services/salience_service/attention_manager.test.ts
```

## Flow

```
Memory Created
    │
    ▼
computeSalience() → baseSalience
    │
    ▼
baseSalience > THRESHOLD? ──No──► Not in attention
    │
   Yes
    │
    ▼
addToAttention(userId, memoryId, baseSalience)
    │
    ▼
Memory in Attention
    │
    │  Time passes...
    │
    ▼
Memory Accessed
    │
    ▼
computeEffectiveSalience() → decayed + boosted
    │
    ▼
updateAttentionScore(userId, memoryId, effectiveSalience)
    │
    ▼
effectiveSalience < THRESHOLD? ──No──► Still in attention
    │
   Yes
    │
    ▼
Remove from attention (memory still in storage)
```

## The Point

Memories fade from ATTENTION, not from STORAGE.

- Storage is permanent (MongoDB/S3)
- Attention is temporary (Redis)
- What's in attention is what gets surfaced
- Everything else exists but doesn't consume context
