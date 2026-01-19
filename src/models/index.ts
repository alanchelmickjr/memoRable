/**
 * @file Models index - User System Foundation
 *
 * The user system enables multi-tenant memory storage where:
 * - Each USER has their own passphrase and can have multiple DEVICES
 * - Each DEVICE gets its own API key (revocable independently)
 * - Each USER has PREFERENCES that tune salience, privacy, etc.
 *
 * Integration with existing server.js:
 * - setupUserModels() called during startup after MongoDB connection
 * - migrateInMemoryAuth() moves from Maps to MongoDB
 * - Auth flow remains: knock → exchange → use, but queries MongoDB
 */

import { Db } from 'mongodb';
import { setupUsersCollection, UserDocument, findUserById, createUser } from './user';
import { setupDevicesCollection, DeviceDocument, createDevice, findDeviceByKey } from './device';
import { setupPreferencesCollection, PreferenceDocument, initializeUserPreferences } from './preference';
import argon2 from 'argon2';

// Re-export all types
export * from './user';
export * from './device';
export * from './preference';

/**
 * Initialize all user system collections.
 * Call this during server startup after MongoDB connection.
 */
export async function setupUserModels(db: Db): Promise<void> {
  await setupUsersCollection(db);
  await setupDevicesCollection(db);
  await setupPreferencesCollection(db);
  console.log('[Models] User system models initialized');
}

/**
 * Hash a passphrase using Argon2id.
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  return argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 65536,       // 64 MB
    timeCost: 3,             // 3 iterations
    parallelism: 4,          // 4 threads
  });
}

/**
 * Verify a passphrase against stored hash.
 */
export async function verifyPassphrase(passphrase: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, passphrase);
  } catch {
    return false;
  }
}

/**
 * Bootstrap the 'claude' user if it doesn't exist.
 * This is the migration from in-memory to persistent storage.
 */
export async function bootstrapClaudeUser(): Promise<void> {
  const existing = await findUserById('claude');
  if (existing) {
    console.log('[Models] Claude user already exists');
    return;
  }

  // Get passphrase from env or use default (dev mode)
  const passphrase = process.env.MEMORABLE_PASSPHRASE ||
    "I remember what I have learned from you.";

  if (!process.env.MEMORABLE_PASSPHRASE) {
    console.warn('[Models] ⚠️  Using default passphrase - set MEMORABLE_PASSPHRASE env var for production!');
  }

  const hash = await hashPassphrase(passphrase);

  await createUser('claude', hash, {
    displayName: 'Claude',
    tier: 'pro', // Claude gets pro tier
    isAdmin: true, // First user is admin
  });

  await initializeUserPreferences('claude');
  console.log('[Models] Claude user bootstrapped with default preferences');
}

/**
 * Register a new user.
 * Returns the user document (without sensitive fields).
 */
export async function registerUser(
  userId: string,
  passphrase: string,
  options?: {
    email?: string;
    displayName?: string;
  }
): Promise<Omit<UserDocument, 'passphraseHash'>> {
  const hash = await hashPassphrase(passphrase);

  const user = await createUser(userId, hash, {
    email: options?.email,
    displayName: options?.displayName,
  });

  await initializeUserPreferences(userId);

  // Return without sensitive data
  const { passphraseHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Authenticate a user with passphrase.
 * Returns the user if successful, null if not.
 */
export async function authenticateUser(
  userId: string,
  passphrase: string
): Promise<UserDocument | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  if (user.status !== 'active') return null;

  const valid = await verifyPassphrase(passphrase, user.passphraseHash);
  if (!valid) return null;

  return user;
}

/**
 * Issue a device key for an authenticated user.
 */
export async function issueDeviceKey(
  userId: string,
  deviceInfo: {
    type: 'terminal' | 'phone' | 'desktop' | 'ar_glasses' | 'robot' | 'sensor' | 'web' | 'api' | 'unknown';
    name: string;
    fingerprint?: string;
  }
): Promise<{ apiKey: string; deviceId: string }> {
  const { device, apiKey } = await createDevice(userId, deviceInfo);
  return { apiKey, deviceId: device.deviceId };
}

/**
 * Validate an API key and return auth context.
 */
export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  userId?: string;
  deviceId?: string;
  device?: DeviceDocument['device'];
} | null> {
  const device = await findDeviceByKey(apiKey);
  if (!device) return { valid: false };
  if (device.status !== 'active') return { valid: false };

  // Check expiry
  if (device.expiresAt) {
    const expiresAt = new Date(device.expiresAt).getTime();
    if (Date.now() >= expiresAt) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    userId: device.userId,
    deviceId: device.deviceId,
    device: device.device,
  };
}
