/**
 * @file Memory Operations - Forget, Reassociate, Export
 *
 * Operations for managing memory lifecycle:
 * - Forget: Soft delete, suppress, or hard delete memories
 * - Reassociate: Change how memories are linked (people, projects, topics)
 * - Export/Import: Move memories between contexts
 *
 * Philosophy:
 * - Forgetting is a feature, not a bug
 * - Memories should be portable
 * - Users control their data
 */
export type MemoryState = 'active' | 'archived' | 'suppressed' | 'deleted';
export interface MemoryStateChange {
    memoryId: string;
    fromState: MemoryState;
    toState: MemoryState;
    reason?: string;
    changedAt: string;
    changedBy: 'user' | 'system' | 'decay';
}
export interface ForgetOptions {
    /** How to forget */
    mode: 'suppress' | 'archive' | 'delete';
    /** Why (for audit trail) */
    reason?: string;
    /** Also remove related open loops */
    cascadeLoops?: boolean;
    /** Also remove related timeline events */
    cascadeTimeline?: boolean;
}
export interface ForgetResult {
    success: boolean;
    memoryId: string;
    previousState: MemoryState;
    newState: MemoryState;
    loopsRemoved?: number;
    eventsRemoved?: number;
    error?: string;
}
/**
 * Forget a specific memory.
 *
 * Modes:
 * - suppress: Memory won't surface in any context, but data preserved
 * - archive: Memory hidden from default searches, can be explicitly retrieved
 * - delete: Soft delete, data removed after retention period
 */
export declare function forgetMemory(userId: string, memoryId: string, options: ForgetOptions): Promise<ForgetResult>;
/**
 * Forget all memories involving a specific person.
 */
export declare function forgetPerson(userId: string, personName: string, options: Omit<ForgetOptions, 'cascadeLoops' | 'cascadeTimeline'> & {
    alsoForgetLoops?: boolean;
    alsoForgetEvents?: boolean;
}): Promise<{
    memoriesForgotten: number;
    loopsForgotten: number;
    eventsForgotten: number;
}>;
/**
 * Restore a forgotten memory.
 */
export declare function restoreMemory(userId: string, memoryId: string): Promise<{
    success: boolean;
    previousState?: MemoryState;
    error?: string;
}>;
export interface ReassociateOptions {
    /** Add these people to the memory */
    addPeople?: string[];
    /** Remove these people from the memory */
    removePeople?: string[];
    /** Add these topics */
    addTopics?: string[];
    /** Remove these topics */
    removeTopics?: string[];
    /** Change the linked project/context */
    setProject?: string | null;
    /** Add tags */
    addTags?: string[];
    /** Remove tags */
    removeTags?: string[];
}
/**
 * Reassociate a memory - change how it's linked.
 */
export declare function reassociateMemory(userId: string, memoryId: string, options: ReassociateOptions): Promise<{
    success: boolean;
    changes: string[];
    error?: string;
}>;
/**
 * Merge two memories (when you realize they're about the same thing).
 */
export declare function mergeMemories(userId: string, primaryMemoryId: string, secondaryMemoryId: string, options?: {
    keepBothTexts?: boolean;
    deleteSecondary?: boolean;
}): Promise<{
    success: boolean;
    mergedMemoryId?: string;
    error?: string;
}>;
export interface ExportedMemory {
    id: string;
    text: string;
    createdAt: string;
    salienceScore?: number;
    people: string[];
    topics: string[];
    tags?: string[];
    project?: string;
    loops: Array<{
        description: string;
        owner: string;
        status: string;
        dueDate?: string;
    }>;
    timelineEvents: Array<{
        description: string;
        eventDate?: string;
        contactName: string;
    }>;
}
export interface ExportOptions {
    /** Filter by people */
    people?: string[];
    /** Filter by topics */
    topics?: string[];
    /** Filter by project */
    project?: string;
    /** Filter by date range */
    fromDate?: string;
    toDate?: string;
    /** Include related loops */
    includeLoops?: boolean;
    /** Include related timeline events */
    includeTimeline?: boolean;
    /** Only active memories */
    activeOnly?: boolean;
}
/**
 * Export memories for portability.
 */
export declare function exportMemories(userId: string, options?: ExportOptions): Promise<ExportedMemory[]>;
/**
 * Import memories from export format.
 */
export declare function importMemories(userId: string, memories: ExportedMemory[], options?: {
    /** Prefix to add to imported memory IDs */
    idPrefix?: string;
    /** Project to assign imported memories to */
    targetProject?: string;
    /** Skip duplicates based on text similarity */
    skipDuplicates?: boolean;
}): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
}>;
