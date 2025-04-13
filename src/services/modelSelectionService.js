import { logger } from '../utils/logger.js';

export class ModelSelectionService {
  constructor() {
    this.isServerEnvironment = process.env.NODE_ENV === 'production';
    this.hasGPU = process.env.ENABLE_CUDA === '1';
    this.modelConfigs = {
      local: {
        default: 'ollama/mistral:3.2-small',
        management: 'ollama/mistral:3.2-small',
        embedding: 'ollama/nomic-embed-text',
        fallback: 'ollama/tinyllama'
      },
      server: {
        default: 'ollama/mistral:7b-instruct',
        management: 'ollama/mixtral:8x7b-instruct',
        embedding: 'ollama/nomic-embed-text:latest',
        fallback: 'ollama/mistral:3.2-small'
      }
    };
  }

  getModelConfig(type = 'default') {
    const environment = this.isServerEnvironment ? 'server' : 'local';
    const config = this.modelConfigs[environment];

    // If GPU is available locally, we can use larger models
    if (!this.isServerEnvironment && this.hasGPU) {
      return this.modelConfigs.server[type];
    }

    return config[type];
  }

  async validateModel(modelName) {
    try {
      // Check if model is available in Ollama
      const response = await fetch('http://localhost:11434/api/tags');
      const { models } = await response.json();
      
      return models.some(model => model.name === modelName);
    } catch (error) {
      logger.error('Error validating model:', error);
      return false;
    }
  }

  async ensureModel(type = 'default') {
    const modelName = this.getModelConfig(type);
    const isAvailable = await this.validateModel(modelName);

    if (!isAvailable) {
      logger.info(`Model ${modelName} not found, falling back to smaller model`);
      return this.modelConfigs[this.isServerEnvironment ? 'server' : 'local'].fallback;
    }

    return modelName;
  }

  getResourceLimits() {
    if (this.isServerEnvironment) {
      return {
        maxMemory: '16gb',
        maxThreads: 8,
        batchSize: 32
      };
    }

    return {
      maxMemory: '4gb',
      maxThreads: 4,
      batchSize: 8
    };
  }

  async getOptimalConfig() {
    const modelName = await this.ensureModel();
    const resources = this.getResourceLimits();

    return {
      model: modelName,
      ...resources,
      environment: this.isServerEnvironment ? 'server' : 'local',
      gpu: this.hasGPU
    };
  }
}

// Create singleton instance
const modelSelectionService = new ModelSelectionService();

export default modelSelectionService;