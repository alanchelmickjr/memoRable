/**
 * @file Tests for Salience Calculator Service
 * Tests the core salience scoring algorithms
 */

import {
  computeSalience,
  calculateDecayModifier,
  calculateRetrievalBoost,
  detectContext,
  buildCaptureContext,
  clearWeightsCache,
} from '../../../src/services/salience_service/salience_calculator';

import type {
  ExtractedFeatures,
  CaptureContext,
  SalienceConfig,
  UserProfile,
} from '../../../src/services/salience_service/models';

// Helper to create minimal extracted features
function createMinimalFeatures(overrides: Partial<ExtractedFeatures> = {}): ExtractedFeatures {
  return {
    emotionalKeywords: [],
    sentimentScore: 0,
    sentimentIntensity: 0,
    peopleMentioned: [],
    relationshipEvents: [],
    topics: [],
    actionItems: [],
    decisions: [],
    moneyMentioned: false,
    conflictPresent: false,
    intimacySignals: false,
    commitments: [],
    datesMentioned: [],
    questionsAsked: [],
    requestsMade: [],
    mutualAgreements: [],
    ...overrides,
  };
}

// Helper to create minimal capture context
function createMinimalContext(overrides: Partial<CaptureContext> = {}): CaptureContext {
  return {
    timeOfDay: 'afternoon',
    dayOfWeek: 'Wednesday',
    timeBucket: 'work_hours',
    detectedContext: 'default',
    ...overrides,
  };
}

describe('Salience Calculator', () => {
  beforeEach(() => {
    clearWeightsCache();
  });

  describe('computeSalience', () => {
    it('should return a score between 0 and 100', () => {
      const features = createMinimalFeatures();
      const context = createMinimalContext();

      const result = computeSalience(features, context);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return all salience components', () => {
      const features = createMinimalFeatures();
      const context = createMinimalContext();

      const result = computeSalience(features, context);

      expect(result.components).toHaveProperty('emotional');
      expect(result.components).toHaveProperty('novelty');
      expect(result.components).toHaveProperty('relevance');
      expect(result.components).toHaveProperty('social');
      expect(result.components).toHaveProperty('consequential');
    });

    it('should include weights used in result', () => {
      const features = createMinimalFeatures();
      const context = createMinimalContext();

      const result = computeSalience(features, context);

      expect(result.weightsUsed).toBeDefined();
      expect(result.weightsUsed.emotional).toBeGreaterThan(0);
      expect(result.weightsUsed.novelty).toBeGreaterThan(0);
    });

    it('should score higher for emotional content', () => {
      const neutralFeatures = createMinimalFeatures();
      const emotionalFeatures = createMinimalFeatures({
        emotionalKeywords: ['death', 'love', 'grief'],
        sentimentIntensity: 0.9,
        sentimentScore: -0.8,
      });
      const context = createMinimalContext();

      const neutralResult = computeSalience(neutralFeatures, context);
      const emotionalResult = computeSalience(emotionalFeatures, context);

      expect(emotionalResult.score).toBeGreaterThan(neutralResult.score);
      expect(emotionalResult.components.emotional).toBeGreaterThan(neutralResult.components.emotional);
    });

    it('should score higher for content with action items', () => {
      const noActionsFeatures = createMinimalFeatures();
      const actionFeatures = createMinimalFeatures({
        actionItems: [
          { description: 'Send report', assignedTo: 'self' },
          { description: 'Review proposal', assignedTo: 'self' },
        ],
        decisions: ['Approved budget', 'Hired new developer'],
      });
      const context = createMinimalContext();

      const noActionsResult = computeSalience(noActionsFeatures, context);
      const actionResult = computeSalience(actionFeatures, context);

      expect(actionResult.score).toBeGreaterThan(noActionsResult.score);
      expect(actionResult.components.consequential).toBeGreaterThan(noActionsResult.components.consequential);
    });

    it('should score higher for social/relationship events', () => {
      const neutralFeatures = createMinimalFeatures();
      const socialFeatures = createMinimalFeatures({
        relationshipEvents: ['marriage', 'promotion'],
        intimacySignals: true,
        peopleMentioned: ['Alice', 'Bob', 'Charlie'],
      });
      const context = createMinimalContext();

      const neutralResult = computeSalience(neutralFeatures, context);
      const socialResult = computeSalience(socialFeatures, context);

      expect(socialResult.score).toBeGreaterThan(neutralResult.score);
      expect(socialResult.components.social).toBeGreaterThan(neutralResult.components.social);
    });

    it('should score higher when money is mentioned', () => {
      const noMoneyFeatures = createMinimalFeatures();
      const moneyFeatures = createMinimalFeatures({
        moneyMentioned: true,
      });
      const context = createMinimalContext();

      const noMoneyResult = computeSalience(noMoneyFeatures, context);
      const moneyResult = computeSalience(moneyFeatures, context);

      expect(moneyResult.components.consequential).toBeGreaterThan(noMoneyResult.components.consequential);
    });

    it('should score higher for conflict presence', () => {
      const noConflictFeatures = createMinimalFeatures();
      const conflictFeatures = createMinimalFeatures({
        conflictPresent: true,
      });
      const context = createMinimalContext();

      const noConflictResult = computeSalience(noConflictFeatures, context);
      const conflictResult = computeSalience(conflictFeatures, context);

      expect(conflictResult.components.social).toBeGreaterThan(noConflictResult.components.social);
    });

    it('should apply context modifiers for work meetings', () => {
      const features = createMinimalFeatures({
        actionItems: [{ description: 'Task', assignedTo: 'self' }],
      });
      const defaultContext = createMinimalContext({ detectedContext: 'default' });
      const workContext = createMinimalContext({ detectedContext: 'work_meeting' });

      const defaultResult = computeSalience(features, defaultContext);
      const workResult = computeSalience(features, workContext);

      // Work context should boost consequential weight
      expect(workResult.weightsUsed.consequential).not.toEqual(defaultResult.weightsUsed.consequential);
    });

    it('should apply context modifiers for social events', () => {
      const features = createMinimalFeatures({
        intimacySignals: true,
        relationshipEvents: ['reunion'],
      });
      const defaultContext = createMinimalContext({ detectedContext: 'default' });
      const socialContext = createMinimalContext({ detectedContext: 'social_event' });

      const defaultResult = computeSalience(features, defaultContext);
      const socialResult = computeSalience(features, socialContext);

      // Social context should boost social weight
      expect(socialResult.weightsUsed.social).not.toEqual(defaultResult.weightsUsed.social);
    });

    it('should include timestamp in result', () => {
      const features = createMinimalFeatures();
      const context = createMinimalContext();

      const result = computeSalience(features, context);

      expect(result.calculatedAt).toBeDefined();
      expect(new Date(result.calculatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('calculateDecayModifier', () => {
    it('should return 1.0 for day 0', () => {
      const modifier = calculateDecayModifier(0);
      expect(modifier).toBe(1.0);
    });

    it('should decay linearly with days', () => {
      const day1 = calculateDecayModifier(1);
      const day10 = calculateDecayModifier(10);

      expect(day1).toBeLessThan(1.0);
      expect(day10).toBeLessThan(day1);
    });

    it('should respect decay floor', () => {
      const config: SalienceConfig = {
        decayRatePerDay: 0.01,
        decayFloor: 0.3,
      };

      // After 100 days, should hit floor
      const modifier = calculateDecayModifier(100, config);

      expect(modifier).toBe(0.3);
    });

    it('should use custom decay rate', () => {
      const slowDecay = calculateDecayModifier(10, { decayRatePerDay: 0.01, decayFloor: 0.3 });
      const fastDecay = calculateDecayModifier(10, { decayRatePerDay: 0.05, decayFloor: 0.3 });

      expect(fastDecay).toBeLessThan(slowDecay);
    });
  });

  describe('calculateRetrievalBoost', () => {
    it('should boost score on first retrieval', () => {
      const original = 50;
      const boosted = calculateRetrievalBoost(original, 0);

      expect(boosted).toBeGreaterThan(original);
    });

    it('should have diminishing returns', () => {
      const original = 50;
      const firstBoost = calculateRetrievalBoost(original, 0) - original;
      const secondBoost = calculateRetrievalBoost(original, 1) - original;
      const thirdBoost = calculateRetrievalBoost(original, 2) - original;

      expect(secondBoost).toBeLessThan(firstBoost);
      expect(thirdBoost).toBeLessThan(secondBoost);
    });

    it('should cap at 100', () => {
      const result = calculateRetrievalBoost(99, 0);

      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('detectContext', () => {
    it('should detect work meeting during work hours on weekday', () => {
      const context = detectContext({
        timeBucket: 'work_hours',
        dayOfWeek: 'Wednesday',
      });

      expect(context).toBe('work_meeting');
    });

    it('should detect social event on weekend', () => {
      const context = detectContext({
        dayOfWeek: 'Saturday',
      });

      expect(context).toBe('social_event');
    });

    it('should detect social event in evening', () => {
      const context = detectContext({
        timeBucket: 'evening',
        dayOfWeek: 'Tuesday',
      });

      expect(context).toBe('social_event');
    });

    it('should return default for unmatched patterns', () => {
      const context = detectContext({});

      expect(context).toBe('default');
    });
  });

  describe('buildCaptureContext', () => {
    it('should determine morning time of day', () => {
      const morning = new Date('2024-01-15T09:00:00');
      const context = buildCaptureContext(morning);

      expect(context.timeOfDay).toBe('morning');
    });

    it('should determine afternoon time of day', () => {
      const afternoon = new Date('2024-01-15T14:00:00');
      const context = buildCaptureContext(afternoon);

      expect(context.timeOfDay).toBe('afternoon');
    });

    it('should determine evening time of day', () => {
      const evening = new Date('2024-01-15T19:00:00');
      const context = buildCaptureContext(evening);

      expect(context.timeOfDay).toBe('evening');
    });

    it('should determine night time of day', () => {
      const night = new Date('2024-01-15T23:00:00');
      const context = buildCaptureContext(night);

      expect(context.timeOfDay).toBe('night');
    });

    it('should set work_hours bucket during business hours', () => {
      const workHours = new Date('2024-01-15T10:00:00'); // Monday at 10am
      const context = buildCaptureContext(workHours);

      expect(context.timeBucket).toBe('work_hours');
    });

    it('should set weekend bucket on Saturday', () => {
      const saturday = new Date('2024-01-13T10:00:00'); // Saturday
      const context = buildCaptureContext(saturday);

      expect(context.timeBucket).toBe('weekend');
    });

    it('should mark unusual time for late night', () => {
      const lateNight = new Date('2024-01-15T03:00:00');
      const context = buildCaptureContext(lateNight);

      expect(context.timeIsUnusual).toBe(true);
    });

    it('should not mark usual time as unusual', () => {
      const normalTime = new Date('2024-01-15T14:00:00');
      const context = buildCaptureContext(normalTime);

      expect(context.timeIsUnusual).toBe(false);
    });

    it('should include location when provided', () => {
      const context = buildCaptureContext(new Date(), 'Office');

      expect(context.location).toBe('Office');
    });

    it('should include new location flag', () => {
      const context = buildCaptureContext(new Date(), 'New Place', true);

      expect(context.locationIsNew).toBe(true);
    });

    it('should detect near holiday for Christmas', () => {
      const nearChristmas = new Date('2024-12-20T10:00:00');
      const context = buildCaptureContext(nearChristmas);

      expect(context.nearHoliday).toBe('christmas');
    });

    it('should detect near holiday for New Year', () => {
      const nearNewYear = new Date('2024-12-28T10:00:00');
      const context = buildCaptureContext(nearNewYear);

      expect(context.nearHoliday).toBe('new_year');
    });
  });

  describe('relevance scoring with user profile', () => {
    it('should boost score when user name is mentioned', () => {
      const userProfile: UserProfile = {
        userId: 'user1',
        name: 'Alice',
        interests: [],
        goals: [],
        closeContacts: [],
        knownContacts: [],
        recentTopics: [],
      };

      const noMentionFeatures = createMinimalFeatures();
      const mentionFeatures = createMinimalFeatures({
        peopleMentioned: ['Alice', 'Bob'],
      });
      const context = createMinimalContext();
      const config: SalienceConfig = {
        decayRatePerDay: 0.01,
        decayFloor: 0.3,
        userProfile,
      };

      const noMentionResult = computeSalience(noMentionFeatures, context, config);
      const mentionResult = computeSalience(mentionFeatures, context, config);

      expect(mentionResult.components.relevance).toBeGreaterThan(noMentionResult.components.relevance);
    });

    it('should boost score when topics match interests', () => {
      const userProfile: UserProfile = {
        userId: 'user1',
        name: 'Alice',
        interests: ['machine learning', 'cooking'],
        goals: [],
        closeContacts: [],
        knownContacts: [],
        recentTopics: [],
      };

      const noMatchFeatures = createMinimalFeatures({
        topics: ['sports', 'weather'],
      });
      const matchFeatures = createMinimalFeatures({
        topics: ['machine learning', 'AI'],
      });
      const context = createMinimalContext();
      const config: SalienceConfig = {
        decayRatePerDay: 0.01,
        decayFloor: 0.3,
        userProfile,
      };

      const noMatchResult = computeSalience(noMatchFeatures, context, config);
      const matchResult = computeSalience(matchFeatures, context, config);

      expect(matchResult.components.relevance).toBeGreaterThan(noMatchResult.components.relevance);
    });

    it('should boost score when close contacts are mentioned', () => {
      const userProfile: UserProfile = {
        userId: 'user1',
        name: 'Alice',
        interests: [],
        goals: [],
        closeContacts: ['Mom', 'Best Friend'],
        knownContacts: ['Mom', 'Best Friend', 'Colleague'],
        recentTopics: [],
      };

      const strangerFeatures = createMinimalFeatures({
        peopleMentioned: ['Random Person'],
      });
      const closeContactFeatures = createMinimalFeatures({
        peopleMentioned: ['Mom'],
      });
      const context = createMinimalContext();
      const config: SalienceConfig = {
        decayRatePerDay: 0.01,
        decayFloor: 0.3,
        userProfile,
      };

      const strangerResult = computeSalience(strangerFeatures, context, config);
      const closeContactResult = computeSalience(closeContactFeatures, context, config);

      expect(closeContactResult.components.relevance).toBeGreaterThan(strangerResult.components.relevance);
    });
  });

  describe('novelty scoring', () => {
    it('should boost novelty for new people', () => {
      const userProfile: UserProfile = {
        userId: 'user1',
        name: 'Alice',
        interests: [],
        goals: [],
        closeContacts: [],
        knownContacts: ['Bob', 'Charlie'],
        recentTopics: [],
      };

      const knownPeopleFeatures = createMinimalFeatures({
        peopleMentioned: ['Bob'],
      });
      const newPeopleFeatures = createMinimalFeatures({
        peopleMentioned: ['Stranger'],
      });
      const context = createMinimalContext();
      const config: SalienceConfig = {
        decayRatePerDay: 0.01,
        decayFloor: 0.3,
        userProfile,
      };

      const knownResult = computeSalience(knownPeopleFeatures, context, config);
      const newResult = computeSalience(newPeopleFeatures, context, config);

      expect(newResult.components.novelty).toBeGreaterThan(knownResult.components.novelty);
    });

    it('should boost novelty for new locations', () => {
      const oldLocationContext = createMinimalContext({ locationIsNew: false });
      const newLocationContext = createMinimalContext({ locationIsNew: true });
      const features = createMinimalFeatures();

      const oldResult = computeSalience(features, oldLocationContext);
      const newResult = computeSalience(features, newLocationContext);

      expect(newResult.components.novelty).toBeGreaterThan(oldResult.components.novelty);
    });

    it('should boost novelty for unusual times', () => {
      const normalContext = createMinimalContext({ timeIsUnusual: false });
      const unusualContext = createMinimalContext({ timeIsUnusual: true });
      const features = createMinimalFeatures();

      const normalResult = computeSalience(features, normalContext);
      const unusualResult = computeSalience(features, unusualContext);

      expect(unusualResult.components.novelty).toBeGreaterThan(normalResult.components.novelty);
    });
  });
});
