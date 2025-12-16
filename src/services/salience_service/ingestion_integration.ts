/**
 * @file Ingestion Integration for Memory Salience Service
 * Provides hooks to integrate salience enrichment into the existing ingestion pipeline.
 *
 * Integration points:
 * 1. Post-memento construction: Add salience data to the memento
 * 2. Post-storage: Create open loops and timeline events
 * 3. Retrieval: Weight results by salience
 */

import type { MemoryMemento, ProcessedInputData } from '../ingestion_service/models';
import type {
  SalienceScore,
  ExtractedFeatures,
  CaptureContext,
  OpenLoop,
  PersonTimelineEvent,
  EnrichedMemoryData,
} from './models';
import type { LLMClient } from './feature_extractor';
import { extractFeatures, extractFeaturesHeuristic } from './feature_extractor';
import { computeSalienceForUser, buildCaptureContext } from './salience_calculator';
import { createOpenLoopsFromFeatures, checkLoopClosures } from './open_loop_tracker';
import { createTimelineEventsFromFeatures } from './timeline_tracker';
import { updateRelationshipFromFeatures } from './relationship_tracker';
import { SALIENCE_ALGORITHM_VERSION } from './index';

/**
 * Result of salience enrichment for a memento.
 */
export interface SalienceEnrichmentResult {
  success: boolean;
  enrichedData?: EnrichedMemoryData;
  openLoopsCreated: OpenLoop[];
  timelineEventsCreated: PersonTimelineEvent[];
  loopsClosed: string[];
  error?: string;
}

/**
 * Options for salience enrichment.
 */
export interface SalienceEnrichmentOptions {
  /** Use LLM for feature extraction (more accurate, costs ~$0.003) */
  useLLM: boolean;
  /** LLM client (required if useLLM is true) */
  llmClient?: LLMClient;
  /** User profile for relevance calculation */
  userProfile?: {
    name: string;
    interests: string[];
    goals: string[];
    closeContacts: string[];
    knownContacts: string[];
    recentTopics: string[];
  };
  /** Additional capture context */
  captureContext?: Partial<CaptureContext>;
  /** Skip open loop creation (for backfill scenarios) */
  skipLoopCreation?: boolean;
  /** Skip timeline event creation */
  skipTimelineCreation?: boolean;
  /** Skip relationship updates */
  skipRelationshipUpdates?: boolean;
  /** Skip loop closure detection */
  skipLoopClosureDetection?: boolean;
}

const DEFAULT_OPTIONS: SalienceEnrichmentOptions = {
  useLLM: true,
  skipLoopCreation: false,
  skipTimelineCreation: false,
  skipRelationshipUpdates: false,
  skipLoopClosureDetection: false,
};

/**
 * Enrich a memento with salience data.
 * Call this after memento construction but before storage.
 */
export async function enrichMementoWithSalience(
  memento: MemoryMemento,
  options: SalienceEnrichmentOptions = DEFAULT_OPTIONS
): Promise<SalienceEnrichmentResult> {
  try {
    const memoryCreatedAt = new Date(memento.eventTimestamp || memento.createdAt);

    // Extract text content from memento
    const textContent = extractTextFromMemento(memento);

    if (!textContent) {
      return {
        success: false,
        error: 'No text content found in memento',
        openLoopsCreated: [],
        timelineEventsCreated: [],
        loopsClosed: [],
      };
    }

    // Step 1: Extract features
    let features: ExtractedFeatures;
    if (options.useLLM && options.llmClient) {
      features = await extractFeatures(textContent, options.llmClient);
    } else {
      features = extractFeaturesHeuristic(textContent);
    }

    // Step 2: Build capture context
    const context = buildCaptureContextFromMemento(memento, options.captureContext);

    // Step 3: Compute salience score
    const salience = await computeSalienceForUser(
      features,
      context,
      memento.agentId,
      options.userProfile ? {
        userId: memento.agentId,
        ...options.userProfile,
      } : undefined
    );

    // Step 4: Create enriched data
    const enrichedData: EnrichedMemoryData = {
      salience,
      extractedFeatures: features,
      captureContext: context,
      retrievalCount: 0,
      hasFutureReferences: hasFeatureReferences(features),
      hasOpenLoops: false, // Will be updated after loop creation
      salienceVersion: SALIENCE_ALGORITHM_VERSION,
    };

    // Steps 5, 6, 7: Run in parallel (all independent - depend only on features)
    // Build promises array based on enabled options
    const parallelOps: Promise<any>[] = [];

    // Step 5: Create open loops (if enabled and using LLM)
    const loopCreationPromise = (!options.skipLoopCreation && options.useLLM)
      ? createOpenLoopsFromFeatures(features, memento.agentId, memento.mementoId, memoryCreatedAt)
      : Promise.resolve([]);
    parallelOps.push(loopCreationPromise);

    // Step 6: Create timeline events (if enabled and using LLM)
    const timelinePromise = (!options.skipTimelineCreation && options.useLLM)
      ? createTimelineEventsFromFeatures(features, memento.agentId, memento.mementoId, memoryCreatedAt)
      : Promise.resolve([]);
    parallelOps.push(timelinePromise);

    // Step 7: Update relationship patterns (if enabled)
    const relationshipPromise = (!options.skipRelationshipUpdates)
      ? updateRelationshipFromFeatures(memento.agentId, features, memoryCreatedAt)
      : Promise.resolve();
    parallelOps.push(relationshipPromise);

    // Wait for all parallel operations
    const [openLoopsCreated, timelineEventsCreated] = await Promise.all(parallelOps) as [OpenLoop[], PersonTimelineEvent[]];

    // Post-process loop creation results
    if (openLoopsCreated.length > 0) {
      enrichedData.hasOpenLoops = true;
      const dueDates = openLoopsCreated
        .map((l) => l.dueDate || l.softDeadline)
        .filter((d): d is string => !!d)
        .sort();
      if (dueDates.length > 0) {
        enrichedData.earliestDueDate = dueDates[0];
      }
    }

    // Step 8: Check for loop closures (if enabled and using LLM)
    // Runs AFTER loop creation to ensure consistent state (excludes same-memory loops)
    let loopsClosed: string[] = [];
    if (!options.skipLoopClosureDetection && options.useLLM && options.llmClient) {
      loopsClosed = await checkLoopClosures(
        textContent,
        features,
        memento.agentId,
        memento.mementoId,
        options.llmClient
      );
    }

    return {
      success: true,
      enrichedData,
      openLoopsCreated,
      timelineEventsCreated,
      loopsClosed,
    };
  } catch (error) {
    console.error('[SalienceIntegration] Error enriching memento:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      openLoopsCreated: [],
      timelineEventsCreated: [],
      loopsClosed: [],
    };
  }
}

/**
 * Extract text content from a memento.
 */
function extractTextFromMemento(memento: MemoryMemento): string | null {
  // Try different content fields
  if (typeof memento.content === 'string') {
    return memento.content;
  }

  if (typeof memento.originalContentRaw === 'string') {
    return memento.originalContentRaw;
  }

  if (typeof memento.summary === 'string') {
    return memento.summary;
  }

  // Try to extract from object content
  if (memento.content && typeof memento.content === 'object') {
    const obj = memento.content as Record<string, any>;
    if (obj.text) return String(obj.text);
    if (obj.message) return String(obj.message);
    if (obj.content) return String(obj.content);
    if (obj.transcript) return String(obj.transcript);
  }

  // Try to stringify if object
  if (memento.content) {
    try {
      return JSON.stringify(memento.content);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Build capture context from memento and additional context.
 */
function buildCaptureContextFromMemento(
  memento: MemoryMemento,
  additionalContext?: Partial<CaptureContext>
): CaptureContext {
  const timestamp = new Date(memento.eventTimestamp || memento.createdAt);
  const baseContext = buildCaptureContext(timestamp);

  // Extract location from spatial context
  let location: string | undefined;
  if (memento.spatialContext?.locationName) {
    location = memento.spatialContext.locationName;
  }

  return {
    ...baseContext,
    location,
    ...additionalContext,
  };
}

/**
 * Check if features contain future references.
 */
function hasFeatureReferences(features: ExtractedFeatures): boolean {
  // Check for future dates
  const now = new Date();
  for (const date of features.datesMentioned) {
    if (date.resolved) {
      const dateObj = new Date(date.resolved);
      if (dateObj > now) return true;
    }
  }

  // Check for commitments with future due dates
  for (const commitment of features.commitments) {
    if (commitment.byWhen) {
      const dueDate = new Date(commitment.byWhen);
      if (dueDate > now) return true;
    }
  }

  return false;
}

/**
 * Merge salience data into a memento.
 * Use this to update the memento object before storage.
 */
export function mergeSalienceIntoMemento(
  memento: MemoryMemento,
  enrichedData: EnrichedMemoryData
): MemoryMemento & { salienceData: EnrichedMemoryData } {
  return {
    ...memento,
    salienceData: enrichedData,
    // Also add top-level fields for indexing
    metadata: {
      ...memento.metadata,
      salienceScore: enrichedData.salience.score,
      salienceComponents: enrichedData.salience.components,
      hasOpenLoops: enrichedData.hasOpenLoops,
      hasFutureReferences: enrichedData.hasFutureReferences,
      earliestDueDate: enrichedData.earliestDueDate,
      extractedPeople: enrichedData.extractedFeatures.peopleMentioned,
      extractedTopics: enrichedData.extractedFeatures.topics,
    },
  };
}

/**
 * Create a salience-aware ingestion integrator wrapper.
 * This wraps the existing IngestionIntegrator to add salience enrichment.
 */
export function createSalienceIngestionHooks(
  llmClient: LLMClient,
  defaultOptions?: Partial<SalienceEnrichmentOptions>
) {
  const options: SalienceEnrichmentOptions = {
    ...DEFAULT_OPTIONS,
    useLLM: true,
    llmClient,
    ...defaultOptions,
  };

  return {
    /**
     * Hook to call after memento construction.
     * Returns enriched memento and side effects.
     */
    async afterMementoConstruction(memento: MemoryMemento): Promise<{
      memento: MemoryMemento & { salienceData?: EnrichedMemoryData };
      sideEffects: {
        openLoops: OpenLoop[];
        timelineEvents: PersonTimelineEvent[];
        loopsClosed: string[];
      };
    }> {
      const result = await enrichMementoWithSalience(memento, options);

      if (result.success && result.enrichedData) {
        return {
          memento: mergeSalienceIntoMemento(memento, result.enrichedData),
          sideEffects: {
            openLoops: result.openLoopsCreated,
            timelineEvents: result.timelineEventsCreated,
            loopsClosed: result.loopsClosed,
          },
        };
      }

      // Return original memento if enrichment failed
      return {
        memento,
        sideEffects: {
          openLoops: [],
          timelineEvents: [],
          loopsClosed: [],
        },
      };
    },

    /**
     * Hook to call before retrieval to get salience-weighted results.
     */
    getRetrievalWeights() {
      return {
        semanticWeight: 0.6,
        salienceWeight: 0.4,
      };
    },
  };
}

/**
 * Express middleware for salience-enriched ingestion.
 * Use this to add salience to the ingestion API endpoint.
 */
export function salienceMiddleware(llmClient: LLMClient) {
  return async (req: any, res: any, next: any) => {
    // Attach salience hooks to the request
    req.salienceHooks = createSalienceIngestionHooks(llmClient);
    next();
  };
}
