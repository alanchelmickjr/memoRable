/**
 * @file Relationship Rhythm Tracker Service
 * Tracks the cadence and health of relationships over time.
 *
 * Every relationship has a natural rhythm. The system learns it:
 * - How often do you typically interact with this person?
 * - What days/times are typical?
 * - Is the relationship getting warmer or going cold?
 * - What's the reciprocity balance (favors given vs received)?
 */
import type { RelationshipPattern, RelationshipSnapshot, ExtractedFeatures, OpenLoop } from './models';
/**
 * Update relationship pattern when an interaction occurs.
 * Gracefully handles errors - returns minimal pattern on failure.
 */
export declare function recordInteraction(userId: string, contactId: string, contactName: string, interactionDate?: Date, features?: ExtractedFeatures): Promise<RelationshipPattern>;
/**
 * Get relationship pattern for a contact.
 */
export declare function getRelationshipPattern(userId: string, contactId: string): Promise<RelationshipPattern | null>;
/**
 * Get relationships that have gone cold.
 */
export declare function getColdRelationships(userId: string, options?: {
    minInteractions?: number;
    coldThresholdDays?: number;
}): Promise<RelationshipPattern[]>;
/**
 * Get relationships with decreasing engagement.
 */
export declare function getDecreasingRelationships(userId: string): Promise<RelationshipPattern[]>;
/**
 * Create a relationship snapshot for time-series tracking.
 */
export declare function createRelationshipSnapshot(userId: string, contactId: string, openLoops: OpenLoop[], avgSentiment?: number): Promise<RelationshipSnapshot>;
/**
 * Get latest snapshot for a relationship.
 */
export declare function getLatestSnapshot(userId: string, contactId: string): Promise<RelationshipSnapshot | null>;
/**
 * Get relationship trajectory over time.
 */
export declare function getRelationshipTrajectory(userId: string, contactId: string, daysBack?: number): Promise<RelationshipSnapshot[]>;
/**
 * Get all active relationships for a user.
 */
export declare function getActiveRelationships(userId: string, options?: {
    minInteractions?: number;
    activeWithinDays?: number;
}): Promise<RelationshipPattern[]>;
/**
 * Update relationship from memory/interaction features.
 * Uses batch contact lookup for efficiency (1 DB call instead of N).
 * Gracefully handles errors - continues processing remaining people on failure.
 */
export declare function updateRelationshipFromFeatures(userId: string, features: ExtractedFeatures, memoryCreatedAt?: Date): Promise<void>;
/**
 * Get relationships that need attention.
 * Combines cold relationships, decreasing engagement, and overdue loops.
 */
export declare function getRelationshipsNeedingAttention(userId: string): Promise<{
    cold: RelationshipPattern[];
    decreasing: RelationshipPattern[];
    withOverdueLoops: Array<{
        pattern: RelationshipPattern;
        overdueCount: number;
    }>;
}>;
/**
 * Set nudge threshold for a relationship.
 */
export declare function setNudgeThreshold(userId: string, contactId: string, days: number): Promise<void>;
/**
 * Get relationships due for a nudge.
 */
export declare function getRelationshipsDueForNudge(userId: string): Promise<RelationshipPattern[]>;
/**
 * Batch update relationship snapshots (call weekly).
 */
export declare function updateAllSnapshots(userId: string): Promise<number>;
