/**
 * Zipfian Cache Hierarchy (Hot/Warm/Cold)
 *
 * Zipfian (power-law) distribution means ~20% of memories serve ~80% of requests.
 * Design tiers accordingly:
 *
 * | Tier   | Storage  | Latency | TTL Base | Promotion Threshold  |
 * |--------|----------|---------|----------|----------------------|
 * | Hot    | Redis    | <1ms    | 1 hour   | >10 accesses/hour    |
 * | Warm   | MongoDB  | ~5ms    | 7 days   | >1 access/day        |
 * | Cold   | S3       | ~100ms  | 1 year   | Archive after 7 days |
 */

import type {
  TierConfig,
  TieredMemory,
  CacheTier,
  TierPromotionEvent,
} from './types';
import { DEFAULT_TIER_CONFIG } from './types';

// ============================================================================
// Interface Definitions (for dependency injection)
// ============================================================================

export interface RedisClient {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, mapping: Record<string, string>): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  scan(cursor: string, options: { MATCH: string; COUNT: number }): Promise<{ cursor: string; keys: string[] }>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  zcount(key: string, min: number, max: number): Promise<number>;
  pipeline(): {
    hset(key: string, mapping: Record<string, string>): void;
    expire(key: string, seconds: number): void;
    exec(): Promise<Array<[Error | null, unknown]>>;
  };
}

export interface MongoCollection<T> {
  findOne(filter: Record<string, unknown>): Promise<T | null>;
  find(filter: Record<string, unknown>): {
    toArray(): Promise<T[]>;
  };
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { upsert?: boolean }
  ): Promise<{ modifiedCount: number; upsertedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

export interface S3Client {
  getObject(params: { Bucket: string; Key: string }): Promise<{
    Body: { transformToString(): Promise<string> };
  }>;
  putObject(params: { Bucket: string; Key: string; Body: string }): Promise<void>;
  deleteObject(params: { Bucket: string; Key: string }): Promise<void>;
}

export interface WeaviateClient {
  data: {
    creator(): {
      withClassName(name: string): {
        withProperties(props: Record<string, unknown>): {
          do(): Promise<{ id: string }>;
        };
      };
    };
    deleter(): {
      withClassName(name: string): {
        withId(id: string): {
          do(): Promise<void>;
        };
      };
    };
  };
}

// ============================================================================
// Frequency Tracker (Sliding Window)
// ============================================================================

/**
 * Sliding window frequency counter using Redis Sorted Sets
 */
export class FrequencyTracker {
  private redis: RedisClient;
  private windowSeconds: number;

  constructor(redisClient: RedisClient, windowSeconds: number = 3600) {
    this.redis = redisClient;
    this.windowSeconds = windowSeconds;
  }

  /**
   * Track an access event
   */
  async track(memoryId: string): Promise<void> {
    const now = Date.now() / 1000;
    const key = `freq:${memoryId}`;

    await this.redis.zadd(key, now, now.toString());
    await this.redis.zremrangebyscore(key, 0, now - this.windowSeconds);
  }

  /**
   * Get frequency (accesses in window)
   */
  async getFrequency(memoryId: string): Promise<number> {
    const now = Date.now() / 1000;
    const key = `freq:${memoryId}`;
    return await this.redis.zcount(key, now - this.windowSeconds, now);
  }
}

// ============================================================================
// Zipfian Tier Manager
// ============================================================================

/**
 * Hot/Warm/Cold memory tier management following Zipfian distribution
 */
export class ZipfianTierManager {
  private redis: RedisClient;
  private mongo: MongoCollection<TieredMemory>;
  private s3: S3Client;
  private weaviate?: WeaviateClient;
  private config: TierConfig;
  private freqTracker: FrequencyTracker;
  private coldBucket: string;

  constructor(
    redisClient: RedisClient,
    mongoCollection: MongoCollection<TieredMemory>,
    s3Client: S3Client,
    config: Partial<TierConfig> = {},
    weaviateClient?: WeaviateClient,
    coldBucket: string = 'memorable-cold'
  ) {
    this.redis = redisClient;
    this.mongo = mongoCollection;
    this.s3 = s3Client;
    this.weaviate = weaviateClient;
    this.config = { ...DEFAULT_TIER_CONFIG, ...config };
    this.freqTracker = new FrequencyTracker(redisClient);
    this.coldBucket = coldBucket;
  }

  /**
   * Retrieve memory with automatic tier promotion
   * Tries Hot → Warm → Cold, promotes on access
   */
  async getMemory(userId: string, memoryId: string): Promise<TieredMemory | null> {
    const key = `memory:${userId}:${memoryId}`;

    // Try hot tier (Redis)
    const hotData = await this.redis.hgetall(key);
    if (hotData && Object.keys(hotData).length > 0) {
      await this.freqTracker.track(memoryId);
      return this.decodeMemory(hotData);
    }

    // Try warm tier (MongoDB)
    const warmDoc = await this.mongo.findOne({
      userId,
      memoryId,
    });

    if (warmDoc) {
      await this.freqTracker.track(memoryId);
      await this.maybePromoteToHot(warmDoc);
      return warmDoc;
    }

    // Try cold tier (S3)
    try {
      const response = await this.s3.getObject({
        Bucket: this.coldBucket,
        Key: `${userId}/${memoryId}.json`,
      });

      const bodyString = await response.Body.transformToString();
      const data = JSON.parse(bodyString) as TieredMemory;

      await this.freqTracker.track(memoryId);
      await this.promoteToWarm(data);
      return data;
    } catch {
      // Not found in any tier
      return null;
    }
  }

  /**
   * Store memory in specified tier with cross-store sync
   */
  async storeMemory(
    memory: TieredMemory,
    tier: CacheTier = 'warm'
  ): Promise<void> {
    const { userId, memoryId } = memory;

    if (tier === 'hot') {
      // Store in Redis
      const key = `memory:${userId}:${memoryId}`;
      await this.redis.hset(key, this.encodeMemory(memory));
      await this.redis.expire(key, this.config.hotTtl);
    }

    // Always store in MongoDB (source of truth)
    await this.mongo.updateOne(
      { userId, memoryId },
      {
        $set: { ...memory, tier },
        $inc: { accessCount: 0 }, // Initialize if new
      },
      { upsert: true }
    );

    // Store vector in Weaviate if available
    if (this.weaviate) {
      await this.storeVector(memory);
    }

    if (tier === 'cold') {
      // Also store in S3 for durability
      await this.s3.putObject({
        Bucket: this.coldBucket,
        Key: `${userId}/${memoryId}.json`,
        Body: JSON.stringify(memory),
      });
    }
  }

  /**
   * Promote memory to hot tier if access frequency exceeds threshold
   */
  private async maybePromoteToHot(memory: TieredMemory): Promise<void> {
    const freq = await this.freqTracker.getFrequency(memory.memoryId);

    if (freq >= this.config.hotThreshold) {
      const key = `memory:${memory.userId}:${memory.memoryId}`;
      await this.redis.hset(key, this.encodeMemory(memory));
      await this.redis.expire(key, this.config.hotTtl);

      // Update tier in MongoDB
      await this.mongo.updateOne(
        { memoryId: memory.memoryId },
        { $set: { tier: 'hot' as CacheTier, lastAccessed: new Date() } }
      );

      await this.logPromotion(memory.memoryId, 'warm', 'hot', 'access_frequency');
    }
  }

  /**
   * Promote from cold to warm tier
   */
  private async promoteToWarm(memory: TieredMemory): Promise<void> {
    memory.tier = 'warm';
    memory.lastAccessed = new Date();

    await this.mongo.updateOne(
      { userId: memory.userId, memoryId: memory.memoryId },
      { $set: memory },
      { upsert: true }
    );

    await this.logPromotion(memory.memoryId, 'cold', 'warm', 'access_frequency');
  }

  /**
   * Demote stale memories (periodic job)
   */
  async demoteStaleMemories(): Promise<{ demotedToWarm: number; demotedToCold: number }> {
    const now = Date.now() / 1000;
    let demotedToWarm = 0;
    let demotedToCold = 0;

    // Demote hot → warm (not accessed in hotTtl)
    let cursor = '0';
    do {
      const result = await this.redis.scan(cursor, {
        MATCH: 'memory:*',
        COUNT: 100,
      });
      cursor = result.cursor;

      for (const key of result.keys) {
        const data = await this.redis.hgetall(key);
        if (data && data.lastAccessed) {
          const lastAccess = parseFloat(data.lastAccessed);
          if (now - lastAccess > this.config.hotTtl) {
            await this.redis.del(key);
            demotedToWarm++;
          }
        }
      }
    } while (cursor !== '0');

    // Demote warm → cold (not accessed in warmTtl)
    const staleMemories = await this.mongo.find({
      tier: 'warm',
      lastAccessed: {
        $lt: new Date((now - this.config.warmTtl) * 1000),
      },
    }).toArray();

    for (const doc of staleMemories) {
      // Archive to S3
      await this.s3.putObject({
        Bucket: this.coldBucket,
        Key: `${doc.userId}/${doc.memoryId}.json`,
        Body: JSON.stringify(doc),
      });

      // Update tier
      await this.mongo.updateOne(
        { memoryId: doc.memoryId },
        { $set: { tier: 'cold' as CacheTier } }
      );

      demotedToCold++;
    }

    return { demotedToWarm, demotedToCold };
  }

  /**
   * Prefetch memories to hot tier (for anticipated access)
   */
  async prefetchToHot(memories: TieredMemory[]): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const memory of memories) {
      const key = `memory:${memory.userId}:${memory.memoryId}`;
      pipeline.hset(key, this.encodeMemory(memory));
      pipeline.expire(key, this.config.hotTtl);
    }

    await pipeline.exec();

    // Log prefetch promotions
    for (const memory of memories) {
      await this.logPromotion(memory.memoryId, memory.tier, 'hot', 'prefetch');
    }
  }

  /**
   * Get tier statistics
   */
  async getTierStats(userId: string): Promise<{
    hot: number;
    warm: number;
    cold: number;
    promotions: TierPromotionEvent[];
  }> {
    // Count in each tier
    const warmDocs = await this.mongo.find({
      userId,
      tier: { $in: ['warm', 'hot'] },
    }).toArray();

    const hot = warmDocs.filter((d) => d.tier === 'hot').length;
    const warm = warmDocs.filter((d) => d.tier === 'warm').length;
    const cold = warmDocs.filter((d) => d.tier === 'cold').length;

    return {
      hot,
      warm,
      cold,
      promotions: [], // Would need separate collection for promotion history
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private encodeMemory(memory: TieredMemory): Record<string, string> {
    return {
      memoryId: memory.memoryId,
      userId: memory.userId,
      content: memory.content,
      summary: memory.summary || '',
      importance: memory.importance.toString(),
      accessCount: memory.accessCount.toString(),
      createdAt: memory.createdAt.toISOString(),
      lastAccessed: memory.lastAccessed.toISOString(),
      tier: memory.tier,
      tags: JSON.stringify(memory.tags),
      vectorRef: memory.vectorRef || '',
      temporalMetadata: memory.temporalMetadata
        ? JSON.stringify(memory.temporalMetadata)
        : '',
    };
  }

  private decodeMemory(data: Record<string, string>): TieredMemory {
    return {
      memoryId: data.memoryId,
      userId: data.userId,
      content: data.content,
      summary: data.summary || undefined,
      importance: parseFloat(data.importance),
      accessCount: parseInt(data.accessCount, 10),
      createdAt: new Date(data.createdAt),
      lastAccessed: new Date(data.lastAccessed),
      tier: data.tier as CacheTier,
      tags: data.tags ? JSON.parse(data.tags) : [],
      vectorRef: data.vectorRef || undefined,
      temporalMetadata: data.temporalMetadata
        ? JSON.parse(data.temporalMetadata)
        : undefined,
    };
  }

  private async storeVector(memory: TieredMemory): Promise<void> {
    if (!this.weaviate) return;

    try {
      await this.weaviate.data
        .creator()
        .withClassName('Memory')
        .withProperties({
          memoryId: memory.memoryId,
          userId: memory.userId,
          content: memory.content,
          importance: memory.importance,
        })
        .do();
    } catch {
      // Vector storage failure shouldn't block memory storage
      console.error('Failed to store vector in Weaviate');
    }
  }

  private async logPromotion(
    memoryId: string,
    fromTier: CacheTier,
    toTier: CacheTier,
    reason: TierPromotionEvent['reason']
  ): Promise<void> {
    // In production, would store to promotion_events collection
    console.log(`[TierManager] Promoted ${memoryId}: ${fromTier} → ${toTier} (${reason})`);
  }
}

// ============================================================================
// MongoDB Schema (for reference)
// ============================================================================

/**
 * MongoDB Indexes for efficient tier management:
 *
 * db.memories.createIndex({ "userId": 1, "lastAccessed": -1 })
 * db.memories.createIndex({ "userId": 1, "tier": 1, "importance": -1 })
 * db.memories.createIndex({ "userId": 1, "tags": 1 })
 * db.memories.createIndex(
 *   { "lastAccessed": 1 },
 *   { expireAfterSeconds: 7776000, partialFilterExpression: { "tier": "warm" } }
 * )
 */
export const MONGODB_INDEXES = [
  { fields: { userId: 1, lastAccessed: -1 } },
  { fields: { userId: 1, tier: 1, importance: -1 } },
  { fields: { userId: 1, tags: 1 } },
  {
    fields: { lastAccessed: 1 },
    options: {
      expireAfterSeconds: 7776000, // 90 days
      partialFilterExpression: { tier: 'warm' },
    },
  },
];
