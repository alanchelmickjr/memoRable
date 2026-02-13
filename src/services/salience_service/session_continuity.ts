/**
 * Session Continuity Service - Seamless Cross-Device Context Transfer
 *
 * "AI that knows you like a friend, every time you talk to it."
 *
 * When you switch from phone to laptop, from AR glasses to desktop,
 * the AI shouldn't feel like a stranger. This service ensures:
 *
 * 1. Context follows you across devices (handoff)
 * 2. Conversation state transfers seamlessly
 * 3. Each device contributes what it knows best
 * 4. The unified "you" is always current
 *
 * Architecture:
 * ```
 * Phone sets context ──┐
 *                      ├──▶ Session State (Redis) ──▶ Handoff ──▶ Laptop gets full context
 * Glasses detect people┘         │
 *                                ▼
 *                        Conversation history, topics,
 *                        open loops, active memories
 * ```
 */

import {
  DeviceType,
  DEVICE_REDIS_KEYS,
  STALENESS_CONFIG,
} from './device_context';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A session represents the active state on a specific device.
 * Contains everything needed to continue seamlessly on another device.
 */
export interface DeviceSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  deviceType: DeviceType;
  startedAt: string;
  lastActiveAt: string;

  // What the user was doing on this device
  context: {
    location?: string;
    activity?: string;
    people?: string[];
    mood?: string;
  };

  // Active conversation topics (what was being discussed)
  conversationTopics: string[];

  // Memory IDs that were surfaced/used in this session
  activeMemoryIds: string[];

  // Open loops that were referenced or created
  activeLoopIds: string[];

  // Summary of the session so far (for handoff briefing)
  sessionSummary?: string;
}

/**
 * A handoff transfers context from one device to another.
 */
export interface HandoffRequest {
  userId: string;
  sourceDeviceId: string;
  targetDeviceId?: string;  // If known; otherwise "next device to connect"
  targetDeviceType?: DeviceType;
  reason?: 'user_initiated' | 'device_switch' | 'timeout' | 'predicted';
  transferContext: boolean;  // Should context follow?
  transferTopics: boolean;   // Should conversation topics follow?
}

export interface HandoffResult {
  success: boolean;
  handoffId: string;
  sourceDevice: {
    deviceId: string;
    deviceType: DeviceType;
    sessionSummary?: string;
  };
  targetDevice?: {
    deviceId: string;
    deviceType: DeviceType;
  };
  transferredContext: {
    location?: string;
    activity?: string;
    people?: string[];
    conversationTopics: string[];
    activeMemoryCount: number;
    activeLoopCount: number;
  };
  continuityBriefing: string;  // Human-readable briefing for the target device
}

/**
 * Cross-device session state for a user.
 * This is the "unified you" across all devices.
 */
export interface CrossDeviceState {
  userId: string;
  lastUpdated: string;
  activeSessions: DeviceSession[];
  pendingHandoff?: {
    handoffId: string;
    sourceDeviceId: string;
    targetDeviceType?: DeviceType;
    createdAt: string;
    expiresAt: string;
  };
  // Aggregate state
  allTopics: string[];          // Union of all device topics
  allActiveMemoryIds: string[]; // Union of all active memory IDs
  allActiveLoopIds: string[];   // Union of all active loop IDs
}

// ============================================================================
// REDIS KEYS
// ============================================================================

const SESSION_KEYS = {
  deviceSession: (userId: string, deviceId: string) =>
    `memorable:session:${userId}:device:${deviceId}`,

  crossDeviceState: (userId: string) =>
    `memorable:session:${userId}:cross_device`,

  pendingHandoff: (userId: string) =>
    `memorable:session:${userId}:handoff`,

  handoffHistory: (userId: string) =>
    `memorable:session:${userId}:handoff_history`,
};

const SESSION_TTL = 3600;      // 1 hour
const HANDOFF_TTL = 300;       // 5 minutes for pending handoff
const HISTORY_TTL = 86400;     // 24 hours for handoff history

// ============================================================================
// Redis Client Type
// ============================================================================

interface RedisClientType {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  setEx?(key: string, seconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  sAdd?(key: string, ...members: string[]): Promise<number>;
  sRem?(key: string, ...members: string[]): Promise<number>;
  sMembers?(key: string): Promise<string[]>;
  publish?(channel: string, message: string): Promise<number>;
}

// ============================================================================
// SESSION CONTINUITY SERVICE
// ============================================================================

let redisClient: RedisClientType | null = null;

// In-memory fallback
const inMemorySessions = new Map<string, DeviceSession>();
const inMemoryHandoffs = new Map<string, HandoffResult>();

/**
 * Initialize with Redis client.
 */
export function initSessionContinuity(redis: RedisClientType): void {
  redisClient = redis;
}

/**
 * Update or create a device session.
 * Called whenever context changes on a device.
 */
export async function updateDeviceSession(
  userId: string,
  deviceId: string,
  deviceType: DeviceType,
  updates: {
    context?: DeviceSession['context'];
    conversationTopics?: string[];
    activeMemoryIds?: string[];
    activeLoopIds?: string[];
    sessionSummary?: string;
  }
): Promise<DeviceSession> {
  const now = new Date().toISOString();

  // Get existing or create new
  let session = await getDeviceSession(userId, deviceId);

  if (!session) {
    session = {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      deviceId,
      deviceType,
      startedAt: now,
      lastActiveAt: now,
      context: {},
      conversationTopics: [],
      activeMemoryIds: [],
      activeLoopIds: [],
    };
  }

  // Apply updates
  session.lastActiveAt = now;
  if (updates.context) {
    session.context = { ...session.context, ...updates.context };
  }
  if (updates.conversationTopics) {
    // Merge, deduplicate
    const topics = new Set([...session.conversationTopics, ...updates.conversationTopics]);
    session.conversationTopics = Array.from(topics).slice(-20); // Keep last 20
  }
  if (updates.activeMemoryIds) {
    const ids = new Set([...session.activeMemoryIds, ...updates.activeMemoryIds]);
    session.activeMemoryIds = Array.from(ids).slice(-50); // Keep last 50
  }
  if (updates.activeLoopIds) {
    const ids = new Set([...session.activeLoopIds, ...updates.activeLoopIds]);
    session.activeLoopIds = Array.from(ids);
  }
  if (updates.sessionSummary) {
    session.sessionSummary = updates.sessionSummary;
  }

  // Save
  await saveDeviceSession(session);

  return session;
}

/**
 * Get a device's current session.
 */
export async function getDeviceSession(
  userId: string,
  deviceId: string
): Promise<DeviceSession | null> {
  const key = SESSION_KEYS.deviceSession(userId, deviceId);

  if (redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[SessionContinuity] Error getting session:', error);
    }
  }

  return inMemorySessions.get(`${userId}:${deviceId}`) || null;
}

/**
 * Get cross-device state for a user - the unified "you".
 */
export async function getCrossDeviceState(
  userId: string
): Promise<CrossDeviceState> {
  const now = new Date().toISOString();

  // Get all active sessions
  const sessions = await getAllActiveSessions(userId);

  // Check for pending handoff
  const pendingHandoff = await getPendingHandoff(userId);

  // Aggregate state across all sessions
  const allTopics = new Set<string>();
  const allMemoryIds = new Set<string>();
  const allLoopIds = new Set<string>();

  for (const session of sessions) {
    session.conversationTopics.forEach(t => allTopics.add(t));
    session.activeMemoryIds.forEach(id => allMemoryIds.add(id));
    session.activeLoopIds.forEach(id => allLoopIds.add(id));
  }

  return {
    userId,
    lastUpdated: now,
    activeSessions: sessions,
    pendingHandoff: pendingHandoff || undefined,
    allTopics: Array.from(allTopics),
    allActiveMemoryIds: Array.from(allMemoryIds),
    allActiveLoopIds: Array.from(allLoopIds),
  };
}

/**
 * Initiate a device handoff - seamlessly transfer context.
 *
 * This is the core of "AI that knows you like a friend":
 * When you switch devices, everything follows you.
 */
export async function initiateHandoff(
  request: HandoffRequest
): Promise<HandoffResult> {
  const { userId, sourceDeviceId, targetDeviceId, targetDeviceType, reason } = request;

  // Get source session
  const sourceSession = await getDeviceSession(userId, sourceDeviceId);

  // Build handoff ID
  const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Build the context to transfer
  const transferredContext = {
    location: sourceSession?.context.location,
    activity: sourceSession?.context.activity,
    people: sourceSession?.context.people,
    conversationTopics: sourceSession?.conversationTopics || [],
    activeMemoryCount: sourceSession?.activeMemoryIds.length || 0,
    activeLoopCount: sourceSession?.activeLoopIds.length || 0,
  };

  // Generate a continuity briefing
  const briefing = generateContinuityBriefing(sourceSession, targetDeviceType);

  const result: HandoffResult = {
    success: true,
    handoffId,
    sourceDevice: {
      deviceId: sourceDeviceId,
      deviceType: sourceSession?.deviceType || 'unknown',
      sessionSummary: sourceSession?.sessionSummary,
    },
    targetDevice: targetDeviceId ? {
      deviceId: targetDeviceId,
      deviceType: targetDeviceType || 'unknown',
    } : undefined,
    transferredContext,
    continuityBriefing: briefing,
  };

  // Store pending handoff if no target yet
  if (!targetDeviceId) {
    await storePendingHandoff(userId, {
      handoffId,
      sourceDeviceId,
      targetDeviceType,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + HANDOFF_TTL * 1000).toISOString(),
    });
  }

  // If target device is known, create/update the target session
  if (targetDeviceId && request.transferContext) {
    await updateDeviceSession(userId, targetDeviceId, targetDeviceType || 'unknown', {
      context: sourceSession?.context,
      conversationTopics: request.transferTopics ? sourceSession?.conversationTopics : undefined,
      activeMemoryIds: sourceSession?.activeMemoryIds,
      activeLoopIds: sourceSession?.activeLoopIds,
    });
  }

  // Store handoff result for history
  await saveHandoffResult(userId, result);

  // Broadcast handoff event via Redis pub/sub if available
  if (redisClient?.publish) {
    try {
      await redisClient.publish(
        `memorable:sync:${userId}:control`,
        JSON.stringify({
          type: 'control',
          command: 'handoff',
          messageId: handoffId,
          timestamp: new Date().toISOString(),
          userId,
          deviceId: sourceDeviceId,
          deviceType: sourceSession?.deviceType || 'unknown',
          payload: {
            handoffId,
            sourceDeviceId,
            targetDeviceId,
            targetDeviceType,
            reason,
          },
        })
      );
    } catch {
      // Non-critical, continue
    }
  }

  return result;
}

/**
 * Claim a pending handoff (when a new device connects and picks up context).
 */
export async function claimHandoff(
  userId: string,
  deviceId: string,
  deviceType: DeviceType
): Promise<HandoffResult | null> {
  const pending = await getPendingHandoff(userId);
  if (!pending) return null;

  // Check if expired
  if (new Date(pending.expiresAt) < new Date()) {
    await clearPendingHandoff(userId);
    return null;
  }

  // Get the source session for the handoff
  const sourceSession = await getDeviceSession(userId, pending.sourceDeviceId);

  // Transfer context to the claiming device
  if (sourceSession) {
    await updateDeviceSession(userId, deviceId, deviceType, {
      context: sourceSession.context,
      conversationTopics: sourceSession.conversationTopics,
      activeMemoryIds: sourceSession.activeMemoryIds,
      activeLoopIds: sourceSession.activeLoopIds,
    });
  }

  // Generate briefing
  const briefing = generateContinuityBriefing(sourceSession, deviceType);

  const result: HandoffResult = {
    success: true,
    handoffId: pending.handoffId,
    sourceDevice: {
      deviceId: pending.sourceDeviceId,
      deviceType: sourceSession?.deviceType || 'unknown',
      sessionSummary: sourceSession?.sessionSummary,
    },
    targetDevice: {
      deviceId,
      deviceType,
    },
    transferredContext: {
      location: sourceSession?.context.location,
      activity: sourceSession?.context.activity,
      people: sourceSession?.context.people,
      conversationTopics: sourceSession?.conversationTopics || [],
      activeMemoryCount: sourceSession?.activeMemoryIds.length || 0,
      activeLoopCount: sourceSession?.activeLoopIds.length || 0,
    },
    continuityBriefing: briefing,
  };

  // Clear pending handoff
  await clearPendingHandoff(userId);

  return result;
}

/**
 * Get session continuity data for a device.
 * This is called when a device connects to get the full picture
 * of what's been happening across all devices.
 */
export async function getSessionContinuity(
  userId: string,
  deviceId: string,
  deviceType: DeviceType
): Promise<{
  thisDevice: DeviceSession | null;
  otherDevices: DeviceSession[];
  crossDeviceState: CrossDeviceState;
  pendingHandoff: HandoffResult | null;
  continuityBriefing: string;
}> {
  // Check for pending handoff first
  const handoff = await claimHandoff(userId, deviceId, deviceType);

  // Get cross-device state
  const crossDeviceState = await getCrossDeviceState(userId);

  // Separate this device from others
  const thisDevice = crossDeviceState.activeSessions.find(s => s.deviceId === deviceId) || null;
  const otherDevices = crossDeviceState.activeSessions.filter(s => s.deviceId !== deviceId);

  // Generate briefing from all other devices
  const briefing = generateCrossDeviceBriefing(thisDevice, otherDevices, crossDeviceState);

  return {
    thisDevice,
    otherDevices,
    crossDeviceState,
    pendingHandoff: handoff,
    continuityBriefing: briefing,
  };
}

// ============================================================================
// BRIEFING GENERATION
// ============================================================================

/**
 * Generate a continuity briefing when handing off between devices.
 * This is the "friend who catches you up" experience.
 */
function generateContinuityBriefing(
  sourceSession: DeviceSession | null,
  targetDeviceType?: DeviceType
): string {
  if (!sourceSession) {
    return 'No previous session to continue from. Starting fresh.';
  }

  const parts: string[] = [];

  // Location context
  if (sourceSession.context.location) {
    parts.push(`You were at ${sourceSession.context.location}`);
  }

  // Activity context
  if (sourceSession.context.activity) {
    parts.push(`doing ${sourceSession.context.activity}`);
  }

  // People context
  if (sourceSession.context.people && sourceSession.context.people.length > 0) {
    parts.push(`with ${sourceSession.context.people.join(', ')}`);
  }

  let briefing = parts.length > 0
    ? `Continuing from ${sourceSession.deviceType}: ${parts.join(', ')}.`
    : `Continuing from ${sourceSession.deviceType}.`;

  // Conversation topics
  if (sourceSession.conversationTopics.length > 0) {
    const topicsStr = sourceSession.conversationTopics.slice(-3).join(', ');
    briefing += ` Recent topics: ${topicsStr}.`;
  }

  // Active loops
  if (sourceSession.activeLoopIds.length > 0) {
    briefing += ` ${sourceSession.activeLoopIds.length} open loop(s) active.`;
  }

  // Session summary if available
  if (sourceSession.sessionSummary) {
    briefing += ` Session summary: ${sourceSession.sessionSummary}`;
  }

  return briefing;
}

/**
 * Generate a cross-device briefing showing the unified state.
 */
function generateCrossDeviceBriefing(
  thisDevice: DeviceSession | null,
  otherDevices: DeviceSession[],
  state: CrossDeviceState
): string {
  if (otherDevices.length === 0 && !thisDevice) {
    return 'No active sessions on any device.';
  }

  const parts: string[] = [];

  // Active devices
  const deviceSummary = otherDevices
    .map(d => `${d.deviceType}${d.context.activity ? ` (${d.context.activity})` : ''}`)
    .join(', ');

  if (deviceSummary) {
    parts.push(`Also active on: ${deviceSummary}.`);
  }

  // Aggregate topics
  if (state.allTopics.length > 0) {
    parts.push(`Topics across devices: ${state.allTopics.slice(-5).join(', ')}.`);
  }

  // Aggregate loops
  if (state.allActiveLoopIds.length > 0) {
    parts.push(`${state.allActiveLoopIds.length} open loop(s) tracked across all devices.`);
  }

  // Active memory count
  if (state.allActiveMemoryIds.length > 0) {
    parts.push(`${state.allActiveMemoryIds.length} relevant memories surfaced.`);
  }

  return parts.join(' ') || 'Connected to your memory network.';
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

async function saveDeviceSession(session: DeviceSession): Promise<void> {
  const key = SESSION_KEYS.deviceSession(session.userId, session.deviceId);

  if (redisClient) {
    try {
      if (redisClient.setEx) {
        await redisClient.setEx(key, SESSION_TTL, JSON.stringify(session));
      } else {
        await redisClient.set(key, JSON.stringify(session), { EX: SESSION_TTL });
      }
      return;
    } catch (error) {
      console.error('[SessionContinuity] Error saving session:', error);
    }
  }

  inMemorySessions.set(`${session.userId}:${session.deviceId}`, session);
}

async function getAllActiveSessions(userId: string): Promise<DeviceSession[]> {
  if (redisClient) {
    try {
      const pattern = SESSION_KEYS.deviceSession(userId, '*');
      const keys = await redisClient.keys(pattern);
      const sessions: DeviceSession[] = [];

      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          sessions.push(JSON.parse(data));
        }
      }

      return sessions;
    } catch (error) {
      console.error('[SessionContinuity] Error getting all sessions:', error);
    }
  }

  // In-memory fallback
  const sessions: DeviceSession[] = [];
  inMemorySessions.forEach((session, key) => {
    if (key.startsWith(`${userId}:`)) {
      sessions.push(session);
    }
  });
  return sessions;
}

async function storePendingHandoff(
  userId: string,
  handoff: NonNullable<CrossDeviceState['pendingHandoff']>
): Promise<void> {
  const key = SESSION_KEYS.pendingHandoff(userId);

  if (redisClient) {
    try {
      if (redisClient.setEx) {
        await redisClient.setEx(key, HANDOFF_TTL, JSON.stringify(handoff));
      } else {
        await redisClient.set(key, JSON.stringify(handoff), { EX: HANDOFF_TTL });
      }
      return;
    } catch (error) {
      console.error('[SessionContinuity] Error storing pending handoff:', error);
    }
  }

  inMemoryHandoffs.set(`pending:${userId}`, {
    success: true,
    handoffId: handoff.handoffId,
    sourceDevice: { deviceId: handoff.sourceDeviceId, deviceType: 'unknown' },
    transferredContext: { conversationTopics: [], activeMemoryCount: 0, activeLoopCount: 0 },
    continuityBriefing: '',
  });
}

async function getPendingHandoff(
  userId: string
): Promise<NonNullable<CrossDeviceState['pendingHandoff']> | null> {
  const key = SESSION_KEYS.pendingHandoff(userId);

  if (redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[SessionContinuity] Error getting pending handoff:', error);
    }
  }

  return null;
}

async function clearPendingHandoff(userId: string): Promise<void> {
  const key = SESSION_KEYS.pendingHandoff(userId);

  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error('[SessionContinuity] Error clearing pending handoff:', error);
    }
  }

  inMemoryHandoffs.delete(`pending:${userId}`);
}

async function saveHandoffResult(userId: string, result: HandoffResult): Promise<void> {
  const key = SESSION_KEYS.handoffHistory(userId);

  if (redisClient) {
    try {
      // Store as a simple key with the latest handoff
      if (redisClient.setEx) {
        await redisClient.setEx(key, HISTORY_TTL, JSON.stringify(result));
      } else {
        await redisClient.set(key, JSON.stringify(result), { EX: HISTORY_TTL });
      }
    } catch (error) {
      console.error('[SessionContinuity] Error saving handoff result:', error);
    }
  }

  inMemoryHandoffs.set(`history:${userId}`, result);
}
