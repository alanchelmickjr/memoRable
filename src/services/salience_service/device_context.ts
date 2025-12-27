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

// ============================================================================
// Device Types & Interfaces
// ============================================================================

export type DeviceType = 'mobile' | 'desktop' | 'web' | 'api' | 'mcp' | 'unknown';

export interface DeviceInfo {
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;          // "iPhone 15", "Work Laptop", etc.
  firstSeen: string;            // ISO timestamp
  lastSeen: string;             // ISO timestamp
  capabilities: DeviceCapabilities;
}

export interface DeviceCapabilities {
  hasLocation: boolean;         // GPS/location services
  hasCamera: boolean;           // Can capture visual context
  hasCalendar: boolean;         // Access to calendar
  hasMicrophone: boolean;       // Audio context
  hasLidar: boolean;            // Spatial awareness (iPhone Pro, etc.)
  hasTranscription: boolean;    // Real-time speech-to-text
  hasBiometrics: boolean;       // Heart rate, stress, etc.
  hasAmbient: boolean;          // Light, noise, temperature
  isAlwaysOn: boolean;          // Server/API vs interactive device
}

// ============================================================================
// Sensor Stream Types - Like Brain Sensory Subsystems
// ============================================================================

export type SensorType =
  | 'location'        // GPS, WiFi, BLE beacons
  | 'audio'           // Microphone, transcription, speaker ID
  | 'visual'          // Camera, screen content, LIDAR depth
  | 'calendar'        // Scheduled events, meetings
  | 'activity'        // App usage, typing, mouse movement
  | 'biometric'       // Heart rate, HRV, stress indicators
  | 'environment'     // Ambient light, noise level, temperature
  | 'social'          // Detected people, communication patterns
  | 'semantic';       // Extracted meaning from content

export interface SensorReading {
  sensorType: SensorType;
  deviceId: string;
  timestamp: string;
  confidence: number;           // 0-1
  data: SensorData;
  metadata?: {
    source: string;             // "gps", "wifi", "lidar", "whisper", etc.
    accuracy?: number;
    latency?: number;           // ms from capture to processing
  };
}

export type SensorData =
  | LocationSensorData
  | AudioSensorData
  | VisualSensorData
  | CalendarSensorData
  | ActivitySensorData
  | BiometricSensorData
  | EnvironmentSensorData
  | SocialSensorData
  | SemanticSensorData;

export interface LocationSensorData {
  type: 'location';
  name?: string;
  coordinates?: { lat: number; lng: number; altitude?: number };
  accuracy: number;             // meters
  source: 'gps' | 'wifi' | 'ble' | 'ip' | 'manual';
  placeType?: string;           // "office", "home", "cafe", "transit"
}

export interface AudioSensorData {
  type: 'audio';
  transcription?: string;       // Real-time speech-to-text
  speakers?: {                  // Speaker diarization
    id: string;
    name?: string;
    segments: { start: number; end: number; text: string }[];
  }[];
  ambient?: {
    noiseLevel: number;         // dB
    classification: string;     // "quiet", "conversation", "traffic", "music"
  };
  language?: string;
}

export interface VisualSensorData {
  type: 'visual';
  lidar?: {
    roomSize?: { width: number; height: number; depth: number };
    objectCount: number;
    peopleDetected: number;
  };
  screen?: {
    activeApp: string;
    windowTitle?: string;
    contentType?: string;       // "code", "document", "video", "social"
  };
  camera?: {
    facesDetected: number;
    recognizedPeople?: string[];
    scene?: string;             // "indoor", "outdoor", "meeting"
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
    startsIn: number;           // minutes
  };
}

export interface ActivitySensorData {
  type: 'activity';
  activeApp?: string;
  appCategory?: string;         // "productivity", "communication", "entertainment"
  typingSpeed?: number;         // WPM
  idleTime?: number;            // seconds since last input
  focusScore?: number;          // 0-1 based on app switches, etc.
}

export interface BiometricSensorData {
  type: 'biometric';
  heartRate?: number;
  heartRateVariability?: number;
  stressLevel?: number;         // 0-1
  energyLevel?: number;         // 0-1
  sleepQuality?: number;        // Last night's sleep score
}

export interface EnvironmentSensorData {
  type: 'environment';
  ambientLight?: number;        // lux
  noiseLevel?: number;          // dB
  temperature?: number;         // Celsius
  humidity?: number;
  airQuality?: number;          // AQI
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
  topics?: string[];            // Extracted from content/conversation
  entities?: {                  // Named entities
    people: string[];
    organizations: string[];
    locations: string[];
    concepts: string[];
  };
  sentiment?: number;           // -1 to 1
  intent?: string;              // "planning", "discussing", "deciding"
}

// ============================================================================
// Per-Device Context Frame
// ============================================================================

export interface DeviceContextFrame {
  // Identity
  userId: string;
  deviceId: string;
  deviceType: DeviceType;

  // Temporal
  timestamp: string;            // When this context was set
  expiresAt: string;            // Context validity window

  // Location (device-specific)
  location?: {
    name: string;               // "Coffee Shop", "Office"
    type?: string;              // "work", "home", "social", "transit"
    coordinates?: {
      lat: number;
      lng: number;
      accuracy: number;         // meters
    };
    confidence: number;         // 0-1, how sure is device about location
  };

  // Activity (what's happening on THIS device)
  activity?: {
    type: string;               // "coding", "meeting", "browsing", "idle"
    application?: string;       // "VS Code", "Zoom", "Safari"
    project?: string;           // Current project/workspace
    confidence: number;
  };

  // People (detected by THIS device)
  people?: {
    names: string[];
    source: 'calendar' | 'manual' | 'detected' | 'inferred';
    confidence: number;
  };

  // Emotional state (if detectable by device)
  emotionalState?: {
    valence: number;            // -1 to 1
    arousal: number;            // 0 to 1
    dominantEmotion?: string;
    confidence: number;
  };

  // Device-specific metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Unified User Context (Integrated from all devices)
// ============================================================================

export interface UnifiedUserContext {
  userId: string;

  // Temporal binding - the integrated "now"
  timestamp: string;

  // Active devices contributing to this context
  activeDevices: {
    deviceId: string;
    deviceType: DeviceType;
    lastUpdate: string;
    isStale: boolean;           // No update in staleness window
  }[];

  // Integrated location (resolved from all devices)
  location: {
    resolved: string;           // Best guess location name
    source: string;             // Which device provided this
    confidence: number;
    conflicting?: {             // If devices disagree
      deviceId: string;
      location: string;
    }[];
  };

  // Integrated activity
  activity: {
    primary: string;            // Dominant activity
    secondary?: string;         // Background activity
    sources: {
      deviceId: string;
      activity: string;
      confidence: number;
    }[];
  };

  // Integrated people context
  people: {
    present: string[];          // High confidence present
    likely: string[];           // Lower confidence
    sources: Map<string, string[]>;  // deviceId -> people detected
  };

  // Cross-device patterns detected
  patterns: {
    isMultitasking: boolean;    // Active on multiple devices
    primaryDevice: string;      // Most active device right now
    deviceSwitchPredicted?: {   // Anticipating device switch
      toDevice: string;
      confidence: number;
      reason: string;
    };
  };
}

// ============================================================================
// Context Resolution Rules
// ============================================================================

export interface ResolutionRule {
  field: keyof DeviceContextFrame;
  strategy: ResolutionStrategy;
  devicePriority?: DeviceType[];  // For 'priority' strategy
  customResolver?: (contexts: DeviceContextFrame[]) => unknown;
}

export type ResolutionStrategy =
  | 'latest'              // Most recent update wins
  | 'highest_confidence'  // Highest confidence wins
  | 'priority'            // Device type priority
  | 'mobile_for_location' // Mobile always wins for location
  | 'merge'               // Combine all (for people lists)
  | 'custom';             // Custom resolver function

export const DEFAULT_RESOLUTION_RULES: ResolutionRule[] = [
  {
    field: 'location',
    strategy: 'mobile_for_location',  // Phone knows where you are
  },
  {
    field: 'activity',
    strategy: 'latest',               // Most recent activity
  },
  {
    field: 'people',
    strategy: 'merge',                // Combine all detected people
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
  private devices: Map<string, DeviceInfo> = new Map();

  /**
   * Register or update a device
   */
  registerDevice(
    userId: string,
    deviceId: string,
    deviceType: DeviceType,
    capabilities?: Partial<DeviceCapabilities>
  ): DeviceInfo {
    const existing = this.devices.get(`${userId}:${deviceId}`);
    const now = new Date().toISOString();

    const device: DeviceInfo = {
      deviceId,
      deviceType,
      firstSeen: existing?.firstSeen || now,
      lastSeen: now,
      capabilities: {
        hasLocation: capabilities?.hasLocation ?? (deviceType === 'mobile'),
        hasCamera: capabilities?.hasCamera ?? (deviceType === 'mobile'),
        hasCalendar: capabilities?.hasCalendar ?? true,
        hasMicrophone: capabilities?.hasMicrophone ?? (deviceType !== 'api'),
        isAlwaysOn: capabilities?.isAlwaysOn ?? (deviceType === 'api'),
      },
    };

    this.devices.set(`${userId}:${deviceId}`, device);
    return device;
  }

  /**
   * Get all devices for a user
   */
  getUserDevices(userId: string): DeviceInfo[] {
    const devices: DeviceInfo[] = [];
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
  static generateDeviceId(): string {
    return `dev_${uuidv4().slice(0, 12)}`;
  }

  /**
   * Infer device type from user agent or context
   */
  static inferDeviceType(userAgent?: string, source?: string): DeviceType {
    if (source === 'mcp') return 'mcp';
    if (source === 'api') return 'api';

    if (!userAgent) return 'unknown';

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
    mobile: 5 * 60 * 1000,      // 5 minutes - phones update frequently
    desktop: 15 * 60 * 1000,    // 15 minutes - desktops less frequent
    web: 10 * 60 * 1000,        // 10 minutes
    api: 60 * 60 * 1000,        // 1 hour - APIs are persistent
    mcp: 30 * 60 * 1000,        // 30 minutes
    unknown: 10 * 60 * 1000,
  },

  // How often to recompute unified context
  unifiedContextRefreshInterval: 30 * 1000,  // 30 seconds

  // Minimum time between context updates from same device
  deviceUpdateThrottle: 5 * 1000,  // 5 seconds
};

// ============================================================================
// Redis Key Helpers
// ============================================================================

export const DEVICE_REDIS_KEYS = {
  // Per-device context frame
  deviceContext: (userId: string, deviceId: string) =>
    `memorable:context:${userId}:device:${deviceId}`,

  // List of active devices for user
  activeDevices: (userId: string) =>
    `memorable:devices:${userId}:active`,

  // Unified context (computed)
  unifiedContext: (userId: string) =>
    `memorable:context:${userId}:unified`,

  // Device registry
  deviceInfo: (userId: string, deviceId: string) =>
    `memorable:devices:${userId}:info:${deviceId}`,

  // Device-specific attention window
  attentionWindow: (userId: string, deviceId: string) =>
    `memorable:attention:${userId}:${deviceId}:4w`,

  // Device-specific emotional state
  emotionalState: (userId: string, deviceId: string) =>
    `memorable:emotion:${userId}:${deviceId}`,
};

// ============================================================================
// Exports
// ============================================================================

export function createDefaultDeviceContext(
  userId: string,
  deviceId: string,
  deviceType: DeviceType
): DeviceContextFrame {
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
