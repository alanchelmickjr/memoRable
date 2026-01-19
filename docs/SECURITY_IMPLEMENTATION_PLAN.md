# Security Implementation Plan

> From scaffolding to fortress. No HTTP ever. Edge-first. Betty's dignity.

## Executive Summary

| Layer | Current | Target | Status |
|-------|---------|--------|--------|
| Dev/Admin Access | HTTPS (bypassable) | Bastion (SSM) | **✅ COMPLETE** |
| Device Auth | API key | mTLS certificates | **✅ COMPLETE** |
| Payload Encryption | At-rest only | E2EE (Tier2/3) | **✅ COMPLETE** |
| Sensor Transport | None | WireGuard mesh | **✅ COMPLETE** |
| Edge AI | Cloud-dependent | Local Ollama | P2 |

### Implementation Status

| Module | Tests | Documentation |
|--------|-------|---------------|
| E2EE Encryption | 17/17 ✅ | `src/services/encryption/README.md` |
| WireGuard Mesh | 22/22 ✅ | `src/services/wireguard/README.md` |
| mTLS Device Auth | 14/14 ✅ | `src/services/device_auth/README.md` |
| Bastion (SSM) | CloudFormation ✅ | Below |

---

## Phase 1: Bastion Host (SSM Session Manager)

**Why SSM over traditional bastion EC2:**
- No public IP to attack
- No SSH keys to manage/rotate
- IAM-based access control
- Session logging to CloudWatch
- Port forwarding built-in

### Architecture

```
┌─────────────────┐                    ┌─────────────────────────────────┐
│  Developer      │                    │         AWS VPC                 │
│  (Claude Code)  │                    │                                 │
└────────┬────────┘                    │  ┌─────────────────┐            │
         │                             │  │  ECS Task       │            │
         │ SSM Session                 │  │  (SSM Agent)    │            │
         │ (encrypted, authed)         │  └────────┬────────┘            │
         │                             │           │                     │
         ▼                             │           ▼                     │
┌─────────────────┐                    │  ┌─────────────────┐            │
│  SSM Endpoint   │════════════════════│  │  DocumentDB     │            │
│  (AWS managed)  │   Private link     │  │  (TLS required) │            │
└─────────────────┘                    │  └─────────────────┘            │
                                       └─────────────────────────────────┘
```

### Implementation

#### 1.1 Add SSM IAM Policies to CloudFormation

```yaml
# Add to ECSTaskRole in memorable-stack.yaml
- PolicyName: SSMSessionManager
  PolicyDocument:
    Version: '2012-10-17'
    Statement:
      - Effect: Allow
        Action:
          - ssmmessages:CreateControlChannel
          - ssmmessages:CreateDataChannel
          - ssmmessages:OpenControlChannel
          - ssmmessages:OpenDataChannel
        Resource: '*'
      - Effect: Allow
        Action:
          - s3:GetEncryptionConfiguration
        Resource: '*'
```

#### 1.2 Enable ECS Exec for Fargate Tasks

```yaml
# Modify ECSService in memorable-stack.yaml
ECSService:
  Type: AWS::ECS::Service
  Properties:
    EnableExecuteCommand: true  # <-- Add this
    # ... rest of config
```

#### 1.3 Add SSM VPC Endpoints (for private subnet access)

```yaml
# Add to memorable-stack.yaml
SSMEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: !Ref VPC
    ServiceName: !Sub com.amazonaws.${AWS::Region}.ssm
    VpcEndpointType: Interface
    SubnetIds:
      - !Ref PrivateSubnet1
      - !Ref PrivateSubnet2
    SecurityGroupIds:
      - !Ref ECSSecurityGroup

SSMMessagesEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: !Ref VPC
    ServiceName: !Sub com.amazonaws.${AWS::Region}.ssmmessages
    VpcEndpointType: Interface
    SubnetIds:
      - !Ref PrivateSubnet1
      - !Ref PrivateSubnet2
    SecurityGroupIds:
      - !Ref ECSSecurityGroup
```

#### 1.4 Developer Access Commands

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks --cluster memorable-cluster --service memorable-app --query 'taskArns[0]' --output text)

# Start interactive session
aws ecs execute-command \
  --cluster memorable-cluster \
  --task $TASK_ARN \
  --container memorable-app \
  --interactive \
  --command "/bin/sh"

# Port forward to DocumentDB (for local MCP direct mode)
aws ssm start-session \
  --target ecs:memorable-cluster_${TASK_ID}_memorable-app \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["docdb-endpoint.cluster-xxx.us-west-2.docdb.amazonaws.com"],"portNumber":["27017"],"localPortNumber":["27017"]}'
```

---

## Phase 2: mTLS Device Authentication

**Why mTLS:**
- Defeats MITM (attacker needs device cert)
- Per-device identity (revocable)
- Works with existing TLS infrastructure

### Architecture

```
┌─────────────────┐          mTLS              ┌─────────────────┐
│     Device      │ ═══════════════════════════│      ALB        │
│  (has cert)     │  Client cert + Server cert │  (verifies)     │
└─────────────────┘                            └─────────────────┘

Both sides verify. No cert = no connection.
```

### Implementation

#### 2.1 Create Private CA (AWS Private CA or self-managed)

```bash
# Option A: AWS Private CA (managed, $400/mo)
aws acm-pca create-certificate-authority \
  --certificate-authority-configuration \
    KeyAlgorithm=RSA_2048,SigningAlgorithm=SHA256WITHRSA,Subject={CommonName=memorable-device-ca} \
  --certificate-authority-type ROOT

# Option B: Self-managed (free, more work)
# Generate CA key and cert
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/CN=memorable-device-ca"
```

#### 2.2 Device Certificate Issuance

```typescript
// src/services/device_auth/issue_cert.ts
import { execSync } from 'child_process';

interface DeviceCert {
  deviceId: string;
  certPem: string;
  keyPem: string;
  expiresAt: Date;
}

export async function issueDeviceCert(
  deviceId: string,
  deviceType: string
): Promise<DeviceCert> {
  // Generate key
  const keyPem = execSync('openssl genrsa 2048').toString();

  // Create CSR
  const csr = execSync(`openssl req -new -key /dev/stdin -subj "/CN=${deviceId}/O=${deviceType}"`, {
    input: keyPem
  }).toString();

  // Sign with CA (in production, use AWS Private CA or Vault)
  const certPem = execSync(`openssl x509 -req -days 365 -CA ca.crt -CAkey ca.key -CAcreateserial`, {
    input: csr
  }).toString();

  return {
    deviceId,
    certPem,
    keyPem,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  };
}
```

#### 2.3 ALB mTLS Configuration

```yaml
# Update ALBListenerHTTPS in memorable-stack.yaml
ALBListenerHTTPS:
  Type: AWS::ElasticLoadBalancingV2::Listener
  Condition: EnableHTTPS
  Properties:
    LoadBalancerArn: !Ref ALB
    Port: 443
    Protocol: HTTPS
    SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06
    Certificates:
      - CertificateArn: !Ref CertificateArn
    MutualAuthentication:  # <-- Add mTLS
      Mode: verify
      TrustStoreArn: !Ref DeviceTrustStore
    DefaultActions:
      - Type: forward
        TargetGroupArn: !Ref ALBTargetGroup

DeviceTrustStore:
  Type: AWS::ElasticLoadBalancingV2::TrustStore
  Properties:
    Name: !Sub ${AWS::StackName}-device-trust
    CaCertificatesBundleS3Bucket: !Ref ConfigBucket
    CaCertificatesBundleS3Key: ca-bundle.pem
```

---

## Phase 3: E2EE for Tier2/Tier3 Payloads

**Why E2EE:**
- Zero trust (server can't read data)
- Compromised server = no data leak
- True privacy for sensitive memories

### Architecture

```
┌─────────────────┐                           ┌─────────────────┐
│     Device      │     Encrypted payload     │     Server      │
│                 │ ─────────────────────────►│                 │
│ Encrypts with   │     (server CAN'T read)   │ Stores blob,    │
│ user's key      │                           │ routes only     │
└─────────────────┘                           └─────────────────┘
                              │
                              ▼
                    Only user can decrypt
```

### Implementation

#### 3.1 Key Management

```typescript
// src/services/encryption/e2ee.ts
import { box, randomBytes } from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

interface EncryptedPayload {
  nonce: string;      // Base64
  ciphertext: string; // Base64
  ephemeralPub: string; // Base64 (for forward secrecy)
}

// Generate user keypair (stored securely on device, NEVER on server)
export function generateUserKeyPair(): KeyPair {
  return box.keyPair();
}

// Encrypt memory content (device-side)
export function encryptForUser(
  plaintext: string,
  recipientPublicKey: Uint8Array
): EncryptedPayload {
  const ephemeral = box.keyPair();
  const nonce = randomBytes(box.nonceLength);
  const messageBytes = new TextEncoder().encode(plaintext);

  const ciphertext = box(
    messageBytes,
    nonce,
    recipientPublicKey,
    ephemeral.secretKey
  );

  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
    ephemeralPub: encodeBase64(ephemeral.publicKey)
  };
}

// Decrypt memory content (device-side only)
export function decryptForUser(
  payload: EncryptedPayload,
  userSecretKey: Uint8Array
): string {
  const nonce = decodeBase64(payload.nonce);
  const ciphertext = decodeBase64(payload.ciphertext);
  const ephemeralPub = decodeBase64(payload.ephemeralPub);

  const plaintext = box.open(
    ciphertext,
    nonce,
    ephemeralPub,
    userSecretKey
  );

  if (!plaintext) {
    throw new Error('Decryption failed');
  }

  return new TextDecoder().decode(plaintext);
}
```

#### 3.2 Integrate with Memory Storage

```typescript
// Modify store_memory in MCP server
case 'store_memory': {
  const { text, securityTier } = args;

  // Tier2/Tier3: E2EE encrypt before storing
  let textToStore = text;
  let e2eePayload: EncryptedPayload | undefined;

  if (securityTier === 'Tier2_Personal' || securityTier === 'Tier3_Vault') {
    // Get user's public key (stored in their profile)
    const userPubKey = await getUserPublicKey(userId);
    e2eePayload = encryptForUser(text, userPubKey);
    textToStore = '[E2EE ENCRYPTED]'; // Server stores marker only
  }

  const memoryDoc = {
    // ... other fields
    text: textToStore,
    e2eePayload, // Encrypted blob, server can't read
    e2eeVersion: '1.0',
  };
}
```

---

## Phase 4: WireGuard Mesh for Sensors

**Why WireGuard:**
- Kernel-level (fast)
- Modern crypto (secure)
- Mesh-capable (no single point of failure)
- Low overhead (good for constrained devices)

### Architecture

```
┌─────────────────┐     WireGuard      ┌─────────────────┐
│   AR Glasses    │◄══════════════════►│   Home Robot    │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │              WireGuard               │
         └──────────────────┬───────────────────┘
                            │
                   ┌────────▼────────┐
                   │     Pendant     │
                   └────────┬────────┘
                            │
                            ▼ (when online)
                   ┌─────────────────┐
                   │   Cloud Peer    │
                   └─────────────────┘
```

### Implementation

#### 4.1 WireGuard Configuration Generator

```typescript
// src/services/wireguard/config.ts
import { execSync } from 'child_process';

interface WireGuardPeer {
  publicKey: string;
  allowedIPs: string;
  endpoint?: string; // Optional for mesh peers
}

interface WireGuardConfig {
  privateKey: string;
  publicKey: string;
  address: string;
  listenPort?: number;
  peers: WireGuardPeer[];
}

export function generateDeviceConfig(
  deviceId: string,
  deviceIndex: number, // For IP allocation
  knownPeers: WireGuardPeer[]
): WireGuardConfig {
  // Generate keypair
  const privateKey = execSync('wg genkey').toString().trim();
  const publicKey = execSync(`echo ${privateKey} | wg pubkey`).toString().trim();

  // Allocate IP from mesh subnet
  const address = `10.100.0.${deviceIndex}/24`;

  return {
    privateKey,
    publicKey,
    address,
    listenPort: 51820,
    peers: knownPeers
  };
}

export function toWireGuardConfFile(config: WireGuardConfig): string {
  let conf = `[Interface]
PrivateKey = ${config.privateKey}
Address = ${config.address}
`;

  if (config.listenPort) {
    conf += `ListenPort = ${config.listenPort}\n`;
  }

  for (const peer of config.peers) {
    conf += `
[Peer]
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIPs}
`;
    if (peer.endpoint) {
      conf += `Endpoint = ${peer.endpoint}\n`;
    }
    conf += `PersistentKeepalive = 25\n`;
  }

  return conf;
}
```

#### 4.2 Mesh Coordinator Service

```typescript
// src/services/wireguard/mesh_coordinator.ts
interface MeshDevice {
  deviceId: string;
  publicKey: string;
  meshIP: string;
  lastSeen: Date;
  endpoint?: string; // For devices with public IPs
}

class MeshCoordinator {
  private devices: Map<string, MeshDevice> = new Map();

  // Register device and get config
  async registerDevice(deviceId: string): Promise<WireGuardConfig> {
    const index = this.devices.size + 1;
    const config = generateDeviceConfig(
      deviceId,
      index,
      this.getAllPeers()
    );

    this.devices.set(deviceId, {
      deviceId,
      publicKey: config.publicKey,
      meshIP: config.address.split('/')[0],
      lastSeen: new Date()
    });

    // Notify other devices of new peer
    await this.broadcastPeerUpdate();

    return config;
  }

  private getAllPeers(): WireGuardPeer[] {
    return Array.from(this.devices.values()).map(d => ({
      publicKey: d.publicKey,
      allowedIPs: `${d.meshIP}/32`,
      endpoint: d.endpoint
    }));
  }
}
```

---

## Implementation Order

```
Week 1: Bastion (SSM)
├── Day 1-2: CloudFormation updates
├── Day 3: IAM policies and VPC endpoints
├── Day 4: Test ECS Exec access
└── Day 5: Document and verify

Week 2: mTLS
├── Day 1-2: Set up Private CA
├── Day 3: Device cert issuance service
├── Day 4: ALB mTLS configuration
└── Day 5: Test device authentication

Week 3: E2EE
├── Day 1-2: Key management implementation
├── Day 3: Encrypt/decrypt integration
├── Day 4: Key backup/recovery flow
└── Day 5: Test Tier2/Tier3 encryption

Week 4: WireGuard Mesh
├── Day 1-2: Config generator
├── Day 3: Mesh coordinator service
├── Day 4: POC with 2-3 devices
└── Day 5: Document and iterate
```

---

## Success Criteria

| Phase | Metric | Target |
|-------|--------|--------|
| Bastion | Dev can access DB securely | No public exposure |
| mTLS | Devices authenticate with certs | Reject unknown devices |
| E2EE | Server can't read Tier2/3 data | Decrypt only on device |
| WireGuard | Sensors communicate in mesh | Works offline |

---

## Files Created/Modified

### Security Modules (All Complete with Tests)

| Module | Implementation | Tests | Docs |
|--------|----------------|-------|------|
| E2EE | `src/services/encryption/e2ee.ts` | `tests/services/security/e2ee.test.ts` | `src/services/encryption/README.md` |
| WireGuard | `src/services/wireguard/mesh.ts` | `tests/services/security/wireguard.test.ts` | `src/services/wireguard/README.md` |
| mTLS | `src/services/device_auth/mtls.ts` | `tests/services/security/mtls.test.ts` | `src/services/device_auth/README.md` |

### Infrastructure Files Modified
- `cloudformation/memorable-stack.yaml` (SSM, HTTPS, VPC endpoints)
- `src/services/mcp_server/index.ts` (REST mode support)
- `src/services/mcp_server/api_client.ts` (HTTPS-only REST client)
- `.env.example` (REST mode config)

### Test Results Summary
```
Security Tests: 53 passing
├── E2EE:      17/17 ✅
├── WireGuard: 22/22 ✅
└── mTLS:      14/14 ✅
```

---

**All P0/P1 security layers complete. Next: Edge AI (Ollama integration)**
