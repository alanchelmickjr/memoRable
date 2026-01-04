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
import type { Db } from 'mongodb';
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
/**
 * Initialize the salience service with proper startup sequence.
 * Handles zero-data scenarios gracefully.
 */
export declare function initializeSalienceService(db: Db, config?: StartupConfig): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Initialize with retry logic for containerized environments.
 * Useful when DB might not be immediately available at startup.
 */
export declare function initializeWithRetry(getDb: () => Promise<Db>, config?: StartupConfig): Promise<{
    success: boolean;
    error?: string;
    attempts: number;
}>;
/**
 * Get current health status of the salience service.
 */
export declare function getHealthStatus(): Promise<HealthStatus>;
/**
 * Quick health check (for load balancer probes).
 * Returns true if service can accept requests.
 */
export declare function isHealthy(): Promise<boolean>;
/**
 * Readiness check (for Kubernetes readiness probes).
 * Returns true if service is ready to handle traffic.
 */
export declare function isReady(): Promise<boolean>;
/**
 * Liveness check (for Kubernetes liveness probes).
 * Returns true if service is alive (not deadlocked).
 */
export declare function isAlive(): boolean;
/**
 * Graceful shutdown handler.
 */
export declare function shutdown(): Promise<void>;
/**
 * Express/Fastify health endpoint handler.
 */
export declare function healthEndpoint(): (req: any, res: any) => Promise<void>;
/**
 * Kubernetes probe endpoints.
 */
export declare const probes: {
    /** /health/live - Is the process alive? */
    live: (_req: any, res: any) => void;
    /** /health/ready - Is the service ready for traffic? */
    ready: (_req: any, res: any) => Promise<void>;
    /** /health/startup - Has the service completed startup? */
    startup: (_req: any, res: any) => void;
};
/**
 * Get initialization state (for debugging).
 */
export declare function getState(): {
    initialized: boolean;
    startupTime: Date | null;
    lastHealthCheck: HealthStatus | null;
};
