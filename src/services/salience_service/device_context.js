/**
 * Device Context Management - Brain-Inspired Multi-Device Architecture
 *
 * Like the brain's sensory integration:
 * - Each device is a sensory subsystem (eyes, ears, touch)
 * - Each maintains its own context stream
 * - Integration layer fuses streams into unified perception
 * - Temporal binding ensures coherent "now" across devices
 */
import { v4 as uuidv4 } from 'uuid';
export const DEFAULT_RESOLUTION_RULES = [
    {
        field: 'location',
        strategy: 'mobile_for_location', // Phone knows where you are
    },
    {
        field: 'activity',
        strategy: 'latest', // Most recent activity
    },
    {
        field: 'people',
        strategy: 'merge', // Combine all detected people
    },
    {
        field: 'emotionalState',
        strategy: 'highest_confidence',
    },
];
// ============================================================================
// Device Registry
// ============================================================================
export class DeviceRegistry {
    constructor() {
        this.devices = new Map();
    }
    /**
     * Register or update a device
     */
    registerDevice(userId, deviceId, deviceType, capabilities) {
        const existing = this.devices.get(`${userId}:${deviceId}`);
        const now = new Date().toISOString();
        const device = {
            deviceId,
            deviceType,
            firstSeen: existing?.firstSeen || now,
            lastSeen: now,
            capabilities: {
                hasLocation: capabilities?.hasLocation ?? (deviceType === 'mobile'),
                hasCamera: capabilities?.hasCamera ?? (deviceType === 'mobile'),
                hasCalendar: capabilities?.hasCalendar ?? true,
                hasMicrophone: capabilities?.hasMicrophone ?? (deviceType !== 'api'),
                hasLidar: capabilities?.hasLidar ?? false,
                hasTranscription: capabilities?.hasTranscription ?? (deviceType !== 'api'),
                hasBiometrics: capabilities?.hasBiometrics ?? (deviceType === 'wearable'),
                hasAmbient: capabilities?.hasAmbient ?? (deviceType === 'mobile' || deviceType === 'wearable'),
                isAlwaysOn: capabilities?.isAlwaysOn ?? (deviceType === 'api'),
            },
        };
        this.devices.set(`${userId}:${deviceId}`, device);
        return device;
    }
    /**
     * Get all devices for a user
     */
    getUserDevices(userId) {
        const devices = [];
        for (const [key, device] of this.devices) {
            if (key.startsWith(`${userId}:`)) {
                devices.push(device);
            }
        }
        return devices;
    }
    /**
     * Generate a new device ID
     */
    static generateDeviceId() {
        return `dev_${uuidv4().slice(0, 12)}`;
    }
    /**
     * Infer device type from user agent or context
     */
    static inferDeviceType(userAgent, source) {
        if (source === 'mcp')
            return 'mcp';
        if (source === 'api')
            return 'api';
        if (!userAgent)
            return 'unknown';
        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return 'mobile';
        }
        if (ua.includes('electron') || ua.includes('desktop')) {
            return 'desktop';
        }
        if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) {
            return 'web';
        }
        return 'unknown';
    }
}
// ============================================================================
// Context Staleness Configuration
// ============================================================================
export const STALENESS_CONFIG = {
    // How long before a device context is considered stale
    deviceContextTTL: {
        mobile: 5 * 60 * 1000, // 5 minutes - phones update frequently
        desktop: 15 * 60 * 1000, // 15 minutes - desktops less frequent
        web: 10 * 60 * 1000, // 10 minutes
        api: 60 * 60 * 1000, // 1 hour - APIs are persistent
        mcp: 30 * 60 * 1000, // 30 minutes
        wearable: 2 * 60 * 1000, // 2 minutes - constant heartbeat
        smartglasses: 1 * 60 * 1000, // 1 minute - real-time visual
        smarthome: 30 * 60 * 1000, // 30 minutes - ambient sensors
        unknown: 10 * 60 * 1000,
    },
    // How often to recompute unified context
    unifiedContextRefreshInterval: 30 * 1000, // 30 seconds
    // Minimum time between context updates from same device
    deviceUpdateThrottle: 5 * 1000, // 5 seconds
};
// ============================================================================
// Redis Key Helpers
// ============================================================================
export const DEVICE_REDIS_KEYS = {
    // Per-device context frame
    deviceContext: (userId, deviceId) => `memorable:context:${userId}:device:${deviceId}`,
    // List of active devices for user
    activeDevices: (userId) => `memorable:devices:${userId}:active`,
    // Unified context (computed)
    unifiedContext: (userId) => `memorable:context:${userId}:unified`,
    // Device registry
    deviceInfo: (userId, deviceId) => `memorable:devices:${userId}:info:${deviceId}`,
    // Device-specific attention window
    attentionWindow: (userId, deviceId) => `memorable:attention:${userId}:${deviceId}:4w`,
    // Device-specific emotional state
    emotionalState: (userId, deviceId) => `memorable:emotion:${userId}:${deviceId}`,
};
// ============================================================================
// Exports
// ============================================================================
export function createDefaultDeviceContext(userId, deviceId, deviceType) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STALENESS_CONFIG.deviceContextTTL[deviceType]);
    return {
        userId,
        deviceId,
        deviceType,
        timestamp: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
    };
}
