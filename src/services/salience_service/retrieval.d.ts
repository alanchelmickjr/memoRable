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
import type { RetrievalOptions, TemporalFocus, SalienceComponents } from './models';
/**
 * Memory with retrieval scoring applied.
 */
export interface ScoredMemory {
    memoryId: string;
    text: string;
    createdAt: string;
    semanticSimilarity: number;
    salienceScore: number;
    salienceComponents?: SalienceComponents;
    retrievalScore: number;
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
/**
 * Retrieve memories with salience-weighted scoring.
 *
 * @param candidates - Raw candidates from vector search (pre-filtered by semantic similarity)
 * @param options - Retrieval options
 */
export declare function retrieveWithSalience(candidates: Array<{
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
}>, options: SalienceRetrievalOptions): Promise<ScoredMemory[]>;
/**
 * Log memory retrieval for adaptive learning.
 * Non-critical operation - errors are logged but don't propagate.
 */
export declare function logRetrieval(userId: string, memoryId: string, memory: {
    salienceScore: number;
    salienceComponents?: SalienceComponents;
}, query?: string, resultedInAction?: boolean, userFeedback?: 'helpful' | 'not_helpful' | 'neutral'): Promise<void>;
/**
 * Boost memory salience when retrieved (retrieval practice).
 */
export declare function boostOnRetrieval(memoryId: string, currentScore: number, currentRetrievalCount: number): Promise<number>;
/**
 * Time-aware retrieval that factors in temporal relevance.
 * Wraps vector search with salience weighting.
 */
export declare function timeAwareRetrieve(vectorSearchFn: (query: string, userId: string, limit: number) => Promise<Array<{
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
}>>, options: SalienceRetrievalOptions): Promise<ScoredMemory[]>;
/**
 * Get memories for a specific person with salience ranking.
 */
export declare function getMemoriesForPerson(userId: string, contactId: string, options?: {
    minSalience?: number;
    limit?: number;
    temporalFocus?: TemporalFocus;
}): Promise<ScoredMemory[]>;
/**
 * Find memories related to open loops (for deadline tracking).
 */
export declare function getMemoriesWithUpcomingDeadlines(userId: string, daysAhead?: number): Promise<ScoredMemory[]>;
