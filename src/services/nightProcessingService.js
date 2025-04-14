import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';
import modelSelectionService from './modelSelectionService.js';

export class NightProcessingService {
  constructor() {
    this.isProcessing = false;
    this.lastProcessingTime = null;
    this.processingInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.taskPatternSchema = new mongoose.Schema({
      taskType: String,
      patterns: [{
        prompt: String,
        timestamp: Date,
        modelUsed: String,
        performance: {
          latency: Number,
          success: Boolean,
          memoryUsage: Number
        }
      }],
      aggregatedMetrics: {
        avgLatency: Number,
        successRate: Number,
        commonPatterns: [String],
        recommendedModel: String,
        lastUpdated: Date
      }
    });

    this.TaskPattern = mongoose.model('TaskPattern', this.taskPatternSchema);
  }

  async startNightProcessing() {
    if (this.isProcessing) {
      logger.warn('Night processing already in progress');
      return;
    }

    const currentHour = new Date().getHours();
    if (currentHour < 1 || currentHour > 4) {
      logger.info('Not within night processing window (1 AM - 4 AM)');
      return;
    }

    try {
      this.isProcessing = true;
      logger.info('Starting night processing');

      await this.analyzeTaskPatterns();
      await this.optimizeModelSelection();
      await this.updateCacheStrategies();

      this.lastProcessingTime = Date.now();
      logger.info('Night processing completed successfully');
    } catch (error) {
      logger.error('Error during night processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async analyzeTaskPatterns() {
    logger.info('Analyzing task patterns');
    const patterns = Array.from(modelSelectionService.taskPatternCache.entries());

    for (const [taskType, taskPatterns] of patterns) {
      const analysis = this.analyzePatterns(taskPatterns);
      await this.updateTaskPatternMetrics(taskType, analysis);
    }
  }

  analyzePatterns(patterns) {
    // Group similar patterns and calculate metrics
    const groupedPatterns = patterns.reduce((acc, pattern) => {
      const key = pattern.prompt.toLowerCase().trim();
      if (!acc[key]) {
        acc[key] = {
          count: 0,
          timestamps: []
        };
      }
      acc[key].count++;
      acc[key].timestamps.push(pattern.timestamp);
      return acc;
    }, {});

    // Find most common patterns
    const commonPatterns = Object.entries(groupedPatterns)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([pattern]) => pattern);

    // Calculate time-based frequency
    const timeDistribution = this.calculateTimeDistribution(
      patterns.map(p => p.timestamp)
    );

    return {
      commonPatterns,
      timeDistribution,
      totalPatterns: patterns.length
    };
  }

  calculateTimeDistribution(timestamps) {
    const hours = Array(24).fill(0);
    timestamps.forEach(timestamp => {
      const hour = new Date(timestamp).getHours();
      hours[hour]++;
    });
    return hours;
  }

  async updateTaskPatternMetrics(taskType, analysis) {
    const metrics = await this.TaskPattern.findOne({ taskType });
    if (!metrics) {
      await this.TaskPattern.create({
        taskType,
        patterns: [],
        aggregatedMetrics: {
          commonPatterns: analysis.commonPatterns,
          lastUpdated: new Date()
        }
      });
      return;
    }

    metrics.aggregatedMetrics = {
      ...metrics.aggregatedMetrics,
      commonPatterns: analysis.commonPatterns,
      lastUpdated: new Date()
    };
    await metrics.save();
  }

  async optimizeModelSelection() {
    logger.info('Optimizing model selection');
    const metrics = await this.getModelPerformanceMetrics();

    // Update model configurations based on performance
    for (const [modelName, performance] of Object.entries(metrics)) {
      await modelSelectionService.updateModelState(modelName, {
        performance,
        lastAnalyzed: Date.now()
      });
    }
  }

  async getModelPerformanceMetrics() {
    const modelUsage = modelSelectionService.metrics.modelUsage;
    const metrics = {};

    for (const [modelName, usageCount] of modelUsage.entries()) {
      const modelState = await modelSelectionService.getModelState(modelName);
      metrics[modelName] = {
        usageCount,
        avgLatency: modelState.performance.latency || 0,
        errorRate: modelState.errors / usageCount || 0,
        lastUsed: modelState.lastUsed
      };
    }

    return metrics;
  }

  async updateCacheStrategies() {
    logger.info('Updating cache strategies');
    const taskPatterns = await this.TaskPattern.find({});

    for (const pattern of taskPatterns) {
      const { commonPatterns } = pattern.aggregatedMetrics;

      // Pre-warm cache for common patterns
      for (const prompt of commonPatterns) {
        const modelName = await modelSelectionService.ensureModel();
        await modelSelectionService.warmupModel(modelName);
      }
    }
  }

  getProcessingStatus() {
    return {
      isProcessing: this.isProcessing,
      lastProcessingTime: this.lastProcessingTime,
      nextScheduledTime: this.lastProcessingTime ? 
        new Date(this.lastProcessingTime + this.processingInterval) : 
        null
    };
  }
}

// Create singleton instance
const nightProcessingService = new NightProcessingService();

export default nightProcessingService;