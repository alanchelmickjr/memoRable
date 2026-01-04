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
import { setupSalienceDatabase, collections } from './database';
const DEFAULT_CONFIG = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable',
    maxRetries: 5,
    retryDelayMs: 2000,
    skipSeeding: false,
    verbose: process.env.NODE_ENV !== 'production',
};
// Startup state
let isInitialized = false;
let startupTime = null;
let lastHealthCheck = null;
let dbInstance = null;
/**
 * Initialize the salience service with proper startup sequence.
 * Handles zero-data scenarios gracefully.
 */
export async function initializeSalienceService(db, config = {}) {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[SalienceStartup] Initialization failed:', errorMessage);
        return { success: false, error: errorMessage };
    }
}
/**
 * Initialize with retry logic for containerized environments.
 * Useful when DB might not be immediately available at startup.
 */
export async function initializeWithRetry(getDb, config = {}) {
    const opts = { ...DEFAULT_CONFIG, ...config };
    let lastError = '';
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
        }
        catch (error) {
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
async function verifyCollections() {
    try {
        // Try to access each collection - this will throw if DB not initialized
        const checks = await Promise.all([
            collections.openLoops().countDocuments().catch(() => -1),
            collections.personTimelineEvents().countDocuments().catch(() => -1),
            collections.relationshipPatterns().countDocuments().catch(() => -1),
            collections.retrievalLogs().countDocuments().catch(() => -1),
            collections.learnedWeights().countDocuments().catch(() => -1),
        ]);
        // All collections should return a count >= 0
        return checks.every((c) => c >= 0);
    }
    catch (error) {
        console.error('[SalienceStartup] Collection verification failed:', error);
        return false;
    }
}
/**
 * Handle zero-data state on first run.
 * Ensures queries don't fail on empty collections.
 */
async function handleZeroDataState(verbose) {
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
    }
    catch (error) {
        // Non-fatal - just log and continue
        console.warn('[SalienceStartup] Could not check zero-data state:', error);
    }
}
/**
 * Get current health status of the salience service.
 */
export async function getHealthStatus() {
    const status = {
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
            }
            catch {
                // Stats are optional - don't fail health check
            }
        }
        // Determine overall status
        if (status.checks.database && status.checks.collections && status.checks.initialized) {
            status.status = 'healthy';
        }
        else if (status.checks.database || status.checks.initialized) {
            status.status = 'degraded';
        }
    }
    catch (error) {
        status.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
    lastHealthCheck = status;
    return status;
}
/**
 * Quick health check (for load balancer probes).
 * Returns true if service can accept requests.
 */
export async function isHealthy() {
    if (!isInitialized)
        return false;
    try {
        // Quick DB ping
        if (dbInstance) {
            await dbInstance.command({ ping: 1 });
            return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Readiness check (for Kubernetes readiness probes).
 * Returns true if service is ready to handle traffic.
 */
export async function isReady() {
    return isInitialized && await isHealthy();
}
/**
 * Liveness check (for Kubernetes liveness probes).
 * Returns true if service is alive (not deadlocked).
 */
export function isAlive() {
    // If we can execute this, we're alive
    return true;
}
/**
 * Graceful shutdown handler.
 */
export async function shutdown() {
    console.log('[SalienceStartup] Shutting down...');
    isInitialized = false;
    dbInstance = null;
}
/**
 * Express/Fastify health endpoint handler.
 */
export function healthEndpoint() {
    return async (req, res) => {
        try {
            const health = await getHealthStatus();
            const statusCode = health.status === 'healthy' ? 200 :
                health.status === 'degraded' ? 200 : // Still accepting traffic
                    503;
            res.status(statusCode).json(health);
        }
        catch (error) {
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
    live: (_req, res) => {
        res.status(isAlive() ? 200 : 503).json({ alive: isAlive() });
    },
    /** /health/ready - Is the service ready for traffic? */
    ready: async (_req, res) => {
        const ready = await isReady();
        res.status(ready ? 200 : 503).json({ ready });
    },
    /** /health/startup - Has the service completed startup? */
    startup: (_req, res) => {
        res.status(isInitialized ? 200 : 503).json({ initialized: isInitialized });
    },
};
/**
 * Get initialization state (for debugging).
 */
export function getState() {
    return {
        initialized: isInitialized,
        startupTime,
        lastHealthCheck,
    };
}
// Helper
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
