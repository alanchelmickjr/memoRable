# WireGuard Mesh Network

Secure, fast, peer-to-peer communication between MemoRable sensors. Works offline (mesh between local devices). Cloud is a peer, not a requirement.

## Status

- **Implementation**: Complete
- **Tests**: 22/22 passing
- **Test file**: `tests/services/security/wireguard.test.ts`

## Why WireGuard?

| Property | WireGuard | Alternative |
|----------|-----------|-------------|
| Latency | ~0.5ms | OpenVPN: 2-5ms |
| Code size | ~4,000 LOC | OpenVPN: 100,000+ LOC |
| Crypto | Noise protocol, Curve25519 | Various, configurable |
| Attack surface | Minimal | Large |
| NAT traversal | Built-in | Requires config |

**Perfect for sensors**: AR glasses ↔ Robot needs sub-millisecond response. Betty's safety depends on it.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │        MemoRable Cloud (.1)         │
                    │   (peer, not requirement)           │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼───────┐  ┌────────▼────────┐
     │  AR Glasses     │  │    Robot      │  │    Pendant      │
     │   (.2)          │◄─►    (.3)       │◄─►    (.4)         │
     │  video, audio   │  │ audio, motion │  │ vitals, location│
     └─────────────────┘  └───────────────┘  └─────────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                         LOCAL MESH (offline OK)
```

## Usage

### Generate Keys

```typescript
import { generateKeyPair, generatePresharedKey } from './mesh.js';

// Generate device keypair
const keypair = generateKeyPair();
// keypair.privateKey → NEVER share
// keypair.publicKey  → shared with peers

// Optional: Pre-shared key for extra security between specific peers
const psk = generatePresharedKey();
```

### Allocate Mesh IP

```typescript
import { allocateMeshIP } from './mesh.js';

const ip = allocateMeshIP(5); // → "10.100.0.5"
// Index 1 reserved for cloud
// Devices get 2-254
```

### Generate Config

```typescript
import { generateDeviceConfig, toConfFile } from './mesh.js';

const device: MeshDevice = {
  deviceId: 'glasses-001',
  deviceType: 'smartglasses',
  publicKey: 'abc...',
  meshIP: '10.100.0.2',
  lastSeen: new Date(),
  capabilities: ['video', 'audio']
};

const config = generateDeviceConfig(device, otherPeers);
const confFile = toConfFile(config);
// confFile → valid WireGuard .conf format
```

### Mesh Coordinator (Full Management)

```typescript
import { MeshCoordinator } from './mesh.js';

const coordinator = new MeshCoordinator({
  publicKey: 'cloud-pub-key',
  endpoint: 'cloud.memorable.io:51820'
});

// Register device (auto-allocates IP)
const { device, config } = await coordinator.registerDevice(
  'glasses-001',
  'smartglasses',
  ['video', 'audio'],
  '192.168.1.100:51820'  // optional public endpoint
);

// Query devices
const allDevices = coordinator.getDevices();
const glasses = coordinator.getDevicesByType('smartglasses');
const audioDevices = coordinator.getDevicesWithCapability('audio');

// Health management
coordinator.heartbeat('glasses-001');  // Update lastSeen
const pruned = coordinator.pruneStaleDevices(5 * 60 * 1000);  // Remove stale

// Persistence
const state = coordinator.exportState();
coordinator.importState(state);
```

## Config File Format

Generated `.conf` files are standard WireGuard format:

```ini
[Interface]
PrivateKey = <base64>
Address = 10.100.0.2/24
ListenPort = 51820

[Peer]
PublicKey = <peer-public-key>
AllowedIPs = 10.100.0.3/32
Endpoint = 192.168.1.100:51820
PersistentKeepalive = 25

[Peer]
PublicKey = <cloud-public-key>
AllowedIPs = 10.100.0.1/32
Endpoint = cloud.memorable.io:51820
PersistentKeepalive = 25
```

## Subnet Allocation

| IP | Assignment |
|----|------------|
| 10.100.0.1 | Cloud (always) |
| 10.100.0.2-254 | Devices (sequential) |

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Confidentiality | ChaCha20 encryption |
| Integrity | Poly1305 MAC |
| Authentication | Curve25519 key exchange |
| Forward Secrecy | Session keys rotated |
| Replay Protection | Built-in counters |

## Integration with Other Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                  (E2EE for Tier3 data)                      │
├─────────────────────────────────────────────────────────────┤
│                    Transport Layer                           │
│                  (WireGuard mesh)                           │
├─────────────────────────────────────────────────────────────┤
│                    Identity Layer                            │
│                  (mTLS certificates)                        │
└─────────────────────────────────────────────────────────────┘
```

- **WireGuard**: Encrypts all traffic between mesh nodes
- **mTLS**: Verifies device identity before joining mesh
- **E2EE**: Encrypts sensitive payloads (Tier3) end-to-end

## File Structure

```
src/services/wireguard/
├── mesh.ts          # Main implementation
└── README.md        # This file

tests/services/security/
└── wireguard.test.ts  # Unit tests
```

## Dependencies

```json
{
  "crypto": "builtin"
}
```

Optional: `wireguard-tools` package for native key generation (fallback uses Node crypto).

## Test Results

```
WireGuard Mesh Module
  Key Generation
    ✓ generateKeyPair creates valid keypair
    ✓ generateKeyPair creates unique keypairs
    ✓ generatePresharedKey creates valid key
    ✓ generatePresharedKey creates unique keys
  IP Allocation
    ✓ allocateMeshIP returns valid IP
    ✓ allocateMeshIP throws on invalid index
    ✓ allocateMeshIP handles boundary values
  Config Generation
    ✓ generateDeviceConfig creates valid config structure
    ✓ generateDeviceConfig includes all peers except self
    ✓ generateDeviceConfig includes endpoint when available
    ✓ toConfFile generates valid WireGuard format
    ✓ toConfFile includes endpoint only when present
  MeshCoordinator
    ✓ registerDevice adds device to mesh
    ✓ registerDevice assigns sequential IPs
    ✓ registerDevice updates existing device
    ✓ getDevices returns all devices
    ✓ getDevicesByType filters correctly
    ✓ getDevicesWithCapability filters correctly
    ✓ removeDevice removes device from mesh
    ✓ heartbeat updates lastSeen
    ✓ pruneStaleDevices removes old devices
    ✓ exportState and importState preserve mesh

22 passing
```

## Production Notes

1. **Install wireguard-tools**: Native `wg` command generates cryptographically proper Curve25519 keys
2. **Persistent storage**: Use `exportState()`/`importState()` with encrypted storage
3. **Key rotation**: Implement periodic key rotation for long-running devices
4. **Endpoint discovery**: Consider implementing STUN/TURN for NAT traversal in complex networks
