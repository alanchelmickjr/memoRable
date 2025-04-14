import { ResponseRefinementService } from '../../src/services/responseRefinementService.js';
import identityService from '../../src/services/identityService.js';
import modelSelectionService from '../../src/services/modelSelectionService.js';
import mongoose from 'mongoose';

jest.mock('../../src/services/identityService.js');
jest.mock('../../src/services/modelSelectionService.js');
jest.mock('mongoose');

describe('ResponseRefinementService', () => {
  let responseService;
  let mockResponse;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      _id: 'test-user-id',
      preferences: {
        likes: ['positive', 'helpful'],
        dislikes: ['negative', 'harmful'],
        cares: ['environment', 'health'],
        wants: ['peace', 'progress'],
        peeves: ['rudeness', 'confusion'],
        priorities: ['accuracy', 'clarity']
      }
    };

    mockResponse = {
      _id: 'test-response-id',
      userId: mockUser._id,
      originalResponse: 'Original test response',
      refinedResponse: 'Refined test response',
      context: {
        messageStream: ['Hello', 'Test message'],
        timestamp: new Date(),
        preferences: mockUser.preferences
      },
      refinements: [],
      status: 'active',
      save: jest.fn().mockResolvedValue(true)
    };

    mongoose.Schema = jest.fn();
    mongoose.model = jest.fn().mockReturnValue({
      create: jest.fn().mockResolvedValue(mockResponse),
      findById: jest.fn().mockResolvedValue(mockResponse),
      find: jest.fn().mockResolvedValue([mockResponse])
    });

    identityService.getPreferences.mockResolvedValue(mockUser.preferences);
    modelSelectionService.getMemoizedResponse.mockResolvedValue(null);
    modelSelectionService.memoizeResponse.mockResolvedValue(true);

    responseService = new ResponseRefinementService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Response Refinement', () => {
    it('should refine response based on user preferences', async () => {
      const originalResponse = 'This is a negative and harmful response';
      const result = await responseService.refineResponse(
        mockUser._id,
        originalResponse,
        ['Hello', 'Test message']
      );

      expect(result.content).toContain('[FILTERED]');
      expect(result.refinements.length).toBeGreaterThan(0);
      expect(result.refinements[0].type).toBe('preference');
    });

    it('should handle missing user preferences', async () => {
      identityService.getPreferences.mockResolvedValueOnce(null);
      const originalResponse = 'Test response';
      const result = await responseService.refineResponse(
        'invalid-user',
        originalResponse,
        ['Hello']
      );

      expect(result.content).toBe(originalResponse);
      expect(result.refinements).toEqual([]);
    });

    it('should apply learned patterns when available', async () => {
      const cachedResponse = 'Cached pattern response';
      modelSelectionService.getMemoizedResponse.mockResolvedValueOnce(cachedResponse);

      const result = await responseService.refineResponse(
        mockUser._id,
        'Original response',
        ['Hello', 'Test message']
      );

      expect(result.content).toBe(cachedResponse);
      expect(result.refinements[0].type).toBe('pattern');
    });
  });

  describe('Preference Filtering', () => {
    it('should reinforce positive preferences', async () => {
      const response = 'This is a positive and helpful response';
      const refinements = [];

      const refined = await responseService.applyPreferenceFilters(
        response,
        mockUser.preferences,
        refinements
      );

      expect(refined).toBe(response);
      expect(refinements.length).toBe(2); // One for each matched like
      expect(refinements[0].type).toBe('preference');
    });

    it('should filter out negative preferences', async () => {
      const response = 'This contains negative and harmful content';
      const refinements = [];

      const refined = await responseService.applyPreferenceFilters(
        response,
        mockUser.preferences,
        refinements
      );

      expect(refined).not.toBe(response);
      expect(refined).toContain('[FILTERED]');
      expect(refinements.length).toBe(2); // One for each matched dislike
    });

    it('should handle user peeves', async () => {
      const response = 'This response is rude and causes confusion';
      const refinements = [];

      const refined = await responseService.applyPreferenceFilters(
        response,
        mockUser.preferences,
        refinements
      );

      expect(refined).toContain('[ADJUSTED]');
      expect(refinements.length).toBe(2); // One for each matched peeve
    });
  });

  describe('Response Updates', () => {
    it('should update active responses', async () => {
      responseService.activeResponses.set('test-response-id', {
        response: mockResponse,
        timestamp: Date.now()
      });

      const result = await responseService.updateResponse(
        'test-response-id',
        'Updated response',
        'Better answer found'
      );

      expect(result).toBe(true);
      expect(mockResponse.status).toBe('updated');
      expect(mockResponse.refinements[0].type).toBe('improvement');
    });

    it('should handle updates for expired responses', async () => {
      const result = await responseService.updateResponse(
        'expired-response-id',
        'Updated response',
        'Better answer found'
      );

      expect(result).toBe(false);
    });

    it('should retract responses', async () => {
      const result = await responseService.retractResponse(
        'test-response-id',
        'Incorrect information'
      );

      expect(result).toBe(true);
      expect(mockResponse.status).toBe('retracted');
      expect(mockResponse.refinements[0].type).toBe('retraction');
    });
  });

  describe('Response History', () => {
    it('should fetch recent response history', async () => {
      const history = await responseService.getResponseHistory(mockUser._id);
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe(mockUser._id);
    });

    it('should handle errors in history fetch', async () => {
      responseService.Response.find.mockRejectedValueOnce(new Error('DB Error'));
      const history = await responseService.getResponseHistory(mockUser._id);
      expect(history).toEqual([]);
    });
  });

  describe('Cache Management', () => {
    it('should clean up old responses', () => {
      const oldTimestamp = Date.now() - (responseService.responseWindow + 1000);
      responseService.activeResponses.set('old-response', {
        response: mockResponse,
        timestamp: oldTimestamp
      });

      responseService.cleanupOldResponses();
      expect(responseService.activeResponses.has('old-response')).toBe(false);
    });

    it('should keep recent responses', () => {
      const recentTimestamp = Date.now() - 1000;
      responseService.activeResponses.set('recent-response', {
        response: mockResponse,
        timestamp: recentTimestamp
      });

      responseService.cleanupOldResponses();
      expect(responseService.activeResponses.has('recent-response')).toBe(true);
    });
  });
});