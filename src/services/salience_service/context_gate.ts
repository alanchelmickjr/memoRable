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

import type { ContextFrame, PredictiveMemoryDocument, AnticipatedMemory } from './models.js';

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
