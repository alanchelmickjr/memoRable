import { TaskHopperService } from '../../src/services/taskHopperService.js';
import identityService from '../../src/services/identityService.js';
import mongoose from 'mongoose';

jest.mock('../../src/services/identityService.js');
jest.mock('mongoose');

describe('TaskHopperService', () => {
  let taskHopper;
  let mockTask;
  const userId = 'test-user-id';

  beforeEach(() => {
    mockTask = {
      _id: 'test-task-id',
      userId,
      title: 'Test Task',
      description: 'Test Description',
      type: 'task',
      status: 'pending',
      priority: 3,
      context: {
        parentTask: null,
        relatedTasks: [],
        tags: ['test'],
        aiContext: {}
      },
      progress: {
        steps: [],
        currentStep: 0,
        totalSteps: 0,
        percentComplete: 0
      },
      metadata: {
        creator: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 0
      },
      save: jest.fn().mockResolvedValue(true)
    };

    mongoose.Schema = jest.fn();
    mongoose.model = jest.fn().mockReturnValue({
      create: jest.fn().mockResolvedValue(mockTask),
      findById: jest.fn().mockResolvedValue(mockTask),
      find: jest.fn().mockResolvedValue([mockTask])
    });

    identityService.validateMemoryAccess.mockResolvedValue(true);

    taskHopper = new TaskHopperService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Creation', () => {
    it('should create new task for authorized user', async () => {
      const taskData = {
        title: 'New Task',
        description: 'Task Description'
      };

      const task = await taskHopper.createTask(userId, taskData);
      expect(task).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(taskHopper.activeHoppers.get(userId)).toBeDefined();
    });

    it('should handle unauthorized task creation', async () => {
      identityService.validateMemoryAccess.mockResolvedValueOnce(false);
      
      const task = await taskHopper.createTask(userId, {});
      expect(task).toBeNull();
    });

    it('should create AI task with correct metadata', async () => {
      const task = await taskHopper.addAITask(userId, {
        title: 'AI Task'
      });

      expect(task).toBeDefined();
      expect(task.metadata.creator).toBe('ai');
    });
  });

  describe('Task Updates', () => {
    it('should update task fields', async () => {
      const updates = {
        title: 'Updated Title',
        status: 'in_progress'
      };

      const updated = await taskHopper.updateTask('test-task-id', updates);
      expect(updated).toBeDefined();
      expect(updated.metadata.accessCount).toBe(1);
    });

    it('should handle missing task updates', async () => {
      taskHopper.Task.findById.mockResolvedValueOnce(null);
      
      const updated = await taskHopper.updateTask('invalid-id', {});
      expect(updated).toBeNull();
    });
  });

  describe('Step Management', () => {
    it('should add task step', async () => {
      const stepData = {
        description: 'New Step'
      };

      const updated = await taskHopper.addTaskStep('test-task-id', stepData);
      expect(updated.progress.steps).toHaveLength(1);
      expect(updated.progress.totalSteps).toBe(1);
    });

    it('should complete task step', async () => {
      mockTask.progress.steps = [{
        description: 'Test Step',
        status: 'pending'
      }];

      const updated = await taskHopper.completeStep('test-task-id', 0, 'AI Note');
      expect(updated.progress.steps[0].status).toBe('completed');
      expect(updated.progress.steps[0].aiNotes).toBe('AI Note');
    });

    it('should calculate progress percentage', async () => {
      mockTask.progress.steps = [
        { status: 'completed' },
        { status: 'pending' }
      ];

      const updated = await taskHopper.updateTask('test-task-id', {
        progress: mockTask.progress
      });

      expect(updated.progress.percentComplete).toBe(50);
    });
  });

  describe('Context Management', () => {
    it('should get task context with related tasks', async () => {
      mockTask.context.relatedTasks = ['related-1', 'related-2'];
      mockTask.context.parentTask = 'parent-1';

      const context = await taskHopper.getTaskContext('test-task-id');
      expect(context.task).toBeDefined();
      expect(context.parentTask).toBeDefined();
      expect(context.relatedTasks).toBeDefined();
    });

    it('should handle missing context tasks', async () => {
      taskHopper.Task.findById
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(null);

      const context = await taskHopper.getTaskContext('test-task-id');
      expect(context.relatedTasks).toHaveLength(0);
    });
  });

  describe('Task Querying', () => {
    it('should get user tasks with filter', async () => {
      const tasks = await taskHopper.getUserTasks(userId, {
        status: 'pending'
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('pending');
    });

    it('should get active instructions', async () => {
      const instructions = await taskHopper.getActiveInstructions(userId);
      expect(instructions).toBeDefined();
    });

    it('should search tasks by terms', async () => {
      const tasks = await taskHopper.searchTasks(userId, 'test');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toContain('Test');
    });
  });

  describe('Task Statistics', () => {
    it('should calculate task statistics', async () => {
      const mockTasks = [
        { ...mockTask, status: 'completed', progress: { percentComplete: 100 } },
        { ...mockTask, status: 'in_progress', progress: { percentComplete: 50 } },
        { ...mockTask, status: 'pending', progress: { percentComplete: 0 } }
      ];

      taskHopper.Task.find.mockResolvedValueOnce(mockTasks);

      const stats = await taskHopper.getTaskStats(userId);
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.averageCompletion).toBe(50);
    });

    it('should handle empty task list', async () => {
      taskHopper.Task.find.mockResolvedValueOnce([]);
      
      const stats = await taskHopper.getTaskStats(userId);
      expect(stats.total).toBe(0);
      expect(stats.averageCompletion).toBe(0);
    });
  });

  describe('Active Hopper Management', () => {
    it('should maintain active hopper cache', () => {
      taskHopper.updateActiveHopper(userId, mockTask);
      
      const userHopper = taskHopper.activeHoppers.get(userId);
      expect(userHopper).toBeDefined();
      expect(userHopper.get('test-task-id')).toBeDefined();
    });

    it('should update existing hopper entry', () => {
      taskHopper.updateActiveHopper(userId, mockTask);
      const updatedTask = { ...mockTask, title: 'Updated' };
      taskHopper.updateActiveHopper(userId, updatedTask);

      const userHopper = taskHopper.activeHoppers.get(userId);
      expect(userHopper.get('test-task-id').task.title).toBe('Updated');
    });
  });
});