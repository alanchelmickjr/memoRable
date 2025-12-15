/**
 * @file Salience Service Startup & Initialization
 * Ensures safe startup with zero-data scenarios and health monitoring.
 *
 * Key responsibilities:
 * - Database initialization with retry logic
 * - Zero-data state detection and handling
 * - Health check endpoints
 * - Graceful degradation when dependencies unavailable
 */

import type { Db, MongoClient } from 'mongodb';
import { setupSalienceDatabase, collections } from './database';
import { DEFAULT_SALIENCE_WEIGHTS } from './models';

/**
 * Startup configuration options.
 */
export interface StartupConfig {
  /** MongoDB connection string */
  mongoUri?: string;
  /** Maximum retries for DB connection */
  maxRetries?: number;
  /** Delay between retries in ms */
  retryDelayMs?: number;
  /** Skip seeding default data */
  skipSeeding?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<StartupConfig> = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable',
  maxRetries: 5,
  retryDelayMs: 2000,
  skipSeeding: false,
  verbose: process.env.NODE_ENV !== 'production',
};

/**
 * Service health status.
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    collections: boolean;
    initialized: boolean;
  };
  stats?: {
    openLoopsCount: number;
    contactsCount: number;
    patternsCount: number;
  };
  lastError?: string;
}

// Startup state
let isInitialized = false;
let startupTime: Date | null = null;
let lastHealthCheck: HealthStatus | null = null;
let dbInstance: Db | null = null;

/**
 * Initialize the salience service with proper startup sequence.
 * Handles zero-data scenarios gracefully.
 */
export async function initializeSalienceService(
  db: Db,
  config: StartupConfig = {}
): Promise<{ success: boolean; error?: string }> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  try {
    if (opts.verbose) {
      console.log('[SalienceStartup] Beginning initialization...');
    }

    // Step 1: Setup database collections and indexes
    await setupSalienceDatabase(db);
    dbInstance = db;

    // Step 2: Verify collections are accessible
    const collectionsOk = await verifyCollections();
    if (!collectionsOk) {
      throw new Error('Failed to verify collections after setup');
    }

    // Step 3: Handle zero-data state (first run)
    if (!opts.skipSeeding) {
      await handleZeroDataState(opts.verbose);
    }

    // Mark as initialized
    isInitialized = true;
    startupTime = new Date();

    if (opts.verbose) {
      console.log('[SalienceStartup] Initialization complete');
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SalienceStartup] Initialization failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Initialize with retry logic for containerized environments.
 * Useful when DB might not be immediately available at startup.
 */
export async function initializeWithRetry(
  getDb: () => Promise<Db>,
  config: StartupConfig = {}
): Promise<{ success: boolean; error?: string; attempts: number }> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  let lastError: string = '';

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      if (opts.verbose) {
        console.log(`[SalienceStartup] Connection attempt ${attempt}/${opts.maxRetries}`);
      }

      const db = await getDb();
      const result = await initializeSalienceService(db, opts);

      if (result.success) {
        return { success: true, attempts: attempt };
      }

      lastError = result.error || 'Unknown error';
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Connection failed';
      if (opts.verbose) {
        console.error(`[SalienceStartup] Attempt ${attempt} failed:`, lastError);
      }
    }

    // Wait before retry (except on last attempt)
    if (attempt < opts.maxRetries) {
      await sleep(opts.retryDelayMs);
    }
  }

  return {
    success: false,
    error: `Failed after ${opts.maxRetries} attempts: ${lastError}`,
    attempts: opts.maxRetries,
  };
}

/**
 * Verify all required collections are accessible.
 */
async function verifyCollections(): Promise<boolean> {
  try {
    // Try to access each collection - this will throw if DB not initialized
    const checks = await Promise.all([
      collections.openLoops().stats().catch(() => null),
      collections.personTimelineEvents().stats().catch(() => null),
      collections.relationshipPatterns().stats().catch(() => null),
      collections.retrievalLogs().stats().catch(() => null),
      collections.learnedWeights().stats().catch(() => null),
    ]);

    // All collections should return something (even if empty)
    return checks.every((c) => c !== null);
  } catch (error) {
    console.error('[SalienceStartup] Collection verification failed:', error);
    return false;
  }
}

/**
 * Handle zero-data state on first run.
 * Ensures queries don't fail on empty collections.
 */
async function handleZeroDataState(verbose?: boolean): Promise<void> {
  try {
    // Check if this is first run (no data in any collection)
    const [loopCount, patternCount, weightsCount] = await Promise.all([
      collections.openLoops().countDocuments(),
      collections.relationshipPatterns().countDocuments(),
      collections.learnedWeights().countDocuments(),
    ]);

    const isFirstRun = loopCount === 0 && patternCount === 0 && weightsCount === 0;

    if (isFirstRun && verbose) {
      console.log('[SalienceStartup] First run detected - empty collections are normal');
      console.log('[SalienceStartup] System will populate data as memories are ingested');
    }

    // No seeding needed - empty collections are valid
    // The system handles empty results gracefully throughout

  } catch (error) {
    // Non-fatal - just log and continue
    console.warn('[SalienceStartup] Could not check zero-data state:', error);
  }
}

/**
 * Get current health status of the salience service.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const status: HealthStatus = {
    status: 'unhealthy',
    version: '2.0.0',
    uptime: startupTime ? Date.now() - startupTime.getTime() : 0,
    checks: {
      database: false,
      collections: false,
      initialized: isInitialized,
    },
  };

  try {
    // Check database connectivity
    if (dbInstance) {
      await dbInstance.command({ ping: 1 });
      status.checks.database = true;
    }

    // Check collections
    if (isInitialized) {
      status.checks.collections = await verifyCollections();
    }

    // Get stats (optional, for monitoring)
    if (status.checks.collections) {
      try {
        const [openLoops, contacts, patterns] = await Promise.all([
          collections.openLoops().countDocuments({ status: 'open' }),
          dbInstance?.collection('contacts').countDocuments() || 0,
          collections.relationshipPatterns().countDocuments(),
        ]);

        status.stats = {
          openLoopsCount: openLoops,
          contactsCount: contacts,
          patternsCount: patterns,
        };
      } catch {
        // Stats are optional - don't fail health check
      }
    }

    // Determine overall status
    if (status.checks.database && status.checks.collections && status.checks.initialized) {
      status.status = 'healthy';
    } else if (status.checks.database || status.checks.initialized) {
      status.status = 'degraded';
    }

  } catch (error) {
    status.lastError = error instanceof Error ? error.message : 'Unknown error';
  }

  lastHealthCheck = status;
  return status;
}

/**
 * Quick health check (for load balancer probes).
 * Returns true if service can accept requests.
 */
export async function isHealthy(): Promise<boolean> {
  if (!isInitialized) return false;

  try {
    // Quick DB ping
    if (dbInstance) {
      await dbInstance.command({ ping: 1 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Readiness check (for Kubernetes readiness probes).
 * Returns true if service is ready to handle traffic.
 */
export async function isReady(): Promise<boolean> {
  return isInitialized && await isHealthy();
}

/**
 * Liveness check (for Kubernetes liveness probes).
 * Returns true if service is alive (not deadlocked).
 */
export function isAlive(): boolean {
  // If we can execute this, we're alive
  return true;
}

/**
 * Graceful shutdown handler.
 */
export async function shutdown(): Promise<void> {
  console.log('[SalienceStartup] Shutting down...');
  isInitialized = false;
  dbInstance = null;
}

/**
 * Express/Fastify health endpoint handler.
 */
export function healthEndpoint() {
  return async (req: any, res: any) => {
    try {
      const health = await getHealthStatus();

      const statusCode =
        health.status === 'healthy' ? 200 :
        health.status === 'degraded' ? 200 : // Still accepting traffic
        503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Kubernetes probe endpoints.
 */
export const probes = {
  /** /health/live - Is the process alive? */
  live: (_req: any, res: any) => {
    res.status(isAlive() ? 200 : 503).json({ alive: isAlive() });
  },

  /** /health/ready - Is the service ready for traffic? */
  ready: async (_req: any, res: any) => {
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({ ready });
  },

  /** /health/startup - Has the service completed startup? */
  startup: (_req: any, res: any) => {
    res.status(isInitialized ? 200 : 503).json({ initialized: isInitialized });
  },
};

/**
 * Get initialization state (for debugging).
 */
export function getState(): {
  initialized: boolean;
  startupTime: Date | null;
  lastHealthCheck: HealthStatus | null;
} {
  return {
    initialized: isInitialized,
    startupTime,
    lastHealthCheck,
  };
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
