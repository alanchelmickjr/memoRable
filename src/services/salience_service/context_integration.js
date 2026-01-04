/**
 * Context Integration Service - The "Thalamus" of MemoRable
 *
 * Like the brain's integration centers:
 * - Receives input from multiple sensory streams (devices)
 * - Resolves conflicts between streams
 * - Produces unified perception of "now"
 * - Handles temporal binding across sources
 */
import { DEFAULT_RESOLUTION_RULES, STALENESS_CONFIG, DEVICE_REDIS_KEYS, } from './device_context';
// ============================================================================
// Context Integration Service
// ============================================================================
export class ContextIntegrationService {
    constructor(redis, customRules) {
        this.redis = redis;
        this.resolutionRules = customRules || DEFAULT_RESOLUTION_RULES;
    }
    // ==========================================================================
    // Device Context Management
    // ==========================================================================
    /**
     * Store a device's context frame
     */
    async setDeviceContext(context) {
        const key = DEVICE_REDIS_KEYS.deviceContext(context.userId, context.deviceId);
        // Store with TTL based on device type
        const ttl = STALENESS_CONFIG.deviceContextTTL[context.deviceType] / 1000;
        await this.redis.setEx(key, ttl, JSON.stringify(context));
        // Add to active devices set
        await this.redis.sAdd(DEVICE_REDIS_KEYS.activeDevices(context.userId), context.deviceId);
        // Trigger unified context recomputation (async, don't wait)
        this.recomputeUnifiedContext(context.userId).catch(console.error);
    }
    /**
     * Get a specific device's context
     */
    async getDeviceContext(userId, deviceId) {
        const key = DEVICE_REDIS_KEYS.deviceContext(userId, deviceId);
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
    }
    /**
     * Get all active device contexts for a user
     */
    async getAllDeviceContexts(userId) {
        const deviceIds = await this.redis.sMembers(DEVICE_REDIS_KEYS.activeDevices(userId));
        const contexts = [];
        for (const deviceId of deviceIds) {
            const context = await this.getDeviceContext(userId, deviceId);
            if (context) {
                contexts.push(context);
            }
            else {
                // Device context expired, remove from active set
                await this.redis.sRem(DEVICE_REDIS_KEYS.activeDevices(userId), deviceId);
            }
        }
        return contexts;
    }
    /**
     * Clear a device's context (device went offline/inactive)
     */
    async clearDeviceContext(userId, deviceId) {
        await this.redis.del(DEVICE_REDIS_KEYS.deviceContext(userId, deviceId));
        await this.redis.sRem(DEVICE_REDIS_KEYS.activeDevices(userId), deviceId);
        // Recompute unified context
        await this.recomputeUnifiedContext(userId);
    }
    // ==========================================================================
    // Unified Context Integration
    // ==========================================================================
    /**
     * Get the unified user context (integrated from all devices)
     */
    async getUnifiedContext(userId) {
        // Try cache first
        const cached = await this.redis.get(DEVICE_REDIS_KEYS.unifiedContext(userId));
        if (cached) {
            const context = JSON.parse(cached);
            // Check if still fresh
            const age = Date.now() - new Date(context.timestamp).getTime();
            if (age < STALENESS_CONFIG.unifiedContextRefreshInterval) {
                return context;
            }
        }
        // Recompute
        return this.recomputeUnifiedContext(userId);
    }
    /**
     * Recompute unified context from all device contexts
     * This is the "integration" step - like the thalamus fusing sensory inputs
     */
    async recomputeUnifiedContext(userId) {
        const deviceContexts = await this.getAllDeviceContexts(userId);
        if (deviceContexts.length === 0) {
            return null;
        }
        const now = new Date();
        // Build active devices list with staleness info
        const activeDevices = deviceContexts.map((ctx) => {
            const updateAge = now.getTime() - new Date(ctx.timestamp).getTime();
            const staleness = STALENESS_CONFIG.deviceContextTTL[ctx.deviceType];
            return {
                deviceId: ctx.deviceId,
                deviceType: ctx.deviceType,
                lastUpdate: ctx.timestamp,
                isStale: updateAge > staleness * 0.5, // Stale if > 50% of TTL
            };
        });
        // Resolve location
        const location = this.resolveLocation(deviceContexts);
        // Resolve activity
        const activity = this.resolveActivity(deviceContexts);
        // Resolve people
        const people = this.resolvePeople(deviceContexts);
        // Detect cross-device patterns
        const patterns = this.detectPatterns(deviceContexts, activeDevices);
        const unified = {
            userId,
            timestamp: now.toISOString(),
            activeDevices,
            location,
            activity,
            people,
            patterns,
        };
        // Cache the unified context
        await this.redis.setEx(DEVICE_REDIS_KEYS.unifiedContext(userId), Math.floor(STALENESS_CONFIG.unifiedContextRefreshInterval / 1000), JSON.stringify(unified));
        return unified;
    }
    // ==========================================================================
    // Resolution Strategies
    // ==========================================================================
    /**
     * Resolve location from multiple devices
     * Mobile devices win for physical location (they have GPS)
     */
    resolveLocation(contexts) {
        const withLocation = contexts.filter((c) => c.location);
        if (withLocation.length === 0) {
            return {
                resolved: 'Unknown',
                source: 'none',
                confidence: 0,
            };
        }
        // Separate by device type priority
        const mobileContexts = withLocation.filter((c) => c.deviceType === 'mobile');
        const otherContexts = withLocation.filter((c) => c.deviceType !== 'mobile');
        // Mobile wins for location (has GPS)
        if (mobileContexts.length > 0) {
            // Get most recent mobile with highest confidence
            const best = mobileContexts.reduce((a, b) => {
                const aScore = a.location.confidence + (new Date(a.timestamp).getTime() / 1e15);
                const bScore = b.location.confidence + (new Date(b.timestamp).getTime() / 1e15);
                return bScore > aScore ? b : a;
            });
            // Check for conflicts with other devices
            const conflicting = otherContexts
                .filter((c) => c.location.name !== best.location.name)
                .map((c) => ({
                deviceId: c.deviceId,
                location: c.location.name,
            }));
            return {
                resolved: best.location.name,
                source: best.deviceId,
                confidence: best.location.confidence,
                conflicting: conflicting.length > 0 ? conflicting : undefined,
            };
        }
        // No mobile, use highest confidence
        const best = otherContexts.reduce((a, b) => b.location.confidence > a.location.confidence ? b : a);
        return {
            resolved: best.location.name,
            source: best.deviceId,
            confidence: best.location.confidence,
        };
    }
    /**
     * Resolve activity from multiple devices
     * Most recent activity wins, but we track secondary activities
     */
    resolveActivity(contexts) {
        const withActivity = contexts.filter((c) => c.activity);
        if (withActivity.length === 0) {
            return {
                primary: 'idle',
                sources: [],
            };
        }
        // Sort by timestamp (most recent first)
        const sorted = [...withActivity].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const sources = sorted.map((c) => ({
            deviceId: c.deviceId,
            activity: c.activity.type,
            confidence: c.activity.confidence,
        }));
        return {
            primary: sorted[0].activity.type,
            secondary: sorted.length > 1 ? sorted[1].activity.type : undefined,
            sources,
        };
    }
    /**
     * Resolve people context from multiple devices
     * Merge all detected people, deduplicate, track sources
     */
    resolvePeople(contexts) {
        const allPeople = new Map();
        const sourceMap = new Map();
        for (const ctx of contexts) {
            if (!ctx.people)
                continue;
            sourceMap.set(ctx.deviceId, ctx.people.names);
            for (const name of ctx.people.names) {
                const normalized = name.toLowerCase().trim();
                const existing = allPeople.get(normalized);
                if (existing) {
                    // Increase confidence if detected by multiple devices
                    existing.confidence = Math.min(1, existing.confidence + ctx.people.confidence * 0.5);
                    existing.sources.push(ctx.deviceId);
                }
                else {
                    allPeople.set(normalized, {
                        confidence: ctx.people.confidence,
                        sources: [ctx.deviceId],
                    });
                }
            }
        }
        // Separate into high/low confidence
        const present = [];
        const likely = [];
        for (const [name, data] of allPeople) {
            // Capitalize properly
            const displayName = name.charAt(0).toUpperCase() + name.slice(1);
            if (data.confidence >= 0.7 || data.sources.length > 1) {
                present.push(displayName);
            }
            else {
                likely.push(displayName);
            }
        }
        return {
            present,
            likely,
            sources: sourceMap,
        };
    }
    /**
     * Detect cross-device usage patterns
     */
    detectPatterns(contexts, activeDevices) {
        const isMultitasking = activeDevices.filter((d) => !d.isStale).length > 1;
        // Find most active device (most recent non-stale update)
        const nonStale = activeDevices.filter((d) => !d.isStale);
        const primaryDevice = nonStale.length > 0
            ? nonStale.reduce((a, b) => new Date(b.lastUpdate).getTime() > new Date(a.lastUpdate).getTime() ? b : a).deviceId
            : activeDevices[0]?.deviceId || 'unknown';
        // TODO: Add device switch prediction based on learned patterns
        // For now, just detect basic patterns
        return {
            isMultitasking,
            primaryDevice,
        };
    }
    // ==========================================================================
    // Context Queries (for memory surfacing)
    // ==========================================================================
    /**
     * Get context optimized for memory retrieval
     * Returns the most relevant context signals for finding memories
     */
    async getContextForRetrieval(userId) {
        const unified = await this.getUnifiedContext(userId);
        if (!unified) {
            return {
                location: 'Unknown',
                activity: 'idle',
                people: [],
                deviceContext: null,
            };
        }
        const primaryDevice = unified.activeDevices.find((d) => d.deviceId === unified.patterns.primaryDevice);
        return {
            location: unified.location.resolved,
            activity: unified.activity.primary,
            people: [...unified.people.present, ...unified.people.likely],
            deviceContext: primaryDevice
                ? {
                    deviceId: primaryDevice.deviceId,
                    deviceType: primaryDevice.deviceType,
                }
                : null,
        };
    }
}
// ============================================================================
// Singleton Factory
// ============================================================================
let integrationServiceInstance = null;
export function getContextIntegrationService(redis) {
    if (!integrationServiceInstance) {
        integrationServiceInstance = new ContextIntegrationService(redis);
    }
    return integrationServiceInstance;
}
export function resetContextIntegrationService() {
    integrationServiceInstance = null;
}
