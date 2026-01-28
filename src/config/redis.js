import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

let client = null;

export async function setupRedis() {
  try {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    // Check if TLS is required (rediss:// or explicit env var)
    const useTls = url.startsWith('rediss://') || process.env.REDIS_TLS === 'true';

    client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          const maxRetryTime = 3000; // 3 seconds
          const retryTime = Math.min(retries * 100, maxRetryTime);
          logger.info(`Retrying Redis connection in ${retryTime}ms (attempt ${retries + 1})`);
          return retryTime;
        },
        connectTimeout: 10000, // 10 seconds
        keepAlive: 5000, // 5 seconds
        ...(useTls ? { tls: true, rejectUnauthorized: false } : {}), // AWS ElastiCache TLS
      },
      database: 0,
      commandsQueueMaxLength: 100000,
      readonly: false,
      legacyMode: false,
      isolationPoolOptions: {
        min: 5,
        max: 20,
        acquireTimeoutMillis: 5000,
        createTimeoutMillis: 5000,
        idleTimeoutMillis: 5000,
        createRetryIntervalMillis: 200,
      }
    });

    // Event handlers
    client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    client.on('ready', () => {
      logger.info('Redis client connected and ready');
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    client.on('end', () => {
      logger.info('Redis client connection closed');
    });

    // Connect to Redis
    await client.connect();

    // Test connection
    await testConnection();

    // Initialize data structures
    await initializeDataStructures();

    return client;
  } catch (error) {
    logger.error('Failed to setup Redis:', error);
    throw error;
  }
}

async function testConnection() {
  try {
    await client.ping();
    logger.info('Redis connection test successful');
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    throw error;
  }
}

async function initializeDataStructures() {
  try {
    // Initialize emotional state hash if it doesn't exist
    const emotionalStateExists = await client.exists('emotional_state');
    if (!emotionalStateExists) {
      await client.hSet('emotional_state', {
        emotion: 'neutral',
        vector: '[]',
        confidence: '1.0',
        timestamp: Date.now().toString(),
        type: 'system'
      });
    }

    // Initialize memory windows
    const windows = ['short_term', 'medium_term', 'long_term'];
    for (const window of windows) {
      const key = `memory:window:${window}`;
      const exists = await client.exists(key);
      if (!exists) {
        await client.zAdd(key, {
          score: Date.now(),
          value: JSON.stringify({
            type: 'system',
            content: 'initialized',
            timestamp: Date.now()
          })
        });
      }
    }

    // Initialize attention system structures
    const attentionExists = await client.exists('attention:4w');
    if (!attentionExists) {
      await client.hSet('attention:4w', {
        who: '[]',
        what: '[]',
        when: '[]',
        where: '[]'
      });
    }

    logger.info('Redis data structures initialized');
  } catch (error) {
    logger.error('Failed to initialize Redis data structures:', error);
    throw error;
  }
}

// ============================================================================
// PREDICTIVE MEMORY SYSTEM - HOT TIER CACHE OPERATIONS
// ============================================================================

/**
 * Redis key patterns for predictive memory system:
 * - memory:{user_id}:{memory_id} -> Hot memory hash (TTL: 1 hour)
 * - freq:{memory_id} -> Access frequency sorted set (TTL: 2 hours)
 * - engram:{ngram_size}gram:h{head}:{hash} -> Pattern hashes (TTL: 24 hours)
 * - context:{user_id} -> User context frame hash (TTL: 30 minutes)
 * - anticipated:{user_id} -> Anticipated memory list (TTL: 15 minutes)
 */

const HOT_MEMORY_TTL = 3600;      // 1 hour
const FREQUENCY_TTL = 7200;       // 2 hours
const PATTERN_HASH_TTL = 86400;   // 24 hours
const CONTEXT_TTL = 1800;         // 30 minutes
const ANTICIPATED_TTL = 900;      // 15 minutes
const ATTENTION_TTL = 86400;      // 24 hours - daily refresh
const ATTENTION_THRESHOLD = 40;   // Minimum salience for attention

/**
 * Store a memory in hot tier cache.
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 * @param {object} memory - Memory data to cache
 */
export async function storeHotMemory(userId, memoryId, memory) {
  if (!client) throw new Error('Redis not initialized');
  const key = `memory:${userId}:${memoryId}`;
  const data = {};
  for (const [k, v] of Object.entries(memory)) {
    data[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  await client.hSet(key, data);
  await client.expire(key, HOT_MEMORY_TTL);
}

/**
 * Get a memory from hot tier cache.
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 * @returns {object|null} Memory data or null if not cached
 */
export async function getHotMemory(userId, memoryId) {
  if (!client) return null;
  const key = `memory:${userId}:${memoryId}`;
  const data = await client.hGetAll(key);
  if (!data || Object.keys(data).length === 0) return null;

  // Decode JSON fields
  const decoded = {};
  for (const [k, v] of Object.entries(data)) {
    try {
      decoded[k] = JSON.parse(v);
    } catch {
      decoded[k] = v;
    }
  }
  return decoded;
}

/**
 * Track memory access for frequency analysis.
 * @param {string} memoryId - Memory identifier
 */
export async function trackMemoryAccess(memoryId) {
  if (!client) return;
  const now = Date.now();
  const key = `freq:${memoryId}`;
  await client.zAdd(key, { score: now, value: String(now) });
  // Remove old entries (older than 1 hour)
  await client.zRemRangeByScore(key, 0, now - 3600000);
  await client.expire(key, FREQUENCY_TTL);
}

/**
 * Get memory access frequency (accesses per hour).
 * @param {string} memoryId - Memory identifier
 * @returns {number} Access count in the last hour
 */
export async function getAccessFrequency(memoryId) {
  if (!client) return 0;
  const now = Date.now();
  const key = `freq:${memoryId}`;
  return await client.zCount(key, now - 3600000, now);
}

/**
 * Store user context frame.
 * @param {string} userId - User identifier
 * @param {object} context - Context frame (location, activity, project, people)
 */
export async function storeContextFrame(userId, context) {
  if (!client) return;
  const key = `context:${userId}`;
  const data = {
    location: context.location || '',
    activity: context.activity || '',
    project: context.project || '',
    people: JSON.stringify(context.people || []),
    updatedAt: Date.now().toString()
  };
  await client.hSet(key, data);
  await client.expire(key, CONTEXT_TTL);
}

/**
 * Get user context frame.
 * @param {string} userId - User identifier
 * @returns {object|null} Context frame or null
 */
export async function getContextFrame(userId) {
  if (!client) return null;
  const key = `context:${userId}`;
  const data = await client.hGetAll(key);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    location: data.location || undefined,
    activity: data.activity || undefined,
    project: data.project || undefined,
    people: data.people ? JSON.parse(data.people) : undefined,
    updatedAt: data.updatedAt ? parseInt(data.updatedAt) : undefined
  };
}

/**
 * Store anticipated memories list.
 * @param {string} userId - User identifier
 * @param {string[]} memoryIds - List of anticipated memory IDs
 */
export async function storeAnticipatedMemories(userId, memoryIds) {
  if (!client) return;
  const key = `anticipated:${userId}`;
  const pipeline = client.multi();
  pipeline.del(key);
  for (const id of memoryIds) {
    pipeline.rPush(key, id);
  }
  pipeline.expire(key, ANTICIPATED_TTL);
  await pipeline.exec();
}

/**
 * Get anticipated memories list.
 * @param {string} userId - User identifier
 * @returns {string[]} List of anticipated memory IDs
 */
export async function getAnticipatedMemories(userId) {
  if (!client) return [];
  const key = `anticipated:${userId}`;
  return await client.lRange(key, 0, -1);
}

/**
 * Store pattern hash (engram-style).
 * @param {number} ngramSize - N-gram size
 * @param {number} head - Head index (0-7 for K=8)
 * @param {string} hash - Pattern hash
 * @param {Buffer} embedding - Embedding bytes
 */
export async function storePatternHash(ngramSize, head, hash, embedding) {
  if (!client) return;
  const key = `engram:${ngramSize}gram:h${head}:${hash}`;
  await client.set(key, embedding.toString('base64'));
  await client.expire(key, PATTERN_HASH_TTL);
}

/**
 * Get pattern hash (engram-style).
 * @param {number} ngramSize - N-gram size
 * @param {number} head - Head index
 * @param {string} hash - Pattern hash
 * @returns {Buffer|null} Embedding bytes or null
 */
export async function getPatternHash(ngramSize, head, hash) {
  if (!client) return null;
  const key = `engram:${ngramSize}gram:h${head}:${hash}`;
  const data = await client.get(key);
  if (!data) return null;
  return Buffer.from(data, 'base64');
}

export function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call setupRedis first.');
  }
  return client;
}

// ============================================================================
// ATTENTION WINDOW OPERATIONS
// The killer feature - what matters RIGHT NOW
// ============================================================================

/**
 * Add memory to attention window (sorted set by salience).
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 * @param {number} score - Effective salience score
 */
export async function addToAttention(userId, memoryId, score) {
  if (!client) return false;
  if (score < ATTENTION_THRESHOLD) return false;

  const key = `memorable:${userId}:attention`;
  await client.zAdd(key, { score, value: memoryId });
  await client.expire(key, ATTENTION_TTL);
  return true;
}

/**
 * Remove memory from attention window.
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 */
export async function removeFromAttention(userId, memoryId) {
  if (!client) return;
  const key = `memorable:${userId}:attention`;
  await client.zRem(key, memoryId);
}

/**
 * Get current attention window (highest salience first).
 * @param {string} userId - User identifier
 * @param {number} limit - Maximum number to return
 * @returns {string[]} Array of memory IDs
 */
export async function getAttention(userId, limit = 10) {
  if (!client) return [];
  const key = `memorable:${userId}:attention`;
  return await client.zRange(key, 0, limit - 1, { REV: true });
}

/**
 * Get attention window with scores.
 * @param {string} userId - User identifier
 * @param {number} limit - Maximum number to return
 * @returns {Array<{memoryId: string, score: number}>}
 */
export async function getAttentionWithScores(userId, limit = 10) {
  if (!client) return [];
  const key = `memorable:${userId}:attention`;
  const results = await client.zRangeWithScores(key, 0, limit - 1, { REV: true });
  return results.map(r => ({ memoryId: r.value, score: r.score }));
}

/**
 * Update salience score for memory in attention.
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 * @param {number} newScore - Updated effective salience
 */
export async function updateAttentionScore(userId, memoryId, newScore) {
  if (!client) return;
  const key = `memorable:${userId}:attention`;

  if (newScore >= ATTENTION_THRESHOLD) {
    await client.zAdd(key, { score: newScore, value: memoryId });
  } else {
    // Faded below threshold - remove
    await client.zRem(key, memoryId);
  }
}

/**
 * Prune memories below attention threshold.
 * @param {string} userId - User identifier
 * @returns {number} Number of memories pruned
 */
export async function pruneAttention(userId) {
  if (!client) return 0;
  const key = `memorable:${userId}:attention`;
  return await client.zRemRangeByScore(key, 0, ATTENTION_THRESHOLD - 1);
}

/**
 * Get attention statistics.
 * @param {string} userId - User identifier
 */
export async function getAttentionStats(userId) {
  if (!client) return { total: 0, highSalience: 0, fadingSoon: 0 };
  const key = `memorable:${userId}:attention`;

  const [total, highSalience, fadingSoon] = await Promise.all([
    client.zCard(key),
    client.zCount(key, 70, '+inf'),
    client.zCount(key, ATTENTION_THRESHOLD, ATTENTION_THRESHOLD + 10),
  ]);

  return { total, highSalience, fadingSoon, threshold: ATTENTION_THRESHOLD };
}

/**
 * Check if memory is in attention.
 * @param {string} userId - User identifier
 * @param {string} memoryId - Memory identifier
 * @returns {boolean}
 */
export async function isInAttention(userId, memoryId) {
  if (!client) return false;
  const key = `memorable:${userId}:attention`;
  const score = await client.zScore(key, memoryId);
  return score !== null;
}

/**
 * Clear entire attention window.
 * @param {string} userId - User identifier
 */
export async function clearAttention(userId) {
  if (!client) return;
  const key = `memorable:${userId}:attention`;
  await client.del(key);
}

export async function closeRedis() {
  if (client) {
    try {
      await client.quit();
      client = null;
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      // Force close if graceful shutdown fails
      client.disconnect();
      client = null;
    }
  }
}

// Cleanup handler for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis connection...');
  await closeRedis();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis connection...');
  await closeRedis();
});