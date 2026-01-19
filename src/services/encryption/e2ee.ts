/**
 * End-to-End Encryption for MemoRable
 *
 * Zero-trust encryption for Tier2/Tier3 memories.
 * Server CANNOT read encrypted content - only the user's device can decrypt.
 *
 * Uses NaCl (libsodium) box encryption:
 * - X25519 for key exchange
 * - XSalsa20 for symmetric encryption
 * - Poly1305 for authentication
 *
 * Forward secrecy: Each message uses ephemeral keypair
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// Re-export for type safety
const { box, randomBytes } = nacl;
const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil;

/**
 * User's keypair - stored ONLY on their devices, NEVER on server
 */
export interface UserKeyPair {
  publicKey: string;  // Base64 - can be shared/stored on server
  secretKey: string;  // Base64 - NEVER leaves device
}

/**
 * Encrypted payload - safe to store on server
 */
export interface EncryptedPayload {
  version: '1.0';
  algorithm: 'nacl-box';
  nonce: string;        // Base64 - random, unique per message
  ephemeralPub: string; // Base64 - ephemeral public key for forward secrecy
  ciphertext: string;   // Base64 - encrypted content
}

/**
 * Key derivation result for device-specific encryption
 */
export interface DerivedKey {
  deviceId: string;
  keyHash: string;      // For verification without exposing key
  encryptedSecretKey: string; // Secret key encrypted with device password
}

// =============================================================================
// Key Management
// =============================================================================

/**
 * Generate a new user keypair
 * Call this once when user first sets up, store secretKey SECURELY on device
 */
export function generateUserKeyPair(): UserKeyPair {
  const keypair = box.keyPair();
  return {
    publicKey: encodeBase64(keypair.publicKey),
    secretKey: encodeBase64(keypair.secretKey)
  };
}

/**
 * Derive a deterministic keypair from a passphrase
 * Useful for key recovery - same passphrase = same keys
 * WARNING: Passphrase must be strong (high entropy)
 */
export function deriveKeyPairFromPassphrase(passphrase: string): UserKeyPair {
  // Use SHA-512 of passphrase as seed (first 32 bytes)
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  // Simple derivation - in production use Argon2 or scrypt
  const hash = nacl.hash(passphraseBytes);
  const seed = hash.slice(0, 32);

  const keypair = box.keyPair.fromSecretKey(seed);
  return {
    publicKey: encodeBase64(keypair.publicKey),
    secretKey: encodeBase64(keypair.secretKey)
  };
}

/**
 * Hash a public key for indexing (without exposing key operations)
 */
export function hashPublicKey(publicKey: string): string {
  const keyBytes = decodeBase64(publicKey);
  const hash = nacl.hash(keyBytes);
  return encodeBase64(hash.slice(0, 16)); // Truncate for shorter ID
}

// =============================================================================
// Encryption / Decryption
// =============================================================================

/**
 * Encrypt content for a specific user
 * Uses ephemeral keypair for forward secrecy
 *
 * @param plaintext - Content to encrypt
 * @param recipientPublicKey - Base64 public key of recipient
 * @returns Encrypted payload safe to store on server
 */
export function encrypt(
  plaintext: string,
  recipientPublicKey: string
): EncryptedPayload {
  // Generate ephemeral keypair (forward secrecy)
  const ephemeral = box.keyPair();

  // Generate random nonce
  const nonce = randomBytes(box.nonceLength);

  // Convert plaintext to bytes
  const messageBytes = decodeUTF8(plaintext);

  // Decrypt recipient's public key
  const recipientPubBytes = decodeBase64(recipientPublicKey);

  // Encrypt: ephemeral secret + recipient public
  const ciphertext = box(
    messageBytes,
    nonce,
    recipientPubBytes,
    ephemeral.secretKey
  );

  return {
    version: '1.0',
    algorithm: 'nacl-box',
    nonce: encodeBase64(nonce),
    ephemeralPub: encodeBase64(ephemeral.publicKey),
    ciphertext: encodeBase64(ciphertext)
  };
}

/**
 * Decrypt content encrypted for this user
 *
 * @param payload - Encrypted payload from server
 * @param userSecretKey - Base64 secret key (from device storage)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export function decrypt(
  payload: EncryptedPayload,
  userSecretKey: string
): string {
  // Verify version
  if (payload.version !== '1.0') {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  // Decode all components
  const nonce = decodeBase64(payload.nonce);
  const ephemeralPub = decodeBase64(payload.ephemeralPub);
  const ciphertext = decodeBase64(payload.ciphertext);
  const secretKey = decodeBase64(userSecretKey);

  // Decrypt: ephemeral public + user secret
  const plaintext = box.open(
    ciphertext,
    nonce,
    ephemeralPub,
    secretKey
  );

  if (!plaintext) {
    throw new Error('Decryption failed: invalid key or tampered data');
  }

  return encodeUTF8(plaintext);
}

// =============================================================================
// Multi-Recipient Encryption
// =============================================================================

/**
 * Encrypted payload for multiple recipients
 */
export interface MultiRecipientPayload {
  version: '1.0';
  algorithm: 'nacl-box-multi';
  // Each recipient gets their own encrypted copy of the symmetric key
  recipients: {
    publicKeyHash: string;  // Hash of recipient's public key
    encryptedKey: string;   // Symmetric key encrypted for this recipient
    nonce: string;
  }[];
  // Content encrypted with symmetric key
  contentNonce: string;
  ciphertext: string;
}

/**
 * Encrypt content for multiple recipients (e.g., shared memories)
 * Uses hybrid encryption: symmetric key for content, asymmetric for key distribution
 */
export function encryptForMultiple(
  plaintext: string,
  recipientPublicKeys: string[]
): MultiRecipientPayload {
  // Generate random symmetric key
  const symmetricKey = randomBytes(nacl.secretbox.keyLength);
  const contentNonce = randomBytes(nacl.secretbox.nonceLength);

  // Encrypt content with symmetric key
  const messageBytes = decodeUTF8(plaintext);
  const ciphertext = nacl.secretbox(messageBytes, contentNonce, symmetricKey);

  // Encrypt symmetric key for each recipient
  const recipients = recipientPublicKeys.map(pubKey => {
    const ephemeral = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    const recipientPubBytes = decodeBase64(pubKey);

    const encryptedKey = box(
      symmetricKey,
      nonce,
      recipientPubBytes,
      ephemeral.secretKey
    );

    return {
      publicKeyHash: hashPublicKey(pubKey),
      encryptedKey: encodeBase64(encryptedKey),
      nonce: encodeBase64(nonce),
      ephemeralPub: encodeBase64(ephemeral.publicKey)
    };
  });

  return {
    version: '1.0',
    algorithm: 'nacl-box-multi',
    recipients: recipients.map(r => ({
      publicKeyHash: r.publicKeyHash,
      encryptedKey: r.encryptedKey,
      nonce: r.nonce
    })),
    contentNonce: encodeBase64(contentNonce),
    ciphertext: encodeBase64(ciphertext)
  };
}

// =============================================================================
// Secure Memory Marker
// =============================================================================

/**
 * Check if a memory content is E2EE encrypted
 */
export function isEncrypted(content: unknown): content is EncryptedPayload {
  if (typeof content !== 'object' || content === null) return false;
  const obj = content as Record<string, unknown>;
  return (
    obj.version === '1.0' &&
    (obj.algorithm === 'nacl-box' || obj.algorithm === 'nacl-box-multi') &&
    typeof obj.ciphertext === 'string'
  );
}

/**
 * Marker stored in text field when content is E2EE encrypted
 */
export const E2EE_MARKER = '[E2EE:nacl-box:v1]';

/**
 * Check if text field contains E2EE marker
 */
export function hasE2EEMarker(text: string): boolean {
  return text.startsWith('[E2EE:');
}

// =============================================================================
// Exports
// =============================================================================

export default {
  generateUserKeyPair,
  deriveKeyPairFromPassphrase,
  hashPublicKey,
  encrypt,
  decrypt,
  encryptForMultiple,
  isEncrypted,
  hasE2EEMarker,
  E2EE_MARKER
};
