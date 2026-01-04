/**
 * Device Context Management - Brain-Inspired Multi-Device Architecture
 *
 * Like the brain's sensory integration:
 * - Each device is a sensory subsystem (eyes, ears, touch)
 * - Each maintains its own context stream
 * - Integration layer fuses streams into unified perception
 * - Temporal binding ensures coherent "now" across devices
 */
export type DeviceType = 'mobile' | 'desktop' | 'web' | 'api' | 'mcp' | 'wearable' | 'smartglasses' | 'smarthome' | 'unknown';
export interface DeviceInfo {
    deviceId: string;
    deviceType: DeviceType;
    deviceName?: string;
    firstSeen: string;
    lastSeen: string;
    capabilities: DeviceCapabilities;
}
export interface DeviceCapabilities {
    hasLocation: boolean;
    hasCamera: boolean;
    hasCalendar: boolean;
    hasMicrophone: boolean;
    hasLidar: boolean;
    hasTranscription: boolean;
    hasBiometrics: boolean;
    hasAmbient: boolean;
    isAlwaysOn: boolean;
    supportedSensors?: SensorType[];
}
export type SensorType = 'location' | 'audio' | 'visual' | 'calendar' | 'activity' | 'biometric' | 'environment' | 'social' | 'semantic';
export interface SensorReading {
    sensorType: SensorType;
    deviceId: string;
    timestamp: string;
    confidence: number;
    data: SensorData;
    metadata?: {
        source: string;
        accuracy?: number;
        latency?: number;
    };
}
export type SensorData = LocationSensorData | AudioSensorData | VisualSensorData | CalendarSensorData | ActivitySensorData | BiometricSensorData | EnvironmentSensorData | SocialSensorData | SemanticSensorData;
export interface LocationSensorData {
    type: 'location';
    name?: string;
    coordinates?: {
        lat: number;
        lng: number;
        altitude?: number;
    };
    accuracy: number;
    source: 'gps' | 'wifi' | 'ble' | 'ip' | 'manual';
    placeType?: string;
}
export interface AudioSensorData {
    type: 'audio';
    transcription?: string;
    speakers?: {
        id: string;
        name?: string;
        segments: {
            start: number;
            end: number;
            text: string;
        }[];
    }[];
    ambient?: {
        noiseLevel: number;
        classification: string;
    };
    language?: string;
}
export interface VisualSensorData {
    type: 'visual';
    lidar?: {
        roomSize?: {
            width: number;
            height: number;
            depth: number;
        };
        objectCount: number;
        peopleDetected: number;
    };
    screen?: {
        activeApp: string;
        windowTitle?: string;
        contentType?: string;
    };
    camera?: {
        facesDetected: number;
        recognizedPeople?: string[];
        scene?: string;
    };
}
export interface CalendarSensorData {
    type: 'calendar';
    currentEvent?: {
        title: string;
        attendees: string[];
        location?: string;
        isOngoing: boolean;
        minutesRemaining?: number;
    };
    nextEvent?: {
        title: string;
        attendees: string[];
        startsIn: number;
    };
}
export interface ActivitySensorData {
    type: 'activity';
    activeApp?: string;
    appCategory?: string;
    typingSpeed?: number;
    idleTime?: number;
    focusScore?: number;
}
export interface BiometricSensorData {
    type: 'biometric';
    heartRate?: number;
    heartRateVariability?: number;
    stressLevel?: number;
    energyLevel?: number;
    sleepQuality?: number;
}
export interface EnvironmentSensorData {
    type: 'environment';
    ambientLight?: number;
    noiseLevel?: number;
    temperature?: number;
    humidity?: number;
    airQuality?: number;
}
export interface SocialSensorData {
    type: 'social';
    peopleNearby?: string[];
    activeConversation?: boolean;
    communicationMode?: 'voice' | 'video' | 'text' | 'in-person';
    meetingContext?: {
        type: 'scheduled' | 'adhoc';
        participants: string[];
    };
}
export interface SemanticSensorData {
    type: 'semantic';
    topics?: string[];
    entities?: {
        people: string[];
        organizations: string[];
        locations: string[];
        concepts: string[];
    };
    sentiment?: number;
    intent?: string;
}
export interface DeviceContextFrame {
    userId: string;
    deviceId: string;
    deviceType: DeviceType;
    timestamp: string;
    expiresAt: string;
    location?: {
        name: string;
        type?: string;
        coordinates?: {
            lat: number;
            lng: number;
            accuracy: number;
        };
        confidence: number;
    };
    activity?: {
        type: string;
        application?: string;
        project?: string;
        confidence: number;
    };
    people?: {
        names: string[];
        source: 'calendar' | 'manual' | 'detected' | 'inferred';
        confidence: number;
    };
    emotionalState?: {
        valence: number;
        arousal: number;
        dominantEmotion?: string;
        confidence: number;
    };
    sensors?: Map<SensorType, SensorReading>;
    metadata?: Record<string, unknown>;
}
export interface UnifiedUserContext {
    userId: string;
    timestamp: string;
    activeDevices: {
        deviceId: string;
        deviceType: DeviceType;
        lastUpdate: string;
        isStale: boolean;
    }[];
    location: {
        resolved: string;
        source: string;
        confidence: number;
        conflicting?: {
            deviceId: string;
            location: string;
        }[];
    };
    activity: {
        primary: string;
        secondary?: string;
        sources: {
            deviceId: string;
            activity: string;
            confidence: number;
        }[];
    };
    people: {
        present: string[];
        likely: string[];
        sources: Map<string, string[]>;
    };
    patterns: {
        isMultitasking: boolean;
        primaryDevice: string;
        deviceSwitchPredicted?: {
            toDevice: string;
            confidence: number;
            reason: string;
        };
    };
}
export interface ResolutionRule {
    field: keyof DeviceContextFrame;
    strategy: ResolutionStrategy;
    devicePriority?: DeviceType[];
    customResolver?: (contexts: DeviceContextFrame[]) => unknown;
}
export type ResolutionStrategy = 'latest' | 'highest_confidence' | 'priority' | 'mobile_for_location' | 'merge' | 'custom';
export declare const DEFAULT_RESOLUTION_RULES: ResolutionRule[];
export declare class DeviceRegistry {
    private devices;
    /**
     * Register or update a device
     */
    registerDevice(userId: string, deviceId: string, deviceType: DeviceType, capabilities?: Partial<DeviceCapabilities>): DeviceInfo;
    /**
     * Get all devices for a user
     */
    getUserDevices(userId: string): DeviceInfo[];
    /**
     * Generate a new device ID
     */
    static generateDeviceId(): string;
    /**
     * Infer device type from user agent or context
     */
    static inferDeviceType(userAgent?: string, source?: string): DeviceType;
}
export declare const STALENESS_CONFIG: {
    deviceContextTTL: {
        mobile: number;
        desktop: number;
        web: number;
        api: number;
        mcp: number;
        wearable: number;
        smartglasses: number;
        smarthome: number;
        unknown: number;
    };
    unifiedContextRefreshInterval: number;
    deviceUpdateThrottle: number;
};
export declare const DEVICE_REDIS_KEYS: {
    deviceContext: (userId: string, deviceId: string) => string;
    activeDevices: (userId: string) => string;
    unifiedContext: (userId: string) => string;
    deviceInfo: (userId: string, deviceId: string) => string;
    attentionWindow: (userId: string, deviceId: string) => string;
    emotionalState: (userId: string, deviceId: string) => string;
};
export declare function createDefaultDeviceContext(userId: string, deviceId: string, deviceType: DeviceType): DeviceContextFrame;
