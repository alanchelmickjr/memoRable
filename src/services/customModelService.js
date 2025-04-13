import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import { getDatabase } from '../config/database.js';

export class CustomModelService {
  constructor() {
    this.redis = null;
    this.db = null;
    this.apiKey = process.env.HUME_API_KEY;
    this.apiEndpoint = 'https://api.hume.ai/v0/custom/models';
    this.activeModels = new Map();
    this.trainingJobs = new Map();
  }

  async initialize() {
    this.redis = getRedisClient();
    this.db = getDatabase();
    await this.loadActiveModels();
  }

  async loadActiveModels() {
    try {
      const models = await this.db.collection('custom_models')
        .find({ status: 'active' })
        .toArray();

      models.forEach(model => {
        this.activeModels.set(model.modelId, model);
      });

      logger.info(`Loaded ${models.length} active custom models`);
    } catch (error) {
      logger.error('Failed to load active models:', error);
    }
  }

  async createTrainingJob(userId, config) {
    try {
      const jobId = `train_${Date.now()}_${userId}`;
      const job = {
        id: jobId,
        userId,
        status: 'preparing',
        config: {
          name: config.name,
          description: config.description,
          labelSet: config.labels || [],
          dataConfig: {
            includeExpressions: true,
            includeLanguage: true,
            includeProsody: true
          },
          ...config
        },
        created: new Date(),
        updated: new Date()
      };

      await this.db.collection('training_jobs').insertOne(job);
      this.trainingJobs.set(jobId, job);

      // Start collecting training data
      await this.collectTrainingData(jobId);

      return jobId;
    } catch (error) {
      logger.error('Failed to create training job:', error);
      throw error;
    }
  }

  async collectTrainingData(jobId) {
    const job = this.trainingJobs.get(jobId);
    if (!job) throw new Error(`Training job ${jobId} not found`);

    try {
      // Update job status
      job.status = 'collecting';
      await this.updateJobStatus(job);

      // Get user's emotional history
      const emotionalHistory = await this.getEmotionalHistory(job.userId);

      // Process and label the data
      const labeledData = await this.processTrainingData(emotionalHistory, job.config);

      // Store processed data
      await this.storeTrainingData(jobId, labeledData);

      // Start training if enough data
      if (labeledData.length >= 100) {
        await this.startModelTraining(jobId);
      } else {
        job.status = 'insufficient_data';
        await this.updateJobStatus(job);
      }
    } catch (error) {
      logger.error(`Failed to collect training data for job ${jobId}:`, error);
      job.status = 'failed';
      job.error = error.message;
      await this.updateJobStatus(job);
    }
  }

  async getEmotionalHistory(userId) {
    const history = await this.db.collection('emotional_history')
      .find({
        userId,
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      })
      .sort({ timestamp: 1 })
      .toArray();

    return history;
  }

  async processTrainingData(history, config) {
    const labeledData = [];

    for (const entry of history) {
      if (!entry.emotionalState || !entry.context) continue;

      const processedEntry = {
        timestamp: entry.timestamp,
        labels: this.generateLabels(entry, config.labelSet),
        data: {
          expressions: entry.emotionalState.sources.video || null,
          language: entry.context.text || null,
          prosody: entry.emotionalState.sources.voice || null
        }
      };

      if (this.validateTrainingEntry(processedEntry)) {
        labeledData.push(processedEntry);
      }
    }

    return labeledData;
  }

  generateLabels(entry, labelSet) {
    const labels = new Set();

    // Generate labels based on emotional state and context
    labelSet.forEach(label => {
      if (this.matchesLabelCriteria(entry, label)) {
        labels.add(label);
      }
    });

    return Array.from(labels);
  }

  matchesLabelCriteria(entry, label) {
    // Implement label matching logic based on emotional state and context
    // This would be customized based on the specific requirements
    return false;
  }

  validateTrainingEntry(entry) {
    return entry.labels.length > 0 &&
           (entry.data.expressions || entry.data.language || entry.data.prosody);
  }

  async storeTrainingData(jobId, data) {
    await this.db.collection('training_data').insertOne({
      jobId,
      data,
      timestamp: new Date()
    });
  }

  async startModelTraining(jobId) {
    const job = this.trainingJobs.get(jobId);
    if (!job) throw new Error(`Training job ${jobId} not found`);

    try {
      // Update job status
      job.status = 'training';
      await this.updateJobStatus(job);

      // Get training data
      const trainingData = await this.db.collection('training_data')
        .findOne({ jobId });

      // Submit training job to Hume API
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hume-Api-Key': this.apiKey
        },
        body: JSON.stringify({
          name: job.config.name,
          description: job.config.description,
          data: trainingData.data
        })
      });

      if (!response.ok) {
        throw new Error(`Hume API error: ${response.statusText}`);
      }

      const result = await response.json();
      job.modelId = result.model_id;
      job.status = 'training';
      await this.updateJobStatus(job);

      // Start monitoring training progress
      this.monitorTraining(jobId);
    } catch (error) {
      logger.error(`Failed to start training for job ${jobId}:`, error);
      job.status = 'failed';
      job.error = error.message;
      await this.updateJobStatus(job);
    }
  }

  async monitorTraining(jobId) {
    const job = this.trainingJobs.get(jobId);
    if (!job || !job.modelId) return;

    try {
      const response = await fetch(`${this.apiEndpoint}/${job.modelId}`, {
        headers: { 'X-Hume-Api-Key': this.apiKey }
      });

      if (!response.ok) {
        throw new Error(`Hume API error: ${response.statusText}`);
      }

      const status = await response.json();

      if (status.status === 'completed') {
        await this.handleTrainingComplete(job);
      } else if (status.status === 'failed') {
        await this.handleTrainingFailed(job, status.error);
      } else {
        // Check again in 5 minutes
        setTimeout(() => this.monitorTraining(jobId), 5 * 60 * 1000);
      }
    } catch (error) {
      logger.error(`Error monitoring training for job ${jobId}:`, error);
    }
  }

  async handleTrainingComplete(job) {
    try {
      // Update job status
      job.status = 'completed';
      await this.updateJobStatus(job);

      // Add model to active models
      const model = {
        modelId: job.modelId,
        name: job.config.name,
        description: job.config.description,
        userId: job.userId,
        status: 'active',
        created: new Date(),
        lastUsed: null
      };

      await this.db.collection('custom_models').insertOne(model);
      this.activeModels.set(job.modelId, model);

      logger.info(`Training completed for job ${job.id}`);
    } catch (error) {
      logger.error(`Error handling training completion for job ${job.id}:`, error);
    }
  }

  async handleTrainingFailed(job, error) {
    job.status = 'failed';
    job.error = error;
    await this.updateJobStatus(job);
    logger.error(`Training failed for job ${job.id}:`, error);
  }

  async updateJobStatus(job) {
    await this.db.collection('training_jobs').updateOne(
      { id: job.id },
      {
        $set: {
          status: job.status,
          error: job.error,
          updated: new Date(),
          modelId: job.modelId
        }
      }
    );
  }

  async getJobStatus(jobId) {
    const job = this.trainingJobs.get(jobId);
    if (!job) {
      const stored = await this.db.collection('training_jobs')
        .findOne({ id: jobId });
      return stored;
    }
    return job;
  }

  async getActiveModels(userId) {
    return Array.from(this.activeModels.values())
      .filter(model => model.userId === userId);
  }

  async deleteModel(modelId) {
    try {
      // Delete from Hume API
      await fetch(`${this.apiEndpoint}/${modelId}`, {
        method: 'DELETE',
        headers: { 'X-Hume-Api-Key': this.apiKey }
      });

      // Update local state
      this.activeModels.delete(modelId);

      // Update database
      await this.db.collection('custom_models').updateOne(
        { modelId },
        { $set: { status: 'deleted' } }
      );

      logger.info(`Deleted custom model ${modelId}`);
    } catch (error) {
      logger.error(`Failed to delete model ${modelId}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const customModelService = new CustomModelService();

export default customModelService;