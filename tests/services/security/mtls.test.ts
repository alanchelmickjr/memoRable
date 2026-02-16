// CLOUD ONLY — No local dev, no local Docker, no localhost. All infra runs in AWS. No exceptions.
/**
 * mTLS Device Authentication Tests
 *
 * Tests for mutual TLS device authentication.
 * Verifies: CA generation, cert issuance, verification, revocation.
 *
 * Note: These tests require OpenSSL to be installed.
 */

import {
  generateCA,
  loadCA,
  issueDeviceCertificate,
  verifyCertificate,
  extractCertInfo,
  revokeCertificate,
  isRevoked,
  CertificateAuthority,
  DeviceCertificate,
  RevocationEntry
} from '../../../src/services/device_auth/mtls.js';

describe('mTLS Device Authentication', () => {
  // ==========================================================================
  // Certificate Authority
  // ==========================================================================
  describe('Certificate Authority', () => {
    test('generateCA creates valid CA', async () => {
      const ca = await generateCA('Test CA');

      expect(ca).toHaveProperty('certPem');
      expect(ca).toHaveProperty('keyPem');
      expect(ca).toHaveProperty('serialNumber');
      expect(ca.certPem).toContain('-----BEGIN CERTIFICATE-----');
      expect(ca.keyPem).toContain('-----BEGIN');
      expect(ca.serialNumber).toBe(1);
    }, 30000); // Allow time for openssl

    test('loadCA returns CA structure', async () => {
      const certPem = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      const keyPem = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      const ca = loadCA(certPem, keyPem, 5);

      expect(ca.certPem).toBe(certPem);
      expect(ca.keyPem).toBe(keyPem);
      expect(ca.serialNumber).toBe(5);
    });
  });

  // ==========================================================================
  // Certificate Issuance
  // ==========================================================================
  describe('Certificate Issuance', () => {
    let ca: CertificateAuthority;

    beforeAll(async () => {
      ca = await generateCA('Test Device CA');
    }, 30000);

    test('issueDeviceCertificate creates valid device cert', async () => {
      const { cert, updatedCA } = await issueDeviceCertificate(ca, {
        deviceId: 'glasses-001',
        deviceType: 'smartglasses',
        validityDays: 30
      });

      expect(cert.deviceId).toBe('glasses-001');
      expect(cert.deviceType).toBe('smartglasses');
      expect(cert.certPem).toContain('-----BEGIN CERTIFICATE-----');
      expect(cert.keyPem).toContain('-----BEGIN');
      expect(cert.serialNumber).toBeDefined();
      expect(cert.issuedAt).toBeInstanceOf(Date);
      expect(cert.expiresAt).toBeInstanceOf(Date);
      expect(cert.fingerprint).toBeDefined();
      expect(updatedCA.serialNumber).toBeGreaterThan(ca.serialNumber);
    }, 30000);

    test('issueDeviceCertificate increments serial number', async () => {
      const { updatedCA: ca1 } = await issueDeviceCertificate(ca, {
        deviceId: 'device-1',
        deviceType: 'type-a'
      });

      const { updatedCA: ca2 } = await issueDeviceCertificate(ca1, {
        deviceId: 'device-2',
        deviceType: 'type-b'
      });

      expect(ca2.serialNumber).toBeGreaterThan(ca1.serialNumber);
    }, 60000);

    test('issueDeviceCertificate sets expiry correctly', async () => {
      const validityDays = 7;
      const { cert } = await issueDeviceCertificate(ca, {
        deviceId: 'short-lived',
        deviceType: 'test',
        validityDays
      });

      const expectedExpiry = new Date(cert.issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
      const expiryDiff = Math.abs(cert.expiresAt.getTime() - expectedExpiry.getTime());

      // Allow 1 minute tolerance
      expect(expiryDiff).toBeLessThan(60 * 1000);
    }, 30000);
  });

  // ==========================================================================
  // Certificate Verification
  // ==========================================================================
  describe('Certificate Verification', () => {
    let ca: CertificateAuthority;
    let deviceCert: DeviceCertificate;

    beforeAll(async () => {
      ca = await generateCA('Verification Test CA');
      const result = await issueDeviceCertificate(ca, {
        deviceId: 'verify-test-device',
        deviceType: 'robot'
      });
      deviceCert = result.cert;
    }, 60000);

    test('verifyCertificate validates legitimate cert', async () => {
      const result = await verifyCertificate(ca, deviceCert.certPem);

      expect(result.valid).toBe(true);
      expect(result.deviceId).toBe('verify-test-device');
      expect(result.error).toBeUndefined();
    }, 30000);

    test('verifyCertificate rejects cert from different CA', async () => {
      const otherCA = await generateCA('Other CA');

      const result = await verifyCertificate(otherCA, deviceCert.certPem);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('verification failed');
    }, 60000);

    test('verifyCertificate rejects revoked cert', async () => {
      const revocationList: RevocationEntry[] = [{
        serialNumber: deviceCert.serialNumber,
        deviceId: deviceCert.deviceId,
        revokedAt: new Date(),
        reason: 'Test revocation'
      }];

      const result = await verifyCertificate(ca, deviceCert.certPem, revocationList);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    }, 30000);
  });

  // ==========================================================================
  // Certificate Info Extraction
  // ==========================================================================
  describe('Certificate Info Extraction', () => {
    let ca: CertificateAuthority;
    let deviceCert: DeviceCertificate;

    beforeAll(async () => {
      ca = await generateCA('Extract Test CA');
      const result = await issueDeviceCertificate(ca, {
        deviceId: 'extract-test',
        deviceType: 'pendant'
      });
      deviceCert = result.cert;
    }, 60000);

    test('extractCertInfo returns device details', async () => {
      const info = await extractCertInfo(deviceCert.certPem);

      expect(info).not.toBeNull();
      expect(info!.deviceId).toBe('extract-test');
      expect(info!.deviceType).toBe('pendant');
      expect(info!.serialNumber).toBeDefined();
      expect(info!.fingerprint).toBeDefined();
      expect(info!.expiresAt).toBeInstanceOf(Date);
    }, 30000);

    test('extractCertInfo returns null for invalid cert', async () => {
      const info = await extractCertInfo('not a certificate');

      expect(info).toBeNull();
    });
  });

  // ==========================================================================
  // Revocation Management
  // ==========================================================================
  describe('Revocation Management', () => {
    test('revokeCertificate adds entry to list', async () => {
      const list: RevocationEntry[] = [];

      const newList = revokeCertificate('01', 'device-1', 'Lost device', list);

      expect(newList.length).toBe(1);
      expect(newList[0].serialNumber).toBe('01');
      expect(newList[0].deviceId).toBe('device-1');
      expect(newList[0].reason).toBe('Lost device');
      expect(newList[0].revokedAt).toBeInstanceOf(Date);
    });

    test('revokeCertificate preserves existing entries', async () => {
      const list: RevocationEntry[] = [{
        serialNumber: '01',
        deviceId: 'old-device',
        revokedAt: new Date(),
        reason: 'Old'
      }];

      const newList = revokeCertificate('02', 'new-device', 'New revocation', list);

      expect(newList.length).toBe(2);
      expect(newList[0].serialNumber).toBe('01');
      expect(newList[1].serialNumber).toBe('02');
    });

    test('isRevoked returns true for revoked serial', async () => {
      const list: RevocationEntry[] = [{
        serialNumber: '01',
        deviceId: 'device-1',
        revokedAt: new Date(),
        reason: 'Test'
      }];

      expect(isRevoked('01', list)).toBe(true);
      expect(isRevoked('02', list)).toBe(false);
    });

    test('isRevoked returns false for empty list', async () => {
      expect(isRevoked('01', [])).toBe(false);
    });
  });
});
