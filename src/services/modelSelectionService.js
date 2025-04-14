import { logger } from '../utils/logger.js';
import os from 'os';

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

    // Performance tracking
    this.metrics = {
      requestCount: 0,
      totalLatency: 0,
      errors: 0,
      lastSwitchTime: Date.now(),
      modelUsage: new Map()
    };

    // Memory thresholds (percentage)
    this.memoryThresholds = {
      warning: 80,
      critical: 90
    };

    // Memoization caches
    this.responseCache = new Map();
    this.modelStateCache = new Map();
    this.taskPatternCache = new Map();

    // Cache configuration
    this.cacheConfig = {
      maxSize: 1000,
      ttl: 3600000, // 1 hour
      criticalityThreshold: 0.8
    };

    // Initialize performance monitoring
    this.startPerformanceMonitoring();
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
      this.metrics.errors++;
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
    const startTime = Date.now();
    const modelName = await this.ensureModel();
    const resources = this.getResourceLimits();

    // Update metrics
    this.metrics.requestCount++;
    this.metrics.totalLatency += Date.now() - startTime;
    this.updateModelUsage(modelName);

    return {
      model: modelName,
      ...resources,
      environment: this.isServerEnvironment ? 'server' : 'local',
      gpu: this.hasGPU
    };
  }

  // Memoization methods
  async getMemoizedResponse(prompt, modelName, taskType) {
    const cacheKey = this.generateCacheKey(prompt, modelName, taskType);
    
    if (this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheConfig.ttl) {
        logger.info('Using memoized response');
        return cached.response;
      }
      this.responseCache.delete(cacheKey);
    }

    return null;
  }

  async memoizeResponse(prompt, response, modelName, taskType, criticality) {
    const cacheKey = this.generateCacheKey(prompt, modelName, taskType);
    
    // Only memoize if task criticality is above threshold
    if (criticality >= this.cacheConfig.criticalityThreshold) {
      this.responseCache.set(cacheKey, {
        response,
        timestamp: Date.now(),
        criticality
      });

      // Maintain cache size
      if (this.responseCache.size > this.cacheConfig.maxSize) {
        const oldestKey = Array.from(this.responseCache.keys())[0];
        this.responseCache.delete(oldestKey);
      }

      // Update task pattern for night processing
      this.updateTaskPattern(taskType, prompt);
    }
  }

  generateCacheKey(prompt, modelName, taskType) {
    return `${modelName}:${taskType}:${prompt.slice(0, 100)}`;
  }

  updateTaskPattern(taskType, prompt) {
    const patterns = this.taskPatternCache.get(taskType) || [];
    patterns.push({
      prompt: prompt.slice(0, 100),
      timestamp: Date.now()
    });
    this.taskPatternCache.set(taskType, patterns.slice(-100)); // Keep last 100 patterns
  }

  async getModelState(modelName) {
    return this.modelStateCache.get(modelName) || {
      lastUsed: 0,
      performance: {},
      errors: 0
    };
  }

  async updateModelState(modelName, metrics) {
    const currentState = await this.getModelState(modelName);
    this.modelStateCache.set(modelName, {
      ...currentState,
      ...metrics,
      lastUsed: Date.now()
    });
  }

  // Performance monitoring methods
  startPerformanceMonitoring() {
    // Monitor system metrics every 30 seconds
    setInterval(() => this.checkSystemHealth(), 30000);
    logger.info('Performance monitoring started');
  }

  checkSystemHealth() {
    const memoryUsage = this.getMemoryUsage();
    const avgLatency = this.metrics.totalLatency / this.metrics.requestCount || 0;

    logger.info('System health metrics:', {
      memoryUsage,
      avgLatency,
      requestCount: this.metrics.requestCount,
      errors: this.metrics.errors,
      cacheSize: this.responseCache.size
    });

    // Check if we need to switch to a smaller model
    if (this.shouldSwitchModel(memoryUsage)) {
      this.switchToSmallerModel();
    }
  }

  getMemoryUsage() {
    const used = process.memoryUsage();
    const total = os.totalmem();
    return {
      heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
      heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2) + 'MB',
      rss: (used.rss / 1024 / 1024).toFixed(2) + 'MB',
      percentage: ((used.heapUsed / total) * 100).toFixed(2) + '%'
    };
  }

  shouldSwitchModel(memoryUsage) {
    const usagePercentage = parseFloat(memoryUsage.percentage);
    return usagePercentage > this.memoryThresholds.warning;
  }

  async switchToSmallerModel() {
    const currentTime = Date.now();
    // Prevent frequent switches (minimum 5 minutes between switches)
    if (currentTime - this.metrics.lastSwitchTime < 300000) {
      return;
    }

    logger.warn('Switching to smaller model due to high memory usage');
    const fallbackModel = this.modelConfigs[this.isServerEnvironment ? 'server' : 'local'].fallback;
    await this.warmupModel(fallbackModel);
    this.metrics.lastSwitchTime = currentTime;
  }

  updateModelUsage(modelName) {
    const currentCount = this.metrics.modelUsage.get(modelName) || 0;
    this.metrics.modelUsage.set(modelName, currentCount + 1);
  }

  async warmupModel(modelName) {
    try {
      logger.info(`Warming up model: ${modelName}`);
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: 'Warm up test.',
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to warm up model: ${response.statusText}`);
      }

      logger.info(`Model ${modelName} warmed up successfully`);
      return true;
    } catch (error) {
      logger.error('Error warming up model:', error);
      this.metrics.errors++;
      return false;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgLatency: this.metrics.totalLatency / this.metrics.requestCount || 0,
      modelUsage: Object.fromEntries(this.metrics.modelUsage),
      cacheStats: {
        size: this.responseCache.size,
        taskPatterns: Object.fromEntries(this.taskPatternCache)
      }
    };
  }
}

// Create singleton instance
const modelSelectionService = new ModelSelectionService();

export default modelSelectionService;