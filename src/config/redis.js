import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

let client = null;

export async function setupRedis() {
  try {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }

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

export function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call setupRedis first.');
  }
  return client;
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