/**
 * Context-Aware Gating (Engram Formula)
 *
 * The Engram gating formula suppresses irrelevant retrieved patterns by computing
 * semantic alignment between current context and retrieved memory:
 *
 *   α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *
 * Where:
 *   h_t = Current hidden state (query/context embedding)
 *   e_t = Retrieved memory embedding
 *   W_K = Key projection matrix (learnable)
 *   σ = Sigmoid → gate α_t ∈ (0, 1)
 *
 * Two implementations provided:
 * 1. Neural gating (recommended for quality) - uses learnable projections
 * 2. Threshold approximation (MVP) - uses cosine similarity with soft threshold
 */

import type { GatingConfig, GatingResult, GatedMemory } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_GATING_CONFIG: GatingConfig = {
  hiddenDim: 1024,
  memoryDim: 1024,
  similarityThreshold: 0.5,
  decayFactor: 0.1,
  minGate: 0.3,
};

// ============================================================================
// Mathematical Utilities
// ============================================================================

/**
 * Root Mean Square Normalization (RMSNorm)
 * Gradient-stable normalization without mean subtraction
 */
export function rmsNorm(vec: Float32Array, eps: number = 1e-6): Float32Array {
  const n = vec.length;
  let sumSq = 0;

  for (let i = 0; i < n; i++) {
    sumSq += vec[i] * vec[i];
  }

  const rms = Math.sqrt(sumSq / n + eps);
  const result = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    result[i] = vec[i] / rms;
  }

  return result;
}

/**
 * Dot product of two vectors
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dot / denominator : 0;
}

/**
 * Sigmoid activation
 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Linear projection (W · x)
 * For MVP: random projection matrix initialized once
 */
export function linearProject(
  input: Float32Array,
  weights: Float32Array,
  outputDim: number
): Float32Array {
  const inputDim = input.length;
  const result = new Float32Array(outputDim);

  for (let i = 0; i < outputDim; i++) {
    let sum = 0;
    for (let j = 0; j < inputDim; j++) {
      sum += input[j] * weights[i * inputDim + j];
    }
    result[i] = sum;
  }

  return result;
}

// ============================================================================
// Threshold-Based Gating (MVP - No Learning Required)
// ============================================================================

/**
 * Non-neural gating approximation using cosine similarity
 * Start with this for MVP, migrate to neural gating as training data accumulates
 */
export class ThresholdGate {
  private config: GatingConfig;

  constructor(config: Partial<GatingConfig> = {}) {
    this.config = { ...DEFAULT_GATING_CONFIG, ...config };
  }

  /**
   * Compute gate value ∈ [0, 1] based on cosine similarity
   * Uses soft sigmoid-like thresholding instead of hard cutoff
   */
  computeGate(contextEmbedding: Float32Array, memoryEmbedding: Float32Array): number {
    const similarity = cosineSimilarity(contextEmbedding, memoryEmbedding);

    // Soft sigmoid-like gate centered at threshold
    // Steepness factor of 10 provides reasonable transition
    const gate = sigmoid(10 * (similarity - this.config.similarityThreshold));

    return gate;
  }

  /**
   * Apply gate to memory embedding
   */
  applyGate(memoryEmbedding: Float32Array, gateScore: number): Float32Array {
    const result = new Float32Array(memoryEmbedding.length);

    for (let i = 0; i < memoryEmbedding.length; i++) {
      result[i] = gateScore * memoryEmbedding[i];
    }

    return result;
  }

  /**
   * Filter memories by gate threshold
   */
  filterMemories(
    contextEmb: Float32Array,
    memories: Array<{ id: string; content: string; embedding: Float32Array }>
  ): GatedMemory[] {
    const gatedMemories: GatedMemory[] = [];

    for (const mem of memories) {
      const gateScore = this.computeGate(contextEmb, mem.embedding);

      if (gateScore >= this.config.minGate) {
        gatedMemories.push({
          memoryId: mem.id,
          content: mem.content,
          embedding: mem.embedding,
          gateScore,
          relevanceReason: `Similarity: ${(gateScore * 100).toFixed(1)}%`,
        });
      }
    }

    // Sort by gate score descending
    return gatedMemories.sort((a, b) => b.gateScore - a.gateScore);
  }

  /**
   * Get configuration
   */
  getConfig(): GatingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Neural Gating (Full Engram Formula)
// ============================================================================

/**
 * Learnable gating per Engram formula:
 *   α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *
 * Requires weight initialization and optional training.
 * For production, train on user feedback about memory relevance.
 */
export class NeuralContextGate {
  private config: GatingConfig;
  private wK: Float32Array; // Key projection weights
  private wV: Float32Array; // Value projection weights
  private scale: number;

  constructor(config: Partial<GatingConfig> = {}) {
    this.config = { ...DEFAULT_GATING_CONFIG, ...config };
    this.scale = 1 / Math.sqrt(this.config.hiddenDim);

    // Initialize weights with Xavier/Glorot initialization
    this.wK = this.initializeWeights(this.config.memoryDim, this.config.hiddenDim);
    this.wV = this.initializeWeights(this.config.memoryDim, this.config.hiddenDim);
  }

  /**
   * Xavier/Glorot weight initialization
   */
  private initializeWeights(inputDim: number, outputDim: number): Float32Array {
    const weights = new Float32Array(outputDim * inputDim);
    const stdv = Math.sqrt(2.0 / (inputDim + outputDim));

    for (let i = 0; i < weights.length; i++) {
      // Box-Muller transform for Gaussian random
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      weights[i] = z * stdv;
    }

    return weights;
  }

  /**
   * Forward pass: compute gate score and gated value
   *
   * @param hT Current context embedding [hiddenDim]
   * @param eT Retrieved memory embedding [memoryDim]
   * @returns Gated value and gate score
   */
  forward(hT: Float32Array, eT: Float32Array): GatingResult {
    // Project memory to key and value
    const kT = linearProject(eT, this.wK, this.config.hiddenDim);
    const vT = linearProject(eT, this.wV, this.config.hiddenDim);

    // RMSNorm both vectors
    const hNormed = rmsNorm(hT);
    const kNormed = rmsNorm(kT);

    // Compute gate via scaled dot product
    const dotProd = dotProduct(hNormed, kNormed);
    const gateScore = sigmoid(dotProd * this.scale);

    // Apply gate to value
    const gatedValue = new Float32Array(vT.length);
    for (let i = 0; i < vT.length; i++) {
      gatedValue[i] = gateScore * vT[i];
    }

    return {
      gatedValue,
      gateScore,
      passedThreshold: gateScore >= this.config.minGate,
    };
  }

  /**
   * Filter memories using neural gating
   */
  filterMemories(
    contextEmb: Float32Array,
    memories: Array<{ id: string; content: string; embedding: Float32Array }>
  ): GatedMemory[] {
    const gatedMemories: GatedMemory[] = [];

    for (const mem of memories) {
      const result = this.forward(contextEmb, mem.embedding);

      if (result.passedThreshold) {
        gatedMemories.push({
          memoryId: mem.id,
          content: mem.content,
          embedding: mem.embedding,
          gateScore: result.gateScore,
          relevanceReason: `Neural gate: ${(result.gateScore * 100).toFixed(1)}%`,
        });
      }
    }

    return gatedMemories.sort((a, b) => b.gateScore - a.gateScore);
  }

  /**
   * Update weights from training signal (gradient step)
   * For production: accumulate gradients from user feedback
   */
  updateWeights(
    gradWK: Float32Array,
    gradWV: Float32Array,
    learningRate: number = 0.001
  ): void {
    for (let i = 0; i < this.wK.length; i++) {
      this.wK[i] -= learningRate * gradWK[i];
    }

    for (let i = 0; i < this.wV.length; i++) {
      this.wV[i] -= learningRate * gradWV[i];
    }
  }

  /**
   * Serialize weights for persistence
   */
  toJSON(): { wK: number[]; wV: number[]; config: GatingConfig } {
    return {
      wK: Array.from(this.wK),
      wV: Array.from(this.wV),
      config: this.config,
    };
  }

  /**
   * Restore from persistence
   */
  static fromJSON(data: { wK: number[]; wV: number[]; config: GatingConfig }): NeuralContextGate {
    const gate = new NeuralContextGate(data.config);
    gate.wK = new Float32Array(data.wK);
    gate.wV = new Float32Array(data.wV);
    return gate;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export type GateType = 'threshold' | 'neural';

/**
 * Create appropriate gate based on configuration
 * Start with 'threshold' for MVP, upgrade to 'neural' when training data available
 */
export function createGate(
  type: GateType,
  config: Partial<GatingConfig> = {}
): ThresholdGate | NeuralContextGate {
  if (type === 'neural') {
    return new NeuralContextGate(config);
  }
  return new ThresholdGate(config);
}
