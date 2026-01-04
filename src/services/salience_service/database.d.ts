/**
 * @file Database setup and schema definitions for the Memory Salience System.
 * Creates MongoDB collections with appropriate indexes for efficient queries.
 */
import { Db, Collection } from 'mongodb';
/**
 * Initialize salience-related database collections and indexes.
 */
export declare function setupSalienceDatabase(database: Db): Promise<void>;
/**
 * Get a typed collection reference.
 */
export declare function getCollection<T>(name: string): Collection<T>;
export interface StateChangeDocument {
    _id?: string;
    memoryId: string;
    userId: string;
    previousState: string;
    newState: string;
    reason?: string;
    changedAt: string;
    changedBy?: string;
}
export declare const collections: {
    memories: () => Collection<T>;
    openLoops: () => Collection<T>;
    personTimelineEvents: () => Collection<T>;
    relationshipPatterns: () => Collection<T>;
    relationshipSnapshots: () => Collection<T>;
    retrievalLogs: () => Collection<T>;
    learnedWeights: () => Collection<T>;
    contacts: () => Collection<T>;
    stateChanges: () => Collection<T>;
};
/**
 * Contact document structure for the contacts collection.
 */
export interface ContactDocument {
    _id?: string;
    userId: string;
    name: string;
    aliases?: string[];
    externalId?: string;
    howMet?: string;
    firstSeenAt: string;
    lastSeenAt?: string;
    metadata?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}
/**
 * Get or create a contact by name.
 * Sanitizes name input for security.
 */
export declare function getOrCreateContact(userId: string, name: string, metadata?: Partial<ContactDocument>): Promise<ContactDocument>;
/**
 * Batch get or create contacts by names.
 * Much more efficient than calling getOrCreateContact in a loop.
 * Returns a Map of lowercase name -> ContactDocument for O(1) lookup.
 * Sanitizes all names for security.
 */
export declare function batchGetOrCreateContacts(userId: string, names: string[]): Promise<Map<string, ContactDocument>>;
/**
 * Memory salience extension fields to add to existing memories collection.
 * These fields should be added to the memories collection schema.
 */
export declare const MEMORY_SALIENCE_FIELDS: {
    salienceScore: string;
    salienceComponents: string;
    salienceWeightsUsed: string;
    extractedFeatures: string;
    captureContext: string;
    lastRetrievedAt: string;
    retrievalCount: string;
    hasFutureReferences: string;
    hasOpenLoops: string;
    earliestDueDate: string;
    salienceVersion: string;
};
/**
 * Add salience-related indexes to the memories collection.
 */
export declare function addSalienceIndexesToMemories(memoriesCollection: Collection): Promise<void>;
