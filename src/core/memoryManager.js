import { getDatabase } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { getWeaviateClient } from '../config/weaviate.js';
import { logger } from '../utils/logger.js';

export class MemoryManager {
  constructor() {
    this.db = null;
    this.redis = null;
    this.weaviate = null;
    this.shortTermWindow = parseInt(process.env.MEMORY_WINDOW_SHORT) || 1200000; // 20 min
    this.mediumTermWindow = parseInt(process.env.MEMORY_WINDOW_MEDIUM) || 3600000; // 1 hour
    this.longTermWindow = parseInt(process.env.MEMORY_WINDOW_LONG) || 86400000; // 24 hours
  }

  async initialize() {
    try {
      this.db = getDatabase();
      this.redis = getRedisClient();
      this.weaviate = getWeaviateClient();
      logger.info('Memory Manager initialized');
    } catch (error) {
      logger.error('Failed to initialize Memory Manager:', error);
      throw error;
    }
  }

  async storeMemory(memory) {
    try {
      const timestamp = Date.now();
      const { type, content, context, embedding } = memory;

      // Store raw data in MongoDB
      await this.storeRawMemory(type, content, context, timestamp);

      // Store vector embedding in Weaviate
      await this.storeVectorEmbedding(embedding, context, type, timestamp);

      // Update active memory in Redis
      await this.updateActiveMemory(type, content, context, timestamp);

      logger.info(`Memory stored successfully: ${type}`);
    } catch (error) {
      logger.error('Failed to store memory:', error);
      throw error;
    }
  }

  async storeRawMemory(type, content, context, timestamp) {
    const collection = this.db.collection('memories');
    await collection.insertOne({
      type,
      content,
      context,
      timestamp,
      metadata: {
        source: 'memory_manager',
        version: '1.0'
      }
    });
  }

  async storeVectorEmbedding(embedding, context, type, timestamp) {
    await this.weaviate.data
      .creator()
      .withClassName('MemoryEmbedding')
      .withProperties({
        vector: embedding,
        context,
        type,
        timestamp: new Date(timestamp).toISOString()
      })
      .do();
  }

  async updateActiveMemory(type, content, context, timestamp) {
    const memoryKey = `memory:${timestamp}`;
    const memoryData = JSON.stringify({ type, content, context });

    // Store in Redis with different expiration times for different windows
    await Promise.all([
      // Short-term memory (20 minutes)
      this.redis.setEx(
        `short_term:${memoryKey}`,
        Math.floor(this.shortTermWindow / 1000),
        memoryData
      ),
      // Medium-term memory (1 hour)
      this.redis.setEx(
        `medium_term:${memoryKey}`,
        Math.floor(this.mediumTermWindow / 1000),
        memoryData
      ),
      // Long-term memory (24 hours)
      this.redis.setEx(
        `long_term:${memoryKey}`,
        Math.floor(this.longTermWindow / 1000),
        memoryData
      )
    ]);
  }

  async retrieveMemories(query, timeWindow = 'medium_term') {
    try {
      const memories = {
        active: await this.getActiveMemories(timeWindow),
        similar: await this.getSimilarMemories(query),
        recent: await this.getRecentRawMemories()
      };

      return this.consolidateMemories(memories);
    } catch (error) {
      logger.error('Failed to retrieve memories:', error);
      throw error;
    }
  }

  async getActiveMemories(timeWindow) {
    const pattern = `${timeWindow}:memory:*`;
    const keys = await this.redis.keys(pattern);
    const memories = await Promise.all(
      keys.map(key => this.redis.get(key))
    );
    return memories.map(memory => JSON.parse(memory));
  }

  async getSimilarMemories(query) {
    const result = await this.weaviate.graphql
      .get()
      .withClassName('MemoryEmbedding')
      .withFields(['context', 'type', 'timestamp'])
      .withNearVector({
        vector: query.embedding,
        certainty: 0.7
      })
      .withLimit(10)
      .do();

    return result.data.Get.MemoryEmbedding;
  }

  async getRecentRawMemories() {
    const collection = this.db.collection('memories');
    return await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
  }

  consolidateMemories(memories) {
    // Combine and deduplicate memories based on context and timestamp
    const consolidated = new Map();
    
    for (const type in memories) {
      memories[type].forEach(memory => {
        const key = `${memory.context}-${memory.timestamp}`;
        if (!consolidated.has(key)) {
          consolidated.set(key, memory);
        }
      });
    }

    return Array.from(consolidated.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async cleanup() {
    // Cleanup method for graceful shutdown
    logger.info('Cleaning up Memory Manager...');
    // Additional cleanup logic can be added here
  }
}