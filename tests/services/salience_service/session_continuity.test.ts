/**
 * @file Tests for Session Continuity Service
 * Tests seamless cross-device context transfer - "AI that knows you like a friend"
 */

import {
  updateDeviceSession,
  getDeviceSession,
  getCrossDeviceState,
  initiateHandoff,
  claimHandoff,
  getSessionContinuity,
  initSessionContinuity,
} from '../../../src/services/salience_service/session_continuity';

import type {
  DeviceSession,
  HandoffRequest,
  HandoffResult,
  CrossDeviceState,
} from '../../../src/services/salience_service/session_continuity';

describe('Session Continuity Service', () => {
  describe('updateDeviceSession', () => {
    it('should create a new session for a device', async () => {
      const session = await updateDeviceSession('user1', 'phone_001', 'mobile', {
        context: {
          location: 'Coffee Shop',
          activity: 'meeting',
          people: ['Judy', 'Bob'],
        },
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe('user1');
      expect(session.deviceId).toBe('phone_001');
      expect(session.deviceType).toBe('mobile');
      expect(session.context.location).toBe('Coffee Shop');
      expect(session.context.people).toEqual(['Judy', 'Bob']);
      expect(session.sessionId).toMatch(/^session_/);
    });

    it('should update an existing session', async () => {
      await updateDeviceSession('user1', 'laptop_001', 'desktop', {
        context: { activity: 'coding' },
      });

      const updated = await updateDeviceSession('user1', 'laptop_001', 'desktop', {
        context: { location: 'Home Office' },
        conversationTopics: ['MemoRable', 'cross-device context'],
      });

      expect(updated.context.activity).toBe('coding');
      expect(updated.context.location).toBe('Home Office');
      expect(updated.conversationTopics).toContain('MemoRable');
      expect(updated.conversationTopics).toContain('cross-device context');
    });

    it('should merge conversation topics without duplicates', async () => {
      await updateDeviceSession('user1', 'device_dedup', 'mcp', {
        conversationTopics: ['topic A', 'topic B'],
      });

      const session = await updateDeviceSession('user1', 'device_dedup', 'mcp', {
        conversationTopics: ['topic B', 'topic C'],
      });

      expect(session.conversationTopics).toContain('topic A');
      expect(session.conversationTopics).toContain('topic B');
      expect(session.conversationTopics).toContain('topic C');
      // No duplicates
      expect(session.conversationTopics.filter(t => t === 'topic B')).toHaveLength(1);
    });

    it('should merge active memory IDs', async () => {
      await updateDeviceSession('user1', 'device_mem', 'mcp', {
        activeMemoryIds: ['mem_1', 'mem_2'],
      });

      const session = await updateDeviceSession('user1', 'device_mem', 'mcp', {
        activeMemoryIds: ['mem_2', 'mem_3'],
      });

      expect(session.activeMemoryIds).toContain('mem_1');
      expect(session.activeMemoryIds).toContain('mem_2');
      expect(session.activeMemoryIds).toContain('mem_3');
    });

    it('should limit topics to 20 entries', async () => {
      const manyTopics = Array.from({ length: 25 }, (_, i) => `topic_${i}`);

      const session = await updateDeviceSession('user1', 'device_limit', 'mcp', {
        conversationTopics: manyTopics,
      });

      expect(session.conversationTopics.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getDeviceSession', () => {
    it('should return null for non-existent session', async () => {
      const session = await getDeviceSession('nonexistent_user', 'nonexistent_device');
      expect(session).toBeNull();
    });

    it('should retrieve a previously stored session', async () => {
      await updateDeviceSession('user2', 'watch_001', 'wearable', {
        context: { activity: 'walking' },
      });

      const session = await getDeviceSession('user2', 'watch_001');
      expect(session).toBeDefined();
      expect(session!.deviceType).toBe('wearable');
      expect(session!.context.activity).toBe('walking');
    });
  });

  describe('getCrossDeviceState', () => {
    it('should return empty state for user with no sessions', async () => {
      const state = await getCrossDeviceState('empty_user');

      expect(state.userId).toBe('empty_user');
      expect(state.activeSessions).toHaveLength(0);
      expect(state.allTopics).toHaveLength(0);
      expect(state.allActiveMemoryIds).toHaveLength(0);
    });

    it('should aggregate state across multiple devices', async () => {
      // Phone session
      await updateDeviceSession('user3', 'phone_003', 'mobile', {
        context: { location: 'Office', people: ['Alice'] },
        conversationTopics: ['project update'],
        activeMemoryIds: ['mem_a'],
        activeLoopIds: ['loop_1'],
      });

      // Laptop session
      await updateDeviceSession('user3', 'laptop_003', 'desktop', {
        context: { activity: 'coding' },
        conversationTopics: ['code review'],
        activeMemoryIds: ['mem_b'],
        activeLoopIds: ['loop_2'],
      });

      const state = await getCrossDeviceState('user3');

      expect(state.activeSessions.length).toBeGreaterThanOrEqual(2);
      expect(state.allTopics).toContain('project update');
      expect(state.allTopics).toContain('code review');
      expect(state.allActiveMemoryIds).toContain('mem_a');
      expect(state.allActiveMemoryIds).toContain('mem_b');
      expect(state.allActiveLoopIds).toContain('loop_1');
      expect(state.allActiveLoopIds).toContain('loop_2');
    });
  });

  describe('initiateHandoff', () => {
    it('should create a handoff with known target', async () => {
      await updateDeviceSession('user4', 'source_dev', 'mobile', {
        context: { location: 'Park', people: ['Judy'] },
        conversationTopics: ['walk', 'weather'],
        activeMemoryIds: ['mem_x'],
      });

      const result = await initiateHandoff({
        userId: 'user4',
        sourceDeviceId: 'source_dev',
        targetDeviceId: 'target_dev',
        targetDeviceType: 'desktop',
        reason: 'user_initiated',
        transferContext: true,
        transferTopics: true,
      });

      expect(result.success).toBe(true);
      expect(result.handoffId).toMatch(/^handoff_/);
      expect(result.sourceDevice.deviceId).toBe('source_dev');
      expect(result.targetDevice!.deviceId).toBe('target_dev');
      expect(result.transferredContext.location).toBe('Park');
      expect(result.transferredContext.people).toContain('Judy');
      expect(result.transferredContext.conversationTopics).toContain('walk');
      expect(result.continuityBriefing).toBeTruthy();
      expect(result.continuityBriefing).toContain('mobile');
    });

    it('should create a pending handoff without target', async () => {
      await updateDeviceSession('user5', 'leaving_phone', 'mobile', {
        context: { activity: 'browsing' },
      });

      const result = await initiateHandoff({
        userId: 'user5',
        sourceDeviceId: 'leaving_phone',
        reason: 'device_switch',
        transferContext: true,
        transferTopics: true,
      });

      expect(result.success).toBe(true);
      expect(result.targetDevice).toBeUndefined();
      expect(result.continuityBriefing).toBeTruthy();
    });

    it('should generate meaningful continuity briefing', async () => {
      await updateDeviceSession('user6', 'src_dev', 'smartglasses', {
        context: { location: 'Kitchen', activity: 'cooking', people: ['Mom'] },
        conversationTopics: ['recipe', 'dinner plans'],
        activeLoopIds: ['loop_cook'],
        sessionSummary: 'Helping mom with dinner recipe',
      });

      const result = await initiateHandoff({
        userId: 'user6',
        sourceDeviceId: 'src_dev',
        targetDeviceId: 'dst_dev',
        targetDeviceType: 'mobile',
        reason: 'user_initiated',
        transferContext: true,
        transferTopics: true,
      });

      expect(result.continuityBriefing).toContain('Kitchen');
      expect(result.continuityBriefing).toContain('cooking');
      expect(result.continuityBriefing).toContain('Mom');
      expect(result.continuityBriefing).toContain('smartglasses');
    });

    it('should transfer context to target device session', async () => {
      await updateDeviceSession('user7', 'from_dev', 'mobile', {
        context: { location: 'Gym', activity: 'exercising' },
        conversationTopics: ['workout plan'],
        activeMemoryIds: ['mem_gym'],
      });

      await initiateHandoff({
        userId: 'user7',
        sourceDeviceId: 'from_dev',
        targetDeviceId: 'to_dev',
        targetDeviceType: 'wearable',
        reason: 'user_initiated',
        transferContext: true,
        transferTopics: true,
      });

      // Check that target device got the context
      const targetSession = await getDeviceSession('user7', 'to_dev');
      expect(targetSession).toBeDefined();
      expect(targetSession!.context.location).toBe('Gym');
      expect(targetSession!.context.activity).toBe('exercising');
      expect(targetSession!.conversationTopics).toContain('workout plan');
    });
  });

  describe('claimHandoff', () => {
    it('should return null when no pending handoff', async () => {
      const result = await claimHandoff('no_handoff_user', 'some_device', 'mobile');
      expect(result).toBeNull();
    });
  });

  describe('getSessionContinuity', () => {
    it('should return full continuity data for a device', async () => {
      // Set up sessions on multiple devices
      await updateDeviceSession('user8', 'phone_008', 'mobile', {
        context: { location: 'Home' },
        conversationTopics: ['dinner'],
      });

      await updateDeviceSession('user8', 'laptop_008', 'desktop', {
        context: { activity: 'working' },
        conversationTopics: ['project'],
      });

      const continuity = await getSessionContinuity('user8', 'laptop_008', 'desktop');

      expect(continuity.thisDevice).toBeDefined();
      expect(continuity.thisDevice!.deviceId).toBe('laptop_008');
      expect(continuity.otherDevices.length).toBeGreaterThanOrEqual(1);
      expect(continuity.crossDeviceState.allTopics).toContain('dinner');
      expect(continuity.crossDeviceState.allTopics).toContain('project');
      expect(continuity.continuityBriefing).toBeTruthy();
    });

    it('should generate briefing showing other devices', async () => {
      await updateDeviceSession('user9', 'phone_009', 'mobile', {
        context: { location: 'Office', activity: 'meeting' },
        conversationTopics: ['Q4 planning'],
      });

      const continuity = await getSessionContinuity('user9', 'new_laptop', 'desktop');

      // The briefing should mention what's happening on other devices
      expect(continuity.continuityBriefing).toBeTruthy();
      expect(continuity.otherDevices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('end-to-end: seamless device switching', () => {
    it('should maintain context when switching phone → laptop', async () => {
      const userId = 'alan';

      // Step 1: Alan sets context on phone
      await updateDeviceSession(userId, 'alans_iphone', 'mobile', {
        context: {
          location: 'Park',
          activity: 'walking',
          people: ['Betty'],
        },
        conversationTopics: ['Alzheimer\'s research', 'AR glasses prototype'],
        activeMemoryIds: ['mem_betty_1', 'mem_park_1'],
        activeLoopIds: ['loop_glasses_delivery'],
      });

      // Step 2: Alan initiates handoff to laptop
      const handoff = await initiateHandoff({
        userId,
        sourceDeviceId: 'alans_iphone',
        targetDeviceId: 'alans_macbook',
        targetDeviceType: 'desktop',
        reason: 'user_initiated',
        transferContext: true,
        transferTopics: true,
      });

      expect(handoff.success).toBe(true);
      expect(handoff.transferredContext.location).toBe('Park');
      expect(handoff.transferredContext.people).toContain('Betty');

      // Step 3: Laptop session should have the context
      const laptopSession = await getDeviceSession(userId, 'alans_macbook');
      expect(laptopSession).toBeDefined();
      expect(laptopSession!.context.location).toBe('Park');
      expect(laptopSession!.context.people).toContain('Betty');
      expect(laptopSession!.conversationTopics).toContain('Alzheimer\'s research');

      // Step 4: Cross-device state shows both devices
      const state = await getCrossDeviceState(userId);
      expect(state.activeSessions.length).toBeGreaterThanOrEqual(2);
      expect(state.allTopics).toContain('Alzheimer\'s research');
      expect(state.allTopics).toContain('AR glasses prototype');
      expect(state.allActiveLoopIds).toContain('loop_glasses_delivery');
    });

    it('should work with pending handoff (unknown target)', async () => {
      const userId = 'alan_pending';

      // Step 1: Phone session with context
      await updateDeviceSession(userId, 'phone_p', 'mobile', {
        context: { location: 'Car', activity: 'driving' },
        conversationTopics: ['navigation', 'music'],
      });

      // Step 2: Initiate handoff without knowing target
      await initiateHandoff({
        userId,
        sourceDeviceId: 'phone_p',
        reason: 'device_switch',
        transferContext: true,
        transferTopics: true,
      });

      // Step 3: New device connects and gets continuity
      const continuity = await getSessionContinuity(userId, 'home_speaker', 'smarthome');

      // Should have received the context from the phone
      expect(continuity.continuityBriefing).toBeTruthy();
    });
  });
});
