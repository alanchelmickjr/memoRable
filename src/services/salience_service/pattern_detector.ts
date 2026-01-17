/**
 * @file FFT-based Pattern Detector for Predictive Memory System
 *
 * Implements O(n log n) periodicity detection using Fast Fourier Transform.
 * Based on the 3×7 temporal model:
 * - 21 days: First patterns emerge
 * - 63 days: Patterns are reliable (3×7×3)
 * - 84 days: Max window before decay (3×7×4)
 */

import type {
  PatternType,
  DetectedPattern,
  TemporalPattern,
  TEMPORAL_WINDOWS,
  PATTERN_PERIODS,
} from './models.js';
import { collections } from './database.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Pattern detection periods in hours.
 */
const PERIODS: Record<number, PatternType> = {
  24: 'daily',
  168: 'weekly',         // 24×7
  504: 'tri_weekly',     // 24×7×3
  720: 'monthly',        // ~30 days
};

/**
 * Detection windows in hours based on 3×7 model.
 */
const WINDOWS = {
  detection: 21 * 24,    // 21 days in hours (3×7)
  stable: 63 * 24,       // 63 days in hours (3×7×3)
  max: 84 * 24,          // 84 days in hours (3×7×4)
};

/**
 * Minimum confidence threshold for pattern detection.
 */
const MIN_CONFIDENCE = 0.3;

// ============================================================================
// FFT Implementation (Cooley-Tukey radix-2)
// ============================================================================

/**
 * Complex number representation.
 */
interface Complex {
  re: number;
  im: number;
}

/**
 * Create a complex number.
 */
function complex(re: number, im: number = 0): Complex {
  return { re, im };
}

/**
 * Add two complex numbers.
 */
function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Subtract two complex numbers.
 */
function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Multiply two complex numbers.
 */
function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/**
 * Complex conjugate.
 */
function cConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

/**
 * Magnitude squared of a complex number.
 */
function cMagSq(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

/**
 * FFT (Cooley-Tukey radix-2 DIT).
 * Input must have length as a power of 2.
 */
function fft(input: Complex[]): Complex[] {
  const n = input.length;

  // Base case
  if (n <= 1) return input;

  // Ensure power of 2
  if (n & (n - 1)) {
    throw new Error('FFT input length must be a power of 2');
  }

  // Divide
  const even: Complex[] = [];
  const odd: Complex[] = [];
  for (let i = 0; i < n; i += 2) {
    even.push(input[i]);
    odd.push(input[i + 1]);
  }

  // Conquer
  const evenFFT = fft(even);
  const oddFFT = fft(odd);

  // Combine
  const result: Complex[] = new Array(n);
  for (let k = 0; k < n / 2; k++) {
    const t = Math.PI * 2 * k / n;
    const twiddle = complex(Math.cos(t), -Math.sin(t));
    const oddTerm = cMul(twiddle, oddFFT[k]);

    result[k] = cAdd(evenFFT[k], oddTerm);
    result[k + n / 2] = cSub(evenFFT[k], oddTerm);
  }

  return result;
}

/**
 * Inverse FFT.
 */
function ifft(input: Complex[]): Complex[] {
  const n = input.length;

  // Conjugate input
  const conjugated = input.map(cConj);

  // Forward FFT
  const result = fft(conjugated);

  // Conjugate and scale
  return result.map(c => complex(c.re / n, -c.im / n));
}

/**
 * Pad array to next power of 2.
 */
function padToPowerOf2(arr: number[]): number[] {
  const n = arr.length;
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  const padded = new Array(nextPow2).fill(0);
  for (let i = 0; i < n; i++) {
    padded[i] = arr[i];
  }
  return padded;
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Convert timestamps to hourly time series.
 * @param timestamps - Array of Unix timestamps (milliseconds)
 * @returns Hourly event count series
 */
function toHourlySeries(timestamps: number[]): number[] {
  if (timestamps.length === 0) return [];

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const hours = Math.ceil((maxTs - minTs) / 3600000) + 1;

  const series = new Array(hours).fill(0);
  for (const ts of timestamps) {
    const idx = Math.floor((ts - minTs) / 3600000);
    series[idx]++;
  }

  return series;
}

/**
 * Compute autocorrelation using FFT.
 * ACF(τ) = IFFT(|FFT(x)|²)
 */
function autocorrelation(series: number[]): number[] {
  const n = series.length;
  if (n === 0) return [];

  // Pad to power of 2
  const padded = padToPowerOf2(series);
  const paddedN = padded.length;

  // Convert to complex
  const complexInput = padded.map(x => complex(x));

  // FFT
  const fftResult = fft(complexInput);

  // Power spectrum |FFT(x)|²
  const powerSpectrum = fftResult.map(c => complex(cMagSq(c)));

  // IFFT of power spectrum
  const acfComplex = ifft(powerSpectrum);

  // Extract real part and normalize
  const acf = acfComplex.slice(0, n).map(c => c.re);
  const acf0 = acf[0] || 1;

  return acf.map(v => v / acf0);
}

/**
 * Find peak times in the folded series.
 * @param series - Time series
 * @param period - Period to fold by (hours)
 * @returns Top 3 peak hour indices
 */
function findPeakTimes(series: number[], period: number): number[] {
  const nPeriods = Math.floor(series.length / period);
  if (nPeriods === 0) return [];

  // Fold series by period
  const folded = new Array(period).fill(0);
  for (let i = 0; i < nPeriods; i++) {
    for (let j = 0; j < period; j++) {
      const idx = i * period + j;
      if (idx < series.length) {
        folded[j] += series[idx];
      }
    }
  }

  // Normalize
  for (let j = 0; j < period; j++) {
    folded[j] /= nPeriods;
  }

  // Find top 3 peaks
  const indexed = folded.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => b.value - a.value);

  return indexed.slice(0, 3).map(x => x.index);
}

/**
 * Calculate stability (days until pattern is considered stable).
 * Target: 63 days (3×7×3).
 */
function calculateStability(dataHours: number, period: number, confidence: number): number {
  const dataDays = Math.floor(dataHours / 24);

  if (dataDays >= 63 && confidence >= 0.5) {
    return 63; // Fully stable
  } else if (dataDays >= 21 && confidence >= 0.3) {
    return 21; // Initially formed
  }

  return 0; // Not yet stable
}

// ============================================================================
// Main Detector Class
// ============================================================================

/**
 * FFT-based pattern detector for temporal patterns in memory access.
 */
export class PatternDetector {
  private minConfidence: number;

  constructor(minConfidence: number = MIN_CONFIDENCE) {
    this.minConfidence = minConfidence;
  }

  /**
   * Detect temporal patterns from access timestamps.
   *
   * @param timestamps - Array of Unix timestamps (milliseconds) when memory was accessed
   * @returns Map of pattern type to detected pattern
   */
  detect(timestamps: number[]): Map<PatternType, DetectedPattern> {
    const patterns = new Map<PatternType, DetectedPattern>();

    if (timestamps.length < 2) {
      return patterns;
    }

    const series = toHourlySeries(timestamps);
    const n = series.length;

    // Need at least 21 days of data
    if (n < WINDOWS.detection) {
      return patterns;
    }

    // Compute autocorrelation
    const acf = autocorrelation(series);

    // Check each period
    for (const [periodStr, patternType] of Object.entries(PERIODS)) {
      const period = parseInt(periodStr, 10);

      if (period >= n) continue;
      if (acf[0] === 0) continue;

      const confidence = acf[period];

      if (confidence >= this.minConfidence) {
        const stability = calculateStability(n, period, confidence);

        patterns.set(patternType, {
          periodHours: period,
          confidence,
          patternType,
          peakTimes: findPeakTimes(series, period),
          stabilityDays: stability,
        });
      }
    }

    return patterns;
  }

  /**
   * Detect patterns for a specific memory from stored access history.
   *
   * @param userId - User identifier
   * @param memoryId - Memory identifier
   * @returns Temporal pattern or null if not enough data
   */
  async detectFromHistory(
    userId: string,
    memoryId: string
  ): Promise<TemporalPattern | null> {
    const accessHistory = collections.accessHistory();

    // Get access history for this memory (last 84 days)
    const cutoff = new Date(Date.now() - WINDOWS.max * 3600000);
    const history = await accessHistory
      .find({
        userId,
        memoryId,
        timestamp: { $gte: cutoff },
      })
      .sort({ timestamp: 1 })
      .toArray();

    if (history.length < 2) {
      return null;
    }

    // Extract timestamps
    const timestamps = history.map(h => new Date(h.timestamp).getTime());

    // Detect patterns
    const patterns = this.detect(timestamps);

    if (patterns.size === 0) {
      return null;
    }

    // Return the highest confidence pattern
    let bestPattern: DetectedPattern | null = null;
    const patternValues = Array.from(patterns.values());
    for (const pattern of patternValues) {
      if (!bestPattern || pattern.confidence > bestPattern.confidence) {
        bestPattern = pattern;
      }
    }

    if (!bestPattern) {
      return null;
    }

    // Convert to TemporalPattern
    return {
      hourPattern: bestPattern.peakTimes[0],
      dayPattern:
        bestPattern.patternType === 'weekly'
          ? Math.floor(bestPattern.peakTimes[0] / 24) % 7
          : undefined,
      confidence: bestPattern.confidence,
      patternType: bestPattern.patternType,
      peakTimes: bestPattern.peakTimes,
      stabilityDays: bestPattern.stabilityDays,
    };
  }

  /**
   * Update detected patterns for a user's memories in batch.
   *
   * @param userId - User identifier
   * @param memoryIds - List of memory IDs to update
   */
  async updatePatternsForUser(userId: string, memoryIds: string[]): Promise<void> {
    const detectedPatterns = collections.detectedPatterns();
    const now = new Date();

    for (const memoryId of memoryIds) {
      const pattern = await this.detectFromHistory(userId, memoryId);

      if (pattern && pattern.patternType) {
        // Find the period hours for this pattern type
        const periodEntry = Object.entries(PERIODS).find(
          ([, pType]) => pType === pattern.patternType
        );
        const periodHours = periodEntry ? parseInt(periodEntry[0], 10) : 24;

        // Upsert the detected pattern
        await detectedPatterns.updateOne(
          { userId, memoryId },
          {
            $set: {
              patternType: pattern.patternType,
              periodHours,
              confidence: pattern.confidence,
              peakTimes: pattern.peakTimes || [],
              stabilityDays: pattern.stabilityDays || 0,
              lastUpdated: now,
            },
            $setOnInsert: {
              firstDetected: now,
            },
          },
          { upsert: true }
        );
      }
    }
  }

  /**
   * Get all stable patterns for a user.
   *
   * @param userId - User identifier
   * @param minStabilityDays - Minimum stability days (default: 21)
   * @returns Array of detected patterns
   */
  async getStablePatterns(
    userId: string,
    minStabilityDays: number = 21
  ): Promise<Array<{ memoryId: string; pattern: DetectedPattern }>> {
    const detectedPatterns = collections.detectedPatterns();

    const results = await detectedPatterns
      .find({
        userId,
        stabilityDays: { $gte: minStabilityDays },
        confidence: { $gte: this.minConfidence },
      })
      .sort({ confidence: -1 })
      .toArray();

    return results.map(r => ({
      memoryId: r.memoryId,
      pattern: {
        periodHours: r.periodHours,
        confidence: r.confidence,
        patternType: r.patternType,
        peakTimes: r.peakTimes,
        stabilityDays: r.stabilityDays,
      },
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let detectorInstance: PatternDetector | null = null;

/**
 * Get or create the pattern detector singleton.
 */
export function getPatternDetector(minConfidence?: number): PatternDetector {
  if (!detectorInstance) {
    detectorInstance = new PatternDetector(minConfidence);
  }
  return detectorInstance;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Record a memory access for pattern detection.
 *
 * @param userId - User identifier
 * @param memoryId - Memory identifier
 * @param contextFrame - Optional context frame at access time
 */
export async function recordMemoryAccess(
  userId: string,
  memoryId: string,
  contextFrame?: {
    location?: string;
    people?: string[];
    activity?: string;
    project?: string;
  }
): Promise<void> {
  const accessHistory = collections.accessHistory();

  await accessHistory.insertOne({
    userId,
    memoryId,
    timestamp: new Date(),
    contextFrame,
  });
}

/**
 * Get access history for a user within a time window.
 *
 * @param userId - User identifier
 * @param days - Number of days to look back (default: 63)
 * @returns Array of access records
 */
export async function getAccessHistory(
  userId: string,
  days: number = 63
): Promise<Array<{ memoryId: string; timestamp: Date }>> {
  const accessHistory = collections.accessHistory();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await accessHistory
    .find({
      userId,
      timestamp: { $gte: cutoff },
    })
    .sort({ timestamp: -1 })
    .toArray();

  return results.map(r => ({
    memoryId: r.memoryId,
    timestamp: r.timestamp,
  }));
}
