/**
 * @file Attention Manager
 *
 * What matters RIGHT NOW.
 *
 * The attention window is what differentiates MemoRable from Mem0.
 * Mem0: "Here's everything that matches"
 * MemoRable: "Here's what you NEED at this moment"
 *
 * Attention is a Redis sorted set. Memories enter/exit based on:
 * - Salience (with decay)
 * - Context relevance
 * - Access patterns
 * - Time
 */

import type { ContextFrame } from './models.js';
import {
  computeEffectiveSalienceFromMemory,
  computeContextRelevance,
  applyContextRelevance,
  shouldBeInAttention,
  ATTENTION_THRESHOLD,
} from './temporal_decay.js';

// ============================================================================
// Types
// ============================================================================

export interface AttentionEntry {
  memoryId: string;
  effectiveSalience: number;
  lastUpdated: number;
}

export interface AttentionWindow {
  entries: AttentionEntry[];
  threshold: number;
  updatedAt: Date;
}

export interface AttentionStats {
  totalInAttention: number;
  highSalience: number;
  fadingSoon: number;
  recentlyAdded: number;
  threshold: number;
}

// Redis client type (we don't want to import the full redis module here)
interface RedisClient {
  zAdd(key: string, members: { score: number; value: string }[]): Promise<number>;
  zRevRange(key: string, start: number, stop: number): Promise<string[]>;
  zRevRangeWithScores(key: string, start: number, stop: number): Promise<{ value: string; score: number }[]>;
  zRem(key: string, member: string): Promise<number>;
  zRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number>;
  zCard(key: string): Promise<number>;
  zScore(key: string, member: string): Promise<number | null>;
  zCount(key: string, min: number | string, max: number | string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
}

// ============================================================================
// Constants
// ============================================================================

/** Attention window TTL: 24 hours (forces daily refresh) */
const ATTENTION_TTL = 86400;

/** Maximum memories in attention window */
const MAX_ATTENTION_SIZE = 100;

/** "Fading soon" threshold: 10 points above attention threshold */
const FADING_SOON_THRESHOLD = ATTENTION_THRESHOLD + 10;

/** "Recently added" window: last hour */
const RECENTLY_ADDED_MS = 60 * 60 * 1000;

// ============================================================================
// Attention Manager Class
// ============================================================================

/**
 * Manages the attention window for a user.
 * Attention determines what gets surfaced - not everything, just what matters NOW.
 */
export class AttentionManager {
  private redis: RedisClient;
  private keyPrefix: string;

  constructor(redisClient: RedisClient, keyPrefix: string = 'memorable') {
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Get Redis key for user's attention window.
   */
  private getKey(userId: string): string {
    return `${this.keyPrefix}:${userId}:attention`;
  }

  /**
   * Add memory to attention window.
   * Called when: new memory created, memory accessed, context changed.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   * @param effectiveSalience - Current effective salience
   */
  async addToAttention(
    userId: string,
    memoryId: string,
    effectiveSalience: number
  ): Promise<boolean> {
    if (!shouldBeInAttention(effectiveSalience)) {
      return false;
    }

    const key = this.getKey(userId);

    await this.redis.zAdd(key, [{ score: effectiveSalience, value: memoryId }]);
    await this.redis.expire(key, ATTENTION_TTL);

    // Trim to max size (keep highest salience)
    const size = await this.redis.zCard(key);
    if (size > MAX_ATTENTION_SIZE) {
      // Remove lowest scoring entries
      await this.redis.zRemRangeByScore(key, '-inf', ATTENTION_THRESHOLD);
    }

    return true;
  }

  /**
   * Remove memory from attention window.
   * Called when: memory suppressed, explicitly forgotten, or faded.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   */
  async removeFromAttention(userId: string, memoryId: string): Promise<void> {
    const key = this.getKey(userId);
    await this.redis.zRem(key, memoryId);
  }

  /**
   * Update salience score for memory in attention.
   * Called when: memory accessed (boost) or context changes (relevance).
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   * @param newSalience - Updated effective salience
   */
  async updateScore(
    userId: string,
    memoryId: string,
    newSalience: number
  ): Promise<void> {
    const key = this.getKey(userId);

    if (shouldBeInAttention(newSalience)) {
      // Update score
      await this.redis.zAdd(key, [{ score: newSalience, value: memoryId }]);
    } else {
      // Remove - faded below threshold
      await this.redis.zRem(key, memoryId);
    }
  }

  /**
   * Get current attention window.
   * Returns memoryIds sorted by effective salience (highest first).
   *
   * @param userId - User identifier
   * @param limit - Maximum number to return
   * @returns Array of memory IDs
   */
  async getAttention(userId: string, limit: number = 10): Promise<string[]> {
    const key = this.getKey(userId);
    return this.redis.zRevRange(key, 0, limit - 1);
  }

  /**
   * Get attention window with scores.
   *
   * @param userId - User identifier
   * @param limit - Maximum number to return
   * @returns Array of { memoryId, effectiveSalience }
   */
  async getAttentionWithScores(
    userId: string,
    limit: number = 10
  ): Promise<AttentionEntry[]> {
    const key = this.getKey(userId);
    const results = await this.redis.zRevRangeWithScores(key, 0, limit - 1);

    return results.map(r => ({
      memoryId: r.value,
      effectiveSalience: r.score,
      lastUpdated: Date.now(), // Redis doesn't track this; we could add metadata
    }));
  }

  /**
   * Prune memories that have faded below threshold.
   * Called periodically or on getAttention.
   *
   * @param userId - User identifier
   * @returns Number of memories pruned
   */
  async pruneAttention(userId: string): Promise<number> {
    const key = this.getKey(userId);
    return this.redis.zRemRangeByScore(key, '-inf', ATTENTION_THRESHOLD);
  }

  /**
   * Clear entire attention window.
   * Called on: user request, major context shift.
   *
   * @param userId - User identifier
   */
  async clearAttention(userId: string): Promise<void> {
    const key = this.getKey(userId);
    await this.redis.del(key);
  }

  /**
   * Get attention statistics.
   *
   * @param userId - User identifier
   */
  async getStats(userId: string): Promise<AttentionStats> {
    const key = this.getKey(userId);

    const [total, highSalience, fadingSoon] = await Promise.all([
      this.redis.zCard(key),
      this.redis.zCount(key, 70, '+inf'),
      this.redis.zCount(key, ATTENTION_THRESHOLD, FADING_SOON_THRESHOLD),
    ]);

    return {
      totalInAttention: total,
      highSalience,
      fadingSoon,
      recentlyAdded: 0, // Would need timestamp tracking
      threshold: ATTENTION_THRESHOLD,
    };
  }

  /**
   * Check if memory is in attention window.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   */
  async isInAttention(userId: string, memoryId: string): Promise<boolean> {
    const key = this.getKey(userId);
    const score = await this.redis.zScore(key, memoryId);
    return score !== null;
  }

  /**
   * Refresh attention window based on context change.
   * Recalculates relevance for all memories in attention.
   *
   * @param userId - User identifier
   * @param context - New context frame
   * @param memories - Memories to evaluate for attention
   */
  async refreshForContext(
    userId: string,
    context: ContextFrame,
    memories: Array<{
      memoryId: string;
      salienceScore?: number;
      salience?: { score?: number };
      createdAt?: Date | string;
      accessCount?: number;
      topics?: string[];
      peopleMentioned?: string[];
    }>
  ): Promise<{ added: number; removed: number; updated: number }> {
    const key = this.getKey(userId);
    let added = 0;
    let removed = 0;
    let updated = 0;

    const contextTopics = context.activity ? [context.activity] : [];
    if (context.project) contextTopics.push(context.project);

    for (const memory of memories) {
      const baseEffective = computeEffectiveSalienceFromMemory(memory);

      // Apply context relevance
      const relevance = computeContextRelevance(
        memory.topics || [],
        memory.peopleMentioned || [],
        contextTopics,
        context.people || []
      );

      const effectiveSalience = applyContextRelevance(baseEffective, relevance);

      const wasInAttention = await this.isInAttention(userId, memory.memoryId);
      const shouldBe = shouldBeInAttention(effectiveSalience);

      if (shouldBe && !wasInAttention) {
        await this.addToAttention(userId, memory.memoryId, effectiveSalience);
        added++;
      } else if (!shouldBe && wasInAttention) {
        await this.removeFromAttention(userId, memory.memoryId);
        removed++;
      } else if (shouldBe && wasInAttention) {
        await this.updateScore(userId, memory.memoryId, effectiveSalience);
        updated++;
      }
    }

    await this.redis.expire(key, ATTENTION_TTL);

    return { added, removed, updated };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let instance: AttentionManager | null = null;

/**
 * Get or create the attention manager singleton.
 *
 * @param redisClient - Redis client (required on first call)
 */
export function getAttentionManager(redisClient?: RedisClient): AttentionManager {
  if (!instance && !redisClient) {
    throw new Error('AttentionManager not initialized. Provide Redis client.');
  }

  if (!instance && redisClient) {
    instance = new AttentionManager(redisClient);
  }

  return instance!;
}

/**
 * Initialize attention manager with Redis client.
 */
export function initAttentionManager(redisClient: RedisClient): AttentionManager {
  instance = new AttentionManager(redisClient);
  return instance;
}
