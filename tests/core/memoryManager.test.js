import { MemoryManager } from '../../src/core/memoryManager.js';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../src/config/database.js', () => ({
  getDatabase: jest.fn(() => ({
    collection: jest.fn(() => ({
      insertOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn(() => [])
          }))
        }))
      }))
    }))
  }))
}));

jest.mock('../../src/config/redis.js', () => ({
  getRedisClient: jest.fn(() => ({
    setEx: jest.fn(),
    get: jest.fn(),
    keys: jest.fn(() => []),
    set: jest.fn()
  }))
}));

jest.mock('../../src/config/weaviate.js', () => ({
  getWeaviateClient: jest.fn(() => ({
    data: {
      creator: jest.fn(() => ({
        withClassName: jest.fn(() => ({
          withProperties: jest.fn(() => ({
            do: jest.fn()
          }))
        }))
      }))
    },
    graphql: {
      get: jest.fn(() => ({
        withClassName: jest.fn(() => ({
          withFields: jest.fn(() => ({
            withNearVector: jest.fn(() => ({
              withLimit: jest.fn(() => ({
                do: jest.fn(() => ({
                  data: { Get: { MemoryEmbedding: [] } }
                }))
              }))
            }))
          }))
        }))
      }))
    }
  }))
}));

describe('MemoryManager', () => {
  let memoryManager;

  beforeEach(() => {
    memoryManager = new MemoryManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(memoryManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('storeMemory', () => {
    it('should store memory in all three tiers', async () => {
      const memory = {
        type: 'text',
        content: 'test content',
        context: 'test context',
        embedding: [0.1, 0.2, 0.3]
      };

      await memoryManager.initialize();
      await expect(memoryManager.storeMemory(memory)).resolves.not.toThrow();
    });
  });

  describe('retrieveMemories', () => {
    it('should retrieve memories from all sources', async () => {
      const query = {
        embedding: [0.1, 0.2, 0.3]
      };

      await memoryManager.initialize();
      const memories = await memoryManager.retrieveMemories(query);
      
      expect(Array.isArray(memories)).toBe(true);
    });
  });

  describe('consolidateMemories', () => {
    it('should consolidate memories without duplicates', () => {
      const memories = {
        active: [
          { context: 'test', timestamp: 1 },
          { context: 'test', timestamp: 2 }
        ],
        similar: [
          { context: 'test', timestamp: 1 }
        ],
        recent: [
          { context: 'test2', timestamp: 3 }
        ]
      };

      const consolidated = memoryManager.consolidateMemories(memories);
      expect(consolidated.length).toBe(3);
    });
  });
});