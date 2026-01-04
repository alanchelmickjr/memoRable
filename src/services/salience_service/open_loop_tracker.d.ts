/**
 * @file Open Loop Tracker Service
 * Tracks commitments, promises, and unresolved exchanges.
 *
 * An "open loop" is anything unresolved:
 * - Commitments made ("I'll send you that paper")
 * - Commitments received ("I'll email you next week")
 * - Questions pending answers
 * - Topics raised but not concluded
 *
 * The dance dies when loops stay open too long.
 */
import type { OpenLoop, OpenLoopType, OpenLoopStatus, LoopOwner, ExtractedFeatures } from './models';
import type { LLMClient } from './feature_extractor';
/**
 * Create open loops from extracted features.
 * Uses batch contact lookup for efficiency (1 DB call instead of N).
 */
export declare function createOpenLoopsFromFeatures(features: ExtractedFeatures, userId: string, memoryId: string, memoryCreatedAt?: Date): Promise<OpenLoop[]>;
/**
 * Extended OpenLoop with computed overdue flag.
 * Preserves original status while indicating actual overdue state.
 */
export interface OpenLoopWithOverdue extends OpenLoop {
    /** Computed: true if loop is past due date (original status preserved) */
    isOverdue: boolean;
}
/**
 * Get open loops for a user.
 * Returns loops with computed `isOverdue` flag (original status preserved).
 */
export declare function getOpenLoops(userId: string, options?: {
    contactId?: string;
    contactName?: string;
    owner?: LoopOwner;
    status?: OpenLoopStatus;
    loopType?: OpenLoopType;
    includeOverdue?: boolean;
}): Promise<OpenLoopWithOverdue[]>;
/**
 * Close an open loop.
 */
export declare function closeLoop(loopId: string, completedMemoryId?: string): Promise<void>;
/**
 * Check if a new memory closes any existing open loops.
 * IMPORTANT: Excludes loops created from the same memory to prevent self-closing race condition.
 */
export declare function checkLoopClosures(newMemoryText: string, features: ExtractedFeatures, userId: string, memoryId: string, llmClient?: LLMClient): Promise<string[]>;
/**
 * Get overdue loops for notification.
 */
export declare function getOverdueLoops(userId: string): Promise<OpenLoop[]>;
/**
 * Get loops due soon for proactive surfacing.
 */
export declare function getUpcomingDueLoops(userId: string, daysAhead?: number): Promise<OpenLoop[]>;
/**
 * Update reminder sent status.
 */
export declare function markReminderSent(loopId: string): Promise<void>;
/**
 * Abandon an open loop (not completed, just no longer relevant).
 */
export declare function abandonLoop(loopId: string, reason?: string): Promise<void>;
