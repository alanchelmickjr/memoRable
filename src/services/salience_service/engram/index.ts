/**
 * Engram-Style Conditional Memory Module
 *
 * This module implements predictive memory surfacing for memoRable, combining:
 *
 * 1. O(1) MULTI-HEAD HASHING (Engram Paper arXiv:2601.07372)
 *    - K=8 hash heads with distinct prime moduli
 *    - Vocabulary compression (23% reduction)
 *    - Redis hot tier + MongoDB warm tier
 *
 * 2. CONTEXT-AWARE GATING
 *    - Engram formula: α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *    - Threshold approximation for MVP
 *    - Neural gating for production quality
 *
 * 3. TEMPORAL PATTERN DETECTION (3×7 Model: 21→63 days)
 *    - FFT-based O(n log n) autocorrelation
 *    - Daily, weekly, monthly pattern detection
 *    - 3×7=21 days emerge, 3×7×3=63 days stable (~Lally et al 2009 median)
 *
 * 4. ZIPFIAN CACHE HIERARCHY
 *    - Hot (Redis, <1ms), Warm (MongoDB, ~5ms), Cold (S3, ~100ms)
 *    - Automatic promotion/demotion based on access frequency
 *    - ~20% of memories serve ~80% of requests
 *
 * 5. CONTINUAL LEARNING
 *    - Elastic Weight Consolidation (EWC) for anti-forgetting
 *    - Reservoir sampling replay buffer
 *    - Wide, shallow architecture (per Mirzadeh et al 2022)
 *
 * COMPETITIVE DIFFERENTIATION:
 * - TRUE anticipatory surfacing (no competitor does this)
 * - O(1) pattern lookup vs O(log n) vector search
 * - Integrated cache hierarchy
 * - Neural context gating
 * - Production continual learning
 */

// ============================================================================
// Type Exports
// ============================================================================

export * from './types';

// ============================================================================
// Multi-Head Hashing
// ============================================================================

export {
  // Classes
  EngramMultiHeadHash,
  TokenCompressor,
  // Functions
  normalizeToken,
  computeNgramHash,
  getPatternKey,
  parsePatternKey,
  extractNgrams,
  simpleTokenize,
} from './multi_head_hash';

// ============================================================================
// Context-Aware Gating
// ============================================================================

export {
  // Classes
  ThresholdGate,
  NeuralContextGate,
  // Factory
  createGate,
  // Constants
  DEFAULT_GATING_CONFIG,
  // Utilities
  rmsNorm,
  dotProduct,
  cosineSimilarity,
  sigmoid,
  linearProject,
  // Types
  type GateType,
} from './context_gate';

// ============================================================================
// Temporal Pattern Detection
// ============================================================================

export {
  // Classes
  TemporalPatternDetector,
  PredictiveContextSurface,
  MemoryPrefetcher,
  // FFT Functions
  fft,
  ifft,
  autocorrelation,
  // Constants
  DEFAULT_TEMPORAL_CONFIG,
  // Types
  type TemporalPatternDetectorConfig,
  type MemoryStore,
  type RedisClient as PrefetcherRedisClient,
} from './temporal_patterns';

// ============================================================================
// Zipfian Tier Manager
// ============================================================================

export {
  // Classes
  ZipfianTierManager,
  FrequencyTracker,
  // Constants
  MONGODB_INDEXES,
  // Types
  type RedisClient as TierRedisClient,
  type MongoCollection,
  type S3Client,
  type WeaviateClient,
} from './tier_manager';

// ============================================================================
// Continual Learning
// ============================================================================

export {
  // Classes
  ReplayBuffer,
  EWCRegularizer,
  UserPatternLearner,
  // Constants
  DEFAULT_CL_CONFIG,
} from './continual_learning';

// ============================================================================
// Version and Metadata
// ============================================================================

export const ENGRAM_VERSION = '1.0.0';
export const ENGRAM_ALGORITHM_VERSION = '1.0';

/**
 * Module initialization status
 */
export interface EngramStatus {
  version: string;
  algorithmVersion: string;
  features: {
    multiHeadHash: boolean;
    contextGating: boolean;
    temporalPatterns: boolean;
    zipfianTiers: boolean;
    continualLearning: boolean;
  };
  config: {
    hashHeads: number;
    embeddingDim: number;
    temporalWindowDays: number;
    replayBufferSize: number;
  };
}

/**
 * Get current Engram module status
 */
export function getEngramStatus(): EngramStatus {
  return {
    version: ENGRAM_VERSION,
    algorithmVersion: ENGRAM_ALGORITHM_VERSION,
    features: {
      multiHeadHash: true,
      contextGating: true,
      temporalPatterns: true,
      zipfianTiers: true,
      continualLearning: true,
    },
    config: {
      hashHeads: 8,
      embeddingDim: 64,
      temporalWindowDays: 63, // 3×7×3 model (~Lally research median)
      replayBufferSize: 5000,
    },
  };
}
