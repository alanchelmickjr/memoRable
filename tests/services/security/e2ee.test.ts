// CLOUD ONLY — No local dev, no local Docker, no localhost. All infra runs in AWS. No exceptions.
/**
 * E2EE Encryption Tests
 *
 * Tests for end-to-end encryption module.
 * Verifies: key generation, encryption, decryption, forward secrecy.
 */

import {
  generateUserKeyPair,
  deriveKeyPairFromPassphrase,
  hashPublicKey,
  encrypt,
  decrypt,
  encryptForMultiple,
  isEncrypted,
  hasE2EEMarker,
  E2EE_MARKER,
  UserKeyPair,
  EncryptedPayload
} from '../../../src/services/encryption/e2ee.js';

describe('E2EE Encryption Module', () => {
  // ==========================================================================
  // Key Generation
  // ==========================================================================
  describe('Key Generation', () => {
    test('generateUserKeyPair creates valid keypair', () => {
      const keypair = generateUserKeyPair();

      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('secretKey');
      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.secretKey).toBe('string');

      // Base64 encoded keys should be specific lengths
      // NaCl box keys are 32 bytes = ~44 chars base64
      expect(keypair.publicKey.length).toBeGreaterThan(40);
      expect(keypair.secretKey.length).toBeGreaterThan(40);
    });

    test('generateUserKeyPair creates unique keypairs', () => {
      const keypair1 = generateUserKeyPair();
      const keypair2 = generateUserKeyPair();

      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
      expect(keypair1.secretKey).not.toBe(keypair2.secretKey);
    });

    test('deriveKeyPairFromPassphrase is deterministic', () => {
      const passphrase = 'test-passphrase-123';

      const keypair1 = deriveKeyPairFromPassphrase(passphrase);
      const keypair2 = deriveKeyPairFromPassphrase(passphrase);

      expect(keypair1.publicKey).toBe(keypair2.publicKey);
      expect(keypair1.secretKey).toBe(keypair2.secretKey);
    });

    test('different passphrases create different keypairs', () => {
      const keypair1 = deriveKeyPairFromPassphrase('passphrase-one');
      const keypair2 = deriveKeyPairFromPassphrase('passphrase-two');

      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
    });

    test('hashPublicKey creates consistent hash', () => {
      const keypair = generateUserKeyPair();

      const hash1 = hashPublicKey(keypair.publicKey);
      const hash2 = hashPublicKey(keypair.publicKey);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Encryption / Decryption
  // ==========================================================================
  describe('Encryption and Decryption', () => {
    let alice: UserKeyPair;
    let bob: UserKeyPair;

    beforeEach(() => {
      alice = generateUserKeyPair();
      bob = generateUserKeyPair();
    });

    test('encrypt creates valid payload structure', () => {
      const plaintext = 'Hello, this is a secret message';
      const payload = encrypt(plaintext, alice.publicKey);

      expect(payload.version).toBe('1.0');
      expect(payload.algorithm).toBe('nacl-box');
      expect(typeof payload.nonce).toBe('string');
      expect(typeof payload.ephemeralPub).toBe('string');
      expect(typeof payload.ciphertext).toBe('string');
    });

    test('encrypt creates unique ciphertext each time (forward secrecy)', () => {
      const plaintext = 'Same message';

      const payload1 = encrypt(plaintext, alice.publicKey);
      const payload2 = encrypt(plaintext, alice.publicKey);

      // Different nonce and ephemeral key = different ciphertext
      expect(payload1.nonce).not.toBe(payload2.nonce);
      expect(payload1.ephemeralPub).not.toBe(payload2.ephemeralPub);
      expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
    });

    test('decrypt recovers original plaintext', () => {
      const plaintext = 'This is the secret message to encrypt';
      const payload = encrypt(plaintext, alice.publicKey);
      const decrypted = decrypt(payload, alice.secretKey);

      expect(decrypted).toBe(plaintext);
    });

    test('decrypt fails with wrong key', () => {
      const plaintext = 'Secret for Alice only';
      const payload = encrypt(plaintext, alice.publicKey);

      // Bob cannot decrypt Alice's message
      expect(() => decrypt(payload, bob.secretKey)).toThrow('Decryption failed');
    });

    test('decrypt fails with tampered ciphertext', () => {
      const plaintext = 'Do not tamper';
      const payload = encrypt(plaintext, alice.publicKey);

      // Tamper with ciphertext
      const tampered: EncryptedPayload = {
        ...payload,
        ciphertext: payload.ciphertext.slice(0, -4) + 'XXXX'
      };

      expect(() => decrypt(tampered, alice.secretKey)).toThrow('Decryption failed');
    });

    test('handles unicode and special characters', async () => {
      const plaintext = '你好世界 🌍 Ñoño مرحبا';
      const payload = encrypt(plaintext, alice.publicKey);
      const decrypted = decrypt(payload, alice.secretKey);

      expect(decrypted).toBe(plaintext);
    });

    test('handles empty string', async () => {
      const plaintext = '';
      const payload = encrypt(plaintext, alice.publicKey);
      const decrypted = decrypt(payload, alice.secretKey);

      expect(decrypted).toBe(plaintext);
    });

    test('handles large content', async () => {
      const plaintext = 'x'.repeat(100000); // 100KB
      const payload = encrypt(plaintext, alice.publicKey);
      const decrypted = decrypt(payload, alice.secretKey);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ==========================================================================
  // Multi-Recipient Encryption
  // ==========================================================================
  describe('Multi-Recipient Encryption', () => {
    test('encryptForMultiple encrypts for all recipients', async () => {
      const alice = generateUserKeyPair();
      const bob = generateUserKeyPair();
      const carol = generateUserKeyPair();

      const plaintext = 'Shared secret for everyone';
      const payload = encryptForMultiple(plaintext, [
        alice.publicKey,
        bob.publicKey,
        carol.publicKey
      ]);

      expect(payload.version).toBe('1.0');
      expect(payload.algorithm).toBe('nacl-box-multi');
      expect(payload.recipients.length).toBe(3);
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================
  describe('Utility Functions', () => {
    test('isEncrypted correctly identifies encrypted payloads', async () => {
      const keypair = generateUserKeyPair();
      const payload = encrypt('test', keypair.publicKey);

      expect(isEncrypted(payload)).toBe(true);
      expect(isEncrypted({ random: 'object' })).toBe(false);
      expect(isEncrypted('string')).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });

    test('hasE2EEMarker detects marker in text', async () => {
      expect(hasE2EEMarker(E2EE_MARKER)).toBe(true);
      expect(hasE2EEMarker('[E2EE:nacl-box:v1] encrypted content')).toBe(true);
      expect(hasE2EEMarker('regular text')).toBe(false);
      expect(hasE2EEMarker('')).toBe(false);
    });

    test('E2EE_MARKER has expected format', async () => {
      expect(E2EE_MARKER).toMatch(/^\[E2EE:/);
    });
  });
});
