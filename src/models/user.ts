/**
 * @file User model for MemoRable - Space Shuttle Grade
 *
 * Enterprise-grade multi-tenant user system with:
 * - Input validation and sanitization
 * - Audit trail for all mutations
 * - Soft delete (GDPR compliance)
 * - Password policy enforcement
 * - Entity system integration
 * - Rate limit tracking per user
 * - Recovery mechanisms
 * - Schema versioning
 *
 * @security All PII fields should be encrypted at rest (Tier2+)
 * @compliance GDPR, CCPA ready with consent tracking
 */

import { Collection, Db, ClientSession, ObjectId } from 'mongodb';
import crypto from 'crypto';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Schema version for migration tracking */
export const USER_SCHEMA_VERSION = 1;

/** Validation constants */
export const VALIDATION = {
  USER_ID_MIN: 3,
  USER_ID_MAX: 32,
  USER_ID_PATTERN: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
  DISPLAY_NAME_MAX: 100,
  EMAIL_MAX: 254,
  PASSPHRASE_MIN: 8,
  PASSPHRASE_MAX: 128,
  // Passphrase must have: lowercase, uppercase, number OR be 16+ chars
  PASSPHRASE_PATTERN_STRONG: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$|^.{16,}$/,
} as const;

/** Lockout configuration */
export const LOCKOUT = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  ATTEMPT_WINDOW_MS: 60 * 60 * 1000,   // 1 hour window for attempts
  PROGRESSIVE_MULTIPLIER: 2,           // Each lockout doubles duration
} as const;

// =============================================================================
// TYPES
// =============================================================================

export type UserTier = 'free' | 'pro' | 'enterprise';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'deleted';
export type AuditAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'passphrase_changed'
  | 'tier_changed'
  | 'admin_granted'
  | 'admin_revoked'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'device_added'
  | 'device_revoked'
  | 'locked'
  | 'unlocked'
  | 'deleted'
  | 'restored';

/**
 * Audit log entry for user changes.
 */
export interface UserAuditEntry {
  action: AuditAction;
  timestamp: string;
  performedBy: string;       // userId or 'system'
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  previousValue?: unknown;
  newValue?: unknown;
}

/**
 * Rate limit tracking per operation type.
 */
export interface RateLimitState {
  operation: string;
  count: number;
  windowStart: string;
  blocked: boolean;
  blockedUntil?: string;
}

/**
 * Recovery options for account access.
 */
export interface RecoveryOptions {
  /** Backup codes (hashed) */
  backupCodes?: string[];
  /** Recovery email (different from primary) */
  recoveryEmail?: string;
  /** Security questions (hashed answers) */
  securityQuestions?: Array<{
    question: string;
    answerHash: string;
  }>;
  /** Last recovery attempt */
  lastRecoveryAttempt?: string;
  /** Recovery token (hashed, short-lived) */
  recoveryTokenHash?: string;
  recoveryTokenExpires?: string;
}

// =============================================================================
// BIOMETRIC AUTHENTICATION
// =============================================================================

/**
 * Biometric authentication modalities.
 * Face and voice are primary - future: gait, typing pattern, etc.
 */
export type BiometricModality = 'face' | 'voice' | 'fingerprint' | 'iris';

/**
 * Biometric template storage.
 * NEVER store raw biometric data - only feature vectors/templates.
 *
 * @security Templates are one-way - cannot reconstruct original biometric
 * @privacy Tier3 encryption required for biometric templates
 */
export interface BiometricTemplate {
  /** Modality type */
  modality: BiometricModality;
  /** Encrypted feature vector (not raw image/audio!) */
  templateHash: string;
  /** Algorithm version for compatibility */
  algorithmVersion: string;
  /** Quality score at enrollment (0-100) */
  enrollmentQuality: number;
  /** Device used for enrollment */
  enrollmentDevice?: string;
  /** Enrollment timestamp */
  enrolledAt: string;
  /** Last successful match */
  lastMatchAt?: string;
  /** Match count for analytics */
  matchCount: number;
  /** False accept rate threshold */
  farThreshold: number;
  /** Active status */
  active: boolean;
}

/**
 * Face recognition template.
 * Uses 128-dimensional face embedding (e.g., dlib, FaceNet, ArcFace).
 */
export interface FaceTemplate extends BiometricTemplate {
  modality: 'face';
  /** Embedding dimension (typically 128 or 512) */
  embeddingDimension: number;
  /** Liveness detection passed at enrollment */
  livenessVerified: boolean;
  /** Multiple angles enrolled? */
  multiAngle: boolean;
}

/**
 * Voice print template.
 * Uses speaker embedding (e.g., x-vector, d-vector).
 */
export interface VoiceTemplate extends BiometricTemplate {
  modality: 'voice';
  /** Duration of enrollment audio (seconds) */
  enrollmentDuration: number;
  /** Sample rate of enrollment audio */
  sampleRate: number;
  /** Text-dependent or text-independent */
  textDependent: boolean;
  /** Passphrase used (if text-dependent) - hashed */
  passphraseHash?: string;
}

/**
 * Biometric authentication state.
 */
export interface BiometricAuthState {
  /** Enrolled templates by modality */
  templates: {
    face?: FaceTemplate;
    voice?: VoiceTemplate;
    fingerprint?: BiometricTemplate;
    iris?: BiometricTemplate;
  };
  /** Biometric-only login allowed (no passphrase) */
  biometricOnlyEnabled: boolean;
  /** Require liveness detection */
  livenessRequired: boolean;
  /** Require multiple modalities (face + voice) */
  multiModalRequired: boolean;
  /** Anti-spoofing level: low, medium, high */
  antiSpoofingLevel: 'low' | 'medium' | 'high';
  /** Last biometric auth attempt */
  lastBiometricAttempt?: string;
  /** Failed biometric attempts (reset on success) */
  failedBiometricAttempts: number;
}

/**
 * GDPR/Compliance tracking.
 */
export interface ComplianceState {
  /** Terms of service version accepted */
  tosVersion?: string;
  tosAcceptedAt?: string;
  /** Privacy policy version accepted */
  privacyVersion?: string;
  privacyAcceptedAt?: string;
  /** Marketing consent */
  marketingConsent: boolean;
  marketingConsentAt?: string;
  /** Data processing consent */
  dataProcessingConsent: boolean;
  dataProcessingConsentAt?: string;
  /** Data export requests */
  lastExportRequest?: string;
  /** Deletion request (for grace period) */
  deletionRequestedAt?: string;
  deletionScheduledFor?: string;
}

/**
 * Full user document stored in MongoDB.
 */
export interface UserDocument {
  _id?: ObjectId;

  // Identity
  userId: string;
  passphraseHash: string;
  email?: string;
  emailVerified: boolean;
  emailVerificationToken?: string;
  displayName?: string;

  // Entity system integration
  entityId?: string;           // Links to contacts/entities collection

  // Account state
  tier: UserTier;
  status: UserStatus;
  isAdmin: boolean;
  isSuperAdmin: boolean;       // Can delete users, billing, etc.

  // Authentication state
  auth: {
    failedAttempts: number;
    failedAttemptsWindow: string[];  // Timestamps of recent failures
    lockedUntil: string | null;
    lockCount: number;               // Progressive lockout tracking
    lastLogin: string | null;
    lastLoginIp?: string;
    lastLoginUserAgent?: string;
    mfaEnabled: boolean;
    mfaSecret?: string;              // Encrypted TOTP secret
    mfaBackupCodes?: string[];       // Hashed backup codes
    passwordChangedAt?: string;
    forcePasswordChange: boolean;
  };

  // Recovery
  recovery: RecoveryOptions;

  // Biometric authentication (face, voice, etc.)
  biometric: BiometricAuthState;

  // Usage limits (tier-based)
  limits: {
    maxDevices: number;
    maxMemoriesPerDay: number;
    maxStorageBytes: number;
    maxApiCallsPerMinute: number;
    maxApiCallsPerDay: number;
  };

  // Current usage
  usage: {
    deviceCount: number;
    memoriesStoredToday: number;
    totalStorageBytes: number;
    apiCallsThisMinute: number;
    apiCallsToday: number;
    lastUsageReset: string;
    lastApiCallReset: string;
  };

  // Rate limiting state
  rateLimits: RateLimitState[];

  // Compliance
  compliance: ComplianceState;

  // Audit trail (last N entries, full trail in separate collection)
  auditTrail: UserAuditEntry[];

  // Metadata
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;

  // Soft delete
  deletedAt?: string;
  deletedBy?: string;
}

// =============================================================================
// TIER LIMITS
// =============================================================================

export const TIER_LIMITS: Record<UserTier, UserDocument['limits']> = {
  free: {
    maxDevices: 3,
    maxMemoriesPerDay: 100,
    maxStorageBytes: 100 * 1024 * 1024,        // 100 MB
    maxApiCallsPerMinute: 30,
    maxApiCallsPerDay: 1000,
  },
  pro: {
    maxDevices: 10,
    maxMemoriesPerDay: 1000,
    maxStorageBytes: 1024 * 1024 * 1024,       // 1 GB
    maxApiCallsPerMinute: 100,
    maxApiCallsPerDay: 10000,
  },
  enterprise: {
    maxDevices: 100,
    maxMemoriesPerDay: 10000,
    maxStorageBytes: 10 * 1024 * 1024 * 1024,  // 10 GB
    maxApiCallsPerMinute: 500,
    maxApiCallsPerDay: 100000,
  },
};

// =============================================================================
// VALIDATION
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate user ID format.
 */
export function validateUserId(userId: string): ValidationResult {
  const errors: string[] = [];

  if (!userId || typeof userId !== 'string') {
    errors.push('userId is required and must be a string');
    return { valid: false, errors };
  }

  const trimmed = userId.trim();

  if (trimmed.length < VALIDATION.USER_ID_MIN) {
    errors.push(`userId must be at least ${VALIDATION.USER_ID_MIN} characters`);
  }

  if (trimmed.length > VALIDATION.USER_ID_MAX) {
    errors.push(`userId must be at most ${VALIDATION.USER_ID_MAX} characters`);
  }

  if (!VALIDATION.USER_ID_PATTERN.test(trimmed)) {
    errors.push('userId must start with a letter and contain only letters, numbers, underscores, and hyphens');
  }

  // Reserved userIds
  const reserved = ['admin', 'system', 'root', 'api', 'null', 'undefined', 'anonymous'];
  if (reserved.includes(trimmed.toLowerCase())) {
    errors.push('This userId is reserved');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate email format.
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];

  if (!email || typeof email !== 'string') {
    return { valid: true, errors }; // Email is optional
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > VALIDATION.EMAIL_MAX) {
    errors.push(`Email must be at most ${VALIDATION.EMAIL_MAX} characters`);
  }

  // RFC 5322 simplified
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) {
    errors.push('Invalid email format');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate passphrase strength.
 */
export function validatePassphrase(passphrase: string): ValidationResult {
  const errors: string[] = [];

  if (!passphrase || typeof passphrase !== 'string') {
    errors.push('Passphrase is required');
    return { valid: false, errors };
  }

  if (passphrase.length < VALIDATION.PASSPHRASE_MIN) {
    errors.push(`Passphrase must be at least ${VALIDATION.PASSPHRASE_MIN} characters`);
  }

  if (passphrase.length > VALIDATION.PASSPHRASE_MAX) {
    errors.push(`Passphrase must be at most ${VALIDATION.PASSPHRASE_MAX} characters`);
  }

  if (!VALIDATION.PASSPHRASE_PATTERN_STRONG.test(passphrase)) {
    errors.push('Passphrase must contain uppercase, lowercase, and number, OR be 16+ characters');
  }

  // Common password check (minimal)
  const common = ['password', '12345678', 'qwerty', 'letmein'];
  if (common.some(c => passphrase.toLowerCase().includes(c))) {
    errors.push('Passphrase is too common');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize string input.
 */
export function sanitizeString(input: string, maxLength: number): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
    .slice(0, maxLength);
}

// =============================================================================
// DATABASE SETUP
// =============================================================================

let usersCollection: Collection<UserDocument> | null = null;
let userAuditCollection: Collection<UserAuditEntry & { userId: string }> | null = null;

/**
 * Initialize users collection with indexes.
 */
export async function setupUsersCollection(db: Db): Promise<void> {
  // Main users collection
  const collections = await db.listCollections({ name: 'users' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('users');
    console.log('[UserModel] Created users collection');
  }
  usersCollection = db.collection<UserDocument>('users');

  // Audit collection
  const auditCollections = await db.listCollections({ name: 'user_audit' }).toArray();
  if (auditCollections.length === 0) {
    await db.createCollection('user_audit');
    console.log('[UserModel] Created user_audit collection');
  }
  userAuditCollection = db.collection('user_audit');

  // Create indexes
  const indexes = [
    { spec: { userId: 1 }, options: { unique: true } },
    { spec: { email: 1 }, options: { unique: true, sparse: true } },
    { spec: { entityId: 1 }, options: { sparse: true } },
    { spec: { status: 1, tier: 1 } },
    { spec: { isAdmin: 1 }, options: { sparse: true } },
    { spec: { lastActiveAt: 1 } },
    { spec: { 'compliance.deletionScheduledFor': 1 }, options: { sparse: true } },
    { spec: { schemaVersion: 1 } },
    // Soft delete queries
    { spec: { status: 1, deletedAt: 1 } },
  ];

  for (const index of indexes) {
    try {
      await usersCollection.createIndex(index.spec as any, index.options || {});
    } catch (error: any) {
      if (error.code !== 85 && error.code !== 86) {
        console.error('[UserModel] Index error:', error.message);
      }
    }
  }

  // Audit indexes
  const auditIndexes = [
    { spec: { userId: 1, timestamp: -1 } },
    { spec: { action: 1, timestamp: -1 } },
    { spec: { timestamp: 1 }, options: { expireAfterSeconds: 365 * 24 * 60 * 60 } }, // 1 year TTL
  ];

  for (const index of auditIndexes) {
    try {
      await userAuditCollection.createIndex(index.spec as any, index.options || {});
    } catch (error: any) {
      if (error.code !== 85 && error.code !== 86) {
        console.error('[UserModel] Audit index error:', error.message);
      }
    }
  }

  console.log('[UserModel] Users collection initialized (Space Shuttle grade)');
}

export function getUsersCollection(): Collection<UserDocument> {
  if (!usersCollection) {
    throw new Error('Users collection not initialized');
  }
  return usersCollection;
}

export function getUserAuditCollection(): Collection<UserAuditEntry & { userId: string }> {
  if (!userAuditCollection) {
    throw new Error('User audit collection not initialized');
  }
  return userAuditCollection;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log an audit entry for a user.
 */
export async function logAudit(
  userId: string,
  entry: Omit<UserAuditEntry, 'timestamp'>
): Promise<void> {
  const fullEntry: UserAuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Add to audit collection (persistent)
  await getUserAuditCollection().insertOne({ userId, ...fullEntry });

  // Add to user's embedded trail (last 50 entries)
  await getUsersCollection().updateOne(
    { userId },
    {
      $push: {
        auditTrail: {
          $each: [fullEntry],
          $slice: -50,
        },
      },
    }
  );
}

// =============================================================================
// DOCUMENT FACTORY
// =============================================================================

/**
 * Create a new user document with all required fields.
 */
export function createUserDocument(
  userId: string,
  passphraseHash: string,
  options?: Partial<UserDocument>
): UserDocument {
  const now = new Date().toISOString();
  const tier = options?.tier || 'free';

  return {
    userId,
    passphraseHash,
    email: options?.email?.toLowerCase().trim(),
    emailVerified: false,
    displayName: options?.displayName ? sanitizeString(options.displayName, VALIDATION.DISPLAY_NAME_MAX) : undefined,
    entityId: options?.entityId,
    tier,
    status: 'active',
    isAdmin: options?.isAdmin || false,
    isSuperAdmin: false,
    auth: {
      failedAttempts: 0,
      failedAttemptsWindow: [],
      lockedUntil: null,
      lockCount: 0,
      lastLogin: null,
      mfaEnabled: false,
      forcePasswordChange: false,
    },
    recovery: {},
    biometric: {
      templates: {},
      biometricOnlyEnabled: false,
      livenessRequired: true,
      multiModalRequired: false,
      antiSpoofingLevel: 'medium',
      failedBiometricAttempts: 0,
    },
    limits: TIER_LIMITS[tier],
    usage: {
      deviceCount: 0,
      memoriesStoredToday: 0,
      totalStorageBytes: 0,
      apiCallsThisMinute: 0,
      apiCallsToday: 0,
      lastUsageReset: now,
      lastApiCallReset: now,
    },
    rateLimits: [],
    compliance: {
      marketingConsent: false,
      dataProcessingConsent: true, // Required to use service
    },
    auditTrail: [],
    schemaVersion: USER_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Find user by ID (excludes soft-deleted).
 */
export async function findUserById(
  userId: string,
  options?: { includeDeleted?: boolean }
): Promise<UserDocument | null> {
  const filter: any = { userId };
  if (!options?.includeDeleted) {
    filter.status = { $ne: 'deleted' };
  }
  return getUsersCollection().findOne(filter);
}

/**
 * Find user by email.
 */
export async function findUserByEmail(
  email: string,
  options?: { includeDeleted?: boolean }
): Promise<UserDocument | null> {
  const filter: any = { email: email.toLowerCase().trim() };
  if (!options?.includeDeleted) {
    filter.status = { $ne: 'deleted' };
  }
  return getUsersCollection().findOne(filter);
}

/**
 * Create a new user with validation.
 */
export async function createUser(
  userId: string,
  passphraseHash: string,
  options?: Partial<UserDocument> & { performedBy?: string }
): Promise<UserDocument> {
  // Validate
  const userIdValidation = validateUserId(userId);
  if (!userIdValidation.valid) {
    throw new Error(`Invalid userId: ${userIdValidation.errors.join(', ')}`);
  }

  if (options?.email) {
    const emailValidation = validateEmail(options.email);
    if (!emailValidation.valid) {
      throw new Error(`Invalid email: ${emailValidation.errors.join(', ')}`);
    }
  }

  // Check for existing
  const existing = await findUserById(userId, { includeDeleted: true });
  if (existing) {
    throw new Error('User already exists');
  }

  if (options?.email) {
    const existingEmail = await findUserByEmail(options.email, { includeDeleted: true });
    if (existingEmail) {
      throw new Error('Email already in use');
    }
  }

  const user = createUserDocument(userId, passphraseHash, options);

  await getUsersCollection().insertOne(user as any);

  // Audit
  await logAudit(userId, {
    action: 'created',
    performedBy: options?.performedBy || 'system',
    details: { tier: user.tier, email: user.email },
  });

  console.log(`[UserModel] Created user: ${userId}`);
  return user;
}

/**
 * Update user with audit trail.
 */
export async function updateUser(
  userId: string,
  updates: Partial<UserDocument>,
  options?: { performedBy?: string; auditAction?: AuditAction }
): Promise<boolean> {
  const now = new Date().toISOString();

  // Prevent updating critical fields directly
  const { _id, userId: _, passphraseHash, createdAt, schemaVersion, auditTrail, ...safeUpdates } = updates;

  const result = await getUsersCollection().updateOne(
    { userId, status: { $ne: 'deleted' } },
    {
      $set: {
        ...safeUpdates,
        updatedAt: now,
      },
    }
  );

  if (result.modifiedCount > 0 && options?.auditAction) {
    await logAudit(userId, {
      action: options.auditAction,
      performedBy: options.performedBy || 'system',
      details: safeUpdates,
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Soft delete a user (GDPR compliant).
 */
export async function deleteUser(
  userId: string,
  options?: { performedBy?: string; reason?: string; scheduleDays?: number }
): Promise<boolean> {
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + (options?.scheduleDays || 30) * 24 * 60 * 60 * 1000);

  const result = await getUsersCollection().updateOne(
    { userId, status: { $ne: 'deleted' } },
    {
      $set: {
        status: 'deleted' as UserStatus,
        deletedAt: now.toISOString(),
        deletedBy: options?.performedBy || 'system',
        'compliance.deletionRequestedAt': now.toISOString(),
        'compliance.deletionScheduledFor': scheduledFor.toISOString(),
        updatedAt: now.toISOString(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'deleted',
      performedBy: options?.performedBy || 'system',
      details: { reason: options?.reason, scheduledFor: scheduledFor.toISOString() },
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Restore a soft-deleted user.
 */
export async function restoreUser(
  userId: string,
  options?: { performedBy?: string }
): Promise<boolean> {
  const result = await getUsersCollection().updateOne(
    { userId, status: 'deleted' },
    {
      $set: {
        status: 'active' as UserStatus,
        updatedAt: new Date().toISOString(),
      },
      $unset: {
        deletedAt: '',
        deletedBy: '',
        'compliance.deletionRequestedAt': '',
        'compliance.deletionScheduledFor': '',
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'restored',
      performedBy: options?.performedBy || 'system',
    });
  }

  return result.modifiedCount > 0;
}

// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

/**
 * Record login attempt with progressive lockout.
 */
export async function recordLoginAttempt(
  userId: string,
  success: boolean,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<{ locked: boolean; lockedUntil: string | null; attemptsRemaining: number }> {
  const user = await findUserById(userId);
  if (!user) {
    return { locked: false, lockedUntil: null, attemptsRemaining: LOCKOUT.MAX_ATTEMPTS };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (success) {
    await getUsersCollection().updateOne(
      { userId },
      {
        $set: {
          'auth.failedAttempts': 0,
          'auth.failedAttemptsWindow': [],
          'auth.lockedUntil': null,
          'auth.lastLogin': nowIso,
          'auth.lastLoginIp': metadata?.ipAddress,
          'auth.lastLoginUserAgent': metadata?.userAgent,
          lastActiveAt: nowIso,
          updatedAt: nowIso,
        },
      }
    );
    return { locked: false, lockedUntil: null, attemptsRemaining: LOCKOUT.MAX_ATTEMPTS };
  }

  // Failed attempt
  const windowCutoff = new Date(now.getTime() - LOCKOUT.ATTEMPT_WINDOW_MS).toISOString();
  const recentAttempts = user.auth.failedAttemptsWindow.filter(t => t > windowCutoff);
  recentAttempts.push(nowIso);

  const failedAttempts = recentAttempts.length;
  let lockedUntil: string | null = null;

  if (failedAttempts >= LOCKOUT.MAX_ATTEMPTS) {
    // Progressive lockout: doubles each time
    const lockDuration = LOCKOUT.LOCKOUT_DURATION_MS * Math.pow(LOCKOUT.PROGRESSIVE_MULTIPLIER, user.auth.lockCount);
    lockedUntil = new Date(now.getTime() + lockDuration).toISOString();

    await logAudit(userId, {
      action: 'locked',
      performedBy: 'system',
      details: { lockCount: user.auth.lockCount + 1, duration: lockDuration },
    });
  }

  await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'auth.failedAttempts': failedAttempts,
        'auth.failedAttemptsWindow': recentAttempts,
        'auth.lockedUntil': lockedUntil,
        updatedAt: nowIso,
      },
      $inc: lockedUntil ? { 'auth.lockCount': 1 } : {},
    }
  );

  return {
    locked: lockedUntil !== null,
    lockedUntil,
    attemptsRemaining: Math.max(0, LOCKOUT.MAX_ATTEMPTS - failedAttempts),
  };
}

/**
 * Check if user is locked.
 */
export async function isUserLocked(userId: string): Promise<{ locked: boolean; remaining: number }> {
  const user = await findUserById(userId);
  if (!user || !user.auth.lockedUntil) {
    return { locked: false, remaining: 0 };
  }

  const lockedUntil = new Date(user.auth.lockedUntil).getTime();
  const now = Date.now();

  if (now >= lockedUntil) {
    // Lock expired
    await getUsersCollection().updateOne(
      { userId },
      {
        $set: {
          'auth.lockedUntil': null,
          'auth.failedAttempts': 0,
          'auth.failedAttemptsWindow': [],
        },
      }
    );

    await logAudit(userId, {
      action: 'unlocked',
      performedBy: 'system',
      details: { reason: 'lockout_expired' },
    });

    return { locked: false, remaining: 0 };
  }

  return {
    locked: true,
    remaining: Math.ceil((lockedUntil - now) / 1000),
  };
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

/**
 * Increment device count with limit check.
 */
export async function incrementDeviceCount(userId: string): Promise<{ success: boolean; count: number; limit: number }> {
  const user = await findUserById(userId);
  if (!user) {
    return { success: false, count: 0, limit: 0 };
  }

  if (user.usage.deviceCount >= user.limits.maxDevices) {
    return { success: false, count: user.usage.deviceCount, limit: user.limits.maxDevices };
  }

  await getUsersCollection().updateOne(
    { userId },
    {
      $inc: { 'usage.deviceCount': 1 },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  await logAudit(userId, {
    action: 'device_added',
    performedBy: 'system',
    newValue: user.usage.deviceCount + 1,
  });

  return { success: true, count: user.usage.deviceCount + 1, limit: user.limits.maxDevices };
}

/**
 * Decrement device count.
 */
export async function decrementDeviceCount(userId: string): Promise<boolean> {
  const result = await getUsersCollection().updateOne(
    { userId, 'usage.deviceCount': { $gt: 0 } },
    {
      $inc: { 'usage.deviceCount': -1 },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'device_revoked',
      performedBy: 'system',
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Check and increment API call count.
 */
export async function checkApiRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const user = await findUserById(userId);
  if (!user) {
    return { allowed: false, remaining: 0, resetIn: 0 };
  }

  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60000);

  // Check if we need to reset minute counter
  const lastReset = new Date(user.usage.lastApiCallReset);
  const needsMinuteReset = lastReset < minuteAgo;

  const currentMinuteCalls = needsMinuteReset ? 0 : user.usage.apiCallsThisMinute;

  if (currentMinuteCalls >= user.limits.maxApiCallsPerMinute) {
    const resetIn = 60 - Math.floor((now.getTime() - lastReset.getTime()) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }

  // Update counters
  const updates: any = {
    $inc: { 'usage.apiCallsThisMinute': 1, 'usage.apiCallsToday': 1 },
    $set: { lastActiveAt: now.toISOString() },
  };

  if (needsMinuteReset) {
    updates.$set['usage.apiCallsThisMinute'] = 1;
    updates.$set['usage.lastApiCallReset'] = now.toISOString();
    delete updates.$inc['usage.apiCallsThisMinute'];
  }

  await getUsersCollection().updateOne({ userId }, updates);

  return {
    allowed: true,
    remaining: user.limits.maxApiCallsPerMinute - currentMinuteCalls - 1,
    resetIn: needsMinuteReset ? 60 : 60 - Math.floor((now.getTime() - lastReset.getTime()) / 1000),
  };
}

// =============================================================================
// ADMIN OPERATIONS
// =============================================================================

/**
 * List users with filtering and pagination.
 */
export async function listUsers(options: {
  skip?: number;
  limit?: number;
  status?: UserStatus;
  tier?: UserTier;
  includeDeleted?: boolean;
} = {}): Promise<{ users: UserDocument[]; total: number }> {
  const filter: any = {};

  if (options.status) filter.status = options.status;
  else if (!options.includeDeleted) filter.status = { $ne: 'deleted' };

  if (options.tier) filter.tier = options.tier;

  const [users, total] = await Promise.all([
    getUsersCollection()
      .find(filter)
      .project({ passphraseHash: 0, 'auth.mfaSecret': 0, 'recovery.backupCodes': 0 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .sort({ createdAt: -1 })
      .toArray(),
    getUsersCollection().countDocuments(filter),
  ]);

  return { users: users as UserDocument[], total };
}

/**
 * Get admin users.
 */
export async function getAdminUsers(): Promise<UserDocument[]> {
  return getUsersCollection()
    .find({ isAdmin: true, status: 'active' })
    .project({ passphraseHash: 0 })
    .toArray() as Promise<UserDocument[]>;
}

/**
 * Change user tier.
 */
export async function changeUserTier(
  userId: string,
  newTier: UserTier,
  options?: { performedBy?: string }
): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;

  const previousTier = user.tier;

  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        tier: newTier,
        limits: TIER_LIMITS[newTier],
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'tier_changed',
      performedBy: options?.performedBy || 'system',
      previousValue: previousTier,
      newValue: newTier,
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Grant/revoke admin status.
 */
export async function setAdminStatus(
  userId: string,
  isAdmin: boolean,
  options?: { performedBy?: string }
): Promise<boolean> {
  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        isAdmin,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: isAdmin ? 'admin_granted' : 'admin_revoked',
      performedBy: options?.performedBy || 'system',
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Update user's passphrase.
 */
export async function updateUserPassphrase(
  userId: string,
  newPassphraseHash: string,
  options?: { performedBy?: string }
): Promise<boolean> {
  const result = await getUsersCollection().updateOne(
    { userId, status: { $ne: 'deleted' } },
    {
      $set: {
        passphraseHash: newPassphraseHash,
        'auth.passwordChangedAt': new Date().toISOString(),
        'auth.forcePasswordChange': false,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'passphrase_changed',
      performedBy: options?.performedBy || 'system',
    });
  }

  return result.modifiedCount > 0;
}

// =============================================================================
// BIOMETRIC AUTHENTICATION
// =============================================================================

/** Biometric lockout config - separate from password lockout */
export const BIOMETRIC_LOCKOUT = {
  MAX_ATTEMPTS: 3,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/** Minimum quality thresholds for enrollment */
export const BIOMETRIC_QUALITY = {
  FACE_MIN_QUALITY: 70,
  VOICE_MIN_QUALITY: 60,
  VOICE_MIN_DURATION: 3, // seconds
} as const;

/**
 * Enroll a face template.
 *
 * @security Template must be a pre-computed embedding, NOT raw image data
 * @param userId - User to enroll
 * @param embedding - 128 or 512 dimensional face embedding (encrypted)
 * @param options - Enrollment options
 */
export async function enrollFace(
  userId: string,
  embedding: string, // Base64 encoded, encrypted embedding
  options: {
    algorithmVersion: string;
    embeddingDimension: 128 | 512;
    quality: number;
    livenessVerified: boolean;
    multiAngle?: boolean;
    enrollmentDevice?: string;
    farThreshold?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await findUserById(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (options.quality < BIOMETRIC_QUALITY.FACE_MIN_QUALITY) {
    return { success: false, error: `Quality score ${options.quality} below minimum ${BIOMETRIC_QUALITY.FACE_MIN_QUALITY}` };
  }

  if (!options.livenessVerified && user.biometric.livenessRequired) {
    return { success: false, error: 'Liveness verification required' };
  }

  const now = new Date().toISOString();
  const faceTemplate: FaceTemplate = {
    modality: 'face',
    templateHash: crypto.createHash('sha256').update(embedding).digest('hex'),
    algorithmVersion: options.algorithmVersion,
    enrollmentQuality: options.quality,
    enrollmentDevice: options.enrollmentDevice,
    enrolledAt: now,
    matchCount: 0,
    farThreshold: options.farThreshold || 0.001, // 0.1% false accept rate
    active: true,
    embeddingDimension: options.embeddingDimension,
    livenessVerified: options.livenessVerified,
    multiAngle: options.multiAngle || false,
  };

  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'biometric.templates.face': faceTemplate,
        updatedAt: now,
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'updated',
      performedBy: userId,
      details: {
        biometricAction: 'face_enrolled',
        algorithm: options.algorithmVersion,
        quality: options.quality,
        device: options.enrollmentDevice,
      },
    });
    console.log(`[UserModel] Face enrolled for user: ${userId}`);
    return { success: true };
  }

  return { success: false, error: 'Failed to update user' };
}

/**
 * Enroll a voice template.
 *
 * @security Template must be a speaker embedding, NOT raw audio
 * @param userId - User to enroll
 * @param embedding - Speaker embedding (encrypted)
 * @param options - Enrollment options
 */
export async function enrollVoice(
  userId: string,
  embedding: string, // Base64 encoded, encrypted embedding
  options: {
    algorithmVersion: string;
    quality: number;
    duration: number;
    sampleRate: number;
    textDependent?: boolean;
    passphrase?: string; // For text-dependent verification
    enrollmentDevice?: string;
    farThreshold?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await findUserById(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (options.quality < BIOMETRIC_QUALITY.VOICE_MIN_QUALITY) {
    return { success: false, error: `Quality score ${options.quality} below minimum ${BIOMETRIC_QUALITY.VOICE_MIN_QUALITY}` };
  }

  if (options.duration < BIOMETRIC_QUALITY.VOICE_MIN_DURATION) {
    return { success: false, error: `Duration ${options.duration}s below minimum ${BIOMETRIC_QUALITY.VOICE_MIN_DURATION}s` };
  }

  const now = new Date().toISOString();
  const voiceTemplate: VoiceTemplate = {
    modality: 'voice',
    templateHash: crypto.createHash('sha256').update(embedding).digest('hex'),
    algorithmVersion: options.algorithmVersion,
    enrollmentQuality: options.quality,
    enrollmentDevice: options.enrollmentDevice,
    enrolledAt: now,
    matchCount: 0,
    farThreshold: options.farThreshold || 0.01, // 1% false accept rate for voice
    active: true,
    enrollmentDuration: options.duration,
    sampleRate: options.sampleRate,
    textDependent: options.textDependent || false,
    passphraseHash: options.passphrase
      ? crypto.createHash('sha256').update(options.passphrase).digest('hex')
      : undefined,
  };

  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'biometric.templates.voice': voiceTemplate,
        updatedAt: now,
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'updated',
      performedBy: userId,
      details: {
        biometricAction: 'voice_enrolled',
        algorithm: options.algorithmVersion,
        quality: options.quality,
        duration: options.duration,
        device: options.enrollmentDevice,
      },
    });
    console.log(`[UserModel] Voice enrolled for user: ${userId}`);
    return { success: true };
  }

  return { success: false, error: 'Failed to update user' };
}

/**
 * Record biometric verification attempt.
 * Handles lockout separately from password attempts.
 */
export async function recordBiometricAttempt(
  userId: string,
  modality: BiometricModality,
  success: boolean,
  metadata?: { similarity?: number; device?: string }
): Promise<{ locked: boolean; lockedUntil?: string; attemptsRemaining: number }> {
  const user = await findUserById(userId);
  if (!user) {
    return { locked: false, attemptsRemaining: BIOMETRIC_LOCKOUT.MAX_ATTEMPTS };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (success) {
    // Update match stats and reset failed attempts
    await getUsersCollection().updateOne(
      { userId },
      {
        $set: {
          [`biometric.templates.${modality}.lastMatchAt`]: nowIso,
          'biometric.lastBiometricAttempt': nowIso,
          'biometric.failedBiometricAttempts': 0,
          lastActiveAt: nowIso,
          updatedAt: nowIso,
        },
        $inc: {
          [`biometric.templates.${modality}.matchCount`]: 1,
        },
      }
    );
    return { locked: false, attemptsRemaining: BIOMETRIC_LOCKOUT.MAX_ATTEMPTS };
  }

  // Failed attempt
  const newAttempts = user.biometric.failedBiometricAttempts + 1;
  let lockedUntil: string | undefined;

  if (newAttempts >= BIOMETRIC_LOCKOUT.MAX_ATTEMPTS) {
    lockedUntil = new Date(now.getTime() + BIOMETRIC_LOCKOUT.LOCKOUT_DURATION_MS).toISOString();
    await logAudit(userId, {
      action: 'locked',
      performedBy: 'system',
      details: { reason: 'biometric_failed', modality, attempts: newAttempts },
    });
  }

  await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'biometric.lastBiometricAttempt': nowIso,
        'biometric.failedBiometricAttempts': newAttempts,
        updatedAt: nowIso,
      },
    }
  );

  return {
    locked: lockedUntil !== undefined,
    lockedUntil,
    attemptsRemaining: Math.max(0, BIOMETRIC_LOCKOUT.MAX_ATTEMPTS - newAttempts),
  };
}

/**
 * Check if user is biometrically locked out.
 */
export async function isBiometricLocked(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;

  if (user.biometric.failedBiometricAttempts < BIOMETRIC_LOCKOUT.MAX_ATTEMPTS) {
    return false;
  }

  const lastAttempt = user.biometric.lastBiometricAttempt;
  if (!lastAttempt) return false;

  const lockoutExpiry = new Date(lastAttempt).getTime() + BIOMETRIC_LOCKOUT.LOCKOUT_DURATION_MS;
  if (Date.now() >= lockoutExpiry) {
    // Lockout expired, reset
    await getUsersCollection().updateOne(
      { userId },
      { $set: { 'biometric.failedBiometricAttempts': 0 } }
    );
    return false;
  }

  return true;
}

/**
 * Enable biometric-only login (no passphrase required).
 * Requires at least one enrolled modality with liveness.
 */
export async function enableBiometricOnly(
  userId: string,
  options?: { performedBy?: string }
): Promise<{ success: boolean; error?: string }> {
  const user = await findUserById(userId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Check for enrolled template with liveness
  const faceTemplate = user.biometric.templates.face;
  const voiceTemplate = user.biometric.templates.voice;

  const hasVerifiedFace = faceTemplate?.active && faceTemplate.livenessVerified;
  const hasVoice = voiceTemplate?.active;

  if (!hasVerifiedFace && !hasVoice) {
    return { success: false, error: 'No verified biometric enrolled. Face requires liveness verification.' };
  }

  await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'biometric.biometricOnlyEnabled': true,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  await logAudit(userId, {
    action: 'updated',
    performedBy: options?.performedBy || userId,
    details: { biometricAction: 'biometric_only_enabled' },
  });

  return { success: true };
}

/**
 * Disable biometric-only login.
 */
export async function disableBiometricOnly(
  userId: string,
  options?: { performedBy?: string }
): Promise<boolean> {
  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $set: {
        'biometric.biometricOnlyEnabled': false,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'updated',
      performedBy: options?.performedBy || userId,
      details: { biometricAction: 'biometric_only_disabled' },
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Remove a biometric template.
 */
export async function removeBiometricTemplate(
  userId: string,
  modality: BiometricModality,
  options?: { performedBy?: string }
): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;

  // If removing last template and biometric-only is enabled, disable it
  const templates = user.biometric.templates;
  const activeTemplates = Object.values(templates).filter(t => t?.active).length;

  if (activeTemplates <= 1 && user.biometric.biometricOnlyEnabled) {
    await disableBiometricOnly(userId, options);
  }

  const result = await getUsersCollection().updateOne(
    { userId },
    {
      $unset: { [`biometric.templates.${modality}`]: '' },
      $set: { updatedAt: new Date().toISOString() },
    }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'updated',
      performedBy: options?.performedBy || userId,
      details: { biometricAction: 'template_removed', modality },
    });
  }

  return result.modifiedCount > 0;
}

/**
 * Get biometric enrollment status for a user.
 */
export async function getBiometricStatus(userId: string): Promise<{
  enrolled: BiometricModality[];
  biometricOnlyEnabled: boolean;
  livenessRequired: boolean;
  multiModalRequired: boolean;
} | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  const enrolled: BiometricModality[] = [];
  if (user.biometric.templates.face?.active) enrolled.push('face');
  if (user.biometric.templates.voice?.active) enrolled.push('voice');
  if (user.biometric.templates.fingerprint?.active) enrolled.push('fingerprint');
  if (user.biometric.templates.iris?.active) enrolled.push('iris');

  return {
    enrolled,
    biometricOnlyEnabled: user.biometric.biometricOnlyEnabled,
    livenessRequired: user.biometric.livenessRequired,
    multiModalRequired: user.biometric.multiModalRequired,
  };
}

/**
 * Configure biometric security settings.
 */
export async function configureBiometricSecurity(
  userId: string,
  settings: {
    livenessRequired?: boolean;
    multiModalRequired?: boolean;
    antiSpoofingLevel?: 'low' | 'medium' | 'high';
  },
  options?: { performedBy?: string }
): Promise<boolean> {
  const updates: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (settings.livenessRequired !== undefined) {
    updates['biometric.livenessRequired'] = settings.livenessRequired;
  }
  if (settings.multiModalRequired !== undefined) {
    updates['biometric.multiModalRequired'] = settings.multiModalRequired;
  }
  if (settings.antiSpoofingLevel !== undefined) {
    updates['biometric.antiSpoofingLevel'] = settings.antiSpoofingLevel;
  }

  const result = await getUsersCollection().updateOne(
    { userId },
    { $set: updates }
  );

  if (result.modifiedCount > 0) {
    await logAudit(userId, {
      action: 'updated',
      performedBy: options?.performedBy || userId,
      details: { biometricAction: 'security_configured', settings },
    });
  }

  return result.modifiedCount > 0;
}
