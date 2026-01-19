/**
 * @file Preference model for MemoRable
 * User preferences and settings stored as key-value pairs.
 * Supports namespaced preferences for different features.
 */

import { Collection, Db } from 'mongodb';

// =============================================================================
// PREFERENCE TYPES
// =============================================================================

/**
 * Preference namespaces for organization.
 */
export type PreferenceNamespace =
  | 'general'           // General settings
  | 'privacy'           // Privacy preferences
  | 'notifications'     // Notification settings
  | 'salience'          // Memory salience tuning
  | 'display'           // UI/display preferences
  | 'integrations'      // Third-party integrations
  | 'custom';           // User-defined

/**
 * Preference document stored in MongoDB.
 */
export interface PreferenceDocument {
  _id?: string;

  /** User ID (indexed) */
  userId: string;

  /** Namespace for grouping (e.g., 'privacy', 'notifications') */
  namespace: PreferenceNamespace;

  /** Preference key within namespace */
  key: string;

  /** Preference value (any JSON-serializable type) */
  value: any;

  /** Optional description */
  description?: string;

  /** Data type hint for UI */
  valueType?: 'string' | 'number' | 'boolean' | 'array' | 'object';

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// DEFAULT PREFERENCES
// =============================================================================

/**
 * Default preferences for new users.
 */
export const DEFAULT_PREFERENCES: Array<{
  namespace: PreferenceNamespace;
  key: string;
  value: any;
  description?: string;
  valueType?: PreferenceDocument['valueType'];
}> = [
  // Privacy
  {
    namespace: 'privacy',
    key: 'defaultSecurityTier',
    value: 'Tier2_Personal',
    description: 'Default security tier for new memories',
    valueType: 'string',
  },
  {
    namespace: 'privacy',
    key: 'allowBehavioralIdentity',
    value: true,
    description: 'Enable behavioral identity fingerprinting',
    valueType: 'boolean',
  },
  {
    namespace: 'privacy',
    key: 'allowExternalLLM',
    value: false,
    description: 'Allow sending data to external LLMs (Tier1 only)',
    valueType: 'boolean',
  },

  // Notifications
  {
    namespace: 'notifications',
    key: 'openLoopReminders',
    value: true,
    description: 'Get reminded about open commitments',
    valueType: 'boolean',
  },
  {
    namespace: 'notifications',
    key: 'relationshipNudges',
    value: true,
    description: 'Get nudges for dormant relationships',
    valueType: 'boolean',
  },
  {
    namespace: 'notifications',
    key: 'reminderDaysBefore',
    value: 3,
    description: 'Days before deadline to start reminding',
    valueType: 'number',
  },

  // Salience tuning
  {
    namespace: 'salience',
    key: 'emotionalWeight',
    value: 0.30,
    description: 'Weight for emotional salience component',
    valueType: 'number',
  },
  {
    namespace: 'salience',
    key: 'noveltyWeight',
    value: 0.20,
    description: 'Weight for novelty salience component',
    valueType: 'number',
  },
  {
    namespace: 'salience',
    key: 'relevanceWeight',
    value: 0.20,
    description: 'Weight for relevance salience component',
    valueType: 'number',
  },
  {
    namespace: 'salience',
    key: 'socialWeight',
    value: 0.15,
    description: 'Weight for social salience component',
    valueType: 'number',
  },
  {
    namespace: 'salience',
    key: 'consequentialWeight',
    value: 0.15,
    description: 'Weight for consequential salience component',
    valueType: 'number',
  },

  // Display
  {
    namespace: 'display',
    key: 'timezone',
    value: 'UTC',
    description: 'Preferred timezone for dates',
    valueType: 'string',
  },
  {
    namespace: 'display',
    key: 'dateFormat',
    value: 'YYYY-MM-DD',
    description: 'Preferred date format',
    valueType: 'string',
  },

  // General
  {
    namespace: 'general',
    key: 'language',
    value: 'en',
    description: 'Preferred language',
    valueType: 'string',
  },
];

// =============================================================================
// DATABASE SETUP
// =============================================================================

let preferencesCollection: Collection<PreferenceDocument> | null = null;

/**
 * Initialize the preferences collection with proper indexes.
 */
export async function setupPreferencesCollection(db: Db): Promise<void> {
  const collections = await db.listCollections({ name: 'preferences' }).toArray();

  if (collections.length === 0) {
    await db.createCollection('preferences');
    console.log('[PreferenceModel] Created preferences collection');
  }

  preferencesCollection = db.collection<PreferenceDocument>('preferences');

  // Create indexes
  const indexes = [
    // Primary lookup - unique compound
    { spec: { userId: 1, namespace: 1, key: 1 }, options: { unique: true } },
    // Get all prefs for a user in a namespace
    { spec: { userId: 1, namespace: 1 } },
    // Get all user prefs
    { spec: { userId: 1 } },
  ];

  for (const index of indexes) {
    try {
      await preferencesCollection.createIndex(index.spec as any, index.options || {});
    } catch (error: any) {
      if (error.code !== 85 && error.code !== 86) {
        console.error('[PreferenceModel] Error creating index:', error.message);
      }
    }
  }

  console.log('[PreferenceModel] Preferences collection indexes created');
}

/**
 * Get the preferences collection.
 */
export function getPreferencesCollection(): Collection<PreferenceDocument> {
  if (!preferencesCollection) {
    throw new Error('Preferences collection not initialized. Call setupPreferencesCollection first.');
  }
  return preferencesCollection;
}

// =============================================================================
// PREFERENCE OPERATIONS
// =============================================================================

/**
 * Get a single preference.
 */
export async function getPreference<T = any>(
  userId: string,
  namespace: PreferenceNamespace,
  key: string
): Promise<T | undefined> {
  const pref = await getPreferencesCollection().findOne({ userId, namespace, key });
  return pref?.value as T | undefined;
}

/**
 * Get a preference with a default value.
 */
export async function getPreferenceWithDefault<T = any>(
  userId: string,
  namespace: PreferenceNamespace,
  key: string,
  defaultValue: T
): Promise<T> {
  const value = await getPreference<T>(userId, namespace, key);
  return value !== undefined ? value : defaultValue;
}

/**
 * Set a preference.
 */
export async function setPreference(
  userId: string,
  namespace: PreferenceNamespace,
  key: string,
  value: any,
  options?: { description?: string; valueType?: PreferenceDocument['valueType'] }
): Promise<void> {
  const now = new Date().toISOString();

  await getPreferencesCollection().updateOne(
    { userId, namespace, key },
    {
      $set: {
        value,
        description: options?.description,
        valueType: options?.valueType,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
}

/**
 * Delete a preference.
 */
export async function deletePreference(
  userId: string,
  namespace: PreferenceNamespace,
  key: string
): Promise<boolean> {
  const result = await getPreferencesCollection().deleteOne({ userId, namespace, key });
  return result.deletedCount > 0;
}

/**
 * Get all preferences in a namespace.
 */
export async function getPreferencesByNamespace(
  userId: string,
  namespace: PreferenceNamespace
): Promise<Record<string, any>> {
  const prefs = await getPreferencesCollection()
    .find({ userId, namespace })
    .toArray();

  return prefs.reduce((acc, pref) => {
    acc[pref.key] = pref.value;
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Get all preferences for a user.
 */
export async function getAllPreferences(userId: string): Promise<Record<PreferenceNamespace, Record<string, any>>> {
  const prefs = await getPreferencesCollection()
    .find({ userId })
    .toArray();

  const result: Record<string, Record<string, any>> = {};

  for (const pref of prefs) {
    if (!result[pref.namespace]) {
      result[pref.namespace] = {};
    }
    result[pref.namespace][pref.key] = pref.value;
  }

  return result as Record<PreferenceNamespace, Record<string, any>>;
}

/**
 * Set multiple preferences at once.
 */
export async function setPreferences(
  userId: string,
  preferences: Array<{
    namespace: PreferenceNamespace;
    key: string;
    value: any;
    description?: string;
    valueType?: PreferenceDocument['valueType'];
  }>
): Promise<void> {
  const now = new Date().toISOString();

  const operations = preferences.map(pref => ({
    updateOne: {
      filter: { userId, namespace: pref.namespace, key: pref.key },
      update: {
        $set: {
          value: pref.value,
          description: pref.description,
          valueType: pref.valueType,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  await getPreferencesCollection().bulkWrite(operations);
}

/**
 * Initialize default preferences for a new user.
 */
export async function initializeUserPreferences(userId: string): Promise<void> {
  const now = new Date().toISOString();

  // Check if user already has preferences
  const existing = await getPreferencesCollection().countDocuments({ userId });
  if (existing > 0) {
    return; // Already initialized
  }

  const documents: PreferenceDocument[] = DEFAULT_PREFERENCES.map(pref => ({
    userId,
    namespace: pref.namespace,
    key: pref.key,
    value: pref.value,
    description: pref.description,
    valueType: pref.valueType,
    createdAt: now,
    updatedAt: now,
  }));

  await getPreferencesCollection().insertMany(documents as any);
  console.log(`[PreferenceModel] Initialized ${documents.length} default preferences for user: ${userId}`);
}

/**
 * Get salience weights for a user.
 * Convenience function for the salience calculator.
 */
export async function getSalienceWeights(userId: string): Promise<{
  emotional: number;
  novelty: number;
  relevance: number;
  social: number;
  consequential: number;
}> {
  const prefs = await getPreferencesByNamespace(userId, 'salience');

  return {
    emotional: prefs.emotionalWeight ?? 0.30,
    novelty: prefs.noveltyWeight ?? 0.20,
    relevance: prefs.relevanceWeight ?? 0.20,
    social: prefs.socialWeight ?? 0.15,
    consequential: prefs.consequentialWeight ?? 0.15,
  };
}

/**
 * Reset preferences to defaults.
 */
export async function resetPreferences(userId: string): Promise<void> {
  // Delete all user preferences
  await getPreferencesCollection().deleteMany({ userId });

  // Re-initialize with defaults
  await initializeUserPreferences(userId);

  console.log(`[PreferenceModel] Reset preferences to defaults for user: ${userId}`);
}

/**
 * Export preferences as a portable object.
 */
export async function exportPreferences(userId: string): Promise<object> {
  const prefs = await getPreferencesCollection()
    .find({ userId })
    .project({ _id: 0, userId: 0 })
    .toArray();

  return {
    exportedAt: new Date().toISOString(),
    preferences: prefs,
  };
}

/**
 * Import preferences from an export.
 */
export async function importPreferences(
  userId: string,
  data: { preferences: Array<{ namespace: string; key: string; value: any }> }
): Promise<number> {
  const validPrefs = data.preferences.filter(
    p => p.namespace && p.key && p.value !== undefined
  );

  await setPreferences(
    userId,
    validPrefs.map(p => ({
      namespace: p.namespace as PreferenceNamespace,
      key: p.key,
      value: p.value,
    }))
  );

  return validPrefs.length;
}
