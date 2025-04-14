import { NightProcessingService } from '../../src/services/nightProcessingService.js';
import modelSelectionService from '../../src/services/modelSelectionService.js';
import mongoose from 'mongoose';

jest.mock('mongoose');
jest.mock('../../src/services/modelSelectionService.js');

describe('NightProcessingService', () => {
  let nightService;
  let mockDate;

  beforeEach(() => {
    // Mock current time to 2 AM (within processing window)
    mockDate = new Date('2025-04-14T02:00:00');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

    // Reset modelSelectionService mocks
    modelSelectionService.taskPatternCache = new Map();
    modelSelectionService.metrics = {
      modelUsage: new Map()
    };

    // Mock mongoose Schema and model
    mongoose.Schema = jest.fn();
    mongoose.model = jest.fn().mockReturnValue({
      findOne: jest.fn(),
      create: jest.fn(),
      find: jest.fn().mockResolvedValue([])
    });

    nightService = new NightProcessingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Processing Window', () => {
    it('should only process during night hours (1 AM - 4 AM)', async () => {
      // Test at 2 AM (should process)
      await nightService.startNightProcessing();
      expect(nightService.isProcessing).toBe(false); // Should be false after completion
      expect(nightService.lastProcessingTime).not.toBeNull();

      // Test at 5 AM (should not process)
      mockDate = new Date('2025-04-14T05:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      await nightService.startNightProcessing();
      expect(nightService.isProcessing).toBe(false);
    });

    it('should prevent concurrent processing', async () => {
      nightService.isProcessing = true;
      await nightService.startNightProcessing();
      expect(nightService.lastProcessingTime).toBeNull();
    });
  });

  describe('Task Pattern Analysis', () => {
    it('should analyze patterns correctly', () => {
      const patterns = [
        { prompt: 'test pattern', timestamp: new Date('2025-04-14T01:00:00') },
        { prompt: 'test pattern', timestamp: new Date('2025-04-14T02:00:00') },
        { prompt: 'another pattern', timestamp: new Date('2025-04-14T03:00:00') }
      ];

      const analysis = nightService.analyzePatterns(patterns);
      expect(analysis.commonPatterns).toContain('test pattern');
      expect(analysis.totalPatterns).toBe(3);
      expect(analysis.timeDistribution).toHaveLength(24);
    });

    it('should update task pattern metrics in MongoDB', async () => {
      const mockTaskPattern = {
        findOne: jest.fn().mockResolvedValue({
          aggregatedMetrics: {},
          save: jest.fn()
        })
      };
      mongoose.model.mockReturnValue(mockTaskPattern);

      const patterns = [
        { prompt: 'test', timestamp: new Date() }
      ];
      await nightService.updateTaskPatternMetrics('test-task', {
        commonPatterns: ['test'],
        totalPatterns: 1
      });

      expect(mockTaskPattern.findOne).toHaveBeenCalled();
    });
  });

  describe('Model Optimization', () => {
    it('should collect and analyze model performance metrics', async () => {
      modelSelectionService.metrics.modelUsage.set('test-model', 10);
      modelSelectionService.getModelState.mockResolvedValue({
        performance: { latency: 100 },
        errors: 1,
        lastUsed: Date.now()
      });

      const metrics = await nightService.getModelPerformanceMetrics();
      expect(metrics['test-model']).toBeDefined();
      expect(metrics['test-model'].usageCount).toBe(10);
      expect(metrics['test-model'].errorRate).toBeDefined();
    });

    it('should update model states based on performance', async () => {
      modelSelectionService.metrics.modelUsage.set('test-model', 10);
      await nightService.optimizeModelSelection();
      expect(modelSelectionService.updateModelState).toHaveBeenCalled();
    });
  });

  describe('Cache Strategy', () => {
    it('should update cache strategies based on task patterns', async () => {
      const mockPatterns = [{
        aggregatedMetrics: {
          commonPatterns: ['test prompt']
        }
      }];

      mongoose.model().find.mockResolvedValue(mockPatterns);
      
      await nightService.updateCacheStrategies();
      expect(modelSelectionService.ensureModel).toHaveBeenCalled();
      expect(modelSelectionService.warmupModel).toHaveBeenCalled();
    });
  });

  describe('Processing Status', () => {
    it('should provide accurate processing status', () => {
      const mockTime = Date.now();
      nightService.lastProcessingTime = mockTime;
      nightService.isProcessing = false;

      const status = nightService.getProcessingStatus();
      expect(status).toEqual({
        isProcessing: false,
        lastProcessingTime: mockTime,
        nextScheduledTime: new Date(mockTime + nightService.processingInterval)
      });
    });

    it('should handle status when never processed', () => {
      const status = nightService.getProcessingStatus();
      expect(status.lastProcessingTime).toBeNull();
      expect(status.nextScheduledTime).toBeNull();
    });
  });

  describe('Time Distribution Analysis', () => {
    it('should calculate hourly distribution of patterns', () => {
      const timestamps = [
        new Date('2025-04-14T01:00:00'),
        new Date('2025-04-14T01:30:00'),
        new Date('2025-04-14T02:00:00')
      ];

      const distribution = nightService.calculateTimeDistribution(timestamps);
      expect(distribution).toHaveLength(24);
      expect(distribution[1]).toBe(2); // Two entries at 1 AM
      expect(distribution[2]).toBe(1); // One entry at 2 AM
    });
  });
});