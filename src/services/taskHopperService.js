import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';
import identityService from './identityService.js';

export class TaskHopperService {
  constructor() {
    this.taskSchema = new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      title: String,
      description: String,
      type: {
        type: String,
        enum: ['instruction', 'task', 'step', 'note'],
        default: 'task'
      },
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'archived'],
        default: 'pending'
      },
      priority: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
      },
      context: {
        parentTask: mongoose.Schema.Types.ObjectId,
        relatedTasks: [mongoose.Schema.Types.ObjectId],
        tags: [String],
        aiContext: Object
      },
      progress: {
        steps: [{
          description: String,
          status: String,
          completedAt: Date,
          aiNotes: String
        }],
        currentStep: Number,
        totalSteps: Number,
        percentComplete: Number
      },
      metadata: {
        creator: {
          type: String,
          enum: ['user', 'ai'],
          default: 'user'
        },
        createdAt: {
          type: Date,
          default: Date.now
        },
        updatedAt: Date,
        lastAccessed: Date,
        accessCount: {
          type: Number,
          default: 0
        }
      }
    });

    this.Task = mongoose.model('Task', this.taskSchema);
    this.activeHoppers = new Map(); // Cache of active task hoppers by user
  }

  async createTask(userId, taskData) {
    try {
      // Validate user access
      const user = await identityService.validateMemoryAccess(userId, 'task-hopper');
      if (!user) {
        logger.warn('User not authorized to create tasks');
        return null;
      }

      const task = await this.Task.create({
        userId,
        ...taskData,
        metadata: {
          ...taskData.metadata,
          updatedAt: new Date(),
          lastAccessed: new Date()
        }
      });

      // Update active hopper cache
      this.updateActiveHopper(userId, task);

      return task;
    } catch (error) {
      logger.error('Error creating task:', error);
      return null;
    }
  }

  async addAITask(userId, taskData) {
    return this.createTask(userId, {
      ...taskData,
      metadata: {
        creator: 'ai',
        createdAt: new Date()
      }
    });
  }

  async updateTask(taskId, updates) {
    try {
      const task = await this.Task.findById(taskId);
      if (!task) return null;

      // Update task fields
      Object.assign(task, updates);
      
      // Update metadata
      task.metadata.updatedAt = new Date();
      task.metadata.lastAccessed = new Date();
      task.metadata.accessCount += 1;

      // Update progress if steps changed
      if (updates.progress?.steps) {
        task.progress.currentStep = updates.progress.steps.filter(
          step => step.status === 'completed'
        ).length;
        task.progress.totalSteps = updates.progress.steps.length;
        task.progress.percentComplete = 
          (task.progress.currentStep / task.progress.totalSteps) * 100;
      }

      await task.save();
      this.updateActiveHopper(task.userId, task);

      return task;
    } catch (error) {
      logger.error('Error updating task:', error);
      return null;
    }
  }

  async addTaskStep(taskId, stepData) {
    try {
      const task = await this.Task.findById(taskId);
      if (!task) return null;

      task.progress.steps.push({
        ...stepData,
        status: 'pending'
      });

      return this.updateTask(taskId, {
        progress: task.progress
      });
    } catch (error) {
      logger.error('Error adding task step:', error);
      return null;
    }
  }

  async completeStep(taskId, stepIndex, aiNotes = '') {
    try {
      const task = await this.Task.findById(taskId);
      if (!task || !task.progress.steps[stepIndex]) return null;

      task.progress.steps[stepIndex].status = 'completed';
      task.progress.steps[stepIndex].completedAt = new Date();
      task.progress.steps[stepIndex].aiNotes = aiNotes;

      return this.updateTask(taskId, {
        progress: task.progress
      });
    } catch (error) {
      logger.error('Error completing task step:', error);
      return null;
    }
  }

  async getTaskContext(taskId) {
    try {
      const task = await this.Task.findById(taskId);
      if (!task) return null;

      // Get related tasks
      const relatedTasks = await Promise.all(
        task.context.relatedTasks.map(id => this.Task.findById(id))
      );

      // Get parent task if exists
      const parentTask = task.context.parentTask ?
        await this.Task.findById(task.context.parentTask) :
        null;

      return {
        task,
        parentTask,
        relatedTasks: relatedTasks.filter(t => t !== null),
        aiContext: task.context.aiContext
      };
    } catch (error) {
      logger.error('Error getting task context:', error);
      return null;
    }
  }

  updateActiveHopper(userId, task) {
    let userHopper = this.activeHoppers.get(userId);
    if (!userHopper) {
      userHopper = new Map();
      this.activeHoppers.set(userId, userHopper);
    }
    userHopper.set(task._id.toString(), {
      task,
      timestamp: Date.now()
    });
  }

  async getUserTasks(userId, filter = {}) {
    try {
      const query = { userId, ...filter };
      return await this.Task.find(query)
        .sort({ 'metadata.updatedAt': -1 });
    } catch (error) {
      logger.error('Error getting user tasks:', error);
      return [];
    }
  }

  async getActiveInstructions(userId) {
    return this.getUserTasks(userId, {
      type: 'instruction',
      status: { $ne: 'archived' }
    });
  }

  async archiveTask(taskId) {
    return this.updateTask(taskId, {
      status: 'archived'
    });
  }

  async searchTasks(userId, searchTerms) {
    try {
      const tasks = await this.Task.find({
        userId,
        $or: [
          { title: { $regex: searchTerms, $options: 'i' } },
          { description: { $regex: searchTerms, $options: 'i' } },
          { 'context.tags': { $in: searchTerms.split(/\s+/) } }
        ]
      });

      return tasks;
    } catch (error) {
      logger.error('Error searching tasks:', error);
      return [];
    }
  }

  async getTaskStats(userId) {
    try {
      const tasks = await this.getUserTasks(userId);
      return {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        aiCreated: tasks.filter(t => t.metadata.creator === 'ai').length,
        averageCompletion: tasks.reduce((acc, t) => acc + (t.progress?.percentComplete || 0), 0) / tasks.length
      };
    } catch (error) {
      logger.error('Error getting task stats:', error);
      return null;
    }
  }
}

// Create singleton instance
const taskHopperService = new TaskHopperService();

export default taskHopperService;