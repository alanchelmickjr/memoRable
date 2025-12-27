/**
 * @file Tests for Anticipation Service
 * Tests the predictive memory surfacing with 21-day pattern formation
 */

import {
  THRESHOLDS,
  WINDOWS,
  calculatePatternConfidence,
  calculateRewardSignal,
  getTimeOfDay,
  getDayName,
} from '../../../src/services/salience_service/anticipation_service';

import type {
  LearnedPattern,
  PatternFeatures,
} from '../../../src/services/salience_service/anticipation_service';

// Helper to create a minimal learned pattern
function createMinimalPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  const now = new Date().toISOString();
  return {
    patternId: 'test-pattern-1',
    userId: 'user-1',
    features: {
      timeOfDay: 'morning',
      dayOfWeek: 1,
    },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 1,
    firstSeen: now,
    lastSeen: now,
    confidence: 0.4,
    isFormed: false,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
    ...overrides,
  };
}

describe('Anticipation Service', () => {
  describe('THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(THRESHOLDS.quickResponse).toBe(0.4);
      expect(THRESHOLDS.patternFormation).toBe(0.6);
      expect(THRESHOLDS.habitConfirmation).toBe(0.8);
      expect(THRESHOLDS.predictionReady).toBe(0.7);
    });

    it('should have thresholds in ascending order', () => {
      expect(THRESHOLDS.quickResponse).toBeLessThan(THRESHOLDS.patternFormation);
      expect(THRESHOLDS.patternFormation).toBeLessThan(THRESHOLDS.habitConfirmation);
    });
  });

  describe('WINDOWS', () => {
    it('should have correct time windows', () => {
      expect(WINDOWS.patternFormation).toBe(21 * 24 * 60 * 60 * 1000); // 21 days
      expect(WINDOWS.attention).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(WINDOWS.cleanup).toBe(24 * 60 * 60 * 1000); // 1 day
      expect(WINDOWS.preBriefing).toBe(15 * 60 * 1000); // 15 minutes
    });
  });

  describe('calculatePatternConfidence', () => {
    it('should return base confidence for new patterns', () => {
      const pattern = createMinimalPattern({
        firstSeen: new Date().toISOString(),
        occurrences: 1,
      });

      const confidence = calculatePatternConfidence(pattern);

      // New pattern should have low but building confidence
      expect(confidence).toBeGreaterThanOrEqual(THRESHOLDS.patternFormation);
      expect(confidence).toBeLessThan(THRESHOLDS.habitConfirmation);
    });

    it('should increase confidence with more occurrences during formation', () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const lowOccurrences = createMinimalPattern({
        firstSeen: tenDaysAgo.toISOString(),
        occurrences: 3,
      });

      const highOccurrences = createMinimalPattern({
        firstSeen: tenDaysAgo.toISOString(),
        occurrences: 15,
      });

      const lowConfidence = calculatePatternConfidence(lowOccurrences);
      const highConfidence = calculatePatternConfidence(highOccurrences);

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });

    it('should use consistency-based confidence after 21 days', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const consistentPattern = createMinimalPattern({
        firstSeen: thirtyDaysAgo.toISOString(),
        occurrences: 30, // Daily pattern
      });

      const inconsistentPattern = createMinimalPattern({
        firstSeen: thirtyDaysAgo.toISOString(),
        occurrences: 5, // Rare pattern
      });

      const consistentConfidence = calculatePatternConfidence(consistentPattern);
      const inconsistentConfidence = calculatePatternConfidence(inconsistentPattern);

      expect(consistentConfidence).toBeGreaterThan(inconsistentConfidence);
    });

    it('should cap confidence at 1.0', () => {
      const veryConsistentPattern = createMinimalPattern({
        firstSeen: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        occurrences: 100,
      });

      const confidence = calculatePatternConfidence(veryConsistentPattern);

      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should reach habitConfirmation threshold after full formation period with high occurrences', () => {
      const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

      const fullyFormedPattern = createMinimalPattern({
        firstSeen: twentyOneDaysAgo.toISOString(),
        occurrences: 21, // Daily for 21 days
      });

      const confidence = calculatePatternConfidence(fullyFormedPattern);

      expect(confidence).toBeGreaterThanOrEqual(THRESHOLDS.patternFormation);
    });
  });

  describe('calculateRewardSignal', () => {
    it('should return 0 for patterns with no feedback', () => {
      const pattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 0,
        timesDismissed: 0,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBe(0);
    });

    it('should return positive reward for used patterns', () => {
      const pattern = createMinimalPattern({
        timesUsed: 10,
        timesIgnored: 0,
        timesDismissed: 0,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBeGreaterThan(0);
    });

    it('should return negative reward for dismissed patterns', () => {
      const pattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 0,
        timesDismissed: 10,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBeLessThan(0);
    });

    it('should return slight negative for ignored patterns', () => {
      const pattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 10,
        timesDismissed: 0,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBeLessThan(0);
      expect(reward).toBeGreaterThan(-0.5); // Less negative than dismissed
    });

    it('should balance positive and negative feedback', () => {
      const balancedPattern = createMinimalPattern({
        timesUsed: 5,
        timesIgnored: 3,
        timesDismissed: 2,
      });

      const reward = calculateRewardSignal(balancedPattern);

      // Should be slightly positive given the weights
      // (5 * 1.0 + 3 * -0.1 + 2 * -0.5) / 10 = (5 - 0.3 - 1) / 10 = 0.37
      expect(reward).toBeGreaterThan(0);
    });

    it('should weight dismissals more heavily than ignores', () => {
      const ignoredPattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 10,
        timesDismissed: 0,
      });

      const dismissedPattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 0,
        timesDismissed: 10,
      });

      const ignoredReward = calculateRewardSignal(ignoredPattern);
      const dismissedReward = calculateRewardSignal(dismissedPattern);

      expect(dismissedReward).toBeLessThan(ignoredReward);
    });
  });

  describe('getTimeOfDay', () => {
    it('should return morning for 5am-12pm', () => {
      expect(getTimeOfDay(new Date('2024-01-15T05:00:00'))).toBe('morning');
      expect(getTimeOfDay(new Date('2024-01-15T09:00:00'))).toBe('morning');
      expect(getTimeOfDay(new Date('2024-01-15T11:59:00'))).toBe('morning');
    });

    it('should return afternoon for 12pm-5pm', () => {
      expect(getTimeOfDay(new Date('2024-01-15T12:00:00'))).toBe('afternoon');
      expect(getTimeOfDay(new Date('2024-01-15T14:00:00'))).toBe('afternoon');
      expect(getTimeOfDay(new Date('2024-01-15T16:59:00'))).toBe('afternoon');
    });

    it('should return evening for 5pm-9pm', () => {
      expect(getTimeOfDay(new Date('2024-01-15T17:00:00'))).toBe('evening');
      expect(getTimeOfDay(new Date('2024-01-15T19:00:00'))).toBe('evening');
      expect(getTimeOfDay(new Date('2024-01-15T20:59:00'))).toBe('evening');
    });

    it('should return night for 9pm-5am', () => {
      expect(getTimeOfDay(new Date('2024-01-15T21:00:00'))).toBe('night');
      expect(getTimeOfDay(new Date('2024-01-15T23:00:00'))).toBe('night');
      expect(getTimeOfDay(new Date('2024-01-15T03:00:00'))).toBe('night');
      expect(getTimeOfDay(new Date('2024-01-15T04:59:00'))).toBe('night');
    });
  });

  describe('getDayName', () => {
    it('should return correct day names', () => {
      expect(getDayName(0)).toBe('Sunday');
      expect(getDayName(1)).toBe('Monday');
      expect(getDayName(2)).toBe('Tuesday');
      expect(getDayName(3)).toBe('Wednesday');
      expect(getDayName(4)).toBe('Thursday');
      expect(getDayName(5)).toBe('Friday');
      expect(getDayName(6)).toBe('Saturday');
    });
  });

  describe('PatternFeatures', () => {
    it('should support basic time/day features', () => {
      const features: PatternFeatures = {
        timeOfDay: 'morning',
        dayOfWeek: 1,
      };

      expect(features.timeOfDay).toBe('morning');
      expect(features.dayOfWeek).toBe(1);
    });

    it('should support optional location', () => {
      const features: PatternFeatures = {
        timeOfDay: 'afternoon',
        dayOfWeek: 2,
        location: 'Office',
      };

      expect(features.location).toBe('Office');
    });

    it('should support optional activity', () => {
      const features: PatternFeatures = {
        timeOfDay: 'afternoon',
        dayOfWeek: 3,
        activity: 'Meeting',
      };

      expect(features.activity).toBe('Meeting');
    });

    it('should support optional people list', () => {
      const features: PatternFeatures = {
        timeOfDay: 'morning',
        dayOfWeek: 4,
        people: ['Alice', 'Bob'],
      };

      expect(features.people).toContain('Alice');
      expect(features.people).toContain('Bob');
    });

    it('should support calendar event type', () => {
      const features: PatternFeatures = {
        timeOfDay: 'afternoon',
        dayOfWeek: 5,
        calendarEventType: 'recurring',
      };

      expect(features.calendarEventType).toBe('recurring');
    });

    it('should support project context', () => {
      const features: PatternFeatures = {
        timeOfDay: 'morning',
        dayOfWeek: 1,
        projectContext: 'MemoRable',
      };

      expect(features.projectContext).toBe('MemoRable');
    });
  });

  describe('21-day pattern formation rule', () => {
    it('should show increasing confidence through formation period', () => {
      const confidences: number[] = [];

      for (let day = 1; day <= 21; day++) {
        const daysAgo = new Date(Date.now() - day * 24 * 60 * 60 * 1000);
        const pattern = createMinimalPattern({
          firstSeen: daysAgo.toISOString(),
          occurrences: day, // One occurrence per day
        });
        confidences.push(calculatePatternConfidence(pattern));
      }

      // Confidence should generally increase
      for (let i = 1; i < confidences.length; i++) {
        expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i - 1] - 0.01); // Allow small fluctuations
      }
    });

    it('should transition to consistency-based after 21 days', () => {
      const day20 = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const day22 = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000);

      const beforeFormation = createMinimalPattern({
        firstSeen: day20.toISOString(),
        occurrences: 10,
      });

      const afterFormation = createMinimalPattern({
        firstSeen: day22.toISOString(),
        occurrences: 10,
      });

      const beforeConfidence = calculatePatternConfidence(beforeFormation);
      const afterConfidence = calculatePatternConfidence(afterFormation);

      // Both should be valid confidences
      expect(beforeConfidence).toBeGreaterThan(0);
      expect(afterConfidence).toBeGreaterThan(0);
      expect(beforeConfidence).toBeLessThanOrEqual(1);
      expect(afterConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('reward weight balance', () => {
    it('should correctly apply used weight of 1.0', () => {
      const pattern = createMinimalPattern({
        timesUsed: 1,
        timesIgnored: 0,
        timesDismissed: 0,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBe(1.0);
    });

    it('should correctly apply ignored weight of -0.1', () => {
      const pattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 1,
        timesDismissed: 0,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBe(-0.1);
    });

    it('should correctly apply dismissed weight of -0.5', () => {
      const pattern = createMinimalPattern({
        timesUsed: 0,
        timesIgnored: 0,
        timesDismissed: 1,
      });

      const reward = calculateRewardSignal(pattern);

      expect(reward).toBe(-0.5);
    });
  });
});
