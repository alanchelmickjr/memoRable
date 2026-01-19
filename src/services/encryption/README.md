# E2EE Encryption Service

End-to-end encryption for MemoRable memories. Zero-trust: server cannot read encrypted content.

## Status

- **Implementation**: Complete
- **Tests**: 17/17 passing
- **Test file**: `tests/services/security/e2ee.test.ts`

## Algorithm

Uses NaCl (libsodium) box encryption:
- **Key Exchange**: X25519 (Curve25519)
- **Symmetric**: XSalsa20
- **Auth**: Poly1305

**Forward Secrecy**: Each message uses an ephemeral keypair. Compromising one message doesn't compromise others.

## Usage

### Generate User Keypair (once per user)

```typescript
import { generateUserKeyPair } from './e2ee.js';

const keypair = generateUserKeyPair();
// keypair.publicKey  → store on server, share with others
// keypair.secretKey  → store ONLY on device, NEVER send to server
```

### Encrypt Memory (device-side)

```typescript
import { encrypt } from './e2ee.js';

const payload = encrypt(
  'Grandma said she loves me',  // plaintext
  recipientPublicKey            // who can decrypt
);
// payload → safe to store on server (server cannot read)
```

### Decrypt Memory (device-side)

```typescript
import { decrypt } from './e2ee.js';

const plaintext = decrypt(payload, userSecretKey);
// Only works with correct secret key
```

### Multi-Recipient (shared memories)

```typescript
import { encryptForMultiple } from './e2ee.js';

const payload = encryptForMultiple(
  'Family dinner was wonderful',
  [alicePublicKey, bobPublicKey, carolPublicKey]
);
// All three can decrypt, each with their own key
```

### Passphrase-Derived Keys (recovery)

```typescript
import { deriveKeyPairFromPassphrase } from './e2ee.js';

// Same passphrase → same keys (for recovery)
const keypair = deriveKeyPairFromPassphrase('correct horse battery staple');
```

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Confidentiality | Only recipient can decrypt |
| Integrity | Tampered ciphertext detected |
| Forward Secrecy | Ephemeral keys per message |
| Zero Trust | Server stores blob, cannot read |

## Integration with Memory Tiers

| Tier | Encryption |
|------|------------|
| Tier1_General | Optional (plaintext OK) |
| Tier2_Personal | **E2EE required** |
| Tier3_Vault | **E2EE required**, no vectors |

## File Structure

```
src/services/encryption/
├── e2ee.ts          # Main implementation
└── README.md        # This file

tests/services/security/
└── e2ee.test.ts     # Unit tests
```

## Dependencies

```json
{
  "tweetnacl": "^1.0.3",
  "tweetnacl-util": "^0.15.1"
}
```

## Test Results

```
E2EE Encryption Module
  Key Generation
    ✓ generateUserKeyPair creates valid keypair
    ✓ generateUserKeyPair creates unique keypairs
    ✓ deriveKeyPairFromPassphrase is deterministic
    ✓ different passphrases create different keypairs
    ✓ hashPublicKey creates consistent hash
  Encryption and Decryption
    ✓ encrypt creates valid payload structure
    ✓ encrypt creates unique ciphertext each time (forward secrecy)
    ✓ decrypt recovers original plaintext
    ✓ decrypt fails with wrong key
    ✓ decrypt fails with tampered ciphertext
    ✓ handles unicode and special characters
    ✓ handles empty string
    ✓ handles large content
  Multi-Recipient Encryption
    ✓ encryptForMultiple encrypts for all recipients
  Utility Functions
    ✓ isEncrypted correctly identifies encrypted payloads
    ✓ hasE2EEMarker detects marker in text
    ✓ E2EE_MARKER has expected format

17 passing
```
