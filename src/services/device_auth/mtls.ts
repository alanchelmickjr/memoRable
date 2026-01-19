/**
 * mTLS Device Authentication for MemoRable
 *
 * Mutual TLS: Both client and server verify each other.
 * No cert = no connection. Defeats MITM attacks.
 *
 * Flow:
 * 1. Device registered → issued certificate signed by our CA
 * 2. Device connects → presents cert
 * 3. Server verifies cert → checks against CA + revocation list
 * 4. Server presents cert → device verifies (mutual)
 * 5. Connection established only if both verify
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes, createHash } from 'crypto';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export interface CertificateAuthority {
  certPem: string;      // CA certificate (public, distribute to all)
  keyPem: string;       // CA private key (SECURE, never distribute)
  serialNumber: number; // Next serial number
}

export interface DeviceCertificate {
  deviceId: string;
  deviceType: string;
  certPem: string;      // Device certificate
  keyPem: string;       // Device private key
  serialNumber: string;
  issuedAt: Date;
  expiresAt: Date;
  fingerprint: string;  // SHA256 fingerprint for quick lookup
}

export interface CertificateRequest {
  deviceId: string;
  deviceType: string;
  validityDays?: number;
  capabilities?: string[];
}

export interface RevocationEntry {
  serialNumber: string;
  deviceId: string;
  revokedAt: Date;
  reason: string;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_VALIDITY_DAYS = 365;
const CA_VALIDITY_YEARS = 10;
const KEY_SIZE = 2048; // RSA key size
const HASH_ALGO = 'sha256';

// Certificate subject fields
const ORG_NAME = 'MemoRable';
const ORG_UNIT = 'Device Auth';

// =============================================================================
// Certificate Authority Management
// =============================================================================

/**
 * Generate a new Certificate Authority
 * Call once during initial setup, store CA key VERY securely
 */
export async function generateCA(
  commonName: string = 'MemoRable Device CA'
): Promise<CertificateAuthority> {
  const tempDir = `/tmp/memorable-ca-${randomBytes(8).toString('hex')}`;
  mkdirSync(tempDir, { recursive: true });

  try {
    const keyPath = join(tempDir, 'ca.key');
    const certPath = join(tempDir, 'ca.crt');
    const configPath = join(tempDir, 'ca.cnf');

    // OpenSSL config for CA
    const config = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
CN = ${commonName}
O = ${ORG_NAME}
OU = ${ORG_UNIT}

[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always, issuer
`;
    writeFileSync(configPath, config);

    // Generate CA private key
    await execAsync(`openssl genrsa -out ${keyPath} 4096`);

    // Generate CA certificate
    await execAsync(
      `openssl req -new -x509 -days ${CA_VALIDITY_YEARS * 365} ` +
      `-key ${keyPath} -out ${certPath} -config ${configPath}`
    );

    const keyPem = readFileSync(keyPath, 'utf8');
    const certPem = readFileSync(certPath, 'utf8');

    return {
      certPem,
      keyPem,
      serialNumber: 1
    };
  } finally {
    // Cleanup temp files
    execSync(`rm -rf ${tempDir}`);
  }
}

/**
 * Load CA from PEM strings (for use after initial generation)
 */
export function loadCA(certPem: string, keyPem: string, serialNumber: number = 1): CertificateAuthority {
  return { certPem, keyPem, serialNumber };
}

// =============================================================================
// Device Certificate Issuance
// =============================================================================

/**
 * Issue a certificate for a device
 */
export async function issueDeviceCertificate(
  ca: CertificateAuthority,
  request: CertificateRequest
): Promise<{ cert: DeviceCertificate; updatedCA: CertificateAuthority }> {
  const validityDays = request.validityDays || DEFAULT_VALIDITY_DAYS;
  const tempDir = `/tmp/memorable-cert-${randomBytes(8).toString('hex')}`;
  mkdirSync(tempDir, { recursive: true });

  try {
    const caKeyPath = join(tempDir, 'ca.key');
    const caCertPath = join(tempDir, 'ca.crt');
    const deviceKeyPath = join(tempDir, 'device.key');
    const deviceCsrPath = join(tempDir, 'device.csr');
    const deviceCertPath = join(tempDir, 'device.crt');
    const configPath = join(tempDir, 'device.cnf');
    const serialPath = join(tempDir, 'serial');

    // Write CA files
    writeFileSync(caKeyPath, ca.keyPem);
    writeFileSync(caCertPath, ca.certPem);
    writeFileSync(serialPath, ca.serialNumber.toString(16).padStart(2, '0'));

    // OpenSSL config for device cert
    const config = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${request.deviceId}
O = ${ORG_NAME}
OU = ${request.deviceType}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${request.deviceId}.memorable.local
URI.1 = urn:memorable:device:${request.deviceType}:${request.deviceId}

[v3_ext]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid, issuer
`;
    writeFileSync(configPath, config);

    // Generate device private key
    await execAsync(`openssl genrsa -out ${deviceKeyPath} ${KEY_SIZE}`);

    // Generate CSR
    await execAsync(
      `openssl req -new -key ${deviceKeyPath} -out ${deviceCsrPath} -config ${configPath}`
    );

    // Sign with CA
    await execAsync(
      `openssl x509 -req -days ${validityDays} ` +
      `-in ${deviceCsrPath} -CA ${caCertPath} -CAkey ${caKeyPath} ` +
      `-CAserial ${serialPath} -out ${deviceCertPath} ` +
      `-extfile ${configPath} -extensions v3_ext`
    );

    const keyPem = readFileSync(deviceKeyPath, 'utf8');
    const certPem = readFileSync(deviceCertPath, 'utf8');
    const newSerial = parseInt(readFileSync(serialPath, 'utf8'), 16);

    // Extract actual serial from the issued certificate
    const { stdout: serialOut } = await execAsync(
      `openssl x509 -in ${deviceCertPath} -noout -serial`
    );
    const certSerial = serialOut.split('=')[1]?.trim().toUpperCase() || '';

    // Calculate fingerprint
    const { stdout: fingerprint } = await execAsync(
      `openssl x509 -in ${deviceCertPath} -noout -fingerprint -sha256`
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    const cert: DeviceCertificate = {
      deviceId: request.deviceId,
      deviceType: request.deviceType,
      certPem,
      keyPem,
      serialNumber: certSerial,
      issuedAt: now,
      expiresAt,
      fingerprint: fingerprint.split('=')[1]?.trim() || ''
    };

    const updatedCA: CertificateAuthority = {
      ...ca,
      serialNumber: newSerial
    };

    return { cert, updatedCA };
  } finally {
    // Cleanup temp files securely
    execSync(`rm -rf ${tempDir}`);
  }
}

// =============================================================================
// Certificate Verification
// =============================================================================

/**
 * Verify a device certificate against our CA
 */
export async function verifyCertificate(
  ca: CertificateAuthority,
  certPem: string,
  revocationList: RevocationEntry[] = []
): Promise<{ valid: boolean; deviceId?: string; error?: string }> {
  const tempDir = `/tmp/memorable-verify-${randomBytes(8).toString('hex')}`;
  mkdirSync(tempDir, { recursive: true });

  try {
    const caCertPath = join(tempDir, 'ca.crt');
    const deviceCertPath = join(tempDir, 'device.crt');

    writeFileSync(caCertPath, ca.certPem);
    writeFileSync(deviceCertPath, certPem);

    // Verify certificate chain
    try {
      await execAsync(`openssl verify -CAfile ${caCertPath} ${deviceCertPath}`);
    } catch {
      return { valid: false, error: 'Certificate chain verification failed' };
    }

    // Check expiry
    const { stdout: dates } = await execAsync(
      `openssl x509 -in ${deviceCertPath} -noout -dates`
    );
    const notAfterMatch = dates.match(/notAfter=(.+)/);
    if (notAfterMatch) {
      const expiryDate = new Date(notAfterMatch[1]);
      if (expiryDate < new Date()) {
        return { valid: false, error: 'Certificate has expired' };
      }
    }

    // Get serial number
    const { stdout: serialOut } = await execAsync(
      `openssl x509 -in ${deviceCertPath} -noout -serial`
    );
    const serial = serialOut.split('=')[1]?.trim();

    // Check revocation list (normalize serial numbers for comparison)
    const normalizeSerial = (s: string) => s.toUpperCase().replace(/^0+/, '') || '0';
    if (serial && revocationList.some(r => normalizeSerial(r.serialNumber) === normalizeSerial(serial))) {
      return { valid: false, error: 'Certificate has been revoked' };
    }

    // Get device ID from subject
    const { stdout: subject } = await execAsync(
      `openssl x509 -in ${deviceCertPath} -noout -subject`
    );
    const cnMatch = subject.match(/CN\s*=\s*([^,\/]+)/);
    const deviceId = cnMatch?.[1]?.trim();

    return { valid: true, deviceId };
  } finally {
    execSync(`rm -rf ${tempDir}`);
  }
}

/**
 * Extract device info from certificate without full verification
 */
export async function extractCertInfo(certPem: string): Promise<{
  deviceId: string;
  deviceType: string;
  serialNumber: string;
  fingerprint: string;
  expiresAt: Date;
} | null> {
  const tempDir = `/tmp/memorable-extract-${randomBytes(8).toString('hex')}`;
  mkdirSync(tempDir, { recursive: true });

  try {
    const certPath = join(tempDir, 'cert.crt');
    writeFileSync(certPath, certPem);

    const { stdout: subject } = await execAsync(
      `openssl x509 -in ${certPath} -noout -subject`
    );
    const { stdout: serial } = await execAsync(
      `openssl x509 -in ${certPath} -noout -serial`
    );
    const { stdout: fingerprint } = await execAsync(
      `openssl x509 -in ${certPath} -noout -fingerprint -sha256`
    );
    const { stdout: dates } = await execAsync(
      `openssl x509 -in ${certPath} -noout -dates`
    );

    const cnMatch = subject.match(/CN\s*=\s*([^,\/]+)/);
    const ouMatch = subject.match(/OU\s*=\s*([^,\/]+)/);
    const notAfterMatch = dates.match(/notAfter=(.+)/);

    if (!cnMatch) return null;

    return {
      deviceId: cnMatch[1].trim(),
      deviceType: ouMatch?.[1]?.trim() || 'unknown',
      serialNumber: serial.split('=')[1]?.trim() || '',
      fingerprint: fingerprint.split('=')[1]?.trim() || '',
      expiresAt: notAfterMatch ? new Date(notAfterMatch[1]) : new Date()
    };
  } catch {
    return null;
  } finally {
    execSync(`rm -rf ${tempDir}`);
  }
}

// =============================================================================
// Revocation Management
// =============================================================================

/**
 * Revoke a device certificate
 */
export function revokeCertificate(
  serialNumber: string,
  deviceId: string,
  reason: string,
  revocationList: RevocationEntry[]
): RevocationEntry[] {
  const entry: RevocationEntry = {
    serialNumber,
    deviceId,
    revokedAt: new Date(),
    reason
  };

  return [...revocationList, entry];
}

/**
 * Check if a certificate is revoked
 */
export function isRevoked(
  serialNumber: string,
  revocationList: RevocationEntry[]
): boolean {
  return revocationList.some(r => r.serialNumber === serialNumber);
}

// =============================================================================
// Express Middleware for mTLS
// =============================================================================

/**
 * Express middleware to verify client certificates
 */
export function mtlsMiddleware(
  ca: CertificateAuthority,
  revocationList: RevocationEntry[] = []
) {
  return async (req: any, res: any, next: any) => {
    // Get client certificate from TLS socket
    const cert = req.socket?.getPeerCertificate?.();

    if (!cert || !cert.raw) {
      return res.status(401).json({
        error: 'Client certificate required',
        code: 'MTLS_NO_CERT'
      });
    }

    // Convert to PEM
    const certPem = `-----BEGIN CERTIFICATE-----\n${
      cert.raw.toString('base64').match(/.{1,64}/g)?.join('\n')
    }\n-----END CERTIFICATE-----`;

    // Verify
    const result = await verifyCertificate(ca, certPem, revocationList);

    if (!result.valid) {
      return res.status(401).json({
        error: result.error || 'Certificate verification failed',
        code: 'MTLS_INVALID_CERT'
      });
    }

    // Attach device info to request
    req.deviceId = result.deviceId;
    req.deviceCert = cert;

    next();
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  generateCA,
  loadCA,
  issueDeviceCertificate,
  verifyCertificate,
  extractCertInfo,
  revokeCertificate,
  isRevoked,
  mtlsMiddleware
};
