/**
 * @file Real-Time Context Synchronization Layer
 *
 * Enables true omnipresence by synchronizing context across all devices in real-time.
 * Inspired by how the thalamus acts as a central relay station, routing sensory data
 * to appropriate cortical regions for integration.
 *
 * Architecture:
 * ```
 * Device A (phone)  ──┐
 * Device B (laptop) ──┼──▶ Redis Pub/Sub ──▶ Context Hub ──▶ Unified Context
 * Device C (watch)  ──┤         │                  │
 * Device D (glasses)──┘         │                  ▼
 *                               └──────────▶ Subscribers (all devices)
 * ```
 *
 * Key Features:
 * - Sub-100ms latency for context updates across devices
 * - Sensor-specific channels (location, audio, visual, etc.)
 * - Conflict resolution with sensor-type priorities
 * - Heartbeat-based staleness detection
 * - Delta updates for bandwidth efficiency
 * - Offline resilience with catch-up sync
 */
interface RedisClientType {
    publish(channel: string, message: string): Promise<number>;
    subscribe(channels: string[], callback: (message: string, channel: string) => void): Promise<void>;
    unsubscribe(): Promise<void>;
    pSubscribe(pattern: string, callback: (message: string, channel: string) => void): Promise<void>;
    pUnsubscribe(): Promise<void>;
}
import { EventEmitter } from 'events';
import { DeviceType, SensorType, SensorReading } from './device_context';
/**
 * Redis pub/sub channels for real-time sync.
 * Each sensor type has its own channel for efficient routing.
 */
export declare const SYNC_CHANNELS: {
    contextUpdate: (userId: string) => string;
    sensorChannel: (userId: string, sensor: SensorType) => string;
    devicePresence: (userId: string) => string;
    unifiedContext: (userId: string) => string;
    control: (userId: string) => string;
};
/**
 * Base message structure for all sync messages.
 */
interface SyncMessageBase {
    messageId: string;
    timestamp: string;
    userId: string;
    deviceId: string;
    deviceType: DeviceType;
}
/**
 * Context update from a device.
 */
export interface ContextUpdateMessage extends SyncMessageBase {
    type: 'context_update';
    delta: {
        location?: {
            value: string;
            confidence: number;
        };
        activity?: {
            value: string;
            confidence: number;
        };
        people?: {
            names: string[];
            confidence: number;
        };
        mood?: {
            value: string;
            confidence: number;
        };
    };
    sensors?: SensorReading[];
    sequenceNumber: number;
}
/**
 * Sensor-specific data update.
 */
export interface SensorUpdateMessage extends SyncMessageBase {
    type: 'sensor_update';
    sensorType: SensorType;
    reading: SensorReading;
    priority: number;
}
/**
 * Device heartbeat for presence detection.
 */
export interface HeartbeatMessage extends SyncMessageBase {
    type: 'heartbeat';
    capabilities: SensorType[];
    batteryLevel?: number;
    networkQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}
/**
 * Unified context broadcast (from hub to all devices).
 */
export interface UnifiedContextMessage extends SyncMessageBase {
    type: 'unified_context';
    context: {
        location: string;
        activity: string;
        people: string[];
        mood?: string;
        confidence: number;
    };
    contributors: {
        deviceId: string;
        contributed: SensorType[];
    }[];
    version: number;
}
/**
 * Control message for commands.
 */
export interface ControlMessage extends SyncMessageBase {
    type: 'control';
    command: 'force_sync' | 'clear_context' | 'set_priority' | 'disconnect';
    payload?: any;
}
export type SyncMessage = ContextUpdateMessage | SensorUpdateMessage | HeartbeatMessage | UnifiedContextMessage | ControlMessage;
/**
 * Priority matrix for conflict resolution.
 * Higher number = higher priority for that sensor type.
 * Device types have different authority for different sensors.
 */
export declare const SENSOR_PRIORITY: Record<DeviceType, Partial<Record<SensorType, number>>>;
/**
 * Real-time context synchronization service.
 * Acts as the "thalamus" - receiving sensor streams and routing to integration.
 */
export declare class RealtimeSyncService extends EventEmitter {
    private redisClient;
    private subscriberClient;
    private userId;
    private deviceId;
    private deviceType;
    private capabilities;
    private lastSequenceNumber;
    private devicePresence;
    private pendingUpdates;
    private unifiedContextVersion;
    private heartbeatInterval;
    private readonly HEARTBEAT_INTERVAL_MS;
    private readonly PRESENCE_TIMEOUT_MS;
    constructor(userId: string, deviceId: string, deviceType: DeviceType, capabilities?: SensorType[]);
    /**
     * Initialize the sync service with Redis clients.
     * Needs two clients: one for pub, one for sub (Redis requirement).
     */
    initialize(publishClient: RedisClientType, subscribeClient: RedisClientType): Promise<void>;
    /**
     * Subscribe to all relevant channels for this device.
     */
    private subscribeToChannels;
    /**
     * Handle incoming sync messages.
     */
    private handleMessage;
    /**
     * Handle context update from another device.
     */
    private handleContextUpdate;
    /**
     * Handle sensor update from another device.
     */
    private handleSensorUpdate;
    /**
     * Handle heartbeat from another device.
     */
    private handleHeartbeat;
    /**
     * Handle unified context broadcast.
     */
    private handleUnifiedContext;
    /**
     * Handle control messages.
     */
    private handleControl;
    /**
     * Publish a context update from this device.
     */
    publishContextUpdate(delta: ContextUpdateMessage['delta']): Promise<void>;
    /**
     * Publish a sensor reading from this device.
     */
    publishSensorUpdate(sensorType: SensorType, reading: SensorReading): Promise<void>;
    /**
     * Broadcast unified context to all devices.
     * Called by the context hub after integration.
     */
    broadcastUnifiedContext(context: UnifiedContextMessage['context'], contributors: UnifiedContextMessage['contributors']): Promise<void>;
    /**
     * Start sending heartbeats.
     */
    private startHeartbeat;
    /**
     * Send a heartbeat message.
     */
    private sendHeartbeat;
    /**
     * Announce presence on startup.
     */
    private announcePresence;
    /**
     * Update device presence tracking.
     */
    private updateDevicePresence;
    /**
     * Remove stale devices from presence tracking.
     */
    private pruneStaleDevices;
    /**
     * Get all currently online devices.
     */
    getOnlineDevices(): Array<{
        deviceId: string;
        deviceType: DeviceType;
        capabilities: SensorType[];
        lastSeen: Date;
    }>;
    /**
     * Determine if this device should act as the context hub.
     * Uses a simple election: desktop > mobile > web > others.
     * In a real system, this would use a proper leader election algorithm.
     */
    private isContextHub;
    /**
     * Trigger context integration (called when we're the hub).
     */
    private triggerContextIntegration;
    /**
     * Request catch-up sync when reconnecting.
     */
    private requestCatchUpSync;
    /**
     * Generate a unique message ID.
     */
    private generateMessageId;
    /**
     * Shutdown the sync service.
     */
    shutdown(): Promise<void>;
}
/**
 * Server-side context hub that integrates updates from all devices.
 * Runs on the backend, not on individual devices.
 */
export declare class ContextHub {
    private redisClient;
    private subscriberClient;
    private userContexts;
    private userVersions;
    private pendingIntegrations;
    private readonly INTEGRATION_DEBOUNCE_MS;
    /**
     * Initialize the context hub.
     */
    initialize(publishClient: RedisClientType, subscribeClient: RedisClientType): Promise<void>;
    /**
     * Handle context update from a device.
     */
    private handleContextUpdate;
    /**
     * Handle sensor update from a device.
     */
    private handleSensorUpdate;
    /**
     * Update device context in our local state.
     */
    private updateDeviceContext;
    /**
     * Update device sensor reading.
     */
    private updateDeviceSensor;
    /**
     * Schedule context integration with debouncing.
     */
    private scheduleIntegration;
    /**
     * Integrate context from all devices for a user.
     */
    private integrateContext;
    /**
     * Resolve location from all device contexts.
     * Mobile devices have highest priority (GPS).
     */
    private resolveLocation;
    /**
     * Resolve activity from all device contexts.
     * Most recent wins.
     */
    private resolveActivity;
    /**
     * Resolve people from all device contexts.
     * Merge from all devices.
     */
    private resolvePeople;
    /**
     * Broadcast unified context to all devices.
     */
    private broadcastUnified;
    /**
     * Shutdown the context hub.
     */
    shutdown(): Promise<void>;
}
/**
 * Get or create the sync service for a device.
 */
export declare function getSyncService(userId: string, deviceId: string, deviceType: DeviceType, capabilities?: SensorType[]): RealtimeSyncService;
/**
 * Get or create the context hub (server-side only).
 */
export declare function getContextHub(): ContextHub;
/**
 * Reset services (for testing).
 */
export declare function resetSyncServices(): void;
export {};
