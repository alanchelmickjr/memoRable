import emotionalContextService from './services/emotionalContextService.js';
import humeService from './services/humeService.js';
import videoStreamService from './services/videoStreamService.js';
import customModelService from './services/customModelService.js';
import modelSelectionService from './services/modelSelectionService.js';
import { expressionColors, emotionToVector, vectorToEmotion } from './constants/emotions.js';

class MemoRable {
  constructor(config = {}) {
    this.config = {
      humeApiKey: config.humeApiKey || process.env.HUME_API_KEY,
      mongoUri: config.mongoUri || process.env.MONGODB_URI,
      redisUrl: config.redisUrl || process.env.REDIS_URL,
      weaviateUrl: config.weaviateUrl || process.env.WEAVIATE_URL,
      ...config
    };
  }

  async initialize() {
    // Initialize all services
    await emotionalContextService.initialize();
    await humeService.connect();
    await customModelService.initialize();
    return this;
  }

  // Emotion Processing
  async processEmotion(input, type, contextId = null) {
    return emotionalContextService.processEmotion(input, type, contextId);
  }

  async startEmotionalContext(contextId, options = {}) {
    return emotionalContextService.startContext(contextId, options);
  }

  async stopEmotionalContext(contextId) {
    return emotionalContextService.stopContext(contextId);
  }

  // Video Stream Processing
  async startVideoStream(streamId, onEmotionUpdate, config = {}) {
    return videoStreamService.startStream(streamId, onEmotionUpdate, config);
  }

  async addVideoFrame(streamId, frameData, timestamp) {
    return videoStreamService.addFrame(streamId, frameData, timestamp);
  }

  async stopVideoStream(streamId) {
    return videoStreamService.stopStream(streamId);
  }

  // Custom Model Management
  async createCustomModel(userId, config) {
    return customModelService.createTrainingJob(userId, config);
  }

  async getCustomModels(userId) {
    return customModelService.getActiveModels(userId);
  }

  // Utility Functions
  getEmotionColor(emotion) {
    return expressionColors[emotion];
  }

  emotionToVector(emotion) {
    return emotionToVector(emotion);
  }

  vectorToEmotion(vector) {
    return vectorToEmotion(vector);
  }

  // Cleanup
  async cleanup() {
    await emotionalContextService.cleanup();
    await humeService.close();
    await videoStreamService.cleanup();
    await customModelService.cleanup();
  }
}

// Example usage:
/*
const memorable = new MemoRable({
  humeApiKey: 'your-hume-api-key',
  // Optional: override other configurations
});

await memorable.initialize();

// Start an emotional context
const contextId = 'user123';
await memorable.startEmotionalContext(contextId, {
  useVideo: true,
  useVoice: true
});

// Process emotions
await memorable.processEmotion('I am happy', 'text', contextId);

// Process video frames
const streamId = 'video123';
await memorable.startVideoStream(streamId, (emotionData) => {
  console.log('Emotion update:', emotionData);
});

// Add video frames
await memorable.addVideoFrame(streamId, frameData);

// Cleanup
await memorable.cleanup();
*/

export default MemoRable;

// Also export individual services for advanced usage
export {
  emotionalContextService,
  humeService,
  videoStreamService,
  customModelService,
  modelSelectionService,
  expressionColors,
  emotionToVector,
  vectorToEmotion
};