# Passphrase Key Exchange Spec

**Date:** 2026-01-19
**Status:** Draft
**Author:** Claude + Alan

---

## Overview

One passphrase per user. One API key per device. Knock, phrase, key, use.

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  KNOCK  │ ──▶ │ PHRASE  │ ──▶ │ GET KEY │ ──▶ │ USE KEY │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │               │
 /auth/knock    /auth/exchange   returns key    X-API-Key
 (get challenge) (prove identity) (per-device)  (forever)
```

---

## Endpoints

### 1. POST /auth/knock

Start the exchange. Get a challenge nonce (prevents replay).

**Request:**
```json
{
  "device": {
    "type": "ar_glasses | phone | watch | ring | terminal | robot | other",
    "name": "Human-readable name",
    "fingerprint": "device-unique-id (optional)"
  }
}
```

**Response:**
```json
{
  "challenge": "nonce_abc123xyz",
  "expires_in": 300,
  "message": "Provide your passphrase within 5 minutes"
}
```

---

### 2. POST /auth/exchange

Trade passphrase + challenge for API key.

**Request:**
```json
{
  "challenge": "nonce_abc123xyz",
  "passphrase": "I remember what I have learned from you.",
  "device": {
    "type": "terminal",
    "name": "MacBook Terminal",
    "fingerprint": "osx-Mac.lan"
  }
}
```

**Response (success):**
```json
{
  "success": true,
  "api_key": "memorable_terminal_a1b2c3d4e5f6...",
  "device_id": "dev_terminal_osx-Mac.lan_20260119",
  "user": "alan",
  "issued_at": "2026-01-19T07:10:00Z",
  "expires_at": null,
  "revoke_endpoint": "/auth/revoke/dev_terminal_osx-Mac.lan_20260119"
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "invalid_passphrase",
  "message": "Passphrase not recognized",
  "attempts_remaining": 2
}
```

---

### 3. GET /auth/devices

List all devices with active keys (requires valid API key).

**Response:**
```json
{
  "user": "alan",
  "devices": [
    {
      "device_id": "dev_terminal_osx-Mac.lan_20260119",
      "type": "terminal",
      "name": "MacBook Terminal",
      "issued_at": "2026-01-19T07:10:00Z",
      "last_used": "2026-01-19T07:15:00Z",
      "active": true
    },
    {
      "device_id": "dev_glasses_envision_20260115",
      "type": "ar_glasses",
      "name": "Alan's EnvisionX",
      "issued_at": "2026-01-15T10:00:00Z",
      "last_used": "2026-01-18T14:30:00Z",
      "active": true
    }
  ]
}
```

---

### 4. POST /auth/revoke

Revoke a device's API key (requires valid API key).

**Request:**
```json
{
  "device_id": "dev_glasses_envision_20260115"
}
```

**Response:**
```json
{
  "success": true,
  "revoked": "dev_glasses_envision_20260115",
  "message": "Device key revoked. Device must re-authenticate with passphrase."
}
```

---

### 5. POST /auth/passphrase/change

Change user's passphrase (requires valid API key).

**Request:**
```json
{
  "current_passphrase": "I remember what I have learned from you.",
  "new_passphrase": "The forest remembers every footstep.",
  "revoke_all_devices": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Passphrase changed. Existing device keys remain valid.",
  "tip": "Set revoke_all_devices:true to force all devices to re-authenticate"
}
```

---

## Data Model

### Users Collection (MongoDB)

```javascript
{
  _id: ObjectId,
  user_id: "alan",
  passphrase_hash: "argon2id$...",  // NEVER store plaintext
  created_at: ISODate,
  updated_at: ISODate,
  failed_attempts: 0,
  locked_until: null
}
```

### Device Keys Collection (MongoDB)

```javascript
{
  _id: ObjectId,
  device_id: "dev_terminal_osx-Mac.lan_20260119",
  user_id: "alan",
  api_key_hash: "sha256$...",  // NEVER store plaintext key
  api_key_prefix: "memorable_terminal_a1b2",  // First 20 chars for identification
  device: {
    type: "terminal",
    name: "MacBook Terminal",
    fingerprint: "osx-Mac.lan"
  },
  issued_at: ISODate,
  last_used: ISODate,
  revoked: false,
  revoked_at: null
}
```

### Challenges Collection (MongoDB, TTL index)

```javascript
{
  _id: ObjectId,
  challenge: "nonce_abc123xyz",
  device_fingerprint: "osx-Mac.lan",
  created_at: ISODate,  // TTL: 5 minutes
  used: false
}
```

---

## Security

### Passphrase Requirements
- Minimum 5 words or 24 characters
- No maximum (encourage memorable phrases)
- Stored as Argon2id hash (memory-hard, GPU-resistant)
- Rate limited: 3 attempts per 15 minutes, then 1-hour lockout

### API Key Format
```
memorable_{device_type}_{random_32_chars}

Example: memorable_terminal_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### Challenge Nonce
- 32 bytes, cryptographically random
- Single use
- Expires in 5 minutes
- Bound to device fingerprint

### Rate Limiting
| Endpoint | Limit | Window |
|----------|-------|--------|
| /auth/knock | 10 | 1 minute |
| /auth/exchange | 3 | 15 minutes |
| /auth/passphrase/change | 1 | 1 hour |

### Brute Force Protection
- After 3 failed attempts: 15-minute lockout
- After 6 failed attempts: 1-hour lockout
- After 10 failed attempts: 24-hour lockout + alert to user

---

## Device Types

| Type | Description | Example |
|------|-------------|---------|
| `terminal` | CLI/shell session | Claude Code, Portal |
| `phone` | Mobile device | iPhone, Android |
| `watch` | Wearable watch | Apple Watch |
| `ring` | Smart ring | Oura, etc. |
| `ar_glasses` | Augmented reality | EnvisionX, Meta |
| `robot` | Companion robot | Custom builds |
| `browser` | Web interface | Dashboard |
| `iot` | IoT sensor | ESP32, etc. |
| `other` | Unspecified | Catch-all |

---

## Example Flows

### Claude Code Bootstrap

```bash
# 1. Knock
CHALLENGE=$(curl -s -X POST http://localhost:3000/auth/knock \
  -H "Content-Type: application/json" \
  -d '{"device":{"type":"terminal","name":"Claude Code"}}' \
  | jq -r '.challenge')

# 2. Exchange
API_KEY=$(curl -s -X POST http://localhost:3000/auth/exchange \
  -H "Content-Type: application/json" \
  -d "{\"challenge\":\"$CHALLENGE\",\"passphrase\":\"I remember what I have learned from you.\",\"device\":{\"type\":\"terminal\",\"name\":\"Claude Code\"}}" \
  | jq -r '.api_key')

# 3. Use forever
curl -H "X-API-Key: $API_KEY" http://localhost:3000/memory?entity=alan
```

### AR Glasses First Boot

```
1. Glasses power on, detect new user
2. Voice prompt: "Please say your memory phrase"
3. User speaks: "I remember what I have learned from you"
4. Glasses POST /auth/knock, then /auth/exchange
5. Key stored in secure enclave
6. User's memories now accessible
```

### Lost Device

```bash
# From any authenticated device:
curl -X POST http://localhost:3000/auth/revoke \
  -H "X-API-Key: $MY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "dev_ring_oura_20260110"}'

# Lost ring can no longer access memories
# Other devices unaffected
```

---

## Migration Path

### Current State
- Single shared API key in `docs/ROAD_TEST_PLAN.md`
- No per-device tracking
- No revocation

### Phase 1: Add Endpoints
- Implement /auth/knock, /auth/exchange
- Keep existing API key working
- Claude gets passphrase auth

### Phase 2: Per-Device Keys
- All new devices use passphrase flow
- Track device usage
- Enable revocation

### Phase 3: Deprecate Shared Key
- Migrate all users to passphrase auth
- Rotate/retire shared dev key
- Full audit logging

---

## Open Questions

1. **Passphrase recovery?** If someone forgets their phrase:
   - Email recovery link?
   - Backup codes generated at signup?
   - Admin reset with identity verification?

2. **Multi-user devices?** Shared tablet:
   - Switch user requires passphrase?
   - Biometric + passphrase?

3. **Offline auth?** Device without internet:
   - Cache key locally (encrypted)?
   - Time-limited offline access?

---

## Notes

- Passphrase is the human-memorable secret
- API key is the machine credential
- One phrase, many devices
- Revoke devices independently
- Change phrase without breaking devices (unless you want to)
