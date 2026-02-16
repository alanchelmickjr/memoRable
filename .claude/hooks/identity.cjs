#!/usr/bin/env node
/**
 * Identity Resolution — cross-session persistence via cache file
 *
 * Flow:
 * 1. Check identity cache (~/.memorable/identity-cache.json)
 * 2. If cached + high confidence → greet by name, load their context
 * 3. If no cache or low confidence → greet as unknown, wait for first message
 * 4. UserPromptSubmit hook handles stylometry on first message
 *
 * The cache file survives across Claude Code sessions. Device fingerprint
 * ensures identity is tied to this machine, not portable across devices.
 *
 * Exports: resolveFromCache(), buildChallengeContext(), getDeviceFingerprint(), updateCache()
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');

// ─── Cache Location ─────────────────────────────────────────────────────────
const CACHE_DIR = process.env.MEMORABLE_CACHE_DIR || path.join(os.homedir(), '.memorable');
const IDENTITY_CACHE = path.join(CACHE_DIR, 'identity-cache.json');

// ─── Confidence Thresholds ──────────────────────────────────────────────────
const HIGH_CONFIDENCE = 0.85;  // No challenge needed
const LOW_CONFIDENCE = 0.4;    // Below this = unknown

// ─── Cache TTL ──────────────────────────────────────────────────────────────
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Device Fingerprint ─────────────────────────────────────────────────────

/**
 * Generate a stable device fingerprint from hostname + user + platform.
 * Deterministic — same machine always produces the same fingerprint.
 */
function getDeviceFingerprint() {
  const hostname = os.hostname();
  const username = os.userInfo().username || 'unknown';
  const platform = os.platform();
  const arch = os.arch();
  const raw = `${hostname}:${username}:${platform}:${arch}`;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);

  return {
    deviceId: `claude-code-${hostname}-${hash}`,
    deviceType: 'desktop',
    hostname,
    username,
    platform,
  };
}

// ─── Cache I/O ──────────────────────────────────────────────────────────────

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(IDENTITY_CACHE, 'utf8'));
  } catch {
    return null;
  }
}

function saveCache(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(IDENTITY_CACHE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}

// ─── Identity Resolution ────────────────────────────────────────────────────

/**
 * Resolve identity from cache + device fingerprint.
 * Returns { entity, confidence, source, fingerprint }.
 *
 * Sources:
 * - 'cache'  — cached from previous session (high confidence)
 * - 'git'    — inferred from git config user.name (low confidence)
 * - 'none'   — unknown
 */
function resolveFromCache() {
  const fingerprint = getDeviceFingerprint();
  const cache = loadCache();

  // Check cache — must match this device
  if (cache && cache.deviceId === fingerprint.deviceId) {
    const age = Date.now() - (cache.timestamp || 0);

    if (age < CACHE_MAX_AGE && cache.entity && cache.confidence >= LOW_CONFIDENCE) {
      // Decay confidence slightly over time (max 20% decay at cache expiry)
      const decayFactor = 1 - (age / CACHE_MAX_AGE) * 0.2;
      const decayedConfidence = Math.max(cache.confidence * decayFactor, LOW_CONFIDENCE);

      return {
        entity: cache.entity,
        confidence: decayedConfidence,
        source: 'cache',
        fingerprint,
      };
    }
  }

  // Fallback: git user as weak identity signal
  try {
    const { execSync } = require('child_process');
    const gitUser = execSync('git config user.name 2>/dev/null', { encoding: 'utf8' }).trim().toLowerCase();
    if (gitUser) {
      const entity = gitUser.split(/\s+/)[0]; // First name only
      return {
        entity,
        confidence: 0.5,
        source: 'git',
        fingerprint,
      };
    }
  } catch {}

  return {
    entity: null,
    confidence: 0,
    source: 'none',
    fingerprint,
  };
}

// ─── Challenge Context ──────────────────────────────────────────────────────

/**
 * Build challenge context string for session startup.
 * Returns null if identity is high-confidence (no challenge needed).
 */
function buildChallengeContext(identity) {
  if (!identity) return null;

  if (identity.confidence >= HIGH_CONFIDENCE) {
    return null;
  }

  if (identity.confidence >= LOW_CONFIDENCE && identity.entity) {
    return `Identity guess: ${identity.entity} (${Math.round(identity.confidence * 100)}% from ${identity.source}). ` +
           'If wrong, first message will clarify via stylometry.';
  }

  return 'Identity unknown. Waiting for first message — UserPromptSubmit hook runs behavioral identification.';
}

// ─── Cache Update ───────────────────────────────────────────────────────────

/**
 * Update identity cache after successful identification.
 * Called from UserPromptSubmit hook after stylometry or explicit identification.
 */
function updateCache(entity, confidence, source) {
  const fingerprint = getDeviceFingerprint();
  saveCache({
    entity,
    confidence,
    source,
    deviceId: fingerprint.deviceId,
    timestamp: Date.now(),
  });
}

module.exports = {
  resolveFromCache,
  buildChallengeContext,
  getDeviceFingerprint,
  updateCache,
};
