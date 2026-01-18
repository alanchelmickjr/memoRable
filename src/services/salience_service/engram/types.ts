/**
 * Engram-Style Conditional Memory Types
 *
 * Based on Engram paper (arXiv:2601.07372, January 2026):
 * - O(1) multi-head hashing for pattern lookup
 * - Context-aware gating formula: α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 * - Zipfian cache hierarchies (Hot/Warm/Cold)
 *
 * Research corrections:
 * - 66-day habit formation (NOT 21 days - that's a myth)
 * - Per Lally et al 2009 (UCL): 18-254 day range, 66 day median
 */

// ============================================================================
// Multi-Head Hashing (Engram Paper)
// ============================================================================

/**
 * K=8 prime moduli for multi-head collision mitigation
 * Distinct primes reduce collision overlap across heads
 */
export const ENGRAM_PRIMES = [
  10007, 10009, 10037, 10039, 10061, 10067, 10069, 10079,
] as const;

export const ENGRAM_CONFIG = {
  /** Number of hash heads */
  K: 8,
  /** Embedding dimension per head */
  embeddingDim: 64,
  /** Vocabulary compression ratio (23% reduction) */
  vocabCompressionRatio: 0.77,
  /** Original vocabulary size (GPT-style) */
  originalVocabSize: 129280,
} as const;

export interface EngramPatternKey {
  ngramType: 2 | 3; // bigram or trigram
  headIndex: number; // 0-7
  hashValue: number; // result of multi-head hash
}

export interface EngramPattern {
  patternKey: string; // e.g., "engram:2gram:h0:10007"
  ngramTokens: number[]; // Compressed token IDs
  embedding: Float32Array; // 64-dim embedding
  accessCount: number; // For Zipfian tier promotion
  lastAccessed: Date;
  layerId: number; // Engram insertion layer (1 or 15)
}

export interface MultiHeadHashResult {
  embeddings: Float32Array[];
  keys: string[];
  collisionDetected: boolean;
}

// ============================================================================
// Context-Aware Gating (Engram Formula)
// ============================================================================

/**
 * Gating formula components:
 * α_t = σ(RMSNorm(h_t)ᵀ · RMSNorm(W_K·e_t) / √d)
 *
 * h_t = Current hidden state (query/context embedding)
 * e_t = Retrieved memory embedding
 * W_K = Key projection matrix (learnable)
 * σ = Sigmoid → gate α_t ∈ (0, 1)
 */
export interface GatingConfig {
  hiddenDim: number; // Typically 1024
  memoryDim: number; // Typically 1024
  /** Threshold for threshold-based approximation (MVP) */
  similarityThreshold: number; // Default 0.5
  /** Decay factor for soft thresholding */
  decayFactor: number; // Default 0.1
  /** Minimum gate value to pass through */
  minGate: number; // Default 0.3
}

export interface GatedMemory {
  memoryId: string;
  content: string;
  embedding: Float32Array;
  gateScore: number; // α_t ∈ (0, 1)
  relevanceReason?: string;
}

export interface GatingResult {
  gatedValue: Float32Array;
  gateScore: number;
  passedThreshold: boolean;
}

// ============================================================================
// Temporal Pattern Detection (66-Day Window)
// ============================================================================

/**
 * RESEARCH CORRECTION: 21 days is a MYTH
 *
 * Lally et al. (2009) UCL Study "How are habits formed":
 * - Median: 66 days
 * - Range: 18-254 days
 * - Complexity dependent
 *
 * Our learning windows reflect this research.
 */
export const TEMPORAL_WINDOWS = {
  /** Pattern detection starts (initial signal) */
  initial: 21,
  /** Stable habit formation (research median) */
  stable: 66,
  /** Maximum rolling window cap */
  max: 90,
} as const;

export const PERIOD_TYPES = {
  24: 'daily',
  168: 'weekly', // 24 * 7
  720: 'monthly', // ~30 days
} as const;

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface TemporalPattern {
  periodHours: number;
  confidence: number; // 0-1 from FFT autocorrelation
  patternType: PeriodType;
  peakTimes: number[]; // Top activity hours within period
}

export interface TemporalPatternDetectorConfig {
  minConfidence: number; // Default 0.3
  learningWindows: typeof TEMPORAL_WINDOWS;
}

export interface UserTemporalPatterns {
  userId: string;
  patterns: Record<PeriodType, TemporalPattern | null>;
  dataStartDate: Date;
  dataPointCount: number;
  isReady: boolean; // Has 21+ days of data
  isStable: boolean; // Has 66+ days of data
}

// ============================================================================
// Zipfian Cache Hierarchy (Hot/Warm/Cold)
// ============================================================================

/**
 * Zipfian (power-law) distribution: ~20% of memories serve ~80% of requests
 * Design tiers to optimize for this distribution.
 */
export type CacheTier = 'hot' | 'warm' | 'cold';

export interface TierConfig {
  /** Accesses/hour threshold for hot tier promotion */
  hotThreshold: number; // Default 10
  /** Accesses/day threshold for warm tier */
  warmThreshold: number; // Default 1
  /** Hot tier TTL in seconds */
  hotTtl: number; // Default 3600 (1 hour)
  /** Warm tier TTL in seconds */
  warmTtl: number; // Default 604800 (7 days)
  /** Cold tier TTL in seconds */
  coldTtl: number; // Default 31536000 (1 year)
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  hotThreshold: 10,
  warmThreshold: 1,
  hotTtl: 3600,
  warmTtl: 604800,
  coldTtl: 31536000,
};

/**
 * Tier latency targets:
 * - Hot (Redis): <1ms
 * - Warm (MongoDB): ~5ms
 * - Cold (S3): ~100ms
 */
export interface TieredMemory {
  memoryId: string;
  userId: string;
  content: string;
  summary?: string;
  importance: number; // 0-1
  accessCount: number;
  createdAt: Date;
  lastAccessed: Date;
  tier: CacheTier;
  tags: string[];
  vectorRef?: string; // Weaviate UUID
  temporalMetadata?: {
    hourPattern: number; // 0-23
    dayPattern: number; // 0-6
    patternConfidence: number;
  };
}

export interface TierPromotionEvent {
  memoryId: string;
  fromTier: CacheTier;
  toTier: CacheTier;
  reason: 'access_frequency' | 'prefetch' | 'manual';
  timestamp: Date;
}

// ============================================================================
// Continual Learning (Anti-Forgetting)
// ============================================================================

/**
 * Based on Mirzadeh et al. (2022) "Architecture Matters in Continual Learning":
 * - Width > Depth (3-4 layers, 512-1024 units)
 * - Replace BatchNorm with LayerNorm
 * - Avoid aggressive Global Average Pooling
 */
export interface ContinualLearningConfig {
  /** Maximum replay buffer size */
  replayBufferSize: number; // Default 5000
  /** EWC lambda (regularization strength) */
  ewcLambda: number; // Default 100
  /** Number of samples for Fisher computation */
  fisherSamples: number; // Default 200
  /** Model architecture */
  architecture: {
    inputDim: number;
    hiddenDim: number; // Recommended 512-1024
    layers: number; // Recommended 3-4
    patternTypes: number; // Output dimension
  };
}

export interface ReplaySample {
  input: Float32Array;
  target: Float32Array;
  taskId: string;
  timestamp: Date;
}

export interface EWCState {
  /** Saved parameters from previous tasks */
  savedParams: Map<string, Float32Array>;
  /** Fisher information diagonal */
  fisherDiagonal: Map<string, Float32Array>;
  /** Number of tasks seen */
  taskCount: number;
}

export interface ContinualLearningMetrics {
  forgettingRate: number; // How much old knowledge is lost
  forwardTransfer: number; // How much new tasks benefit from old
  backwardTransfer: number; // How much old tasks improve from new
  averageAccuracy: number;
}

// ============================================================================
// Predictive Memory Surfacing
// ============================================================================

export interface AnticipatedMemory {
  memoryId: string;
  content: string;
  anticipationScore: number; // 0-1
  matchedPattern?: PeriodType;
  patternConfidence?: number;
  recencyScore: number;
  reason: string;
}

export interface PredictiveContext {
  userId: string;
  currentTime: Date;
  hourOfDay: number;
  dayOfWeek: number;
  anticipatedMemories: AnticipatedMemory[];
  prefetchedToHot: string[]; // Memory IDs moved to hot cache
}

export interface PrefetchRequest {
  userId: string;
  targetTime: Date;
  priority: 'high' | 'medium' | 'low';
}

// ============================================================================
// MCP Tool Interfaces
// ============================================================================

export interface StoreMemoryInput {
  content: string;
  tags?: string[];
  importance?: number;
  predictiveHints?: {
    triggerTopics?: string[];
    temporalRelevance?: 'ephemeral' | 'short-term' | 'long-term' | 'permanent';
  };
}

export interface SearchMemoriesInput {
  query: string;
  limit?: number;
  filters?: {
    tags?: string[];
    minImportance?: number;
    timeRange?: {
      from?: string;
      to?: string;
    };
  };
}

export interface GetAnticipatedContextInput {
  currentContext: string;
  userIntent?: string;
  maxMemories?: number;
}

export interface GetAnticipatedContextOutput {
  anticipatedMemories: Array<{
    id: string;
    content: string;
    relevanceScore: number;
    relevanceReason: string;
  }>;
}

// ============================================================================
// Competitive Differentiation
// ============================================================================

/**
 * memoRable differentiation from Mem0/Zep/Letta/AWS AgentCore:
 *
 * 1. TRUE ANTICIPATORY SURFACING
 *    - No competitor proactively predicts needed context
 *    - Uses temporal behavior patterns over 66-day window
 *
 * 2. O(1) ENGRAM-STYLE LOOKUP
 *    - All competitors rely on O(log n) or O(n) vector search
 *    - Multi-head hashing provides constant-time pattern retrieval
 *
 * 3. INTEGRATED CACHE HIERARCHY
 *    - No competitor implements Zipfian-optimized tiering
 *    - Hot/Warm/Cold with automatic promotion/demotion
 *
 * 4. NEURAL CONTEXT GATING
 *    - Only Letta has self-editing; none have learned suppression
 *    - Gating formula suppresses irrelevant retrieved patterns
 *
 * 5. PRODUCTION CONTINUAL LEARNING
 *    - Most rely on simple versioning, not anti-forgetting algorithms
 *    - EWC + Replay Buffer prevents catastrophic forgetting
 */
export const COMPETITIVE_FEATURES = {
  predictiveSurfacing: true,
  o1PatternLookup: true,
  zipfianCaching: true,
  neuralGating: true,
  continualLearning: true,
} as const;

// ============================================================================
// Implementation Roadmap
// ============================================================================

/**
 * Phase 1 (Foundation): MongoDB schema, Redis hot cache, Weaviate vectors, basic MCP
 * Phase 2 (Predictive Core): Temporal patterns, anticipatory surfacing, prefetcher
 * Phase 3 (Advanced Memory): Multi-head hashing, neural gating, Zipfian tiers, CL pipeline
 * Phase 4 (Production): Consistency, consolidation jobs, monitoring, observability
 */
export const IMPLEMENTATION_PHASES = {
  foundation: ['mongo_schema', 'redis_hot_cache', 'weaviate_vectors', 'basic_mcp'],
  predictiveCore: ['temporal_detector', 'anticipatory_surface', 'prefetcher', 'anticipated_context_tool'],
  advancedMemory: ['multi_head_hash', 'neural_gating', 'tier_manager', 'continual_learning'],
  production: ['consistency', 'consolidation', 'monitoring', 'observability'],
} as const;
