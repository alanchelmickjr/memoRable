import { logger } from '../utils/logger.js';
import humeService from './humeService.js';
import videoStreamService from './videoStreamService.js';
import { getRedisClient } from '../config/redis.js';
import { emotionToVector, vectorToEmotion } from '../constants/emotions.js';

export class EmotionalContextService {
  constructor() {
    this.redis = null;
    this.activeContexts = new Map();
    this.emotionalBuffer = new Map();
    this.bufferTimeout = 5000; // 5 seconds
    this.customModelEnabled = false;
    this.weights = {
      evi: 0.5,      // EVI's built-in emotional processing
      video: 0.3,    // Video facial analysis
      voice: 0.2     // Voice prosody analysis
    };
  }

  async initialize() {
    this.redis = getRedisClient();
    await this.setupEmotionalBuffers();
    await this.loadCustomModel();
  }

  async loadCustomModel() {
    try {
      const hasCustomModel = await this.redis.exists('custom_model_config');
      if (hasCustomModel) {
        const config = JSON.parse(await this.redis.get('custom_model_config'));
        this.customModelEnabled = config.enabled;
        if (config.weights) {
          this.weights = config.weights;
        }
        logger.info('Custom model configuration loaded');
      }
    } catch (error) {
      logger.error('Failed to load custom model:', error);
    }
  }

  async setupEmotionalBuffers() {
    try {
      const bufferKey = 'emotional_context_buffers';
      const exists = await this.redis.exists(bufferKey);
      
      if (!exists) {
        await this.redis.hSet(bufferKey, {
          active_sessions: '{}',
          buffer_timeouts: '{}'
        });
      }
    } catch (error) {
      logger.error('Failed to setup emotional buffers:', error);
      throw error;
    }
  }

  async startContext(contextId, options = {}) {
    const context = {
      id: contextId,
      startTime: Date.now(),
      options: {
        useVideo: options.useVideo ?? false,
        useVoice: options.useVoice ?? true,
        useEVI: options.useEVI ?? false,
        customModel: options.customModel ?? this.customModelEnabled,
        bufferSize: options.bufferSize ?? 5,
        ...options
      },
      emotionalState: {
        current: 'neutral',
        confidence: 1.0,
        vector: emotionToVector('neutral'),
        history: [],
        sources: {}
      }
    };

    this.activeContexts.set(contextId, context);

    // Start video stream if enabled
    if (context.options.useVideo) {
      await videoStreamService.startStream(contextId, (emotionData) => {
        this.handleVideoEmotion(contextId, emotionData);
      }, {
        resetStream: true,
        faceConfig: {
          // Configure face detection settings
          minConfidence: 0.7,
          returnPoints: true
        }
      });
    }

    // Initialize Hume stream for voice if not using EVI
    if (context.options.useVoice && !context.options.useEVI) {
      await humeService.startStream(contextId, {
        models: { prosody: {} },
        resetStream: true
      });
    }

    logger.info(`Started emotional context ${contextId} with options:`, context.options);
    return context;
  }

  async handleEVIEmotion(contextId, eviEmotion) {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      logger.warn(`Context ${contextId} not found for EVI emotion`);
      return;
    }

    // Store EVI emotion in context sources
    context.emotionalState.sources.evi = {
      emotion: eviEmotion.emotion,
      confidence: eviEmotion.confidence,
      vector: eviEmotion.vector,
      timestamp: Date.now()
    };

    await this.updateEmotionalState(contextId, {
      emotion: eviEmotion.emotion,
      confidence: eviEmotion.confidence,
      vector: eviEmotion.vector,
      source: 'evi',
      timestamp: Date.now()
    });
  }

  async handleVideoEmotion(contextId, videoEmotion) {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      logger.warn(`Context ${contextId} not found for video emotion`);
      return;
    }

    if (videoEmotion.emotions.length > 0) {
      const dominant = videoEmotion.emotions[0];
      
      // Store video emotion in context sources
      context.emotionalState.sources.video = {
        emotion: dominant.name,
        confidence: dominant.confidence,
        vector: dominant.vector,
        timestamp: videoEmotion.timestamp
      };

      await this.updateEmotionalState(contextId, {
        emotion: dominant.name,
        confidence: dominant.confidence,
        vector: dominant.vector,
        source: 'video',
        timestamp: videoEmotion.timestamp
      });
    }
  }

  async handleVoiceEmotion(contextId, voiceData) {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      logger.warn(`Context ${contextId} not found for voice emotion`);
      return;
    }

    try {
      let emotions;
      if (context.options.useEVI) {
        // EVI handles voice emotion processing
        return;
      } else {
        // Process voice through Hume
        emotions = await humeService.processVoice(voiceData, contextId);
      }

      if (emotions.length > 0) {
        const dominant = emotions[0];
        
        // Store voice emotion in context sources
        context.emotionalState.sources.voice = {
          emotion: dominant.name,
          confidence: dominant.confidence,
          vector: dominant.vector,
          timestamp: Date.now()
        };

        await this.updateEmotionalState(contextId, {
          emotion: dominant.name,
          confidence: dominant.confidence,
          vector: dominant.vector,
          source: 'voice',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error(`Error processing voice emotion for context ${contextId}:`, error);
    }
  }

  async updateEmotionalState(contextId, emotionData) {
    const context = this.activeContexts.get(contextId);
    if (!context) return;

    // Add to emotional buffer
    if (!this.emotionalBuffer.has(contextId)) {
      this.emotionalBuffer.set(contextId, []);
    }
    this.emotionalBuffer.get(contextId).push(emotionData);

    // Process buffer if it reaches the size limit or after timeout
    if (this.emotionalBuffer.get(contextId).length >= context.options.bufferSize) {
      await this.processEmotionalBuffer(contextId);
    } else {
      // Set timeout to process buffer
      setTimeout(async () => {
        await this.processEmotionalBuffer(contextId);
      }, this.bufferTimeout);
    }
  }

  async processEmotionalBuffer(contextId) {
    const buffer = this.emotionalBuffer.get(contextId);
    if (!buffer || buffer.length === 0) return;

    const context = this.activeContexts.get(contextId);
    if (!context) return;

    const combinedVector = new Array(buffer[0].vector.length).fill(0);
    let totalWeight = 0;

    // Process each source type separately
    const sourceGroups = this.groupBySource(buffer);
    
    for (const [source, emotions] of Object.entries(sourceGroups)) {
      const weight = this.weights[source] * this.calculateSourceConfidence(emotions);
      const sourceVector = this.combineSourceEmotions(emotions);
      
      sourceVector.forEach((v, i) => {
        combinedVector[i] += v * weight;
      });
      totalWeight += weight;
    }

    // Normalize vector
    if (totalWeight > 0) {
      combinedVector.forEach((_, i) => {
        combinedVector[i] /= totalWeight;
      });
    }

    // Update context state
    context.emotionalState = {
      current: vectorToEmotion(combinedVector),
      confidence: totalWeight,
      vector: combinedVector,
      sources: context.emotionalState.sources,
      history: [
        ...context.emotionalState.history,
        {
          timestamp: Date.now(),
          emotions: buffer,
          sources: { ...context.emotionalState.sources }
        }
      ].slice(-100) // Keep last 100 emotional states
    };

    // Store in Redis
    await this.redis.hSet(`emotional_context:${contextId}`, {
      state: JSON.stringify(context.emotionalState),
      lastUpdate: Date.now().toString()
    });

    // Clear buffer
    this.emotionalBuffer.set(contextId, []);
  }

  groupBySource(buffer) {
    return buffer.reduce((groups, emotion) => {
      const source = emotion.source;
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(emotion);
      return groups;
    }, {});
  }

  calculateSourceConfidence(emotions) {
    return emotions.reduce((sum, e) => sum + e.confidence, 0) / emotions.length;
  }

  combineSourceEmotions(emotions) {
    const vector = new Array(emotions[0].vector.length).fill(0);
    emotions.forEach(emotion => {
      emotion.vector.forEach((v, i) => {
        vector[i] += v * emotion.confidence;
      });
    });
    return vector;
  }

  async getEmotionalContext(contextId) {
    const context = this.activeContexts.get(contextId);
    if (!context) {
      const storedContext = await this.redis.hGetAll(`emotional_context:${contextId}`);
      if (storedContext.state) {
        return JSON.parse(storedContext.state);
      }
      return null;
    }
    return context.emotionalState;
  }

  async stopContext(contextId) {
    const context = this.activeContexts.get(contextId);
    if (!context) return;

    // Process any remaining emotions in buffer
    await this.processEmotionalBuffer(contextId);

    // Stop video stream if active
    if (context.options.useVideo) {
      await videoStreamService.stopStream(contextId);
    }

    // Stop Hume stream if using it for voice
    if (context.options.useVoice && !context.options.useEVI) {
      await humeService.stopStream(contextId);
    }

    // Clean up
    this.activeContexts.delete(contextId);
    this.emotionalBuffer.delete(contextId);

    logger.info(`Stopped emotional context ${contextId}`);
  }

  async cleanup() {
    // Stop all active contexts
    for (const contextId of this.activeContexts.keys()) {
      await this.stopContext(contextId);
    }
  }
}

// Create singleton instance
const emotionalContextService = new EmotionalContextService();

export default emotionalContextService;