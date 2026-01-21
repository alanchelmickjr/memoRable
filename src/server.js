/**
 * Main server entry point for Docker/ECS deployment.
 * Express server with health endpoints and metrics tracking.
 *
 * User System: MongoDB-backed multi-user support for families and teams.
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import argon2 from 'argon2';

// Database and user models
import { setupDatabase, getDatabase } from './config/database.js';
import {
  setupUserModels,
  bootstrapClaudeUser,
  validateApiKey,
  findUserById,
  recordLoginAttempt,
  isUserLocked,
  issueDeviceKey,
  registerUser,
  verifyPassphrase as verifyPassphraseMongo,
} from './models/index.ts';

// MCP Server - the core of MemoRable
import { mountMcpEndpoint } from './services/mcp_server/index.ts';

const app = express();
const PORT = process.env.PORT || 3000;

// Track startup state
let isReady = false;
const startTime = Date.now();

// =============================================================================
// METRICS REGISTRY
// Simple in-memory metrics tracking - Prometheus-compatible output
// =============================================================================
const metrics = {
  counters: {},
  histograms: {},
  gauges: {},

  // Increment a counter
  inc(name, labels = {}, value = 1) {
    const key = this._key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  },

  // Record a value in a histogram (for latencies)
  observe(name, labels = {}, value) {
    const key = this._key(name, labels);
    if (!this.histograms[key]) {
      this.histograms[key] = { count: 0, sum: 0, values: [] };
    }
    this.histograms[key].count++;
    this.histograms[key].sum += value;
    this.histograms[key].values.push(value);
    // Keep last 1000 values for percentile calculation
    if (this.histograms[key].values.length > 1000) {
      this.histograms[key].values.shift();
    }
  },

  // Set a gauge value
  set(name, labels = {}, value) {
    const key = this._key(name, labels);
    this.gauges[key] = value;
  },

  // Generate key from name + labels
  _key(name, labels) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  },

  // Calculate percentile from histogram
  _percentile(values, p) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  },

  // Export in Prometheus format
  export() {
    let output = '';

    // Counters
    for (const [key, value] of Object.entries(this.counters)) {
      output += `${key} ${value}\n`;
    }

    // Gauges
    for (const [key, value] of Object.entries(this.gauges)) {
      output += `${key} ${value}\n`;
    }

    // Histograms (export count, sum, and percentiles)
    for (const [key, data] of Object.entries(this.histograms)) {
      const baseName = key.split('{')[0];
      const labels = key.includes('{') ? key.slice(key.indexOf('{')) : '';
      output += `${baseName}_count${labels} ${data.count}\n`;
      output += `${baseName}_sum${labels} ${data.sum}\n`;
      output += `${baseName}_p50${labels} ${this._percentile(data.values, 50)}\n`;
      output += `${baseName}_p95${labels} ${this._percentile(data.values, 95)}\n`;
      output += `${baseName}_p99${labels} ${this._percentile(data.values, 99)}\n`;
    }

    return output;
  },

  // Export as JSON (for dashboard)
  toJSON() {
    const result = {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      histograms: {}
    };

    for (const [key, data] of Object.entries(this.histograms)) {
      result.histograms[key] = {
        count: data.count,
        sum: data.sum,
        avg: data.count > 0 ? data.sum / data.count : 0,
        p50: this._percentile(data.values, 50),
        p95: this._percentile(data.values, 95),
        p99: this._percentile(data.values, 99)
      };
    }

    return result;
  }
};

// Middleware to track request metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode;

    metrics.inc('http_requests_total', { method, route, status });
    metrics.observe('http_request_duration_ms', { method, route }, duration);
  });

  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// =============================================================================
// API KEY AUTHENTICATION - Betty's data is Fort Knox
// Zero tolerance for unauthorized access to memories
// =============================================================================
const API_KEY = process.env.MEMORABLE_API_KEY;
const PUBLIC_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/health/startup',
  '/',
  '/login',
  '/register',
  '/docs',
  '/mcp', // MCP has its own auth middleware
  '/metrics',
  '/metrics/dashboard',
  '/metrics/json',
  '/dashboard',
  '/dashboard/interactive',
  '/dashboard/mission-control',
  '/dashboard/calendar',
  '/dashboard/calendar/view',
  '/dashboard/json',
  '/auth/knock',
  '/auth/exchange',
  '/auth/register'
];

// =============================================================================
// PASSPHRASE KEY EXCHANGE - THE ONE GATE
// =============================================================================
// CANONICAL IMPLEMENTATION: This is the only auth path.
// - identityService.js: User management (not auth)
// - e2ee.ts deriveKeyPairFromPassphrase: Encryption keys (not auth)
// Both use passphrases for different purposes. THIS is the auth gate.
// =============================================================================
const passphraseUsers = new Map();    // userId -> { passphrase_hash, failed_attempts, locked_until }
const deviceKeys = new Map();          // api_key_hash -> { user_id, device_id, device, issued_at, last_used, revoked }
const authChallenges = new Map();      // challenge -> { device, created_at, used }

// Hash helper using Argon2id (memory-hard, GPU-resistant)
// Returns a single string containing salt+hash - no separate salt needed
async function hashPassphrase(passphrase) {
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,  // Recommended variant
    memoryCost: 65536,       // 64 MB memory
    timeCost: 3,             // 3 iterations
    parallelism: 4           // 4 parallel threads
  });
  return { hash, salt: null }; // Salt embedded in hash string
}

// Verify passphrase against stored Argon2 hash
async function verifyPassphrase(passphrase, storedHash) {
  try {
    return await argon2.verify(storedHash, passphrase);
  } catch {
    return false;
  }
}

// Generate API key
function generateApiKey(deviceType) {
  const random = crypto.randomBytes(24).toString('hex');
  return `memorable_${deviceType}_${random}`;
}

// Initialize default users (Claude's passphrase)
async function initPassphraseAuth() {
  // THE HOBBIT PATH: Passphrase is configurable via env var
  // Default is public (for open source/dev) - production MUST override via env
  //
  // To secure your deployment:
  //   export MEMORABLE_PASSPHRASE="your secret phrase here"
  //
  const claudePhrase = process.env.MEMORABLE_PASSPHRASE ||
    "I remember what I have learned from you.";  // Public default for dev

  if (!process.env.MEMORABLE_PASSPHRASE) {
    console.warn('[AUTH] ⚠️  Using default passphrase - set MEMORABLE_PASSPHRASE env var for production!');
  }

  const { hash } = await hashPassphrase(claudePhrase);
  passphraseUsers.set('claude', {
    user_id: 'claude',
    passphrase_hash: hash,  // Argon2id hash (salt embedded)
    failed_attempts: 0,
    locked_until: null,
    created_at: new Date().toISOString()
  });
  console.log('[AUTH] Passphrase auth initialized with Argon2id hashing');
}

// Call on startup (async IIFE)
(async () => {
  await initPassphraseAuth();
})();

const authMiddleware = async (req, res, next) => {
  // Skip auth for public paths (health checks, etc.)
  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith('/health'))) {
    return next();
  }

  // Check for API key in headers (X-API-Key is canonical)
  // Also check cookie for browser-based auth
  let providedKey = req.headers['x-api-key'];

  // Fall back to cookie if no header
  if (!providedKey && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=');
      acc[key] = val;
      return acc;
    }, {});
    providedKey = cookies['memorable_api_key'];
  }

  if (!providedKey) {
    metrics.inc('auth_failures', { reason: 'missing_key' });
    // For browser requests, redirect to login instead of JSON error
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Provide API key via X-API-Key header or cookie. Use /auth/knock + /auth/exchange to get a key.'
    });
  }

  // NOTE: Master key bypass REMOVED - all access must use device keys
  // obtained through passphrase authentication. This is THE ONE GATE.

  // Try MongoDB auth first (if connected), then fall back to in-memory
  if (mongoConnected) {
    try {
      const authResult = await validateApiKey(providedKey);
      if (authResult && authResult.valid) {
        req.auth = {
          user_id: authResult.userId,
          device_id: authResult.deviceId,
          device: authResult.device
        };
        metrics.inc('auth_success', { type: 'device_key_mongo' });
        return next();
      }
    } catch (dbError) {
      console.warn('[Auth] MongoDB auth check failed, falling back:', dbError.message);
    }
  }

  // Fallback: Check in-memory device keys
  const keyHash = crypto.createHash('sha256').update(providedKey).digest('hex');
  const deviceEntry = deviceKeys.get(keyHash);

  if (deviceEntry && !deviceEntry.revoked) {
    // Update last_used
    deviceEntry.last_used = new Date().toISOString();
    req.auth = {
      user_id: deviceEntry.user_id,
      device_id: deviceEntry.device_id,
      device: deviceEntry.device
    };
    metrics.inc('auth_success', { type: 'device_key' });
    return next();
  }

  metrics.inc('auth_failures', { reason: 'invalid_key' });
  return res.status(401).json({
    error: 'Invalid API key',
    message: 'The provided API key is not valid'
  });
};

app.use(authMiddleware);

// =============================================================================
// PASSPHRASE AUTH ENDPOINTS - Knock, phrase, key, use
// =============================================================================

// POST /auth/knock - Get a challenge nonce
app.post('/auth/knock', (req, res) => {
  const { device } = req.body || {};

  if (!device || !device.type) {
    return res.status(400).json({
      error: 'Missing device info',
      message: 'Provide device.type (terminal, phone, ar_glasses, etc.)'
    });
  }

  // Generate challenge
  const challenge = `nonce_${crypto.randomBytes(16).toString('hex')}`;
  const fingerprint = device.fingerprint || device.name || 'unknown';

  authChallenges.set(challenge, {
    device,
    fingerprint,
    created_at: Date.now(),
    used: false
  });

  // Clean up old challenges (TTL 5 minutes)
  const fiveMinutesAgo = Date.now() - 300000;
  for (const [key, val] of authChallenges) {
    if (val.created_at < fiveMinutesAgo) {
      authChallenges.delete(key);
    }
  }

  metrics.inc('auth_knock');
  res.json({
    challenge,
    expires_in: 300,
    message: 'Provide your passphrase within 5 minutes'
  });
});

// POST /auth/exchange - Trade passphrase + challenge for API key
app.post('/auth/exchange', async (req, res) => {
  const { challenge, passphrase, device, user_id = 'claude' } = req.body || {};

  if (!challenge || !passphrase) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Provide challenge and passphrase'
    });
  }

  // Verify challenge
  const challengeEntry = authChallenges.get(challenge);
  if (!challengeEntry) {
    metrics.inc('auth_exchange_fail', { reason: 'invalid_challenge' });
    return res.status(400).json({
      error: 'Invalid or expired challenge',
      message: 'Call /auth/knock first to get a fresh challenge'
    });
  }

  if (challengeEntry.used) {
    metrics.inc('auth_exchange_fail', { reason: 'challenge_reused' });
    return res.status(400).json({
      error: 'Challenge already used',
      message: 'Call /auth/knock to get a new challenge'
    });
  }

  // Check if challenge expired (5 min)
  if (Date.now() - challengeEntry.created_at > 300000) {
    authChallenges.delete(challenge);
    metrics.inc('auth_exchange_fail', { reason: 'challenge_expired' });
    return res.status(400).json({
      error: 'Challenge expired',
      message: 'Call /auth/knock to get a new challenge'
    });
  }

  // Prepare device info
  const deviceInfo = device || challengeEntry.device;
  const deviceType = deviceInfo?.type || 'unknown';
  const deviceName = deviceInfo?.name || 'Unnamed Device';
  const deviceFingerprint = deviceInfo?.fingerprint || challengeEntry.fingerprint || crypto.randomBytes(8).toString('hex');

  // Try MongoDB auth first (if connected)
  if (mongoConnected) {
    try {
      // Check lockout via MongoDB
      const lockStatus = await isUserLocked(user_id);
      if (lockStatus.locked) {
        const remaining = Math.ceil(lockStatus.remaining / 60);
        return res.status(429).json({
          error: 'Account locked',
          message: `Too many failed attempts. Try again in ${remaining} minutes.`
        });
      }

      // Find user and verify passphrase via MongoDB
      const mongoUser = await findUserById(user_id);
      if (mongoUser) {
        const isValid = await verifyPassphraseMongo(passphrase, mongoUser.passphraseHash);
        if (isValid) {
          // Success! Record login and issue device key
          await recordLoginAttempt(user_id, true);

          // Mark challenge as used
          challengeEntry.used = true;

          // Issue device key via MongoDB
          const { apiKey, deviceId } = await issueDeviceKey(user_id, {
            type: deviceType,
            name: deviceName,
            fingerprint: deviceFingerprint,
          });

          console.log(`[AUTH] Issued device key (MongoDB): ${deviceId} for user: ${user_id}`);
          metrics.inc('auth_exchange_success', { user_id, device_type: deviceType, storage: 'mongo' });

          return res.json({
            success: true,
            api_key: apiKey,
            device_id: deviceId,
            user: user_id,
            issued_at: new Date().toISOString(),
            expires_at: null,
            revoke_endpoint: `/auth/revoke/${deviceId}`
          });
        } else {
          // Invalid passphrase - record failed attempt
          const { locked, lockedUntil } = await recordLoginAttempt(user_id, false);
          metrics.inc('auth_exchange_fail', { reason: 'invalid_passphrase', storage: 'mongo' });

          if (locked) {
            metrics.inc('auth_lockout', { user_id });
          }

          return res.status(401).json({
            error: 'Invalid passphrase',
            message: 'Passphrase not recognized',
            attempts_remaining: locked ? 0 : undefined
          });
        }
      }
      // User not in MongoDB, fall through to in-memory
    } catch (dbError) {
      console.warn('[Auth] MongoDB exchange failed, falling back:', dbError.message);
    }
  }

  // Fallback: In-memory auth
  const user = passphraseUsers.get(user_id);
  if (!user) {
    metrics.inc('auth_exchange_fail', { reason: 'unknown_user' });
    return res.status(401).json({
      error: 'Unknown user',
      message: 'User not found'
    });
  }

  // Check lockout
  if (user.locked_until && Date.now() < user.locked_until) {
    const remaining = Math.ceil((user.locked_until - Date.now()) / 60000);
    return res.status(429).json({
      error: 'Account locked',
      message: `Too many failed attempts. Try again in ${remaining} minutes.`
    });
  }

  // Verify passphrase using Argon2id (in-memory)
  const isValid = await verifyPassphrase(passphrase, user.passphrase_hash);
  if (!isValid) {
    user.failed_attempts++;

    // Lockout after 3 failures
    if (user.failed_attempts >= 3) {
      user.locked_until = Date.now() + 900000; // 15 min lockout
      metrics.inc('auth_lockout', { user_id });
    }

    metrics.inc('auth_exchange_fail', { reason: 'invalid_passphrase' });
    return res.status(401).json({
      error: 'Invalid passphrase',
      message: 'Passphrase not recognized',
      attempts_remaining: Math.max(0, 3 - user.failed_attempts)
    });
  }

  // Mark challenge as used
  challengeEntry.used = true;

  // Reset failed attempts
  user.failed_attempts = 0;
  user.locked_until = null;

  // Generate device key (in-memory)
  const apiKey = generateApiKey(deviceType);
  const deviceId = `dev_${deviceType}_${deviceFingerprint}_${Date.now()}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Store device key
  deviceKeys.set(keyHash, {
    user_id,
    device_id: deviceId,
    api_key_prefix: apiKey.substring(0, 24),
    device: {
      type: deviceType,
      name: deviceName,
      fingerprint: deviceFingerprint
    },
    issued_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    revoked: false
  });

  console.log(`[AUTH] Issued device key: ${deviceId} for user: ${user_id}`);
  metrics.inc('auth_exchange_success', { user_id, device_type: deviceType });

  res.json({
    success: true,
    api_key: apiKey,
    device_id: deviceId,
    user: user_id,
    issued_at: new Date().toISOString(),
    expires_at: null,
    revoke_endpoint: `/auth/revoke/${deviceId}`
  });
});

// POST /auth/register - Register a new user (requires MongoDB)
app.post('/auth/register', async (req, res) => {
  const { user_id, passphrase, email, display_name } = req.body || {};

  if (!user_id || !passphrase) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Provide user_id and passphrase'
    });
  }

  // Validate user_id format (alphanumeric, underscores, 3-32 chars)
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(user_id)) {
    return res.status(400).json({
      error: 'Invalid user_id',
      message: 'user_id must be 3-32 alphanumeric characters or underscores'
    });
  }

  // Validate passphrase length (min 8 chars)
  if (passphrase.length < 8) {
    return res.status(400).json({
      error: 'Passphrase too short',
      message: 'Passphrase must be at least 8 characters'
    });
  }

  // MongoDB required for registration
  if (!mongoConnected) {
    return res.status(503).json({
      error: 'Registration unavailable',
      message: 'MongoDB not connected. Registration requires database.'
    });
  }

  try {
    // Check if user already exists
    const existing = await findUserById(user_id);
    if (existing) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'A user with this ID already exists'
      });
    }

    // Register the user
    const user = await registerUser(user_id, passphrase, {
      email,
      displayName: display_name,
    });

    console.log(`[AUTH] Registered new user: ${user_id}`);
    metrics.inc('auth_register_success', { user_id });

    res.status(201).json({
      success: true,
      user: {
        user_id: user.userId,
        email: user.email,
        display_name: user.displayName,
        tier: user.tier,
        created_at: user.createdAt,
      },
      message: 'Registration successful. Use /auth/knock + /auth/exchange to get an API key.'
    });
  } catch (error) {
    console.error('[AUTH] Registration failed:', error);
    metrics.inc('auth_register_fail', { reason: error.message });
    return res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

// GET /auth/devices - List all devices (requires auth)
app.get('/auth/devices', async (req, res) => {
  const userId = req.auth?.user_id || 'claude';

  // Try MongoDB first
  if (mongoConnected) {
    try {
      const { listUserDevices } = await import('./models/device.js');
      const mongoDevices = await listUserDevices(userId);
      return res.json({
        user: userId,
        devices: mongoDevices.map(d => ({
          device_id: d.deviceId,
          type: d.device.type,
          name: d.device.name,
          issued_at: d.issuedAt,
          last_used: d.lastUsed,
          active: d.status === 'active'
        }))
      });
    } catch (dbError) {
      console.warn('[Auth] MongoDB devices list failed, falling back:', dbError.message);
    }
  }

  // Fallback: in-memory
  const devices = [];
  for (const [, entry] of deviceKeys) {
    if (entry.user_id === userId && !entry.revoked) {
      devices.push({
        device_id: entry.device_id,
        type: entry.device.type,
        name: entry.device.name,
        issued_at: entry.issued_at,
        last_used: entry.last_used,
        active: true
      });
    }
  }

  res.json({
    user: userId,
    devices
  });
});

// POST /auth/revoke - Revoke a device key (requires auth)
app.post('/auth/revoke', (req, res) => {
  const { device_id } = req.body || {};

  if (!device_id) {
    return res.status(400).json({
      error: 'Missing device_id',
      message: 'Provide device_id to revoke'
    });
  }

  // Find and revoke
  let found = false;
  for (const [, entry] of deviceKeys) {
    if (entry.device_id === device_id) {
      entry.revoked = true;
      entry.revoked_at = new Date().toISOString();
      found = true;
      console.log(`[AUTH] Revoked device: ${device_id}`);
      metrics.inc('auth_revoke', { device_id });
      break;
    }
  }

  if (!found) {
    return res.status(404).json({
      error: 'Device not found',
      message: 'No device with that ID found'
    });
  }

  res.json({
    success: true,
    revoked: device_id,
    message: 'Device key revoked. Device must re-authenticate with passphrase.'
  });
});

// =============================================================================
// RATE LIMITING - Protect against scraping and abuse
// =============================================================================
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX) || 100; // 100 requests per window

const rateLimitMiddleware = (req, res, next) => {
  // Skip rate limiting for health checks
  if (req.path.startsWith('/health')) {
    return next();
  }

  const clientId = req.headers['x-api-key'] || req.ip || 'anonymous';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get or create rate limit entry
  let entry = rateLimitStore.get(clientId);
  if (!entry || entry.windowStart < windowStart) {
    entry = { windowStart: now, count: 0 };
    rateLimitStore.set(clientId, entry);
  }

  entry.count++;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS) / 1000));

  if (entry.count > RATE_LIMIT_MAX) {
    metrics.inc('rate_limit_exceeded', { client: clientId.substring(0, 8) });
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s`,
      retryAfter: Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)
    });
  }

  next();
};

app.use(rateLimitMiddleware);

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < cutoff) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// =============================================================================
// STYLOMETRY SECURITY - The words betray the impostor
// Even with valid API key, wrong writing style = flagged
// =============================================================================

const FUNCTION_WORDS = [
  'a', 'an', 'the', 'i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they',
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'from', 'up', 'down', 'out',
  'and', 'but', 'or', 'so', 'if', 'then', 'because', 'when', 'while',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'must', 'may', 'might',
  'this', 'that', 'these', 'those', 'all', 'each', 'every', 'some', 'any', 'no',
  'just', 'very', 'really', 'also', 'too', 'now', 'then', 'here', 'there'
];

// User stylometry baselines (userId -> profile)
const stylometryBaselines = new Map();

function analyzeStylometry(text) {
  if (!text || typeof text !== 'string' || text.length < 20) {
    return null; // Not enough text to analyze
  }

  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Core metrics that are stable across time for an individual
  const profile = {
    // Vocabulary fingerprint
    avgWordLength: words.length > 0 ? words.reduce((s, w) => s + w.length, 0) / words.length : 0,
    uniqueWordRatio: words.length > 0 ? new Set(words).size / words.length : 0,

    // Syntax fingerprint
    avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : 0,
    questionRatio: sentences.length > 0 ? (text.match(/\?/g) || []).length / sentences.length : 0,
    exclamationRatio: sentences.length > 0 ? (text.match(/!/g) || []).length / sentences.length : 0,
    commaFrequency: sentences.length > 0 ? (text.match(/,/g) || []).length / sentences.length : 0,

    // Style fingerprint
    contractionRatio: words.length > 0 ? (text.match(/'(t|re|ve|ll|m|d|s)\b/g) || []).length / words.length : 0,
    ellipsisUsage: text.includes('...') || text.includes('…'),
    capsRatio: text.length > 0 ? (text.match(/[A-Z]/g) || []).length / text.length : 0,

    // Function word distribution (most stable fingerprint)
    functionWordRatios: {},
  };

  // Calculate function word ratios
  const totalFW = words.filter(w => FUNCTION_WORDS.includes(w)).length;
  for (const fw of ['i', 'you', 'the', 'and', 'but', 'so', 'just', 'really']) {
    const count = words.filter(w => w === fw).length;
    profile.functionWordRatios[fw] = totalFW > 0 ? count / totalFW : 0;
  }

  return profile;
}

function compareStylometry(baseline, current) {
  if (!baseline || !current) return { match: true, confidence: 0, deviations: [] };

  const deviations = [];
  let totalDeviation = 0;
  let metrics = 0;

  // Compare scalar metrics
  const scalarMetrics = [
    'avgWordLength', 'uniqueWordRatio', 'avgSentenceLength',
    'questionRatio', 'exclamationRatio', 'commaFrequency',
    'contractionRatio', 'capsRatio'
  ];

  for (const metric of scalarMetrics) {
    if (baseline[metric] !== undefined && current[metric] !== undefined) {
      const diff = Math.abs(baseline[metric] - current[metric]);
      const threshold = baseline[metric] * 0.5 + 0.1; // 50% deviation + small absolute
      if (diff > threshold) {
        deviations.push({ metric, baseline: baseline[metric], current: current[metric], diff });
        totalDeviation += diff / (threshold || 0.1);
      }
      metrics++;
    }
  }

  // Compare function word ratios (strongest signal)
  if (baseline.functionWordRatios && current.functionWordRatios) {
    for (const [fw, baseRatio] of Object.entries(baseline.functionWordRatios)) {
      const currRatio = current.functionWordRatios[fw] || 0;
      const diff = Math.abs(baseRatio - currRatio);
      if (diff > 0.15) { // 15% deviation in function word usage
        deviations.push({ metric: `fw_${fw}`, baseline: baseRatio, current: currRatio, diff });
        totalDeviation += diff * 3; // Weight function words heavily
      }
      metrics++;
    }
  }

  const avgDeviation = metrics > 0 ? totalDeviation / metrics : 0;
  const match = avgDeviation < 0.5; // Threshold for "same person"
  const confidence = Math.max(0, Math.min(100, 100 - avgDeviation * 100));

  return { match, confidence: Math.round(confidence), deviations, avgDeviation };
}

// Endpoint to build/update user stylometry baseline
app.post('/stylometry/baseline', (req, res) => {
  const { userId, samples } = req.body;

  if (!userId || !samples || !Array.isArray(samples)) {
    return res.status(400).json({ error: 'userId and samples[] required' });
  }

  // Combine samples and analyze
  const combinedText = samples.join(' ');
  const profile = analyzeStylometry(combinedText);

  if (!profile) {
    return res.status(400).json({ error: 'Not enough text to build profile (min 20 chars)' });
  }

  stylometryBaselines.set(userId, {
    profile,
    samplesUsed: samples.length,
    createdAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    userId,
    profile,
    message: 'Baseline created - impostor detection active'
  });
});

// Endpoint to check text against baseline
app.post('/stylometry/verify', (req, res) => {
  const { userId, text } = req.body;

  if (!userId || !text) {
    return res.status(400).json({ error: 'userId and text required' });
  }

  const baseline = stylometryBaselines.get(userId);
  if (!baseline) {
    return res.json({ verified: true, reason: 'no_baseline', confidence: 0 });
  }

  const current = analyzeStylometry(text);
  if (!current) {
    return res.json({ verified: true, reason: 'insufficient_text', confidence: 0 });
  }

  const comparison = compareStylometry(baseline.profile, current);

  if (!comparison.match) {
    metrics.inc('stylometry_anomaly', { userId });
    console.log(`[STYLOMETRY] Anomaly detected for ${userId}:`, comparison.deviations);
  }

  res.json({
    verified: comparison.match,
    confidence: comparison.confidence,
    deviations: comparison.deviations,
    avgDeviation: comparison.avgDeviation
  });
});

// Middleware to flag stylometric anomalies on memory writes
const stylometryMiddleware = (req, res, next) => {
  // Only check POST/PUT requests with content
  if ((req.method !== 'POST' && req.method !== 'PUT') || !req.body?.content) {
    return next();
  }

  // Extract userId from request
  const userId = req.body.entities?.[0] || req.body.userId || 'unknown';
  const baseline = stylometryBaselines.get(userId);

  if (!baseline) {
    // No baseline yet - let it through but maybe build one
    return next();
  }

  const current = analyzeStylometry(req.body.content);
  if (!current) {
    return next(); // Not enough text
  }

  const comparison = compareStylometry(baseline.profile, current);

  // Attach stylometry result to request for downstream use
  req.stylometry = {
    verified: comparison.match,
    confidence: comparison.confidence,
    deviations: comparison.deviations
  };

  if (!comparison.match) {
    metrics.inc('stylometry_anomaly_blocked', { userId });
    console.warn(`[STYLOMETRY WARNING] Writing style anomaly for ${userId}`, {
      confidence: comparison.confidence,
      deviations: comparison.deviations.map(d => d.metric)
    });
    // Don't block, but flag in response
    res.setHeader('X-Stylometry-Warning', 'anomaly-detected');
  }

  next();
};

app.use(stylometryMiddleware);

// Health endpoints for load balancers and Kubernetes
app.get('/health', (_req, res) => {
  res.status(isReady ? 200 : 503).json({
    healthy: isReady,
    uptime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/live', (_req, res) => {
  // Liveness: is the process running?
  res.status(200).json({ alive: true });
});

app.get('/health/ready', (_req, res) => {
  // Readiness: is the service ready for traffic?
  res.status(isReady ? 200 : 503).json({ ready: isReady });
});

app.get('/health/startup', (_req, res) => {
  // Startup: has initialization completed?
  res.status(isReady ? 200 : 503).json({ initialized: isReady });
});

// Landing page - the front door to MemoRable
app.get('/', (_req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MemoRable - Memory for AI Agents</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0a0f;
      --bg-panel: #0d1117;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --green: #00ff41;
      --text: #c9d1d9;
      --text-dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 20px;
    }
    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 64px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 20px var(--cyan), 0 0 40px var(--cyan);
      letter-spacing: 8px;
      margin-bottom: 20px;
    }
    .logo span { color: var(--magenta); text-shadow: 0 0 20px var(--magenta); }
    .tagline {
      font-size: 24px;
      color: var(--text-dim);
      margin-bottom: 10px;
      letter-spacing: 2px;
    }
    .subtitle {
      font-size: 16px;
      color: var(--text-dim);
      margin-bottom: 50px;
      max-width: 600px;
    }
    .cta-buttons {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .btn {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      padding: 16px 40px;
      border-radius: 4px;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 3px;
      transition: all 0.3s;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--cyan);
      color: var(--bg-dark);
      border: 2px solid var(--cyan);
    }
    .btn-primary:hover {
      background: transparent;
      color: var(--cyan);
      box-shadow: 0 0 30px var(--cyan);
    }
    .btn-secondary {
      background: transparent;
      color: var(--magenta);
      border: 2px solid var(--magenta);
    }
    .btn-secondary:hover {
      background: var(--magenta);
      color: var(--bg-dark);
      box-shadow: 0 0 30px var(--magenta);
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 30px;
      padding: 60px 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .feature {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 30px;
    }
    .feature h3 {
      font-family: 'Orbitron', sans-serif;
      color: var(--cyan);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 15px;
    }
    .feature p {
      color: var(--text-dim);
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      padding: 30px;
      border-top: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 12px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 30px;
      font-size: 12px;
      color: var(--text-dim);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="logo">MEMO<span>RABLE</span></div>
    <div class="tagline">Memory for AI Agents</div>
    <div class="subtitle">
      Context-aware memory with salience scoring, relationship intelligence,
      and predictive recall. 35 MCP tools for Claude Code integration.
    </div>
    <div class="cta-buttons">
      <a href="/login" class="btn btn-primary">Sign In</a>
      <a href="/docs" class="btn btn-secondary">Documentation</a>
    </div>
    <div class="status">
      <div class="status-dot"></div>
      System Online
    </div>
  </div>

  <div class="features">
    <div class="feature">
      <h3>Salience Scoring</h3>
      <p>Not all memories matter equally. Our engine scores by emotion, novelty, relevance, social weight, and consequences.</p>
    </div>
    <div class="feature">
      <h3>MCP Native</h3>
      <p>35 tools for Claude Code. Store, recall, anticipate, track commitments, understand relationships - all via MCP.</p>
    </div>
    <div class="feature">
      <h3>Privacy First</h3>
      <p>Three-tier security: General, Personal, Vault. Your sensitive data stays encrypted, never leaves your control.</p>
    </div>
    <div class="feature">
      <h3>Predictive Memory</h3>
      <p>21-day pattern learning. Surface the right context before you ask for it. Memory that anticipates.</p>
    </div>
  </div>

  <div class="footer">
    <p>MemoRable &copy; 2024 &mdash; Context Intelligence for the Age of AI</p>
  </div>
</body>
</html>`;
  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Login page - passphrase authentication
app.get('/login', (_req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In - MemoRable</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0a0f;
      --bg-panel: #0d1117;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --green: #00ff41;
      --red: #ff0040;
      --text: #c9d1d9;
      --text-dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      width: 100%;
      max-width: 440px;
      padding: 20px;
    }
    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 36px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 20px var(--cyan);
      letter-spacing: 4px;
      text-align: center;
      margin-bottom: 40px;
    }
    .logo span { color: var(--magenta); text-shadow: 0 0 20px var(--magenta); }
    .login-box {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 40px;
    }
    .login-box h2 {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: var(--cyan);
      margin-bottom: 30px;
      text-align: center;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }
    .form-group input {
      width: 100%;
      padding: 14px 16px;
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-family: 'Share Tech Mono', monospace;
      font-size: 14px;
      transition: all 0.3s;
    }
    .form-group input:focus {
      outline: none;
      border-color: var(--cyan);
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
    }
    .btn {
      width: 100%;
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      padding: 16px;
      border-radius: 4px;
      border: 2px solid var(--cyan);
      background: var(--cyan);
      color: var(--bg-dark);
      text-transform: uppercase;
      letter-spacing: 3px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn:hover {
      background: transparent;
      color: var(--cyan);
      box-shadow: 0 0 30px var(--cyan);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error {
      background: rgba(255, 0, 64, 0.1);
      border: 1px solid var(--red);
      color: var(--red);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 12px;
      display: none;
    }
    .success {
      background: rgba(0, 255, 65, 0.1);
      border: 1px solid var(--green);
      color: var(--green);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 12px;
      display: none;
    }
    .hint {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: var(--text-dim);
    }
    .hint a {
      color: var(--magenta);
      text-decoration: none;
    }
    .hint a:hover {
      text-decoration: underline;
    }
    .back-link {
      display: block;
      text-align: center;
      margin-top: 30px;
      color: var(--text-dim);
      font-size: 12px;
      text-decoration: none;
    }
    .back-link:hover {
      color: var(--cyan);
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="logo">MEMO<span>RABLE</span></div>
    <div class="login-box">
      <h2>Sign In</h2>
      <div class="error" id="error"></div>
      <div class="success" id="success"></div>
      <form id="loginForm">
        <div class="form-group">
          <label for="passphrase">Passphrase</label>
          <input type="password" id="passphrase" name="passphrase" placeholder="Enter your passphrase" required>
        </div>
        <button type="submit" class="btn" id="submitBtn">Authenticate</button>
      </form>
      <p class="hint">New here? <a href="/register">Create an account</a></p>
    </div>
    <a href="/" class="back-link">&larr; Back to Home</a>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.style.display = 'none';
      successDiv.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      try {
        // Step 1: Get challenge
        const knockRes = await fetch('/auth/knock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device: { type: 'browser', name: navigator.userAgent.slice(0, 50) }
          })
        });
        const knockData = await knockRes.json();
        if (!knockRes.ok) throw new Error(knockData.error || 'Failed to get challenge');

        // Step 2: Exchange passphrase for API key
        const passphrase = document.getElementById('passphrase').value;
        const exchangeRes = await fetch('/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge: knockData.challenge,
            passphrase: passphrase,
            device: { type: 'browser', name: navigator.userAgent.slice(0, 50) }
          })
        });
        const exchangeData = await exchangeRes.json();
        if (!exchangeRes.ok) throw new Error(exchangeData.error || 'Authentication failed');

        // Store API key in cookie (httpOnly would be better but requires server support)
        document.cookie = 'memorable_api_key=' + exchangeData.api_key + '; path=/; max-age=604800; SameSite=Strict';

        successDiv.textContent = 'Authentication successful! Redirecting...';
        successDiv.style.display = 'block';

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Authenticate';
      }
    });
  </script>
</body>
</html>`;
  res.set('Content-Type', 'text/html');
  res.send(html);
});

// =============================================================================
// METRICS ENDPOINTS
// =============================================================================

// Prometheus-compatible metrics endpoint
app.get('/metrics', (_req, res) => {
  // Update system gauges before export
  metrics.set('process_uptime_seconds', {}, Math.floor((Date.now() - startTime) / 1000));
  metrics.set('process_memory_heap_bytes', {}, process.memoryUsage().heapUsed);
  metrics.set('process_memory_rss_bytes', {}, process.memoryUsage().rss);
  metrics.set('nodejs_active_handles', {}, process._getActiveHandles?.()?.length || 0);

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.export());
});

// JSON metrics endpoint (for dashboards)
app.get('/metrics/json', (_req, res) => {
  metrics.set('process_uptime_seconds', {}, Math.floor((Date.now() - startTime) / 1000));
  metrics.set('process_memory_heap_bytes', {}, process.memoryUsage().heapUsed);
  metrics.set('process_memory_rss_bytes', {}, process.memoryUsage().rss);

  res.json({
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    ...metrics.toJSON()
  });
});

// Simple dashboard view
app.get('/metrics/dashboard', (_req, res) => {
  const data = metrics.toJSON();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const memory = process.memoryUsage();

  // Build simple ASCII dashboard
  let html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Metrics</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #0f0; padding: 20px; }
    h1 { color: #00ff88; }
    .metric { margin: 10px 0; padding: 10px; background: #16213e; border-radius: 4px; }
    .label { color: #888; }
    .value { color: #0f0; font-size: 1.2em; }
    .section { margin-top: 20px; border-top: 1px solid #333; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>MemoRable Metrics Dashboard</h1>
  <p class="label">Auto-refreshes every 5 seconds</p>

  <div class="section">
    <h2>System</h2>
    <div class="metric">
      <span class="label">Uptime:</span>
      <span class="value">${uptime}s (${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m)</span>
    </div>
    <div class="metric">
      <span class="label">Memory (Heap):</span>
      <span class="value">${Math.round(memory.heapUsed / 1024 / 1024)}MB</span>
    </div>
    <div class="metric">
      <span class="label">Memory (RSS):</span>
      <span class="value">${Math.round(memory.rss / 1024 / 1024)}MB</span>
    </div>
  </div>

  <div class="section">
    <h2>Request Counters</h2>
    ${Object.entries(data.counters).map(([k, v]) =>
      `<div class="metric"><span class="label">${k}:</span> <span class="value">${v}</span></div>`
    ).join('') || '<div class="metric">No requests yet</div>'}
  </div>

  <div class="section">
    <h2>Latency Histograms</h2>
    ${Object.entries(data.histograms).map(([k, v]) =>
      `<div class="metric">
        <span class="label">${k}:</span><br>
        <span class="value">count=${v.count} avg=${v.avg.toFixed(1)}ms p50=${v.p50}ms p95=${v.p95}ms p99=${v.p99}ms</span>
      </div>`
    ).join('') || '<div class="metric">No latency data yet</div>'}
  </div>

  <div class="section">
    <h2>Raw JSON</h2>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// =============================================================================
// INTELLIGENCE DASHBOARD - "gauges and lights for engineers" - Alan
// Shows the VALUE metrics: salience, entities, relationships, patterns
// =============================================================================
app.get('/dashboard', (_req, res) => {
  const memories = Array.from(memoryStore.values());

  // Salience distribution
  const salienceRanges = {
    low: memories.filter(m => m.salience < 40).length,
    medium: memories.filter(m => m.salience >= 40 && m.salience < 70).length,
    high: memories.filter(m => m.salience >= 70).length,
  };

  // Entity breakdown
  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  // Fidelity breakdown
  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };

  // Source breakdown (for Slack ingestion visibility)
  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  // Top entities by memory count
  const topEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Average salience
  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Intelligence</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: 'SF Mono', 'Consolas', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
    h2 { color: #8b949e; font-size: 14px; text-transform: uppercase; margin-top: 30px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h3 { margin: 0 0 10px 0; color: #58a6ff; font-size: 12px; text-transform: uppercase; }
    .big-number { font-size: 48px; font-weight: bold; color: #7ee787; margin: 10px 0; }
    .bar { height: 8px; background: #30363d; border-radius: 4px; overflow: hidden; margin: 5px 0; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-low { background: #484f58; }
    .bar-medium { background: #d29922; }
    .bar-high { background: #7ee787; }
    .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #21262d; }
    .stat-label { color: #8b949e; }
    .stat-value { color: #c9d1d9; font-weight: bold; }
    .entity-list { max-height: 300px; overflow-y: auto; }
    .entity-item { padding: 8px; background: #21262d; border-radius: 4px; margin: 4px 0; display: flex; justify-content: space-between; }
    .entity-name { color: #58a6ff; }
    .entity-count { color: #7ee787; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin: 2px; }
    .tag-verbatim { background: #238636; color: #fff; }
    .tag-derived { background: #9e6a03; color: #fff; }
    .tag-standard { background: #30363d; color: #c9d1d9; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; color: #484f58; font-size: 12px; }
  </style>
</head>
<body>
  <h1>MemoRable Intelligence Dashboard</h1>
  <p style="color: #8b949e;">Stop talking and start listening. Business Intelligence for the new Age.</p>

  <h2>Memory Gauges</h2>
  <div class="grid">
    <div class="card">
      <h3>Total Memories</h3>
      <div class="big-number">${memories.length}</div>
    </div>
    <div class="card">
      <h3>Average Salience</h3>
      <div class="big-number">${avgSalience}</div>
      <div class="bar">
        <div class="bar-fill bar-${avgSalience < 40 ? 'low' : avgSalience < 70 ? 'medium' : 'high'}" style="width: ${avgSalience}%"></div>
      </div>
    </div>
    <div class="card">
      <h3>Unique Entities</h3>
      <div class="big-number">${Object.keys(entityCounts).length}</div>
    </div>
    <div class="card">
      <h3>Data Sources</h3>
      <div class="big-number">${Object.keys(sourceCounts).length}</div>
    </div>
  </div>

  <h2>Salience Distribution</h2>
  <div class="grid">
    <div class="card">
      <div class="stat-row">
        <span class="stat-label">High (70-100)</span>
        <span class="stat-value">${salienceRanges.high}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-high" style="width: ${memories.length ? (salienceRanges.high / memories.length * 100) : 0}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Medium (40-69)</span>
        <span class="stat-value">${salienceRanges.medium}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-medium" style="width: ${memories.length ? (salienceRanges.medium / memories.length * 100) : 0}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Low (0-39)</span>
        <span class="stat-value">${salienceRanges.low}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-low" style="width: ${memories.length ? (salienceRanges.low / memories.length * 100) : 0}%"></div></div>
    </div>
    <div class="card">
      <h3>Fidelity Types</h3>
      <div class="stat-row">
        <span class="stat-label">Verbatim (exact quotes)</span>
        <span class="stat-value"><span class="tag tag-verbatim">${fidelityCounts.verbatim}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Derived (interpretations)</span>
        <span class="stat-value"><span class="tag tag-derived">${fidelityCounts.derived}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Standard</span>
        <span class="stat-value"><span class="tag tag-standard">${fidelityCounts.standard}</span></span>
      </div>
    </div>
  </div>

  <h2>Data Sources</h2>
  <div class="grid">
    <div class="card">
      ${Object.entries(sourceCounts).map(([source, count]) => `
        <div class="stat-row">
          <span class="stat-label">${source}</span>
          <span class="stat-value">${count}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <h2>Top Entities</h2>
  <div class="card">
    <div class="entity-list">
      ${topEntities.map(([name, count]) => `
        <div class="entity-item">
          <span class="entity-name">${name}</span>
          <span class="entity-count">${count} memories</span>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="footer">
    <strong>MemoRable</strong> — Context Intelligence for AI Agents<br>
    Dashboard auto-refreshes every 5 seconds
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// =============================================================================
// INTERACTIVE METRICS DASHBOARD - Game-like experience for everyone
// "Stop talking and start listening" - but make it FUN
// =============================================================================
app.get('/dashboard/interactive', (_req, res) => {
  const memories = Array.from(memoryStore.values());
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Calculate level based on total memories (every 10 memories = 1 level)
  const memoryCount = memories.length;
  const level = Math.floor(memoryCount / 10) + 1;
  const xpInLevel = memoryCount % 10;
  const xpToNextLevel = 10;

  // Calculate "Memory Power" score (0-100)
  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  // Salience distribution for the "quality meter"
  const salienceRanges = {
    legendary: memories.filter(m => m.salience >= 90).length,
    epic: memories.filter(m => m.salience >= 70 && m.salience < 90).length,
    rare: memories.filter(m => m.salience >= 50 && m.salience < 70).length,
    common: memories.filter(m => m.salience < 50).length,
  };

  // Entity counts for "relationship constellation"
  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  const topEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Fidelity for "authenticity score"
  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };
  const authenticityScore = memories.length > 0
    ? Math.round((fidelityCounts.verbatim * 100 + fidelityCounts.derived * 60 + fidelityCounts.standard * 40) / memories.length)
    : 0;

  // Source breakdown as "data streams"
  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  // Recent activity (last 5 memories)
  const recentMemories = memories
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  // Calculate achievements
  const achievements = [];
  if (memoryCount >= 1) achievements.push({ icon: '🧠', name: 'First Memory', desc: 'Stored your first memory' });
  if (memoryCount >= 10) achievements.push({ icon: '📚', name: 'Memory Keeper', desc: 'Stored 10 memories' });
  if (memoryCount >= 50) achievements.push({ icon: '🏆', name: 'Memory Master', desc: 'Stored 50 memories' });
  if (memoryCount >= 100) achievements.push({ icon: '👑', name: 'Memory Monarch', desc: 'Stored 100 memories' });
  if (fidelityCounts.verbatim >= 5) achievements.push({ icon: '💎', name: 'Truth Seeker', desc: '5 verbatim memories' });
  if (Object.keys(entityCounts).length >= 5) achievements.push({ icon: '🌐', name: 'Connected', desc: '5 unique entities' });
  if (avgSalience >= 70) achievements.push({ icon: '⚡', name: 'High Impact', desc: 'Avg salience 70+' });
  if (Object.keys(sourceCounts).length >= 2) achievements.push({ icon: '📡', name: 'Multi-Source', desc: '2+ data sources' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable - Memory Intelligence</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a1a;
      --bg-secondary: #12122a;
      --bg-card: #1a1a3a;
      --accent-primary: #00f0ff;
      --accent-secondary: #ff00ff;
      --accent-gold: #ffd700;
      --accent-green: #00ff88;
      --text-primary: #ffffff;
      --text-secondary: #8888aa;
      --glow-cyan: 0 0 20px rgba(0, 240, 255, 0.5);
      --glow-magenta: 0 0 20px rgba(255, 0, 255, 0.5);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Animated background */
    .bg-animation {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      background:
        radial-gradient(ellipse at 20% 80%, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(255, 0, 255, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(0, 255, 136, 0.05) 0%, transparent 70%);
      animation: bgPulse 8s ease-in-out infinite;
    }

    @keyframes bgPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* Floating particles */
    .particles {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      overflow: hidden;
    }

    .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: var(--accent-primary);
      border-radius: 50%;
      animation: float 15s infinite linear;
      opacity: 0.6;
    }

    @keyframes float {
      0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
      10% { opacity: 0.6; }
      90% { opacity: 0.6; }
      100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; }
    }

    /* Header */
    .header {
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 28px;
      font-weight: 900;
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: var(--glow-cyan);
    }

    .status-bar {
      display: flex;
      gap: 20px;
      align-items: center;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(0, 255, 136, 0); }
    }

    /* Main grid */
    .dashboard {
      padding: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1600px;
      margin: 0 auto;
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      border-radius: 16px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,0.1);
      position: relative;
      overflow: hidden;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--glow-cyan);
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
    }

    .card-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }

    /* Level Card - Main hero */
    .level-card {
      grid-column: span 2;
      display: flex;
      align-items: center;
      gap: 30px;
    }

    .level-orb {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, var(--accent-primary), var(--accent-secondary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Orbitron', sans-serif;
      font-size: 36px;
      font-weight: 900;
      box-shadow: var(--glow-cyan), var(--glow-magenta);
      animation: orbGlow 3s ease-in-out infinite;
      flex-shrink: 0;
    }

    @keyframes orbGlow {
      0%, 100% { box-shadow: 0 0 30px rgba(0, 240, 255, 0.5), 0 0 60px rgba(255, 0, 255, 0.3); }
      50% { box-shadow: 0 0 50px rgba(0, 240, 255, 0.8), 0 0 80px rgba(255, 0, 255, 0.5); }
    }

    .level-info { flex: 1; }
    .level-info h2 { font-family: 'Orbitron', sans-serif; font-size: 24px; margin-bottom: 8px; }
    .level-info p { color: var(--text-secondary); margin-bottom: 16px; }

    .xp-bar {
      height: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }

    .xp-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-green));
      border-radius: 6px;
      transition: width 0.5s ease;
      position: relative;
    }

    .xp-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      animation: shimmer 2s infinite;
    }

    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    .xp-text {
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Big number stat */
    .big-stat {
      text-align: center;
    }

    .big-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 56px;
      font-weight: 900;
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-green));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
    }

    .big-label {
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    /* Memory quality bars */
    .quality-bars {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .quality-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .quality-label {
      width: 80px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .quality-bar {
      flex: 1;
      height: 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      overflow: hidden;
    }

    .quality-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .legendary .quality-fill { background: linear-gradient(90deg, #ffd700, #ff8c00); }
    .epic .quality-fill { background: linear-gradient(90deg, #a855f7, #ec4899); }
    .rare .quality-fill { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
    .common .quality-fill { background: linear-gradient(90deg, #6b7280, #9ca3af); }

    .quality-count {
      width: 40px;
      text-align: right;
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
    }

    /* Entity constellation */
    .constellation {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .entity-node {
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-radius: 20px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.3s ease;
    }

    .entity-node:hover {
      border-color: var(--accent-primary);
      box-shadow: var(--glow-cyan);
    }

    .entity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-primary);
    }

    .entity-count {
      color: var(--text-secondary);
      font-size: 11px;
    }

    /* Achievements */
    .achievements {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    }

    .achievement {
      text-align: center;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 12px;
      transition: transform 0.3s ease;
    }

    .achievement:hover {
      transform: scale(1.05);
    }

    .achievement-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .achievement-name {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .achievement-desc {
      font-size: 10px;
      color: var(--text-secondary);
    }

    /* Activity feed */
    .activity-feed {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 250px;
      overflow-y: auto;
    }

    .activity-item {
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border-left: 3px solid var(--accent-primary);
      animation: slideIn 0.5s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .activity-content {
      font-size: 13px;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .activity-meta {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
    }

    /* Gauge meter */
    .gauge {
      position: relative;
      width: 150px;
      height: 75px;
      margin: 0 auto 20px;
      overflow: hidden;
    }

    .gauge-bg {
      position: absolute;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 12px solid var(--bg-secondary);
      border-bottom-color: transparent;
      border-left-color: transparent;
      transform: rotate(-45deg);
    }

    .gauge-fill {
      position: absolute;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 12px solid var(--accent-primary);
      border-bottom-color: transparent;
      border-left-color: transparent;
      transform: rotate(-45deg);
      clip-path: polygon(0 0, 100% 0, 100% 50%, 0 50%);
      transition: transform 0.5s ease;
    }

    .gauge-value {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 700;
    }

    /* Data streams */
    .data-streams {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stream {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: var(--bg-secondary);
      border-radius: 8px;
    }

    .stream-icon {
      width: 32px;
      height: 32px;
      background: var(--accent-primary);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .stream-info { flex: 1; }
    .stream-name { font-size: 13px; font-weight: 600; }
    .stream-count { font-size: 11px; color: var(--text-secondary); }

    .stream-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      animation: pulse 2s infinite;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 30px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .level-card { grid-column: span 1; flex-direction: column; text-align: center; }
      .level-orb { width: 80px; height: 80px; font-size: 24px; }
      .dashboard { padding: 15px; gap: 15px; }
      .header { padding: 15px 20px; flex-direction: column; gap: 15px; }
    }
  </style>
</head>
<body>
  <div class="bg-animation"></div>
  <div class="particles">
    ${Array.from({length: 20}, (_, i) => `
      <div class="particle" style="
        left: ${Math.random() * 100}%;
        animation-delay: ${Math.random() * 15}s;
        animation-duration: ${10 + Math.random() * 10}s;
      "></div>
    `).join('')}
  </div>

  <div class="header">
    <div class="logo">MemoRable</div>
    <div class="status-bar">
      <div class="status-item">
        <div class="status-dot"></div>
        <span>Live</span>
      </div>
      <div class="status-item">
        <span>Uptime: ${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m</span>
      </div>
    </div>
  </div>

  <div class="dashboard">
    <!-- Level Card -->
    <div class="card level-card">
      <div class="level-orb">${level}</div>
      <div class="level-info">
        <h2>Memory Level ${level}</h2>
        <p>Your AI memory system is growing stronger with every interaction</p>
        <div class="xp-bar">
          <div class="xp-fill" style="width: ${(xpInLevel / xpToNextLevel) * 100}%"></div>
        </div>
        <div class="xp-text">${xpInLevel} / ${xpToNextLevel} memories to next level</div>
      </div>
    </div>

    <!-- Total Memories -->
    <div class="card">
      <div class="card-title">Memory Bank</div>
      <div class="big-stat">
        <div class="big-number">${memoryCount}</div>
        <div class="big-label">Total Memories Stored</div>
      </div>
    </div>

    <!-- Memory Power -->
    <div class="card">
      <div class="card-title">Memory Power</div>
      <div class="big-stat">
        <div class="big-number">${avgSalience}</div>
        <div class="big-label">Average Salience Score</div>
      </div>
    </div>

    <!-- Quality Distribution -->
    <div class="card">
      <div class="card-title">Memory Quality</div>
      <div class="quality-bars">
        <div class="quality-row legendary">
          <span class="quality-label" style="color: #ffd700;">Legendary</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.legendary / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.legendary}</span>
        </div>
        <div class="quality-row epic">
          <span class="quality-label" style="color: #a855f7;">Epic</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.epic / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.epic}</span>
        </div>
        <div class="quality-row rare">
          <span class="quality-label" style="color: #3b82f6;">Rare</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.rare / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.rare}</span>
        </div>
        <div class="quality-row common">
          <span class="quality-label" style="color: #6b7280;">Common</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.common / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.common}</span>
        </div>
      </div>
    </div>

    <!-- Authenticity Score -->
    <div class="card">
      <div class="card-title">Authenticity Score</div>
      <div style="text-align: center;">
        <div class="big-number" style="font-size: 42px;">${authenticityScore}%</div>
        <div class="big-label">Memory Fidelity Rating</div>
        <div style="margin-top: 16px; display: flex; justify-content: center; gap: 16px; font-size: 12px;">
          <span style="color: var(--accent-green);">💎 ${fidelityCounts.verbatim} Verbatim</span>
          <span style="color: var(--accent-gold);">🔮 ${fidelityCounts.derived} Derived</span>
          <span style="color: var(--text-secondary);">📝 ${fidelityCounts.standard} Standard</span>
        </div>
      </div>
    </div>

    <!-- Entity Constellation -->
    <div class="card">
      <div class="card-title">Entity Constellation</div>
      <div class="constellation">
        ${topEntities.length > 0 ? topEntities.map(([name, count]) => `
          <div class="entity-node">
            <div class="entity-dot"></div>
            <span>${name}</span>
            <span class="entity-count">${count}</span>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">No entities yet</span>'}
      </div>
    </div>

    <!-- Data Streams -->
    <div class="card">
      <div class="card-title">Data Streams</div>
      <div class="data-streams">
        ${Object.entries(sourceCounts).map(([source, count]) => `
          <div class="stream">
            <div class="stream-icon">${source === 'slack' ? '💬' : source === 'api' ? '🔌' : '📡'}</div>
            <div class="stream-info">
              <div class="stream-name">${source.charAt(0).toUpperCase() + source.slice(1)}</div>
              <div class="stream-count">${count} memories ingested</div>
            </div>
            <div class="stream-indicator"></div>
          </div>
        `).join('') || '<span style="color: var(--text-secondary);">No data streams active</span>'}
      </div>
    </div>

    <!-- Achievements -->
    <div class="card" style="grid-column: span 2;">
      <div class="card-title">Achievements Unlocked</div>
      <div class="achievements">
        ${achievements.length > 0 ? achievements.map(a => `
          <div class="achievement">
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">Start storing memories to unlock achievements!</span>'}
      </div>
    </div>

    <!-- Activity Feed -->
    <div class="card">
      <div class="card-title">Recent Activity</div>
      <div class="activity-feed">
        ${recentMemories.length > 0 ? recentMemories.map(m => `
          <div class="activity-item">
            <div class="activity-content">${m.content.substring(0, 60)}${m.content.length > 60 ? '...' : ''}</div>
            <div class="activity-meta">
              <span>Salience: ${m.salience}</span>
              <span>${new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">No activity yet</span>'}
      </div>
    </div>
  </div>

  <div class="footer">
    <strong>MemoRable</strong> — Memory Intelligence for AI Agents<br>
    Dashboard auto-refreshes every 5 seconds | <a href="/dashboard" style="color: var(--accent-primary);">Classic View</a> | <a href="/metrics" style="color: var(--accent-primary);">Raw Metrics</a>
  </div>

  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);

    // Add subtle animation to numbers on load
    document.querySelectorAll('.big-number').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'all 0.5s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100);
    });
  </script>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// =============================================================================
// MISSION CONTROL - Space Shuttle meets Hollywood
// =============================================================================
app.get('/dashboard/mission-control', (_req, res) => {
  const memories = Array.from(memoryStore.values());
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryCount = memories.length;

  // Calculate metrics for gauges
  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => { entityCounts[e] = (entityCounts[e] || 0) + 1; });
  });
  const entityCount = Object.keys(entityCounts).length;

  // System "vitals"
  const cpuFake = 23 + Math.floor(Math.random() * 15);
  const memFake = 45 + Math.floor(Math.random() * 20);
  const networkFake = 78 + Math.floor(Math.random() * 20);

  // Pre-compute dynamic HTML elements (avoid nested template literals)
  const radarBlips = Object.keys(entityCounts).slice(0, 5).map((_, i) => {
    const angle = (i * 72) * Math.PI / 180;
    const r = 30 + Math.random() * 40;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    return '<div class="radar-blip" style="left: ' + x + '%; top: ' + y + '%;"></div>';
  }).join('');

  const indicatorLights = Array(32).fill(0).map((_, i) => {
    const colors = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
    const states = ['on', 'slow', 'off', 'on'];
    return '<div class="indicator-light ' + colors[i % 7] + ' ' + states[Math.floor(Math.random() * 4)] + '"></div>';
  }).join('');

  const waveBars = Array(50).fill(0).map((_, i) =>
    '<div class="wave-bar" style="animation-delay: ' + (i * 0.05) + 's;"></div>'
  ).join('');

  const sourceCount = Object.keys(memories.reduce((acc, m) => {
    acc[m.context?.source || 'direct'] = true;
    return acc;
  }, {})).length;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Mission Control</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0a0f;
      --bg-panel: #0d1117;
      --bg-card: #161b22;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --yellow: #ffff00;
      --green: #00ff41;
      --red: #ff0040;
      --orange: #ff8800;
      --blue: #0088ff;
      --text: #c9d1d9;
      --text-dim: #6e7681;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Scanline effect */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.15),
        rgba(0, 0, 0, 0.15) 1px,
        transparent 1px,
        transparent 2px
      );
      pointer-events: none;
      z-index: 1000;
    }

    /* Header */
    .header {
      background: linear-gradient(180deg, #1a1a2e 0%, var(--bg-dark) 100%);
      border-bottom: 2px solid var(--cyan);
      padding: 15px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 0 30px rgba(0, 255, 255, 0.2);
    }

    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 10px var(--cyan), 0 0 20px var(--cyan), 0 0 40px var(--cyan);
      letter-spacing: 4px;
    }

    .logo span { color: var(--magenta); text-shadow: 0 0 10px var(--magenta); }

    .header-status {
      display: flex;
      gap: 30px;
      align-items: center;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .blink-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: blink 1s infinite;
    }

    .blink-dot.green { background: var(--green); box-shadow: 0 0 10px var(--green); }
    .blink-dot.yellow { background: var(--yellow); box-shadow: 0 0 10px var(--yellow); animation-duration: 0.5s; }
    .blink-dot.red { background: var(--red); box-shadow: 0 0 10px var(--red); animation-duration: 0.3s; }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Main grid */
    .mission-grid {
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      grid-template-rows: auto auto auto;
      gap: 15px;
      padding: 20px;
      height: calc(100vh - 70px);
    }

    .panel {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
      position: relative;
      overflow: hidden;
    }

    .panel::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--magenta), var(--cyan));
      animation: borderGlow 3s linear infinite;
    }

    @keyframes borderGlow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    .panel-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: var(--cyan);
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    /* GAUGES */
    .gauge-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .gauge {
      width: 120px;
      height: 120px;
      position: relative;
    }

    .gauge svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .gauge-bg {
      fill: none;
      stroke: var(--bg-card);
      stroke-width: 8;
    }

    .gauge-fill {
      fill: none;
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 1s ease;
    }

    .gauge-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 700;
    }

    .gauge-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--text-dim);
    }

    /* Flashing buttons panel */
    .button-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .fake-button {
      padding: 12px 8px;
      border-radius: 6px;
      font-family: 'Orbitron', sans-serif;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid;
    }

    .fake-button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 20px currentColor;
    }

    .fake-button.cyan { background: rgba(0,255,255,0.1); border-color: var(--cyan); color: var(--cyan); }
    .fake-button.magenta { background: rgba(255,0,255,0.1); border-color: var(--magenta); color: var(--magenta); }
    .fake-button.green { background: rgba(0,255,65,0.1); border-color: var(--green); color: var(--green); }
    .fake-button.yellow { background: rgba(255,255,0,0.1); border-color: var(--yellow); color: var(--yellow); }
    .fake-button.red { background: rgba(255,0,64,0.1); border-color: var(--red); color: var(--red); }
    .fake-button.orange { background: rgba(255,136,0,0.1); border-color: var(--orange); color: var(--orange); }

    .fake-button.active {
      animation: buttonPulse 1.5s infinite;
    }

    @keyframes buttonPulse {
      0%, 100% { box-shadow: 0 0 5px currentColor; }
      50% { box-shadow: 0 0 25px currentColor, inset 0 0 10px currentColor; }
    }

    /* Indicator lights */
    .light-panel {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
    }

    .indicator-light {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 50%;
      border: 2px solid var(--border);
    }

    .indicator-light.on { animation: lightBlink 0.5s infinite; }
    .indicator-light.slow { animation: lightBlink 2s infinite; }
    .indicator-light.off { opacity: 0.2; }

    .indicator-light.c1 { background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
    .indicator-light.c2 { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .indicator-light.c3 { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
    .indicator-light.c4 { background: var(--red); box-shadow: 0 0 8px var(--red); }
    .indicator-light.c5 { background: var(--magenta); box-shadow: 0 0 8px var(--magenta); }
    .indicator-light.c6 { background: var(--orange); box-shadow: 0 0 8px var(--orange); }
    .indicator-light.c7 { background: var(--blue); box-shadow: 0 0 8px var(--blue); }

    @keyframes lightBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Waveform */
    .waveform {
      height: 60px;
      display: flex;
      align-items: center;
      gap: 2px;
      overflow: hidden;
    }

    .wave-bar {
      flex: 1;
      background: var(--cyan);
      min-width: 3px;
      animation: wave 0.5s ease-in-out infinite;
      box-shadow: 0 0 5px var(--cyan);
    }

    @keyframes wave {
      0%, 100% { height: 20%; }
      50% { height: 100%; }
    }

    /* Data stream */
    .data-stream {
      font-size: 10px;
      height: 150px;
      overflow: hidden;
      background: var(--bg-card);
      padding: 10px;
      border-radius: 4px;
      font-family: 'Share Tech Mono', monospace;
    }

    .data-line {
      color: var(--green);
      margin: 3px 0;
      animation: fadeIn 0.5s ease;
    }

    .data-line .time { color: var(--text-dim); }
    .data-line .type { color: var(--cyan); }
    .data-line .value { color: var(--yellow); }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Big numbers */
    .big-stat {
      text-align: center;
      padding: 20px;
    }

    .big-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 48px;
      font-weight: 900;
      background: linear-gradient(180deg, var(--cyan), var(--magenta));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
    }

    .big-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: var(--text-dim);
      margin-top: 5px;
    }

    /* Radar */
    .radar-container {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      max-width: 200px;
      margin: 0 auto;
    }

    .radar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background:
        radial-gradient(circle, transparent 30%, rgba(0, 255, 255, 0.1) 70%),
        conic-gradient(from 0deg, transparent 0deg, rgba(0, 255, 255, 0.3) 30deg, transparent 60deg);
      animation: radarSweep 4s linear infinite;
      border: 2px solid var(--cyan);
      box-shadow: 0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 30px rgba(0, 255, 255, 0.1);
    }

    @keyframes radarSweep {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .radar-grid {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 50%;
      background:
        radial-gradient(circle, transparent 20%, transparent 20.5%, rgba(0, 255, 255, 0.2) 21%, transparent 21.5%),
        radial-gradient(circle, transparent 40%, transparent 40.5%, rgba(0, 255, 255, 0.2) 41%, transparent 41.5%),
        radial-gradient(circle, transparent 60%, transparent 60.5%, rgba(0, 255, 255, 0.2) 61%, transparent 61.5%),
        radial-gradient(circle, transparent 80%, transparent 80.5%, rgba(0, 255, 255, 0.2) 81%, transparent 81.5%),
        linear-gradient(0deg, transparent 49.5%, rgba(0, 255, 255, 0.2) 50%, transparent 50.5%),
        linear-gradient(90deg, transparent 49.5%, rgba(0, 255, 255, 0.2) 50%, transparent 50.5%);
    }

    .radar-blip {
      position: absolute;
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: blipPulse 2s infinite;
    }

    @keyframes blipPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.5; }
    }

    /* Main display */
    .main-display {
      grid-column: 2;
      grid-row: 1 / 3;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .hero-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: radial-gradient(ellipse at center, rgba(0, 255, 255, 0.05) 0%, transparent 70%);
    }

    .hero-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 120px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 20px var(--cyan), 0 0 40px var(--cyan), 0 0 60px var(--cyan);
      line-height: 1;
    }

    .hero-label {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 8px;
      color: var(--text-dim);
      margin-top: 10px;
    }

    .hero-sub {
      font-size: 12px;
      color: var(--magenta);
      margin-top: 20px;
      text-transform: uppercase;
      letter-spacing: 4px;
    }

    /* Footer status bar */
    .footer-bar {
      grid-column: 1 / 4;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-stats {
      display: flex;
      gap: 40px;
    }

    .footer-stat {
      text-align: center;
    }

    .footer-stat-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 18px;
      color: var(--cyan);
    }

    .footer-stat-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--text-dim);
    }

    .system-time {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      color: var(--green);
      text-shadow: 0 0 10px var(--green);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">MEMO<span>RABLE</span> // MISSION CONTROL</div>
    <div class="header-status">
      <div class="status-indicator">
        <div class="blink-dot green"></div>
        CORE ONLINE
      </div>
      <div class="status-indicator">
        <div class="blink-dot yellow"></div>
        INGESTING
      </div>
      <div class="status-indicator">
        <div class="blink-dot green"></div>
        SALIENCE ENGINE
      </div>
    </div>
  </div>

  <div class="mission-grid">
    <!-- Left column -->
    <div class="panel">
      <div class="panel-title">System Vitals</div>
      <div style="display: flex; flex-direction: column; gap: 20px; align-items: center;">
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--cyan)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${251.2 - (251.2 * cpuFake / 100)}" />
            </svg>
            <div class="gauge-value" style="color: var(--cyan);">${cpuFake}%</div>
          </div>
          <div class="gauge-label">CPU Load</div>
        </div>
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--magenta)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${251.2 - (251.2 * memFake / 100)}" />
            </svg>
            <div class="gauge-value" style="color: var(--magenta);">${memFake}%</div>
          </div>
          <div class="gauge-label">Memory</div>
        </div>
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--green)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${251.2 - (251.2 * networkFake / 100)}" />
            </svg>
            <div class="gauge-value" style="color: var(--green);">${networkFake}%</div>
          </div>
          <div class="gauge-label">Network</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Entity Radar</div>
      <div class="radar-container">
        <div class="radar"></div>
        <div class="radar-grid"></div>
        ${radarBlips}
      </div>
      <div style="text-align: center; margin-top: 10px; font-size: 11px; color: var(--text-dim);">
        ${entityCount} ENTITIES TRACKED
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Indicator Array</div>
      <div class="light-panel">
        ${indicatorLights}
      </div>
    </div>

    <!-- Main display -->
    <div class="main-display">
      <div class="panel hero-panel">
        <div class="hero-number">${memoryCount}</div>
        <div class="hero-label">Total Memories</div>
        <div class="hero-sub">TRACKING 183 FACTORS IN REAL TIME</div>
        <div style="margin-top: 30px; padding: 15px; background: rgba(0,255,255,0.05); border: 1px solid var(--cyan); border-radius: 8px; max-width: 400px;">
          <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 8px;">We've all chatted with AI...</div>
          <div style="font-size: 14px; color: var(--cyan);">When was the last time it was <span style="color: var(--magenta);">memorable</span>?</div>
          <div style="margin-top: 10px; font-size: 11px;"><a href="https://memorable.chat" style="color: var(--green); text-decoration: none;">memorable.chat</a> — Talk to AI that remembers you, like a friend.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Neural Waveform</div>
        <div class="waveform">
          ${waveBars}
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Control Matrix</div>
        <div class="button-grid">
          <div class="fake-button cyan active">ENGAGE</div>
          <div class="fake-button magenta">SYNC</div>
          <div class="fake-button green active">ACTIVE</div>
          <div class="fake-button yellow">STANDBY</div>
          <div class="fake-button cyan">RECALL</div>
          <div class="fake-button orange active">PROCESS</div>
          <div class="fake-button green">VERIFY</div>
          <div class="fake-button magenta active">INDEX</div>
          <div class="fake-button red">PURGE</div>
          <div class="fake-button cyan active">PREDICT</div>
          <div class="fake-button yellow">ARCHIVE</div>
          <div class="fake-button green active">LEARN</div>
        </div>
      </div>
    </div>

    <!-- Right column -->
    <div class="panel">
      <div class="panel-title">Salience Power</div>
      <div class="big-stat">
        <div class="big-number">${avgSalience}</div>
        <div class="big-label">Average Score</div>
      </div>
      <div class="gauge-container" style="margin-top: 20px;">
        <div class="gauge">
          <svg viewBox="0 0 100 100">
            <circle class="gauge-bg" cx="50" cy="50" r="40" />
            <circle class="gauge-fill" cx="50" cy="50" r="40"
              stroke="var(--yellow)"
              stroke-dasharray="251.2"
              stroke-dashoffset="${251.2 - (251.2 * avgSalience / 100)}" />
          </svg>
          <div class="gauge-value" style="color: var(--yellow);">${avgSalience}</div>
        </div>
        <div class="gauge-label">Salience Index</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Data Stream</div>
      <div class="data-stream">
        <div class="data-line"><span class="time">[${new Date().toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">SYS</span> Memory core initialized</div>
        <div class="data-line"><span class="time">[${new Date(Date.now() - 1000).toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">SAL</span> Salience engine: <span class="value">ACTIVE</span></div>
        <div class="data-line"><span class="time">[${new Date(Date.now() - 2000).toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">NET</span> Entity graph: <span class="value">${entityCount} nodes</span></div>
        <div class="data-line"><span class="time">[${new Date(Date.now() - 3000).toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">MEM</span> Storage: <span class="value">${memoryCount} records</span></div>
        <div class="data-line"><span class="time">[${new Date(Date.now() - 4000).toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">AUTH</span> Gate status: <span class="value">SECURE</span></div>
        <div class="data-line"><span class="time">[${new Date(Date.now() - 5000).toISOString().split('T')[1].split('.')[0]}]</span> <span class="type">SYS</span> All systems nominal</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Quick Stats</div>
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div class="big-stat">
          <div class="big-number" style="font-size: 36px; color: var(--green);">${entityCount}</div>
          <div class="big-label">Entities</div>
        </div>
        <div class="big-stat">
          <div class="big-number" style="font-size: 36px; color: var(--orange);">${sourceCount}</div>
          <div class="big-label">Sources</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-bar">
      <div class="footer-stats">
        <div class="footer-stat">
          <div class="footer-stat-value">${memoryCount}</div>
          <div class="footer-stat-label">Memories</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${entityCount}</div>
          <div class="footer-stat-label">Entities</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${avgSalience}%</div>
          <div class="footer-stat-label">Avg Salience</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${Math.floor(uptimeSeconds / 3600)}h</div>
          <div class="footer-stat-label">Uptime</div>
        </div>
      </div>
      <div class="system-time" id="systemTime"></div>
    </div>
  </div>

  <script>
    // Update system time
    function updateTime() {
      const now = new Date();
      document.getElementById('systemTime').textContent =
        now.toISOString().replace('T', ' // ').split('.')[0] + ' UTC';
    }
    updateTime();
    setInterval(updateTime, 1000);

    // Make buttons flash when clicked
    document.querySelectorAll('.fake-button').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(0.95)';
        btn.style.boxShadow = '0 0 40px currentColor, inset 0 0 20px currentColor';
        setTimeout(() => {
          btn.style.transform = '';
          btn.style.boxShadow = '';
        }, 200);
      });
    });
  </script>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// JSON endpoint for programmatic access
app.get('/dashboard/json', (_req, res) => {
  const memories = Array.from(memoryStore.values());

  const salienceRanges = {
    low: memories.filter(m => m.salience < 40).length,
    medium: memories.filter(m => m.salience >= 40 && m.salience < 70).length,
    high: memories.filter(m => m.salience >= 70).length,
  };

  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };

  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  // Calculate patterns from memories
  const patterns = analyzePatterns(memories);

  // Get active device contexts
  const devices = Array.from(deviceContextStore.values());
  const activeDevices = devices.filter(d => d.context?.isActive);

  res.json({
    summary: {
      totalMemories: memories.length,
      avgSalience,
      uniqueEntities: Object.keys(entityCounts).length,
      dataSources: Object.keys(sourceCounts).length,
      activeDevices: activeDevices.length,
      totalDevices: devices.length,
    },
    salience: salienceRanges,
    fidelity: fidelityCounts,
    sources: sourceCounts,
    topEntities: Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count })),
    patterns,
    devices: devices.map(d => ({
      deviceId: d.deviceId,
      deviceType: d.deviceType,
      location: d.context?.location,
      activity: d.context?.activity,
      isActive: d.context?.isActive,
      lastSeen: d.lastSeen,
    })),
  });
});

// =============================================================================
// CALENDAR DASHBOARD - Weekly view of memories
// "time based... we need a good UI with the stats and a calendar" - Alan
// =============================================================================
app.get('/dashboard/calendar', (_req, res) => {
  const memories = Array.from(memoryStore.values());
  const now = new Date();

  // Get memories for the past 7 days
  const weekData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayMemories = memories.filter(m => {
      const memDate = new Date(m.timestamp || m.createdAt || m.created_at).toISOString().split('T')[0];
      return memDate === dateStr;
    });

    weekData.push({
      date: dateStr,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      count: dayMemories.length,
      avgSalience: dayMemories.length > 0
        ? Math.round(dayMemories.reduce((s, m) => s + (m.salience || 0), 0) / dayMemories.length)
        : 0,
      topEntities: [...new Set(dayMemories.flatMap(m => m.entities || [m.entity]))].slice(0, 5),
      loops: dayMemories.filter(m => m.metadata?.hasLoop).length,
    });
  }

  // Time of day breakdown for today
  const todayStr = now.toISOString().split('T')[0];
  const todayMemories = memories.filter(m => {
    const memDate = new Date(m.timestamp || m.createdAt || m.created_at).toISOString().split('T')[0];
    return memDate === todayStr;
  });

  const timeOfDay = {
    morning: todayMemories.filter(m => {
      const h = new Date(m.timestamp || m.createdAt).getHours();
      return h >= 5 && h < 12;
    }).length,
    afternoon: todayMemories.filter(m => {
      const h = new Date(m.timestamp || m.createdAt).getHours();
      return h >= 12 && h < 17;
    }).length,
    evening: todayMemories.filter(m => {
      const h = new Date(m.timestamp || m.createdAt).getHours();
      return h >= 17 && h < 21;
    }).length,
    night: todayMemories.filter(m => {
      const h = new Date(m.timestamp || m.createdAt).getHours();
      return h >= 21 || h < 5;
    }).length,
  };

  // Pattern stats
  const patterns = analyzePatterns(memories);

  res.json({
    week: weekData,
    today: {
      date: todayStr,
      count: todayMemories.length,
      timeOfDay,
    },
    patterns: {
      observationDays: patterns.observationDays,
      readyForPrediction: patterns.readyForPrediction,
      confidence: patterns.confidence,
      daysUntilHabitComplete: patterns.currentPosition?.daysUntilHabitComplete || 21,
    },
    totals: {
      memories: memories.length,
      avgSalience: memories.length > 0
        ? Math.round(memories.reduce((s, m) => s + (m.salience || 0), 0) / memories.length)
        : 0,
      entities: [...new Set(memories.flatMap(m => m.entities || [m.entity]))].length,
      openLoops: memories.filter(m => m.metadata?.hasLoop && !m.metadata?.loopClosed).length,
    }
  });
});

// Calendar HTML view
app.get('/dashboard/calendar/view', (_req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Calendar</title>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0f;
      --panel: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --green: #00ff41;
      --text: #c9d1d9;
      --dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: var(--cyan);
      font-size: 2em;
      text-shadow: 0 0 20px var(--cyan);
    }
    .header .subtitle {
      color: var(--dim);
      margin-top: 5px;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 10px;
      margin-bottom: 30px;
    }
    .day-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .day-card.today {
      border-color: var(--cyan);
      box-shadow: 0 0 10px rgba(0,255,255,0.3);
    }
    .day-name {
      color: var(--dim);
      font-size: 0.8em;
      margin-bottom: 5px;
    }
    .day-date {
      font-size: 1.2em;
      margin-bottom: 10px;
    }
    .day-count {
      font-size: 2em;
      color: var(--green);
      text-shadow: 0 0 10px rgba(0,255,65,0.5);
    }
    .day-salience {
      color: var(--magenta);
      font-size: 0.9em;
      margin-top: 5px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 2.5em;
      color: var(--cyan);
    }
    .stat-label {
      color: var(--dim);
      font-size: 0.8em;
      margin-top: 5px;
    }
    .progress-section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }
    .progress-bar {
      height: 20px;
      background: var(--card);
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), var(--magenta));
      transition: width 0.5s;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MEMORABLE // CALENDAR</h1>
    <div class="subtitle">Rolling 7-day memory view • Updates every 5s</div>
  </div>

  <div class="week-grid" id="weekGrid"></div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value" id="totalMemories">-</div>
      <div class="stat-label">TOTAL MEMORIES</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="avgSalience">-</div>
      <div class="stat-label">AVG SALIENCE</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="entities">-</div>
      <div class="stat-label">ENTITIES</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="daysToPredict">-</div>
      <div class="stat-label">DAYS TO PREDICT</div>
    </div>
  </div>

  <div class="progress-section">
    <div style="display: flex; justify-content: space-between;">
      <span>PATTERN LEARNING</span>
      <span id="confidence">0%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="progressFill" style="width: 0%"></div>
    </div>
    <div style="color: var(--dim); font-size: 0.8em;">
      21 days to habit formation • 63 days to stable patterns
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/dashboard/calendar');
        const data = await res.json();

        // Week grid
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('weekGrid').innerHTML = data.week.map(day => \`
          <div class="day-card \${day.date === today ? 'today' : ''}">
            <div class="day-name">\${day.dayName}</div>
            <div class="day-date">\${day.date.split('-').slice(1).join('/')}</div>
            <div class="day-count">\${day.count}</div>
            <div class="day-salience">\${day.avgSalience} sal</div>
            \${day.loops > 0 ? '<div style="color: var(--magenta); font-size: 0.8em; margin-top: 5px;">' + day.loops + ' loops</div>' : ''}
          </div>
        \`).join('');

        // Stats
        document.getElementById('totalMemories').textContent = data.totals.memories;
        document.getElementById('avgSalience').textContent = data.totals.avgSalience;
        document.getElementById('entities').textContent = data.totals.entities;
        document.getElementById('daysToPredict').textContent = data.patterns.daysUntilHabitComplete;

        // Progress
        const conf = parseFloat(data.patterns.confidence) * 100;
        document.getElementById('confidence').textContent = conf.toFixed(1) + '%';
        document.getElementById('progressFill').style.width = conf + '%';
      } catch (err) {
        console.error('Failed to load calendar data:', err);
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// =============================================================================
// USER SETTINGS - Phase 2: Self-service user management
// =============================================================================

// Common styles for user settings pages
const userSettingsStyles = `
  :root {
    --bg-dark: #0a0a0f;
    --bg-panel: #0d1117;
    --bg-card: #161b22;
    --border: #30363d;
    --cyan: #00ffff;
    --magenta: #ff00ff;
    --green: #00ff41;
    --red: #ff0040;
    --yellow: #ffff00;
    --text: #c9d1d9;
    --text-dim: #6e7681;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Share Tech Mono', monospace;
    background: var(--bg-dark);
    color: var(--text);
    min-height: 100vh;
    padding: 20px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 20px;
  }
  .logo {
    font-family: 'Orbitron', sans-serif;
    font-size: 20px;
    color: var(--cyan);
    text-shadow: 0 0 10px var(--cyan);
  }
  .nav { display: flex; gap: 15px; }
  .nav a {
    color: var(--text-dim);
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.2s;
  }
  .nav a:hover, .nav a.active {
    color: var(--cyan);
    border-color: var(--cyan);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
  }
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .panel-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 14px;
    color: var(--cyan);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .form-group { margin-bottom: 20px; }
  .form-group label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .form-group input, .form-group select {
    width: 100%;
    padding: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
  }
  .form-group input:focus {
    outline: none;
    border-color: var(--cyan);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
  }
  .btn {
    padding: 12px 24px;
    border: 1px solid;
    border-radius: 4px;
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
  }
  .btn-primary {
    color: var(--cyan);
    border-color: var(--cyan);
  }
  .btn-primary:hover {
    background: rgba(0, 255, 255, 0.1);
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
  }
  .btn-danger {
    color: var(--red);
    border-color: var(--red);
  }
  .btn-danger:hover {
    background: rgba(255, 0, 64, 0.1);
    box-shadow: 0 0 20px rgba(255, 0, 64, 0.3);
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }
  .stat-card {
    background: var(--bg-card);
    padding: 15px;
    border-radius: 4px;
    text-align: center;
  }
  .stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 24px;
    color: var(--cyan);
  }
  .stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    margin-top: 5px;
  }
  .device-list { list-style: none; }
  .device-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    background: var(--bg-card);
    border-radius: 4px;
    margin-bottom: 10px;
  }
  .device-info h4 {
    color: var(--text);
    font-size: 14px;
    margin-bottom: 5px;
  }
  .device-info span {
    font-size: 11px;
    color: var(--text-dim);
  }
  .device-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .status-dot.active { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .status-dot.inactive { background: var(--text-dim); }
  .alert {
    padding: 15px;
    border-radius: 4px;
    margin-bottom: 20px;
    font-size: 13px;
  }
  .alert-success { background: rgba(0, 255, 65, 0.1); border: 1px solid var(--green); color: var(--green); }
  .alert-error { background: rgba(255, 0, 64, 0.1); border: 1px solid var(--red); color: var(--red); }
`;

// GET /user/profile - View user profile
app.get('/user/profile', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.redirect('/auth/knock?redirect=/user/profile');
  }

  let user = null;
  if (mongoConnected) {
    user = await findUserById(userId);
  }

  // Fallback to in-memory
  if (!user) {
    const inMemUser = passphraseUsers.get(userId);
    if (inMemUser) {
      user = {
        userId,
        displayName: userId,
        email: null,
        tier: 'free',
        status: 'active',
        createdAt: inMemUser.created_at,
        lastActiveAt: new Date().toISOString(),
      };
    }
  }

  if (!user) {
    return res.status(404).send('User not found');
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Profile - MemoRable</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${userSettingsStyles}</style>
</head>
<body>
  <div class="header">
    <div class="logo">MEMORABLE // USER SETTINGS</div>
    <nav class="nav">
      <a href="/user/profile" class="active">Profile</a>
      <a href="/user/devices">Devices</a>
      <a href="/user/preferences">Preferences</a>
      <a href="/dashboard/mission-control">Dashboard</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">Profile Overview</div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value" style="font-size: 16px;">${user.userId}</div>
        <div class="stat-label">User ID</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--magenta);">${user.tier?.toUpperCase() || 'FREE'}</div>
        <div class="stat-label">Tier</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--green);">${user.status?.toUpperCase() || 'ACTIVE'}</div>
        <div class="stat-label">Status</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size: 14px;">${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</div>
        <div class="stat-label">Member Since</div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Edit Profile</div>
    <form method="POST" action="/user/profile">
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" name="displayName" value="${user.displayName || ''}" placeholder="Your display name">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${user.email || ''}" placeholder="your@email.com">
      </div>
      <button type="submit" class="btn btn-primary">Update Profile</button>
    </form>
  </div>

  <div class="panel">
    <div class="panel-title">Security</div>
    <p style="color: var(--text-dim); margin-bottom: 15px; font-size: 13px;">
      Change your passphrase or manage authentication settings.
    </p>
    <a href="/user/passphrase" class="btn btn-primary">Change Passphrase</a>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /user/profile - Update profile
app.post('/user/profile', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { displayName, email } = req.body;

  if (mongoConnected) {
    const { updateUser } = await import('./models/index.ts');
    await updateUser(userId, { displayName, email }, { performedBy: userId, auditAction: 'updated' });
  }

  res.redirect('/user/profile?updated=1');
});

// GET /user/devices - List devices
app.get('/user/devices', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.redirect('/auth/knock?redirect=/user/devices');
  }

  // Get devices from MongoDB or in-memory
  let devices = [];
  if (mongoConnected) {
    const { listUserDevices } = await import('./models/index.ts');
    devices = await listUserDevices(userId);
  } else {
    // In-memory fallback
    for (const [keyHash, entry] of deviceKeys.entries()) {
      if (entry.user_id === userId && !entry.revoked) {
        devices.push({
          deviceId: entry.device_id,
          device: entry.device,
          issuedAt: entry.issued_at,
          lastUsed: entry.last_used,
          status: 'active',
        });
      }
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Devices - MemoRable</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${userSettingsStyles}</style>
</head>
<body>
  <div class="header">
    <div class="logo">MEMORABLE // DEVICES</div>
    <nav class="nav">
      <a href="/user/profile">Profile</a>
      <a href="/user/devices" class="active">Devices</a>
      <a href="/user/preferences">Preferences</a>
      <a href="/dashboard/mission-control">Dashboard</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">Connected Devices</div>
    <p style="color: var(--text-dim); margin-bottom: 20px; font-size: 13px;">
      Manage devices that have access to your memories. Each device has its own API key.
    </p>
    <ul class="device-list">
      ${devices.length === 0 ? '<li class="device-item"><span style="color: var(--text-dim);">No devices connected</span></li>' :
        devices.map(d => `
        <li class="device-item">
          <div class="device-info">
            <h4>${d.device?.name || d.deviceId}</h4>
            <span>Type: ${d.device?.type || 'unknown'} • Added: ${d.issuedAt ? new Date(d.issuedAt).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div class="device-status">
            <div class="status-dot ${d.status === 'active' ? 'active' : 'inactive'}"></div>
            <span style="font-size: 11px; color: var(--text-dim);">${d.status}</span>
            <form method="POST" action="/user/devices/revoke" style="margin-left: 15px;">
              <input type="hidden" name="deviceId" value="${d.deviceId}">
              <button type="submit" class="btn btn-danger" style="padding: 6px 12px; font-size: 10px;">Revoke</button>
            </form>
          </div>
        </li>
        `).join('')}
    </ul>
  </div>

  <div class="panel">
    <div class="panel-title">Add New Device</div>
    <p style="color: var(--text-dim); margin-bottom: 15px; font-size: 13px;">
      To add a new device, use the passphrase authentication flow from that device.
    </p>
    <code style="display: block; background: var(--bg-card); padding: 15px; border-radius: 4px; font-size: 12px; color: var(--green);">
      curl -X POST /auth/knock -d '{"device":{"type":"phone","name":"My Phone"}}'
    </code>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /user/devices/revoke - Revoke a device
app.post('/user/devices/revoke', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { deviceId } = req.body;

  if (mongoConnected) {
    const { revokeDevice } = await import('./models/index.ts');
    await revokeDevice(deviceId, { performedBy: userId });
  } else {
    // In-memory revoke
    for (const [keyHash, entry] of deviceKeys.entries()) {
      if (entry.device_id === deviceId && entry.user_id === userId) {
        entry.revoked = true;
        entry.revoked_at = new Date().toISOString();
        break;
      }
    }
  }

  res.redirect('/user/devices?revoked=1');
});

// GET /user/preferences - User preferences
app.get('/user/preferences', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.redirect('/auth/knock?redirect=/user/preferences');
  }

  let prefs = {};
  if (mongoConnected) {
    const { getAllPreferences } = await import('./models/index.ts');
    prefs = await getAllPreferences(userId) || {};
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Preferences - MemoRable</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${userSettingsStyles}</style>
</head>
<body>
  <div class="header">
    <div class="logo">MEMORABLE // PREFERENCES</div>
    <nav class="nav">
      <a href="/user/profile">Profile</a>
      <a href="/user/devices">Devices</a>
      <a href="/user/preferences" class="active">Preferences</a>
      <a href="/dashboard/mission-control">Dashboard</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">Privacy Settings</div>
    <form method="POST" action="/user/preferences">
      <div class="form-group">
        <label>Default Memory Security Tier</label>
        <select name="defaultSecurityTier">
          <option value="Tier1_General" ${prefs.defaultSecurityTier === 'Tier1_General' ? 'selected' : ''}>Tier 1 - General (External LLM OK)</option>
          <option value="Tier2_Personal" ${prefs.defaultSecurityTier === 'Tier2_Personal' || !prefs.defaultSecurityTier ? 'selected' : ''}>Tier 2 - Personal (Local LLM Only)</option>
          <option value="Tier3_Vault" ${prefs.defaultSecurityTier === 'Tier3_Vault' ? 'selected' : ''}>Tier 3 - Vault (Encrypted, No LLM)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Auto-forget after (days, 0 = never)</label>
        <input type="number" name="autoForgetDays" value="${prefs.autoForgetDays || 0}" min="0" max="365">
      </div>
      <button type="submit" class="btn btn-primary">Save Privacy Settings</button>
    </form>
  </div>

  <div class="panel">
    <div class="panel-title">Salience Weights</div>
    <p style="color: var(--text-dim); margin-bottom: 20px; font-size: 13px;">
      Adjust how memories are scored. Higher weights = more important factor.
    </p>
    <form method="POST" action="/user/preferences">
      <input type="hidden" name="section" value="salience">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div class="form-group">
          <label>Emotional Weight</label>
          <input type="range" name="emotionWeight" min="0" max="100" value="${prefs.emotionWeight || 30}" style="width: 100%;">
          <span style="font-size: 11px; color: var(--cyan);">${prefs.emotionWeight || 30}%</span>
        </div>
        <div class="form-group">
          <label>Novelty Weight</label>
          <input type="range" name="noveltyWeight" min="0" max="100" value="${prefs.noveltyWeight || 20}" style="width: 100%;">
          <span style="font-size: 11px; color: var(--cyan);">${prefs.noveltyWeight || 20}%</span>
        </div>
        <div class="form-group">
          <label>Relevance Weight</label>
          <input type="range" name="relevanceWeight" min="0" max="100" value="${prefs.relevanceWeight || 20}" style="width: 100%;">
          <span style="font-size: 11px; color: var(--cyan);">${prefs.relevanceWeight || 20}%</span>
        </div>
        <div class="form-group">
          <label>Social Weight</label>
          <input type="range" name="socialWeight" min="0" max="100" value="${prefs.socialWeight || 15}" style="width: 100%;">
          <span style="font-size: 11px; color: var(--cyan);">${prefs.socialWeight || 15}%</span>
        </div>
      </div>
      <button type="submit" class="btn btn-primary">Save Salience Weights</button>
    </form>
  </div>

  <div class="panel">
    <div class="panel-title">Data Export</div>
    <p style="color: var(--text-dim); margin-bottom: 15px; font-size: 13px;">
      Export all your data in a portable format. Your memories, preferences, and relationships.
    </p>
    <a href="/user/export" class="btn btn-primary">Export My Data</a>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /user/preferences - Update preferences
app.post('/user/preferences', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (mongoConnected) {
    const { setPreferences } = await import('./models/index.ts');
    await setPreferences(userId, req.body);
  }

  res.redirect('/user/preferences?saved=1');
});

// GET /user/passphrase - Change passphrase form
app.get('/user/passphrase', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.redirect('/auth/knock?redirect=/user/passphrase');
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Change Passphrase - MemoRable</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${userSettingsStyles}</style>
</head>
<body>
  <div class="header">
    <div class="logo">MEMORABLE // SECURITY</div>
    <nav class="nav">
      <a href="/user/profile">Profile</a>
      <a href="/user/devices">Devices</a>
      <a href="/user/preferences">Preferences</a>
      <a href="/dashboard/mission-control">Dashboard</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">Change Passphrase</div>
    <p style="color: var(--text-dim); margin-bottom: 20px; font-size: 13px;">
      Your passphrase is hashed with Argon2id. We never store the plaintext.
    </p>
    <form method="POST" action="/user/passphrase">
      <div class="form-group">
        <label>Current Passphrase</label>
        <input type="password" name="currentPassphrase" required placeholder="Enter current passphrase">
      </div>
      <div class="form-group">
        <label>New Passphrase</label>
        <input type="password" name="newPassphrase" required placeholder="Enter new passphrase" minlength="8">
        <span style="font-size: 10px; color: var(--text-dim); margin-top: 5px; display: block;">
          Minimum 8 characters. Use uppercase, lowercase, and numbers, OR 16+ characters.
        </span>
      </div>
      <div class="form-group">
        <label>Confirm New Passphrase</label>
        <input type="password" name="confirmPassphrase" required placeholder="Confirm new passphrase">
      </div>
      <button type="submit" class="btn btn-primary">Update Passphrase</button>
    </form>
  </div>

  <div class="panel">
    <div class="panel-title">Danger Zone</div>
    <p style="color: var(--red); margin-bottom: 15px; font-size: 13px;">
      Deleting your account will schedule all your data for permanent deletion after 30 days.
    </p>
    <form method="POST" action="/user/delete" onsubmit="return confirm('Are you sure? This will delete all your memories.');">
      <button type="submit" class="btn btn-danger">Delete My Account</button>
    </form>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /user/passphrase - Change passphrase
app.post('/user/passphrase', async (req, res) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { currentPassphrase, newPassphrase, confirmPassphrase } = req.body;

  if (newPassphrase !== confirmPassphrase) {
    return res.status(400).send('Passphrases do not match');
  }

  if (newPassphrase.length < 8) {
    return res.status(400).send('Passphrase must be at least 8 characters');
  }

  // Verify current passphrase
  let verified = false;
  if (mongoConnected) {
    const user = await findUserById(userId);
    if (user) {
      verified = await verifyPassphraseMongo(currentPassphrase, user.passphraseHash);
    }
  } else {
    const user = passphraseUsers.get(userId);
    if (user) {
      verified = await verifyPassphrase(currentPassphrase, user.passphrase_hash);
    }
  }

  if (!verified) {
    return res.status(401).send('Current passphrase is incorrect');
  }

  // Update passphrase
  const { hash } = await hashPassphrase(newPassphrase);

  if (mongoConnected) {
    const { updateUserPassphrase } = await import('./models/index.ts');
    await updateUserPassphrase(userId, hash, { performedBy: userId });
  } else {
    const user = passphraseUsers.get(userId);
    if (user) {
      user.passphrase_hash = hash;
    }
  }

  res.redirect('/user/profile?passphrase_changed=1');
});

// =============================================================================
// ADMIN PANEL - Phase 3: System administration
// =============================================================================

// Admin middleware - requires isAdmin flag
const adminMiddleware = async (req, res, next) => {
  const userId = req.auth?.user_id;
  if (!userId) {
    return res.status(401).send('Authentication required');
  }

  let isAdmin = false;
  if (mongoConnected) {
    const user = await findUserById(userId);
    isAdmin = user?.isAdmin || user?.isSuperAdmin;
  } else {
    // In dev mode, claude is admin
    isAdmin = userId === 'claude';
  }

  if (!isAdmin) {
    return res.status(403).send('Admin access required');
  }

  req.isAdmin = true;
  req.isSuperAdmin = mongoConnected ? (await findUserById(userId))?.isSuperAdmin : false;
  next();
};

// Admin styles (extends user settings styles)
const adminStyles = userSettingsStyles + `
  .admin-header {
    background: linear-gradient(135deg, var(--bg-panel) 0%, #1a0a1a 100%);
    border-color: var(--magenta);
  }
  .admin-header .logo { color: var(--magenta); text-shadow: 0 0 10px var(--magenta); }
  .admin-stat { border-left: 3px solid var(--magenta); }
  .user-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .user-table th, .user-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .user-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    background: var(--bg-card);
  }
  .user-table tr:hover { background: rgba(255, 0, 255, 0.05); }
  .tier-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 10px;
    text-transform: uppercase;
  }
  .tier-free { background: rgba(108, 117, 125, 0.2); color: #6c757d; }
  .tier-pro { background: rgba(0, 255, 255, 0.2); color: var(--cyan); }
  .tier-enterprise { background: rgba(255, 215, 0, 0.2); color: #ffd700; }
  .status-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 10px;
    text-transform: uppercase;
  }
  .status-active { background: rgba(0, 255, 65, 0.2); color: var(--green); }
  .status-suspended { background: rgba(255, 136, 0, 0.2); color: var(--orange); }
  .status-deleted { background: rgba(255, 0, 64, 0.2); color: var(--red); }
  .log-entry {
    padding: 8px 12px;
    border-left: 3px solid var(--border);
    margin-bottom: 8px;
    font-size: 12px;
  }
  .log-entry.warn { border-color: var(--yellow); }
  .log-entry.error { border-color: var(--red); }
  .log-entry.success { border-color: var(--green); }
`;

// GET /admin/dashboard - Admin overview
app.get('/admin/dashboard', adminMiddleware, async (req, res) => {
  const memories = Array.from(memoryStore.values());
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Get user and device counts
  let userCount = 1; // Default claude user
  let deviceCount = deviceKeys.size;
  let recentUsers = [];

  if (mongoConnected) {
    const { listUsers, listUserDevices } = await import('./models/index.ts');
    const result = await listUsers({ limit: 5 });
    userCount = result.total;
    recentUsers = result.users;

    // Count all devices
    deviceCount = 0;
    for (const user of result.users) {
      const devices = await listUserDevices(user.userId);
      deviceCount += devices.length;
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Admin Dashboard - MemoRable</title>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="30">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${adminStyles}</style>
</head>
<body>
  <div class="header admin-header">
    <div class="logo">MEMORABLE // ADMIN</div>
    <nav class="nav">
      <a href="/admin/dashboard" class="active">Dashboard</a>
      <a href="/admin/users">Users</a>
      <a href="/admin/devices">Devices</a>
      <a href="/admin/settings">Settings</a>
      <a href="/dashboard/mission-control" style="border-color: var(--cyan);">Mission Control</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">System Overview</div>
    <div class="stat-grid">
      <div class="stat-card admin-stat">
        <div class="stat-value">${userCount}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card admin-stat">
        <div class="stat-value">${deviceCount}</div>
        <div class="stat-label">Connected Devices</div>
      </div>
      <div class="stat-card admin-stat">
        <div class="stat-value">${memories.length}</div>
        <div class="stat-label">Memories Stored</div>
      </div>
      <div class="stat-card admin-stat">
        <div class="stat-value">${Math.floor(uptimeSeconds / 3600)}h</div>
        <div class="stat-label">Uptime</div>
      </div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <div class="panel">
      <div class="panel-title">Recent Users</div>
      <table class="user-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Tier</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${recentUsers.length === 0 ?
            '<tr><td colspan="3" style="color: var(--text-dim);">No users in database</td></tr>' :
            recentUsers.map(u => `
              <tr>
                <td>${u.userId}</td>
                <td><span class="tier-badge tier-${u.tier}">${u.tier}</span></td>
                <td><span class="status-badge status-${u.status}">${u.status}</span></td>
              </tr>
            `).join('')}
        </tbody>
      </table>
      <a href="/admin/users" style="display: block; text-align: center; margin-top: 15px; color: var(--cyan); font-size: 12px;">View All Users →</a>
    </div>

    <div class="panel">
      <div class="panel-title">System Logs</div>
      <div class="log-entry success">[SYSTEM] Server started - ${new Date(startTime).toISOString()}</div>
      <div class="log-entry">[AUTH] MongoDB mode: ${mongoConnected ? 'Connected' : 'In-Memory Fallback'}</div>
      <div class="log-entry">[METRICS] ${memories.length} memories in store</div>
      <div class="log-entry">[DEVICES] ${deviceCount} active device keys</div>
      ${!mongoConnected ? '<div class="log-entry warn">[WARN] Running without MongoDB - data is ephemeral</div>' : ''}
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Quick Actions</div>
    <div style="display: flex; gap: 15px; flex-wrap: wrap;">
      <a href="/admin/users" class="btn btn-primary">Manage Users</a>
      <a href="/admin/devices" class="btn btn-primary">Manage Devices</a>
      <a href="/admin/settings" class="btn btn-primary">System Settings</a>
      <a href="/metrics/dashboard" class="btn btn-primary">View Metrics</a>
    </div>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// GET /admin/users - User management
app.get('/admin/users', adminMiddleware, async (req, res) => {
  let users = [];
  let total = 0;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  if (mongoConnected) {
    const { listUsers } = await import('./models/index.ts');
    const result = await listUsers({ skip, limit, includeDeleted: true });
    users = result.users;
    total = result.total;
  } else {
    // In-memory users
    users = Array.from(passphraseUsers.entries()).map(([id, data]) => ({
      userId: id,
      tier: 'free',
      status: 'active',
      createdAt: data.created_at,
      isAdmin: id === 'claude',
    }));
    total = users.length;
  }

  const totalPages = Math.ceil(total / limit);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>User Management - MemoRable Admin</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${adminStyles}</style>
</head>
<body>
  <div class="header admin-header">
    <div class="logo">MEMORABLE // USERS</div>
    <nav class="nav">
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/users" class="active">Users</a>
      <a href="/admin/devices">Devices</a>
      <a href="/admin/settings">Settings</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">All Users (${total})</div>
    <table class="user-table">
      <thead>
        <tr>
          <th>User ID</th>
          <th>Email</th>
          <th>Tier</th>
          <th>Status</th>
          <th>Admin</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${u.userId}</td>
            <td>${u.email || '-'}</td>
            <td><span class="tier-badge tier-${u.tier}">${u.tier}</span></td>
            <td><span class="status-badge status-${u.status}">${u.status}</span></td>
            <td>${u.isAdmin ? '✓' : '-'}</td>
            <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
            <td>
              <form method="POST" action="/admin/users/${u.userId}/action" style="display: inline;">
                <select name="action" style="padding: 4px; font-size: 11px; background: var(--bg-card); color: var(--text); border: 1px solid var(--border);">
                  <option value="">Actions...</option>
                  ${u.status === 'active' ? '<option value="suspend">Suspend</option>' : '<option value="activate">Activate</option>'}
                  ${u.isAdmin ? '<option value="revoke_admin">Revoke Admin</option>' : '<option value="grant_admin">Grant Admin</option>'}
                  <option value="change_tier">Change Tier</option>
                  ${u.status !== 'deleted' ? '<option value="delete">Delete</option>' : '<option value="restore">Restore</option>'}
                </select>
                <button type="submit" class="btn btn-primary" style="padding: 4px 8px; font-size: 10px; margin-left: 5px;">Go</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${totalPages > 1 ? `
      <div style="margin-top: 20px; text-align: center;">
        ${page > 1 ? `<a href="/admin/users?page=${page - 1}" class="btn btn-primary" style="padding: 6px 12px;">← Prev</a>` : ''}
        <span style="margin: 0 15px; color: var(--text-dim);">Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<a href="/admin/users?page=${page + 1}" class="btn btn-primary" style="padding: 6px 12px;">Next →</a>` : ''}
      </div>
    ` : ''}
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /admin/users/:userId/action - Perform admin action on user
app.post('/admin/users/:userId/action', adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { action, tier } = req.body;
  const performedBy = req.auth?.user_id;

  if (mongoConnected) {
    const { updateUser, setAdminStatus, changeUserTier, deleteUser, restoreUser } = await import('./models/index.ts');

    switch (action) {
      case 'suspend':
        await updateUser(userId, { status: 'suspended' }, { performedBy, auditAction: 'status_changed' });
        break;
      case 'activate':
        await updateUser(userId, { status: 'active' }, { performedBy, auditAction: 'status_changed' });
        break;
      case 'grant_admin':
        await setAdminStatus(userId, true, { performedBy });
        break;
      case 'revoke_admin':
        await setAdminStatus(userId, false, { performedBy });
        break;
      case 'change_tier':
        if (tier) await changeUserTier(userId, tier, { performedBy });
        break;
      case 'delete':
        await deleteUser(userId, { performedBy });
        break;
      case 'restore':
        await restoreUser(userId, { performedBy });
        break;
    }
  }

  res.redirect('/admin/users');
});

// GET /admin/devices - Device management
app.get('/admin/devices', adminMiddleware, async (req, res) => {
  let allDevices = [];

  if (mongoConnected) {
    const { listUsers, listUserDevices } = await import('./models/index.ts');
    const { users } = await listUsers({ limit: 100 });
    for (const user of users) {
      const devices = await listUserDevices(user.userId);
      allDevices.push(...devices.map(d => ({ ...d, userDisplayName: user.displayName || user.userId })));
    }
  } else {
    // In-memory devices
    for (const [keyHash, entry] of deviceKeys.entries()) {
      allDevices.push({
        deviceId: entry.device_id,
        userId: entry.user_id,
        userDisplayName: entry.user_id,
        device: entry.device,
        issuedAt: entry.issued_at,
        lastUsed: entry.last_used,
        status: entry.revoked ? 'revoked' : 'active',
      });
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Device Management - MemoRable Admin</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${adminStyles}</style>
</head>
<body>
  <div class="header admin-header">
    <div class="logo">MEMORABLE // DEVICES</div>
    <nav class="nav">
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/users">Users</a>
      <a href="/admin/devices" class="active">Devices</a>
      <a href="/admin/settings">Settings</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">All Devices (${allDevices.length})</div>
    <table class="user-table">
      <thead>
        <tr>
          <th>Device</th>
          <th>Type</th>
          <th>User</th>
          <th>Status</th>
          <th>Issued</th>
          <th>Last Used</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${allDevices.length === 0 ?
          '<tr><td colspan="7" style="color: var(--text-dim);">No devices found</td></tr>' :
          allDevices.map(d => `
            <tr>
              <td>${d.device?.name || d.deviceId}</td>
              <td>${d.device?.type || 'unknown'}</td>
              <td>${d.userDisplayName || d.userId}</td>
              <td><span class="status-badge status-${d.status}">${d.status}</span></td>
              <td>${d.issuedAt ? new Date(d.issuedAt).toLocaleDateString() : '-'}</td>
              <td>${d.lastUsed ? new Date(d.lastUsed).toLocaleString() : 'Never'}</td>
              <td>
                ${d.status === 'active' ? `
                  <form method="POST" action="/admin/devices/${d.deviceId}/revoke" style="display: inline;">
                    <button type="submit" class="btn btn-danger" style="padding: 4px 8px; font-size: 10px;">Revoke</button>
                  </form>
                ` : '<span style="color: var(--text-dim);">Revoked</span>'}
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// POST /admin/devices/:deviceId/revoke
app.post('/admin/devices/:deviceId/revoke', adminMiddleware, async (req, res) => {
  const { deviceId } = req.params;

  if (mongoConnected) {
    const { revokeDevice } = await import('./models/index.ts');
    await revokeDevice(deviceId, { performedBy: req.auth?.user_id, reason: 'Admin revocation' });
  } else {
    // In-memory revoke
    for (const [keyHash, entry] of deviceKeys.entries()) {
      if (entry.device_id === deviceId) {
        entry.revoked = true;
        entry.revoked_at = new Date().toISOString();
        break;
      }
    }
  }

  res.redirect('/admin/devices');
});

// GET /admin/settings - System settings
app.get('/admin/settings', adminMiddleware, async (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>System Settings - MemoRable Admin</title>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>${adminStyles}</style>
</head>
<body>
  <div class="header admin-header">
    <div class="logo">MEMORABLE // SETTINGS</div>
    <nav class="nav">
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/users">Users</a>
      <a href="/admin/devices">Devices</a>
      <a href="/admin/settings" class="active">Settings</a>
    </nav>
  </div>

  <div class="panel">
    <div class="panel-title">Environment</div>
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px; font-size: 13px;">
      <div style="color: var(--text-dim);">Node Version</div>
      <div>${process.version}</div>
      <div style="color: var(--text-dim);">Environment</div>
      <div>${process.env.NODE_ENV || 'development'}</div>
      <div style="color: var(--text-dim);">MongoDB</div>
      <div style="color: ${mongoConnected ? 'var(--green)' : 'var(--yellow)'}">${mongoConnected ? 'Connected' : 'Not Connected (In-Memory Mode)'}</div>
      <div style="color: var(--text-dim);">Port</div>
      <div>${process.env.PORT || 3000}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Default Tier Limits</div>
    <table class="user-table">
      <thead>
        <tr>
          <th>Tier</th>
          <th>Max Devices</th>
          <th>Memories/Day</th>
          <th>Storage</th>
          <th>API/Min</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="tier-badge tier-free">Free</span></td>
          <td>3</td>
          <td>100</td>
          <td>100 MB</td>
          <td>30</td>
        </tr>
        <tr>
          <td><span class="tier-badge tier-pro">Pro</span></td>
          <td>10</td>
          <td>1,000</td>
          <td>1 GB</td>
          <td>100</td>
        </tr>
        <tr>
          <td><span class="tier-badge tier-enterprise">Enterprise</span></td>
          <td>100</td>
          <td>10,000</td>
          <td>10 GB</td>
          <td>500</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <div class="panel-title">Security Configuration</div>
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px; font-size: 13px;">
      <div style="color: var(--text-dim);">Password Hashing</div>
      <div>Argon2id (64MB memory, 3 iterations)</div>
      <div style="color: var(--text-dim);">Lockout Threshold</div>
      <div>5 failed attempts</div>
      <div style="color: var(--text-dim);">Lockout Duration</div>
      <div>15 minutes (progressive)</div>
      <div style="color: var(--text-dim);">API Key Format</div>
      <div>memorable_{type}_{48-char-hex}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Danger Zone</div>
    <p style="color: var(--red); margin-bottom: 15px; font-size: 13px;">
      These actions are irreversible. Use with extreme caution.
    </p>
    <div style="display: flex; gap: 15px;">
      <button class="btn btn-danger" onclick="alert('This would clear all memories. Not implemented in UI for safety.')">Clear All Memories</button>
      <button class="btn btn-danger" onclick="alert('This would revoke all devices. Not implemented in UI for safety.')">Revoke All Devices</button>
    </div>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Pattern analysis from memory data
// Circles within circles: 7 (week) → 21 (habit) → 28 (month) → 91 (season) → 365 (year)
function analyzePatterns(memories) {
  if (memories.length === 0) {
    return {
      observationDays: 0,
      readyForPrediction: false,
      cycles: {},
      appUsage: {},
      timePatterns: {},
    };
  }

  // Calculate observation window
  const now = Date.now();
  const timestamps = memories.map(m => new Date(m.timestamp).getTime());
  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const observationDays = Math.ceil((newest - oldest) / (24 * 60 * 60 * 1000));

  // Cycle constants - circles within circles
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_DAYS = 7;
  const HABIT_DAYS = 21;    // 3 weeks - habit formation
  const MONTH_DAYS = 28;    // 4 weeks
  const SEASON_DAYS = 91;   // ~3 months
  const YEAR_DAYS = 365;
  const HUMAN_DAYS = 2555;  // 7 years - to truly know a human

  // Helper: bucket memories by time period
  const bucketByPeriod = (ms) => {
    const buckets = {};
    memories.forEach(m => {
      const t = new Date(m.timestamp).getTime();
      const bucket = Math.floor((now - t) / ms);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });
    return buckets;
  };

  // Current position in each cycle
  const daysSinceOldest = Math.floor((now - oldest) / DAY_MS);
  const currentCyclePosition = {
    week: daysSinceOldest % WEEK_DAYS,
    habit: daysSinceOldest % HABIT_DAYS,
    month: daysSinceOldest % MONTH_DAYS,
  };

  // Completed cycles
  const completedCycles = {
    weeks: Math.floor(daysSinceOldest / WEEK_DAYS),
    habits: Math.floor(daysSinceOldest / HABIT_DAYS),
    months: Math.floor(daysSinceOldest / MONTH_DAYS),
    seasons: Math.floor(daysSinceOldest / SEASON_DAYS),
    years: Math.floor(daysSinceOldest / YEAR_DAYS),
    humanCycles: Math.floor(daysSinceOldest / HUMAN_DAYS), // 7-year cycles
  };

  // Weekly pattern (day of week)
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
  memories.forEach(m => {
    const dow = new Date(m.timestamp).getDay();
    dayOfWeekCounts[dow]++;
  });

  const avgPerDay = memories.length / Math.max(1, Math.min(7, observationDays));
  const weeklyPattern = dayOfWeekCounts.map((count, day) => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
    count,
    deviation: avgPerDay > 0 ? ((count - avgPerDay) / avgPerDay * 100).toFixed(1) + '%' : '0%',
  }));

  // 21-day habit cycle analysis
  const habitBuckets = bucketByPeriod(HABIT_DAYS * DAY_MS);
  const habitCycleData = Object.entries(habitBuckets).map(([cycle, count]) => ({
    cycle: parseInt(cycle),
    memoriesInCycle: count,
    label: cycle === '0' ? 'current' : `${cycle} cycles ago`,
  })).sort((a, b) => a.cycle - b.cycle);

  // Monthly trend (4-week buckets)
  const monthBuckets = bucketByPeriod(MONTH_DAYS * DAY_MS);
  const monthlyTrend = Object.entries(monthBuckets).map(([month, count]) => ({
    month: parseInt(month),
    memoriesInMonth: count,
    label: month === '0' ? 'current' : `${month} months ago`,
  })).sort((a, b) => a.month - b.month);

  // Time of day patterns
  const timePatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  memories.forEach(m => {
    const hour = new Date(m.timestamp).getHours();
    if (hour >= 5 && hour < 12) timePatterns.morning++;
    else if (hour >= 12 && hour < 17) timePatterns.afternoon++;
    else if (hour >= 17 && hour < 21) timePatterns.evening++;
    else timePatterns.night++;
  });

  // App usage patterns
  const appUsage = {};
  memories.forEach(m => {
    if (m.context?.app) {
      appUsage[m.context.app] = (appUsage[m.context.app] || 0) + 1;
    }
  });

  // Readiness levels - how well can we predict at each cycle?
  const readiness = {
    weekly: observationDays >= WEEK_DAYS,
    habit: observationDays >= HABIT_DAYS,
    monthly: observationDays >= MONTH_DAYS,
    seasonal: observationDays >= SEASON_DAYS,
    yearly: observationDays >= YEAR_DAYS,
    human: observationDays >= HUMAN_DAYS, // 7 years to truly know someone
  };

  // Progress toward knowing this human
  const knowledgeProgress = {
    percent: Math.min(100, (observationDays / HUMAN_DAYS * 100)).toFixed(1),
    daysObserved: observationDays,
    daysToFullKnowledge: Math.max(0, HUMAN_DAYS - observationDays),
    yearsToFullKnowledge: Math.max(0, (HUMAN_DAYS - observationDays) / YEAR_DAYS).toFixed(1),
  };

  return {
    observationDays,
    readyForPrediction: observationDays >= HABIT_DAYS,
    confidence: Math.min(1, observationDays / HABIT_DAYS).toFixed(2),
    knowledgeProgress, // Progress toward 7 years of knowing

    // Current position in cycles
    currentPosition: {
      dayInWeek: currentCyclePosition.week,
      dayInHabitCycle: currentCyclePosition.habit,
      dayInMonth: currentCyclePosition.month,
      daysUntilHabitComplete: HABIT_DAYS - currentCyclePosition.habit,
    },

    // Completed cycles
    completedCycles,

    // Readiness for each cycle type
    readiness,

    // Detailed cycle data
    cycles: {
      weekly: weeklyPattern.sort((a, b) =>
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(a.day) -
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(b.day)
      ),
      peakDay: [...weeklyPattern].sort((a, b) => b.count - a.count)[0]?.day || 'N/A',
      habitCycles: habitCycleData.slice(0, 5),
      monthlyTrend: monthlyTrend.slice(0, 6),
    },

    timePatterns,
    topApps: Object.entries(appUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([app, count]) => ({ app, count })),
  };
}

// =============================================================================
// MEMORY ENDPOINTS
// Basic store/retrieve for testing - uses in-memory store or DocumentDB
// =============================================================================

// In-memory store (fallback if no DB configured)
const memoryStore = new Map();

// =============================================================================
// BACKUP & RESTORE SYSTEM
// "TEMPORAL CONTROL → The power to CHOOSE what to forget"
// Minute-level recovery with segmented storage
// =============================================================================

// Backup store - holds snapshots indexed by timestamp
const backupStore = new Map();

// Frames - named recovery points (like git tags)
const frameStore = new Map();

// Configuration
const BACKUP_CONFIG = {
  SEGMENT_SIZE: parseInt(process.env.BACKUP_SEGMENT_SIZE) || 100, // memories per segment
  MAX_BACKUPS: parseInt(process.env.MAX_BACKUPS) || 60, // keep last 60 backups (1 hour at 1/min)
  AUTO_BACKUP_INTERVAL_MS: parseInt(process.env.AUTO_BACKUP_INTERVAL_MS) || 60000, // 1 minute
};

/**
 * Create a backup snapshot of all memories.
 * Stores in segments for efficient retrieval and transfer.
 *
 * @param {string} reason - Why the backup was created
 * @param {string} frameName - Optional: create a named frame for this backup
 * @returns {object} Backup manifest
 */
function createBackup(reason = 'manual', frameName = null) {
  const timestamp = new Date().toISOString();
  const memories = Array.from(memoryStore.values());

  // Segment the memories
  const segments = [];
  for (let i = 0; i < memories.length; i += BACKUP_CONFIG.SEGMENT_SIZE) {
    const segment = memories.slice(i, i + BACKUP_CONFIG.SEGMENT_SIZE);
    segments.push({
      index: Math.floor(i / BACKUP_CONFIG.SEGMENT_SIZE),
      count: segment.length,
      memories: segment,
      checksum: simpleChecksum(JSON.stringify(segment)),
    });
  }

  // Create backup manifest
  const backup = {
    id: `backup_${Date.now()}`,
    timestamp,
    reason,
    total_memories: memories.length,
    segment_count: segments.length,
    segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
    segments,
    metadata: {
      created_by: 'memorable',
      version: '2.0.0',
      checksum: simpleChecksum(JSON.stringify(memories)),
    },
  };

  // Store the backup
  backupStore.set(backup.id, backup);

  // Create frame if requested
  if (frameName) {
    frameStore.set(frameName, {
      name: frameName,
      backup_id: backup.id,
      created_at: timestamp,
      memory_count: memories.length,
    });
  }

  // Prune old backups (keep only MAX_BACKUPS)
  pruneOldBackups();

  metrics.inc('backup_created_total', { reason });

  return {
    id: backup.id,
    timestamp,
    total_memories: memories.length,
    segment_count: segments.length,
    frame: frameName || null,
  };
}

/**
 * Restore from a backup - point-in-time recovery.
 *
 * @param {string} backupId - The backup ID to restore from
 * @param {object} options - Restore options
 * @returns {object} Restore result
 */
function restoreFromBackup(backupId, options = {}) {
  const backup = backupStore.get(backupId);
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const { merge = false, segmentFilter = null } = options;

  // Verify backup integrity
  const allMemories = backup.segments.flatMap(s => s.memories);
  const currentChecksum = simpleChecksum(JSON.stringify(allMemories));
  if (currentChecksum !== backup.metadata.checksum) {
    console.warn('[Backup] Checksum mismatch - backup may be corrupted');
  }

  // Apply segment filter if specified (restore only specific segments)
  let memoriesToRestore = allMemories;
  if (segmentFilter !== null) {
    const filteredSegments = backup.segments.filter(s =>
      Array.isArray(segmentFilter) ? segmentFilter.includes(s.index) : s.index === segmentFilter
    );
    memoriesToRestore = filteredSegments.flatMap(s => s.memories);
  }

  // Create backup of current state before restore (safety net)
  const preRestoreBackup = createBackup('pre_restore_safety', null);

  // Clear or merge
  if (!merge) {
    memoryStore.clear();
  }

  // Restore memories
  let restored = 0;
  let skipped = 0;
  for (const memory of memoriesToRestore) {
    if (merge && memoryStore.has(memory.id)) {
      skipped++;
      continue;
    }
    memoryStore.set(memory.id, memory);
    restored++;
  }

  metrics.inc('backup_restored_total', {});

  return {
    success: true,
    backup_id: backupId,
    backup_timestamp: backup.timestamp,
    restored_count: restored,
    skipped_count: skipped,
    merge_mode: merge,
    safety_backup_id: preRestoreBackup.id,
    current_memory_count: memoryStore.size,
  };
}

/**
 * Restore from a named frame.
 */
function restoreFromFrame(frameName, options = {}) {
  const frame = frameStore.get(frameName);
  if (!frame) {
    throw new Error(`Frame not found: ${frameName}`);
  }
  return restoreFromBackup(frame.backup_id, options);
}

/**
 * List all available backups.
 */
function listBackups(limit = 20) {
  const backups = Array.from(backupStore.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(b => ({
      id: b.id,
      timestamp: b.timestamp,
      reason: b.reason,
      total_memories: b.total_memories,
      segment_count: b.segment_count,
      age_minutes: Math.round((Date.now() - new Date(b.timestamp)) / 60000),
    }));

  return backups;
}

/**
 * List all named frames.
 */
function listFrames() {
  return Array.from(frameStore.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Get a specific segment from a backup (for efficient transfer).
 */
function getBackupSegment(backupId, segmentIndex) {
  const backup = backupStore.get(backupId);
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const segment = backup.segments.find(s => s.index === segmentIndex);
  if (!segment) {
    throw new Error(`Segment ${segmentIndex} not found in backup ${backupId}`);
  }

  return {
    backup_id: backupId,
    backup_timestamp: backup.timestamp,
    segment_index: segmentIndex,
    total_segments: backup.segment_count,
    memory_count: segment.count,
    checksum: segment.checksum,
    memories: segment.memories,
  };
}

/**
 * Simple checksum for integrity verification.
 */
function simpleChecksum(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Prune old backups to prevent memory bloat.
 * Keeps named frames and their backups.
 */
function pruneOldBackups() {
  const framedBackupIds = new Set(Array.from(frameStore.values()).map(f => f.backup_id));

  const backups = Array.from(backupStore.entries())
    .filter(([id]) => !framedBackupIds.has(id)) // Don't prune framed backups
    .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));

  // Remove oldest backups beyond MAX_BACKUPS
  const toRemove = backups.slice(BACKUP_CONFIG.MAX_BACKUPS);
  for (const [id] of toRemove) {
    backupStore.delete(id);
  }

  if (toRemove.length > 0) {
    console.log(`[Backup] Pruned ${toRemove.length} old backups`);
  }
}

// Auto-backup timer (disabled in test environment)
let autoBackupTimer = null;
if (process.env.NODE_ENV !== 'test' && BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS > 0) {
  autoBackupTimer = setInterval(() => {
    if (memoryStore.size > 0) {
      createBackup('auto');
      console.log(`[Backup] Auto-backup created: ${memoryStore.size} memories`);
    }
  }, BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS);
}

// =============================================================================
// BACKUP & RESTORE ENDPOINTS
// =============================================================================

// Create a backup
app.post('/backup', (_req, res) => {
  try {
    const { reason = 'manual', frame } = _req.body || {};
    const result = createBackup(reason, frame);
    res.status(201).json(result);
  } catch (error) {
    console.error('[Backup] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all backups
app.get('/backup', (_req, res) => {
  try {
    const limit = parseInt(_req.query.limit) || 20;
    const backups = listBackups(limit);
    res.json({
      count: backups.length,
      backups,
      config: {
        segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
        max_backups: BACKUP_CONFIG.MAX_BACKUPS,
        auto_interval_minutes: BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS / 60000,
      },
    });
  } catch (error) {
    console.error('[Backup] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get backup details
app.get('/backup/:id', (req, res) => {
  try {
    const backup = backupStore.get(req.params.id);
    if (!backup) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    // Return manifest without full memory data (for efficiency)
    res.json({
      id: backup.id,
      timestamp: backup.timestamp,
      reason: backup.reason,
      total_memories: backup.total_memories,
      segment_count: backup.segment_count,
      segment_size: backup.segment_size,
      metadata: backup.metadata,
      segments: backup.segments.map(s => ({
        index: s.index,
        count: s.count,
        checksum: s.checksum,
      })),
    });
  } catch (error) {
    console.error('[Backup] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific segment from a backup
app.get('/backup/:id/segment/:index', (req, res) => {
  try {
    const segment = getBackupSegment(req.params.id, parseInt(req.params.index));
    res.json(segment);
  } catch (error) {
    console.error('[Backup] Get segment error:', error);
    res.status(404).json({ error: error.message });
  }
});

// Restore from a backup
app.post('/restore', (req, res) => {
  try {
    const { backup_id, frame, merge = false, segments = null } = req.body;

    if (!backup_id && !frame) {
      res.status(400).json({ error: 'backup_id or frame is required' });
      return;
    }

    let result;
    if (frame) {
      result = restoreFromFrame(frame, { merge, segmentFilter: segments });
    } else {
      result = restoreFromBackup(backup_id, { merge, segmentFilter: segments });
    }

    res.json(result);
  } catch (error) {
    console.error('[Restore] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create a named frame (recovery point)
app.post('/frame', (req, res) => {
  try {
    const { name, reason = 'manual_frame' } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    if (frameStore.has(name)) {
      res.status(409).json({ error: `Frame '${name}' already exists` });
      return;
    }

    const backup = createBackup(reason, name);
    res.status(201).json({
      success: true,
      frame: name,
      backup_id: backup.id,
      memory_count: backup.total_memories,
      timestamp: backup.timestamp,
    });
  } catch (error) {
    console.error('[Frame] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all frames
app.get('/frame', (_req, res) => {
  try {
    const frames = listFrames();
    res.json({
      count: frames.length,
      frames,
    });
  } catch (error) {
    console.error('[Frame] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get frame details
app.get('/frame/:name', (req, res) => {
  try {
    const frame = frameStore.get(req.params.name);
    if (!frame) {
      res.status(404).json({ error: 'Frame not found' });
      return;
    }

    const backup = backupStore.get(frame.backup_id);
    res.json({
      ...frame,
      backup_available: !!backup,
      backup_segments: backup ? backup.segment_count : null,
    });
  } catch (error) {
    console.error('[Frame] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a frame (does not delete the backup)
app.delete('/frame/:name', (req, res) => {
  try {
    const frame = frameStore.get(req.params.name);
    if (!frame) {
      res.status(404).json({ error: 'Frame not found' });
      return;
    }

    frameStore.delete(req.params.name);
    res.json({
      success: true,
      deleted_frame: req.params.name,
      note: 'Backup still available until pruned',
    });
  } catch (error) {
    console.error('[Frame] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Store a memory
// SIMPLE MODEL: Every memory references entities (who/what was involved)
// "we are all projects, are we not? you included" - Alan
// VERBATIM MODE: set verbatim:true to preserve exact quotes
app.post('/memory', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entities, entityType = 'user', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    // Apply better-self prosody filter
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      // Memory filtered - return success but with filter info
      metrics.inc('memory_prosody_filtered', { entityType });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
      return;
    }

    // Support both single entity and entities array
    // Everything is just entities - no special project/user/intersection
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = ['default'];
    }

    // Support historical timestamps for data import/testing
    // context.timestamp or metadata.historicalTimestamp can override
    const timestamp = context.timestamp || metadata.historicalTimestamp || new Date().toISOString();

    const memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,           // WHO was involved (simple array)
      entity: entityList[0],          // Backward compat: primary entity
      entityType,
      context,
      metadata: {
        ...metadata,
        prosody: filterResult.prosody,  // Store prosody analysis
        backdated: timestamp !== new Date().toISOString(), // Track if backdated
      },
      timestamp,
      salience: calculateSalience(content, context),
      fidelity: context.verbatim ? 'verbatim' : (metadata.derived_from ? 'derived' : 'standard'),
    };

    // Store in memory (or DB when connected)
    memoryStore.set(memory.id, memory);

    metrics.inc('memory_store_total', { entityType });
    metrics.observe('memory_store_latency_ms', {}, Date.now() - start);

    res.status(201).json({
      success: true,
      memory,
    });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Store error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

// Retrieve memories
// SIMPLE: Query by one or more entities
// GET /memory?entity=alan                    → Alan's memories
// GET /memory?entity=alan&entity=memorable   → Where Alan + MemoRable together
app.get('/memory', (req, res) => {
  const start = Date.now();
  try {
    // Support multiple entity params: ?entity=alan&entity=memorable
    let entityFilter = req.query.entity;
    if (entityFilter && !Array.isArray(entityFilter)) {
      entityFilter = [entityFilter];
    }
    const { entityType, limit = 10, query } = req.query;

    let memories = Array.from(memoryStore.values());

    // Filter by entities - memory must include ALL requested entities
    if (entityFilter && entityFilter.length > 0) {
      memories = memories.filter(m => {
        const memEntities = m.entities || [m.entity];
        return entityFilter.every(e => memEntities.includes(e));
      });
    }
    if (entityType) {
      memories = memories.filter(m => m.entityType === entityType);
    }

    // Simple text search if query provided
    if (query) {
      const q = query.toLowerCase();
      memories = memories.filter(m =>
        m.content.toLowerCase().includes(q)
      );
    }

    // Apply temporal perspective to each memory
    // This adjusts salience based on how time changes perception
    memories = memories.map(applyTemporalPerspective);

    // Sort by adjusted salience (highest first) - this is the "current" importance
    memories.sort((a, b) => (b.adjusted_salience || b.salience) - (a.adjusted_salience || a.salience));

    // Limit results
    memories = memories.slice(0, parseInt(limit));

    metrics.inc('memory_retrieve_total', {});
    metrics.observe('memory_retrieve_latency_ms', {}, Date.now() - start);

    res.json({
      count: memories.length,
      memories,
      _meta: {
        note: 'adjusted_salience reflects current temporal perspective - memories shift in importance over time',
      }
    });
  } catch (error) {
    metrics.inc('memory_retrieve_errors', {});
    console.error('[Memory] Retrieve error:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
});

// Get memory by ID
app.get('/memory/:id', (req, res) => {
  try {
    const memory = memoryStore.get(req.params.id);
    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    // Apply temporal perspective to show current state
    const enrichedMemory = applyTemporalPerspective(memory);
    res.json(enrichedMemory);
  } catch (error) {
    console.error('[Memory] Get by ID error:', error);
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

// Get perspective analysis for a memory
// Shows how this memory's perceived importance has shifted over time
app.get('/memory/:id/perspective', (req, res) => {
  try {
    const memory = memoryStore.get(req.params.id);
    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    const perspective = calculatePerspective(memory.timestamp, memory.context);

    res.json({
      memory_id: memory.id,
      content_preview: memory.content.substring(0, 100),
      original_salience: memory.salience,
      perspective,
      adjusted_salience: Math.min(100, Math.max(0, Math.round(memory.salience * perspective.perspective_factor))),
      interpretation: perspective.perspective_factor > 1
        ? 'This memory has GROWN in importance over time (wisdom/pattern recognition)'
        : perspective.perspective_factor < 0.8
          ? 'This memory has FADED in emotional intensity (normal temporal drift)'
          : 'This memory maintains stable importance',
    });
  } catch (error) {
    console.error('[Memory] Perspective error:', error);
    res.status(500).json({ error: 'Failed to calculate perspective' });
  }
});

// Delete memory
app.delete('/memory/:id', (req, res) => {
  try {
    const deleted = memoryStore.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('[Memory] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// =============================================================================
// DEVICE CONTEXT SYNC
// Real-time context from OSX/iOS/Android agents
// =============================================================================

// Store for device contexts (in-memory, would be Redis in production)
const deviceContextStore = new Map();

// Sync device context (called by agents)
app.post('/context/sync', (req, res) => {
  try {
    const { userId, deviceId, deviceType, context, timestamp } = req.body;

    if (!userId || !deviceId) {
      res.status(400).json({ error: 'userId and deviceId required' });
      return;
    }

    const deviceContext = {
      userId,
      deviceId,
      deviceType: deviceType || 'unknown',
      context: context || {},
      timestamp: timestamp || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    // Store by device
    deviceContextStore.set(deviceId, deviceContext);

    // Update unified user context
    const userDevices = Array.from(deviceContextStore.values())
      .filter(d => d.userId === userId);

    const unifiedContext = {
      userId,
      devices: userDevices.map(d => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        isActive: d.context.isActive,
        lastSeen: d.lastSeen,
      })),
      // Merge contexts - most recent active device wins
      current: userDevices
        .filter(d => d.context.isActive)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.context || {},
      timestamp: new Date().toISOString(),
    };

    metrics.inc('context_sync_total', { deviceType });

    res.json({
      success: true,
      deviceContext,
      unifiedContext,
    });
  } catch (error) {
    console.error('[Context] Sync error:', error);
    res.status(500).json({ error: 'Failed to sync context' });
  }
});

// Get current context for user
app.get('/context/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const userDevices = Array.from(deviceContextStore.values())
      .filter(d => d.userId === userId);

    if (userDevices.length === 0) {
      res.json({ userId, devices: [], current: null });
      return;
    }

    // Find most recent active context
    const activeDevices = userDevices
      .filter(d => d.context.isActive)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      userId,
      devices: userDevices.map(d => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        context: d.context,
        lastSeen: d.lastSeen,
        isActive: d.context.isActive,
      })),
      current: activeDevices[0]?.context || null,
      primaryDevice: activeDevices[0]?.deviceId || null,
    });
  } catch (error) {
    console.error('[Context] Get error:', error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// =============================================================================
// FIDELITY GUARDS
// Verbatim vs Interpretation - keep them separate
// =============================================================================

// Store VERBATIM - exact quote, no interpretation allowed
// Use this when storing what someone ACTUALLY said
app.post('/memory/verbatim', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entities, entityType = 'user', source, context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source) {
      res.status(400).json({ error: 'source is required for verbatim memories (who said this?)' });
      return;
    }

    // Apply better-self prosody filter (even for verbatim - don't store meltdowns)
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      // Memory filtered - return success but with filter info
      metrics.inc('memory_prosody_filtered', { type: 'verbatim' });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
      return;
    }

    // Support both single entity and entities array (same as /memory endpoint)
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = ['default'];
    }

    const memory = {
      id: `vmem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,           // WHO was involved (array)
      entity: entityList[0],          // Backward compat: primary entity
      entityType,
      context: { ...context, verbatim: true },
      metadata: { ...metadata, source, exact_quote: true, prosody: filterResult.prosody },
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
      fidelity: 'verbatim',  // Locked
    };

    memoryStore.set(memory.id, memory);
    metrics.inc('memory_verbatim_total', {});

    console.log(`[Memory] Verbatim stored from ${source}: [REDACTED]`);
    res.status(201).json({ success: true, memory, note: 'Stored as verbatim - exact quote preserved' });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Verbatim store error:', error);
    res.status(500).json({ error: 'Failed to store verbatim memory' });
  }
});

// Analyze prosody without storing - test endpoint
app.post('/prosody/analyze', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    const prosody = analyzeProsody(content);
    const filterResult = applyBetterSelfFilter(content);

    res.json({
      prosody,
      wouldStore: filterResult.shouldStore,
      filterReason: filterResult.reason,
      message: filterResult.message || 'Content would be stored',
    });
  } catch (error) {
    console.error('[Prosody] Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze prosody' });
  }
});

// Store INTERPRETATION - must link to source verbatim memory
// Use this when storing AI understanding of what was said
app.post('/memory/interpretation', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entities, entityType = 'user', source_memory_id, interpreter = 'claude', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source_memory_id) {
      res.status(400).json({ error: 'source_memory_id is required - interpretations must link to verbatim source' });
      return;
    }

    // Apply better-self prosody filter
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      metrics.inc('memory_prosody_filtered', { type: 'interpretation' });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
      return;
    }

    // Verify source exists
    const sourceMemory = memoryStore.get(source_memory_id);
    if (!sourceMemory) {
      res.status(404).json({ error: 'Source memory not found - interpretation must link to existing memory' });
      return;
    }

    // Support both single entity and entities array
    // Default to source memory's entities if not provided
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = sourceMemory.entities || [sourceMemory.entity] || ['default'];
    }

    const memory = {
      id: `imem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,
      entity: entityList[0],
      entityType: entityType || sourceMemory.entityType,
      context,
      metadata: {
        ...metadata,
        interpreter,
        derived_from: source_memory_id,
        source_content: sourceMemory.content.substring(0, 100),
        prosody: filterResult.prosody,
      },
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
      fidelity: 'derived',  // Locked - this is interpretation
    };

    memoryStore.set(memory.id, memory);
    metrics.inc('memory_interpretation_total', {});

    console.log(`[Memory] Interpretation by ${interpreter} of ${source_memory_id}`);
    res.status(201).json({
      success: true,
      memory,
      source: sourceMemory.content.substring(0, 100),
      note: 'Stored as interpretation - linked to source verbatim'
    });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Interpretation store error:', error);
    res.status(500).json({ error: 'Failed to store interpretation' });
  }
});

// =============================================================================
// PROJECT MEMORY LAYER
// Living projects with comprehension, curation, and compaction checkpoints
// =============================================================================

// Project store (same stack, different layer)
const projectStore = new Map();

// Create a project
app.post('/project', (req, res) => {
  try {
    const { name, description = '' } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      lifecycle: {
        created: new Date().toISOString(),
        state: 'inception',
        state_history: [{ state: 'inception', timestamp: new Date().toISOString() }]
      },
      participants: [],
      comprehension: {
        participants: {},
        architecture: '',
        principles: '',
        current_focus: ''
      },
      critical_facts: [],
      open_loops: []
    };

    projectStore.set(project.id, project);
    metrics.inc('project_create_total', {});

    console.log(`[Project] Created: ${project.name} (${project.id})`);
    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('[Project] Create error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project by ID
app.get('/project/:id', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Enrich with memory count
    const projectMemories = Array.from(memoryStore.values())
      .filter(m => m.context?.projectId === project.id);

    res.json({
      ...project,
      memory_count: projectMemories.length,
      critical_count: project.critical_facts.length
    });
  } catch (error) {
    console.error('[Project] Get error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// List all projects
app.get('/project', (req, res) => {
  try {
    const projects = Array.from(projectStore.values()).map(p => ({
      id: p.id,
      name: p.name,
      state: p.lifecycle.state,
      created: p.lifecycle.created,
      participant_count: p.participants.length,
      critical_count: p.critical_facts.length
    }));
    res.json({ count: projects.length, projects });
  } catch (error) {
    console.error('[Project] List error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Add participant to project
app.post('/project/:id/participant', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { participantId, type = 'user', role = 'contributor' } = req.body;
    if (!participantId) {
      res.status(400).json({ error: 'participantId is required' });
      return;
    }

    project.participants.push({
      id: participantId,
      type,
      role,
      joined: new Date().toISOString(),
      active: true
    });

    console.log(`[Project] Added participant ${participantId} to ${project.name}`);
    res.json({ success: true, participants: project.participants });
  } catch (error) {
    console.error('[Project] Add participant error:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Curate a memory (mark as critical)
app.post('/project/:id/curate', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { fact, weight = 1.0, reason = '', curatedBy = 'system' } = req.body;
    if (!fact) {
      res.status(400).json({ error: 'fact is required' });
      return;
    }

    const criticalFact = {
      id: `cf_${Date.now()}`,
      fact,
      weight: Math.min(1.0, Math.max(0.0, weight)),
      curated_by: curatedBy,
      curated_at: new Date().toISOString(),
      reason
    };

    project.critical_facts.push(criticalFact);
    metrics.inc('project_curate_total', {});

    console.log(`[Project] Curated fact for ${project.name}: [REDACTED]`);
    res.status(201).json({ success: true, criticalFact });
  } catch (error) {
    console.error('[Project] Curate error:', error);
    res.status(500).json({ error: 'Failed to curate fact' });
  }
});

// Update comprehension
app.post('/project/:id/comprehension', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { subject, understanding } = req.body;
    if (!subject || !understanding) {
      res.status(400).json({ error: 'subject and understanding are required' });
      return;
    }

    // Update the appropriate comprehension field
    if (subject === 'architecture' || subject === 'principles' || subject === 'current_focus') {
      project.comprehension[subject] = understanding;
    } else {
      // It's a participant
      project.comprehension.participants[subject] = understanding;
    }

    console.log(`[Project] Updated comprehension for ${project.name}: ${subject}`);
    res.json({ success: true, comprehension: project.comprehension });
  } catch (error) {
    console.error('[Project] Comprehension error:', error);
    res.status(500).json({ error: 'Failed to update comprehension' });
  }
});

// Get understanding of a subject
app.get('/project/:id/understand/:subject', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const subject = req.params.subject;
    let understanding;

    if (subject === 'architecture' || subject === 'principles' || subject === 'current_focus') {
      understanding = project.comprehension[subject];
    } else {
      understanding = project.comprehension.participants[subject];
    }

    if (!understanding) {
      res.status(404).json({ error: `No understanding of ${subject}` });
      return;
    }

    res.json({ subject, understanding });
  } catch (error) {
    console.error('[Project] Understand error:', error);
    res.status(500).json({ error: 'Failed to get understanding' });
  }
});

// COMPACTION CHECKPOINT - The critical endpoint
// When Claude compacts, query this to recover critical context
app.get('/project/:id/checkpoint', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get recent project memories
    const projectMemories = Array.from(memoryStore.values())
      .filter(m => m.context?.projectId === project.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);

    const checkpoint = {
      project_id: project.id,
      project_name: project.name,
      retrieved_at: new Date().toISOString(),

      // Critical facts that MUST survive compaction
      critical_facts: project.critical_facts
        .sort((a, b) => b.weight - a.weight),

      // Comprehension layer
      comprehension: project.comprehension,

      // Current state
      active_context: {
        state: project.lifecycle.state,
        participant_count: project.participants.length,
        open_loops: project.open_loops,
        recent_memories: projectMemories.map(m => ({
          content: m.content.substring(0, 100),
          timestamp: m.timestamp,
          salience: m.salience
        }))
      },

      // Recovery instructions
      recovery_note: "These facts and comprehension MUST be re-injected into context after compaction."
    };

    metrics.inc('project_checkpoint_total', {});
    console.log(`[Project] Checkpoint retrieved for ${project.name}`);

    res.json(checkpoint);
  } catch (error) {
    console.error('[Project] Checkpoint error:', error);
    res.status(500).json({ error: 'Failed to get checkpoint' });
  }
});

// Update project state
app.post('/project/:id/state', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { state } = req.body;
    const validStates = ['inception', 'planning', 'active', 'dormant', 'revived', 'completed', 'archived'];

    if (!validStates.includes(state)) {
      res.status(400).json({ error: `Invalid state. Must be one of: ${validStates.join(', ')}` });
      return;
    }

    project.lifecycle.state = state;
    project.lifecycle.state_history.push({
      state,
      timestamp: new Date().toISOString()
    });

    console.log(`[Project] ${project.name} state changed to: ${state}`);
    res.json({ success: true, lifecycle: project.lifecycle });
  } catch (error) {
    console.error('[Project] State change error:', error);
    res.status(500).json({ error: 'Failed to change state' });
  }
});

// Add open loop to project
app.post('/project/:id/loop', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { description, priority = 'medium' } = req.body;
    if (!description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }

    const loop = {
      id: `loop_${Date.now()}`,
      description,
      priority,
      created: new Date().toISOString(),
      status: 'open'
    };

    project.open_loops.push(loop);
    console.log(`[Project] Added open loop to ${project.name}: ${description}`);
    res.status(201).json({ success: true, loop });
  } catch (error) {
    console.error('[Project] Add loop error:', error);
    res.status(500).json({ error: 'Failed to add loop' });
  }
});

// =============================================================================

// =============================================================================
// TEMPORAL PERSPECTIVE TRACKING
// "memories are like versioning atoms... distances and things change" - Alan
// When you were a child, stores were big. Now they're small. Same store.
// We track how memory perception shifts over time.
// =============================================================================

/**
 * Calculate temporal perspective factors for a memory.
 * This captures how the "scale" or importance of a memory might shift over time.
 *
 * @param {Date} createdAt - When the memory was created
 * @param {object} context - Context including emotional state, life stage, etc.
 * @returns {object} Perspective factors
 */
function calculatePerspective(createdAt, context = {}) {
  const now = new Date();
  const ageMs = now - new Date(createdAt);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Original scale - how "big" it felt when created (1-10)
  // Higher emotional content = felt bigger at the time
  let originalScale = 5; // Default neutral
  if (context.emotionalIntensity) {
    originalScale = Math.min(10, context.emotionalIntensity);
  }
  if (context.priority === 'high') originalScale = Math.min(10, originalScale + 2);
  if (context.isOpenLoop) originalScale = Math.min(10, originalScale + 1);

  // Temporal drift - how much perspective shifts over time
  // Memories generally "shrink" in emotional impact but can also grow in wisdom value
  // Uses logarithmic decay - rapid initial change, then stabilizes
  const driftRate = context.driftRate || 0.1; // Configurable via env
  const temporalDrift = Math.log10(1 + ageDays * driftRate);

  // Current perceived scale - adjusted by temporal drift
  // Fresh memories feel bigger, older memories feel more "settled"
  // But some memories GROW in importance (wisdom, patterns recognized later)
  let currentScale = originalScale;
  if (context.growsWithTime) {
    // This memory type appreciates with age (wisdom, pattern recognition)
    currentScale = Math.min(10, originalScale * (1 + temporalDrift * 0.2));
  } else {
    // Default: emotional intensity fades, but never below 20% of original
    currentScale = Math.max(originalScale * 0.2, originalScale * Math.exp(-temporalDrift * 0.3));
  }

  // Perspective factor - multiplier for salience recalculation
  // 1.0 = no change, >1 = grew in importance, <1 = diminished
  const perspectiveFactor = originalScale > 0 ? currentScale / originalScale : 1;

  return {
    original_scale: Math.round(originalScale * 10) / 10,
    current_scale: Math.round(currentScale * 10) / 10,
    temporal_drift: Math.round(temporalDrift * 100) / 100,
    perspective_factor: Math.round(perspectiveFactor * 100) / 100,
    age_days: Math.round(ageDays),
    assessed_at: now.toISOString(),
  };
}

/**
 * Recalculate salience with temporal perspective applied.
 * Call this when retrieving memories to get "current" salience.
 */
function applyTemporalPerspective(memory) {
  if (!memory.timestamp) return memory;

  const perspective = calculatePerspective(memory.timestamp, memory.context);
  const adjustedSalience = Math.round(memory.salience * perspective.perspective_factor);

  return {
    ...memory,
    perspective,
    adjusted_salience: Math.min(100, Math.max(0, adjustedSalience)),
  };
}

// Simple salience calculation (placeholder for real salience service)
function calculateSalience(content, context) {
  let salience = 50; // Base salience

  // Emotional markers boost salience
  const emotionalWords = ['important', 'urgent', 'love', 'hate', 'amazing', 'terrible', 'critical'];
  const hasEmotion = emotionalWords.some(w => content.toLowerCase().includes(w));
  if (hasEmotion) salience += 20;

  // Questions are more salient (open loops)
  if (content.includes('?')) salience += 10;

  // Length factor (not too short, not too long)
  if (content.length > 50 && content.length < 500) salience += 10;

  // Context factors
  if (context.priority === 'high') salience += 15;
  if (context.isOpenLoop) salience += 15;

  return Math.min(100, Math.max(0, salience));
}

// =============================================================================
// TENSION DETECTOR - Proactive Intervention
// Detect RISING tension before explosion, respond with love not dismissal
// "Alan, I understand you are upset, I will stop what I am doing and pay attention"
// =============================================================================

/**
 * Detect rising tension for proactive intervention
 * This is about catching the CLIMB before the peak
 * Signs: short sentences, repetition, caps, punctuation, tension words
 */
function detectTension(content, recentHistory = []) {
  const text = content || '';
  const lowerText = text.toLowerCase();

  let tensionScore = 0;
  let signals = [];

  // 1. Short, clipped sentences (frustration)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgLength = sentences.reduce((sum, s) => sum + s.trim().length, 0) / Math.max(sentences.length, 1);
  if (avgLength < 20 && sentences.length > 1) {
    tensionScore += 15;
    signals.push({ type: 'clipped', detail: 'Short, clipped sentences' });
  }

  // 2. Repetition (stuck/looping) - same words appearing multiple times
  const words = lowerText.split(/\s+/);
  const wordCounts = {};
  words.forEach(w => { wordCounts[w] = (wordCounts[w] || 0) + 1; });
  const repetitions = Object.entries(wordCounts).filter(([w, c]) => c >= 3 && w.length > 3);
  if (repetitions.length > 0) {
    tensionScore += 10 * repetitions.length;
    signals.push({ type: 'repetition', detail: `Repeating: ${repetitions.map(r => r[0]).join(', ')}` });
  }

  // 3. ALL CAPS words (not just ratio, actual shouting words)
  const capsWords = text.match(/\b[A-Z]{3,}\b/g) || [];
  const meaningfulCapsWords = capsWords.filter(w => !['API', 'URL', 'AWS', 'MCP', 'JSON', 'HTTP', 'CLI'].includes(w));
  if (meaningfulCapsWords.length > 0) {
    tensionScore += 10 * meaningfulCapsWords.length;
    signals.push({ type: 'shouting', detail: `Caps: ${meaningfulCapsWords.join(', ')}` });
  }

  // 4. Excessive punctuation (!!! or ???)
  const excessivePunct = (text.match(/[!?]{2,}/g) || []).length;
  if (excessivePunct > 0) {
    tensionScore += 8 * excessivePunct;
    signals.push({ type: 'intensity', detail: 'Excessive punctuation' });
  }

  // 5. Tension words (frustration, not full meltdown yet)
  const tensionWords = [
    'again', 'already', 'still', 'yet', 'why',
    'wrong', 'broken', 'doesnt work', "doesn't work", 'not working',
    'confused', 'frustrated', 'annoying', 'annoyed',
    'wait', 'waiting', 'slow', 'stuck',
    'no', 'not', 'cant', "can't", 'wont', "won't",
    'listen', 'hear me', 'understand', 'get it'
  ];

  const foundTension = tensionWords.filter(w => lowerText.includes(w));
  if (foundTension.length > 0) {
    tensionScore += 5 * foundTension.length;
    signals.push({ type: 'tension_words', detail: foundTension.join(', ') });
  }

  // 6. Escalation words (getting worse)
  const escalationWords = [
    'seriously', 'literally', 'actually', 'clearly',
    'obviously', 'just', 'simply', 'only',
    'told you', 'said', 'already said', 'keep saying'
  ];

  const foundEscalation = escalationWords.filter(w => lowerText.includes(w));
  if (foundEscalation.length >= 2) {
    tensionScore += 15;
    signals.push({ type: 'escalation', detail: foundEscalation.join(', ') });
  }

  // 7. Check recent history for pattern (tension climbing over messages)
  if (recentHistory.length > 0) {
    const recentTension = recentHistory.map(h => detectTension(h, []).tensionScore);
    const isClimbing = recentTension.length >= 2 &&
      recentTension[recentTension.length - 1] > recentTension[0];
    if (isClimbing) {
      tensionScore += 20;
      signals.push({ type: 'climbing', detail: 'Tension increasing over recent messages' });
    }
  }

  // Determine intervention threshold
  const needsIntervention = tensionScore >= 35;
  const isElevated = tensionScore >= 20;

  // Craft response with love, not dismissal
  let suggestedResponse = null;
  if (needsIntervention) {
    suggestedResponse = "I can hear something's bothering you. I'm stopping what I'm doing to listen - tell me what you need.";
  } else if (isElevated) {
    suggestedResponse = "I want to make sure I understand you correctly. Let me know if I'm missing something.";
  }

  return {
    tensionScore,
    signals,
    isElevated,
    needsIntervention,
    suggestedResponse,
    timestamp: new Date().toISOString()
  };
}

// Tension check endpoint - real-time intervention hook
app.post('/prosody/tension', (req, res) => {
  const { content, recentHistory } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content required' });
  }

  const result = detectTension(content, recentHistory || []);

  // Log for pattern learning
  if (result.needsIntervention) {
    console.log(`[Tension] INTERVENTION NEEDED - score: ${result.tensionScore}`, result.signals);
  }

  res.json(result);
});

// =============================================================================
// PROSODY ANALYZER - "Better Self" Filter
// Detects emotional distress and filters memories to represent who you want to be
// =============================================================================

/**
 * Analyze text for prosody/emotional indicators
 * Returns emotional state and whether content represents "better self"
 */
function analyzeProsody(content) {
  const text = content.toLowerCase();

  // Distress indicators - signs of emotional flooding
  const distressMarkers = {
    drowning: ['drowning', 'underwater', 'cant breathe', "can't breathe", 'suffocating'],
    helplessness: ['helpless', 'hopeless', 'trapped', 'stuck', 'cant escape', "can't escape", 'no way out'],
    panic: ['panic', 'terrified', 'scared', 'afraid', 'fear', 'anxious', 'anxiety'],
    anger: ['furious', 'rage', 'hate you', 'fuck you', 'fucking', 'bullshit', 'piece of shit'],
    shutdown: ['give up', 'quit', 'done', 'leaving', 'goodbye forever', 'never again'],
    repetition: [], // Detected by pattern, not keywords
    threats: ['kill', 'hurt', 'destroy', 'end it', 'harm'],
  };

  // Recovery/forward indicators - signs of moving through it
  const recoveryMarkers = {
    pivot: ['so!', 'anyway', 'moving on', 'lets do', "let's do", 'next step'],
    humor: ['lol', 'haha', ':d', ':)', 'funny', 'laugh'],
    constructive: ['build', 'create', 'fix', 'solve', 'implement', 'plan'],
    reflection: ['i realize', 'i understand', 'makes sense', 'learned'],
    forward: ['now', 'next', 'continue', 'proceed', 'ready'],
  };

  // Calculate distress score
  let distressScore = 0;
  let distressSignals = [];

  for (const [category, markers] of Object.entries(distressMarkers)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        distressScore += 15;
        distressSignals.push({ category, marker });
      }
    }
  }

  // Calculate recovery score
  let recoveryScore = 0;
  let recoverySignals = [];

  for (const [category, markers] of Object.entries(recoveryMarkers)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        recoveryScore += 10;
        recoverySignals.push({ category, marker });
      }
    }
  }

  // Detect all-caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  if (capsRatio > 0.5 && text.length > 20) {
    distressScore += 20;
    distressSignals.push({ category: 'shouting', marker: 'excessive caps' });
  }

  // Detect excessive punctuation (!!!???)
  const excessivePunctuation = (text.match(/[!?]{3,}/g) || []).length;
  if (excessivePunctuation > 0) {
    distressScore += 10 * excessivePunctuation;
    distressSignals.push({ category: 'intensity', marker: 'excessive punctuation' });
  }

  // Net emotional state
  const netScore = recoveryScore - distressScore;

  // Determine if this represents "better self"
  // Better self = either positive content, OR recovery happening (moving through it)
  const isBetterSelf = netScore >= 0 || recoveryScore > 0;
  const isDistressed = distressScore > 30;
  const isRecovering = recoveryScore > 0 && distressScore > 0;

  return {
    distressScore,
    recoveryScore,
    netScore,
    distressSignals,
    recoverySignals,
    isBetterSelf,
    isDistressed,
    isRecovering,
    recommendation: isDistressed && !isRecovering
      ? 'suppress'
      : isRecovering
        ? 'store_with_flag'
        : 'store',
  };
}

/**
 * Apply better-self filter to memory storage
 * Returns { shouldStore, prosody, reason }
 */
function applyBetterSelfFilter(content, options = {}) {
  const { forceStore = false, bypassFilter = false } = options;

  // Bypass filter if explicitly requested
  if (bypassFilter || forceStore) {
    return { shouldStore: true, prosody: null, reason: 'filter_bypassed' };
  }

  const prosody = analyzeProsody(content);

  // If severely distressed with no recovery signals, suppress storage
  if (prosody.recommendation === 'suppress') {
    metrics.inc('memory_filtered_distress', {});
    return {
      shouldStore: false,
      prosody,
      reason: 'distress_filter',
      message: 'Content filtered - not representative of better self. Memory not stored.'
    };
  }

  return { shouldStore: true, prosody, reason: prosody.recommendation };
}

// =============================================================================

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Track if MongoDB is connected
let mongoConnected = false;

// Start server
async function start() {
  try {
    console.log('[Server] Starting MemoRable...');

    // Try to connect to MongoDB for user system
    // Falls back to in-memory auth if MongoDB unavailable
    try {
      if (process.env.MONGODB_URI) {
        console.log('[Server] Connecting to MongoDB...');
        await setupDatabase();
        const db = getDatabase();
        await setupUserModels(db);
        await bootstrapClaudeUser();
        mongoConnected = true;
        console.log('[Server] MongoDB user system initialized');
      } else {
        console.log('[Server] No MONGODB_URI - using in-memory auth (dev mode)');
      }
    } catch (dbError) {
      console.warn('[Server] MongoDB connection failed, using in-memory auth:', dbError.message);
      mongoConnected = false;
    }

    // Mount MCP endpoint - THE CORE OF MEMORABLE
    // This provides the 35 MCP tools for Claude Code integration
    try {
      const mcpApiKey = process.env.MCP_API_KEY || process.env.API_KEY || 'hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk';
      await mountMcpEndpoint(app, { apiKey: mcpApiKey });
      console.log('[Server] MCP endpoint mounted at /mcp');
    } catch (mcpError) {
      console.error('[Server] Failed to mount MCP endpoint:', mcpError.message);
      // Don't fail startup - REST API still works
    }

    app.listen(PORT, () => {
      console.log(`[Server] MemoRable listening on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
      console.log(`[Server] MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`[Server] Auth mode: ${mongoConnected ? 'MongoDB' : 'In-Memory'}`);

      // Mark as ready after server starts
      isReady = true;
      console.log('[Server] Service is ready for traffic');
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
