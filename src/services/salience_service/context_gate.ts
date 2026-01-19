/**
 * @file Context-Aware Gate - Engram-style Memory Gating
 *
 * Implements context-aware gating for memory retrieval.
 * Based on the Engram paper: suppresses retrieved memories that
 * don't align with the current context.
 *
 * Formula: α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *
 * This module provides both:
 * 1. Neural gating (for production with embeddings)
 * 2. Threshold gating (fallback using cosine similarity)
 */

import type { ContextFrame, PredictiveMemoryDocument, AnticipatedMemory, SecurityTier } from './models.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Gate result with score and gated value.
 */
export interface GateResult {
  /** Gate score (0-1), higher means more relevant */
  gateScore: number;
  /** Whether the memory passed the gate */
  passed: boolean;
  /** Reason for pass/fail (for debugging) */
  reason?: string;
}

/**
 * Memory with embedding for neural gating.
 */
export interface MemoryWithEmbedding {
  memoryId: string;
  content: string;
  embedding: number[];
  contextFrame?: ContextFrame;
}

/**
 * Context with embedding for neural gating.
 */
export interface ContextWithEmbedding {
  frame: ContextFrame;
  embedding: number[];
}

// ============================================================================
// RMSNorm Implementation
// ============================================================================

/**
 * Root Mean Square Layer Normalization.
 * RMSNorm(x) = x / sqrt(mean(x²) + ε)
 */
function rmsNorm(vector: number[], epsilon: number = 1e-8): number[] {
  const n = vector.length;
  if (n === 0) return [];

  // Compute mean of squares
  let sumSquares = 0;
  for (let i = 0; i < n; i++) {
    sumSquares += vector[i] * vector[i];
  }
  const rms = Math.sqrt(sumSquares / n + epsilon);

  // Normalize
  return vector.map(v => v / rms);
}

/**
 * Dot product of two vectors.
 */
function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProd = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProd += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProd / denom : 0;
}

/**
 * Sigmoid function.
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ============================================================================
// Context-Aware Gate (Neural)
// ============================================================================

/**
 * Neural context-aware gate using learned projections.
 *
 * Uses the Engram-style gating formula:
 * α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *
 * Where:
 * - h_t is the current context embedding
 * - e_t is the memory embedding
 * - W_K is a learned key projection (simplified here)
 * - d is the embedding dimension
 */
export class NeuralContextGate {
  private hiddenDim: number;
  private scale: number;

  constructor(hiddenDim: number = 1024) {
    this.hiddenDim = hiddenDim;
    this.scale = 1 / Math.sqrt(hiddenDim);
  }

  /**
   * Compute gate score for a memory given the current context.
   *
   * @param contextEmbedding - Current context embedding [dim]
   * @param memoryEmbedding - Retrieved memory embedding [dim]
   * @returns Gate score (0-1)
   */
  computeGate(contextEmbedding: number[], memoryEmbedding: number[]): number {
    // Normalize both embeddings with RMSNorm
    const ctxNorm = rmsNorm(contextEmbedding);
    const memNorm = rmsNorm(memoryEmbedding);

    // Scaled dot product attention
    const attention = dotProduct(ctxNorm, memNorm) * this.scale;

    // Sigmoid to get gate score
    return sigmoid(attention);
  }

  /**
   * Gate a memory and return weighted value with gate score.
   *
   * @param contextEmbedding - Current context embedding
   * @param memory - Memory with embedding
   * @param threshold - Minimum gate score to pass (default: 0.5)
   * @returns Gate result
   */
  gate(
    contextEmbedding: number[],
    memory: MemoryWithEmbedding,
    threshold: number = 0.5
  ): GateResult {
    const gateScore = this.computeGate(contextEmbedding, memory.embedding);

    return {
      gateScore,
      passed: gateScore >= threshold,
      reason: gateScore >= threshold
        ? `High context alignment (${(gateScore * 100).toFixed(1)}%)`
        : `Low context alignment (${(gateScore * 100).toFixed(1)}% < ${threshold * 100}% threshold)`,
    };
  }

  /**
   * Filter and rank memories by context relevance.
   *
   * @param contextEmbedding - Current context embedding
   * @param memories - List of memories with embeddings
   * @param threshold - Minimum gate score to include
   * @returns Filtered and sorted memories
   */
  filterByContext(
    contextEmbedding: number[],
    memories: MemoryWithEmbedding[],
    threshold: number = 0.5
  ): Array<MemoryWithEmbedding & { gateScore: number }> {
    const scored = memories.map(memory => ({
      ...memory,
      gateScore: this.computeGate(contextEmbedding, memory.embedding),
    }));

    return scored
      .filter(m => m.gateScore >= threshold)
      .sort((a, b) => b.gateScore - a.gateScore);
  }
}

// ============================================================================
// Context-Aware Gate (Threshold / Non-Neural)
// ============================================================================

/**
 * Simple threshold-based context gate using cosine similarity.
 * Fallback for when neural embeddings aren't available.
 */
export class ThresholdContextGate {
  private threshold: number;
  private steepness: number;

  /**
   * @param threshold - Cosine similarity threshold (default: 0.5)
   * @param steepness - Sigmoid steepness (default: 10)
   */
  constructor(threshold: number = 0.5, steepness: number = 10) {
    this.threshold = threshold;
    this.steepness = steepness;
  }

  /**
   * Compute gate score using cosine similarity.
   */
  compute(contextEmbedding: number[], memoryEmbedding: number[]): number {
    const similarity = cosineSimilarity(contextEmbedding, memoryEmbedding);
    // Soft threshold using sigmoid
    return sigmoid(this.steepness * (similarity - this.threshold));
  }

  /**
   * Gate a memory.
   */
  gate(
    contextEmbedding: number[],
    memory: MemoryWithEmbedding,
    minScore: number = 0.5
  ): GateResult {
    const gateScore = this.compute(contextEmbedding, memory.embedding);

    return {
      gateScore,
      passed: gateScore >= minScore,
      reason: gateScore >= minScore
        ? `Sufficient similarity (${(gateScore * 100).toFixed(1)}%)`
        : `Insufficient similarity (${(gateScore * 100).toFixed(1)}%)`,
    };
  }
}

// ============================================================================
// Semantic Context Gate (Text-Based)
// ============================================================================

/**
 * Text-based context gate using keyword overlap and semantic features.
 * For when we don't have embeddings but need context filtering.
 */
export class SemanticContextGate {
  /**
   * Compute context similarity based on context frame overlap.
   *
   * @param currentContext - Current context frame
   * @param memoryContext - Memory's stored context frame
   * @returns Similarity score (0-1)
   */
  computeContextSimilarity(
    currentContext: ContextFrame,
    memoryContext: ContextFrame | undefined
  ): number {
    if (!memoryContext) {
      return 0.3; // Default score for memories without context
    }

    let matches = 0;
    let total = 0;

    // Location match
    if (currentContext.location || memoryContext.location) {
      total++;
      if (
        currentContext.location &&
        memoryContext.location &&
        currentContext.location.toLowerCase() === memoryContext.location.toLowerCase()
      ) {
        matches++;
      }
    }

    // Activity match
    if (currentContext.activity || memoryContext.activity) {
      total++;
      if (
        currentContext.activity &&
        memoryContext.activity &&
        currentContext.activity.toLowerCase() === memoryContext.activity.toLowerCase()
      ) {
        matches++;
      }
    }

    // Project match
    if (currentContext.project || memoryContext.project) {
      total++;
      if (
        currentContext.project &&
        memoryContext.project &&
        currentContext.project.toLowerCase() === memoryContext.project.toLowerCase()
      ) {
        matches++;
      }
    }

    // People overlap (Jaccard similarity)
    const currPeople = new Set((currentContext.people || []).map(p => p.toLowerCase()));
    const memPeople = new Set((memoryContext.people || []).map(p => p.toLowerCase()));

    if (currPeople.size > 0 || memPeople.size > 0) {
      total++;

      const currArray = Array.from(currPeople);
      const memArray = Array.from(memPeople);
      const intersection = new Set(currArray.filter(p => memPeople.has(p)));
      const union = new Set(currArray.concat(memArray));

      if (union.size > 0) {
        matches += intersection.size / union.size;
      }
    }

    return total > 0 ? matches / total : 0.5;
  }

  /**
   * Gate memories based on context frame similarity.
   *
   * @param currentContext - Current context frame
   * @param memories - List of memories to filter
   * @param minSimilarity - Minimum similarity to pass (default: 0.3)
   * @returns Filtered and scored memories
   */
  filterByContext(
    currentContext: ContextFrame,
    memories: PredictiveMemoryDocument[],
    minSimilarity: number = 0.3
  ): Array<PredictiveMemoryDocument & { contextScore: number }> {
    const scored = memories.map(memory => ({
      ...memory,
      contextScore: this.computeContextSimilarity(currentContext, memory.contextFrame),
    }));

    return scored
      .filter(m => m.contextScore >= minSimilarity)
      .sort((a, b) => b.contextScore - a.contextScore);
  }

  /**
   * Apply context gating to anticipated memories.
   *
   * @param currentContext - Current context frame
   * @param anticipated - Anticipated memories
   * @param minSimilarity - Minimum similarity threshold
   * @returns Gated anticipated memories
   */
  gateAnticipated(
    currentContext: ContextFrame,
    anticipated: AnticipatedMemory[],
    minSimilarity: number = 0.2
  ): AnticipatedMemory[] {
    return anticipated
      .map(memory => {
        const contextScore = this.computeContextSimilarity(
          currentContext,
          memory.contextFrame
        );

        // Boost anticipation score with context relevance
        const boostedScore = memory.anticipationScore * (0.7 + 0.3 * contextScore);

        return {
          ...memory,
          anticipationScore: boostedScore,
          anticipationReasons: [
            ...memory.anticipationReasons,
            contextScore >= 0.5
              ? `High context match (${(contextScore * 100).toFixed(0)}%)`
              : undefined,
          ].filter(Boolean) as string[],
        };
      })
      .filter(m => m.anticipationScore >= minSimilarity * 0.5)
      .sort((a, b) => b.anticipationScore - a.anticipationScore);
  }
}

// ============================================================================
// Appropriateness Filter - The Judgment Layer
// "The correct answer is NOT always the right answer"
// ============================================================================

/**
 * Filter context for appropriateness decisions.
 */
export interface AppropriatenessContext {
  /** Where the user is */
  location?: 'home' | 'office' | 'public' | 'medical' | 'unknown';
  /** Device type and ownership */
  device?: {
    type: 'personal_phone' | 'work_laptop' | 'shared_tablet' | 'ar_glasses' | 'terminal';
    isShared?: boolean;
  };
  /** Who's in the room/conversation */
  participants?: string[];
  /** Relationship hints for participants */
  participantRoles?: Record<string, 'boss' | 'coworker' | 'spouse' | 'child' | 'friend' | 'stranger'>;
  /** Current emotional state from prosody */
  emotionalState?: {
    distressScore: number;
    isDistressed: boolean;
  };
  /** Filter strictness */
  filterLevel?: 'strict' | 'moderate' | 'relaxed';
}

/**
 * Result of appropriateness check.
 */
export interface AppropriatenessResult {
  /** Whether it's appropriate to surface */
  appropriate: boolean;
  /** Why it passed or failed */
  reason: string;
  /** Which filter blocked it (if blocked) */
  blockedBy?: 'privacy' | 'location' | 'device' | 'participants' | 'emotional' | 'trajectory';
  /** Suggestion for what to do instead */
  alternative?: string;
}

/**
 * Memory with metadata needed for appropriateness filtering.
 */
export interface MemoryForFiltering {
  memoryId: string;
  content: string;
  securityTier?: SecurityTier;
  /** Content categories detected */
  categories?: string[];
  /** People mentioned in memory */
  mentionedPeople?: string[];
  /** Is this about relationships/crushes/intimate */
  isIntimate?: boolean;
  /** Is this medical/health related */
  isMedical?: boolean;
  /** Is this financial */
  isFinancial?: boolean;
  /** Is this work-complaint/job-search related */
  isCareerSensitive?: boolean;
}

/**
 * Appropriateness Filter - determines if a relevant memory SHOULD be surfaced.
 *
 * This is the judgment layer that sits on top of relevance scoring.
 * A memory can be highly relevant but inappropriate to surface given context.
 */
export class AppropriatenessFilter {
  /**
   * Check if a memory is appropriate to surface given current context.
   */
  check(
    memory: MemoryForFiltering,
    context: AppropriatenessContext,
    wasExplicitlyRequested: boolean = false
  ): AppropriatenessResult {
    const filterLevel = context.filterLevel || 'moderate';

    // Filter 1: Privacy Tier
    const privacyResult = this.checkPrivacyTier(memory, wasExplicitlyRequested);
    if (!privacyResult.appropriate) return privacyResult;

    // Filter 2: Location
    const locationResult = this.checkLocation(memory, context.location, filterLevel);
    if (!locationResult.appropriate) return locationResult;

    // Filter 3: Device
    const deviceResult = this.checkDevice(memory, context.device, filterLevel);
    if (!deviceResult.appropriate) return deviceResult;

    // Filter 4: Participants
    const participantsResult = this.checkParticipants(
      memory,
      context.participants,
      context.participantRoles,
      filterLevel
    );
    if (!participantsResult.appropriate) return participantsResult;

    // Filter 5: Emotional State
    const emotionalResult = this.checkEmotionalState(memory, context.emotionalState, filterLevel);
    if (!emotionalResult.appropriate) return emotionalResult;

    // All filters passed
    return {
      appropriate: true,
      reason: 'Passed all appropriateness filters',
    };
  }

  /**
   * Filter 1: Privacy Tier - Tier 2/3 content needs explicit request.
   */
  private checkPrivacyTier(
    memory: MemoryForFiltering,
    wasExplicitlyRequested: boolean
  ): AppropriatenessResult {
    if (memory.securityTier === 'Tier3_Vault' && !wasExplicitlyRequested) {
      return {
        appropriate: false,
        reason: 'Vault-level memory requires explicit request',
        blockedBy: 'privacy',
        alternative: 'Ask specifically for this information',
      };
    }

    if (memory.securityTier === 'Tier2_Personal' && !wasExplicitlyRequested) {
      // Personal tier is blocked in general queries, but can be warned
      return {
        appropriate: false,
        reason: 'Personal memory not surfaced in general queries',
        blockedBy: 'privacy',
        alternative: 'Available if you ask specifically',
      };
    }

    return { appropriate: true, reason: 'Privacy tier OK' };
  }

  /**
   * Filter 2: Location - Don't surface sensitive content in public.
   */
  private checkLocation(
    memory: MemoryForFiltering,
    location: AppropriatenessContext['location'],
    filterLevel: 'strict' | 'moderate' | 'relaxed'
  ): AppropriatenessResult {
    if (filterLevel === 'relaxed' || !location) {
      return { appropriate: true, reason: 'Location filter relaxed' };
    }

    if (location === 'public' || location === 'office') {
      if (memory.isIntimate) {
        return {
          appropriate: false,
          reason: `Intimate content not appropriate in ${location} setting`,
          blockedBy: 'location',
        };
      }

      if (memory.isMedical && location === 'public') {
        return {
          appropriate: false,
          reason: 'Medical information not surfaced in public',
          blockedBy: 'location',
        };
      }

      if (memory.isFinancial && location === 'public') {
        return {
          appropriate: false,
          reason: 'Financial information not surfaced in public',
          blockedBy: 'location',
        };
      }

      if (memory.isCareerSensitive && location === 'office') {
        return {
          appropriate: false,
          reason: 'Career-sensitive content blocked in office setting',
          blockedBy: 'location',
        };
      }
    }

    return { appropriate: true, reason: 'Location appropriate' };
  }

  /**
   * Filter 3: Device - Shared/work devices get stricter filtering.
   */
  private checkDevice(
    memory: MemoryForFiltering,
    device: AppropriatenessContext['device'],
    filterLevel: 'strict' | 'moderate' | 'relaxed'
  ): AppropriatenessResult {
    if (filterLevel === 'relaxed' || !device) {
      return { appropriate: true, reason: 'Device filter relaxed' };
    }

    if (device.isShared || device.type === 'work_laptop') {
      if (memory.securityTier === 'Tier2_Personal' || memory.securityTier === 'Tier3_Vault') {
        return {
          appropriate: false,
          reason: 'Personal content not shown on shared/work device',
          blockedBy: 'device',
          alternative: 'Switch to personal device for this content',
        };
      }

      if (memory.isIntimate || memory.isMedical) {
        return {
          appropriate: false,
          reason: 'Sensitive content blocked on shared device',
          blockedBy: 'device',
        };
      }
    }

    return { appropriate: true, reason: 'Device appropriate' };
  }

  /**
   * Filter 4: Participants - Don't surface content inappropriate for who's listening.
   */
  private checkParticipants(
    memory: MemoryForFiltering,
    participants: string[] | undefined,
    participantRoles: Record<string, string> | undefined,
    filterLevel: 'strict' | 'moderate' | 'relaxed'
  ): AppropriatenessResult {
    if (filterLevel === 'relaxed' || !participants || participants.length === 0) {
      return { appropriate: true, reason: 'Participant filter relaxed' };
    }

    const roles = participantRoles || {};

    for (const participant of participants) {
      const role = roles[participant] || 'unknown';

      // Boss in room - filter career complaints, salary, job search
      if (role === 'boss' && memory.isCareerSensitive) {
        return {
          appropriate: false,
          reason: `Career-sensitive content blocked with ${participant} (boss) present`,
          blockedBy: 'participants',
        };
      }

      // Child present - filter adult content
      if (role === 'child' && (memory.isIntimate || memory.isFinancial)) {
        return {
          appropriate: false,
          reason: `Adult content blocked with child present`,
          blockedBy: 'participants',
        };
      }

      // Stranger present - filter most personal content
      if (role === 'stranger') {
        if (memory.securityTier !== 'Tier1_General') {
          return {
            appropriate: false,
            reason: 'Personal content blocked with strangers present',
            blockedBy: 'participants',
          };
        }
      }

      // Check if memory mentions someone in the room inappropriately
      if (memory.mentionedPeople?.includes(participant) && memory.isIntimate) {
        return {
          appropriate: false,
          reason: `Memory about ${participant} is intimate - not appropriate with them present`,
          blockedBy: 'participants',
          alternative: 'Available when alone',
        };
      }
    }

    return { appropriate: true, reason: 'Participants appropriate' };
  }

  /**
   * Filter 5: Emotional State - Don't pile on when distressed.
   */
  private checkEmotionalState(
    memory: MemoryForFiltering,
    emotionalState: AppropriatenessContext['emotionalState'],
    filterLevel: 'strict' | 'moderate' | 'relaxed'
  ): AppropriatenessResult {
    if (filterLevel === 'relaxed' || !emotionalState) {
      return { appropriate: true, reason: 'Emotional filter relaxed' };
    }

    if (emotionalState.isDistressed && emotionalState.distressScore < -10) {
      // User is distressed - be gentle
      // TODO: Add memory emotional valence detection
      // For now, just note that we're in distress mode
      // Could block memories tagged as anxiety-inducing, loss-related, etc.
    }

    return { appropriate: true, reason: 'Emotional state appropriate' };
  }

  /**
   * Filter multiple memories and return only appropriate ones.
   */
  filterMemories<T extends MemoryForFiltering>(
    memories: T[],
    context: AppropriatenessContext,
    wasExplicitlyRequested: boolean = false
  ): Array<T & { appropriatenessResult: AppropriatenessResult }> {
    return memories
      .map(memory => ({
        ...memory,
        appropriatenessResult: this.check(memory, context, wasExplicitlyRequested),
      }))
      .filter(m => m.appropriatenessResult.appropriate);
  }
}

// Singleton instance
let appropriatenessFilterInstance: AppropriatenessFilter | null = null;

export function getAppropriatenessFilter(): AppropriatenessFilter {
  if (!appropriatenessFilterInstance) {
    appropriatenessFilterInstance = new AppropriatenessFilter();
  }
  return appropriatenessFilterInstance;
}

// ============================================================================
// Composite Context Gate
// ============================================================================

/**
 * Composite gate that combines multiple gating strategies.
 */
export class CompositeContextGate {
  private neuralGate: NeuralContextGate;
  private thresholdGate: ThresholdContextGate;
  private semanticGate: SemanticContextGate;

  constructor(options: {
    hiddenDim?: number;
    threshold?: number;
    steepness?: number;
  } = {}) {
    this.neuralGate = new NeuralContextGate(options.hiddenDim || 1024);
    this.thresholdGate = new ThresholdContextGate(
      options.threshold || 0.5,
      options.steepness || 10
    );
    this.semanticGate = new SemanticContextGate();
  }

  /**
   * Gate memories using the best available method.
   *
   * If embeddings are available, uses neural gating.
   * If only context frames are available, uses semantic gating.
   *
   * @param context - Current context (frame + optional embedding)
   * @param memories - Memories to gate
   * @param threshold - Gate threshold
   */
  gate(
    context: { frame: ContextFrame; embedding?: number[] },
    memories: Array<PredictiveMemoryDocument & { embedding?: number[] }>,
    threshold: number = 0.5
  ): Array<PredictiveMemoryDocument & { gateScore: number }> {
    // If we have embeddings, prefer neural gating
    if (context.embedding && memories.some(m => m.embedding)) {
      const withEmbeddings = memories.filter(m => m.embedding);
      const withoutEmbeddings = memories.filter(m => !m.embedding);

      // Neural gate for memories with embeddings
      const neuralResults = withEmbeddings.map(m => ({
        ...m,
        gateScore: this.neuralGate.computeGate(context.embedding!, m.embedding!),
      }));

      // Semantic gate for memories without embeddings
      const semanticResults = this.semanticGate
        .filterByContext(context.frame, withoutEmbeddings, threshold)
        .map(m => ({
          ...m,
          gateScore: m.contextScore,
        }));

      return [...neuralResults, ...semanticResults]
        .filter(m => m.gateScore >= threshold)
        .sort((a, b) => b.gateScore - a.gateScore);
    }

    // Fall back to semantic gating
    return this.semanticGate
      .filterByContext(context.frame, memories, threshold)
      .map(m => ({
        ...m,
        gateScore: m.contextScore,
      }));
  }

  /**
   * Get the semantic gate for direct use.
   */
  getSemanticGate(): SemanticContextGate {
    return this.semanticGate;
  }

  /**
   * Get the neural gate for direct use.
   */
  getNeuralGate(): NeuralContextGate {
    return this.neuralGate;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let compositeGateInstance: CompositeContextGate | null = null;

/**
 * Get or create the composite context gate singleton.
 */
export function getContextGate(): CompositeContextGate {
  if (!compositeGateInstance) {
    compositeGateInstance = new CompositeContextGate();
  }
  return compositeGateInstance;
}

// ============================================================================
// Export Helpers
// ============================================================================

export {
  rmsNorm,
  dotProduct,
  cosineSimilarity,
  sigmoid,
};
