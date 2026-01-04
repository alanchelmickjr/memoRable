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
import type { SalienceCalculationInput, SalienceCalculationResult, UserProfile } from './models';
export * from './models';
export { setupSalienceDatabase, collections } from './database';
export { initializeSalienceService, initializeWithRetry, getHealthStatus, isHealthy, isReady, isAlive, shutdown, healthEndpoint, probes, getState, type StartupConfig, type HealthStatus, } from './startup';
export { metrics, metricsEndpoint, getMetricsSummary, exportPrometheus, exportJSON, resetMetrics, startTimer, withTiming, incMemoriesProcessed, incOpenLoopsCreated, incOpenLoopsClosed, incTimelineEvents, incRetrievals, incBriefings, incFeatureExtractions, incRelationshipUpdates, incErrors, setActiveLoops, setOverdueLoops, setActiveRelationships, setColdRelationships, setWeightsConfidence, observeProcessingTime, observeFeatureExtractionTime, observeRetrievalTime, observeBriefingTime, observeSalienceScore, observeLLMCallTime, } from './metrics';
export { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
export { computeSalience, computeSalienceForUser, buildCaptureContext, calculateDecayModifier, calculateRetrievalBoost, invalidateWeightsCache, clearWeightsCache, } from './salience_calculator';
export { createOpenLoopsFromFeatures, getOpenLoops, closeLoop, checkLoopClosures, getOverdueLoops, getUpcomingDueLoops, markReminderSent, abandonLoop, type OpenLoopWithOverdue, } from './open_loop_tracker';
export { createTimelineEventsFromFeatures, getUpcomingEventsForContact, getUpcomingEvents, getRecentEventsForContact, getSensitiveContext, markEventMentioned, processRecurringEvents, } from './timeline_tracker';
export { recordInteraction, getRelationshipPattern, getColdRelationships, getDecreasingRelationships, createRelationshipSnapshot, getLatestSnapshot, getRelationshipTrajectory, getActiveRelationships, updateRelationshipFromFeatures, getRelationshipsNeedingAttention, setNudgeThreshold, getRelationshipsDueForNudge, updateAllSnapshots, } from './relationship_tracker';
export { generateBriefing, generateQuickBriefing, generateBriefingByName, formatBriefing, } from './briefing_generator';
export { retrieveWithSalience, logRetrieval, boostOnRetrieval, timeAwareRetrieve, getMemoriesForPerson, getMemoriesWithUpcomingDeadlines, type ScoredMemory, } from './retrieval';
export { recalibrateWeights, getLearnedWeights, getEffectiveWeights, markRetrievalAction, recordFeedback, getMemoryPatternInsights, resetWeights, batchRecalibrateWeights, } from './adaptive_learning';
export { initContextFrame, getContextFrame, updateContextFrame, clearContextFrame, addPersonToFrame, removePersonFromFrame, surfaceMemoriesForFrame, setContext, whatMattersNow, getAllDeviceContexts, getUnifiedUserContext, clearDeviceContext, type ContextFrame, type ContextualMemories, type SurfacedMemory, type QuickBriefing, } from './context_frame';
export { DeviceRegistry, DeviceType, DeviceInfo, DeviceCapabilities, DeviceContextFrame, SensorType, SensorReading, DEVICE_REDIS_KEYS, STALENESS_CONFIG, createDefaultDeviceContext, } from './device_context';
export { ContextIntegrationService, getContextIntegrationService, resetContextIntegrationService, } from './context_integration';
export { RealtimeSyncService, ContextHub, getSyncService, getContextHub, resetSyncServices, SYNC_CHANNELS, SENSOR_PRIORITY, type ContextUpdateMessage, type SensorUpdateMessage, type HeartbeatMessage, type UnifiedContextMessage, type ControlMessage, type SyncMessage, } from './realtime_sync';
export { forgetMemory, forgetPerson, restoreMemory, reassociateMemory, mergeMemories, exportMemories, importMemories, type MemoryState, type ForgetOptions, type ForgetResult, type ReassociateOptions, type ExportedMemory, type ExportOptions, } from './memory_operations';
export { initAnticipationService, observeContext, recordPatternFeedback, getAnticipatedContext, getPatternStats, generateDayAnticipation, THRESHOLDS as ANTICIPATION_THRESHOLDS, WINDOWS as ANTICIPATION_WINDOWS, type PatternFeatures, type LearnedPattern, type CalendarEvent, type AnticipatedContext, type FeedbackSignal, type PatternStats, } from './anticipation_service';
export { getEnergyAwareTasks, getQuickWins, getDeepWorkTasks, getTasksForTimeBlock, triageTask, batchTriageTasks, getEnergyDescription, getCognitiveLoadDescription, suggestEnergyForTimeOfDay, type EnergyLevel, type CognitiveLoad, type TaskComplexity, type TimeBlock, type EnergyAwareTask, type TriageCategory, type EnergyContext, type EnergyAwareTaskResult, } from './energy_aware_tasks';
export { createLLMClient, BedrockLLMClient, AnthropicLLMClient, OpenAILLMClient, type LLMProvider, type LLMProviderConfig, } from './llm_providers';
import { type LLMClient } from './feature_extractor';
/**
 * Main salience enrichment pipeline.
 * Call this for every new memory at capture time.
 *
 * Cost: ~$0.003 per memory
 * Time: ~200-500ms
 */
export declare function enrichMemoryWithSalience(input: SalienceCalculationInput, llmClient: LLMClient, userProfile?: UserProfile): Promise<SalienceCalculationResult>;
/**
 * Lightweight salience enrichment using heuristics only (no LLM).
 * Use for lower-priority content or when LLM is unavailable.
 *
 * Cost: ~$0 per memory
 * Time: ~10-50ms
 */
export declare function enrichMemoryWithSalienceHeuristic(input: SalienceCalculationInput, userProfile?: UserProfile): Promise<SalienceCalculationResult>;
/**
 * Backfill salience for existing memories.
 *
 * At $0.003 each:
 * - 1,000 memories = $3
 * - 10,000 memories = $30
 * - 100,000 memories = $300
 */
export declare function backfillSalience(memories: Array<{
    id: string;
    text: string;
    userId: string;
    createdAt?: string;
}>, llmClient: LLMClient, options?: {
    onProgress?: (processed: number, total: number) => void;
    batchSize?: number;
    delayBetweenBatches?: number;
}): Promise<{
    processed: number;
    failed: number;
}>;
/**
 * Get a summary of the salience system status.
 */
export declare function getSalienceStatus(userId: string): Promise<{
    openLoopsCount: {
        youOwe: number;
        theyOwe: number;
        mutual: number;
        overdue: number;
    };
    upcomingEventsCount: number;
    activeRelationshipsCount: number;
    coldRelationshipsCount: number;
    weightsLearned: boolean;
    weightsConfidence: number;
}>;
/**
 * Daily maintenance tasks.
 * Call once per day (e.g., via cron job).
 */
export declare function runDailyMaintenance(userId: string): Promise<{
    recurringEventsUpdated: number;
    relationshipSnapshotsUpdated: number;
}>;
/**
 * Weekly maintenance tasks.
 * Call once per week (e.g., via cron job).
 */
export declare function runWeeklyMaintenance(): Promise<{
    usersRecalibrated: number;
    weightsUpdated: number;
}>;
export declare const SALIENCE_VERSION = "2.0.0";
export declare const SALIENCE_ALGORITHM_VERSION = "2.0";
