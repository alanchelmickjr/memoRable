/**
 * Context Integration Service - The "Thalamus" of MemoRable
 *
 * Like the brain's integration centers:
 * - Receives input from multiple sensory streams (devices)
 * - Resolves conflicts between streams
 * - Produces unified perception of "now"
 * - Handles temporal binding across sources
 */
import { DeviceContextFrame, UnifiedUserContext, DeviceType, ResolutionRule } from './device_context';
export declare class ContextIntegrationService {
    private redis;
    private resolutionRules;
    constructor(redis: RedisClientType, customRules?: ResolutionRule[]);
    /**
     * Store a device's context frame
     */
    setDeviceContext(context: DeviceContextFrame): Promise<void>;
    /**
     * Get a specific device's context
     */
    getDeviceContext(userId: string, deviceId: string): Promise<DeviceContextFrame | null>;
    /**
     * Get all active device contexts for a user
     */
    getAllDeviceContexts(userId: string): Promise<DeviceContextFrame[]>;
    /**
     * Clear a device's context (device went offline/inactive)
     */
    clearDeviceContext(userId: string, deviceId: string): Promise<void>;
    /**
     * Get the unified user context (integrated from all devices)
     */
    getUnifiedContext(userId: string): Promise<UnifiedUserContext | null>;
    /**
     * Recompute unified context from all device contexts
     * This is the "integration" step - like the thalamus fusing sensory inputs
     */
    recomputeUnifiedContext(userId: string): Promise<UnifiedUserContext | null>;
    /**
     * Resolve location from multiple devices
     * Mobile devices win for physical location (they have GPS)
     */
    private resolveLocation;
    /**
     * Resolve activity from multiple devices
     * Most recent activity wins, but we track secondary activities
     */
    private resolveActivity;
    /**
     * Resolve people context from multiple devices
     * Merge all detected people, deduplicate, track sources
     */
    private resolvePeople;
    /**
     * Detect cross-device usage patterns
     */
    private detectPatterns;
    /**
     * Get context optimized for memory retrieval
     * Returns the most relevant context signals for finding memories
     */
    getContextForRetrieval(userId: string): Promise<{
        location: string;
        activity: string;
        people: string[];
        deviceContext: {
            deviceId: string;
            deviceType: DeviceType;
        } | null;
    }>;
}
interface RedisClientType {
    get(key: string): Promise<string | null>;
    setEx(key: string, seconds: number, value: string): Promise<void>;
    del(key: string): Promise<void>;
    sAdd(key: string, member: string): Promise<void>;
    sRem(key: string, member: string): Promise<void>;
    sMembers(key: string): Promise<string[]>;
}
export declare function getContextIntegrationService(redis: RedisClientType): ContextIntegrationService;
export declare function resetContextIntegrationService(): void;
export {};
