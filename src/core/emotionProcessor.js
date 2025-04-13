import { getWeaviateClient } from '../config/weaviate.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import emotionalContextService from '../services/emotionalContextService.js';
import {
  EMOTION_DIMENSIONS,
  emotionToVector,
  vectorToEmotion,
  expressionColors
} from '../constants/emotions.js';

export class EmotionProcessor {
  constructor() {
    this.weaviate = null;
    this.redis = null;
    this.emotionThreshold = parseFloat(process.env.EMOTION_THRESHOLD) || 0.7;
    this.updateInterval = parseInt(process.env.EMOTION_UPDATE_INTERVAL) || 5000;
    this.emotionDimensions = EMOTION_DIMENSIONS;
    this.emotions = Object.keys(expressionColors);
    this.activeContexts = new Set();
  }

  async initialize() {
    try {
      this.weaviate = getWeaviateClient();
      this.redis = getRedisClient();
      await emotionalContextService.initialize();
      await this.initializeEmotionalState();
      logger.info('Emotion Processor initialized');
    } catch (error) {
      logger.error('Failed to initialize Emotion Processor:', error);
      throw error;
    }
  }

  async initializeEmotionalState() {
    const exists = await this.redis.exists('emotional_state');
    if (!exists) {
      await this.redis.hSet('emotional_state', {
        emotion: 'neutral',
        vector: JSON.stringify(emotionToVector('neutral')),
        confidence: '1.0',
        timestamp: Date.now().toString()
      });
    }
  }

  async startEmotionalContext(contextId, options = {}) {
    try {
      const context = await emotionalContextService.startContext(contextId, options);
      this.activeContexts.add(contextId);
      return context;
    } catch (error) {
      logger.error(`Failed to start emotional context ${contextId}:`, error);
      throw error;
    }
  }

  async processEmotion(input, type, contextId = null) {
    try {
      // If context provided, use emotional context service
      if (contextId) {
        return await this.processWithContext(input, type, contextId);
      }

      // Otherwise, process as standalone emotion
      return await this.processStandaloneEmotion(input, type);
    } catch (error) {
      logger.error('Failed to process emotion:', error);
      throw error;
    }
  }

  async processWithContext(input, type, contextId) {
    if (!this.activeContexts.has(contextId)) {
      throw new Error(`Emotional context ${contextId} not found`);
    }

    switch (type) {
      case 'evi':
        await emotionalContextService.handleEVIEmotion(contextId, input);
        break;
      case 'video':
        // Video is handled automatically by VideoStreamService
        break;
      case 'voice':
        await emotionalContextService.handleVoiceEmotion(contextId, input);
        break;
      default:
        throw new Error(`Unsupported emotion type for context: ${type}`);
    }

    return await emotionalContextService.getEmotionalContext(contextId);
  }

  async processStandaloneEmotion(input, type) {
    // Generate a temporary context ID for standalone processing
    const tempContextId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await this.startEmotionalContext(tempContextId, {
        useVideo: type === 'video',
        useVoice: type === 'voice',
        useEVI: type === 'evi',
        bufferSize: 1 // Process immediately
      });

      const result = await this.processWithContext(input, type, tempContextId);
      await this.stopEmotionalContext(tempContextId);
      return result;
    } catch (error) {
      await this.stopEmotionalContext(tempContextId);
      throw error;
    }
  }

  async updateEmotionalState(contextId, emotionData) {
    try {
      const context = await emotionalContextService.getEmotionalContext(contextId);
      if (!context) return;

      // Store in Weaviate for long-term analysis
      await this.weaviate.data
        .creator()
        .withClassName('EmotionalVector')
        .withProperties({
          vector: context.vector,
          emotion: context.current,
          timestamp: new Date().toISOString(),
          confidence: context.confidence,
          contextId
        })
        .do();

      // Update current emotional state in Redis
      await this.redis.hSet('emotional_state', {
        emotion: context.current,
        vector: JSON.stringify(context.vector),
        confidence: context.confidence.toString(),
        timestamp: Date.now().toString(),
        contextId
      });

      logger.info(`Emotional state updated for context ${contextId}: ${context.current}`);
    } catch (error) {
      logger.error('Failed to update emotional state:', error);
      throw error;
    }
  }

  async getCurrentEmotionalState(contextId = null) {
    try {
      if (contextId) {
        return await emotionalContextService.getEmotionalContext(contextId);
      }

      const state = await this.redis.hGetAll('emotional_state');
      return {
        emotion: state.emotion,
        vector: JSON.parse(state.vector),
        confidence: parseFloat(state.confidence),
        timestamp: parseInt(state.timestamp),
        contextId: state.contextId
      };
    } catch (error) {
      logger.error('Failed to get current emotional state:', error);
      throw error;
    }
  }

  async stopEmotionalContext(contextId) {
    try {
      await emotionalContextService.stopContext(contextId);
      this.activeContexts.delete(contextId);
      logger.info(`Stopped emotional context ${contextId}`);
    } catch (error) {
      logger.error(`Failed to stop emotional context ${contextId}:`, error);
      throw error;
    }
  }

  async getActiveContexts() {
    return Array.from(this.activeContexts);
  }

  async cleanup() {
    logger.info('Cleaning up Emotion Processor...');
    
    // Stop all active contexts
    for (const contextId of this.activeContexts) {
      await this.stopEmotionalContext(contextId);
    }

    await emotionalContextService.cleanup();
  }
}