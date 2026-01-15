/**
 * @file Security Tests for Crypto Utility
 * Tests AES-256-GCM encryption, key derivation, and data integrity.
 *
 * SECURITY: These tests verify the encryption layer that protects
 * Tier2_Personal and Tier3_Vault data.
 */

import {
  encrypt,
  decrypt,
  deriveKey,
  encryptProfile,
  decryptProfile,
  hashMarker,
} from '../../src/utils/crypto';

describe('Crypto Security', () => {
  const TEST_SECRET = 'test-encryption-secret-key-12345';

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt simple text correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should encrypt and decrypt empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode characters', () => {
      const plaintext = '你好世界 🔐 Привет мир مرحبا';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;\':",./<>?\n\t\r';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt large payloads', () => {
      const plaintext = 'A'.repeat(100000); // 100KB
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt JSON data', () => {
      const data = {
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111',
        password: 'super_secret_password',
      };
      const plaintext = JSON.stringify(data);
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);

      expect(JSON.parse(decrypted)).toEqual(data);
    });
  });

  describe('encryption uniqueness', () => {
    it('should produce different ciphertext for same plaintext (unique salt)', () => {
      const plaintext = 'Same message encrypted twice';
      const encrypted1 = encrypt(plaintext, TEST_SECRET);
      const encrypted2 = encrypt(plaintext, TEST_SECRET);

      // Different ciphertexts due to random salt and IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      expect(decrypt(encrypted1, TEST_SECRET)).toBe(plaintext);
      expect(decrypt(encrypted2, TEST_SECRET)).toBe(plaintext);
    });

    it('should use different salt for each encryption', () => {
      const plaintext = 'Test message';
      const encrypted1 = encrypt(plaintext, TEST_SECRET);
      const encrypted2 = encrypt(plaintext, TEST_SECRET);

      // Extract salts (first component before :)
      const salt1 = encrypted1.split(':')[0];
      const salt2 = encrypted2.split(':')[0];

      expect(salt1).not.toBe(salt2);
    });
  });

  describe('decryption with wrong secret', () => {
    it('should fail to decrypt with incorrect secret', () => {
      const plaintext = 'Secret message';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      expect(() => {
        decrypt(encrypted, 'wrong-secret-key');
      }).toThrow();
    });

    it('should fail to decrypt with empty secret', () => {
      const plaintext = 'Secret message';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      expect(() => {
        decrypt(encrypted, '');
      }).toThrow();
    });

    it('should fail to decrypt with similar secret', () => {
      const plaintext = 'Secret message';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      expect(() => {
        decrypt(encrypted, TEST_SECRET + '1'); // Just one char different
      }).toThrow();
    });
  });

  describe('authentication tag integrity (AES-GCM)', () => {
    it('should detect tampered ciphertext', () => {
      const plaintext = 'Sensitive data';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      // Tamper with the encrypted portion (last component)
      const parts = encrypted.split(':');
      const tamperedEncrypted = parts[3].replace(/[0-9a-f]/, (c) =>
        c === '0' ? '1' : '0'
      );
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedEncrypted}`;

      expect(() => {
        decrypt(tampered, TEST_SECRET);
      }).toThrow();
    });

    it('should detect tampered auth tag', () => {
      const plaintext = 'Sensitive data';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      // Tamper with the auth tag (third component)
      const parts = encrypted.split(':');
      const tamperedTag = parts[2].replace(/[0-9a-f]/, (c) =>
        c === '0' ? '1' : '0'
      );
      const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;

      expect(() => {
        decrypt(tampered, TEST_SECRET);
      }).toThrow();
    });

    it('should detect tampered IV', () => {
      const plaintext = 'Sensitive data';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      // Tamper with the IV (second component)
      const parts = encrypted.split(':');
      const tamperedIV = parts[1].replace(/[0-9a-f]/, (c) =>
        c === '0' ? '1' : '0'
      );
      const tampered = `${parts[0]}:${tamperedIV}:${parts[2]}:${parts[3]}`;

      expect(() => {
        decrypt(tampered, TEST_SECRET);
      }).toThrow();
    });

    it('should detect tampered salt', () => {
      const plaintext = 'Sensitive data';
      const encrypted = encrypt(plaintext, TEST_SECRET);

      // Tamper with the salt (first component)
      const parts = encrypted.split(':');
      const tamperedSalt = parts[0].replace(/[0-9a-f]/, (c) =>
        c === '0' ? '1' : '0'
      );
      const tampered = `${tamperedSalt}:${parts[1]}:${parts[2]}:${parts[3]}`;

      expect(() => {
        decrypt(tampered, TEST_SECRET);
      }).toThrow();
    });
  });

  describe('malformed input handling', () => {
    it('should fail on malformed encrypted data (missing parts)', () => {
      expect(() => {
        decrypt('invalid:data', TEST_SECRET);
      }).toThrow();
    });

    it('should fail on invalid hex in encrypted data', () => {
      expect(() => {
        decrypt('ZZZZ:0000:0000:0000', TEST_SECRET);
      }).toThrow();
    });

    it('should fail on empty encrypted data', () => {
      expect(() => {
        decrypt('', TEST_SECRET);
      }).toThrow();
    });

    it('should fail on non-string input', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        decrypt(null, TEST_SECRET);
      }).toThrow();
    });
  });

  describe('deriveKey', () => {
    it('should derive consistent key from same secret and salt', () => {
      const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const key1 = deriveKey(TEST_SECRET, salt);
      const key2 = deriveKey(TEST_SECRET, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys from different secrets', () => {
      const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const key1 = deriveKey('secret1', salt);
      const key2 = deriveKey('secret2', salt);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive different keys from different salts', () => {
      const salt1 = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const salt2 = Buffer.from('fedcba9876543210fedcba9876543210', 'hex');
      const key1 = deriveKey(TEST_SECRET, salt1);
      const key2 = deriveKey(TEST_SECRET, salt2);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive 32-byte key for AES-256', () => {
      const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const key = deriveKey(TEST_SECRET, salt);

      expect(key.length).toBe(32);
    });
  });

  describe('encryptProfile/decryptProfile', () => {
    it('should encrypt and decrypt profile object', () => {
      const profile = {
        userId: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      };

      const encrypted = encryptProfile(profile, TEST_SECRET);
      const decrypted = decryptProfile(encrypted, TEST_SECRET);

      expect(decrypted).toEqual(profile);
    });

    it('should encrypt and decrypt profile with sensitive data', () => {
      const profile = {
        ssn: '123-45-6789',
        bankAccount: '9876543210',
        medicalInfo: {
          conditions: ['diabetes'],
          medications: ['metformin'],
        },
      };

      const encrypted = encryptProfile(profile, TEST_SECRET);

      // Encrypted data should not contain plaintext
      expect(encrypted).not.toContain('123-45-6789');
      expect(encrypted).not.toContain('diabetes');

      const decrypted = decryptProfile(encrypted, TEST_SECRET);
      expect(decrypted).toEqual(profile);
    });

    it('should handle empty profile', () => {
      const profile = {};
      const encrypted = encryptProfile(profile, TEST_SECRET);
      const decrypted = decryptProfile(encrypted, TEST_SECRET);

      expect(decrypted).toEqual(profile);
    });

    it('should handle profile with arrays', () => {
      const profile = {
        tags: ['important', 'personal', 'vault'],
        contacts: [
          { name: 'Alice', phone: '555-1234' },
          { name: 'Bob', phone: '555-5678' },
        ],
      };

      const encrypted = encryptProfile(profile, TEST_SECRET);
      const decrypted = decryptProfile(encrypted, TEST_SECRET);

      expect(decrypted).toEqual(profile);
    });
  });

  describe('hashMarker', () => {
    it('should hash marker consistently', () => {
      const marker = 'test-marker';
      const salt = 'consistent-salt';

      const hash1 = hashMarker(marker, salt);
      const hash2 = hashMarker(marker, salt);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different markers', () => {
      const salt = 'consistent-salt';

      const hash1 = hashMarker('marker1', salt);
      const hash2 = hashMarker('marker2', salt);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different salts', () => {
      const marker = 'test-marker';

      const hash1 = hashMarker(marker, 'salt1');
      const hash2 = hashMarker(marker, 'salt2');

      expect(hash1).not.toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const salt = 'consistent-salt';

      const hash1 = hashMarker('TestMarker', salt);
      const hash2 = hashMarker('testmarker', salt);

      expect(hash1).toBe(hash2);
    });

    it('should produce 64-character hex hash (32 bytes)', () => {
      const hash = hashMarker('test', 'salt');

      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should not be reversible (one-way hash)', () => {
      const marker = 'sensitive-marker-data';
      const hash = hashMarker(marker, 'salt');

      // Hash should not contain the original marker
      expect(hash).not.toContain(marker);
      expect(hash).not.toContain('sensitive');
    });
  });

  describe('timing attack resistance', () => {
    it('should use constant-time key derivation', () => {
      const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');

      // Both should take similar time regardless of secret complexity
      const start1 = process.hrtime.bigint();
      deriveKey('a', salt);
      const time1 = process.hrtime.bigint() - start1;

      const start2 = process.hrtime.bigint();
      deriveKey('a'.repeat(1000), salt);
      const time2 = process.hrtime.bigint() - start2;

      // Times should be within same order of magnitude
      // (scrypt is designed to be constant-time for same parameters)
      const ratio = Number(time1) / Number(time2);
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(10);
    });
  });
});
