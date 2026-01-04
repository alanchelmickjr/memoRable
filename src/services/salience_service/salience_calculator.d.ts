/**
 * @file Salience Calculator Service
 * Computes memory salience scores at capture time using observable signals.
 *
 * Key insight: Humans calculate salience at encoding time, not during sleep.
 * The emotional spike happens when the thing happens.
 *
 * Cost: ~$0.003 per memory (single Haiku call + computation)
 */
import type { SalienceScore, SalienceWeights, ExtractedFeatures, CaptureContext, ContextType, UserProfile } from './models';
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
/**
 * Compute salience score from extracted features.
 */
export declare function computeSalience(features: ExtractedFeatures, context: CaptureContext, config?: SalienceConfig): SalienceScore;
/**
 * Calculate decay modifier based on age.
 * Recent memories get a boost, older ones decay unless reinforced.
 */
export declare function calculateDecayModifier(daysSinceCapture: number, config?: SalienceConfig): number;
/**
 * Boost salience when memory is retrieved.
 * Implements "retrieval practice" - memory strengthens through use.
 */
export declare function calculateRetrievalBoost(currentScore: number, retrievalCount: number): number;
/**
 * Detect the context type from capture context.
 */
export declare function detectContext(context: Partial<CaptureContext>): ContextType;
/**
 * Build capture context from available signals.
 */
export declare function buildCaptureContext(timestamp?: Date, location?: string, isLocationNew?: boolean): CaptureContext;
/**
 * Get user's learned weights with in-memory caching.
 * Reduces DB calls from ~50/day to ~10/day per user.
 */
export declare function getLearnedWeights(userId: string): Promise<SalienceWeights>;
/**
 * Invalidate cached weights for a user (call after recalibration).
 */
export declare function invalidateWeightsCache(userId: string): void;
/**
 * Clear all cached weights (for testing or full refresh).
 */
export declare function clearWeightsCache(): void;
/**
 * Compute salience with learned weights for a specific user.
 */
export declare function computeSalienceForUser(features: ExtractedFeatures, context: CaptureContext, userId: string, userProfile?: UserProfile): Promise<SalienceScore>;
