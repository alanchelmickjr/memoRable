/**
 * @file Memory Salience Service - Main Entry Point
 *
 * Human-Like Memory Salience System v2.0
 *
 * Key principles:
 * - Calculate salience at capture time, not overnight
 * - No nocturnal reinforcement, no $120/day batch processing
 * - Single LLM call per memory (~$0.003)
 * - Adaptive weights that learn what matters to you
 * - Track commitments, open loops, and other people's timelines
 * - Pre-conversation briefings for "the dance"
 *
 * Total cost: ~$6-8/month vs $3,600/month for nocturnal approach
 */

import type { Db } from 'mongodb';
import type {
  SalienceCalculationInput,
  SalienceCalculationResult,
  ExtractedFeatures,
  SalienceScore,
  CaptureContext,
  UserProfile,
  OpenLoop,
  PersonTimelineEvent,
  ConversationBriefing,
} from './models';

// Re-export all types
export * from './models';

// Re-export database utilities
export { setupSalienceDatabase, collections } from './database';

// Re-export individual services
export { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
export {
  computeSalience,
  computeSalienceForUser,
  buildCaptureContext,
  calculateDecayModifier,
  calculateRetrievalBoost,
} from './salience_calculator';
export {
  createOpenLoopsFromFeatures,
  getOpenLoops,
  closeLoop,
  checkLoopClosures,
  getOverdueLoops,
  getUpcomingDueLoops,
  markReminderSent,
  abandonLoop,
} from './open_loop_tracker';
export {
  createTimelineEventsFromFeatures,
  getUpcomingEventsForContact,
  getUpcomingEvents,
  getRecentEventsForContact,
  getSensitiveContext,
  markEventMentioned,
  processRecurringEvents,
} from './timeline_tracker';
export {
  recordInteraction,
  getRelationshipPattern,
  getColdRelationships,
  getDecreasingRelationships,
  createRelationshipSnapshot,
  getLatestSnapshot,
  getRelationshipTrajectory,
  getActiveRelationships,
  updateRelationshipFromFeatures,
  getRelationshipsNeedingAttention,
  setNudgeThreshold,
  getRelationshipsDueForNudge,
  updateAllSnapshots,
} from './relationship_tracker';
export {
  generateBriefing,
  generateQuickBriefing,
  generateBriefingByName,
  formatBriefing,
} from './briefing_generator';
export {
  retrieveWithSalience,
  logRetrieval,
  boostOnRetrieval,
  timeAwareRetrieve,
  getMemoriesForPerson,
  getMemoriesWithUpcomingDeadlines,
  type ScoredMemory,
} from './retrieval';
export {
  recalibrateWeights,
  getLearnedWeights,
  getEffectiveWeights,
  markRetrievalAction,
  recordFeedback,
  getMemoryPatternInsights,
  resetWeights,
  batchRecalibrateWeights,
} from './adaptive_learning';

// Import for internal use
import { setupSalienceDatabase } from './database';
import { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
import { computeSalienceForUser, buildCaptureContext } from './salience_calculator';
import { createOpenLoopsFromFeatures, checkLoopClosures } from './open_loop_tracker';
import { createTimelineEventsFromFeatures } from './timeline_tracker';
import { updateRelationshipFromFeatures } from './relationship_tracker';

/**
 * Initialize the salience service.
 * Call this during application startup.
 */
export async function initializeSalienceService(db: Db): Promise<void> {
  await setupSalienceDatabase(db);
  console.log('[SalienceService] Initialized successfully');
}

/**
 * Main salience enrichment pipeline.
 * Call this for every new memory at capture time.
 *
 * Cost: ~$0.003 per memory
 * Time: ~200-500ms
 */
export async function enrichMemoryWithSalience(
  input: SalienceCalculationInput,
  llmClient: LLMClient,
  userProfile?: UserProfile
): Promise<SalienceCalculationResult> {
  try {
    const memoryCreatedAt = new Date();

    // Step 1: Extract features using LLM (~$0.002)
    const features = await extractFeatures(input.text, llmClient);

    // Step 2: Build capture context
    const context = input.context
      ? { ...buildCaptureContext(), ...input.context }
      : buildCaptureContext();

    // Step 3: Compute salience score
    const salience = await computeSalienceForUser(
      features,
      context as CaptureContext,
      input.userId,
      userProfile
    );

    // Step 4: Create open loops from commitments
    const openLoops = await createOpenLoopsFromFeatures(
      features,
      input.userId,
      input.memoryId,
      memoryCreatedAt
    );

    // Step 5: Create timeline events for other people
    const timelineEvents = await createTimelineEventsFromFeatures(
      features,
      input.userId,
      input.memoryId,
      memoryCreatedAt
    );

    // Step 6: Update relationship patterns
    await updateRelationshipFromFeatures(input.userId, features, memoryCreatedAt);

    // Step 7: Check if this memory closes any existing loops
    const closedLoopIds = await checkLoopClosures(
      input.text,
      features,
      input.userId,
      input.memoryId,
      llmClient
    );

    // Log if loops were closed
    if (closedLoopIds.length > 0) {
      console.log(`[SalienceService] Closed ${closedLoopIds.length} open loops`);
    }

    return {
      success: true,
      salience,
      extractedFeatures: features,
      openLoopsCreated: openLoops,
      timelineEventsCreated: timelineEvents,
    };
  } catch (error) {
    console.error('[SalienceService] Error enriching memory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Lightweight salience enrichment using heuristics only (no LLM).
 * Use for lower-priority content or when LLM is unavailable.
 *
 * Cost: ~$0 per memory
 * Time: ~10-50ms
 */
export async function enrichMemoryWithSalienceHeuristic(
  input: SalienceCalculationInput,
  userProfile?: UserProfile
): Promise<SalienceCalculationResult> {
  try {
    const memoryCreatedAt = new Date();

    // Step 1: Extract features using heuristics (no LLM)
    const features = extractFeaturesHeuristic(input.text);

    // Step 2: Build capture context
    const context = input.context
      ? { ...buildCaptureContext(), ...input.context }
      : buildCaptureContext();

    // Step 3: Compute salience score
    const salience = await computeSalienceForUser(
      features,
      context as CaptureContext,
      input.userId,
      userProfile
    );

    // Note: Skip loop/timeline creation with heuristics (less reliable)

    return {
      success: true,
      salience,
      extractedFeatures: features,
      openLoopsCreated: [],
      timelineEventsCreated: [],
    };
  } catch (error) {
    console.error('[SalienceService] Error in heuristic enrichment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Backfill salience for existing memories.
 *
 * At $0.003 each:
 * - 1,000 memories = $3
 * - 10,000 memories = $30
 * - 100,000 memories = $300
 */
export async function backfillSalience(
  memories: Array<{ id: string; text: string; userId: string; createdAt?: string }>,
  llmClient: LLMClient,
  options: {
    onProgress?: (processed: number, total: number) => void;
    batchSize?: number;
    delayBetweenBatches?: number;
  } = {}
): Promise<{ processed: number; failed: number }> {
  const batchSize = options.batchSize || 10;
  const delay = options.delayBetweenBatches || 100;

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < memories.length; i += batchSize) {
    const batch = memories.slice(i, i + batchSize);

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map((memory) =>
        enrichMemoryWithSalience(
          {
            memoryId: memory.id,
            text: memory.text,
            userId: memory.userId,
          },
          llmClient
        )
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        processed++;
      } else {
        failed++;
      }
    }

    options.onProgress?.(processed + failed, memories.length);

    // Rate limit
    if (i + batchSize < memories.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { processed, failed };
}

/**
 * Get a summary of the salience system status.
 */
export async function getSalienceStatus(userId: string): Promise<{
  openLoopsCount: { youOwe: number; theyOwe: number; mutual: number; overdue: number };
  upcomingEventsCount: number;
  activeRelationshipsCount: number;
  coldRelationshipsCount: number;
  weightsLearned: boolean;
  weightsConfidence: number;
}> {
  const { collections } = await import('./database');
  const { getEffectiveWeights } = await import('./adaptive_learning');
  const { getActiveRelationships, getColdRelationships } = await import('./relationship_tracker');
  const { getUpcomingEvents, getOverdueLoops } = await import('./open_loop_tracker');

  const [
    youOweLops,
    theyOweLoops,
    mutualLoops,
    overdueLoops,
    upcomingEvents,
    activeRelationships,
    coldRelationships,
    weights,
  ] = await Promise.all([
    collections.openLoops().countDocuments({ userId, owner: 'self', status: 'open' }),
    collections.openLoops().countDocuments({ userId, owner: 'them', status: 'open' }),
    collections.openLoops().countDocuments({ userId, owner: 'mutual', status: 'open' }),
    getOverdueLoops(userId),
    getUpcomingEvents(userId, 14),
    getActiveRelationships(userId),
    getColdRelationships(userId),
    getEffectiveWeights(userId),
  ]);

  return {
    openLoopsCount: {
      youOwe: youOweLops,
      theyOwe: theyOweLoops,
      mutual: mutualLoops,
      overdue: overdueLoops.length,
    },
    upcomingEventsCount: upcomingEvents.length,
    activeRelationshipsCount: activeRelationships.length,
    coldRelationshipsCount: coldRelationships.length,
    weightsLearned: weights.isLearned,
    weightsConfidence: weights.confidence,
  };
}

/**
 * Daily maintenance tasks.
 * Call once per day (e.g., via cron job).
 */
export async function runDailyMaintenance(userId: string): Promise<{
  recurringEventsUpdated: number;
  relationshipSnapshotsUpdated: number;
}> {
  const { processRecurringEvents } = await import('./timeline_tracker');
  const { updateAllSnapshots } = await import('./relationship_tracker');

  const [recurringEventsUpdated, relationshipSnapshotsUpdated] = await Promise.all([
    processRecurringEvents(userId),
    updateAllSnapshots(userId),
  ]);

  return { recurringEventsUpdated, relationshipSnapshotsUpdated };
}

/**
 * Weekly maintenance tasks.
 * Call once per week (e.g., via cron job).
 */
export async function runWeeklyMaintenance(): Promise<{
  usersRecalibrated: number;
  weightsUpdated: number;
}> {
  const { batchRecalibrateWeights } = await import('./adaptive_learning');

  const result = await batchRecalibrateWeights();

  return {
    usersRecalibrated: result.processed,
    weightsUpdated: result.updated,
  };
}

// Version info
export const SALIENCE_VERSION = '2.0.0';
export const SALIENCE_ALGORITHM_VERSION = '2.0';
