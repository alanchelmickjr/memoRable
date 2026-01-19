# Authentication Architecture - The One Gate

> One passphrase. One challenge. One key per device. Revoke independently.
> No hardcoded keys. No HTTP. No shortcuts.

## The Gate

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         THE ONE GATE                                     │
│                                                                          │
│   Human/Agent                                                            │
│       │                                                                  │
│       ▼                                                                  │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  1. KNOCK (/auth/knock)                                          │  │
│   │     → Get challenge nonce (5 min TTL)                            │  │
│   │     → No auth required                                           │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  2. EXCHANGE (/auth/exchange)                                    │  │
│   │     → Provide: challenge + passphrase + device info              │  │
│   │     → Receive: API key (device-specific, revocable)              │  │
│   │     → Rate limited: 3 attempts, then 15 min lockout              │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│       │                                                                  │
│       ▼                                                                  │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  3. USE (X-API-Key header)                                       │  │
│   │     → All API requests use this key                              │  │
│   │     → Key logged with device ID for audit                        │  │
│   │     → Revocable per-device without affecting others              │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Why This Design

| Problem | Solution |
|---------|----------|
| Keys in source control | Passphrase is human-memorable, not stored |
| Replay attacks | Challenge has 5 min TTL, single use |
| Compromised device | Revoke that device's key, others unaffected |
| Audit trail | Each key tied to device ID, usage logged |
| Brute force | Rate limiting + lockout after 3 failures |

## Authentication Methods (Priority Order)

| Method | When to Use | Security Level |
|--------|-------------|----------------|
| **Passphrase → API Key** | All new integrations | ✅ Recommended |
| **mTLS Certificate** | Sensors (AR, robots, IoT) | ✅✅ Strongest |
| **OAuth 2.0** | Web integrations (claude.ai) | ✅ Strong |
| **Behavioral Identity** | Anomaly detection (MFA) | ⚠️ Supplementary |
| ~~Master API Key~~ | **DEPRECATED** | ❌ Avoid |

## Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECRETS HIERARCHY                                │
│                                                                          │
│  AWS Secrets Manager (Production)                                       │
│  ├── /memorable/anthropic     → LLM API key                             │
│  ├── /memorable/mongodb       → Database credentials                    │
│  └── /memorable/encryption    → Master encryption key                   │
│                                                                          │
│  Environment Variables (Runtime)                                        │
│  ├── JWT_SECRET              → OAuth token signing ONLY                 │
│  ├── TOKEN_ENCRYPTION_KEY    → Redis token encryption ONLY              │
│  ├── ENCRYPTION_MASTER_KEY   → Memory content encryption ONLY           │
│  └── MEMORABLE_PASSPHRASE    → User's passphrase (optional override)    │
│                                                                          │
│  ⚠️  NEVER use the same key for multiple purposes!                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Device Key Lifecycle

```
1. ISSUE
   └─ POST /auth/exchange
      ├─ Input: challenge + passphrase + device info
      ├─ Verify: passphrase hash (Argon2id)
      ├─ Generate: memorable_{deviceType}_{random}
      └─ Store: hash(key) → { user_id, device_id, device, issued_at }

2. USE
   └─ X-API-Key: memorable_terminal_abc123...
      ├─ Lookup: hash(key) in deviceKeys
      ├─ Verify: not revoked
      ├─ Update: last_used timestamp
      └─ Attach: { user_id, device_id } to request

3. REVOKE
   └─ POST /auth/revoke
      ├─ Input: device_id (from authenticated request)
      ├─ Action: mark key as revoked
      └─ Effect: immediate, device must re-auth with passphrase
```

## Transport Security

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TRANSPORT LAYERS                                    │
│                                                                          │
│  ❌ HTTP        → BLOCKED at code level (api_client.ts rejects)         │
│                                                                          │
│  ⚠️  HTTPS      → Temporary (MITM possible with fake certs)             │
│                  └─ Acceptable: local dev, staging                       │
│                  └─ NOT acceptable: production sensitive data            │
│                                                                          │
│  ✅ Bastion/VPN → Target for production                                  │
│                  └─ SSM Session Manager (no public IPs)                  │
│                  └─ WireGuard mesh (sensors)                             │
│                                                                          │
│  ✅ mTLS        → Sensors and devices                                    │
│                  └─ Certificate proves device identity                   │
│                  └─ Revocation list checked on every request             │
│                                                                          │
│  ✅ E2EE        → Tier3 memory content                                   │
│                  └─ Server cannot read encrypted payload                 │
│                  └─ Only user's device can decrypt                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Behavioral Identity (Stylometry)

**NOT a primary auth method** - supplementary signal for:

1. **Anomaly Detection**: "This doesn't sound like Alan"
2. **Multi-Factor**: Passphrase + behavioral match
3. **Forensics**: Prove who wrote a memory

Signals extracted:
- Vocabulary richness (hapax ratio, type-token)
- Syntax patterns (sentence length, punctuation)
- Character n-grams (most discriminative)
- Function word frequencies
- Timing patterns (hour, day of week)

**Confidence threshold**: 75% match required (configurable)
**Minimum samples**: 50 interactions before predictions

## Migration Path

### From Hardcoded Keys

```bash
# OLD (deprecated)
curl -H "X-API-Key: hKiToQUchIAx..." ...

# NEW (use passphrase flow)
CHALLENGE=$(curl -s -X POST "${BASE_URL}/auth/knock" ...)
API_KEY=$(curl -s -X POST "${BASE_URL}/auth/exchange" \
  -d '{"challenge":"...","passphrase":"I remember..."}' ...)
curl -H "X-API-Key: $API_KEY" ...
```

### From Master Key

The master key (`MEMORABLE_API_KEY` env var) is deprecated:
1. Remove from environment
2. Use passphrase flow for each device
3. Per-device keys allow granular revocation

## Files That Implement This

| File | Purpose |
|------|---------|
| `src/server.js` | Passphrase auth endpoints, key management |
| `src/services/mcp_server/api_client.ts` | REST mode client (HTTPS enforcement) |
| `src/services/device_auth/mtls.ts` | mTLS for sensors |
| `src/services/encryption/e2ee.ts` | E2EE for Tier3 |
| `docs/PASSPHRASE_AUTH_SPEC.md` | Full passphrase spec |
| `docs/REST_MODE_SECURITY.md` | Transport security |

## Security Checklist

- [ ] No hardcoded keys in source control
- [ ] Different keys for JWT, token encryption, memory encryption
- [ ] Passphrase hashed with Argon2id (not SHA-256)
- [ ] HTTPS enforced (HTTP blocked)
- [ ] Rate limiting on auth endpoints
- [ ] Device keys revocable independently
- [ ] Audit log of key usage
- [ ] mTLS for sensors
- [ ] E2EE for Tier3 memories

---

**Remember**: Betty's dignity depends on every layer working together.
No shortcuts. No "temporary" HTTP. No shared keys.
