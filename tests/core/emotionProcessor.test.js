import { EmotionProcessor } from '../../src/core/emotionProcessor.js';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../src/config/redis.js', () => ({
  getRedisClient: jest.fn(() => ({
    hSet: jest.fn(),
    hGetAll: jest.fn(() => ({
      vector: '[]',
      confidence: '0.8',
      timestamp: Date.now().toString(),
      type: 'text'
    }))
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
            withSort: jest.fn(() => ({
              withLimit: jest.fn(() => ({
                do: jest.fn(() => ({
                  data: {
                    Get: {
                      EmotionalVector: [
                        {
                          vector: [0, 0, 0],
                          timestamp: new Date().toISOString()
                        }
                      ]
                    }
                  }
                }))
              }))
            }))
          }))
        }))
      }))
    }
  }))
}));

describe('EmotionProcessor', () => {
  let emotionProcessor;

  beforeEach(() => {
    emotionProcessor = new EmotionProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(emotionProcessor.initialize()).resolves.not.toThrow();
    });
  });

  describe('processEmotion', () => {
    it('should process text emotions', async () => {
      const input = 'I am happy';
      await emotionProcessor.initialize();
      
      const result = await emotionProcessor.processEmotion(input, 'text');
      expect(result).toBeDefined();
      expect(Array.isArray(result.vector)).toBe(true);
    });

    it('should process visual emotions', async () => {
      const input = Buffer.from('fake-image-data');
      await emotionProcessor.initialize();
      
      const result = await emotionProcessor.processEmotion(input, 'vision');
      expect(result).toBeDefined();
      expect(Array.isArray(result.vector)).toBe(true);
    });

    it('should process audio emotions', async () => {
      const input = Buffer.from('fake-audio-data');
      await emotionProcessor.initialize();
      
      const result = await emotionProcessor.processEmotion(input, 'audio');
      expect(result).toBeDefined();
      expect(Array.isArray(result.vector)).toBe(true);
    });

    it('should handle invalid input type', async () => {
      await emotionProcessor.initialize();
      
      await expect(emotionProcessor.processEmotion('test', 'invalid'))
        .rejects
        .toThrow('Unsupported emotion input type: invalid');
    });
  });

  describe('extractEmotionalFeatures', () => {
    it('should extract features for different input types', async () => {
      await emotionProcessor.initialize();
      
      const types = ['text', 'vision', 'audio', 'multimodal'];
      
      for (const type of types) {
        const features = await emotionProcessor.extractEmotionalFeatures('test', type);
        expect(features).toHaveProperty('timestamp');
        expect(features).toHaveProperty('type', type);
        expect(features).toHaveProperty('rawFeatures');
        expect(features).toHaveProperty('confidence');
      }
    });
  });

  describe('generateEmotionalVector', () => {
    it('should generate vector with correct dimensions', async () => {
      const features = {
        rawFeatures: [],
        confidence: 0.8,
        timestamp: Date.now(),
        type: 'text'
      };

      const result = await emotionProcessor.generateEmotionalVector(features);
      
      expect(result.vector).toHaveLength(emotionProcessor.emotionDimensions);
      expect(result.confidence).toBe(features.confidence);
      expect(result.timestamp).toBe(features.timestamp);
      expect(result.type).toBe(features.type);
    });
  });

  describe('getCurrentEmotionalState', () => {
    it('should return current emotional state', async () => {
      await emotionProcessor.initialize();
      
      const state = await emotionProcessor.getCurrentEmotionalState();
      
      expect(state).toHaveProperty('vector');
      expect(state).toHaveProperty('confidence');
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('type');
    });
  });
});