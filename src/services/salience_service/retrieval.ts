/**
 * @file Salience-Weighted Retrieval Service
 * When searching memories, salience affects ranking along with semantic similarity.
 *
 * Key formula:
 * retrieval_score = semantic_similarity * 0.6 + (salience_score / 100) * decay * 0.4
 *
 * Effect: High-salience memories bubble up even if they're older or less
 * semantically similar. Sarah's mother dying will surface when you ask
 * "what should I know before talking to Sarah?"
 */

import type {
  RetrievalOptions,
  TemporalFocus,
  SalienceComponents,
} from './models';
import { collections, getOrCreateContact } from './database';
import { calculateDecayModifier, calculateRetrievalBoost } from './salience_calculator';
import { getUpcomingEventsForContact } from './timeline_tracker';
import { getRelationshipPattern } from './relationship_tracker';

/**
 * Memory with retrieval scoring applied.
 */
export interface ScoredMemory {
  memoryId: string;
  text: string;
  createdAt: string;

  // Original scores
  semanticSimilarity: number;
  salienceScore: number;
  salienceComponents?: SalienceComponents;

  // Computed retrieval score
  retrievalScore: number;

  // Metadata
  daysOld: number;
  decayModifier: number;
  peopleMentioned?: string[];
  topics?: string[];
  hasOpenLoops?: boolean;
  earliestDueDate?: string;
}

/**
 * Options for salience-weighted retrieval.
 */
export interface SalienceRetrievalOptions extends RetrievalOptions {
  /** Weight for semantic similarity (default 0.6) */
  semanticWeight?: number;
  /** Weight for salience (default 0.4) */
  salienceWeight?: number;
  /** Include salience boost for upcoming contact events */
  boostForUpcomingEvents?: boolean;
  /** Include boost for deadline proximity */
  boostForDeadlines?: boolean;
  /** Include recency boost for active relationships */
  boostActiveRelationships?: boolean;
}

const DEFAULT_RETRIEVAL_OPTIONS: Required<SalienceRetrievalOptions> = {
  query: '',
  userId: '',
  temporalFocus: 'default',
  contactId: '',
  minSalience: 0,
  limit: 10,
  semanticWeight: 0.6,
  salienceWeight: 0.4,
  boostForUpcomingEvents: true,
  boostForDeadlines: true,
  boostActiveRelationships: true,
};

/**
 * Retrieve memories with salience-weighted scoring.
 *
 * @param candidates - Raw candidates from vector search (pre-filtered by semantic similarity)
 * @param options - Retrieval options
 */
export async function retrieveWithSalience(
  candidates: Array<{
    memoryId: string;
    text: string;
    createdAt: string;
    semanticSimilarity: number;
    salienceScore?: number;
    salienceComponents?: SalienceComponents;
    peopleMentioned?: string[];
    topics?: string[];
    hasOpenLoops?: boolean;
    earliestDueDate?: string;
  }>,
  options: SalienceRetrievalOptions
): Promise<ScoredMemory[]> {
  const opts = { ...DEFAULT_RETRIEVAL_OPTIONS, ...options };
  const now = new Date();

  // Get context for boosting
  let upcomingContactEvents: Map<string, boolean> = new Map();
  let activeRelationships: Set<string> = new Set();

  if (opts.contactId) {
    // Get upcoming events for this contact
    if (opts.boostForUpcomingEvents) {
      const events = await getUpcomingEventsForContact(opts.userId, opts.contactId, 14);
      upcomingContactEvents.set(opts.contactId, events.length > 0);
    }

    // Check if active relationship
    if (opts.boostActiveRelationships) {
      const pattern = await getRelationshipPattern(opts.userId, opts.contactId);
      if (pattern && pattern.totalInteractions >= 3 &&
          pattern.interactionTrend !== 'dormant') {
        activeRelationships.add(opts.contactId);
      }
    }
  }

  // Score each candidate
  const scoredMemories: ScoredMemory[] = [];

  for (const candidate of candidates) {
    const createdAt = new Date(candidate.createdAt);
    const daysOld = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate decay modifier
    const decayModifier = calculateDecayModifier(daysOld);

    // Start with base score
    let score = candidate.semanticSimilarity * opts.semanticWeight;

    // Add salience contribution with decay
    const salienceContribution = ((candidate.salienceScore || 50) / 100) * decayModifier;
    score += salienceContribution * opts.salienceWeight;

    // Apply temporal focus adjustments
    score = applyTemporalFocus(score, daysOld, candidate, opts.temporalFocus);

    // Apply context-specific boosts
    if (opts.boostForUpcomingEvents && candidate.peopleMentioned) {
      for (const person of candidate.peopleMentioned) {
        // Note: Would need to resolve person name to contactId
        // For now, check by name pattern
        if (upcomingContactEvents.size > 0) {
          score += 0.15;
          break;
        }
      }
    }

    if (opts.boostForDeadlines && candidate.hasOpenLoops && candidate.earliestDueDate) {
      const dueDate = new Date(candidate.earliestDueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilDue <= 7 && daysUntilDue >= 0) {
        // Closer deadline = higher boost (max 0.15)
        score += 0.15 * (1 - daysUntilDue / 7);
      }
    }

    if (opts.boostActiveRelationships) {
      // For active relationships, add recency boost
      if (activeRelationships.size > 0 && daysOld < 30) {
        const recencyBoost = Math.max(0, 0.1 - (daysOld * 0.003));
        score += recencyBoost;
      }
    }

    scoredMemories.push({
      memoryId: candidate.memoryId,
      text: candidate.text,
      createdAt: candidate.createdAt,
      semanticSimilarity: candidate.semanticSimilarity,
      salienceScore: candidate.salienceScore || 50,
      salienceComponents: candidate.salienceComponents,
      retrievalScore: Math.min(1, score), // Cap at 1
      daysOld,
      decayModifier,
      peopleMentioned: candidate.peopleMentioned,
      topics: candidate.topics,
      hasOpenLoops: candidate.hasOpenLoops,
      earliestDueDate: candidate.earliestDueDate,
    });
  }

  // Sort by retrieval score
  scoredMemories.sort((a, b) => b.retrievalScore - a.retrievalScore);

  // Return top N
  return scoredMemories.slice(0, opts.limit);
}

/**
 * Apply temporal focus adjustments to score.
 */
function applyTemporalFocus(
  baseScore: number,
  daysOld: number,
  memory: { hasOpenLoops?: boolean; earliestDueDate?: string },
  focus: TemporalFocus
): number {
  let score = baseScore;

  switch (focus) {
    case 'recent':
      // Strong boost for last 30 days
      if (daysOld <= 30) {
        const recencyBoost = Math.max(0, 1 - (daysOld / 30));
        score += recencyBoost * 0.2;
      }
      break;

    case 'this_week':
      // Binary boost for this week
      if (daysOld <= 7) {
        score += 0.2;
      }
      break;

    case 'historical':
      // Boost older high-salience memories
      if (daysOld > 30) {
        score += 0.1;
      }
      // Penalize recent memories slightly
      if (daysOld < 7) {
        score -= 0.05;
      }
      break;

    case 'upcoming':
      // Boost memories with future references
      if (memory.hasOpenLoops) {
        score += 0.25;
      }
      break;

    case 'default':
    default:
      // Gentle recency bias
      const gentleRecency = Math.max(0.3, 1 - (daysOld * 0.01));
      score += gentleRecency * 0.15;
      break;
  }

  return score;
}

/**
 * Log memory retrieval for adaptive learning.
 * Non-critical operation - errors are logged but don't propagate.
 */
export async function logRetrieval(
  userId: string,
  memoryId: string,
  memory: {
    salienceScore: number;
    salienceComponents?: SalienceComponents;
  },
  query?: string,
  resultedInAction: boolean = false,
  userFeedback?: 'helpful' | 'not_helpful' | 'neutral'
): Promise<void> {
  try {
    const log = {
      id: crypto.randomUUID(),
      userId,
      memoryId,
      retrievedAt: new Date().toISOString(),
      query,
      salienceComponents: memory.salienceComponents || {
        emotional: 50,
        novelty: 50,
        relevance: 50,
        social: 50,
        consequential: 50,
      },
      salienceScore: memory.salienceScore,
      resultedInAction,
      userFeedback,
    };

    await collections.retrievalLogs().insertOne(log);
  } catch (error) {
    console.error('[Retrieval] Error logging retrieval:', error);
    // Non-critical - don't propagate
  }
}

/**
 * Boost memory salience when retrieved (retrieval practice).
 */
export async function boostOnRetrieval(
  memoryId: string,
  currentScore: number,
  currentRetrievalCount: number
): Promise<number> {
  const newScore = calculateRetrievalBoost(currentScore, currentRetrievalCount);

  // This would update the memory in the memories collection
  // The actual update depends on the memory storage implementation
  try {
    await collections.memories().updateOne(
      { $or: [{ _id: memoryId }, { mementoId: memoryId }] } as any,
      {
        $set: {
          salienceScore: newScore,
          lastRetrievedAt: new Date().toISOString(),
        },
        $inc: { retrievalCount: 1 },
      } as any
    );
  } catch (error) {
    console.error('[Retrieval] Error boosting memory on retrieval:', error);
  }

  return newScore;
}

/**
 * Time-aware retrieval that factors in temporal relevance.
 * Wraps vector search with salience weighting.
 */
export async function timeAwareRetrieve(
  vectorSearchFn: (query: string, userId: string, limit: number) => Promise<Array<{
    memoryId: string;
    text: string;
    createdAt: string;
    semanticSimilarity: number;
    salienceScore?: number;
    salienceComponents?: SalienceComponents;
    peopleMentioned?: string[];
    topics?: string[];
    hasOpenLoops?: boolean;
    earliestDueDate?: string;
  }>>,
  options: SalienceRetrievalOptions
): Promise<ScoredMemory[]> {
  // Get more candidates than needed for re-ranking
  const candidateMultiplier = 5;
  const candidates = await vectorSearchFn(
    options.query,
    options.userId,
    (options.limit || 10) * candidateMultiplier
  );

  // Re-rank with salience
  return retrieveWithSalience(candidates, options);
}

/**
 * Get memories for a specific person with salience ranking.
 */
export async function getMemoriesForPerson(
  userId: string,
  contactId: string,
  options: {
    minSalience?: number;
    limit?: number;
    temporalFocus?: TemporalFocus;
  } = {}
): Promise<ScoredMemory[]> {
  const minSalience = options.minSalience ?? 0;
  const limit = options.limit ?? 10;

  try {
    // Find memories mentioning this person
    const memories = await collections.memories()
      .find({
        userId,
        'extractedFeatures.peopleMentioned': { $exists: true },
        salienceScore: { $gte: minSalience },
      } as any)
      .sort({ salienceScore: -1, createdAt: -1 })
      .limit(limit * 5) // Get more for filtering
      .toArray();

    // Convert to candidate format
    const candidates = memories.map((m: any) => ({
      memoryId: m._id?.toString() || m.mementoId,
      text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      createdAt: m.createdAt || m.eventTimestamp,
      semanticSimilarity: 1.0, // No semantic search here, so full score
      salienceScore: m.salienceScore,
      salienceComponents: m.salienceComponents,
      peopleMentioned: m.extractedFeatures?.peopleMentioned,
      topics: m.extractedFeatures?.topics,
      hasOpenLoops: m.hasOpenLoops,
      earliestDueDate: m.earliestDueDate,
    }));

    return retrieveWithSalience(candidates, {
      query: '',
      userId,
      contactId,
      temporalFocus: options.temporalFocus || 'default',
      limit,
      semanticWeight: 0.2, // Lower semantic weight since no actual semantic search
      salienceWeight: 0.8, // Higher salience weight
    });
  } catch (error) {
    console.error('[Retrieval] Error getting memories for person:', error);
    return [];
  }
}

/**
 * Find memories related to open loops (for deadline tracking).
 */
export async function getMemoriesWithUpcomingDeadlines(
  userId: string,
  daysAhead: number = 7
): Promise<ScoredMemory[]> {
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  try {
    const memories = await collections.memories()
      .find({
        userId,
        hasOpenLoops: true,
        earliestDueDate: {
          $gte: new Date().toISOString(),
          $lte: future.toISOString(),
        },
      } as any)
      .sort({ earliestDueDate: 1 })
      .toArray();

    const candidates = memories.map((m: any) => ({
      memoryId: m._id?.toString() || m.mementoId,
      text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      createdAt: m.createdAt || m.eventTimestamp,
      semanticSimilarity: 1.0,
      salienceScore: m.salienceScore || 50,
      salienceComponents: m.salienceComponents,
      peopleMentioned: m.extractedFeatures?.peopleMentioned,
      hasOpenLoops: true,
      earliestDueDate: m.earliestDueDate,
    }));

    return retrieveWithSalience(candidates, {
      query: '',
      userId,
      temporalFocus: 'upcoming',
      limit: 20,
      boostForDeadlines: true,
    });
  } catch (error) {
    console.error('[Retrieval] Error getting memories with deadlines:', error);
    return [];
  }
}
