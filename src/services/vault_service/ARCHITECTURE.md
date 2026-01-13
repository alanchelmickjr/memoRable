# Memory Vault Architecture

## The Problem
People's memories are their most precious treasures and most guarded secrets.
Act like it.

## Tiered Security Model

### TIER 1: General Memories (AES-256-GCM)
- Standard encrypted storage
- Fast retrieval for daily use
- Key derived from user password + device salt
- Searchable via encrypted indexes

### TIER 2: Personal Journal (Fort Knox)
- ChaCha20-Poly1305 + AES-256-GCM layered
- Hardware key required (YubiKey, Secure Enclave)
- Zero-knowledge architecture - server never sees plaintext
- Client-side encryption ONLY
- No cloud backup without explicit multi-factor auth

### TIER 3: Data Vault (Trillion Dollar Security)
- Multi-party computation
- Shamir Secret Sharing (3-of-5 key holders)
- Air-gapped signing required
- Audit log with cryptographic proof
- Self-destruct on tamper detection

## Alzheimer's Patient Consideration

For users who may forget their password:
- Trusted caregiver key escrow
- Biometric backup (fingerprint/face)
- Recovery phrase with family member verification
- Gradual access degradation, not cliff

The goal: They never lose their memories, even if they forget how to access them.

## NEVER in git. NEVER in logs. NEVER in plain text.
