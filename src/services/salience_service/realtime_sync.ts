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

import type { RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import {
  DeviceType,
  SensorType,
  SensorReading,
  DeviceContextFrame,
  DEVICE_REDIS_KEYS,
  STALENESS_CONFIG,
} from './device_context';

// ============================================================================
// CHANNEL DEFINITIONS
// ============================================================================

/**
 * Redis pub/sub channels for real-time sync.
 * Each sensor type has its own channel for efficient routing.
 */
export const SYNC_CHANNELS = {
  // Per-user context updates
  contextUpdate: (userId: string) => `memorable:sync:${userId}:context`,

  // Per-sensor-type channels (for selective subscription)
  sensorChannel: (userId: string, sensor: SensorType) =>
    `memorable:sync:${userId}:sensor:${sensor}`,

  // Device presence/heartbeat
  devicePresence: (userId: string) => `memorable:sync:${userId}:presence`,

  // Unified context broadcasts
  unifiedContext: (userId: string) => `memorable:sync:${userId}:unified`,

  // Control channel (commands, config updates)
  control: (userId: string) => `memorable:sync:${userId}:control`,
};

// ============================================================================
// SYNC MESSAGE TYPES
// ============================================================================

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
    location?: { value: string; confidence: number };
    activity?: { value: string; confidence: number };
    people?: { names: string[]; confidence: number };
    mood?: { value: string; confidence: number };
  };
  sensors?: SensorReading[];
  sequenceNumber: number;  // For ordering
}

/**
 * Sensor-specific data update.
 */
export interface SensorUpdateMessage extends SyncMessageBase {
  type: 'sensor_update';
  sensorType: SensorType;
  reading: SensorReading;
  priority: number;  // Higher = more authoritative for this sensor type
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
  version: number;  // Incrementing version for cache invalidation
}

/**
 * Control message for commands.
 */
export interface ControlMessage extends SyncMessageBase {
  type: 'control';
  command: 'force_sync' | 'clear_context' | 'set_priority' | 'disconnect';
  payload?: any;
}

export type SyncMessage =
  | ContextUpdateMessage
  | SensorUpdateMessage
  | HeartbeatMessage
  | UnifiedContextMessage
  | ControlMessage;

// ============================================================================
// SENSOR PRIORITY MATRIX
// ============================================================================

/**
 * Priority matrix for conflict resolution.
 * Higher number = higher priority for that sensor type.
 * Device types have different authority for different sensors.
 */
export const SENSOR_PRIORITY: Record<DeviceType, Partial<Record<SensorType, number>>> = {
  mobile: {
    location: 100,     // Phone has GPS - highest authority
    activity: 80,      // Accelerometer
    audio: 70,         // Microphone
    calendar: 60,      // Calendar integration
    social: 50,        // Contacts
  },
  desktop: {
    calendar: 100,     // Best calendar integration
    semantic: 90,      // IDE context, browsing
    activity: 60,      // Inferred from apps
    social: 40,        // Email, slack
  },
  web: {
    semantic: 80,      // Browsing context
    activity: 50,
    social: 40,
  },
  api: {
    semantic: 70,
    calendar: 70,
  },
  mcp: {
    semantic: 90,      // AI assistant context
    activity: 70,
  },
  wearable: {
    biometric: 100,    // Heart rate, etc.
    activity: 90,      // Steps, movement
    location: 70,      // Less accurate GPS
  },
  smartglasses: {
    visual: 100,       // LIDAR, camera
    audio: 90,         // Spatial audio
    social: 80,        // Face recognition
    environment: 80,   // Room scanning
  },
  smarthome: {
    environment: 100,  // Temperature, humidity
    location: 60,      // Presence detection
    audio: 50,         // Smart speakers
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
  private redisClient: RedisClientType | null = null;
  private subscriberClient: RedisClientType | null = null;
  private userId: string;
  private deviceId: string;
  private deviceType: DeviceType;
  private capabilities: SensorType[];

  // Local state
  private lastSequenceNumber = 0;
  private devicePresence = new Map<string, {
    lastSeen: Date;
    capabilities: SensorType[];
    deviceType: DeviceType;
  }>();
  private pendingUpdates: ContextUpdateMessage[] = [];
  private unifiedContextVersion = 0;

  // Heartbeat interval
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 5000;  // 5 seconds
  private readonly PRESENCE_TIMEOUT_MS = 15000;   // 15 seconds

  constructor(
    userId: string,
    deviceId: string,
    deviceType: DeviceType,
    capabilities: SensorType[] = []
  ) {
    super();
    this.userId = userId;
    this.deviceId = deviceId;
    this.deviceType = deviceType;
    this.capabilities = capabilities;
  }

  /**
   * Initialize the sync service with Redis clients.
   * Needs two clients: one for pub, one for sub (Redis requirement).
   */
  async initialize(
    publishClient: RedisClientType,
    subscribeClient: RedisClientType
  ): Promise<void> {
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
  private async subscribeToChannels(): Promise<void> {
    if (!this.subscriberClient) return;

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
  private handleMessage(messageStr: string, channel: string): void {
    try {
      const message = JSON.parse(messageStr) as SyncMessage;

      // Ignore our own messages
      if (message.deviceId === this.deviceId) return;

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
    } catch (error) {
      console.error('[RealtimeSync] Error handling message:', error);
    }
  }

  /**
   * Handle context update from another device.
   */
  private handleContextUpdate(message: ContextUpdateMessage): void {
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
  private handleSensorUpdate(message: SensorUpdateMessage): void {
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
  private handleHeartbeat(message: HeartbeatMessage): void {
    this.updateDevicePresence(
      message.deviceId,
      message.deviceType,
      message.capabilities
    );

    this.emit('device_online', {
      deviceId: message.deviceId,
      deviceType: message.deviceType,
      capabilities: message.capabilities,
    });
  }

  /**
   * Handle unified context broadcast.
   */
  private handleUnifiedContext(message: UnifiedContextMessage): void {
    // Only process if newer than our local version
    if (message.version <= this.unifiedContextVersion) return;

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
  private handleControl(message: ControlMessage): void {
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
  async publishContextUpdate(delta: ContextUpdateMessage['delta']): Promise<void> {
    if (!this.redisClient) return;

    const message: ContextUpdateMessage = {
      type: 'context_update',
      messageId: this.generateMessageId(),
      timestamp: new Date().toISOString(),
      userId: this.userId,
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      delta,
      sequenceNumber: ++this.lastSequenceNumber,
    };

    await this.redisClient.publish(
      SYNC_CHANNELS.contextUpdate(this.userId),
      JSON.stringify(message)
    );
  }

  /**
   * Publish a sensor reading from this device.
   */
  async publishSensorUpdate(
    sensorType: SensorType,
    reading: SensorReading
  ): Promise<void> {
    if (!this.redisClient) return;

    const priority = SENSOR_PRIORITY[this.deviceType]?.[sensorType] || 0;

    const message: SensorUpdateMessage = {
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

    await this.redisClient.publish(
      SYNC_CHANNELS.sensorChannel(this.userId, sensorType),
      JSON.stringify(message)
    );
  }

  /**
   * Broadcast unified context to all devices.
   * Called by the context hub after integration.
   */
  async broadcastUnifiedContext(
    context: UnifiedContextMessage['context'],
    contributors: UnifiedContextMessage['contributors']
  ): Promise<void> {
    if (!this.redisClient) return;

    const message: UnifiedContextMessage = {
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

    await this.redisClient.publish(
      SYNC_CHANNELS.unifiedContext(this.userId),
      JSON.stringify(message)
    );
  }

  // ==========================================================================
  // PRESENCE & HEARTBEAT
  // ==========================================================================

  /**
   * Start sending heartbeats.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.pruneStaleDevices();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Send a heartbeat message.
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.redisClient) return;

    const message: HeartbeatMessage = {
      type: 'heartbeat',
      messageId: this.generateMessageId(),
      timestamp: new Date().toISOString(),
      userId: this.userId,
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      capabilities: this.capabilities,
    };

    await this.redisClient.publish(
      SYNC_CHANNELS.devicePresence(this.userId),
      JSON.stringify(message)
    );
  }

  /**
   * Announce presence on startup.
   */
  private async announcePresence(): Promise<void> {
    await this.sendHeartbeat();
  }

  /**
   * Update device presence tracking.
   */
  private updateDevicePresence(
    deviceId: string,
    deviceType: DeviceType,
    capabilities: SensorType[]
  ): void {
    this.devicePresence.set(deviceId, {
      lastSeen: new Date(),
      deviceType,
      capabilities,
    });
  }

  /**
   * Remove stale devices from presence tracking.
   */
  private pruneStaleDevices(): void {
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
  getOnlineDevices(): Array<{
    deviceId: string;
    deviceType: DeviceType;
    capabilities: SensorType[];
    lastSeen: Date;
  }> {
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
  private isContextHub(): boolean {
    const hubPriority: Record<DeviceType, number> = {
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
        return false;  // Another device has higher priority
      }
    }

    return true;  // We're the hub
  }

  /**
   * Trigger context integration (called when we're the hub).
   */
  private triggerContextIntegration(): void {
    // Debounce integration to avoid too-frequent updates
    this.emit('integrate_context');
  }

  // ==========================================================================
  // CATCH-UP SYNC
  // ==========================================================================

  /**
   * Request catch-up sync when reconnecting.
   */
  private async requestCatchUpSync(): Promise<void> {
    if (!this.redisClient) return;

    const message: ControlMessage = {
      type: 'control',
      messageId: this.generateMessageId(),
      timestamp: new Date().toISOString(),
      userId: this.userId,
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      command: 'force_sync',
    };

    await this.redisClient.publish(
      SYNC_CHANNELS.control(this.userId),
      JSON.stringify(message)
    );
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Generate a unique message ID.
   */
  private generateMessageId(): string {
    return `${this.deviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Shutdown the sync service.
   */
  async shutdown(): Promise<void> {
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
  private redisClient: RedisClientType | null = null;
  private subscriberClient: RedisClientType | null = null;

  // Per-user state
  private userContexts = new Map<string, Map<string, DeviceContextFrame>>();
  private userVersions = new Map<string, number>();

  // Integration debounce
  private pendingIntegrations = new Map<string, NodeJS.Timeout>();
  private readonly INTEGRATION_DEBOUNCE_MS = 100;  // 100ms debounce

  /**
   * Initialize the context hub.
   */
  async initialize(
    publishClient: RedisClientType,
    subscribeClient: RedisClientType
  ): Promise<void> {
    this.redisClient = publishClient;
    this.subscriberClient = subscribeClient;

    // Subscribe to all user context channels using pattern
    await this.subscriberClient.pSubscribe(
      'memorable:sync:*:context',
      (message, channel) => {
        this.handleContextUpdate(message, channel);
      }
    );

    await this.subscriberClient.pSubscribe(
      'memorable:sync:*:sensor:*',
      (message, channel) => {
        this.handleSensorUpdate(message, channel);
      }
    );

    console.log('[ContextHub] Initialized and listening for updates');
  }

  /**
   * Handle context update from a device.
   */
  private handleContextUpdate(messageStr: string, channel: string): void {
    try {
      const message = JSON.parse(messageStr) as ContextUpdateMessage;
      const userId = message.userId;

      // Update device context
      this.updateDeviceContext(userId, message.deviceId, message.deviceType, message.delta);

      // Schedule integration
      this.scheduleIntegration(userId);
    } catch (error) {
      console.error('[ContextHub] Error handling context update:', error);
    }
  }

  /**
   * Handle sensor update from a device.
   */
  private handleSensorUpdate(messageStr: string, channel: string): void {
    try {
      const message = JSON.parse(messageStr) as SensorUpdateMessage;
      const userId = message.userId;

      // Update device sensor reading
      this.updateDeviceSensor(userId, message.deviceId, message.sensorType, message.reading);

      // Schedule integration
      this.scheduleIntegration(userId);
    } catch (error) {
      console.error('[ContextHub] Error handling sensor update:', error);
    }
  }

  /**
   * Update device context in our local state.
   */
  private updateDeviceContext(
    userId: string,
    deviceId: string,
    deviceType: DeviceType,
    delta: ContextUpdateMessage['delta']
  ): void {
    if (!this.userContexts.has(userId)) {
      this.userContexts.set(userId, new Map());
    }

    const userDevices = this.userContexts.get(userId)!;
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
      };
    }

    context.timestamp = new Date().toISOString();
    userDevices.set(deviceId, context);
  }

  /**
   * Update device sensor reading.
   */
  private updateDeviceSensor(
    userId: string,
    deviceId: string,
    sensorType: SensorType,
    reading: SensorReading
  ): void {
    if (!this.userContexts.has(userId)) {
      this.userContexts.set(userId, new Map());
    }

    const userDevices = this.userContexts.get(userId)!;
    let context = userDevices.get(deviceId);

    if (!context) {
      context = {
        userId,
        deviceId,
        deviceType: 'unknown',
        timestamp: new Date().toISOString(),
      };
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
  private scheduleIntegration(userId: string): void {
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
  private async integrateContext(userId: string): Promise<void> {
    const userDevices = this.userContexts.get(userId);
    if (!userDevices || userDevices.size === 0) return;

    const contexts = Array.from(userDevices.values());

    // Resolve each dimension using priority rules
    const location = this.resolveLocation(contexts);
    const activity = this.resolveActivity(contexts);
    const people = this.resolvePeople(contexts);

    // Build unified context
    const unified: UnifiedContextMessage['context'] = {
      location: location.value,
      activity: activity.value,
      people: people.values,
      confidence: Math.min(location.confidence, activity.confidence, people.confidence),
    };

    // Build contributors list
    const contributors: UnifiedContextMessage['contributors'] = [];
    for (const ctx of contexts) {
      const contributed: SensorType[] = [];
      if (ctx.location && ctx.deviceId === location.source) contributed.push('location');
      if (ctx.activity && ctx.deviceId === activity.source) contributed.push('activity');
      if (ctx.people && people.sources.includes(ctx.deviceId)) contributed.push('social');

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
  private resolveLocation(contexts: DeviceContextFrame[]): {
    value: string;
    confidence: number;
    source: string;
  } {
    let best = { value: 'Unknown', confidence: 0, source: '' };

    for (const ctx of contexts) {
      if (!ctx.location) continue;

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
  private resolveActivity(contexts: DeviceContextFrame[]): {
    value: string;
    confidence: number;
    source: string;
  } {
    let best = { value: 'idle', confidence: 0, source: '', timestamp: '' };

    for (const ctx of contexts) {
      if (!ctx.activity) continue;

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
  private resolvePeople(contexts: DeviceContextFrame[]): {
    values: string[];
    confidence: number;
    sources: string[];
  } {
    const people = new Set<string>();
    const sources: string[] = [];
    let totalConfidence = 0;
    let count = 0;

    for (const ctx of contexts) {
      if (!ctx.people || ctx.people.names.length === 0) continue;

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
  private async broadcastUnified(
    userId: string,
    context: UnifiedContextMessage['context'],
    contributors: UnifiedContextMessage['contributors'],
    version: number
  ): Promise<void> {
    if (!this.redisClient) return;

    const message: UnifiedContextMessage = {
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

    await this.redisClient.publish(
      SYNC_CHANNELS.unifiedContext(userId),
      JSON.stringify(message)
    );
  }

  /**
   * Shutdown the context hub.
   */
  async shutdown(): Promise<void> {
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

let globalSyncService: RealtimeSyncService | null = null;
let globalContextHub: ContextHub | null = null;

/**
 * Get or create the sync service for a device.
 */
export function getSyncService(
  userId: string,
  deviceId: string,
  deviceType: DeviceType,
  capabilities: SensorType[] = []
): RealtimeSyncService {
  if (!globalSyncService) {
    globalSyncService = new RealtimeSyncService(userId, deviceId, deviceType, capabilities);
  }
  return globalSyncService;
}

/**
 * Get or create the context hub (server-side only).
 */
export function getContextHub(): ContextHub {
  if (!globalContextHub) {
    globalContextHub = new ContextHub();
  }
  return globalContextHub;
}

/**
 * Reset services (for testing).
 */
export function resetSyncServices(): void {
  globalSyncService = null;
  globalContextHub = null;
}
