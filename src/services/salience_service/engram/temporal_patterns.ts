/**
 * Temporal Pattern Detection with FFT-Based Autocorrelation
 *
 * RESEARCH CORRECTION:
 * The "21-day habit formation" is a MYTH.
 *
 * Lally et al. (2009) UCL Study "How are habits formed":
 * - Median: 66 days
 * - Range: 18-254 days
 * - Complexity dependent
 *
 * This module detects daily, weekly, and monthly patterns using O(n log n)
 * FFT-based autocorrelation, with learning windows based on actual research.
 */

import type {
  TemporalPattern,
  UserTemporalPatterns,
  AnticipatedMemory,
  PredictiveContext,
  PeriodType,
} from './types';
import { TEMPORAL_WINDOWS, PERIOD_TYPES } from './types';

// ============================================================================
// FFT Implementation (Pure TypeScript)
// ============================================================================

/**
 * Cooley-Tukey FFT algorithm
 * O(n log n) complexity for power-of-2 lengths
 */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey iterative FFT
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = (-2 * Math.PI) / len;

    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const thetaK = angle * k;
        const cosK = Math.cos(thetaK);
        const sinK = Math.sin(thetaK);

        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;

        const tRe = cosK * real[oddIdx] - sinK * imag[oddIdx];
        const tIm = sinK * real[oddIdx] + cosK * imag[oddIdx];

        real[oddIdx] = real[evenIdx] - tRe;
        imag[oddIdx] = imag[evenIdx] - tIm;
        real[evenIdx] = real[evenIdx] + tRe;
        imag[evenIdx] = imag[evenIdx] + tIm;
      }
    }
  }
}

/**
 * Inverse FFT
 */
export function ifft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  // Conjugate
  for (let i = 0; i < n; i++) {
    imag[i] = -imag[i];
  }

  // Forward FFT
  fft(real, imag);

  // Conjugate and scale
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

/**
 * Pad array to next power of 2
 */
function padToPowerOf2(arr: number[]): Float64Array {
  const n = arr.length;
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  const padded = new Float64Array(nextPow2);
  for (let i = 0; i < n; i++) {
    padded[i] = arr[i];
  }
  return padded;
}

/**
 * Compute autocorrelation via FFT
 * O(n log n) complexity
 */
export function autocorrelation(series: number[]): Float64Array {
  const real = padToPowerOf2(series);
  const imag = new Float64Array(real.length);
  const n = real.length;

  // Forward FFT
  fft(real, imag);

  // Compute power spectrum (|FFT|^2)
  for (let i = 0; i < n; i++) {
    real[i] = real[i] * real[i] + imag[i] * imag[i];
    imag[i] = 0;
  }

  // Inverse FFT of power spectrum = autocorrelation
  ifft(real, imag);

  return real;
}

// ============================================================================
// Temporal Pattern Detector
// ============================================================================

export interface TemporalPatternDetectorConfig {
  minConfidence: number;
  learningWindows: typeof TEMPORAL_WINDOWS;
}

export const DEFAULT_TEMPORAL_CONFIG: TemporalPatternDetectorConfig = {
  minConfidence: 0.3,
  learningWindows: TEMPORAL_WINDOWS,
};

export class TemporalPatternDetector {
  private config: TemporalPatternDetectorConfig;

  constructor(config: Partial<TemporalPatternDetectorConfig> = {}) {
    this.config = { ...DEFAULT_TEMPORAL_CONFIG, ...config };
  }

  /**
   * Convert timestamps to hourly binned time series
   */
  private toHourlySeries(timestamps: number[], values?: number[]): number[] {
    if (timestamps.length === 0) return [];

    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const hours = Math.ceil((maxTs - minTs) / 3600) + 1;
    const series = new Array(hours).fill(0);

    for (let i = 0; i < timestamps.length; i++) {
      const hourIdx = Math.floor((timestamps[i] - minTs) / 3600);
      series[hourIdx] += values ? values[i] : 1;
    }

    return series;
  }

  /**
   * Find peak activity times within the period
   */
  private findPeakTimes(series: number[], period: number): number[] {
    const nPeriods = Math.floor(series.length / period);
    if (nPeriods === 0) return [];

    // Fold time series at period length
    const folded = new Array(period).fill(0);
    for (let i = 0; i < nPeriods; i++) {
      for (let j = 0; j < period; j++) {
        folded[j] += series[i * period + j];
      }
    }

    // Normalize
    for (let j = 0; j < period; j++) {
      folded[j] /= nPeriods;
    }

    // Find top 3 peak indices
    const indexed = folded.map((val, idx) => ({ val, idx }));
    indexed.sort((a, b) => b.val - a.val);

    return indexed.slice(0, 3).map((x) => x.idx);
  }

  /**
   * Detect daily, weekly, monthly patterns in user behavior
   *
   * @param timestamps Unix timestamps of user events (seconds)
   * @param values Optional intensity values (default: count-based)
   * @returns Dictionary of detected patterns by type
   */
  detectPatterns(
    timestamps: number[],
    values?: number[]
  ): Record<PeriodType, TemporalPattern | null> {
    const patterns: Record<PeriodType, TemporalPattern | null> = {
      daily: null,
      weekly: null,
      monthly: null,
    };

    // Convert to hourly time series
    const timeSeries = this.toHourlySeries(timestamps, values);
    const n = timeSeries.length;

    // Need at least initial window (21 days in hours)
    if (n < this.config.learningWindows.initial * 24) {
      return patterns;
    }

    // Compute autocorrelation via FFT
    const acf = autocorrelation(timeSeries);

    // Check each period
    for (const [periodStr, patternType] of Object.entries(PERIOD_TYPES)) {
      const period = parseInt(periodStr, 10);

      if (period < n && acf[0] > 0) {
        const confidence = acf[period] / acf[0];

        if (confidence >= this.config.minConfidence) {
          const peakTimes = this.findPeakTimes(timeSeries, period);

          patterns[patternType as PeriodType] = {
            periodHours: period,
            confidence,
            patternType: patternType as PeriodType,
            peakTimes,
          };
        }
      }
    }

    return patterns;
  }

  /**
   * Get user's temporal patterns with stability assessment
   */
  async getUserPatterns(
    userId: string,
    timestamps: number[]
  ): Promise<UserTemporalPatterns> {
    if (timestamps.length === 0) {
      return {
        userId,
        patterns: { daily: null, weekly: null, monthly: null },
        dataStartDate: new Date(),
        dataPointCount: 0,
        isReady: false,
        isStable: false,
      };
    }

    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const daysCovered = (maxTs - minTs) / 86400;

    const patterns = this.detectPatterns(timestamps);

    return {
      userId,
      patterns,
      dataStartDate: new Date(minTs * 1000),
      dataPointCount: timestamps.length,
      isReady: daysCovered >= this.config.learningWindows.initial,
      isStable: daysCovered >= this.config.learningWindows.stable,
    };
  }
}

// ============================================================================
// Predictive Context Surfacing
// ============================================================================

export interface MemoryStore {
  getUserMemories(userId: string): Promise<Array<{
    id: string;
    content: string;
    importance: number;
    lastAccessed: number; // Unix timestamp
    embedding?: Float32Array;
  }>>;
}

/**
 * Anticipatory memory surfacing based on temporal patterns
 */
export class PredictiveContextSurface {
  private detector: TemporalPatternDetector;
  private memoryStore: MemoryStore;
  private userPatterns: Map<string, UserTemporalPatterns> = new Map();

  constructor(
    memoryStore: MemoryStore,
    detector?: TemporalPatternDetector
  ) {
    this.memoryStore = memoryStore;
    this.detector = detector || new TemporalPatternDetector();
  }

  /**
   * Update user's temporal patterns from access history
   */
  async updatePatterns(userId: string, accessTimestamps: number[]): Promise<void> {
    const patterns = await this.detector.getUserPatterns(userId, accessTimestamps);
    this.userPatterns.set(userId, patterns);
  }

  /**
   * Predict and surface relevant memories before user asks
   *
   * Based on:
   * 1. Temporal patterns (what does user need at this time?)
   * 2. Recency decay (recent memories more relevant)
   * 3. Historical co-occurrence (what memories appear together?)
   */
  async getAnticipatedContext(
    userId: string,
    currentTime: number = Date.now() / 1000
  ): Promise<PredictiveContext> {
    const patterns = this.userPatterns.get(userId);
    const memories = await this.memoryStore.getUserMemories(userId);

    const hourOfDay = Math.floor((currentTime % 86400) / 3600);
    const dayOfWeek = Math.floor((currentTime / 86400) % 7);

    const anticipatedMemories: AnticipatedMemory[] = [];

    for (const mem of memories) {
      let score = 0;

      // Daily pattern match
      if (patterns?.patterns.daily) {
        const dailyPattern = patterns.patterns.daily;
        if (dailyPattern.peakTimes.includes(hourOfDay)) {
          score += dailyPattern.confidence * 0.4;
        }
      }

      // Weekly pattern match
      if (patterns?.patterns.weekly) {
        const weeklyPattern = patterns.patterns.weekly;
        const weeklyHour = dayOfWeek * 24 + hourOfDay;
        if (weeklyPattern.peakTimes.includes(weeklyHour)) {
          score += weeklyPattern.confidence * 0.3;
        }
      }

      // Recency decay (exponential with 7-day half-life)
      const ageDays = (currentTime - mem.lastAccessed) / 86400;
      const recencyScore = Math.exp(-ageDays * Math.log(2) / 7);
      score += recencyScore * 0.3;

      if (score > 0.1) {
        const matchedPattern = this.determineMatchedPattern(
          patterns,
          hourOfDay,
          dayOfWeek
        );

        anticipatedMemories.push({
          memoryId: mem.id,
          content: mem.content,
          anticipationScore: score,
          matchedPattern,
          patternConfidence: matchedPattern
            ? patterns?.patterns[matchedPattern]?.confidence
            : undefined,
          recencyScore,
          reason: this.generateReason(matchedPattern, recencyScore, dayOfWeek, hourOfDay),
        });
      }
    }

    // Sort by anticipation score, return top 5
    anticipatedMemories.sort((a, b) => b.anticipationScore - a.anticipationScore);

    return {
      userId,
      currentTime: new Date(currentTime * 1000),
      hourOfDay,
      dayOfWeek,
      anticipatedMemories: anticipatedMemories.slice(0, 5),
      prefetchedToHot: [], // Will be filled by prefetcher
    };
  }

  /**
   * Determine which pattern type matched
   */
  private determineMatchedPattern(
    patterns: UserTemporalPatterns | undefined,
    hourOfDay: number,
    dayOfWeek: number
  ): PeriodType | undefined {
    if (!patterns) return undefined;

    if (patterns.patterns.daily?.peakTimes.includes(hourOfDay)) {
      return 'daily';
    }

    const weeklyHour = dayOfWeek * 24 + hourOfDay;
    if (patterns.patterns.weekly?.peakTimes.includes(weeklyHour)) {
      return 'weekly';
    }

    return undefined;
  }

  /**
   * Generate human-readable reason for anticipation
   */
  private generateReason(
    pattern: PeriodType | undefined,
    recencyScore: number,
    dayOfWeek: number,
    hourOfDay: number
  ): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeOfDay =
      hourOfDay < 6 ? 'early morning' :
      hourOfDay < 12 ? 'morning' :
      hourOfDay < 17 ? 'afternoon' :
      hourOfDay < 21 ? 'evening' : 'night';

    if (pattern === 'daily') {
      return `You typically access this in the ${timeOfDay}`;
    }

    if (pattern === 'weekly') {
      return `You typically access this on ${dayNames[dayOfWeek]}s`;
    }

    if (recencyScore > 0.7) {
      return 'Recently accessed';
    }

    return 'Based on your usage patterns';
  }

  /**
   * Get pattern statistics for a user
   */
  getPatternStats(userId: string): UserTemporalPatterns | undefined {
    return this.userPatterns.get(userId);
  }
}

// ============================================================================
// Memory Prefetcher
// ============================================================================

export interface RedisClient {
  hset(key: string, field: string, value: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pipeline(): {
    hset(key: string, mapping: Record<string, string>): void;
    expire(key: string, seconds: number): void;
    exec(): Promise<Array<[Error | null, unknown]>>;
  };
}

/**
 * Async prefetch anticipated memories to hot cache
 */
export class MemoryPrefetcher {
  private redis: RedisClient;
  private predictor: PredictiveContextSurface;
  private prefetchQueue: Array<{ userId: string; currentTime: number }> = [];
  private isProcessing = false;

  constructor(
    redisClient: RedisClient,
    predictor: PredictiveContextSurface
  ) {
    this.redis = redisClient;
    this.predictor = predictor;
  }

  /**
   * Schedule prefetch for upcoming session
   */
  async schedulePrefetch(userId: string): Promise<void> {
    const currentTime = Date.now() / 1000;
    this.prefetchQueue.push({ userId, currentTime });
    await this.processPrefetchQueue();
  }

  /**
   * Process prefetch queue (background worker pattern)
   */
  private async processPrefetchQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.prefetchQueue.length > 0) {
        const request = this.prefetchQueue.shift();
        if (!request) break;

        const { userId, currentTime } = request;

        // Get predicted memories
        const anticipated = await this.predictor.getAnticipatedContext(
          userId,
          currentTime
        );

        // Prefetch to Redis hot cache
        const pipeline = this.redis.pipeline();

        for (const mem of anticipated.anticipatedMemories) {
          const key = `memory:${userId}:${mem.memoryId}`;
          pipeline.hset(key, {
            content: mem.content,
            anticipation_score: mem.anticipationScore.toString(),
            prefetched: 'true',
          });
          pipeline.expire(key, 3600); // 1 hour TTL
        }

        await pipeline.exec();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get prefetch queue status
   */
  getQueueLength(): number {
    return this.prefetchQueue.length;
  }
}
