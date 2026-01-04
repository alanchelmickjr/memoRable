/**
 * @file Context Frame System
 *
 * Manages the "rolling window" of what matters RIGHT NOW.
 * Think of it as your brain automatically surfacing relevant memories
 * when you walk into a room or start talking to someone.
 *
 * Frame components:
 * - Location: Where you are (park, office, home, coffee shop)
 * - People: Who's present or who you're about to meet
 * - Activity: What you're doing (meeting, working, relaxing)
 * - Time: Calendar events, time of day, day patterns
 * - Emotion: Current emotional state (optional)
 *
 * Multi-Device Architecture (Brain-Inspired):
 * - Each device maintains its own context stream (like sensory subsystems)
 * - Contexts are integrated into a unified perception of "now"
 * - Device-specific Redis keys prevent cross-device interference
 * - Resolution strategies handle conflicts (mobile wins for location, etc.)
 *
 * The frame is stored in Redis for fast access and automatically
 * queries relevant memories when components change.
 */
import type { RedisClientType } from 'redis';
import { DeviceType } from './device_context';
/**
 * A single dimension of the context frame.
 */
export interface FrameDimension {
    value: string;
    confidence: number;
    source: 'explicit' | 'inferred' | 'calendar' | 'location_service' | 'default';
    since: string;
}
/**
 * The complete context frame - what's happening right now.
 * Now device-aware for multi-device support.
 */
export interface ContextFrame {
    userId: string;
    deviceId?: string;
    deviceType?: DeviceType;
    location?: FrameDimension;
    people: FrameDimension[];
    activity?: FrameDimension;
    calendarEvent?: {
        title: string;
        with?: string[];
        location?: string;
        startTime: string;
        endTime: string;
    };
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayType: 'weekday' | 'weekend';
    mood?: FrameDimension;
    frameId: string;
    createdAt: string;
    expiresAt: string;
    lastUpdated: string;
}
/**
 * Memories surfaced for the current context.
 */
export interface ContextualMemories {
    aboutPeople: Array<{
        person: string;
        memories: SurfacedMemory[];
        openLoops: LoopSummary[];
        upcomingEvents: EventSummary[];
    }>;
    aboutLocation: SurfacedMemory[];
    aboutActivity: SurfacedMemory[];
    recentRelevant: SurfacedMemory[];
    briefings: Map<string, QuickBriefing>;
    suggestedTopics: string[];
    sensitivities: string[];
    forFrame: string;
    generatedAt: string;
}
export interface SurfacedMemory {
    memoryId: string;
    text: string;
    relevanceScore: number;
    salienceScore: number;
    matchedOn: ('person' | 'location' | 'activity' | 'topic' | 'time')[];
    createdAt: string;
}
export interface LoopSummary {
    id: string;
    description: string;
    owner: 'self' | 'them' | 'mutual';
    isOverdue: boolean;
    dueDate?: string;
}
export interface EventSummary {
    description: string;
    eventDate?: string;
    daysUntil?: number;
    goodToMention: boolean;
}
export interface QuickBriefing {
    person: string;
    lastInteraction?: string;
    youOweThem: number;
    theyOweYou: number;
    upcomingEvents: number;
    topMemory?: string;
}
/**
 * Initialize with Redis client.
 */
export declare function initContextFrame(redis: RedisClientType): void;
/**
 * Get or create the current context frame for a user.
 * If deviceId is provided, returns device-specific context.
 * Otherwise returns the legacy user-level context (for backwards compatibility).
 */
export declare function getContextFrame(userId: string, deviceId?: string): Promise<ContextFrame | null>;
/**
 * Get all active device contexts for a user.
 * Returns array of contexts from all recently-active devices.
 */
export declare function getAllDeviceContexts(userId: string): Promise<ContextFrame[]>;
/**
 * Update the context frame with new information.
 * Triggers memory surfacing when significant changes occur.
 *
 * Multi-Device Support:
 * - If deviceId is provided, updates that device's specific context
 * - Device context is stored separately and tracked in active devices set
 * - Unified context is recomputed asynchronously after device updates
 */
export declare function updateContextFrame(userId: string, updates: {
    location?: string;
    people?: string[];
    activity?: string;
    calendarEvent?: ContextFrame['calendarEvent'];
    mood?: string;
}, options?: {
    source?: FrameDimension['source'];
    confidence?: number;
    surfaceMemories?: boolean;
    deviceId?: string;
    deviceType?: DeviceType;
}): Promise<{
    frame: ContextFrame;
    memoriesSurfaced?: ContextualMemories;
    significantChange: boolean;
}>;
/**
 * Clear the context frame (e.g., when leaving a location or ending a meeting).
 *
 * Multi-Device: Pass deviceId to clear device-specific context.
 */
export declare function clearContextFrame(userId: string, dimensions?: ('location' | 'people' | 'activity' | 'calendar' | 'mood')[], deviceId?: string): Promise<ContextFrame>;
/**
 * Add a person to the current frame (e.g., someone joined the conversation).
 *
 * Multi-Device: Pass deviceId to add person to device-specific context.
 */
export declare function addPersonToFrame(userId: string, person: string, options?: {
    source?: FrameDimension['source'];
    surfaceMemories?: boolean;
    deviceId?: string;
    deviceType?: DeviceType;
}): Promise<{
    frame: ContextFrame;
    briefing?: QuickBriefing;
    memories?: SurfacedMemory[];
}>;
/**
 * Remove a person from the current frame.
 *
 * Multi-Device: Pass deviceId to remove from device-specific context.
 */
export declare function removePersonFromFrame(userId: string, person: string, deviceId?: string): Promise<ContextFrame>;
/**
 * Surface relevant memories for the current context frame.
 * This is the "magic" - automatically bringing up what matters.
 */
export declare function surfaceMemoriesForFrame(frame: ContextFrame): Promise<ContextualMemories>;
/**
 * Set context for MCP - simplified interface.
 * Example: "I'm at the park meeting Judy"
 *
 * Multi-Device: Pass deviceId and deviceType to set device-specific context.
 */
export declare function setContext(userId: string, context: {
    location?: string;
    people?: string[];
    activity?: string;
    calendarEvent?: ContextFrame['calendarEvent'];
}, deviceOptions?: {
    deviceId?: string;
    deviceType?: DeviceType;
}): Promise<ContextualMemories>;
/**
 * Get what's relevant right now based on current frame.
 *
 * Multi-Device: Pass deviceId to get device-specific context.
 * Without deviceId, returns user-level context for backwards compatibility.
 */
export declare function whatMattersNow(userId: string, deviceId?: string): Promise<{
    frame: ContextFrame | null;
    memories: ContextualMemories | null;
}>;
/**
 * Clear context for a specific device or all devices.
 */
export declare function clearDeviceContext(userId: string, deviceId: string): Promise<void>;
/**
 * Get unified context by integrating all device contexts.
 * Uses the brain-inspired fusion approach - mobile for location, merge people, etc.
 */
export declare function getUnifiedUserContext(userId: string): Promise<{
    location: string;
    activity: string;
    people: string[];
    primaryDevice: string | null;
    activeDeviceCount: number;
}>;
