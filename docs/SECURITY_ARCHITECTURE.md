# Security Architecture

## Fixed Issues (docker-compose.yml)

### Flaw 3: Weaviate Anonymous Access - FIXED
```yaml
AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=false
AUTHENTICATION_APIKEY_ENABLED=true
AUTHENTICATION_APIKEY_ALLOWED_KEYS=${WEAVIATE_API_KEY}
```

### Flaw 6: Prometheus/Grafana Metrics Exposure - FIXED
- Prometheus: Port no longer exposed externally, internal only via `expose`
- Grafana: Requires explicit password, no default, anonymous disabled

---

## Implemented Fixes

### Flaw 1: External APIs Receive Plaintext Memories - IMPLEMENTED

**Problem:** Feature extraction sends memory text to Anthropic/OpenAI/Hume.

**Solution:** Data Classification Layer with Tier-Based LLM Routing

```
┌─────────────────────────────────────────────────────────────┐
│                  DATA CLASSIFICATION                         │
│                                                              │
│  TIER 1 (General)     → Can go to external LLM              │
│  TIER 2 (Personal)    → Local LLM only (Ollama)             │
│  TIER 3 (Vault)       → Never leaves device, no LLM         │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Status: COMPLETE**
- `securityTier` field added to MemoryMemento and MemoryDocument models
- Feature extraction routes based on tier in `feature_extractor.ts`
- MCP server's `store_memory` enforces tier-based LLM routing:
  - Tier1_General: External LLM allowed
  - Tier2_Personal: Heuristic only (local LLM TODO)
  - Tier3_Vault: Heuristic ONLY - NO LLM ever

**Files modified:**
- `src/services/ingestion_service/models.ts` - Added SecurityTier type
- `src/services/salience_service/models.ts` - Added SecurityTier to MemoryDocument
- `src/services/salience_service/feature_extractor.ts` - Tier-aware extraction
- `src/services/mcp_server/index.ts` - store_memory enforces tiers

---

### Flaw 2: Encryption at Storage Layer - IMPLEMENTED

**Problem:** MongoDB stores plaintext in `text` field. Vectors in Weaviate unencrypted.

**Solution:** Encrypt-Before-Store Pattern with AES-256-GCM

**Implementation Status: COMPLETE**
- Tier2_Personal and Tier3_Vault memories are encrypted before MongoDB storage
- Tier3_Vault memories skip vector storage entirely (no Weaviate)
- Decryption happens automatically on retrieval in MCP server

```
┌─────────────────────────────────────────────────────────────┐
│                  STORAGE ENCRYPTION                          │
│                                                              │
│  MongoDB:                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Plaintext   │───▶│ Encrypt     │───▶│ Store       │     │
│  │ Memory      │    │ (AES-256)   │    │ Ciphertext  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
│  Weaviate:                                                   │
│  - Vectors themselves reveal semantic meaning                │
│  - Option A: Accept vectors are queryable (lower tier)       │
│  - Option B: Client-side vector generation, don't store     │
│  - Option C: Noise injection to obscure (degrades search)    │
│                                                              │
│  Recommendation: Tier 1/2 vectors in Weaviate, Tier 3 none  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
1. Use `src/utils/crypto.ts` (already exists) for encryption
2. Modify `MemorySteward` to encrypt before MongoDB write
3. Modify retrieval to decrypt after read
4. For Tier 3: No vectors stored, full-text encrypted search only

**Key Management:**
- Tier 1: Server-side key (derived from user password + salt)
- Tier 2: Client-side key (never sent to server)
- Tier 3: Hardware key required (YubiKey/Secure Enclave)

---

### Flaw 4: Ingestion API No Authentication

**Problem:** POST /api/ingest is open to anyone on network.

**Solution:** API Key + Rate Limiting

```yaml
# Add to ingestion_service environment
- INGESTION_API_KEY=${INGESTION_API_KEY:?required}
- INGESTION_RATE_LIMIT=100  # requests per minute per key
```

**Implementation:**
1. Add middleware to check `X-API-Key` header
2. Add rate limiting per API key
3. Add request signing for Tier 2/3 content
4. Log all ingestion attempts (audit trail)

---

### Passphrase-Based Key Exchange - IMPLEMENTED

**Problem:** Sharing a single API key is insecure. Users need a way to authenticate new devices without exposing secrets.

**Solution:** Knock → Phrase → Key flow

```
┌─────────────────────────────────────────────────────────────┐
│              PASSPHRASE KEY EXCHANGE                         │
│                                                              │
│  ONE passphrase per user (human-memorable, changeable)      │
│  ONE API key per device (machine-friendly, revocable)       │
│                                                              │
│  Flow:                                                       │
│  1. POST /auth/knock → get challenge nonce (5 min TTL)      │
│  2. POST /auth/exchange → passphrase + challenge → API key  │
│  3. Use X-API-Key header forever (or until revoked)         │
│                                                              │
│  Lost a device? POST /auth/revoke → kill just that key      │
│  Passphrase compromised? Change it, optionally revoke all   │
└─────────────────────────────────────────────────────────────┘
```

**Security Properties:**
- Challenge nonces prevent replay attacks (single-use, 5 min TTL)
- Passphrases hashed with SHA-256 + per-user salt (Argon2 TODO)
- Rate limited: 3 attempts per 15 min, then lockout
- Device keys are hashed in storage (only prefix stored for identification)
- Each device tracked independently (last_used, issued_at)

**Device Types Supported:**
- `terminal` - CLI sessions (Claude Code, Portal)
- `phone` - Mobile devices
- `ar_glasses` - Augmented reality (Alzheimer's support)
- `watch` - Wearables
- `ring` - Smart rings
- `robot` - Companion robots
- `browser` - Web dashboard
- `iot` - ESP32 sensors

**Files modified:**
- `src/server.js` - Auth endpoints and middleware
- `docs/PASSPHRASE_AUTH_SPEC.md` - Full specification

---

### Flaw 5: Stylometry as Unprotected Biometric

**Problem:** `get_stylometric_profile` creates PII that can identify/impersonate users.

**Solution:** Treat as Tier 3 Data

```
┌─────────────────────────────────────────────────────────────┐
│                  STYLOMETRY PROTECTION                       │
│                                                              │
│  1. Stylometric profiles stored encrypted (Tier 3)          │
│  2. Never sent to external APIs                              │
│  3. Access requires explicit MFA                             │
│  4. Audit log on every access                                │
│  5. Auto-delete option after N days of inactivity           │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
1. Move stylometry storage to vault (Tier 3)
2. Add consent flow before first profile creation
3. Add MFA requirement for profile access
4. Add TTL option for auto-deletion

---

## Security Tier Summary

| Tier | Encryption | LLM Access | Vector Storage | Key Location |
|------|-----------|-----------|----------------|--------------|
| 1 - General | AES-256-GCM | External OK | Weaviate | Server |
| 2 - Personal | ChaCha20+AES | Ollama only | Weaviate | Client |
| 3 - Vault | Shamir + HW | None | None | Hardware |

---

## Environment Variables Required

```bash
# New required variables (no defaults = must be set)
WEAVIATE_API_KEY=          # Strong random key
GRAFANA_ADMIN_PASSWORD=    # Strong password
INGESTION_API_KEY=         # API key for ingestion

# Encryption keys (production)
ENCRYPTION_MASTER_KEY=     # For Tier 1 server-side encryption
TOKEN_ENCRYPTION_KEY=      # For OAuth token encryption in Redis
EXPORT_ENCRYPTION_KEY=     # For encrypted memory exports
# Tier 2/3 keys never touch server
```

---

## Flaw 8: TLS Between Services

**Problem:** All inter-service communication is plaintext HTTP.

**Solution:** Enable TLS for all service communication.

### MongoDB TLS
```yaml
# docker-compose.yml
memorable_mongo:
  command: mongod --tlsMode requireTLS --tlsCertificateKeyFile /etc/ssl/mongo.pem
  volumes:
    - ./certs/mongo.pem:/etc/ssl/mongo.pem:ro
  environment:
    - MONGO_TLS=true

# Connection string
MONGODB_URI=mongodb://user:pass@memorable_mongo:27017/memorable?tls=true&tlsCAFile=/certs/ca.pem
```

### Redis TLS
```yaml
memorable_redis:
  command: redis-server --tls-port 6379 --port 0 --tls-cert-file /tls/redis.crt --tls-key-file /tls/redis.key --tls-ca-cert-file /tls/ca.crt
  volumes:
    - ./certs:/tls:ro
```

### Weaviate TLS
```yaml
memorable_weaviate:
  environment:
    - CLUSTER_HTTPS_ENABLED=true
```

### Certificate Generation (Development)
```bash
# Generate CA
openssl genrsa -out certs/ca.key 4096
openssl req -new -x509 -days 365 -key certs/ca.key -out certs/ca.pem -subj "/CN=memorable-ca"

# Generate service certs
for service in mongo redis weaviate; do
  openssl genrsa -out certs/$service.key 2048
  openssl req -new -key certs/$service.key -out certs/$service.csr -subj "/CN=memorable_$service"
  openssl x509 -req -in certs/$service.csr -CA certs/ca.pem -CAkey certs/ca.key -CAcreateserial -out certs/$service.crt -days 365
done
```

**Status:** Documented. Requires certificate setup for production.

---

## Flaw 9: Export/Import Encryption

**Problem:** `export_memories` returns plaintext JSON.

**Solution:** Password-protected encrypted exports.

### Implementation (in MCP server)
```typescript
// Export with encryption
case 'export_memories': {
  const { password, ...filters } = args;
  const memories = await exportMemories(userId, filters);

  if (password) {
    // Encrypt export with user password
    const encrypted = encryptExport(JSON.stringify(memories), password);
    return { content: [{ type: 'text', text: encrypted }] };
  }

  // Unencrypted export (warn user)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(memories),
      warning: 'UNENCRYPTED - Add password parameter for secure export'
    }]
  };
}

// Import with decryption
case 'import_memories': {
  const { data, password } = args;

  let memories;
  if (password) {
    memories = JSON.parse(decryptExport(data, password));
  } else {
    memories = JSON.parse(data);
  }

  // Validate and import
  await importMemories(userId, memories);
}
```

### Audit Trail
All export/import operations logged:
```typescript
await db.collection('audit_log').insertOne({
  action: 'export_memories',
  userId,
  timestamp: new Date(),
  filters: { people, topics, dateRange },
  encrypted: !!password,
  memoryCount: memories.length,
});
```

**Status:** Architecture documented. Code implementation required.

---

## Audit Trail

All security-relevant events logged to `state_changes` collection:
- Memory tier changes
- Encryption key rotations
- Failed auth attempts
- Stylometry profile access
- Export/import operations
- Bulk deletions

TTL: Never (security logs are permanent)
