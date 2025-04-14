import { ConfidenceService } from '../../src/services/confidenceService.js';
import mongoose from 'mongoose';

jest.mock('mongoose');

describe('ConfidenceService', () => {
  let confidenceService;
  let mockPattern;

  beforeEach(() => {
    mockPattern = {
      userId: 'test-user-id',
      patterns: [{
        type: 'test pattern',
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        lastSeen: new Date(),
        occurrences: 15,
        confidence: 0.7,
        category: 'response'
      }],
      mentalHealth: {
        stress: 30,
        engagement: 80,
        satisfaction: 75,
        lastUpdate: new Date()
      },
      attentionMetrics: {
        focusAreas: new Map([['test', 0.8]]),
        decayRates: new Map([['test', 0.05]]),
        lastCleanup: new Date()
      },
      save: jest.fn().mockResolvedValue(true)
    };

    mongoose.Schema = jest.fn();
    mongoose.model = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(mockPattern),
      create: jest.fn().mockResolvedValue(mockPattern)
    });

    confidenceService = new ConfidenceService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Quick Confidence', () => {
    it('should calculate quick confidence score', async () => {
      const response = 'This is a test pattern response';
      const context = 'test';

      const score = await confidenceService.quick(response, 'test-user-id', context);
      expect(score).toBeGreaterThan(confidenceService.thresholds.quickResponse);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return default confidence for new users', async () => {
      confidenceService.Pattern.findOne.mockResolvedValueOnce(null);
      
      const score = await confidenceService.quick('test response', 'new-user', 'test');
      expect(score).toBe(confidenceService.thresholds.quickResponse);
    });

    it('should handle errors gracefully', async () => {
      confidenceService.Pattern.findOne.mockRejectedValueOnce(new Error('DB Error'));
      
      const score = await confidenceService.quick('test response', 'test-user', 'test');
      expect(score).toBe(confidenceService.thresholds.quickResponse);
    });
  });

  describe('Pattern Tracking', () => {
    it('should track new patterns', async () => {
      const response = 'new pattern response';
      const context = 'test,habit';

      const result = await confidenceService.trackPattern('test-user-id', response, context);
      expect(result).toBe(true);
      expect(mockPattern.save).toHaveBeenCalled();
    });

    it('should update existing patterns', async () => {
      const response = 'test pattern';
      const context = 'test';

      await confidenceService.trackPattern('test-user-id', response, context);
      
      const existingPattern = mockPattern.patterns[0];
      expect(existingPattern.occurrences).toBe(16);
      expect(existingPattern.confidence).toBeGreaterThan(0.7);
    });

    it('should calculate pattern confidence over 21 days', () => {
      const pattern = {
        startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
        occurrences: 30,
        confidence: 0.7
      };

      const confidence = confidenceService.calculatePatternConfidence(pattern);
      expect(confidence).toBeGreaterThan(pattern.confidence);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Mental Health Monitoring', () => {
    it('should calculate mental health factor', () => {
      const metrics = {
        stress: 30,
        engagement: 80,
        satisfaction: 75,
        lastUpdate: new Date()
      };

      const factor = confidenceService.calculateMentalHealthFactor(metrics);
      expect(factor).toBeGreaterThan(1); // Good mental health should boost confidence
      expect(factor).toBeLessThanOrEqual(1.5);
    });

    it('should update mental health metrics', async () => {
      const metrics = {
        stress: 40,
        engagement: 70,
        satisfaction: 65
      };

      const result = await confidenceService.updateMentalHealth('test-user-id', metrics);
      expect(result).toBe(true);
      expect(mockPattern.mentalHealth.stress).toBe(40);
    });

    it('should handle missing mental health data', () => {
      const factor = confidenceService.calculateMentalHealthFactor(null);
      expect(factor).toBe(1); // Default factor when no data
    });
  });

  describe('Attention Metrics', () => {
    it('should calculate attention factor', () => {
      const metrics = {
        focusAreas: new Map([['test', 0.8]]),
        decayRates: new Map([['test', 0.05]]),
        lastCleanup: new Date()
      };

      const factor = confidenceService.calculateAttentionFactor(metrics, 'test');
      expect(factor).toBeGreaterThan(0.5);
      expect(factor).toBeLessThanOrEqual(1);
    });

    it('should update attention metrics', () => {
      const metrics = {
        focusAreas: new Map(),
        decayRates: new Map(),
        lastCleanup: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      };

      confidenceService.updateAttentionMetrics(metrics, 'test,new');
      expect(metrics.focusAreas.get('test')).toBeDefined();
      expect(metrics.decayRates.get('test')).toBeDefined();
    });

    it('should clean up old focus areas', () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const metrics = {
        focusAreas: new Map([['old', 0.1]]),
        decayRates: new Map([['old', 0.5]]),
        lastCleanup: oldDate
      };

      confidenceService.updateAttentionMetrics(metrics, 'new');
      expect(metrics.focusAreas.has('old')).toBe(false);
    });
  });

  describe('Pattern Categorization', () => {
    it('should categorize patterns correctly', () => {
      expect(confidenceService.categorizePattern('test', 'emotional')).toBe('emotional');
      expect(confidenceService.categorizePattern('test', 'habit')).toBe('habit');
      expect(confidenceService.categorizePattern('test', 'cognitive')).toBe('cognitive');
      expect(confidenceService.categorizePattern('test', 'other')).toBe('response');
    });

    it('should extract pattern type', () => {
      const response = 'This is a very long response that should be truncated for pattern matching';
      const pattern = confidenceService.extractPatternType(response);
      expect(pattern.length).toBeLessThanOrEqual(50);
    });
  });
});