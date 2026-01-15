/**
 * @file Backup and Restore System for MemoRable
 * "TEMPORAL CONTROL → The power to CHOOSE what to forget"
 *
 * Rolling time machine with minute-level segmented recovery.
 * Supports both in-memory and MongoDB storage.
 * Tracks Mem0 imports for undoable integration.
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
// BACKUP STORE (In-memory for metadata, segments can be in DB or memory)
// =============================================================================

const backupStore = new Map<string, Backup>();
const frameStore = new Map<string, Frame>();
const importRecords = new Map<string, ImportRecord>();

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
 */
export async function createBackup(
  db: Db,
  reason: string = 'manual',
  frameName?: string
): Promise<BackupManifest> {
  const timestamp = new Date().toISOString();
  const backupId = `backup_${Date.now()}`;

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

  // Create manifest
  const manifest: BackupManifest = {
    id: backupId,
    timestamp,
    reason,
    version: BACKUP_CONFIG.VERSION,
    collections: collectionStats,
    total_documents: totalDocuments,
    total_segments: segments.length,
    segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
    checksum: simpleChecksum(JSON.stringify(segments.map(s => s.checksum))),
  };

  // Store backup
  backupStore.set(backupId, { manifest, segments });

  // Create frame if requested
  if (frameName) {
    frameStore.set(frameName, {
      name: frameName,
      backup_id: backupId,
      created_at: timestamp,
      document_count: totalDocuments,
    });
  }

  // Prune old backups
  pruneOldBackups();

  console.log(`[Backup] Created ${backupId}: ${totalDocuments} docs in ${segments.length} segments`);

  return manifest;
}

/**
 * Restore from a backup - point-in-time recovery.
 */
export async function restoreFromBackup(
  db: Db,
  backupId: string,
  options: {
    merge?: boolean;
    collections?: string[];
    segmentFilter?: number[];
  } = {}
): Promise<RestoreResult> {
  const backup = backupStore.get(backupId);
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const { merge = false, collections, segmentFilter } = options;

  // Create safety backup before restore
  const safetyBackup = await createBackup(db, 'pre_restore_safety');

  let segmentsToRestore = backup.segments;

  // Filter by collection if specified
  if (collections) {
    segmentsToRestore = segmentsToRestore.filter(s => collections.includes(s.collection));
  }

  // Filter by segment index if specified
  if (segmentFilter) {
    segmentsToRestore = segmentsToRestore.filter(s => segmentFilter.includes(s.index));
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
  const frame = frameStore.get(frameName);
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

  importRecords.set(importId, record);

  console.log(`[Import] Started import ${importId} from ${source}`);

  return importId;
}

/**
 * Track documents added during an import.
 */
export function trackImportedDocument(
  importId: string,
  collection: string,
  documentId: string
): void {
  const record = importRecords.get(importId);
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
 */
export function completeImport(importId: string): ImportRecord | undefined {
  const record = importRecords.get(importId);
  if (record) {
    record.status = 'completed';
    console.log(`[Import] Completed ${importId}: ${Object.values(record.document_ids).flat().length} documents`);
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
  const record = importRecords.get(importId);
  if (!record) {
    throw new Error(`Import not found: ${importId}`);
  }

  console.log(`[Import] Undoing import ${importId}...`);

  // Restore from pre-import backup
  const result = await restoreFromBackup(db, record.pre_import_backup_id, {
    collections: record.collections_affected,
  });

  // Mark import as rolled back
  record.status = 'rolled_back';

  return result;
}

/**
 * List all import records.
 */
export function listImports(userId?: string): ImportRecord[] {
  let records = Array.from(importRecords.values());
  if (userId) {
    records = records.filter(r => r.user_id === userId);
  }
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
  if (frameStore.has(name)) {
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

  frameStore.set(name, frame);

  return frame;
}

/**
 * List all frames.
 */
export function listFrames(): Frame[] {
  return Array.from(frameStore.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Delete a frame (does not delete the backup).
 */
export function deleteFrame(name: string): boolean {
  return frameStore.delete(name);
}

// =============================================================================
// BACKUP MANAGEMENT
// =============================================================================

/**
 * List all backups.
 */
export function listBackups(limit: number = 20): BackupManifest[] {
  return Array.from(backupStore.values())
    .map(b => b.manifest)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Get a specific backup segment (for efficient transfer).
 */
export function getBackupSegment(backupId: string, segmentIndex: number): BackupSegment | undefined {
  const backup = backupStore.get(backupId);
  if (!backup) return undefined;
  return backup.segments.find(s => s.index === segmentIndex);
}

/**
 * Prune old backups to prevent memory bloat.
 */
function pruneOldBackups(): void {
  const framedBackupIds = new Set(Array.from(frameStore.values()).map(f => f.backup_id));
  const importBackupIds = new Set(Array.from(importRecords.values()).map(r => r.pre_import_backup_id));

  const backups = Array.from(backupStore.entries())
    .filter(([id]) => !framedBackupIds.has(id) && !importBackupIds.has(id))
    .sort((a, b) => new Date(b[1].manifest.timestamp).getTime() - new Date(a[1].manifest.timestamp).getTime());

  const toRemove = backups.slice(BACKUP_CONFIG.MAX_BACKUPS);
  for (const [id] of toRemove) {
    backupStore.delete(id);
  }

  if (toRemove.length > 0) {
    console.log(`[Backup] Pruned ${toRemove.length} old backups`);
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
