/**
 * @file Device model for MemoRable
 * Per-device API keys linked to users.
 * Each device gets its own key, revocable independently.
 */

import { Collection, Db } from 'mongodb';
import crypto from 'crypto';

// =============================================================================
// DEVICE TYPES
// =============================================================================

export type DeviceType =
  | 'terminal'      // Claude Code, command line
  | 'phone'         // Mobile apps
  | 'desktop'       // Desktop apps
  | 'ar_glasses'    // AR devices (Alzheimer's support)
  | 'robot'         // Companion robots
  | 'sensor'        // IoT sensors
  | 'web'           // Web browser
  | 'api'           // Direct API access
  | 'unknown';

export type DeviceStatus = 'active' | 'revoked' | 'expired';

/**
 * Device document stored in MongoDB.
 */
export interface DeviceDocument {
  _id?: string;

  /** Unique device identifier */
  deviceId: string;

  /** Owner user ID */
  userId: string;

  /** SHA-256 hash of the API key (never store plaintext!) */
  apiKeyHash: string;

  /** Prefix of API key for display (e.g., "memorable_terminal_abc1...") */
  apiKeyPrefix: string;

  /** Device info */
  device: {
    type: DeviceType;
    name: string;
    fingerprint?: string;
    userAgent?: string;
    platform?: string;
  };

  /** Status */
  status: DeviceStatus;

  /** mTLS certificate info (for sensors/robots) */
  mtls?: {
    certificateFingerprint: string;
    issuer: string;
    validFrom: string;
    validTo: string;
  };

  /** Timestamps */
  issuedAt: string;
  lastUsed: string;
  revokedAt?: string;
  expiresAt?: string;

  /** Audit trail */
  revokedBy?: string;
  revokeReason?: string;
}

// =============================================================================
// DATABASE SETUP
// =============================================================================

let devicesCollection: Collection<DeviceDocument> | null = null;

/**
 * Initialize the devices collection with proper indexes.
 */
export async function setupDevicesCollection(db: Db): Promise<void> {
  const collections = await db.listCollections({ name: 'devices' }).toArray();

  if (collections.length === 0) {
    await db.createCollection('devices');
    console.log('[DeviceModel] Created devices collection');
  }

  devicesCollection = db.collection<DeviceDocument>('devices');

  // Create indexes
  const indexes = [
    // Primary lookup by deviceId
    { spec: { deviceId: 1 }, options: { unique: true } },
    // API key lookup (auth flow)
    { spec: { apiKeyHash: 1 }, options: { unique: true } },
    // User's devices
    { spec: { userId: 1, status: 1 } },
    // mTLS certificate lookup
    { spec: { 'mtls.certificateFingerprint': 1 }, options: { sparse: true } },
    // Cleanup expired devices
    { spec: { status: 1, expiresAt: 1 } },
    // Last used tracking
    { spec: { userId: 1, lastUsed: -1 } },
  ];

  for (const index of indexes) {
    try {
      await devicesCollection.createIndex(index.spec as any, index.options || {});
    } catch (error: any) {
      if (error.code !== 85 && error.code !== 86) {
        console.error('[DeviceModel] Error creating index:', error.message);
      }
    }
  }

  console.log('[DeviceModel] Devices collection indexes created');
}

/**
 * Get the devices collection.
 */
export function getDevicesCollection(): Collection<DeviceDocument> {
  if (!devicesCollection) {
    throw new Error('Devices collection not initialized. Call setupDevicesCollection first.');
  }
  return devicesCollection;
}

// =============================================================================
// DEVICE OPERATIONS
// =============================================================================

/**
 * Generate a new API key.
 * Returns both the plaintext key (to give to user) and the hash (to store).
 */
export function generateApiKey(deviceType: DeviceType): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(24).toString('hex');
  const key = `memorable_${deviceType}_${random}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 24) + '...';

  return { key, hash, prefix };
}

/**
 * Hash an API key for lookup.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a device ID.
 */
export function generateDeviceId(deviceType: DeviceType, fingerprint?: string): string {
  const fp = fingerprint || crypto.randomBytes(8).toString('hex');
  return `dev_${deviceType}_${fp}_${Date.now()}`;
}

/**
 * Create a new device and return the API key.
 * The plaintext API key is returned ONCE - it's not stored.
 */
export async function createDevice(
  userId: string,
  deviceInfo: {
    type: DeviceType;
    name: string;
    fingerprint?: string;
    userAgent?: string;
    platform?: string;
  },
  options?: {
    expiresIn?: number; // Seconds until expiry (null = never)
  }
): Promise<{ device: DeviceDocument; apiKey: string }> {
  const now = new Date().toISOString();
  const deviceId = generateDeviceId(deviceInfo.type, deviceInfo.fingerprint);
  const { key, hash, prefix } = generateApiKey(deviceInfo.type);

  const device: DeviceDocument = {
    deviceId,
    userId,
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    device: deviceInfo,
    status: 'active',
    issuedAt: now,
    lastUsed: now,
  };

  if (options?.expiresIn) {
    device.expiresAt = new Date(Date.now() + options.expiresIn * 1000).toISOString();
  }

  await getDevicesCollection().insertOne(device as any);
  console.log(`[DeviceModel] Created device: ${deviceId} for user: ${userId}`);

  return { device, apiKey: key };
}

/**
 * Find device by API key hash.
 */
export async function findDeviceByKeyHash(keyHash: string): Promise<DeviceDocument | null> {
  return getDevicesCollection().findOne({ apiKeyHash: keyHash, status: 'active' });
}

/**
 * Find device by API key (convenience wrapper).
 */
export async function findDeviceByKey(apiKey: string): Promise<DeviceDocument | null> {
  const hash = hashApiKey(apiKey);
  return findDeviceByKeyHash(hash);
}

/**
 * Find device by ID.
 */
export async function findDeviceById(deviceId: string): Promise<DeviceDocument | null> {
  return getDevicesCollection().findOne({ deviceId });
}

/**
 * Update last used timestamp.
 */
export async function touchDevice(deviceId: string): Promise<boolean> {
  const result = await getDevicesCollection().updateOne(
    { deviceId },
    { $set: { lastUsed: new Date().toISOString() } }
  );
  return result.modifiedCount > 0;
}

/**
 * Revoke a device.
 */
export async function revokeDevice(
  deviceId: string,
  options?: { revokedBy?: string; reason?: string }
): Promise<boolean> {
  const result = await getDevicesCollection().updateOne(
    { deviceId, status: 'active' },
    {
      $set: {
        status: 'revoked' as DeviceStatus,
        revokedAt: new Date().toISOString(),
        revokedBy: options?.revokedBy,
        revokeReason: options?.reason,
      },
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`[DeviceModel] Revoked device: ${deviceId}`);
  }

  return result.modifiedCount > 0;
}

/**
 * List devices for a user.
 */
export async function listUserDevices(
  userId: string,
  options?: { includeRevoked?: boolean }
): Promise<DeviceDocument[]> {
  const filter: any = { userId };
  if (!options?.includeRevoked) {
    filter.status = 'active';
  }

  return getDevicesCollection()
    .find(filter)
    .sort({ lastUsed: -1 })
    .toArray();
}

/**
 * Count active devices for a user.
 */
export async function countUserDevices(userId: string): Promise<number> {
  return getDevicesCollection().countDocuments({ userId, status: 'active' });
}

/**
 * Revoke all devices for a user.
 */
export async function revokeAllUserDevices(
  userId: string,
  options?: { revokedBy?: string; reason?: string }
): Promise<number> {
  const result = await getDevicesCollection().updateMany(
    { userId, status: 'active' },
    {
      $set: {
        status: 'revoked' as DeviceStatus,
        revokedAt: new Date().toISOString(),
        revokedBy: options?.revokedBy,
        revokeReason: options?.reason,
      },
    }
  );

  console.log(`[DeviceModel] Revoked ${result.modifiedCount} devices for user: ${userId}`);
  return result.modifiedCount;
}

/**
 * Check if device is valid (not revoked, not expired).
 */
export async function isDeviceValid(deviceId: string): Promise<boolean> {
  const device = await findDeviceById(deviceId);
  if (!device) return false;
  if (device.status !== 'active') return false;

  if (device.expiresAt) {
    const expiresAt = new Date(device.expiresAt).getTime();
    if (Date.now() >= expiresAt) {
      // Mark as expired
      await getDevicesCollection().updateOne(
        { deviceId },
        { $set: { status: 'expired' as DeviceStatus } }
      );
      return false;
    }
  }

  return true;
}

/**
 * Find device by mTLS certificate fingerprint.
 */
export async function findDeviceByMtlsCert(fingerprint: string): Promise<DeviceDocument | null> {
  return getDevicesCollection().findOne({
    'mtls.certificateFingerprint': fingerprint,
    status: 'active',
  });
}

/**
 * Create or update mTLS device.
 */
export async function upsertMtlsDevice(
  userId: string,
  mtlsInfo: {
    certificateFingerprint: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    deviceName?: string;
    deviceType?: DeviceType;
  }
): Promise<DeviceDocument> {
  const existing = await findDeviceByMtlsCert(mtlsInfo.certificateFingerprint);
  if (existing) {
    await getDevicesCollection().updateOne(
      { deviceId: existing.deviceId },
      {
        $set: {
          lastUsed: new Date().toISOString(),
          mtls: {
            certificateFingerprint: mtlsInfo.certificateFingerprint,
            issuer: mtlsInfo.issuer,
            validFrom: mtlsInfo.validFrom,
            validTo: mtlsInfo.validTo,
          },
        },
      }
    );
    return existing;
  }

  // Create new mTLS device (no API key needed - cert is the key)
  const deviceType = mtlsInfo.deviceType || 'sensor';
  const deviceId = generateDeviceId(deviceType, mtlsInfo.certificateFingerprint.substring(0, 16));
  const now = new Date().toISOString();

  const device: DeviceDocument = {
    deviceId,
    userId,
    apiKeyHash: `mtls_${mtlsInfo.certificateFingerprint}`,
    apiKeyPrefix: 'mtls:' + mtlsInfo.certificateFingerprint.substring(0, 16) + '...',
    device: {
      type: deviceType,
      name: mtlsInfo.deviceName || `mTLS ${deviceType}`,
    },
    status: 'active',
    mtls: {
      certificateFingerprint: mtlsInfo.certificateFingerprint,
      issuer: mtlsInfo.issuer,
      validFrom: mtlsInfo.validFrom,
      validTo: mtlsInfo.validTo,
    },
    issuedAt: now,
    lastUsed: now,
    expiresAt: mtlsInfo.validTo,
  };

  await getDevicesCollection().insertOne(device as any);
  console.log(`[DeviceModel] Created mTLS device: ${deviceId}`);
  return device;
}
