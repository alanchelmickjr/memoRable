/**
 * @file Adaptive Weight Learning Service
 * The weights shouldn't be static - they should learn from what you actually use.
 *
 * Tracks what gets retrieved and acted upon, then adjusts weights to predict
 * what matters to you. If you consistently retrieve and act on high-consequentiality
 * memories but ignore high-emotional ones, the system learns that for YOU,
 * action items matter more than feelings.
 */
import type { SalienceWeights, LearnedWeights } from './models';
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
/**
 * Recalibrate weights based on retrieval history.
 */
export declare function recalibrateWeights(userId: string, config?: AdaptiveLearningConfig): Promise<LearnedWeights>;
/**
 * Get learned weights for a user.
 */
export declare function getLearnedWeights(userId: string): Promise<LearnedWeights | null>;
/**
 * Get effective weights for a user (learned if confident, otherwise default).
 */
export declare function getEffectiveWeights(userId: string, config?: AdaptiveLearningConfig): Promise<{
    weights: SalienceWeights;
    isLearned: boolean;
    confidence: number;
}>;
/**
 * Mark a retrieval as having resulted in action.
 * This feedback improves weight learning.
 */
export declare function markRetrievalAction(retrievalLogId: string, actionType?: string): Promise<void>;
/**
 * Record user feedback on a retrieved memory.
 */
export declare function recordFeedback(retrievalLogId: string, feedback: 'helpful' | 'not_helpful' | 'neutral'): Promise<void>;
/**
 * Get insights about user's memory patterns.
 */
export declare function getMemoryPatternInsights(userId: string): Promise<{
    dominantComponents: Array<{
        component: string;
        weight: number;
    }>;
    recentTrend: string;
    actionRate: number;
    suggestions: string[];
}>;
/**
 * Reset learned weights to defaults.
 */
export declare function resetWeights(userId: string): Promise<void>;
/**
 * Batch recalibrate weights for all active users.
 * Should be called periodically (e.g., weekly).
 */
export declare function batchRecalibrateWeights(): Promise<{
    processed: number;
    updated: number;
}>;
