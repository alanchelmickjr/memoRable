/**
 * @file Adaptive Weight Learning Service
 * The weights shouldn't be static - they should learn from what you actually use.
 *
 * Tracks what gets retrieved and acted upon, then adjusts weights to predict
 * what matters to you. If you consistently retrieve and act on high-consequentiality
 * memories but ignore high-emotional ones, the system learns that for YOU,
 * action items matter more than feelings.
 */

import type {
  SalienceWeights,
  SalienceComponents,
  RetrievalLog,
  LearnedWeights,
} from './models';
import { DEFAULT_SALIENCE_WEIGHTS } from './models';
import { collections } from './database';

/**
 * Configuration for adaptive learning.
 */
export interface AdaptiveLearningConfig {
  /** Days of history to analyze */
  analysisWindowDays: number;
  /** Minimum samples needed before adjusting weights */
  minSampleSize: number;
  /** How much to blend learned weights with defaults (0-1, higher = more learned) */
  learningRate: number;
  /** Minimum confidence to use learned weights */
  minConfidence: number;
}

const DEFAULT_CONFIG: AdaptiveLearningConfig = {
  analysisWindowDays: 30,
  minSampleSize: 20,
  learningRate: 0.3,
  minConfidence: 0.5,
};

/**
 * Recalibrate weights based on retrieval history.
 */
export async function recalibrateWeights(
  userId: string,
  config: AdaptiveLearningConfig = DEFAULT_CONFIG
): Promise<LearnedWeights> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.analysisWindowDays);

  // Get retrieval logs
  const logs = await collections.retrievalLogs()
    .find({
      userId,
      retrievedAt: { $gte: cutoffDate.toISOString() },
    })
    .toArray();

  // Filter to actioned retrievals (memories that led to action)
  const actionedLogs = logs.filter((l) => l.resultedInAction);

  // Check if we have enough samples
  if (actionedLogs.length < config.minSampleSize) {
    // Not enough data - return defaults with low confidence
    const result: LearnedWeights = {
      userId,
      weights: DEFAULT_SALIENCE_WEIGHTS,
      sampleSize: actionedLogs.length,
      lastRecalculatedAt: new Date().toISOString(),
      confidence: actionedLogs.length / config.minSampleSize,
    };

    await saveLearnedWeights(result);
    return result;
  }

  // Calculate component averages for actioned memories
  const componentScores = {
    emotional: [] as number[],
    novelty: [] as number[],
    relevance: [] as number[],
    social: [] as number[],
    consequential: [] as number[],
  };

  for (const log of actionedLogs) {
    if (log.salienceComponents) {
      componentScores.emotional.push(log.salienceComponents.emotional);
      componentScores.novelty.push(log.salienceComponents.novelty);
      componentScores.relevance.push(log.salienceComponents.relevance);
      componentScores.social.push(log.salienceComponents.social);
      componentScores.consequential.push(log.salienceComponents.consequential);
    }
  }

  // Calculate average scores
  const avgScores: SalienceComponents = {
    emotional: average(componentScores.emotional) || 50,
    novelty: average(componentScores.novelty) || 50,
    relevance: average(componentScores.relevance) || 50,
    social: average(componentScores.social) || 50,
    consequential: average(componentScores.consequential) || 50,
  };

  // Convert averages to weights (normalize to sum to 1)
  const total = Object.values(avgScores).reduce((sum, v) => sum + v, 0);
  const rawWeights: SalienceWeights = {
    emotional: avgScores.emotional / total,
    novelty: avgScores.novelty / total,
    relevance: avgScores.relevance / total,
    social: avgScores.social / total,
    consequential: avgScores.consequential / total,
  };

  // Blend with default weights based on learning rate
  const blendedWeights: SalienceWeights = {
    emotional: blend(DEFAULT_SALIENCE_WEIGHTS.emotional, rawWeights.emotional, config.learningRate),
    novelty: blend(DEFAULT_SALIENCE_WEIGHTS.novelty, rawWeights.novelty, config.learningRate),
    relevance: blend(DEFAULT_SALIENCE_WEIGHTS.relevance, rawWeights.relevance, config.learningRate),
    social: blend(DEFAULT_SALIENCE_WEIGHTS.social, rawWeights.social, config.learningRate),
    consequential: blend(DEFAULT_SALIENCE_WEIGHTS.consequential, rawWeights.consequential, config.learningRate),
  };

  // Normalize blended weights
  const blendedTotal = Object.values(blendedWeights).reduce((sum, v) => sum + v, 0);
  const normalizedWeights: SalienceWeights = {
    emotional: blendedWeights.emotional / blendedTotal,
    novelty: blendedWeights.novelty / blendedTotal,
    relevance: blendedWeights.relevance / blendedTotal,
    social: blendedWeights.social / blendedTotal,
    consequential: blendedWeights.consequential / blendedTotal,
  };

  // Calculate confidence based on sample size and consistency
  const consistency = calculateConsistency(actionedLogs);
  const sampleConfidence = Math.min(1, actionedLogs.length / (config.minSampleSize * 2));
  const confidence = (consistency + sampleConfidence) / 2;

  const result: LearnedWeights = {
    userId,
    weights: normalizedWeights,
    sampleSize: actionedLogs.length,
    lastRecalculatedAt: new Date().toISOString(),
    confidence,
  };

  await saveLearnedWeights(result);
  return result;
}

/**
 * Calculate average of an array.
 */
function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

/**
 * Blend two values based on rate.
 */
function blend(base: number, learned: number, rate: number): number {
  return base * (1 - rate) + learned * rate;
}

/**
 * Calculate consistency of actioned logs.
 * Higher consistency = more confidence in learned weights.
 */
function calculateConsistency(logs: RetrievalLog[]): number {
  if (logs.length < 2) return 0.5;

  // Calculate variance of each component
  const componentVariances: Record<string, number[]> = {
    emotional: [],
    novelty: [],
    relevance: [],
    social: [],
    consequential: [],
  };

  for (const log of logs) {
    if (log.salienceComponents) {
      componentVariances.emotional.push(log.salienceComponents.emotional);
      componentVariances.novelty.push(log.salienceComponents.novelty);
      componentVariances.relevance.push(log.salienceComponents.relevance);
      componentVariances.social.push(log.salienceComponents.social);
      componentVariances.consequential.push(log.salienceComponents.consequential);
    }
  }

  // Calculate coefficient of variation for each
  const cvs: number[] = [];
  for (const values of Object.values(componentVariances)) {
    if (values.length > 0) {
      const mean = average(values);
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;
      cvs.push(cv);
    }
  }

  // Lower CV = more consistent = higher score
  const avgCv = average(cvs);
  return Math.max(0, 1 - avgCv); // Cap at 1
}

/**
 * Save learned weights to database.
 */
async function saveLearnedWeights(weights: LearnedWeights): Promise<void> {
  await collections.learnedWeights().updateOne(
    { userId: weights.userId },
    { $set: weights },
    { upsert: true }
  );
}

/**
 * Get learned weights for a user.
 */
export async function getLearnedWeights(userId: string): Promise<LearnedWeights | null> {
  return collections.learnedWeights().findOne({ userId });
}

/**
 * Get effective weights for a user (learned if confident, otherwise default).
 */
export async function getEffectiveWeights(
  userId: string,
  config: AdaptiveLearningConfig = DEFAULT_CONFIG
): Promise<{ weights: SalienceWeights; isLearned: boolean; confidence: number }> {
  const learned = await getLearnedWeights(userId);

  if (learned && learned.confidence >= config.minConfidence) {
    return {
      weights: learned.weights,
      isLearned: true,
      confidence: learned.confidence,
    };
  }

  return {
    weights: DEFAULT_SALIENCE_WEIGHTS,
    isLearned: false,
    confidence: learned?.confidence || 0,
  };
}

/**
 * Mark a retrieval as having resulted in action.
 * This feedback improves weight learning.
 */
export async function markRetrievalAction(
  retrievalLogId: string,
  actionType?: string
): Promise<void> {
  await collections.retrievalLogs().updateOne(
    { id: retrievalLogId },
    {
      $set: {
        resultedInAction: true,
        actionType,
      },
    }
  );
}

/**
 * Record user feedback on a retrieved memory.
 */
export async function recordFeedback(
  retrievalLogId: string,
  feedback: 'helpful' | 'not_helpful' | 'neutral'
): Promise<void> {
  await collections.retrievalLogs().updateOne(
    { id: retrievalLogId },
    { $set: { userFeedback: feedback } }
  );
}

/**
 * Get insights about user's memory patterns.
 */
export async function getMemoryPatternInsights(userId: string): Promise<{
  dominantComponents: Array<{ component: string; weight: number }>;
  recentTrend: string;
  actionRate: number;
  suggestions: string[];
}> {
  const learned = await getLearnedWeights(userId);

  if (!learned || learned.sampleSize < 10) {
    return {
      dominantComponents: [],
      recentTrend: 'insufficient_data',
      actionRate: 0,
      suggestions: ['Continue using the system to personalize your memory weights'],
    };
  }

  // Sort components by weight
  const components = Object.entries(learned.weights)
    .map(([component, weight]) => ({ component, weight }))
    .sort((a, b) => b.weight - a.weight);

  // Get recent retrieval stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentLogs = await collections.retrievalLogs()
    .find({
      userId,
      retrievedAt: { $gte: thirtyDaysAgo.toISOString() },
    })
    .toArray();

  const actionedCount = recentLogs.filter((l) => l.resultedInAction).length;
  const actionRate = recentLogs.length > 0 ? actionedCount / recentLogs.length : 0;

  // Generate suggestions
  const suggestions: string[] = [];

  if (components[0].component === 'consequential' && components[0].weight > 0.3) {
    suggestions.push('You tend to prioritize actionable memories. Consider reviewing emotional context too.');
  }

  if (components[0].component === 'emotional' && components[0].weight > 0.35) {
    suggestions.push('You prioritize emotionally significant memories. This is great for relationship tracking.');
  }

  if (actionRate < 0.2) {
    suggestions.push('Many retrieved memories aren\'t leading to action. Consider adjusting your queries.');
  }

  if (learned.confidence < 0.6) {
    suggestions.push('Weight learning is still calibrating. More interactions will improve personalization.');
  }

  return {
    dominantComponents: components.slice(0, 3),
    recentTrend: determineTrend(recentLogs),
    actionRate,
    suggestions,
  };
}

/**
 * Determine recent trend in retrieval patterns.
 */
function determineTrend(logs: RetrievalLog[]): string {
  if (logs.length < 5) return 'insufficient_data';

  // Sort by date
  const sorted = [...logs].sort(
    (a, b) => new Date(a.retrievedAt).getTime() - new Date(b.retrievedAt).getTime()
  );

  // Compare first half to second half
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const firstAvgScore = average(firstHalf.map((l) => l.salienceScore));
  const secondAvgScore = average(secondHalf.map((l) => l.salienceScore));

  const diff = secondAvgScore - firstAvgScore;

  if (Math.abs(diff) < 5) return 'stable';
  if (diff > 0) return 'increasing_salience';
  return 'decreasing_salience';
}

/**
 * Reset learned weights to defaults.
 */
export async function resetWeights(userId: string): Promise<void> {
  await collections.learnedWeights().deleteOne({ userId });
}

/**
 * Batch recalibrate weights for all active users.
 * Should be called periodically (e.g., weekly).
 */
export async function batchRecalibrateWeights(): Promise<{
  processed: number;
  updated: number;
}> {
  // Find users with recent retrieval activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activeUsers = await collections.retrievalLogs()
    .distinct('userId', {
      retrievedAt: { $gte: thirtyDaysAgo.toISOString() },
    });

  let updated = 0;

  for (const userId of activeUsers) {
    try {
      const result = await recalibrateWeights(userId as string);
      if (result.confidence >= 0.5) {
        updated++;
      }
    } catch (error) {
      console.error(`[AdaptiveLearning] Error recalibrating weights for ${userId}:`, error);
    }
  }

  return {
    processed: activeUsers.length,
    updated,
  };
}
