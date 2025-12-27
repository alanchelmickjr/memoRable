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

// Re-export startup/health utilities
export {
  initializeSalienceService,
  initializeWithRetry,
  getHealthStatus,
  isHealthy,
  isReady,
  isAlive,
  shutdown,
  healthEndpoint,
  probes,
  getState,
  type StartupConfig,
  type HealthStatus,
} from './startup';

// Re-export metrics utilities
export {
  metrics,
  metricsEndpoint,
  getMetricsSummary,
  exportPrometheus,
  exportJSON,
  resetMetrics,
  startTimer,
  withTiming,
  // Convenience metric functions
  incMemoriesProcessed,
  incOpenLoopsCreated,
  incOpenLoopsClosed,
  incTimelineEvents,
  incRetrievals,
  incBriefings,
  incFeatureExtractions,
  incRelationshipUpdates,
  incErrors,
  setActiveLoops,
  setOverdueLoops,
  setActiveRelationships,
  setColdRelationships,
  setWeightsConfidence,
  observeProcessingTime,
  observeFeatureExtractionTime,
  observeRetrievalTime,
  observeBriefingTime,
  observeSalienceScore,
  observeLLMCallTime,
} from './metrics';

// Re-export individual services
export { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
export {
  computeSalience,
  computeSalienceForUser,
  buildCaptureContext,
  calculateDecayModifier,
  calculateRetrievalBoost,
  invalidateWeightsCache,
  clearWeightsCache,
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
  type OpenLoopWithOverdue,
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

// Re-export context frame system (now multi-device aware)
export {
  initContextFrame,
  getContextFrame,
  updateContextFrame,
  clearContextFrame,
  addPersonToFrame,
  removePersonFromFrame,
  surfaceMemoriesForFrame,
  setContext,
  whatMattersNow,
  // Multi-device support
  getAllDeviceContexts,
  getUnifiedUserContext,
  clearDeviceContext,
  type ContextFrame,
  type ContextualMemories,
  type SurfacedMemory,
  type QuickBriefing,
} from './context_frame';

// Re-export device context types for multi-device architecture
export {
  DeviceRegistry,
  DeviceType,
  DeviceInfo,
  DeviceCapabilities,
  DeviceContextFrame,
  SensorType,
  SensorReading,
  DEVICE_REDIS_KEYS,
  STALENESS_CONFIG,
  createDefaultDeviceContext,
} from './device_context';

// Re-export context integration service (brain-inspired fusion)
export {
  ContextIntegrationService,
  getContextIntegrationService,
  resetContextIntegrationService,
} from './context_integration';

// Re-export real-time sync service (omnipresence layer)
export {
  RealtimeSyncService,
  ContextHub,
  getSyncService,
  getContextHub,
  resetSyncServices,
  SYNC_CHANNELS,
  SENSOR_PRIORITY,
  type ContextUpdateMessage,
  type SensorUpdateMessage,
  type HeartbeatMessage,
  type UnifiedContextMessage,
  type ControlMessage,
  type SyncMessage,
} from './realtime_sync';

// Re-export memory operations (forget, reassociate, export)
export {
  forgetMemory,
  forgetPerson,
  restoreMemory,
  reassociateMemory,
  mergeMemories,
  exportMemories,
  importMemories,
  type MemoryState,
  type ForgetOptions,
  type ForgetResult,
  type ReassociateOptions,
  type ExportedMemory,
  type ExportOptions,
} from './memory_operations';

// Re-export anticipation service (predictive memory surfacing)
export {
  initAnticipationService,
  observeContext,
  recordPatternFeedback,
  getAnticipatedContext,
  getPatternStats,
  generateDayAnticipation,
  THRESHOLDS as ANTICIPATION_THRESHOLDS,
  WINDOWS as ANTICIPATION_WINDOWS,
  type PatternFeatures,
  type LearnedPattern,
  type CalendarEvent,
  type AnticipatedContext,
  type FeedbackSignal,
  type PatternStats,
} from './anticipation_service';

// Re-export energy-aware task retrieval (TaskForge Triage integration)
export {
  getEnergyAwareTasks,
  getQuickWins,
  getDeepWorkTasks,
  getTasksForTimeBlock,
  triageTask,
  batchTriageTasks,
  getEnergyDescription,
  getCognitiveLoadDescription,
  suggestEnergyForTimeOfDay,
  type EnergyLevel,
  type CognitiveLoad,
  type TaskComplexity,
  type TimeBlock,
  type EnergyAwareTask,
  type TriageCategory,
  type EnergyContext,
  type EnergyAwareTaskResult,
} from './energy_aware_tasks';

// Import for internal use
import { setupSalienceDatabase } from './database';
import { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
import { computeSalienceForUser, buildCaptureContext } from './salience_calculator';
import { createOpenLoopsFromFeatures, checkLoopClosures } from './open_loop_tracker';
import { createTimelineEventsFromFeatures } from './timeline_tracker';
import { updateRelationshipFromFeatures } from './relationship_tracker';
import {
  startTimer,
  incMemoriesProcessed,
  incOpenLoopsCreated,
  incOpenLoopsClosed,
  incTimelineEvents,
  incErrors,
  observeProcessingTime,
  observeSalienceScore,
} from './metrics';

// Note: initializeSalienceService is exported from './startup' with enhanced
// retry logic, health checks, and zero-data handling. Use that version for production.

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
  const endTimer = startTimer();

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

    // Steps 4, 5, 6: Run in parallel (all independent - depend only on features)
    const [openLoops, timelineEvents] = await Promise.all([
      // Step 4: Create open loops from commitments
      createOpenLoopsFromFeatures(
        features,
        input.userId,
        input.memoryId,
        memoryCreatedAt
      ),
      // Step 5: Create timeline events for other people
      createTimelineEventsFromFeatures(
        features,
        input.userId,
        input.memoryId,
        memoryCreatedAt
      ),
      // Step 6: Update relationship patterns (no return value needed)
      updateRelationshipFromFeatures(input.userId, features, memoryCreatedAt),
    ]);

    // Step 7: Check if this memory closes any existing loops
    // Runs AFTER loop creation to ensure consistent state (excludes same-memory loops)
    const closedLoopIds = await checkLoopClosures(
      input.text,
      features,
      input.userId,
      input.memoryId,
      llmClient
    );

    // Record metrics
    const durationMs = endTimer();
    observeProcessingTime('llm', durationMs);
    observeSalienceScore(salience.score);
    incMemoriesProcessed('llm', 'success');

    // Track created artifacts
    for (const loop of openLoops) {
      incOpenLoopsCreated(loop.owner);
    }
    for (const event of timelineEvents) {
      incTimelineEvents(event.type || 'unknown');
    }
    if (closedLoopIds.length > 0) {
      for (let i = 0; i < closedLoopIds.length; i++) {
        incOpenLoopsClosed('auto');
      }
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
    // Record error metrics
    observeProcessingTime('llm', endTimer());
    incMemoriesProcessed('llm', 'error');
    incErrors('enrichMemoryWithSalience');

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
  const endTimer = startTimer();

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

    // Record metrics
    const durationMs = endTimer();
    observeProcessingTime('heuristic', durationMs);
    observeSalienceScore(salience.score);
    incMemoriesProcessed('heuristic', 'success');

    // Note: Skip loop/timeline creation with heuristics (less reliable)

    return {
      success: true,
      salience,
      extractedFeatures: features,
      openLoopsCreated: [],
      timelineEventsCreated: [],
    };
  } catch (error) {
    // Record error metrics
    observeProcessingTime('heuristic', endTimer());
    incMemoriesProcessed('heuristic', 'error');
    incErrors('enrichMemoryWithSalienceHeuristic');

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
