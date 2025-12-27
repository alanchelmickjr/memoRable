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
import { collections } from './database';
import { retrieveWithSalience, getMemoriesForPerson } from './retrieval';
import { generateQuickBriefing } from './briefing_generator';
import { getOpenLoops } from './open_loop_tracker';
import { getUpcomingEventsForContact } from './timeline_tracker';
import {
  DeviceContextFrame,
  DeviceType,
  DeviceRegistry,
  DEVICE_REDIS_KEYS,
  STALENESS_CONFIG,
  createDefaultDeviceContext,
} from './device_context';

// ============================================================================
// CONTEXT FRAME TYPES
// ============================================================================

/**
 * A single dimension of the context frame.
 */
export interface FrameDimension {
  value: string;
  confidence: number;  // 0-1, how sure we are
  source: 'explicit' | 'inferred' | 'calendar' | 'location_service' | 'default';
  since: string;       // ISO8601 - when this dimension was set
}

/**
 * The complete context frame - what's happening right now.
 * Now device-aware for multi-device support.
 */
export interface ContextFrame {
  userId: string;

  // Device identity (for multi-device support)
  deviceId?: string;              // Optional for backwards compatibility
  deviceType?: DeviceType;        // mobile, desktop, web, api, mcp

  // Core dimensions
  location?: FrameDimension;
  people: FrameDimension[];      // Can be multiple people
  activity?: FrameDimension;
  calendarEvent?: {
    title: string;
    with?: string[];
    location?: string;
    startTime: string;
    endTime: string;
  };

  // Time context
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayType: 'weekday' | 'weekend';

  // Emotional context (optional)
  mood?: FrameDimension;

  // Frame metadata
  frameId: string;
  createdAt: string;
  expiresAt: string;            // Frames auto-expire
  lastUpdated: string;
}

/**
 * Memories surfaced for the current context.
 */
export interface ContextualMemories {
  // Organized by relevance source
  aboutPeople: Array<{
    person: string;
    memories: SurfacedMemory[];
    openLoops: LoopSummary[];
    upcomingEvents: EventSummary[];
  }>;

  aboutLocation: SurfacedMemory[];
  aboutActivity: SurfacedMemory[];
  recentRelevant: SurfacedMemory[];

  // Quick briefings for people in frame
  briefings: Map<string, QuickBriefing>;

  // What you might want to bring up
  suggestedTopics: string[];

  // Things to be careful about
  sensitivities: string[];

  // Frame this was generated for
  forFrame: string;  // frameId
  generatedAt: string;
}

export interface SurfacedMemory {
  memoryId: string;
  text: string;
  relevanceScore: number;  // Why this memory matters now
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

// ============================================================================
// REDIS KEYS (Device-Aware)
// ============================================================================

/**
 * Generate Redis key for context frame.
 * Uses device-specific key if deviceId provided, otherwise user-level key.
 */
const FRAME_KEY = (userId: string, deviceId?: string) =>
  deviceId
    ? DEVICE_REDIS_KEYS.deviceContext(userId, deviceId)
    : `memorable:frame:${userId}`;

/**
 * Key for unified context across all devices
 */
const UNIFIED_FRAME_KEY = (userId: string) =>
  DEVICE_REDIS_KEYS.unifiedContext(userId);

/**
 * Key for tracking active devices
 */
const ACTIVE_DEVICES_KEY = (userId: string) =>
  DEVICE_REDIS_KEYS.activeDevices(userId);

const FRAME_TTL = 3600; // 1 hour default

// Device registry for managing device information
const deviceRegistry = new DeviceRegistry();

// ============================================================================
// CONTEXT FRAME OPERATIONS
// ============================================================================

let redisClient: RedisClientType | null = null;

/**
 * Initialize with Redis client.
 */
export function initContextFrame(redis: RedisClientType): void {
  redisClient = redis;
}

/**
 * Get or create the current context frame for a user.
 * If deviceId is provided, returns device-specific context.
 * Otherwise returns the legacy user-level context (for backwards compatibility).
 */
export async function getContextFrame(
  userId: string,
  deviceId?: string
): Promise<ContextFrame | null> {
  if (!redisClient) {
    console.warn('[ContextFrame] Redis not initialized, using in-memory fallback');
    const key = deviceId ? `${userId}:${deviceId}` : userId;
    return inMemoryFrames.get(key) || null;
  }

  try {
    const data = await redisClient.get(FRAME_KEY(userId, deviceId));
    if (!data) return null;
    return JSON.parse(data) as ContextFrame;
  } catch (error) {
    console.error('[ContextFrame] Error getting frame:', error);
    return null;
  }
}

/**
 * Get all active device contexts for a user.
 * Returns array of contexts from all recently-active devices.
 */
export async function getAllDeviceContexts(userId: string): Promise<ContextFrame[]> {
  if (!redisClient) {
    console.warn('[ContextFrame] Redis not initialized');
    return [];
  }

  try {
    // Get list of active devices
    const deviceIds = await redisClient.sMembers(ACTIVE_DEVICES_KEY(userId));
    const contexts: ContextFrame[] = [];

    for (const deviceId of deviceIds) {
      const context = await getContextFrame(userId, deviceId);
      if (context) {
        contexts.push(context);
      } else {
        // Device context expired, remove from active set
        await redisClient.sRem(ACTIVE_DEVICES_KEY(userId), deviceId);
      }
    }

    return contexts;
  } catch (error) {
    console.error('[ContextFrame] Error getting all device contexts:', error);
    return [];
  }
}

// In-memory fallback when Redis unavailable
const inMemoryFrames = new Map<string, ContextFrame>();

/**
 * Update the context frame with new information.
 * Triggers memory surfacing when significant changes occur.
 *
 * Multi-Device Support:
 * - If deviceId is provided, updates that device's specific context
 * - Device context is stored separately and tracked in active devices set
 * - Unified context is recomputed asynchronously after device updates
 */
export async function updateContextFrame(
  userId: string,
  updates: {
    location?: string;
    people?: string[];
    activity?: string;
    calendarEvent?: ContextFrame['calendarEvent'];
    mood?: string;
  },
  options: {
    source?: FrameDimension['source'];
    confidence?: number;
    surfaceMemories?: boolean;
    deviceId?: string;
    deviceType?: DeviceType;
  } = {}
): Promise<{
  frame: ContextFrame;
  memoriesSurfaced?: ContextualMemories;
  significantChange: boolean;
}> {
  const now = new Date().toISOString();
  const source = options.source || 'explicit';
  const confidence = options.confidence || 1.0;
  const { deviceId, deviceType } = options;

  // Get existing frame or create new (device-specific if deviceId provided)
  let frame = await getContextFrame(userId, deviceId);
  const isNewFrame = !frame;

  if (!frame) {
    frame = createEmptyFrame(userId, now, deviceId, deviceType);
  }

  // Ensure device info is set on frame
  if (deviceId) {
    frame.deviceId = deviceId;
    frame.deviceType = deviceType || frame.deviceType;
  }

  // Track what changed
  const changes: string[] = [];

  // Update location
  if (updates.location !== undefined) {
    const oldLocation = frame.location?.value;
    if (oldLocation !== updates.location) {
      changes.push('location');
      frame.location = {
        value: updates.location,
        confidence,
        source,
        since: now,
      };
    }
  }

  // Update people
  if (updates.people !== undefined) {
    const oldPeople = new Set(frame.people.map(p => p.value.toLowerCase()));
    const newPeople = new Set(updates.people.map(p => p.toLowerCase()));

    // Check for changes
    const added = updates.people.filter(p => !oldPeople.has(p.toLowerCase()));
    const removed = frame.people.filter(p => !newPeople.has(p.value.toLowerCase()));

    if (added.length > 0 || removed.length > 0) {
      changes.push('people');
      frame.people = updates.people.map(person => ({
        value: person,
        confidence,
        source,
        since: now,
      }));
    }
  }

  // Update activity
  if (updates.activity !== undefined) {
    const oldActivity = frame.activity?.value;
    if (oldActivity !== updates.activity) {
      changes.push('activity');
      frame.activity = {
        value: updates.activity,
        confidence,
        source,
        since: now,
      };
    }
  }

  // Update calendar event
  if (updates.calendarEvent !== undefined) {
    changes.push('calendar');
    frame.calendarEvent = updates.calendarEvent;

    // Auto-populate people from calendar if not set
    if (updates.calendarEvent.with && frame.people.length === 0) {
      frame.people = updates.calendarEvent.with.map(person => ({
        value: person,
        confidence: 0.9,
        source: 'calendar',
        since: now,
      }));
      changes.push('people');
    }

    // Auto-populate location from calendar if not set
    if (updates.calendarEvent.location && !frame.location) {
      frame.location = {
        value: updates.calendarEvent.location,
        confidence: 0.8,
        source: 'calendar',
        since: now,
      };
      changes.push('location');
    }
  }

  // Update mood
  if (updates.mood !== undefined) {
    frame.mood = {
      value: updates.mood,
      confidence,
      source,
      since: now,
    };
  }

  // Update time context
  const hour = new Date().getHours();
  frame.timeOfDay =
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' :
    hour < 21 ? 'evening' : 'night';
  frame.dayType = [0, 6].includes(new Date().getDay()) ? 'weekend' : 'weekday';

  // Update metadata
  frame.lastUpdated = now;
  frame.expiresAt = new Date(Date.now() + FRAME_TTL * 1000).toISOString();

  // Save frame
  await saveFrame(frame);

  // Determine if this is a significant change worth surfacing memories for
  const significantChange = isNewFrame ||
    changes.includes('people') ||
    changes.includes('location') ||
    changes.includes('calendar');

  // Surface memories if requested and significant change
  let memoriesSurfaced: ContextualMemories | undefined;
  if (options.surfaceMemories !== false && significantChange) {
    memoriesSurfaced = await surfaceMemoriesForFrame(frame);
  }

  return { frame, memoriesSurfaced, significantChange };
}

/**
 * Clear the context frame (e.g., when leaving a location or ending a meeting).
 *
 * Multi-Device: Pass deviceId to clear device-specific context.
 */
export async function clearContextFrame(
  userId: string,
  dimensions?: ('location' | 'people' | 'activity' | 'calendar' | 'mood')[],
  deviceId?: string
): Promise<ContextFrame> {
  let frame = await getContextFrame(userId, deviceId);

  if (!frame) {
    return createEmptyFrame(userId, new Date().toISOString(), deviceId);
  }

  if (!dimensions) {
    // Clear everything but preserve device info
    const preservedDeviceId = frame.deviceId;
    const preservedDeviceType = frame.deviceType;
    frame = createEmptyFrame(userId, new Date().toISOString(), preservedDeviceId, preservedDeviceType);
  } else {
    // Clear specific dimensions
    if (dimensions.includes('location')) frame.location = undefined;
    if (dimensions.includes('people')) frame.people = [];
    if (dimensions.includes('activity')) frame.activity = undefined;
    if (dimensions.includes('calendar')) frame.calendarEvent = undefined;
    if (dimensions.includes('mood')) frame.mood = undefined;

    frame.lastUpdated = new Date().toISOString();
  }

  await saveFrame(frame);
  return frame;
}

/**
 * Add a person to the current frame (e.g., someone joined the conversation).
 *
 * Multi-Device: Pass deviceId to add person to device-specific context.
 */
export async function addPersonToFrame(
  userId: string,
  person: string,
  options: {
    source?: FrameDimension['source'];
    surfaceMemories?: boolean;
    deviceId?: string;
    deviceType?: DeviceType;
  } = {}
): Promise<{
  frame: ContextFrame;
  briefing?: QuickBriefing;
  memories?: SurfacedMemory[];
}> {
  const { deviceId, deviceType } = options;
  const frame = await getContextFrame(userId, deviceId) ||
    createEmptyFrame(userId, new Date().toISOString(), deviceId, deviceType);

  // Check if person already in frame
  if (frame.people.some(p => p.value.toLowerCase() === person.toLowerCase())) {
    return { frame };
  }

  // Add person
  frame.people.push({
    value: person,
    confidence: 1.0,
    source: options.source || 'explicit',
    since: new Date().toISOString(),
  });

  frame.lastUpdated = new Date().toISOString();
  await saveFrame(frame);

  // Get briefing and memories for this person
  let briefing: QuickBriefing | undefined;
  let memories: SurfacedMemory[] | undefined;

  if (options.surfaceMemories !== false) {
    const personData = await getPersonContext(userId, person);
    briefing = personData.briefing;
    memories = personData.memories;
  }

  return { frame, briefing, memories };
}

/**
 * Remove a person from the current frame.
 *
 * Multi-Device: Pass deviceId to remove from device-specific context.
 */
export async function removePersonFromFrame(
  userId: string,
  person: string,
  deviceId?: string
): Promise<ContextFrame> {
  const frame = await getContextFrame(userId, deviceId);
  if (!frame) return createEmptyFrame(userId, new Date().toISOString(), deviceId);

  frame.people = frame.people.filter(
    p => p.value.toLowerCase() !== person.toLowerCase()
  );
  frame.lastUpdated = new Date().toISOString();

  await saveFrame(frame);
  return frame;
}

// ============================================================================
// MEMORY SURFACING
// ============================================================================

/**
 * Surface relevant memories for the current context frame.
 * This is the "magic" - automatically bringing up what matters.
 */
export async function surfaceMemoriesForFrame(
  frame: ContextFrame
): Promise<ContextualMemories> {
  const result: ContextualMemories = {
    aboutPeople: [],
    aboutLocation: [],
    aboutActivity: [],
    recentRelevant: [],
    briefings: new Map(),
    suggestedTopics: [],
    sensitivities: [],
    forFrame: frame.frameId,
    generatedAt: new Date().toISOString(),
  };

  // Process each person in the frame
  for (const personDim of frame.people) {
    const person = personDim.value;
    const personData = await getPersonContext(frame.userId, person);

    result.aboutPeople.push({
      person,
      memories: personData.memories,
      openLoops: personData.loops,
      upcomingEvents: personData.events,
    });

    result.briefings.set(person, personData.briefing);

    // Collect sensitivities
    if (personData.sensitivities) {
      result.sensitivities.push(...personData.sensitivities);
    }
  }

  // Location-based memories
  if (frame.location) {
    result.aboutLocation = await getLocationMemories(frame.userId, frame.location.value);
  }

  // Activity-based memories
  if (frame.activity) {
    result.aboutActivity = await getActivityMemories(frame.userId, frame.activity.value);
  }

  // Recent relevant (combines all factors)
  result.recentRelevant = await getRecentRelevant(frame);

  // Generate suggested topics from all the data
  result.suggestedTopics = generateSuggestedTopics(result);

  return result;
}

/**
 * Get context about a specific person.
 */
async function getPersonContext(
  userId: string,
  person: string
): Promise<{
  memories: SurfacedMemory[];
  loops: LoopSummary[];
  events: EventSummary[];
  briefing: QuickBriefing;
  sensitivities: string[];
}> {
  // Get memories involving this person
  const memoriesRaw = await getMemoriesForPerson(userId, person, { limit: 10 });
  const memories: SurfacedMemory[] = memoriesRaw.map(m => ({
    memoryId: m.memory.memoryId,
    text: m.memory.text?.slice(0, 200) || '',
    relevanceScore: m.retrievalScore,
    salienceScore: m.memory.salienceScore || 0,
    matchedOn: ['person'],
    createdAt: m.memory.createdAt || '',
  }));

  // Get open loops with this person
  const loopsRaw = await getOpenLoops(userId, { contactName: person });
  const loops: LoopSummary[] = loopsRaw.map(l => ({
    id: l._id?.toString() || l.id,
    description: l.description,
    owner: l.owner,
    isOverdue: l.isOverdue,
    dueDate: l.dueDate,
  }));

  // Get upcoming events for this person
  const eventsRaw = await getUpcomingEventsForContact(userId, person, 30);
  const events: EventSummary[] = eventsRaw.map(e => {
    const eventDate = e.eventDate ? new Date(e.eventDate) : null;
    const daysUntil = eventDate
      ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : undefined;

    return {
      description: e.description,
      eventDate: e.eventDate,
      daysUntil,
      goodToMention: e.goodToMention,
    };
  });

  // Quick briefing
  const briefing: QuickBriefing = {
    person,
    youOweThem: loops.filter(l => l.owner === 'self').length,
    theyOweYou: loops.filter(l => l.owner === 'them').length,
    upcomingEvents: events.length,
    topMemory: memories[0]?.text,
  };

  // Sensitivities (from events marked as sensitive)
  const sensitivities = eventsRaw
    .filter(e => e.sensitivity === 'sensitive')
    .map(e => `${person}: ${e.description}`);

  return { memories, loops, events, briefing, sensitivities };
}

/**
 * Get memories related to a location.
 */
async function getLocationMemories(
  userId: string,
  location: string
): Promise<SurfacedMemory[]> {
  // Search for memories mentioning this location
  const memories = await retrieveWithSalience(userId, location, { limit: 5 });

  return memories.map(m => ({
    memoryId: m.memory.memoryId,
    text: m.memory.text?.slice(0, 200) || '',
    relevanceScore: m.retrievalScore,
    salienceScore: m.memory.salienceScore || 0,
    matchedOn: ['location'] as const,
    createdAt: m.memory.createdAt || '',
  }));
}

/**
 * Get memories related to an activity.
 */
async function getActivityMemories(
  userId: string,
  activity: string
): Promise<SurfacedMemory[]> {
  const memories = await retrieveWithSalience(userId, activity, { limit: 5 });

  return memories.map(m => ({
    memoryId: m.memory.memoryId,
    text: m.memory.text?.slice(0, 200) || '',
    relevanceScore: m.retrievalScore,
    salienceScore: m.memory.salienceScore || 0,
    matchedOn: ['activity'] as const,
    createdAt: m.memory.createdAt || '',
  }));
}

/**
 * Get recent relevant memories based on all frame dimensions.
 */
async function getRecentRelevant(frame: ContextFrame): Promise<SurfacedMemory[]> {
  // Build a combined query from frame dimensions
  const queryParts: string[] = [];

  if (frame.location) queryParts.push(frame.location.value);
  if (frame.activity) queryParts.push(frame.activity.value);
  frame.people.forEach(p => queryParts.push(p.value));

  if (queryParts.length === 0) {
    // No specific context, just get recent high-salience
    const memories = await retrieveWithSalience(frame.userId, '', {
      limit: 10,
      minSalience: 50,
    });

    return memories.map(m => ({
      memoryId: m.memory.memoryId,
      text: m.memory.text?.slice(0, 200) || '',
      relevanceScore: m.retrievalScore,
      salienceScore: m.memory.salienceScore || 0,
      matchedOn: ['time'] as const,
      createdAt: m.memory.createdAt || '',
    }));
  }

  const query = queryParts.join(' ');
  const memories = await retrieveWithSalience(frame.userId, query, { limit: 10 });

  return memories.map(m => ({
    memoryId: m.memory.memoryId,
    text: m.memory.text?.slice(0, 200) || '',
    relevanceScore: m.retrievalScore,
    salienceScore: m.memory.salienceScore || 0,
    matchedOn: determineMatchReasons(m, frame),
    createdAt: m.memory.createdAt || '',
  }));
}

/**
 * Determine why a memory matched the current frame.
 */
function determineMatchReasons(
  memory: any,
  frame: ContextFrame
): ('person' | 'location' | 'activity' | 'topic' | 'time')[] {
  const reasons: ('person' | 'location' | 'activity' | 'topic' | 'time')[] = [];
  const text = (memory.memory.text || '').toLowerCase();
  const people = memory.memory.extractedFeatures?.peopleMentioned || [];

  // Check people
  for (const personDim of frame.people) {
    if (people.some((p: string) => p.toLowerCase().includes(personDim.value.toLowerCase())) ||
        text.includes(personDim.value.toLowerCase())) {
      reasons.push('person');
      break;
    }
  }

  // Check location
  if (frame.location && text.includes(frame.location.value.toLowerCase())) {
    reasons.push('location');
  }

  // Check activity
  if (frame.activity && text.includes(frame.activity.value.toLowerCase())) {
    reasons.push('activity');
  }

  // Default to topic match
  if (reasons.length === 0) {
    reasons.push('topic');
  }

  return reasons;
}

/**
 * Generate suggested conversation topics from surfaced data.
 */
function generateSuggestedTopics(data: ContextualMemories): string[] {
  const topics: string[] = [];

  // From open loops
  for (const personData of data.aboutPeople) {
    const overdueLoops = personData.openLoops.filter(l => l.isOverdue);
    if (overdueLoops.length > 0) {
      topics.push(`Follow up on: ${overdueLoops[0].description}`);
    }

    const theirEvents = personData.upcomingEvents.filter(e => e.goodToMention && e.daysUntil && e.daysUntil <= 7);
    if (theirEvents.length > 0) {
      topics.push(`Ask about: ${theirEvents[0].description}`);
    }
  }

  return topics.slice(0, 5); // Top 5 suggestions
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an empty context frame.
 * Now supports device-specific frames.
 */
function createEmptyFrame(
  userId: string,
  now: string,
  deviceId?: string,
  deviceType?: DeviceType
): ContextFrame {
  const hour = new Date().getHours();

  return {
    userId,
    deviceId,
    deviceType,
    people: [],
    timeOfDay:
      hour < 12 ? 'morning' :
      hour < 17 ? 'afternoon' :
      hour < 21 ? 'evening' : 'night',
    dayType: [0, 6].includes(new Date().getDay()) ? 'weekend' : 'weekday',
    frameId: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    expiresAt: new Date(Date.now() + FRAME_TTL * 1000).toISOString(),
    lastUpdated: now,
  };
}

/**
 * Save a context frame to Redis.
 * If the frame has a deviceId, saves to device-specific key and tracks in active devices.
 */
async function saveFrame(frame: ContextFrame): Promise<void> {
  const key = frame.deviceId
    ? `${frame.userId}:${frame.deviceId}`
    : frame.userId;

  if (redisClient) {
    try {
      // Save frame with device-aware key
      await redisClient.setEx(
        FRAME_KEY(frame.userId, frame.deviceId),
        FRAME_TTL,
        JSON.stringify(frame)
      );

      // If device-specific, track in active devices set
      if (frame.deviceId) {
        await redisClient.sAdd(
          ACTIVE_DEVICES_KEY(frame.userId),
          frame.deviceId
        );

        // Register device if we have a registry
        if (frame.deviceType) {
          deviceRegistry.registerDevice(
            frame.userId,
            frame.deviceId,
            frame.deviceType
          );
        }
      }
    } catch (error) {
      console.error('[ContextFrame] Error saving to Redis:', error);
      inMemoryFrames.set(key, frame);
    }
  } else {
    inMemoryFrames.set(key, frame);
  }
}

// ============================================================================
// MCP TOOL HELPERS
// ============================================================================

/**
 * Set context for MCP - simplified interface.
 * Example: "I'm at the park meeting Judy"
 *
 * Multi-Device: Pass deviceId and deviceType to set device-specific context.
 */
export async function setContext(
  userId: string,
  context: {
    location?: string;
    people?: string[];
    activity?: string;
    calendarEvent?: ContextFrame['calendarEvent'];
  },
  deviceOptions?: {
    deviceId?: string;
    deviceType?: DeviceType;
  }
): Promise<ContextualMemories> {
  const { memoriesSurfaced } = await updateContextFrame(userId, context, {
    surfaceMemories: true,
    deviceId: deviceOptions?.deviceId,
    deviceType: deviceOptions?.deviceType,
  });

  return memoriesSurfaced || {
    aboutPeople: [],
    aboutLocation: [],
    aboutActivity: [],
    recentRelevant: [],
    briefings: new Map(),
    suggestedTopics: [],
    sensitivities: [],
    forFrame: '',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get what's relevant right now based on current frame.
 *
 * Multi-Device: Pass deviceId to get device-specific context.
 * Without deviceId, returns user-level context for backwards compatibility.
 */
export async function whatMattersNow(
  userId: string,
  deviceId?: string
): Promise<{
  frame: ContextFrame | null;
  memories: ContextualMemories | null;
}> {
  const frame = await getContextFrame(userId, deviceId);
  if (!frame) {
    return { frame: null, memories: null };
  }

  const memories = await surfaceMemoriesForFrame(frame);
  return { frame, memories };
}

/**
 * Clear context for a specific device or all devices.
 */
export async function clearDeviceContext(
  userId: string,
  deviceId: string
): Promise<void> {
  if (!redisClient) return;

  try {
    await redisClient.del(FRAME_KEY(userId, deviceId));
    await redisClient.sRem(ACTIVE_DEVICES_KEY(userId), deviceId);
  } catch (error) {
    console.error('[ContextFrame] Error clearing device context:', error);
  }
}

/**
 * Get unified context by integrating all device contexts.
 * Uses the brain-inspired fusion approach - mobile for location, merge people, etc.
 */
export async function getUnifiedUserContext(userId: string): Promise<{
  location: string;
  activity: string;
  people: string[];
  primaryDevice: string | null;
  activeDeviceCount: number;
}> {
  const contexts = await getAllDeviceContexts(userId);

  if (contexts.length === 0) {
    return {
      location: 'Unknown',
      activity: 'idle',
      people: [],
      primaryDevice: null,
      activeDeviceCount: 0,
    };
  }

  // Resolve location: mobile devices win (they have GPS)
  const mobileContexts = contexts.filter(c => c.deviceType === 'mobile');
  const locationContext = mobileContexts.length > 0
    ? mobileContexts.reduce((a, b) =>
        new Date(b.lastUpdated) > new Date(a.lastUpdated) ? b : a
      )
    : contexts.reduce((a, b) =>
        new Date(b.lastUpdated) > new Date(a.lastUpdated) ? b : a
      );

  // Resolve activity: most recent wins
  const activityContext = contexts.reduce((a, b) =>
    new Date(b.lastUpdated) > new Date(a.lastUpdated) ? b : a
  );

  // Merge people from all devices
  const allPeople = new Set<string>();
  for (const ctx of contexts) {
    for (const person of ctx.people) {
      allPeople.add(person.value);
    }
  }

  // Find primary device (most recently updated)
  const primaryDevice = contexts.reduce((a, b) =>
    new Date(b.lastUpdated) > new Date(a.lastUpdated) ? b : a
  ).deviceId || null;

  return {
    location: locationContext.location?.value || 'Unknown',
    activity: activityContext.activity?.value || 'idle',
    people: Array.from(allPeople),
    primaryDevice,
    activeDeviceCount: contexts.length,
  };
}
