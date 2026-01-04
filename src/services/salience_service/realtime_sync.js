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
import { EventEmitter } from 'events';
import { STALENESS_CONFIG, } from './device_context';
// ============================================================================
// CHANNEL DEFINITIONS
// ============================================================================
/**
 * Redis pub/sub channels for real-time sync.
 * Each sensor type has its own channel for efficient routing.
 */
export const SYNC_CHANNELS = {
    // Per-user context updates
    contextUpdate: (userId) => `memorable:sync:${userId}:context`,
    // Per-sensor-type channels (for selective subscription)
    sensorChannel: (userId, sensor) => `memorable:sync:${userId}:sensor:${sensor}`,
    // Device presence/heartbeat
    devicePresence: (userId) => `memorable:sync:${userId}:presence`,
    // Unified context broadcasts
    unifiedContext: (userId) => `memorable:sync:${userId}:unified`,
    // Control channel (commands, config updates)
    control: (userId) => `memorable:sync:${userId}:control`,
};
// ============================================================================
// SENSOR PRIORITY MATRIX
// ============================================================================
/**
 * Priority matrix for conflict resolution.
 * Higher number = higher priority for that sensor type.
 * Device types have different authority for different sensors.
 */
export const SENSOR_PRIORITY = {
    mobile: {
        location: 100, // Phone has GPS - highest authority
        activity: 80, // Accelerometer
        audio: 70, // Microphone
        calendar: 60, // Calendar integration
        social: 50, // Contacts
    },
    desktop: {
        calendar: 100, // Best calendar integration
        semantic: 90, // IDE context, browsing
        activity: 60, // Inferred from apps
        social: 40, // Email, slack
    },
    web: {
        semantic: 80, // Browsing context
        activity: 50,
        social: 40,
    },
    api: {
        semantic: 70,
        calendar: 70,
    },
    mcp: {
        semantic: 90, // AI assistant context
        activity: 70,
    },
    wearable: {
        biometric: 100, // Heart rate, etc.
        activity: 90, // Steps, movement
        location: 70, // Less accurate GPS
    },
    smartglasses: {
        visual: 100, // LIDAR, camera
        audio: 90, // Spatial audio
        social: 80, // Face recognition
        environment: 80, // Room scanning
    },
    smarthome: {
        environment: 100, // Temperature, humidity
        location: 60, // Presence detection
        audio: 50, // Smart speakers
    },
    unknown: {},
};
// ============================================================================
// REAL-TIME SYNC SERVICE
// ============================================================================
/**
 * Real-time context synchronization service.
 * Acts as the "thalamus" - receiving sensor streams and routing to integration.
 */
export class RealtimeSyncService extends EventEmitter {
    constructor(userId, deviceId, deviceType, capabilities = []) {
        super();
        this.redisClient = null;
        this.subscriberClient = null;
        // Local state
        this.lastSequenceNumber = 0;
        this.devicePresence = new Map();
        this.pendingUpdates = [];
        this.unifiedContextVersion = 0;
        // Heartbeat interval
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
        this.PRESENCE_TIMEOUT_MS = 15000; // 15 seconds
        this.userId = userId;
        this.deviceId = deviceId;
        this.deviceType = deviceType;
        this.capabilities = capabilities;
    }
    /**
     * Initialize the sync service with Redis clients.
     * Needs two clients: one for pub, one for sub (Redis requirement).
     */
    async initialize(publishClient, subscribeClient) {
        this.redisClient = publishClient;
        this.subscriberClient = subscribeClient;
        // Subscribe to relevant channels
        await this.subscribeToChannels();
        // Start heartbeat
        this.startHeartbeat();
        // Announce presence
        await this.announcePresence();
        // Request catch-up sync if we're reconnecting
        await this.requestCatchUpSync();
        console.log(`[RealtimeSync] Initialized for device ${this.deviceId} (${this.deviceType})`);
    }
    /**
     * Subscribe to all relevant channels for this device.
     */
    async subscribeToChannels() {
        if (!this.subscriberClient)
            return;
        const channels = [
            SYNC_CHANNELS.contextUpdate(this.userId),
            SYNC_CHANNELS.devicePresence(this.userId),
            SYNC_CHANNELS.unifiedContext(this.userId),
            SYNC_CHANNELS.control(this.userId),
        ];
        // Subscribe to sensor channels this device cares about
        for (const sensor of this.capabilities) {
            channels.push(SYNC_CHANNELS.sensorChannel(this.userId, sensor));
        }
        // Set up message handler
        await this.subscriberClient.subscribe(channels, (message, channel) => {
            this.handleMessage(message, channel);
        });
    }
    /**
     * Handle incoming sync messages.
     */
    handleMessage(messageStr, channel) {
        try {
            const message = JSON.parse(messageStr);
            // Ignore our own messages
            if (message.deviceId === this.deviceId)
                return;
            switch (message.type) {
                case 'context_update':
                    this.handleContextUpdate(message);
                    break;
                case 'sensor_update':
                    this.handleSensorUpdate(message);
                    break;
                case 'heartbeat':
                    this.handleHeartbeat(message);
                    break;
                case 'unified_context':
                    this.handleUnifiedContext(message);
                    break;
                case 'control':
                    this.handleControl(message);
                    break;
            }
        }
        catch (error) {
            console.error('[RealtimeSync] Error handling message:', error);
        }
    }
    /**
     * Handle context update from another device.
     */
    handleContextUpdate(message) {
        // Update device presence
        this.updateDevicePresence(message.deviceId, message.deviceType, []);
        // Emit event for local handling
        this.emit('context_update', {
            deviceId: message.deviceId,
            deviceType: message.deviceType,
            delta: message.delta,
            sensors: message.sensors,
            timestamp: message.timestamp,
        });
        // If we're the hub (could be elected), trigger integration
        if (this.isContextHub()) {
            this.triggerContextIntegration();
        }
    }
    /**
     * Handle sensor update from another device.
     */
    handleSensorUpdate(message) {
        const ourPriority = SENSOR_PRIORITY[this.deviceType]?.[message.sensorType] || 0;
        const theirPriority = message.priority;
        // Emit event with priority info
        this.emit('sensor_update', {
            deviceId: message.deviceId,
            sensorType: message.sensorType,
            reading: message.reading,
            isAuthoritative: theirPriority > ourPriority,
        });
    }
    /**
     * Handle heartbeat from another device.
     */
    handleHeartbeat(message) {
        this.updateDevicePresence(message.deviceId, message.deviceType, message.capabilities);
        this.emit('device_online', {
            deviceId: message.deviceId,
            deviceType: message.deviceType,
            capabilities: message.capabilities,
        });
    }
    /**
     * Handle unified context broadcast.
     */
    handleUnifiedContext(message) {
        // Only process if newer than our local version
        if (message.version <= this.unifiedContextVersion)
            return;
        this.unifiedContextVersion = message.version;
        this.emit('unified_context', {
            context: message.context,
            contributors: message.contributors,
            version: message.version,
        });
    }
    /**
     * Handle control messages.
     */
    handleControl(message) {
        switch (message.command) {
            case 'force_sync':
                this.emit('force_sync');
                break;
            case 'clear_context':
                this.emit('clear_context', message.payload);
                break;
            case 'disconnect':
                if (message.payload?.deviceId === this.deviceId) {
                    this.shutdown();
                }
                break;
        }
    }
    // ==========================================================================
    // PUBLISHING METHODS
    // ==========================================================================
    /**
     * Publish a context update from this device.
     */
    async publishContextUpdate(delta) {
        if (!this.redisClient)
            return;
        const message = {
            type: 'context_update',
            messageId: this.generateMessageId(),
            timestamp: new Date().toISOString(),
            userId: this.userId,
            deviceId: this.deviceId,
            deviceType: this.deviceType,
            delta,
            sequenceNumber: ++this.lastSequenceNumber,
        };
        await this.redisClient.publish(SYNC_CHANNELS.contextUpdate(this.userId), JSON.stringify(message));
    }
    /**
     * Publish a sensor reading from this device.
     */
    async publishSensorUpdate(sensorType, reading) {
        if (!this.redisClient)
            return;
        const priority = SENSOR_PRIORITY[this.deviceType]?.[sensorType] || 0;
        const message = {
            type: 'sensor_update',
            messageId: this.generateMessageId(),
            timestamp: new Date().toISOString(),
            userId: this.userId,
            deviceId: this.deviceId,
            deviceType: this.deviceType,
            sensorType,
            reading,
            priority,
        };
        await this.redisClient.publish(SYNC_CHANNELS.sensorChannel(this.userId, sensorType), JSON.stringify(message));
    }
    /**
     * Broadcast unified context to all devices.
     * Called by the context hub after integration.
     */
    async broadcastUnifiedContext(context, contributors) {
        if (!this.redisClient)
            return;
        const message = {
            type: 'unified_context',
            messageId: this.generateMessageId(),
            timestamp: new Date().toISOString(),
            userId: this.userId,
            deviceId: this.deviceId,
            deviceType: this.deviceType,
            context,
            contributors,
            version: ++this.unifiedContextVersion,
        };
        await this.redisClient.publish(SYNC_CHANNELS.unifiedContext(this.userId), JSON.stringify(message));
    }
    // ==========================================================================
    // PRESENCE & HEARTBEAT
    // ==========================================================================
    /**
     * Start sending heartbeats.
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
            this.pruneStaleDevices();
        }, this.HEARTBEAT_INTERVAL_MS);
    }
    /**
     * Send a heartbeat message.
     */
    async sendHeartbeat() {
        if (!this.redisClient)
            return;
        const message = {
            type: 'heartbeat',
            messageId: this.generateMessageId(),
            timestamp: new Date().toISOString(),
            userId: this.userId,
            deviceId: this.deviceId,
            deviceType: this.deviceType,
            capabilities: this.capabilities,
        };
        await this.redisClient.publish(SYNC_CHANNELS.devicePresence(this.userId), JSON.stringify(message));
    }
    /**
     * Announce presence on startup.
     */
    async announcePresence() {
        await this.sendHeartbeat();
    }
    /**
     * Update device presence tracking.
     */
    updateDevicePresence(deviceId, deviceType, capabilities) {
        this.devicePresence.set(deviceId, {
            lastSeen: new Date(),
            deviceType,
            capabilities,
        });
    }
    /**
     * Remove stale devices from presence tracking.
     */
    pruneStaleDevices() {
        const now = Date.now();
        for (const [deviceId, info] of this.devicePresence) {
            if (now - info.lastSeen.getTime() > this.PRESENCE_TIMEOUT_MS) {
                this.devicePresence.delete(deviceId);
                this.emit('device_offline', { deviceId, deviceType: info.deviceType });
            }
        }
    }
    /**
     * Get all currently online devices.
     */
    getOnlineDevices() {
        return Array.from(this.devicePresence.entries()).map(([deviceId, info]) => ({
            deviceId,
            ...info,
        }));
    }
    // ==========================================================================
    // CONTEXT HUB ELECTION
    // ==========================================================================
    /**
     * Determine if this device should act as the context hub.
     * Uses a simple election: desktop > mobile > web > others.
     * In a real system, this would use a proper leader election algorithm.
     */
    isContextHub() {
        const hubPriority = {
            desktop: 100,
            mobile: 80,
            web: 60,
            mcp: 50,
            api: 40,
            smartglasses: 30,
            wearable: 20,
            smarthome: 10,
            unknown: 0,
        };
        const myPriority = hubPriority[this.deviceType] || 0;
        for (const [_, info] of this.devicePresence) {
            const theirPriority = hubPriority[info.deviceType] || 0;
            if (theirPriority > myPriority) {
                return false; // Another device has higher priority
            }
        }
        return true; // We're the hub
    }
    /**
     * Trigger context integration (called when we're the hub).
     */
    triggerContextIntegration() {
        // Debounce integration to avoid too-frequent updates
        this.emit('integrate_context');
    }
    // ==========================================================================
    // CATCH-UP SYNC
    // ==========================================================================
    /**
     * Request catch-up sync when reconnecting.
     */
    async requestCatchUpSync() {
        if (!this.redisClient)
            return;
        const message = {
            type: 'control',
            messageId: this.generateMessageId(),
            timestamp: new Date().toISOString(),
            userId: this.userId,
            deviceId: this.deviceId,
            deviceType: this.deviceType,
            command: 'force_sync',
        };
        await this.redisClient.publish(SYNC_CHANNELS.control(this.userId), JSON.stringify(message));
    }
    // ==========================================================================
    // UTILITIES
    // ==========================================================================
    /**
     * Generate a unique message ID.
     */
    generateMessageId() {
        return `${this.deviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    /**
     * Shutdown the sync service.
     */
    async shutdown() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.subscriberClient) {
            await this.subscriberClient.unsubscribe();
        }
        this.emit('shutdown');
        this.removeAllListeners();
        console.log(`[RealtimeSync] Shutdown for device ${this.deviceId}`);
    }
}
// ============================================================================
// CONTEXT HUB (SERVER-SIDE INTEGRATION)
// ============================================================================
/**
 * Server-side context hub that integrates updates from all devices.
 * Runs on the backend, not on individual devices.
 */
export class ContextHub {
    constructor() {
        this.redisClient = null;
        this.subscriberClient = null;
        // Per-user state
        this.userContexts = new Map();
        this.userVersions = new Map();
        // Integration debounce
        this.pendingIntegrations = new Map();
        this.INTEGRATION_DEBOUNCE_MS = 100; // 100ms debounce
    }
    /**
     * Initialize the context hub.
     */
    async initialize(publishClient, subscribeClient) {
        this.redisClient = publishClient;
        this.subscriberClient = subscribeClient;
        // Subscribe to all user context channels using pattern
        await this.subscriberClient.pSubscribe('memorable:sync:*:context', (message, channel) => {
            this.handleContextUpdate(message, channel);
        });
        await this.subscriberClient.pSubscribe('memorable:sync:*:sensor:*', (message, channel) => {
            this.handleSensorUpdate(message, channel);
        });
        console.log('[ContextHub] Initialized and listening for updates');
    }
    /**
     * Handle context update from a device.
     */
    handleContextUpdate(messageStr, channel) {
        try {
            const message = JSON.parse(messageStr);
            const userId = message.userId;
            // Update device context
            this.updateDeviceContext(userId, message.deviceId, message.deviceType, message.delta);
            // Schedule integration
            this.scheduleIntegration(userId);
        }
        catch (error) {
            console.error('[ContextHub] Error handling context update:', error);
        }
    }
    /**
     * Handle sensor update from a device.
     */
    handleSensorUpdate(messageStr, channel) {
        try {
            const message = JSON.parse(messageStr);
            const userId = message.userId;
            // Update device sensor reading
            this.updateDeviceSensor(userId, message.deviceId, message.sensorType, message.reading);
            // Schedule integration
            this.scheduleIntegration(userId);
        }
        catch (error) {
            console.error('[ContextHub] Error handling sensor update:', error);
        }
    }
    /**
     * Update device context in our local state.
     */
    updateDeviceContext(userId, deviceId, deviceType, delta) {
        if (!this.userContexts.has(userId)) {
            this.userContexts.set(userId, new Map());
        }
        const userDevices = this.userContexts.get(userId);
        let context = userDevices.get(deviceId);
        if (!context) {
            const now = new Date();
            context = {
                userId,
                deviceId,
                deviceType,
                timestamp: now.toISOString(),
                expiresAt: new Date(now.getTime() + STALENESS_CONFIG.deviceContextTTL[deviceType]).toISOString(),
            };
        }
        // Apply delta
        if (delta.location) {
            context.location = {
                name: delta.location.value,
                confidence: delta.location.confidence,
            };
        }
        if (delta.activity) {
            context.activity = {
                type: delta.activity.value,
                confidence: delta.activity.confidence,
            };
        }
        if (delta.people) {
            context.people = {
                names: delta.people.names,
                confidence: delta.people.confidence,
                source: 'detected',
            };
        }
        context.timestamp = new Date().toISOString();
        userDevices.set(deviceId, context);
    }
    /**
     * Update device sensor reading.
     */
    updateDeviceSensor(userId, deviceId, sensorType, reading) {
        if (!this.userContexts.has(userId)) {
            this.userContexts.set(userId, new Map());
        }
        const userDevices = this.userContexts.get(userId);
        let context = userDevices.get(deviceId);
        if (!context) {
            const now = new Date();
            const deviceType = 'unknown';
            context = {
                userId,
                deviceId,
                deviceType,
                timestamp: now.toISOString(),
                expiresAt: new Date(now.getTime() + STALENESS_CONFIG.deviceContextTTL[deviceType]).toISOString(),
            };
            userDevices.set(deviceId, context);
        }
        // Store sensor reading (simplified - would have proper sensor storage)
        if (!context.sensors) {
            context.sensors = new Map();
        }
        context.sensors.set(sensorType, reading);
        context.timestamp = new Date().toISOString();
        userDevices.set(deviceId, context);
    }
    /**
     * Schedule context integration with debouncing.
     */
    scheduleIntegration(userId) {
        // Cancel pending integration
        const pending = this.pendingIntegrations.get(userId);
        if (pending) {
            clearTimeout(pending);
        }
        // Schedule new integration
        const timeout = setTimeout(() => {
            this.integrateContext(userId);
            this.pendingIntegrations.delete(userId);
        }, this.INTEGRATION_DEBOUNCE_MS);
        this.pendingIntegrations.set(userId, timeout);
    }
    /**
     * Integrate context from all devices for a user.
     */
    async integrateContext(userId) {
        const userDevices = this.userContexts.get(userId);
        if (!userDevices || userDevices.size === 0)
            return;
        const contexts = Array.from(userDevices.values());
        // Resolve each dimension using priority rules
        const location = this.resolveLocation(contexts);
        const activity = this.resolveActivity(contexts);
        const people = this.resolvePeople(contexts);
        // Build unified context
        const unified = {
            location: location.value,
            activity: activity.value,
            people: people.values,
            confidence: Math.min(location.confidence, activity.confidence, people.confidence),
        };
        // Build contributors list
        const contributors = [];
        for (const ctx of contexts) {
            const contributed = [];
            if (ctx.location && ctx.deviceId === location.source)
                contributed.push('location');
            if (ctx.activity && ctx.deviceId === activity.source)
                contributed.push('activity');
            if (ctx.people && people.sources.includes(ctx.deviceId))
                contributed.push('social');
            if (contributed.length > 0) {
                contributors.push({ deviceId: ctx.deviceId, contributed });
            }
        }
        // Increment version
        const version = (this.userVersions.get(userId) || 0) + 1;
        this.userVersions.set(userId, version);
        // Broadcast unified context
        await this.broadcastUnified(userId, unified, contributors, version);
    }
    /**
     * Resolve location from all device contexts.
     * Mobile devices have highest priority (GPS).
     */
    resolveLocation(contexts) {
        let best = { value: 'Unknown', confidence: 0, source: '' };
        for (const ctx of contexts) {
            if (!ctx.location)
                continue;
            const priority = SENSOR_PRIORITY[ctx.deviceType]?.location || 0;
            const score = priority * (ctx.location.confidence || 1);
            if (score > best.confidence) {
                best = {
                    value: ctx.location.name || 'Unknown',
                    confidence: score,
                    source: ctx.deviceId,
                };
            }
        }
        return best;
    }
    /**
     * Resolve activity from all device contexts.
     * Most recent wins.
     */
    resolveActivity(contexts) {
        let best = { value: 'idle', confidence: 0, source: '', timestamp: '' };
        for (const ctx of contexts) {
            if (!ctx.activity)
                continue;
            if (ctx.timestamp > best.timestamp) {
                best = {
                    value: ctx.activity.type || 'idle',
                    confidence: ctx.activity.confidence || 1,
                    source: ctx.deviceId,
                    timestamp: ctx.timestamp,
                };
            }
        }
        return best;
    }
    /**
     * Resolve people from all device contexts.
     * Merge from all devices.
     */
    resolvePeople(contexts) {
        const people = new Set();
        const sources = [];
        let totalConfidence = 0;
        let count = 0;
        for (const ctx of contexts) {
            if (!ctx.people || ctx.people.names.length === 0)
                continue;
            for (const name of ctx.people.names) {
                people.add(name);
            }
            sources.push(ctx.deviceId);
            totalConfidence += ctx.people.confidence || 1;
            count++;
        }
        return {
            values: Array.from(people),
            confidence: count > 0 ? totalConfidence / count : 0,
            sources,
        };
    }
    /**
     * Broadcast unified context to all devices.
     */
    async broadcastUnified(userId, context, contributors, version) {
        if (!this.redisClient)
            return;
        const message = {
            type: 'unified_context',
            messageId: `hub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            userId,
            deviceId: 'context_hub',
            deviceType: 'api',
            context,
            contributors,
            version,
        };
        await this.redisClient.publish(SYNC_CHANNELS.unifiedContext(userId), JSON.stringify(message));
    }
    /**
     * Shutdown the context hub.
     */
    async shutdown() {
        // Cancel all pending integrations
        for (const timeout of this.pendingIntegrations.values()) {
            clearTimeout(timeout);
        }
        if (this.subscriberClient) {
            await this.subscriberClient.pUnsubscribe();
        }
        console.log('[ContextHub] Shutdown');
    }
}
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
let globalSyncService = null;
let globalContextHub = null;
/**
 * Get or create the sync service for a device.
 */
export function getSyncService(userId, deviceId, deviceType, capabilities = []) {
    if (!globalSyncService) {
        globalSyncService = new RealtimeSyncService(userId, deviceId, deviceType, capabilities);
    }
    return globalSyncService;
}
/**
 * Get or create the context hub (server-side only).
 */
export function getContextHub() {
    if (!globalContextHub) {
        globalContextHub = new ContextHub();
    }
    return globalContextHub;
}
/**
 * Reset services (for testing).
 */
export function resetSyncServices() {
    globalSyncService = null;
    globalContextHub = null;
}
