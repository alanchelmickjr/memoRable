// Jest setup file - runs before all tests
// Provides mock implementations for common dependencies

import { jest } from '@jest/globals';

// Mock Redis client
const mockRedisClient = {
  hSet: jest.fn().mockResolvedValue(true),
  hGetAll: jest.fn().mockResolvedValue({
    vector: '[]',
    confidence: '0.8',
    timestamp: Date.now().toString(),
    type: 'text'
  }),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  quit: jest.fn().mockResolvedValue('OK'),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

// Mock Weaviate client
const mockWeaviateClient = {
  data: {
    creator: jest.fn().mockReturnValue({
      withClassName: jest.fn().mockReturnValue({
        withProperties: jest.fn().mockReturnValue({
          do: jest.fn().mockResolvedValue({ id: 'test-id' })
        })
      })
    }),
    getter: jest.fn().mockReturnValue({
      withClassName: jest.fn().mockReturnValue({
        withId: jest.fn().mockReturnValue({
          do: jest.fn().mockResolvedValue(null)
        })
      })
    }),
    deleter: jest.fn().mockReturnValue({
      withClassName: jest.fn().mockReturnValue({
        withId: jest.fn().mockReturnValue({
          do: jest.fn().mockResolvedValue(true)
        })
      })
    })
  },
  graphql: {
    get: jest.fn().mockReturnValue({
      withClassName: jest.fn().mockReturnValue({
        withFields: jest.fn().mockReturnValue({
          withNearText: jest.fn().mockReturnValue({
            withLimit: jest.fn().mockReturnValue({
              do: jest.fn().mockResolvedValue({ data: { Get: {} } })
            })
          }),
          do: jest.fn().mockResolvedValue({ data: { Get: {} } })
        })
      })
    })
  },
  schema: {
    classCreator: jest.fn().mockReturnValue({
      withClass: jest.fn().mockReturnValue({
        do: jest.fn().mockResolvedValue(true)
      })
    }),
    classGetter: jest.fn().mockReturnValue({
      withClassName: jest.fn().mockReturnValue({
        do: jest.fn().mockResolvedValue(null)
      })
    })
  }
};

// Mock MongoDB client
const mockMongoCollection = {
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockReturnValue({
    toArray: jest.fn().mockResolvedValue([]),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
  }),
  insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  aggregate: jest.fn().mockReturnValue({
    toArray: jest.fn().mockResolvedValue([])
  }),
  countDocuments: jest.fn().mockResolvedValue(0),
};

const mockMongoDb = {
  collection: jest.fn().mockReturnValue(mockMongoCollection),
  command: jest.fn().mockResolvedValue({ ok: 1 }),
};

const mockMongoClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockMongoDb),
};

// Export mocks for tests to use
globalThis.__mocks__ = {
  redisClient: mockRedisClient,
  weaviateClient: mockWeaviateClient,
  mongoClient: mockMongoClient,
  mongoDb: mockMongoDb,
  mongoCollection: mockMongoCollection,
};

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
