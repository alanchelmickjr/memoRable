/**
 * @file Salience Calculator Service
 * Computes memory salience scores at capture time using observable signals.
 *
 * Key insight: Humans calculate salience at encoding time, not during sleep.
 * The emotional spike happens when the thing happens.
 *
 * Cost: ~$0.003 per memory (single Haiku call + computation)
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SalienceScore,
  SalienceComponents,
  SalienceWeights,
  ExtractedFeatures,
  CaptureContext,
  ContextType,
  UserProfile,
  LLMExtractionResponse,
} from './models';
import {
  DEFAULT_SALIENCE_WEIGHTS,
  CONTEXT_WEIGHT_MODIFIERS,
} from './models';
import { collections } from './database';

/**
 * Configuration for salience calculation.
 */
export interface SalienceConfig {
  /** Decay rate per day (default 0.01 = 1% per day) */
  decayRatePerDay: number;
  /** Minimum decay floor (default 0.3 = never below 30%) */
  decayFloor: number;
  /** User profile for relevance calculation */
  userProfile?: UserProfile;
  /** Override context detection */
  forceContext?: ContextType;
}

const DEFAULT_CONFIG: SalienceConfig = {
  decayRatePerDay: 0.01,
  decayFloor: 0.3,
};

/**
 * Compute salience score from extracted features.
 */
export function computeSalience(
  features: ExtractedFeatures,
  context: CaptureContext,
  config: SalienceConfig = DEFAULT_CONFIG
): SalienceScore {
  // Get base weights (potentially learned for this user)
  let weights = { ...DEFAULT_SALIENCE_WEIGHTS };

  // Apply context-dependent modifiers
  const contextModifiers = CONTEXT_WEIGHT_MODIFIERS[config.forceContext || context.detectedContext];
  weights = applyContextModifiers(weights, contextModifiers);

  // Calculate individual components (each 0-100)
  const components = calculateComponents(features, context, config.userProfile);

  // Weighted sum
  const rawScore =
    components.emotional * weights.emotional +
    components.novelty * weights.novelty +
    components.relevance * weights.relevance +
    components.social * weights.social +
    components.consequential * weights.consequential;

  return {
    score: Math.round(Math.min(100, Math.max(0, rawScore))),
    components,
    weightsUsed: weights,
    captureContext: context,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate individual salience components from features.
 */
function calculateComponents(
  features: ExtractedFeatures,
  context: CaptureContext,
  userProfile?: UserProfile
): SalienceComponents {
  return {
    emotional: calculateEmotionalScore(features),
    novelty: calculateNoveltyScore(features, context, userProfile),
    relevance: calculateRelevanceScore(features, userProfile),
    social: calculateSocialScore(features),
    consequential: calculateConsequentialScore(features),
  };
}

/**
 * Emotional Arousal (0-100)
 * High emotion = better encoding. The amygdala tags experiences with intensity.
 */
function calculateEmotionalScore(features: ExtractedFeatures): number {
  let score = 0;

  // Emotional keywords: death, love, conflict, celebration, etc.
  // Each keyword adds 15 points, capped at 60
  score += Math.min(60, features.emotionalKeywords.length * 15);

  // Sentiment intensity (0-1) contributes up to 40 points
  score += features.sentimentIntensity * 40;

  // Extreme sentiment (very positive or very negative) adds bonus
  const sentimentExtreme = Math.abs(features.sentimentScore);
  if (sentimentExtreme > 0.7) {
    score += 10;
  }

  // Intimacy signals indicate emotional significance
  if (features.intimacySignals) {
    score += 15;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Novelty (0-100)
 * New experiences get priority. Brain asks: "Have I seen this before?"
 */
function calculateNoveltyScore(
  features: ExtractedFeatures,
  context: CaptureContext,
  userProfile?: UserProfile
): number {
  let score = 0;

  // New people (not in known contacts)
  if (userProfile?.knownContacts) {
    for (const person of features.peopleMentioned) {
      const isKnown = userProfile.knownContacts.some(
        (c) => c.toLowerCase() === person.toLowerCase()
      );
      if (!isKnown) {
        score += 25; // New person bonus
      }
    }
  } else {
    // Without profile, assume some novelty for any people mentioned
    score += Math.min(30, features.peopleMentioned.length * 10);
  }

  // New location
  if (context.locationIsNew) {
    score += 25;
  }

  // Unusual time (outside 8am-10pm)
  if (context.timeIsUnusual) {
    score += 20;
  }

  // Semantic novelty: topics not discussed recently
  if (userProfile?.recentTopics && features.topics.length > 0) {
    const novelTopics = features.topics.filter(
      (topic) =>
        !userProfile.recentTopics.some(
          (recent) => recent.toLowerCase().includes(topic.toLowerCase())
        )
    );
    // Novel topics contribute up to 30 points
    score += Math.min(30, novelTopics.length * 10);
  } else {
    // Without recent topics data, give baseline novelty for any topics
    score += Math.min(20, features.topics.length * 5);
  }

  return Math.min(100, Math.round(score));
}

/**
 * Personal Relevance (0-100)
 * Things that relate to identity, goals, or relationships.
 */
function calculateRelevanceScore(
  features: ExtractedFeatures,
  userProfile?: UserProfile
): number {
  let score = 0;

  // User name mentioned (if we have it)
  if (userProfile?.name) {
    const nameMentioned = features.peopleMentioned.some(
      (p) => p.toLowerCase() === userProfile.name.toLowerCase()
    );
    if (nameMentioned) {
      score += 30;
    }
  }

  // Topics match user interests
  if (userProfile?.interests && features.topics.length > 0) {
    const matchingTopics = features.topics.filter((topic) =>
      userProfile.interests.some(
        (interest) =>
          interest.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(interest.toLowerCase())
      )
    );
    score += Math.min(30, matchingTopics.length * 15);
  }

  // Close contacts mentioned
  if (userProfile?.closeContacts && features.peopleMentioned.length > 0) {
    const closeOnes = features.peopleMentioned.filter((person) =>
      userProfile.closeContacts.some(
        (close) => close.toLowerCase() === person.toLowerCase()
      )
    );
    score += Math.min(40, closeOnes.length * 20);
  }

  // Goals mentioned
  if (userProfile?.goals && features.topics.length > 0) {
    const goalRelated = features.topics.filter((topic) =>
      userProfile.goals.some(
        (goal) =>
          goal.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(goal.toLowerCase())
      )
    );
    score += Math.min(30, goalRelated.length * 15);
  }

  // Without user profile, base relevance on signal density
  if (!userProfile) {
    // Action items involving self indicate relevance
    const selfActions = features.actionItems.filter(
      (item) => item.assignedTo === 'self' || item.assignedTo === 'mutual'
    );
    score += Math.min(30, selfActions.length * 15);

    // Commitments made indicate relevance
    const commitmentsMade = features.commitments.filter((c) => c.type === 'made');
    score += Math.min(30, commitmentsMade.length * 15);
  }

  return Math.min(100, Math.round(score));
}

/**
 * Social Significance (0-100)
 * Other humans matter. Status changes in social network are high priority.
 */
function calculateSocialScore(features: ExtractedFeatures): number {
  let score = 0;

  // Relationship events (death, marriage, promotion, etc.)
  // Each event adds 30 points, capped at 60
  score += Math.min(60, features.relationshipEvents.length * 30);

  // Conflict present
  if (features.conflictPresent) {
    score += 25;
  }

  // Intimacy signals (vulnerability, deep sharing, attraction)
  if (features.intimacySignals) {
    score += 35;
  }

  // Multiple people mentioned suggests social context
  if (features.peopleMentioned.length >= 3) {
    score += 10;
  }

  // Mutual agreements indicate social contract
  score += Math.min(20, features.mutualAgreements.length * 10);

  return Math.min(100, Math.round(score));
}

/**
 * Consequentiality (0-100)
 * Things with downstream effects matter more than isolated events.
 */
function calculateConsequentialScore(features: ExtractedFeatures): number {
  let score = 0;

  // Action items: each adds 20 points, capped at 60
  score += Math.min(60, features.actionItems.length * 20);

  // Decisions made or discussed
  score += Math.min(40, features.decisions.length * 20);

  // Money mentioned implies stakes
  if (features.moneyMentioned) {
    score += 20;
  }

  // Commitments (both made and received) have consequences
  score += Math.min(40, features.commitments.length * 15);

  // Deadlines mentioned
  const explicitDeadlines = features.datesMentioned.filter((d) => d.type === 'deadline');
  score += Math.min(20, explicitDeadlines.length * 10);

  return Math.min(100, Math.round(score));
}

/**
 * Apply context modifiers to base weights.
 */
function applyContextModifiers(
  baseWeights: SalienceWeights,
  modifiers: Record<string, number> = {}
): SalienceWeights {
  const adjusted: SalienceWeights = {
    emotional: baseWeights.emotional * (modifiers.emotional || 1.0),
    novelty: baseWeights.novelty * (modifiers.novelty || 1.0),
    relevance: baseWeights.relevance * (modifiers.relevance || 1.0),
    social: baseWeights.social * (modifiers.social || 1.0),
    consequential: baseWeights.consequential * (modifiers.consequential || 1.0),
  };

  // Normalize so weights sum to 1
  const total = Object.values(adjusted).reduce((sum, w) => sum + w, 0);
  return {
    emotional: adjusted.emotional / total,
    novelty: adjusted.novelty / total,
    relevance: adjusted.relevance / total,
    social: adjusted.social / total,
    consequential: adjusted.consequential / total,
  };
}

/**
 * Calculate decay modifier based on age.
 * Recent memories get a boost, older ones decay unless reinforced.
 */
export function calculateDecayModifier(
  daysSinceCapture: number,
  config: SalienceConfig = DEFAULT_CONFIG
): number {
  const decay = 1.0 - daysSinceCapture * config.decayRatePerDay;
  return Math.max(config.decayFloor, decay);
}

/**
 * Boost salience when memory is retrieved.
 * Implements "retrieval practice" - memory strengthens through use.
 */
export function calculateRetrievalBoost(currentScore: number, retrievalCount: number): number {
  // Diminishing returns: first retrieval adds 2 points, subsequent add less
  const boost = 2 * (1 / (retrievalCount + 1));
  return Math.min(100, currentScore + boost);
}

/**
 * Detect the context type from capture context.
 */
export function detectContext(context: Partial<CaptureContext>): ContextType {
  // Work hours on weekday = likely work context
  if (
    context.timeBucket === 'work_hours' &&
    context.dayOfWeek &&
    !['Saturday', 'Sunday'].includes(context.dayOfWeek)
  ) {
    return 'work_meeting';
  }

  // Weekend or evening = more likely social
  if (
    context.dayOfWeek &&
    ['Saturday', 'Sunday'].includes(context.dayOfWeek)
  ) {
    return 'social_event';
  }

  if (context.timeBucket === 'evening') {
    return 'social_event';
  }

  return 'default';
}

/**
 * Build capture context from available signals.
 */
export function buildCaptureContext(
  timestamp: Date = new Date(),
  location?: string,
  isLocationNew?: boolean
): CaptureContext {
  const hour = timestamp.getHours();
  const dayOfWeek = timestamp.toLocaleDateString('en-US', { weekday: 'long' });

  // Determine time of day
  let timeOfDay: CaptureContext['timeOfDay'];
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  // Determine time bucket
  let timeBucket: CaptureContext['timeBucket'];
  const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);
  if (isWeekend) {
    timeBucket = 'weekend';
  } else if (hour >= 9 && hour < 17) {
    timeBucket = 'work_hours';
  } else if (hour >= 17 && hour < 22) {
    timeBucket = 'evening';
  } else {
    timeBucket = 'late_night';
  }

  // Unusual time: outside 8am-10pm
  const timeIsUnusual = hour < 8 || hour >= 22;

  // Detect context type
  const partialContext: Partial<CaptureContext> = {
    timeBucket,
    dayOfWeek,
    timeOfDay,
    location,
    locationIsNew: isLocationNew,
    timeIsUnusual,
  };

  const detectedContext = detectContext(partialContext);

  // Check for nearby holidays (simplified - would need holiday API)
  const nearHoliday = checkNearHoliday(timestamp);

  return {
    location,
    locationIsNew: isLocationNew,
    timeOfDay,
    dayOfWeek,
    timeBucket,
    timeIsUnusual,
    detectedContext,
    nearHoliday,
  };
}

/**
 * Simple holiday proximity check (US holidays as example).
 */
function checkNearHoliday(date: Date): string | undefined {
  const month = date.getMonth();
  const day = date.getDate();

  // Within 2 weeks of major holidays
  const holidays: Array<{ name: string; month: number; day: number }> = [
    { name: 'new_year', month: 0, day: 1 },
    { name: 'valentines', month: 1, day: 14 },
    { name: 'independence_day', month: 6, day: 4 },
    { name: 'halloween', month: 9, day: 31 },
    { name: 'thanksgiving', month: 10, day: 25 }, // Approximate
    { name: 'christmas', month: 11, day: 25 },
  ];

  for (const holiday of holidays) {
    const holidayDate = new Date(date.getFullYear(), holiday.month, holiday.day);
    const diffDays = Math.abs((date.getTime() - holidayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 14) {
      return holiday.name;
    }
  }

  return undefined;
}

/**
 * Get user's learned weights from database, falling back to defaults.
 */
export async function getLearnedWeights(userId: string): Promise<SalienceWeights> {
  try {
    const learnedWeightsCollection = collections.learnedWeights();
    const learned = await learnedWeightsCollection.findOne({ userId });

    if (learned && learned.confidence > 0.5) {
      return learned.weights;
    }
  } catch (error) {
    console.error('[SalienceCalculator] Error fetching learned weights:', error);
  }

  return DEFAULT_SALIENCE_WEIGHTS;
}

/**
 * Compute salience with learned weights for a specific user.
 */
export async function computeSalienceForUser(
  features: ExtractedFeatures,
  context: CaptureContext,
  userId: string,
  userProfile?: UserProfile
): Promise<SalienceScore> {
  // Get user's learned weights
  const learnedWeights = await getLearnedWeights(userId);

  // Build config with learned weights as base
  const config: SalienceConfig = {
    ...DEFAULT_CONFIG,
    userProfile,
  };

  // Compute with learned weights
  let weights = { ...learnedWeights };
  const contextModifiers = CONTEXT_WEIGHT_MODIFIERS[context.detectedContext];
  weights = applyContextModifiers(weights, contextModifiers);

  const components = calculateComponents(features, context, userProfile);

  const rawScore =
    components.emotional * weights.emotional +
    components.novelty * weights.novelty +
    components.relevance * weights.relevance +
    components.social * weights.social +
    components.consequential * weights.consequential;

  return {
    score: Math.round(Math.min(100, Math.max(0, rawScore))),
    components,
    weightsUsed: weights,
    captureContext: context,
    calculatedAt: new Date().toISOString(),
  };
}
