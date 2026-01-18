/**
 * @file Tier Manager - Zipfian Cache Hierarchy for Predictive Memory System
 *
 * Manages memory storage across three tiers:
 * - Hot (Redis): Frequently accessed memories, < 1 hour TTL
 * - Warm (MongoDB): Standard storage, < 63 days TTL
 * - Cold (S3): Long-term archive
 *
 * Follows Zipfian distribution: a small percentage of memories
 * account for most of the access traffic.
 */

import type {
  PredictiveMemoryDocument,
  StorageTier,
  TierConfig,
  DEFAULT_TIER_CONFIG,
  ContextFrame,
  TemporalPattern,
  MemoryOpenLoop,
  NormalizedSalience,
} from './models.js';
import { collections } from './database.js';
import {
  storeHotMemory,
  getHotMemory,
  trackMemoryAccess,
  getAccessFrequency,
} from '../../config/redis.js';

// ============================================================================
// Types
// ============================================================================

interface S3Client {
  getObject(params: { Bucket: string; Key: string }): Promise<{ Body: { read(): Buffer } }>;
  putObject(params: { Bucket: string; Key: string; Body: string }): Promise<void>;
  deleteObject(params: { Bucket: string; Key: string }): Promise<void>;
}

interface WeaviateClient {
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
// Configuration
// ============================================================================

const DEFAULT_CONFIG: TierConfig = {
  hotThreshold: 10,         // accesses/hour for hot promotion
  warmThreshold: 1,         // accesses/day for warm retention
  hotTtl: 3600,             // 1 hour
  warmTtl: 5443200,         // 63 days (3×7×3)
  coldTtl: 31536000,        // 1 year
};

const S3_BUCKET = process.env.S3_COLD_BUCKET || 'memorable-cold';

// ============================================================================
// Tier Manager Class
// ============================================================================

/**
 * Manages memory storage across hot/warm/cold tiers.
 */
export class TierManager {
  private config: TierConfig;
  private s3: S3Client | null;
  private weaviate: WeaviateClient | null;

  constructor(
    config: TierConfig = DEFAULT_CONFIG,
    s3Client: S3Client | null = null,
    weaviateClient: WeaviateClient | null = null
  ) {
    this.config = config;
    this.s3 = s3Client;
    this.weaviate = weaviateClient;
  }

  /**
   * Get a memory by ID, checking tiers in order: hot → warm → cold.
   * Automatically promotes frequently accessed memories.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   * @returns Memory document or null if not found
   */
  async get(userId: string, memoryId: string): Promise<PredictiveMemoryDocument | null> {
    // Track access for frequency analysis
    await trackMemoryAccess(memoryId);

    // 1. Check hot tier (Redis)
    const hotData = await getHotMemory(userId, memoryId);
    if (hotData) {
      return this.decodeMemory(hotData);
    }

    // 2. Check warm tier (MongoDB)
    const predictiveMemories = collections.predictiveMemories();
    const doc = await predictiveMemories.findOne({ userId, memoryId });

    if (doc) {
      // Update last accessed
      await predictiveMemories.updateOne(
        { userId, memoryId },
        {
          $set: { lastAccessed: new Date() },
          $inc: { accessCount: 1 },
        }
      );

      // Check if should promote to hot
      await this.maybePromoteHot(doc);

      return doc;
    }

    // 3. Check cold tier (S3)
    if (this.s3) {
      try {
        const resp = await this.s3.getObject({
          Bucket: S3_BUCKET,
          Key: `${userId}/${memoryId}.json`,
        });
        const data = JSON.parse(resp.Body.read().toString());

        // Promote to warm tier
        await this.promoteWarm(data);

        return data;
      } catch {
        // Not found in cold storage
        return null;
      }
    }

    return null;
  }

  /**
   * Store a memory in the specified tier.
   *
   * @param memory - Memory document to store
   * @param tier - Target tier (default: warm)
   */
  async store(
    memory: PredictiveMemoryDocument,
    tier: StorageTier = 'warm'
  ): Promise<void> {
    const { userId, memoryId } = memory;

    // 1. Store in hot tier if requested
    if (tier === 'hot') {
      await storeHotMemory(userId, memoryId, this.encodeMemory(memory));
    }

    // 2. Always store in MongoDB (source of truth for warm tier)
    const predictiveMemories = collections.predictiveMemories();
    await predictiveMemories.updateOne(
      { userId, memoryId },
      {
        $set: {
          ...memory,
          tier,
          lastAccessed: new Date(),
        },
      },
      { upsert: true }
    );

    // 3. Store vector in Weaviate (unless cold tier or Tier3_Vault)
    if (tier !== 'cold' && memory.securityTier !== 'Tier3_Vault' && this.weaviate) {
      await this.storeVector(memory);
    }
  }

  /**
   * Delete a memory from all tiers.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   */
  async delete(userId: string, memoryId: string): Promise<void> {
    // Delete from MongoDB
    const predictiveMemories = collections.predictiveMemories();
    const doc = await predictiveMemories.findOne({ userId, memoryId });

    if (doc) {
      await predictiveMemories.deleteOne({ userId, memoryId });

      // Delete vector from Weaviate
      if (doc.vectorId && this.weaviate) {
        try {
          await this.weaviate.data.deleter()
            .withClassName('Memory')
            .withId(doc.vectorId)
            .do();
        } catch {
          // Ignore errors
        }
      }
    }

    // Delete from S3 (cold storage)
    if (this.s3) {
      try {
        await this.s3.deleteObject({
          Bucket: S3_BUCKET,
          Key: `${userId}/${memoryId}.json`,
        });
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Demote a memory to cold storage (S3).
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   */
  async demoteCold(userId: string, memoryId: string): Promise<void> {
    const predictiveMemories = collections.predictiveMemories();
    const doc = await predictiveMemories.findOne({ userId, memoryId });

    if (!doc || !this.s3) return;

    // Store in S3
    await this.s3.putObject({
      Bucket: S3_BUCKET,
      Key: `${userId}/${memoryId}.json`,
      Body: JSON.stringify(doc),
    });

    // Update tier and remove vector
    await predictiveMemories.updateOne(
      { userId, memoryId },
      {
        $set: { tier: 'cold' as StorageTier },
        $unset: { vectorId: '' },
      }
    );

    // Delete vector from Weaviate
    if (doc.vectorId && this.weaviate) {
      try {
        await this.weaviate.data.deleter()
          .withClassName('Memory')
          .withId(doc.vectorId)
          .do();
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Check and promote memory to hot tier if access frequency is high.
   */
  private async maybePromoteHot(memory: PredictiveMemoryDocument): Promise<void> {
    const freq = await getAccessFrequency(memory.memoryId);

    if (freq >= this.config.hotThreshold) {
      // Promote to hot tier
      await storeHotMemory(memory.userId, memory.memoryId, this.encodeMemory(memory));

      // Update tier in MongoDB
      const predictiveMemories = collections.predictiveMemories();
      await predictiveMemories.updateOne(
        { userId: memory.userId, memoryId: memory.memoryId },
        { $set: { tier: 'hot' as StorageTier } }
      );
    }
  }

  /**
   * Promote a memory from cold to warm tier.
   */
  private async promoteWarm(memory: PredictiveMemoryDocument): Promise<void> {
    const predictiveMemories = collections.predictiveMemories();

    // Store in MongoDB
    await predictiveMemories.updateOne(
      { userId: memory.userId, memoryId: memory.memoryId },
      {
        $set: {
          ...memory,
          tier: 'warm' as StorageTier,
          lastAccessed: new Date(),
        },
      },
      { upsert: true }
    );

    // Store vector in Weaviate
    if (memory.securityTier !== 'Tier3_Vault' && this.weaviate) {
      await this.storeVector(memory);
    }
  }

  /**
   * Store memory vector in Weaviate.
   */
  private async storeVector(memory: PredictiveMemoryDocument): Promise<void> {
    if (!this.weaviate) return;

    try {
      const result = await this.weaviate.data.creator()
        .withClassName('Memory')
        .withProperties({
          content: memory.content,
          userId: memory.userId,
          mongoId: memory.memoryId,
          importance: memory.importance || 0.5,
          tags: memory.tags || [],
          patternType: memory.temporal?.patternType,
          tier: memory.tier,
          createdAt: memory.createdAt,
          lastAccessed: memory.lastAccessed,
        })
        .do();

      // Store vector ID back in MongoDB
      if (result?.id) {
        const predictiveMemories = collections.predictiveMemories();
        await predictiveMemories.updateOne(
          { userId: memory.userId, memoryId: memory.memoryId },
          { $set: { vectorId: result.id } }
        );
      }
    } catch (error) {
      console.error('[TierManager] Failed to store vector:', error);
    }
  }

  /**
   * Encode memory for Redis storage.
   */
  private encodeMemory(memory: PredictiveMemoryDocument): Record<string, string> {
    const encoded: Record<string, string> = {};

    for (const [key, value] of Object.entries(memory)) {
      if (value !== undefined && value !== null) {
        encoded[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }

    return encoded;
  }

  /**
   * Decode memory from Redis storage.
   */
  private decodeMemory(data: Record<string, unknown>): PredictiveMemoryDocument {
    return {
      memoryId: String(data.memoryId || ''),
      userId: String(data.userId || ''),
      content: String(data.content || ''),
      summary: data.summary ? String(data.summary) : undefined,
      importance: Number(data.importance) || 0.5,
      salience: (typeof data.salience === 'object' ? data.salience : JSON.parse(String(data.salience || '{}'))) as NormalizedSalience,
      accessCount: Number(data.accessCount) || 0,
      createdAt: new Date(String(data.createdAt)),
      lastAccessed: new Date(String(data.lastAccessed)),
      tier: (data.tier as StorageTier) || 'warm',
      tags: Array.isArray(data.tags) ? data.tags : JSON.parse(String(data.tags || '[]')),
      vectorId: data.vectorId ? String(data.vectorId) : undefined,
      temporal: data.temporal ? (typeof data.temporal === 'object' ? data.temporal : JSON.parse(String(data.temporal))) as TemporalPattern : undefined,
      contextFrame: data.contextFrame ? (typeof data.contextFrame === 'object' ? data.contextFrame : JSON.parse(String(data.contextFrame))) as ContextFrame : undefined,
      openLoop: data.openLoop ? (typeof data.openLoop === 'object' ? data.openLoop : JSON.parse(String(data.openLoop))) as MemoryOpenLoop : undefined,
      securityTier: data.securityTier as PredictiveMemoryDocument['securityTier'],
      encrypted: data.encrypted === 'true' || data.encrypted === true,
      encryptionVersion: data.encryptionVersion ? String(data.encryptionVersion) : undefined,
    };
  }

  /**
   * Run tier maintenance: demote inactive memories to cold storage.
   * Should be run periodically (e.g., daily).
   *
   * @param userId - User identifier (optional, runs for all users if not specified)
   */
  async runMaintenance(userId?: string): Promise<{ demoted: number; errors: number }> {
    const predictiveMemories = collections.predictiveMemories();
    const warmCutoff = new Date(Date.now() - this.config.warmTtl * 1000);

    const filter: Record<string, unknown> = {
      tier: 'warm',
      lastAccessed: { $lt: warmCutoff },
    };

    if (userId) {
      filter.userId = userId;
    }

    const candidates = await predictiveMemories.find(filter).toArray();

    let demoted = 0;
    let errors = 0;

    for (const doc of candidates) {
      try {
        await this.demoteCold(doc.userId, doc.memoryId);
        demoted++;
      } catch {
        errors++;
      }
    }

    return { demoted, errors };
  }

  /**
   * Get tier statistics for a user.
   *
   * @param userId - User identifier
   */
  async getStats(userId: string): Promise<{
    hot: number;
    warm: number;
    cold: number;
    total: number;
    avgAccessCount: number;
  }> {
    const predictiveMemories = collections.predictiveMemories();

    const [hotCount, warmCount, coldCount, avgResult] = await Promise.all([
      predictiveMemories.countDocuments({ userId, tier: 'hot' }),
      predictiveMemories.countDocuments({ userId, tier: 'warm' }),
      predictiveMemories.countDocuments({ userId, tier: 'cold' }),
      predictiveMemories.aggregate([
        { $match: { userId } },
        { $group: { _id: null, avg: { $avg: '$accessCount' } } },
      ]).toArray(),
    ]);

    return {
      hot: hotCount,
      warm: warmCount,
      cold: coldCount,
      total: hotCount + warmCount + coldCount,
      avgAccessCount: avgResult[0]?.avg || 0,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let tierManagerInstance: TierManager | null = null;

/**
 * Get or create the tier manager singleton.
 */
export function getTierManager(
  config?: TierConfig,
  s3Client?: S3Client | null,
  weaviateClient?: WeaviateClient | null
): TierManager {
  if (!tierManagerInstance) {
    tierManagerInstance = new TierManager(config, s3Client, weaviateClient);
  }
  return tierManagerInstance;
}

/**
 * Initialize the tier manager with dependencies.
 */
export function initTierManager(
  config?: TierConfig,
  s3Client?: S3Client | null,
  weaviateClient?: WeaviateClient | null
): TierManager {
  tierManagerInstance = new TierManager(config, s3Client, weaviateClient);
  return tierManagerInstance;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new predictive memory document.
 */
export function createMemoryDocument(
  userId: string,
  memoryId: string,
  content: string,
  options: {
    summary?: string;
    importance?: number;
    salience?: NormalizedSalience;
    tags?: string[];
    contextFrame?: ContextFrame;
    openLoop?: MemoryOpenLoop;
    securityTier?: PredictiveMemoryDocument['securityTier'];
  } = {}
): PredictiveMemoryDocument {
  const now = new Date();

  return {
    memoryId,
    userId,
    content,
    summary: options.summary,
    importance: options.importance || 0.5,
    salience: options.salience || {
      emotional: 0.5,
      novelty: 0.5,
      relevance: 0.5,
      social: 0.5,
      consequential: 0.5,
    },
    accessCount: 0,
    createdAt: now,
    lastAccessed: now,
    tier: 'warm',
    tags: options.tags || [],
    contextFrame: options.contextFrame,
    openLoop: options.openLoop,
    securityTier: options.securityTier || 'Tier1_General',
  };
}
