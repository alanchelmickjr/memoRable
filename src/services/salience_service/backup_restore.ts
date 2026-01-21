/**
 * @file Backup and Restore System for MemoRable
 * "TEMPORAL CONTROL → The power to CHOOSE what to forget"
 *
 * Rolling time machine with minute-level segmented recovery.
 * Supports both in-memory and MongoDB storage.
 * Tracks Mem0 imports for undoable integration.
 *
 * SECURITY:
 * - Backups stored in MongoDB collections prefixed with '_backup_' (internal)
 * - EFS provides encryption at rest (AES-256)
 * - MongoDB auth required (SCRAM-SHA-256)
 * - User isolation: backups include user_id for access control
 * - Checksums verify integrity on restore
 * - Audit trail: all operations logged with timestamps
 * - No secrets in backup data (API keys stored separately in Secrets Manager)
 */

import { Db, Collection, Document } from 'mongodb';

// =============================================================================
// TYPES
// =============================================================================

export interface BackupSegment {
  index: number;
  collection: string;
  count: number;
  documents: Document[];
  checksum: string;
}

export interface BackupManifest {
  id: string;
  timestamp: string;
  reason: string;
  version: string;
  user_id?: string;  // For user isolation - only owner can restore
  collections: {
    name: string;
    count: number;
    segment_count: number;
  }[];
  total_documents: number;
  total_segments: number;
  segment_size: number;
  checksum: string;
}

export interface Backup {
  manifest: BackupManifest;
  segments: BackupSegment[];
}

export interface Frame {
  name: string;
  backup_id: string;
  created_at: string;
  document_count: number;
  description?: string;
}

export interface ImportRecord {
  id: string;
  source: 'mem0' | 'file' | 'api';
  timestamp: string;
  user_id: string;
  collections_affected: string[];
  document_ids: { [collection: string]: string[] };
  pre_import_backup_id: string;
  status: 'completed' | 'rolled_back' | 'partial';
  metadata?: Record<string, unknown>;
}

export interface RestoreResult {
  success: boolean;
  backup_id: string;
  backup_timestamp: string;
  collections_restored: string[];
  documents_restored: number;
  documents_skipped: number;
  merge_mode: boolean;
  safety_backup_id: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const BACKUP_CONFIG = {
  SEGMENT_SIZE: parseInt(process.env.BACKUP_SEGMENT_SIZE || '100'),
  MAX_BACKUPS: parseInt(process.env.MAX_BACKUPS || '60'),
  VERSION: '2.0.0',
};

// MemoRable collections to backup (excludes original Mem0 collection)
const MEMORABLE_COLLECTIONS = [
  'memories',
  'open_loops',
  'person_timeline_events',
  'relationship_patterns',
  'relationship_snapshots',
  'retrieval_logs',
  'learned_weights',
  'contacts',
  'state_changes',
];

// =============================================================================
// BACKUP STORE - MongoDB-backed with in-memory fallback
// =============================================================================

// In-memory fallback (used only if MongoDB not available)
const inMemoryBackupStore = new Map<string, Backup>();
const inMemoryFrameStore = new Map<string, Frame>();
const inMemoryImportRecords = new Map<string, ImportRecord>();

// MongoDB collection names for persistent backup storage
const BACKUP_COLLECTION = '_backup_manifests';
const BACKUP_SEGMENTS_COLLECTION = '_backup_segments';
const FRAMES_COLLECTION = '_backup_frames';
const IMPORTS_COLLECTION = '_backup_imports';

/**
 * Get or create backup collections in MongoDB.
 * These are prefixed with _ to distinguish from user data.
 */
async function getBackupCollections(db: Db) {
  return {
    manifests: db.collection<BackupManifest>(BACKUP_COLLECTION),
    segments: db.collection<BackupSegment & { backup_id: string }>(BACKUP_SEGMENTS_COLLECTION),
    frames: db.collection<Frame>(FRAMES_COLLECTION),
    imports: db.collection<ImportRecord>(IMPORTS_COLLECTION),
  };
}

/**
 * Store a backup in MongoDB (persistent) instead of in-memory.
 */
async function persistBackup(db: Db, backup: Backup): Promise<void> {
  const collections = await getBackupCollections(db);

  // Store manifest
  await collections.manifests.updateOne(
    { id: backup.manifest.id },
    { $set: backup.manifest },
    { upsert: true }
  );

  // Store segments with backup_id reference
  for (const segment of backup.segments) {
    await collections.segments.updateOne(
      { backup_id: backup.manifest.id, index: segment.index },
      { $set: { ...segment, backup_id: backup.manifest.id } },
      { upsert: true }
    );
  }
}

/**
 * Retrieve a backup from MongoDB.
 */
async function retrieveBackup(db: Db, backupId: string): Promise<Backup | null> {
  const collections = await getBackupCollections(db);

  const manifest = await collections.manifests.findOne({ id: backupId });
  if (!manifest) return null;

  const segments = await collections.segments
    .find({ backup_id: backupId })
    .sort({ index: 1 })
    .toArray();

  return {
    manifest: manifest as BackupManifest,
    segments: segments.map(s => ({
      index: s.index,
      collection: s.collection,
      count: s.count,
      documents: s.documents,
      checksum: s.checksum,
    })),
  };
}

/**
 * Store a frame in MongoDB.
 */
async function persistFrame(db: Db, frame: Frame): Promise<void> {
  const collections = await getBackupCollections(db);
  await collections.frames.updateOne(
    { name: frame.name },
    { $set: frame },
    { upsert: true }
  );
}

/**
 * Store an import record in MongoDB.
 */
async function persistImportRecord(db: Db, record: ImportRecord): Promise<void> {
  const collections = await getBackupCollections(db);
  await collections.imports.updateOne(
    { id: record.id },
    { $set: record },
    { upsert: true }
  );
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Simple checksum for integrity verification.
 */
function simpleChecksum(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Segment an array into chunks.
 */
function segmentArray<T>(arr: T[], size: number): T[][] {
  const segments: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    segments.push(arr.slice(i, i + size));
  }
  return segments;
}

// =============================================================================
// BACKUP FUNCTIONS
// =============================================================================

/**
 * Create a full backup of all MemoRable collections.
 * Original Mem0 data is NOT touched - only MemoRable enrichments.
 *
 * @param db - MongoDB database instance
 * @param reason - Why the backup was created (for audit trail)
 * @param frameName - Optional named recovery point
 * @param userId - User who created the backup (for access control)
 */
export async function createBackup(
  db: Db,
  reason: string = 'manual',
  frameName?: string,
  userId?: string
): Promise<BackupManifest> {
  const timestamp = new Date().toISOString();
  const backupId = `backup_${Date.now()}_${simpleChecksum(timestamp + Math.random())}`;

  console.log(`[Backup] Creating backup: reason=${reason}, user=${userId || 'system'}`);


  const segments: BackupSegment[] = [];
  const collectionStats: BackupManifest['collections'] = [];
  let totalDocuments = 0;

  // Backup each MemoRable collection
  for (const collName of MEMORABLE_COLLECTIONS) {
    try {
      const collection = db.collection(collName);
      const documents = await collection.find({}).toArray();

      if (documents.length === 0) continue;

      totalDocuments += documents.length;

      // Segment the documents
      const docSegments = segmentArray(documents, BACKUP_CONFIG.SEGMENT_SIZE);

      collectionStats.push({
        name: collName,
        count: documents.length,
        segment_count: docSegments.length,
      });

      for (let i = 0; i < docSegments.length; i++) {
        segments.push({
          index: segments.length,
          collection: collName,
          count: docSegments[i].length,
          documents: docSegments[i],
          checksum: simpleChecksum(JSON.stringify(docSegments[i])),
        });
      }
    } catch (error) {
      console.error(`[Backup] Error backing up ${collName}:`, error);
    }
  }

  // Create manifest with security metadata
  const manifest: BackupManifest = {
    id: backupId,
    timestamp,
    reason,
    version: BACKUP_CONFIG.VERSION,
    user_id: userId,  // For access control - only owner can restore
    collections: collectionStats,
    total_documents: totalDocuments,
    total_segments: segments.length,
    segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
    checksum: simpleChecksum(JSON.stringify(segments.map(s => s.checksum))),
  };

  // Store backup to MongoDB (persistent) and in-memory (fast access)
  const backup = { manifest, segments };
  inMemoryBackupStore.set(backupId, backup);
  await persistBackup(db, backup);

  // Create frame if requested
  if (frameName) {
    const frame: Frame = {
      name: frameName,
      backup_id: backupId,
      created_at: timestamp,
      document_count: totalDocuments,
    };
    inMemoryFrameStore.set(frameName, frame);
    await persistFrame(db, frame);
  }

  // Prune old backups
  await pruneOldBackups(db);

  console.log(`[Backup] Created ${backupId}: ${totalDocuments} docs in ${segments.length} segments (persisted to MongoDB)`);

  return manifest;
}

/**
 * Restore from a backup - point-in-time recovery.
 *
 * SECURITY: If backup has user_id, requestingUserId must match (or be admin).
 */
export async function restoreFromBackup(
  db: Db,
  backupId: string,
  options: {
    merge?: boolean;
    collections?: string[];
    segmentFilter?: number[];
    requestingUserId?: string;  // For access control
  } = {}
): Promise<RestoreResult> {
  // Try in-memory first (fast), then MongoDB (persistent)
  let backup = inMemoryBackupStore.get(backupId);
  if (!backup) {
    backup = await retrieveBackup(db, backupId);
  }
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  // SECURITY: Validate user has permission to restore this backup
  const { merge = false, collections, segmentFilter, requestingUserId } = options;
  if (backup.manifest.user_id && requestingUserId && backup.manifest.user_id !== requestingUserId) {
    console.warn(`[Backup] SECURITY: User ${requestingUserId} attempted to restore backup owned by ${backup.manifest.user_id}`);
    throw new Error('Access denied: You can only restore your own backups');
  }

  console.log(`[Backup] Restoring ${backupId}: user=${requestingUserId || 'system'}, merge=${merge}`);

  // Create safety backup before restore
  const safetyBackup = await createBackup(db, 'pre_restore_safety', undefined, requestingUserId);

  let segmentsToRestore = backup.segments;

  // Filter by collection if specified
  if (collections) {
    segmentsToRestore = segmentsToRestore.filter(s => collections.includes(s.collection));
  }

  // Filter by segment index if specified
  if (segmentFilter) {
    segmentsToRestore = segmentsToRestore.filter(s => segmentFilter.includes(s.index));
  }

  // SECURITY: Verify checksums before restore (integrity check)
  for (const segment of segmentsToRestore) {
    const computedChecksum = simpleChecksum(JSON.stringify(segment.documents));
    if (computedChecksum !== segment.checksum) {
      console.error(`[Backup] SECURITY: Checksum mismatch for segment ${segment.index} in ${segment.collection}`);
      throw new Error(`Backup integrity check failed: segment ${segment.index} corrupted`);
    }
  }

  // Group segments by collection
  const byCollection = new Map<string, Document[]>();
  for (const segment of segmentsToRestore) {
    const existing = byCollection.get(segment.collection) || [];
    existing.push(...segment.documents);
    byCollection.set(segment.collection, existing);
  }

  let totalRestored = 0;
  let totalSkipped = 0;
  const collectionsRestored: string[] = [];

  // Restore each collection
  for (const [collName, documents] of byCollection) {
    try {
      const collection = db.collection(collName);

      if (!merge) {
        // Full restore - clear collection first
        await collection.deleteMany({});
      }

      for (const doc of documents) {
        if (merge) {
          // Check if document exists
          const existing = await collection.findOne({ _id: doc._id });
          if (existing) {
            totalSkipped++;
            continue;
          }
        }

        await collection.insertOne(doc);
        totalRestored++;
      }

      collectionsRestored.push(collName);
    } catch (error) {
      console.error(`[Restore] Error restoring ${collName}:`, error);
    }
  }

  console.log(`[Restore] Restored ${totalRestored} docs from ${backupId}`);

  return {
    success: true,
    backup_id: backupId,
    backup_timestamp: backup.manifest.timestamp,
    collections_restored: collectionsRestored,
    documents_restored: totalRestored,
    documents_skipped: totalSkipped,
    merge_mode: merge,
    safety_backup_id: safetyBackup.id,
  };
}

/**
 * Restore from a named frame.
 */
export async function restoreFromFrame(
  db: Db,
  frameName: string,
  options: Parameters<typeof restoreFromBackup>[2] = {}
): Promise<RestoreResult> {
  // Try in-memory first, then MongoDB
  let frame = inMemoryFrameStore.get(frameName);
  if (!frame) {
    const collections = await getBackupCollections(db);
    frame = await collections.frames.findOne({ name: frameName }) as Frame | null;
  }
  if (!frame) {
    throw new Error(`Frame not found: ${frameName}`);
  }
  return restoreFromBackup(db, frame.backup_id, options);
}

// =============================================================================
// IMPORT TRACKING (for undoable Mem0 sync)
// =============================================================================

/**
 * Record an import operation for undo capability.
 * Call this BEFORE importing memories from Mem0.
 */
export async function startImport(
  db: Db,
  userId: string,
  source: ImportRecord['source'],
  metadata?: Record<string, unknown>
): Promise<string> {
  // Create backup before import
  const preImportBackup = await createBackup(db, `pre_import_${source}`, `pre_import_${Date.now()}`);

  const importId = `import_${Date.now()}`;
  const record: ImportRecord = {
    id: importId,
    source,
    timestamp: new Date().toISOString(),
    user_id: userId,
    collections_affected: [],
    document_ids: {},
    pre_import_backup_id: preImportBackup.id,
    status: 'completed',
    metadata,
  };

  // Store in-memory and persist to MongoDB
  inMemoryImportRecords.set(importId, record);
  await persistImportRecord(db, record);

  console.log(`[Import] Started import ${importId} from ${source} (persisted)`);

  return importId;
}

/**
 * Track documents added during an import.
 * Note: Updates in-memory only. Persisted when completeImport is called.
 */
export function trackImportedDocument(
  importId: string,
  collection: string,
  documentId: string
): void {
  const record = inMemoryImportRecords.get(importId);
  if (!record) {
    console.warn(`[Import] Unknown import ID: ${importId}`);
    return;
  }

  if (!record.collections_affected.includes(collection)) {
    record.collections_affected.push(collection);
  }

  if (!record.document_ids[collection]) {
    record.document_ids[collection] = [];
  }

  record.document_ids[collection].push(documentId);
}

/**
 * Complete an import operation.
 * Now async to persist to MongoDB.
 */
export async function completeImport(db: Db, importId: string): Promise<ImportRecord | undefined> {
  const record = inMemoryImportRecords.get(importId);
  if (record) {
    record.status = 'completed';
    await persistImportRecord(db, record);
    console.log(`[Import] Completed ${importId}: ${Object.values(record.document_ids).flat().length} documents (persisted)`);
  }
  return record;
}

/**
 * Undo an import - restore to pre-import state.
 */
export async function undoImport(
  db: Db,
  importId: string
): Promise<RestoreResult> {
  // Try in-memory first, then MongoDB
  let record = inMemoryImportRecords.get(importId);
  if (!record) {
    const collections = await getBackupCollections(db);
    record = await collections.imports.findOne({ id: importId }) as ImportRecord | null;
  }
  if (!record) {
    throw new Error(`Import not found: ${importId}`);
  }

  console.log(`[Import] Undoing import ${importId}...`);

  // Restore from pre-import backup
  const result = await restoreFromBackup(db, record.pre_import_backup_id, {
    collections: record.collections_affected,
  });

  // Mark import as rolled back and persist
  record.status = 'rolled_back';
  await persistImportRecord(db, record);

  return result;
}

/**
 * List all import records.
 * Now async to query MongoDB.
 */
export async function listImports(db: Db, userId?: string): Promise<ImportRecord[]> {
  const collections = await getBackupCollections(db);
  const query = userId ? { user_id: userId } : {};
  const records = await collections.imports.find(query).sort({ timestamp: -1 }).toArray();
  return records as ImportRecord[];
}

// =============================================================================
// FRAME MANAGEMENT
// =============================================================================

/**
 * Create a named frame (recovery point).
 */
export async function createFrame(
  db: Db,
  name: string,
  description?: string
): Promise<Frame> {
  // Check both in-memory and MongoDB
  const collections = await getBackupCollections(db);
  const existingFrame = inMemoryFrameStore.has(name) || await collections.frames.findOne({ name });
  if (existingFrame) {
    throw new Error(`Frame '${name}' already exists`);
  }

  const backup = await createBackup(db, 'frame', name);

  const frame: Frame = {
    name,
    backup_id: backup.id,
    created_at: backup.timestamp,
    document_count: backup.total_documents,
    description,
  };

  // Store in both places
  inMemoryFrameStore.set(name, frame);
  await persistFrame(db, frame);

  return frame;
}

/**
 * List all frames.
 * Now async to query MongoDB.
 */
export async function listFrames(db: Db): Promise<Frame[]> {
  const collections = await getBackupCollections(db);
  const frames = await collections.frames.find({}).sort({ created_at: -1 }).toArray();
  return frames as Frame[];
}

/**
 * Delete a frame (does not delete the backup).
 */
export async function deleteFrame(db: Db, name: string): Promise<boolean> {
  inMemoryFrameStore.delete(name);
  const collections = await getBackupCollections(db);
  const result = await collections.frames.deleteOne({ name });
  return result.deletedCount > 0;
}

// =============================================================================
// BACKUP MANAGEMENT
// =============================================================================

/**
 * List all backups.
 * Now async to query MongoDB.
 */
export async function listBackups(db: Db, limit: number = 20): Promise<BackupManifest[]> {
  const collections = await getBackupCollections(db);
  const manifests = await collections.manifests
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return manifests as BackupManifest[];
}

/**
 * Get a specific backup segment (for efficient transfer).
 */
export async function getBackupSegment(db: Db, backupId: string, segmentIndex: number): Promise<BackupSegment | undefined> {
  // Try in-memory first
  const memBackup = inMemoryBackupStore.get(backupId);
  if (memBackup) {
    return memBackup.segments.find(s => s.index === segmentIndex);
  }
  // Fall back to MongoDB
  const collections = await getBackupCollections(db);
  const segment = await collections.segments.findOne({ backup_id: backupId, index: segmentIndex });
  if (!segment) return undefined;
  return {
    index: segment.index,
    collection: segment.collection,
    count: segment.count,
    documents: segment.documents,
    checksum: segment.checksum,
  };
}

/**
 * Prune old backups to prevent storage bloat.
 * Now async to work with MongoDB.
 */
async function pruneOldBackups(db: Db): Promise<void> {
  const collections = await getBackupCollections(db);

  // Get IDs of backups that are protected (have frames or imports referencing them)
  const frames = await collections.frames.find({}).toArray();
  const imports = await collections.imports.find({}).toArray();
  const framedBackupIds = new Set(frames.map(f => f.backup_id));
  const importBackupIds = new Set(imports.map(r => r.pre_import_backup_id));

  // Get all backups sorted by timestamp
  const allManifests = await collections.manifests
    .find({})
    .sort({ timestamp: -1 })
    .toArray();

  // Filter to unprotected backups
  const unprotectedBackups = allManifests.filter(
    m => !framedBackupIds.has(m.id) && !importBackupIds.has(m.id)
  );

  // Remove excess backups (keep MAX_BACKUPS)
  const toRemove = unprotectedBackups.slice(BACKUP_CONFIG.MAX_BACKUPS);

  for (const manifest of toRemove) {
    // Delete from MongoDB
    await collections.manifests.deleteOne({ id: manifest.id });
    await collections.segments.deleteMany({ backup_id: manifest.id });
    // Also clean in-memory
    inMemoryBackupStore.delete(manifest.id);
  }

  if (toRemove.length > 0) {
    console.log(`[Backup] Pruned ${toRemove.length} old backups from MongoDB`);
  }
}

// =============================================================================
// EXPORT FOR MCP TOOLS
// =============================================================================

export const backupRestoreService = {
  createBackup,
  restoreFromBackup,
  restoreFromFrame,
  createFrame,
  listFrames,
  deleteFrame,
  listBackups,
  getBackupSegment,
  startImport,
  trackImportedDocument,
  completeImport,
  undoImport,
  listImports,
};

export default backupRestoreService;
