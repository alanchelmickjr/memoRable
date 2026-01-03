/**
 * @file Database setup and schema definitions for the Memory Salience System.
 * Creates MongoDB collections with appropriate indexes for efficient queries.
 */

import { Db, MongoClient, Collection, IndexSpecification } from 'mongodb';
import type {
  OpenLoop,
  PersonTimelineEvent,
  RelationshipPattern,
  RelationshipSnapshot,
  RetrievalLog,
  LearnedWeights,
  MemoryDocument,
} from './models';

let db: Db | null = null;

/**
 * Collection definitions with their indexes
 */
interface CollectionConfig {
  name: string;
  indexes: Array<{
    spec: IndexSpecification;
    options?: { unique?: boolean; sparse?: boolean; expireAfterSeconds?: number };
  }>;
}

const SALIENCE_COLLECTIONS: CollectionConfig[] = [
  {
    name: 'open_loops',
    indexes: [
      // Primary queries
      { spec: { userId: 1, status: 1, dueDate: 1 } },
      // "What do I owe people" - loops where user is the owner
      { spec: { userId: 1, owner: 1, status: 1, dueDate: 1 } },
      // "What does Sarah expect from me" - loops by contact
      { spec: { userId: 1, contactId: 1, status: 1 } },
      // Loop closure detection - find by memory
      { spec: { memoryId: 1 } },
      // Overdue loop detection
      { spec: { status: 1, dueDate: 1 } },
      // For reminder scheduling
      { spec: { status: 1, nextReminder: 1 }, options: { sparse: true } },
    ],
  },
  {
    name: 'person_timeline_events',
    indexes: [
      // "What's coming up for people I know"
      { spec: { userId: 1, eventDate: 1 } },
      // Filter by contact
      { spec: { userId: 1, contactId: 1, eventDate: 1 } },
      // Upcoming events only
      { spec: { eventDate: 1 }, options: { sparse: true } },
      // Recurring events
      { spec: { userId: 1, isRecurring: 1, recurrencePattern: 1 } },
      // By memory source
      { spec: { memoryId: 1 }, options: { sparse: true } },
    ],
  },
  {
    name: 'relationship_patterns',
    indexes: [
      // Primary lookup
      { spec: { userId: 1, contactId: 1 }, options: { unique: true } },
      // "Show me relationships that have gone cold"
      { spec: { userId: 1, interactionTrend: 1, daysSinceLastInteraction: 1 } },
      // "Who haven't I talked to in a while"
      { spec: { userId: 1, lastInteraction: 1 } },
      // Nudge scheduling
      { spec: { userId: 1, suggestedNextInteraction: 1 } },
    ],
  },
  {
    name: 'relationship_snapshots',
    indexes: [
      // Get latest snapshot for a relationship
      { spec: { userId: 1, contactId: 1, snapshotDate: -1 } },
      // Time series queries
      { spec: { userId: 1, snapshotDate: 1 } },
      // Unique constraint
      { spec: { userId: 1, contactId: 1, snapshotDate: 1 }, options: { unique: true } },
    ],
  },
  {
    name: 'retrieval_logs',
    indexes: [
      // Adaptive weight learning - recent retrievals by user
      { spec: { userId: 1, retrievedAt: -1 } },
      // Filter by action taken
      { spec: { userId: 1, resultedInAction: 1, retrievedAt: -1 } },
      // By memory
      { spec: { memoryId: 1, retrievedAt: -1 } },
      // TTL index - auto-delete old logs after 90 days
      { spec: { retrievedAt: 1 }, options: { expireAfterSeconds: 90 * 24 * 60 * 60 } },
    ],
  },
  {
    name: 'learned_weights',
    indexes: [
      // One per user
      { spec: { userId: 1 }, options: { unique: true } },
    ],
  },
  {
    name: 'contacts',
    indexes: [
      // Primary lookup
      { spec: { userId: 1, name: 1 } },
      // By external ID
      { spec: { userId: 1, externalId: 1 }, options: { sparse: true } },
      // Search
      { spec: { userId: 1, 'metadata.email': 1 }, options: { sparse: true } },
    ],
  },
];

/**
 * Initialize salience-related database collections and indexes.
 */
export async function setupSalienceDatabase(database: Db): Promise<void> {
  db = database;

  for (const collection of SALIENCE_COLLECTIONS) {
    await ensureCollection(collection);
  }

  console.log('[SalienceDB] All salience collections and indexes created');
}

/**
 * Ensure a collection exists with proper indexes.
 */
async function ensureCollection(config: CollectionConfig): Promise<void> {
  const collections = await db!.listCollections({ name: config.name }).toArray();

  if (collections.length === 0) {
    await db!.createCollection(config.name);
    console.log(`[SalienceDB] Created collection: ${config.name}`);
  }

  const collection = db!.collection(config.name);

  for (const index of config.indexes) {
    try {
      await collection.createIndex(index.spec, index.options || {});
    } catch (error: any) {
      // Index might already exist with different options - log but continue
      if (error.code !== 85 && error.code !== 86) {
        console.error(`[SalienceDB] Error creating index on ${config.name}:`, error.message);
      }
    }
  }
}

/**
 * Get a typed collection reference.
 */
export function getCollection<T>(name: string): Collection<T> {
  if (!db) {
    throw new Error('Salience database not initialized. Call setupSalienceDatabase first.');
  }
  return db.collection<T>(name);
}

// Typed collection getters for convenience
export const collections = {
  memories: () => getCollection<MemoryDocument>('memories'),
  openLoops: () => getCollection<OpenLoop>('open_loops'),
  personTimelineEvents: () => getCollection<PersonTimelineEvent>('person_timeline_events'),
  relationshipPatterns: () => getCollection<RelationshipPattern>('relationship_patterns'),
  relationshipSnapshots: () => getCollection<RelationshipSnapshot>('relationship_snapshots'),
  retrievalLogs: () => getCollection<RetrievalLog>('retrieval_logs'),
  learnedWeights: () => getCollection<LearnedWeights>('learned_weights'),
};

/**
 * Contact document structure for the contacts collection.
 */
export interface ContactDocument {
  _id?: string;
  userId: string;
  name: string;
  aliases?: string[];          // Other names they go by
  externalId?: string;         // ID from external system (CRM, etc.)
  howMet?: string;             // First meeting context
  firstSeenAt: string;         // ISO8601
  lastSeenAt?: string;         // ISO8601
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get or create a contact by name.
 * Sanitizes name input for security.
 */
export async function getOrCreateContact(
  userId: string,
  name: string,
  metadata?: Partial<ContactDocument>
): Promise<ContactDocument> {
  // Sanitize name first
  const sanitizedName = sanitizeContactName(name);
  if (!sanitizedName) {
    throw new Error('Invalid contact name');
  }

  const contactsCollection = getCollection<ContactDocument>('contacts');

  // Try to find existing contact
  const existing = await contactsCollection.findOne({
    userId,
    $or: [
      { name: { $regex: new RegExp(`^${escapeRegex(sanitizedName)}$`, 'i') } },
      { aliases: { $regex: new RegExp(`^${escapeRegex(sanitizedName)}$`, 'i') } }
    ]
  });

  if (existing) {
    // Update lastSeenAt
    await contactsCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastSeenAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );
    return existing;
  }

  // Create new contact
  const now = new Date().toISOString();
  const newContact: ContactDocument = {
    userId,
    name: sanitizedName,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...metadata,
  };

  const result = await contactsCollection.insertOne(newContact as any);
  return { ...newContact, _id: result.insertedId.toString() };
}

/**
 * Helper to escape regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Maximum contact name length (characters).
 */
const MAX_CONTACT_NAME_LENGTH = 200;

/**
 * Sanitize contact name for storage.
 * - Removes control characters
 * - Trims whitespace
 * - Limits length
 * - Returns null if name is empty/invalid
 */
function sanitizeContactName(name: string): string | null {
  if (!name || typeof name !== 'string') return null;

  // Remove control characters and null bytes
  let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  sanitized = sanitized.slice(0, MAX_CONTACT_NAME_LENGTH);

  // Return null if empty after sanitization
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Batch get or create contacts by names.
 * Much more efficient than calling getOrCreateContact in a loop.
 * Returns a Map of lowercase name -> ContactDocument for O(1) lookup.
 * Sanitizes all names for security.
 */
export async function batchGetOrCreateContacts(
  userId: string,
  names: string[]
): Promise<Map<string, ContactDocument>> {
  const contactsCollection = getCollection<ContactDocument>('contacts');
  const result = new Map<string, ContactDocument>();

  // Sanitize and filter names - deduplicate by sanitized lowercase
  const sanitizedNames = new Map<string, string>(); // lowercase -> sanitized
  for (const name of names) {
    const sanitized = sanitizeContactName(name);
    if (sanitized && sanitized.toLowerCase() !== 'unknown') {
      sanitizedNames.set(sanitized.toLowerCase(), sanitized);
    }
  }

  const uniqueNames = Array.from(sanitizedNames.values());

  if (uniqueNames.length === 0) return result;

  // Build regex patterns for all names (case-insensitive)
  const namePatterns = uniqueNames.map(name => ({
    original: name,
    regex: new RegExp(`^${escapeRegex(name)}$`, 'i')
  }));

  // Single query to find all existing contacts
  const existing = await contactsCollection.find({
    userId,
    $or: namePatterns.flatMap(({ regex }) => [
      { name: { $regex: regex } },
      { aliases: { $regex: regex } }
    ])
  }).toArray();

  // Map existing contacts by their names (lowercase for matching)
  const existingByName = new Map<string, ContactDocument>();
  for (const contact of existing) {
    existingByName.set(contact.name.toLowerCase(), contact);
    // Also map any aliases
    for (const alias of contact.aliases || []) {
      existingByName.set(alias.toLowerCase(), contact);
    }
  }

  // Track which names need to be created
  const toCreate: string[] = [];
  const now = new Date().toISOString();

  for (const name of uniqueNames) {
    const lowerName = name.toLowerCase();
    const existingContact = existingByName.get(lowerName);

    if (existingContact) {
      result.set(lowerName, existingContact);
    } else {
      toCreate.push(name);
    }
  }

  // Batch create new contacts
  if (toCreate.length > 0) {
    const newContacts: ContactDocument[] = toCreate.map(name => ({
      userId,
      name,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }));

    const insertResult = await contactsCollection.insertMany(newContacts as any);

    // Map the created contacts
    for (let i = 0; i < toCreate.length; i++) {
      const contact = {
        ...newContacts[i],
        _id: insertResult.insertedIds[i]?.toString()
      };
      result.set(toCreate[i].toLowerCase(), contact);
    }
  }

  // Batch update lastSeenAt for existing contacts (single operation)
  if (existing.length > 0) {
    await contactsCollection.updateMany(
      { _id: { $in: existing.map(c => c._id) } },
      { $set: { lastSeenAt: now, updatedAt: now } }
    );
  }

  return result;
}

/**
 * Memory salience extension fields to add to existing memories collection.
 * These fields should be added to the memories collection schema.
 */
export const MEMORY_SALIENCE_FIELDS = {
  // Salience scoring
  salienceScore: 'number',           // 0-100
  salienceComponents: 'object',      // SalienceComponents
  salienceWeightsUsed: 'object',     // SalienceWeights

  // Extracted features
  extractedFeatures: 'object',       // ExtractedFeatures

  // Capture context
  captureContext: 'object',          // CaptureContext

  // Retrieval tracking
  lastRetrievedAt: 'date',
  retrievalCount: 'number',

  // Computed flags
  hasFutureReferences: 'boolean',
  hasOpenLoops: 'boolean',
  earliestDueDate: 'date',

  // Version tracking
  salienceVersion: 'string',
};

/**
 * Add salience-related indexes to the memories collection.
 */
export async function addSalienceIndexesToMemories(memoriesCollection: Collection): Promise<void> {
  const indexes = [
    // Salience-weighted retrieval
    { spec: { userId: 1, salienceScore: -1, createdAt: -1 } },
    // Filter by salience threshold
    { spec: { userId: 1, salienceScore: 1 } },
    // Find memories with open loops
    { spec: { userId: 1, hasOpenLoops: 1, earliestDueDate: 1 } },
    // Find memories with future references
    { spec: { userId: 1, hasFutureReferences: 1 } },
    // Retrieval tracking
    { spec: { userId: 1, retrievalCount: -1 } },
    { spec: { userId: 1, lastRetrievedAt: -1 } },
  ];

  for (const index of indexes) {
    try {
      await memoriesCollection.createIndex(index.spec as IndexSpecification);
    } catch (error: any) {
      if (error.code !== 85 && error.code !== 86) {
        console.error('[SalienceDB] Error adding salience index to memories:', error.message);
      }
    }
  }

  console.log('[SalienceDB] Salience indexes added to memories collection');
}
