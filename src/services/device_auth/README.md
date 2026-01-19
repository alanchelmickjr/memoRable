# mTLS Device Authentication

Mutual TLS authentication for MemoRable sensors. Both client and server verify each other. No cert = no connection. Defeats MITM attacks.

## Status

- **Implementation**: Complete
- **Tests**: 14/14 passing
- **Test file**: `tests/services/security/mtls.test.ts`

## Why mTLS?

| Attack | HTTPS | mTLS |
|--------|-------|------|
| MITM with fake cert | Vulnerable (corporate proxies) | **Blocked** |
| Stolen API key | Full access | **Blocked** (no cert) |
| Compromised server | Can impersonate | **Detected** (client verifies server) |
| Replay attacks | Possible | **Blocked** (TLS session binding) |

**Zero trust**: Every device must prove identity with a certificate signed by our CA.

## Architecture

```
Device Registration Flow:
┌─────────────┐     1. Request cert     ┌──────────────┐
│   Device    │ ──────────────────────► │  MemoRable   │
│ (AR glasses)│                         │  CA Server   │
│             │ ◄────────────────────── │              │
└─────────────┘     2. Issue cert       └──────────────┘
      │              (signed by CA)
      │
      ▼
┌─────────────┐     3. Present cert     ┌──────────────┐
│   Device    │ ──────────────────────► │   Service    │
│ (with cert) │                         │   (mTLS)     │
│             │ ◄────────────────────── │              │
└─────────────┘     4. Mutual verify    └──────────────┘
```

## Usage

### 1. Generate Certificate Authority (Once)

```typescript
import { generateCA } from './mtls.js';

const ca = await generateCA('MemoRable Device CA');
// ca.certPem  → distribute to all services (public)
// ca.keyPem   → SECURE STORAGE (HSM, Vault, KMS)
// ca.serialNumber → track for issuance
```

### 2. Issue Device Certificate

```typescript
import { issueDeviceCertificate } from './mtls.js';

const { cert, updatedCA } = await issueDeviceCertificate(ca, {
  deviceId: 'glasses-001',
  deviceType: 'smartglasses',
  validityDays: 365,
  capabilities: ['video', 'audio']
});

// cert.certPem  → send to device
// cert.keyPem   → send to device (SECURE CHANNEL)
// cert.serialNumber → log for audit
// cert.fingerprint  → quick lookup

// IMPORTANT: Save updatedCA (serial incremented)
```

### 3. Verify Device Certificate

```typescript
import { verifyCertificate } from './mtls.js';

const result = await verifyCertificate(ca, clientCertPem, revocationList);

if (result.valid) {
  console.log('Device authenticated:', result.deviceId);
} else {
  console.error('Rejected:', result.error);
}
```

### 4. Express Middleware

```typescript
import { mtlsMiddleware } from './mtls.js';
import https from 'https';
import express from 'express';

const app = express();

// Add mTLS middleware
app.use(mtlsMiddleware(ca, revocationList));

// Routes now have req.deviceId
app.get('/api/memories', (req, res) => {
  console.log('Request from device:', req.deviceId);
  // ...
});

// Create HTTPS server with client cert required
https.createServer({
  key: serverKey,
  cert: serverCert,
  ca: ca.certPem,
  requestCert: true,
  rejectUnauthorized: true
}, app).listen(443);
```

### 5. Certificate Revocation

```typescript
import { revokeCertificate, isRevoked } from './mtls.js';

// Revoke a compromised device
const newList = revokeCertificate(
  cert.serialNumber,
  cert.deviceId,
  'Device reported stolen',
  revocationList
);

// Check revocation
if (isRevoked(serialNumber, revocationList)) {
  throw new Error('Certificate revoked');
}
```

### 6. Extract Certificate Info

```typescript
import { extractCertInfo } from './mtls.js';

const info = await extractCertInfo(certPem);
// info.deviceId
// info.deviceType
// info.serialNumber
// info.fingerprint
// info.expiresAt
```

## Certificate Structure

Certificates include:

| Field | Example | Purpose |
|-------|---------|---------|
| CN (Common Name) | `glasses-001` | Device identifier |
| O (Organization) | `MemoRable` | Our org |
| OU (Org Unit) | `smartglasses` | Device type |
| SAN DNS | `glasses-001.memorable.local` | Local mesh resolution |
| SAN URI | `urn:memorable:device:smartglasses:glasses-001` | Unique resource ID |

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Authentication | Mutual - both sides verify |
| Confidentiality | TLS 1.3 encryption |
| Integrity | Certificate chain validation |
| Non-repudiation | Signed by private key |
| Revocation | CRL/OCSP support |

## Integration with Other Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                  (E2EE for Tier3 data)                      │
├─────────────────────────────────────────────────────────────┤
│                    Transport Layer                           │
│                  (WireGuard mesh)                           │
├─────────────────────────────────────────────────────────────┤
│                    Identity Layer                            │
│                  (mTLS certificates) ◄─── THIS MODULE        │
└─────────────────────────────────────────────────────────────┘
```

- **mTLS**: Verifies device identity before any communication
- **WireGuard**: Uses verified identity to establish mesh peers
- **E2EE**: Encrypts payloads after identity verified

## Configuration

```typescript
// Certificate validity
const DEFAULT_VALIDITY_DAYS = 365;  // 1 year for devices
const CA_VALIDITY_YEARS = 10;       // 10 years for CA

// Key sizes
const KEY_SIZE = 2048;              // RSA key size
const HASH_ALGO = 'sha256';         // Signature algorithm
```

## File Structure

```
src/services/device_auth/
├── mtls.ts          # Main implementation
└── README.md        # This file

tests/services/security/
└── mtls.test.ts     # Unit tests
```

## Dependencies

```json
{
  "crypto": "builtin",
  "child_process": "builtin"
}
```

Requires `openssl` command available in PATH.

## Test Results

```
mTLS Device Authentication
  Certificate Authority
    ✓ generateCA creates valid CA
    ✓ loadCA returns CA structure
  Certificate Issuance
    ✓ issueDeviceCertificate creates valid device cert
    ✓ issueDeviceCertificate increments serial number
    ✓ issueDeviceCertificate sets expiry correctly
  Certificate Verification
    ✓ verifyCertificate validates legitimate cert
    ✓ verifyCertificate rejects cert from different CA
    ✓ verifyCertificate rejects revoked cert
  Certificate Info Extraction
    ✓ extractCertInfo returns device details
    ✓ extractCertInfo returns null for invalid cert
  Revocation Management
    ✓ revokeCertificate adds entry to list
    ✓ revokeCertificate preserves existing entries
    ✓ isRevoked returns true for revoked serial
    ✓ isRevoked returns false for empty list

14 passing
```

## Production Notes

1. **CA Key Security**: Store CA private key in HSM, AWS KMS, or HashiCorp Vault. NEVER in plaintext files.

2. **Certificate Rotation**: Implement automatic renewal before expiry. Devices should request new cert when 30 days remain.

3. **Revocation Distribution**: Push CRL updates to all services. Consider OCSP for real-time revocation checking.

4. **Short-Lived Certificates**: For high-security, issue 24-hour certs and auto-renew. Limits exposure if compromised.

5. **Device Provisioning**: Initial cert issuance should use one-time tokens or physical presence verification.

## Betty's Safety

Why mTLS matters for Betty (Alzheimer's patient with AR glasses):

```
WITHOUT mTLS:
  Attacker → Fake glasses → Betty's data

WITH mTLS:
  Attacker → ❌ No valid cert → Connection rejected
  Real glasses → Valid cert → Betty's data (protected)
```

Every sensor touching Betty's life must prove identity. No exceptions.
