/**
 * @file Temporal Decay Service
 *
 * The power to CHOOSE what to forget.
 *
 * Memories fade from ATTENTION, not from STORAGE.
 * This service computes effective salience at query time,
 * factoring in decay (time) and reinforcement (access).
 *
 * No batch jobs. Real-time computation.
 */

import type { SalienceComponents } from './models.js';

// ============================================================================
// Constants
// ============================================================================

/** Decay rate: 1% per day */
export const DECAY_RATE_PER_DAY = 0.01;

/** Minimum decay floor: memories never drop below 30% of original salience */
export const DECAY_FLOOR = 0.3;

/** Access boost: 2% per access */
export const ACCESS_BOOST_RATE = 0.02;

/** Maximum access boost: 50% bonus */
export const MAX_ACCESS_BOOST = 1.5;

/** Attention threshold: memories below this don't surface */
export const ATTENTION_THRESHOLD = 40;

/** High salience: memories above this stay in attention longer */
export const HIGH_SALIENCE_THRESHOLD = 70;

/** Milliseconds in a day */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ============================================================================
// Core Decay Functions
// ============================================================================

/**
 * Compute decay modifier based on age.
 *
 * @param daysOld - Days since memory creation
 * @returns Decay modifier (0.3 to 1.0)
 */
export function computeDecayModifier(daysOld: number): number {
  const decay = 1.0 - (daysOld * DECAY_RATE_PER_DAY);
  return Math.max(DECAY_FLOOR, decay);
}

/**
 * Compute access boost based on retrieval count.
 * Diminishing returns - first accesses matter most.
 *
 * @param accessCount - Number of times memory was accessed
 * @returns Access boost modifier (1.0 to MAX_ACCESS_BOOST)
 */
export function computeAccessBoost(accessCount: number): number {
  const boost = 1.0 + (accessCount * ACCESS_BOOST_RATE);
  return Math.min(MAX_ACCESS_BOOST, boost);
}

/**
 * Compute effective salience at query time.
 * Does NOT update database - pure computation.
 *
 * Formula: effective = base * decay * boost
 *
 * @param baseSalience - Original salience score (0-100)
 * @param createdAt - When memory was created
 * @param accessCount - Number of times accessed
 * @returns Effective salience score (0-100)
 */
export function computeEffectiveSalience(
  baseSalience: number,
  createdAt: Date,
  accessCount: number = 0
): number {
  const daysOld = (Date.now() - createdAt.getTime()) / MS_PER_DAY;

  const decayModifier = computeDecayModifier(daysOld);
  const accessBoost = computeAccessBoost(accessCount);

  // Apply both modifiers
  const effective = baseSalience * decayModifier * accessBoost;

  // Cap at 100
  return Math.min(100, Math.round(effective));
}

/**
 * Compute effective salience from a memory object.
 * Convenience wrapper for common use case.
 *
 * @param memory - Memory object with required fields
 * @returns Effective salience score
 */
export function computeEffectiveSalienceFromMemory(memory: {
  salienceScore?: number;
  salience?: { score?: number };
  createdAt?: Date | string;
  accessCount?: number;
}): number {
  const baseSalience = memory.salienceScore
    ?? memory.salience?.score
    ?? 50; // Default to medium salience

  const createdAt = memory.createdAt
    ? (typeof memory.createdAt === 'string' ? new Date(memory.createdAt) : memory.createdAt)
    : new Date(); // Default to now (no decay)

  const accessCount = memory.accessCount ?? 0;

  return computeEffectiveSalience(baseSalience, createdAt, accessCount);
}

// ============================================================================
// Attention Threshold Functions
// ============================================================================

/**
 * Check if memory should be in attention window.
 *
 * @param effectiveSalience - Current effective salience
 * @returns true if should be surfaced
 */
export function shouldBeInAttention(effectiveSalience: number): boolean {
  return effectiveSalience >= ATTENTION_THRESHOLD;
}

/**
 * Check if memory is high-salience (longer attention retention).
 *
 * @param effectiveSalience - Current effective salience
 * @returns true if high-salience
 */
export function isHighSalience(effectiveSalience: number): boolean {
  return effectiveSalience >= HIGH_SALIENCE_THRESHOLD;
}

/**
 * Estimate days until memory fades from attention.
 * Useful for showing "fading soon" indicators.
 *
 * @param baseSalience - Original salience
 * @param currentDaysOld - Current age in days
 * @param accessCount - Access count
 * @returns Days until below threshold (or Infinity if floor prevents it)
 */
export function daysUntilFade(
  baseSalience: number,
  currentDaysOld: number,
  accessCount: number = 0
): number {
  const accessBoost = computeAccessBoost(accessCount);
  const effectiveBase = baseSalience * accessBoost;

  // Check if floor prevents fade
  const floorSalience = effectiveBase * DECAY_FLOOR;
  if (floorSalience >= ATTENTION_THRESHOLD) {
    return Infinity; // Will never fade due to floor
  }

  // Calculate days until threshold
  // threshold = base * accessBoost * (1 - days * rate)
  // Solving for days: days = (1 - threshold / (base * boost)) / rate
  const targetDecay = ATTENTION_THRESHOLD / effectiveBase;
  const daysTotal = (1 - targetDecay) / DECAY_RATE_PER_DAY;

  return Math.max(0, Math.ceil(daysTotal - currentDaysOld));
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Compute effective salience for multiple memories.
 * Efficient batch operation for attention refresh.
 *
 * @param memories - Array of memory objects
 * @returns Array of { memoryId, effectiveSalience }
 */
export function batchComputeEffectiveSalience(
  memories: Array<{
    memoryId: string;
    salienceScore?: number;
    salience?: { score?: number };
    createdAt?: Date | string;
    accessCount?: number;
  }>
): Array<{ memoryId: string; effectiveSalience: number; inAttention: boolean }> {
  return memories.map(memory => {
    const effectiveSalience = computeEffectiveSalienceFromMemory(memory);
    return {
      memoryId: memory.memoryId,
      effectiveSalience,
      inAttention: shouldBeInAttention(effectiveSalience),
    };
  });
}

// ============================================================================
// Context-Aware Decay
// ============================================================================

/**
 * Apply context relevance modifier to effective salience.
 * When context matches memory content, decay slows.
 *
 * @param effectiveSalience - Base effective salience
 * @param contextRelevance - How relevant to current context (0-1)
 * @returns Adjusted effective salience
 */
export function applyContextRelevance(
  effectiveSalience: number,
  contextRelevance: number
): number {
  // Context relevance boosts up to 20%
  const contextBoost = 1 + (contextRelevance * 0.2);
  return Math.min(100, Math.round(effectiveSalience * contextBoost));
}

/**
 * Compute context relevance score.
 * Compares memory content/tags to current context frame.
 *
 * @param memoryTopics - Topics from memory
 * @param memoryPeople - People from memory
 * @param contextTopics - Current context topics
 * @param contextPeople - Current context people
 * @returns Relevance score (0-1)
 */
export function computeContextRelevance(
  memoryTopics: string[] = [],
  memoryPeople: string[] = [],
  contextTopics: string[] = [],
  contextPeople: string[] = []
): number {
  let matches = 0;
  let total = 0;

  // Check topic overlap
  if (contextTopics.length > 0 && memoryTopics.length > 0) {
    const contextSet = new Set(contextTopics.map(t => t.toLowerCase()));
    for (const topic of memoryTopics) {
      total++;
      if (contextSet.has(topic.toLowerCase())) {
        matches++;
      }
    }
  }

  // Check people overlap (weighted higher - social significance)
  if (contextPeople.length > 0 && memoryPeople.length > 0) {
    const contextSet = new Set(contextPeople.map(p => p.toLowerCase()));
    for (const person of memoryPeople) {
      total += 2; // People matches count double
      if (contextSet.has(person.toLowerCase())) {
        matches += 2;
      }
    }
  }

  if (total === 0) return 0;
  return matches / total;
}
