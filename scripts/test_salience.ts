#!/usr/bin/env npx tsx
/**
 * Standalone test script for salience service
 * Run: npx tsx scripts/test_salience.ts
 *
 * Tests the core logic without requiring MongoDB connection.
 */

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number = 0.01, msg?: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'Assertion failed'}: expected ~${expected}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, msg?: string) {
  if (!condition) {
    throw new Error(msg || 'Expected true');
  }
}

// ============================================================================
// Import the functions we want to test
// (These are pure functions that don't need DB)
// ============================================================================

import {
  ANTICIPATION_THRESHOLDS,
  ANTICIPATION_WINDOWS,
} from '../src/services/salience_service/index';

// Import the anticipation service directly to test internal functions
import {
  calculatePatternConfidence,
  calculateRewardSignal,
  getTimeOfDay,
  getDayName,
  recordPatternFeedback,
  type LearnedPattern,
} from '../src/services/salience_service/anticipation_service';

// ============================================================================
// Tests: Anticipation Service
// ============================================================================

console.log('\n=== Anticipation Service Tests ===\n');

test('THRESHOLDS are correctly defined', () => {
  assertEqual(ANTICIPATION_THRESHOLDS.quickResponse, 0.4, 'quickResponse');
  assertEqual(ANTICIPATION_THRESHOLDS.patternFormation, 0.6, 'patternFormation');
  assertEqual(ANTICIPATION_THRESHOLDS.habitConfirmation, 0.8, 'habitConfirmation');
});

test('WINDOWS are correctly defined (21 days for pattern formation)', () => {
  const twentyOneDays = 21 * 24 * 60 * 60 * 1000;
  assertEqual(ANTICIPATION_WINDOWS.patternFormation, twentyOneDays, '21 days in ms');
});

test('getTimeOfDay returns correct values', () => {
  // Morning: 5-11
  const morning = new Date('2024-01-15T09:00:00');
  assertEqual(getTimeOfDay(morning), 'morning', '9am is morning');

  // Afternoon: 12-16
  const afternoon = new Date('2024-01-15T14:00:00');
  assertEqual(getTimeOfDay(afternoon), 'afternoon', '2pm is afternoon');

  // Evening: 17-20
  const evening = new Date('2024-01-15T19:00:00');
  assertEqual(getTimeOfDay(evening), 'evening', '7pm is evening');

  // Night: 21-4
  const night = new Date('2024-01-15T23:00:00');
  assertEqual(getTimeOfDay(night), 'night', '11pm is night');
});

test('getDayName returns correct day names', () => {
  assertEqual(getDayName(0), 'Sunday');
  assertEqual(getDayName(1), 'Monday');
  assertEqual(getDayName(6), 'Saturday');
});

test('calculatePatternConfidence: Day 1 (brand new pattern)', () => {
  const pattern: LearnedPattern = {
    patternId: 'test1',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 1,
    firstSeen: new Date().toISOString(), // Today
    lastSeen: new Date().toISOString(),
    confidence: 0,
    isFormed: false,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const confidence = calculatePatternConfidence(pattern);
  // Day 1, 1 occurrence: should be at formation threshold + small increment
  // 0.6 + (1/21) * (0.8 - 0.6) = 0.6 + 0.0095 ≈ 0.61
  assertTrue(confidence >= 0.6, 'Should be at least formation threshold');
  assertTrue(confidence < 0.65, 'Should not be too high yet');
});

test('calculatePatternConfidence: Day 10 with daily occurrences', () => {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

  const pattern: LearnedPattern = {
    patternId: 'test2',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 10, // Once per day
    firstSeen: tenDaysAgo.toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0,
    isFormed: false,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const confidence = calculatePatternConfidence(pattern);
  // Still within 21-day formation period
  // 0.6 + (10/21) * 0.2 = 0.6 + 0.095 ≈ 0.70
  assertTrue(confidence > 0.65, 'Should be building confidence');
  assertTrue(confidence < 0.8, 'Should not reach habit confirmation yet');
});

test('calculatePatternConfidence: Day 21 with 21 occurrences (fully formed)', () => {
  const twentyOneDaysAgo = new Date();
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

  const pattern: LearnedPattern = {
    patternId: 'test3',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 21, // Once per day
    firstSeen: twentyOneDaysAgo.toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0,
    isFormed: true,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const confidence = calculatePatternConfidence(pattern);
  // At day 21+, it's consistency-based: (21/21) * 0.8 = 0.8
  assertApprox(confidence, 0.8, 0.05, 'Should be at habit confirmation');
});

test('calculatePatternConfidence: Day 30 with consistent usage', () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const pattern: LearnedPattern = {
    patternId: 'test4',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 30, // Once per day
    firstSeen: thirtyDaysAgo.toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0,
    isFormed: true,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const confidence = calculatePatternConfidence(pattern);
  // (30/30) * 0.8 = 0.8
  assertApprox(confidence, 0.8, 0.05, 'Should maintain high confidence');
});

test('calculateRewardSignal: All positive feedback', () => {
  const pattern: LearnedPattern = {
    patternId: 'test5',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 10,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0.7,
    isFormed: true,
    timesUsed: 10,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const reward = calculateRewardSignal(pattern);
  // (10 * 1.0 + 0 + 0) / 10 = 1.0
  assertEqual(reward, 1.0, 'Perfect positive feedback');
});

test('calculateRewardSignal: All dismissed', () => {
  const pattern: LearnedPattern = {
    patternId: 'test6',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 10,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0.7,
    isFormed: true,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 10,
    rewardSignal: 0,
  };

  const reward = calculateRewardSignal(pattern);
  // (0 + 0 + 10 * -0.5) / 10 = -0.5
  assertEqual(reward, -0.5, 'Consistently dismissed');
});

test('calculateRewardSignal: Mixed feedback', () => {
  const pattern: LearnedPattern = {
    patternId: 'test7',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 10,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0.7,
    isFormed: true,
    timesUsed: 5,     // 5 * 1.0 = 5.0
    timesIgnored: 3,   // 3 * -0.1 = -0.3
    timesDismissed: 2, // 2 * -0.5 = -1.0
    rewardSignal: 0,
  };

  const reward = calculateRewardSignal(pattern);
  // (5.0 - 0.3 - 1.0) / 10 = 0.37
  assertApprox(reward, 0.37, 0.01, 'Mixed feedback');
});

test('calculateRewardSignal: No feedback yet', () => {
  const pattern: LearnedPattern = {
    patternId: 'test8',
    userId: 'user1',
    features: { timeOfDay: 'morning', dayOfWeek: 1 },
    relevantMemoryIds: [],
    relevantPeople: [],
    relevantTopics: [],
    occurrences: 10,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    confidence: 0.7,
    isFormed: true,
    timesUsed: 0,
    timesIgnored: 0,
    timesDismissed: 0,
    rewardSignal: 0,
  };

  const reward = calculateRewardSignal(pattern);
  assertEqual(reward, 0, 'No feedback = neutral');
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
