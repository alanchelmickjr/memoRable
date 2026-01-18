/**
 * @file Predictive Anticipation Service
 *
 * Enhanced anticipation service that integrates:
 * - FFT-based pattern detection (63-day stable patterns)
 * - Tier-aware memory retrieval
 * - Context-aware gating
 * - Temporal window support (3×7 model)
 *
 * This service predicts and surfaces relevant memories BEFORE the user queries.
 */

import type {
  ContextFrame,
  PredictiveMemoryDocument,
  AnticipatedMemory,
  AnticipationResult,
  AnticipationInput,
  TemporalPattern,
  PatternType,
  MemoryOpenLoop,
  TEMPORAL_WINDOWS,
} from './models.js';
import { collections } from './database.js';
import { getPatternDetector, recordMemoryAccess } from './pattern_detector.js';
import { getTierManager } from './tier_manager.js';
import { getContextGate, SemanticContextGate } from './context_gate.js';
import {
  storeAnticipatedMemories,
  getAnticipatedMemories,
  getContextFrame as getRedisContextFrame,
} from '../../config/redis.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Anticipation scoring weights.
 */
const ANTICIPATION_WEIGHTS = {
  temporal: 0.40,      // Temporal pattern match
  context: 0.30,       // Context frame match
  openLoop: 0.20,      // Unresolved open loops
  recency: 0.10,       // Recency decay
};

/**
 * Time windows for anticipation.
 */
const TIME_WINDOWS = {
  patternStable: 63,   // Days for stable pattern
  patternFormation: 21,// Days for pattern formation
  decayHalfLife: 7,    // Days for recency half-life
  lookaheadDefault: 60,// Minutes to look ahead
};

/**
 * Confidence thresholds.
 */
const THRESHOLDS = {
  minConfidence: 0.3,
  predictionReady: 0.7,
  patternFormation: 0.6,
  habitConfirmation: 0.8,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current hour (0-23) and day of week (0-6).
 */
function getCurrentTimeSlot(): { hour: number; day: number } {
  const now = new Date();
  return {
    hour: now.getHours(),
    day: now.getDay(),
  };
}

/**
 * Check if a time slot matches a pattern.
 *
 * @param currentHour - Current hour (0-23)
 * @param currentDay - Current day of week (0-6)
 * @param pattern - Temporal pattern to match
 * @param tolerance - Hour tolerance (default: 2)
 */
function matchesPattern(
  currentHour: number,
  currentDay: number,
  pattern: TemporalPattern,
  tolerance: number = 2
): boolean {
  if (!pattern.patternType) return false;

  // Daily pattern: check hour within tolerance
  if (pattern.patternType === 'daily' && pattern.hourPattern !== undefined) {
    const hourDiff = Math.abs(currentHour - pattern.hourPattern);
    return hourDiff <= tolerance || hourDiff >= (24 - tolerance);
  }

  // Weekly pattern: check day and hour
  if (pattern.patternType === 'weekly') {
    if (pattern.dayPattern !== undefined && pattern.dayPattern !== currentDay) {
      return false;
    }
    if (pattern.hourPattern !== undefined) {
      const hourDiff = Math.abs(currentHour - pattern.hourPattern);
      return hourDiff <= tolerance || hourDiff >= (24 - tolerance);
    }
    return true;
  }

  // Tri-weekly: similar to weekly but every 3 weeks
  if (pattern.patternType === 'tri_weekly') {
    // For now, treat similarly to weekly (could be enhanced with week counting)
    if (pattern.dayPattern !== undefined && pattern.dayPattern !== currentDay) {
      return false;
    }
    return true;
  }

  // Monthly: check if we're in the right part of the month
  if (pattern.patternType === 'monthly') {
    // Simplified: just check if in the same week of month
    const weekOfMonth = Math.floor(new Date().getDate() / 7);
    const patternWeek = pattern.dayPattern !== undefined ? pattern.dayPattern : 0;
    return Math.abs(weekOfMonth - patternWeek) <= 1;
  }

  return false;
}

/**
 * Calculate recency decay factor.
 * Uses exponential decay with 7-day half-life.
 */
function calculateRecencyDecay(lastAccessed: Date): number {
  const now = Date.now();
  const ageMs = now - lastAccessed.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  // Exponential decay: e^(-λt) where λ = ln(2)/halfLife
  const lambda = Math.log(2) / TIME_WINDOWS.decayHalfLife;
  return Math.exp(-lambda * ageDays);
}

/**
 * Calculate open loop urgency score.
 * Higher score for loops closer to due date.
 */
function calculateOpenLoopUrgency(openLoop: MemoryOpenLoop | undefined): number {
  if (!openLoop || openLoop.resolved) {
    return 0;
  }

  if (!openLoop.dueDate) {
    return 0.3; // Some urgency for loops without due date
  }

  const now = Date.now();
  const dueTime = openLoop.dueDate.getTime();
  const daysUntilDue = (dueTime - now) / (24 * 60 * 60 * 1000);

  if (daysUntilDue < 0) {
    return 1.0; // Overdue - maximum urgency
  }

  if (daysUntilDue <= 7) {
    return 1 - (daysUntilDue / 7);
  }

  return 0.1; // Low urgency for distant due dates
}

// ============================================================================
// Main Anticipation Service
// ============================================================================

/**
 * Enhanced Anticipation Service with 63-day pattern support.
 */
export class PredictiveAnticipationService {
  private patternDetector = getPatternDetector();
  private tierManager = getTierManager();
  private contextGate = getContextGate();
  private semanticGate = new SemanticContextGate();

  /**
   * Get anticipated memories for the current context.
   *
   * @param input - Anticipation input parameters
   * @returns Anticipation result with scored memories
   */
  async getAnticipated(input: AnticipationInput): Promise<AnticipationResult> {
    const {
      userId,
      contextFrame,
      maxMemories = 5,
      lookaheadMinutes = TIME_WINDOWS.lookaheadDefault,
    } = input;

    const { hour, day } = getCurrentTimeSlot();
    const patternsUsed: string[] = [];
    const anticipatedMemories: AnticipatedMemory[] = [];

    // 1. Get stable patterns for this user
    const stablePatterns = await this.patternDetector.getStablePatterns(
      userId,
      TIME_WINDOWS.patternFormation
    );

    // 2. Get context frame (from input or Redis cache)
    const currentContext = contextFrame || await this.getCurrentContext(userId);

    // 3. Get candidate memories based on patterns and context
    const predictiveMemories = collections.predictiveMemories();

    // Query memories that might be relevant
    const candidates = await predictiveMemories
      .find({
        userId,
        tier: { $in: ['hot', 'warm'] }, // Don't anticipate cold memories
      })
      .sort({ importance: -1, lastAccessed: -1 })
      .limit(100)
      .toArray();

    // 4. Score each candidate
    for (const memory of candidates) {
      const score = await this.scoreMemory(memory, {
        hour,
        day,
        stablePatterns,
        currentContext,
      });

      if (score.total > 0.1) {
        anticipatedMemories.push({
          memoryId: memory.memoryId,
          content: memory.content,
          anticipationScore: score.total,
          anticipationReasons: score.reasons,
          temporal: memory.temporal,
          contextFrame: memory.contextFrame,
          openLoop: memory.openLoop,
        });
      }

      // Track patterns used
      if (score.patternUsed) {
        patternsUsed.push(score.patternUsed);
      }
    }

    // 5. Apply context gating
    const gatedMemories = currentContext
      ? this.semanticGate.gateAnticipated(currentContext, anticipatedMemories, 0.2)
      : anticipatedMemories;

    // 6. Sort and limit results
    const topMemories = gatedMemories
      .sort((a, b) => b.anticipationScore - a.anticipationScore)
      .slice(0, maxMemories);

    // 7. Cache anticipated memory IDs in Redis
    await storeAnticipatedMemories(
      userId,
      topMemories.map(m => m.memoryId)
    );

    return {
      memories: topMemories,
      contextMatched: currentContext !== undefined,
      patternsUsed: Array.from(new Set(patternsUsed)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Score a memory for anticipation.
   */
  private async scoreMemory(
    memory: PredictiveMemoryDocument,
    context: {
      hour: number;
      day: number;
      stablePatterns: Array<{ memoryId: string; pattern: any }>;
      currentContext?: ContextFrame;
    }
  ): Promise<{
    total: number;
    reasons: string[];
    patternUsed?: string;
  }> {
    let temporalScore = 0;
    let contextScore = 0;
    let openLoopScore = 0;
    let recencyScore = 0;
    const reasons: string[] = [];
    let patternUsed: string | undefined;

    // 1. Temporal pattern score (40%)
    if (memory.temporal && memory.temporal.confidence >= THRESHOLDS.minConfidence) {
      if (matchesPattern(context.hour, context.day, memory.temporal)) {
        temporalScore = memory.temporal.confidence;
        reasons.push(
          `${memory.temporal.patternType} pattern match (${(memory.temporal.confidence * 100).toFixed(0)}% confidence)`
        );
        patternUsed = memory.temporal.patternType;
      }
    }

    // Also check stable patterns collection
    const storedPattern = context.stablePatterns.find(
      p => p.memoryId === memory.memoryId
    );
    if (storedPattern && storedPattern.pattern.confidence > temporalScore) {
      const patternMatch = matchesPattern(
        context.hour,
        context.day,
        {
          hourPattern: storedPattern.pattern.peakTimes?.[0],
          dayPattern: storedPattern.pattern.patternType === 'weekly'
            ? Math.floor((storedPattern.pattern.peakTimes?.[0] || 0) / 24) % 7
            : undefined,
          confidence: storedPattern.pattern.confidence,
          patternType: storedPattern.pattern.patternType,
        }
      );

      if (patternMatch) {
        temporalScore = storedPattern.pattern.confidence;
        reasons.push(
          `Stored ${storedPattern.pattern.patternType} pattern (${storedPattern.pattern.stabilityDays}d stable)`
        );
        patternUsed = storedPattern.pattern.patternType;
      }
    }

    // 2. Context frame score (30%)
    if (context.currentContext && memory.contextFrame) {
      contextScore = this.semanticGate.computeContextSimilarity(
        context.currentContext,
        memory.contextFrame
      );

      if (contextScore >= 0.5) {
        reasons.push(`Context match (${(contextScore * 100).toFixed(0)}%)`);
      }
    }

    // 3. Open loop urgency score (20%)
    if (memory.openLoop && !memory.openLoop.resolved) {
      openLoopScore = calculateOpenLoopUrgency(memory.openLoop);

      if (openLoopScore > 0.3) {
        const loopType = memory.openLoop.type;
        if (memory.openLoop.dueDate) {
          const daysUntil = Math.ceil(
            (memory.openLoop.dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );
          reasons.push(
            daysUntil <= 0
              ? `Overdue ${loopType}`
              : `${loopType} due in ${daysUntil}d`
          );
        } else {
          reasons.push(`Open ${loopType}`);
        }
      }
    }

    // 4. Recency score (10%)
    recencyScore = calculateRecencyDecay(memory.lastAccessed);

    // Calculate weighted total
    const total =
      temporalScore * ANTICIPATION_WEIGHTS.temporal +
      contextScore * ANTICIPATION_WEIGHTS.context +
      openLoopScore * ANTICIPATION_WEIGHTS.openLoop +
      recencyScore * ANTICIPATION_WEIGHTS.recency;

    return {
      total,
      reasons,
      patternUsed,
    };
  }

  /**
   * Get current context from Redis cache or return undefined.
   */
  private async getCurrentContext(userId: string): Promise<ContextFrame | undefined> {
    const cached = await getRedisContextFrame(userId);
    if (!cached) return undefined;

    return {
      location: cached.location,
      people: cached.people,
      activity: cached.activity,
      project: cached.project,
    };
  }

  /**
   * Get cached anticipated memory IDs.
   */
  async getCachedAnticipated(userId: string): Promise<string[]> {
    return await getAnticipatedMemories(userId);
  }

  /**
   * Record that an anticipated memory was used/ignored/dismissed.
   * This feeds back into the pattern learning.
   */
  async recordFeedback(
    userId: string,
    memoryId: string,
    action: 'used' | 'ignored' | 'dismissed',
    contextFrame?: ContextFrame
  ): Promise<void> {
    // Record access for pattern detection
    if (action === 'used') {
      await recordMemoryAccess(userId, memoryId, contextFrame);
    }

    // Update pattern detector
    await this.patternDetector.updatePatternsForUser(userId, [memoryId]);

    // Store feedback for adaptive learning
    const feedbackCollection = collections.retrievalLogs();
    await feedbackCollection.insertOne({
      id: `${userId}-${memoryId}-${Date.now()}`,
      userId,
      memoryId,
      retrievedAt: new Date().toISOString(),
      resultedInAction: action === 'used',
      actionType: action,
      salienceComponents: {
        emotional: 0,
        novelty: 0,
        relevance: 0,
        social: 0,
        consequential: 0,
      },
      salienceScore: 0,
    });
  }

  /**
   * Generate morning briefing based on anticipated day.
   */
  async generateDayBriefing(
    userId: string,
    upcomingEvents?: Array<{
      title: string;
      startTime: string;
      attendees?: string[];
    }>
  ): Promise<{
    greeting: string;
    dayOutlook: string;
    anticipatedMemories: AnticipatedMemory[];
    patternInsights: string[];
    openLoopsSummary: string;
  }> {
    // Get anticipated memories for the day
    const anticipated = await this.getAnticipated({
      userId,
      maxMemories: 10,
      lookaheadMinutes: 12 * 60, // 12 hours
    });

    // Get open loops
    const openLoops = collections.openLoops();
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pendingLoops = await openLoops
      .find({
        userId,
        status: 'open',
        dueDate: { $lte: weekFromNow },
      })
      .sort({ dueDate: 1 })
      .limit(5)
      .toArray();

    // Get pattern stats
    const stablePatterns = await this.patternDetector.getStablePatterns(userId, 21);

    // Generate insights
    const insights: string[] = [];

    if (stablePatterns.length === 0) {
      insights.push(
        'Still learning your patterns. Predictions will improve over the next few weeks.'
      );
    } else {
      insights.push(
        `Tracking ${stablePatterns.length} established ${
          stablePatterns.length === 1 ? 'pattern' : 'patterns'
        } for memory surfacing.`
      );
    }

    const highConfidenceCount = anticipated.memories.filter(
      m => m.anticipationScore >= 0.7
    ).length;
    if (highConfidenceCount > 0) {
      insights.push(
        `${highConfidenceCount} high-confidence prediction${
          highConfidenceCount === 1 ? '' : 's'
        } for today.`
      );
    }

    // Generate greeting
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      new Date().getDay()
    ];

    // Generate outlook
    const outlookParts: string[] = [];
    if (upcomingEvents && upcomingEvents.length > 0) {
      outlookParts.push(`${upcomingEvents.length} scheduled event${upcomingEvents.length > 1 ? 's' : ''}.`);
      const first = upcomingEvents[0];
      const startTime = new Date(first.startTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      outlookParts.push(`First up: ${first.title} at ${startTime}.`);
    } else {
      outlookParts.push('Clear calendar today.');
    }

    // Open loops summary
    let loopsSummary = '';
    if (pendingLoops.length > 0) {
      const overdueCount = pendingLoops.filter(
        l => l.dueDate && new Date(l.dueDate) < new Date()
      ).length;
      loopsSummary = `${pendingLoops.length} open commitment${pendingLoops.length > 1 ? 's' : ''}`;
      if (overdueCount > 0) {
        loopsSummary += ` (${overdueCount} overdue)`;
      }
    } else {
      loopsSummary = 'No pending commitments this week.';
    }

    return {
      greeting: `Good ${timeOfDay}! Ready for ${dayName}?`,
      dayOutlook: outlookParts.join(' '),
      anticipatedMemories: anticipated.memories,
      patternInsights: insights,
      openLoopsSummary: loopsSummary,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let anticipationInstance: PredictiveAnticipationService | null = null;

/**
 * Get or create the anticipation service singleton.
 */
export function getPredictiveAnticipationService(): PredictiveAnticipationService {
  if (!anticipationInstance) {
    anticipationInstance = new PredictiveAnticipationService();
  }
  return anticipationInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get anticipated memories for a user.
 */
export async function getAnticipatedForUser(
  userId: string,
  contextFrame?: ContextFrame,
  maxMemories?: number
): Promise<AnticipationResult> {
  const service = getPredictiveAnticipationService();
  return service.getAnticipated({
    userId,
    contextFrame,
    maxMemories,
  });
}

/**
 * Generate a day briefing for a user.
 */
export async function generateUserDayBriefing(
  userId: string,
  upcomingEvents?: Array<{
    title: string;
    startTime: string;
    attendees?: string[];
  }>
) {
  const service = getPredictiveAnticipationService();
  return service.generateDayBriefing(userId, upcomingEvents);
}
