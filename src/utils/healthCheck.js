import { getDatabase } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { getWeaviateClient } from '../config/weaviate.js';
import { logger } from './logger.js';

export async function checkHealth() {
  const status = {
    healthy: true,
    services: {
      mongodb: false,
      redis: false,
      weaviate: false
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Check MongoDB
    const db = getDatabase();
    await db.command({ ping: 1 });
    status.services.mongodb = true;
  } catch (error) {
    logger.error('MongoDB health check failed:', error);
    status.healthy = false;
  }

  try {
    // Check Redis
    const redis = getRedisClient();
    await redis.ping();
    status.services.redis = true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    status.healthy = false;
  }

  try {
    // Check Weaviate
    const weaviate = getWeaviateClient();
    await weaviate.schema.getter().do();
    status.services.weaviate = true;
  } catch (error) {
    logger.error('Weaviate health check failed:', error);
    status.healthy = false;
  }

  return status;
}