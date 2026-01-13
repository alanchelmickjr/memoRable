/**
 * Memory Encryption Utility
 * Personal data NEVER stored in plain text.
 * 
 * Rule: If it's personal, it's encrypted. No exceptions.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derive encryption key from password/secret
 */
export function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypt personal data
 */
export function encrypt(plaintext: string, secret: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: salt:iv:authTag:encrypted (all hex)
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypt personal data
 */
export function decrypt(encryptedData: string, secret: string): string {
  const [saltHex, ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(secret, salt);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt a JSON object (like a profile)
 */
export function encryptProfile(profile: object, secret: string): string {
  return encrypt(JSON.stringify(profile), secret);
}

/**
 * Decrypt a JSON object
 */
export function decryptProfile<T = object>(encryptedProfile: string, secret: string): T {
  return JSON.parse(decrypt(encryptedProfile, secret)) as T;
}

/**
 * Hash for non-reversible storage (like checking if marker exists without storing plaintext)
 */
export function hashMarker(marker: string, salt: string): string {
  const key = scryptSync(marker.toLowerCase(), salt, 32);
  return key.toString('hex');
}
