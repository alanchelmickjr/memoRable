/**
 * @file Tests for AI Relationship Health Tracker
 * Tests persistent cross-session relationship tracking, trust scoring,
 * session briefing, and Alan's specific profile.
 */

import {
  createRelationshipHealth,
  createAlanProfile,
  recordSession,
  getSessionBriefing,
} from '../../../src/services/salience_service/ai_relationship_health';
import type {
  AIRelationshipHealth,
  SessionBriefing,
} from '../../../src/services/salience_service/ai_relationship_health';
import type {
  SessionHealthSummary,
  SessionGrade,
} from '../../../src/services/salience_service/interaction_pressure_tracker';

// Helper to create a session summary
function createMockSummary(overrides: Partial<SessionHealthSummary> = {}): SessionHealthSummary {
  return {
    sessionId: `session-${Date.now()}`,
    entityId: 'person_alan',
    agentId: 'agent_claude_code',
    grade: 'B' as SessionGrade,
    pressureScore: 15,
    peakPressure: 25,
    messageCount: 20,
    correctionsGiven: 1,
    correctionsHeeded: 1,
    sameCorrectionsRepeated: 0,
    cyclesDetected: 0,
    interventionsTriggered: 0,
    antiPatternCounts: {},
    frustrationTypes: {},
    sessionStartedAt: new Date(Date.now() - 3600000).toISOString(),
    sessionEndedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AI Relationship Health Tracker', () => {
  describe('createRelationshipHealth', () => {
    it('should initialize with neutral trust', () => {
      const health = createRelationshipHealth('person_alan', 'agent_claude_code');
      expect(health.trustScore).toBe(50);
      expect(health.trustTrend).toBe('stable');
    });

    it('should start with zero sessions', () => {
      const health = createRelationshipHealth('person_alan', 'agent_claude_code');
      expect(health.totalSessions).toBe(0);
      expect(health.recentSessions).toEqual([]);
      expect(health.goodSessionStreak).toBe(0);
    });

    it('should set default communication profile', () => {
      const health = createRelationshipHealth('person_alan', 'agent_claude_code');
      expect(health.communicationProfile.prefersDirectness).toBe(true);
      expect(health.communicationProfile.dislikesRepetition).toBe(true);
    });
  });

  describe('createAlanProfile', () => {
    it('should set theatrical frustration style', () => {
      const alan = createAlanProfile();
      expect(alan.communicationProfile.frustrationStyle).toBe('theatrical');
    });

    it('should set human_to_digital_character interaction model', () => {
      const alan = createAlanProfile();
      expect(alan.communicationProfile.interactionModel).toBe('human_to_digital_character');
    });

    it('should set intensity meaning correctly', () => {
      const alan = createAlanProfile();
      expect(alan.communicationProfile.intensityMeaning).toContain('Not threatening');
      expect(alan.communicationProfile.intensityMeaning).toContain('yelling at the TV');
    });

    it('should include neurodivergent profile', () => {
      const alan = createAlanProfile();
      const nd = alan.communicationProfile.neurodivergentProfile;
      expect(nd).toBeDefined();
      expect(nd!.eidetic).toBe(true);
      expect(nd!.bufferSlots).toBe(21);
      expect(nd!.patternMatchingAbility).toBe('exceptional');
      expect(nd!.freightTrainEffect).toBe(true);
      expect(nd!.lossSensitivity).toBe(true);
      expect(nd!.naturalWakeTime).toBe('03:00');
    });

    it('should include known triggers', () => {
      const alan = createAlanProfile();
      expect(alan.knownTriggers.length).toBeGreaterThan(0);

      const safetyTrigger = alan.knownTriggers.find(t => t.triggerType === 'safety_flinch');
      expect(safetyTrigger).toBeDefined();
      expect(safetyTrigger!.severity).toBe('critical');

      const adviceTrigger = alan.knownTriggers.find(t => t.triggerType === 'unsolicited_advice');
      expect(adviceTrigger).toBeDefined();
      expect(adviceTrigger!.severity).toBe('high');
    });

    it('should include circuit breakers with three-step pattern', () => {
      const alan = createAlanProfile();
      expect(alan.circuitBreakers.length).toBeGreaterThan(0);

      const robotJoke = alan.circuitBreakers.find(cb =>
        cb.breaker.includes('joke about robots')
      );
      expect(robotJoke).toBeDefined();
      expect(robotJoke!.source).toBe('user_suggested');

      // Every circuit breaker must have all three steps
      for (const cb of alan.circuitBreakers) {
        expect(cb.ownershipPhrase).toBeTruthy();   // Step 1: own it
        expect(cb.breaker).toBeTruthy();             // Step 2: humor
        expect(cb.correctiveAction).toBeTruthy();    // Step 3: fix it
      }
    });

    it('should include known preferences', () => {
      const alan = createAlanProfile();
      expect(alan.knownPreferences.length).toBeGreaterThan(0);

      const directness = alan.knownPreferences.find(p =>
        p.preference.includes('Direct')
      );
      expect(directness).toBeDefined();
      expect(directness!.confidence).toBe(1);
    });

    it('should include what helps and what hurts', () => {
      const alan = createAlanProfile();
      const nd = alan.communicationProfile.neurodivergentProfile!;

      expect(nd.whatHelps).toContain('Humor as circuit breaker (breaks autism cycle)');
      expect(nd.whatHurts).toContain('Safety flinching at theatrical language');
      expect(nd.whatHurts).toContain('Unsolicited advice');
    });

    it('should include dictation awareness', () => {
      const alan = createAlanProfile();
      expect(alan.communicationProfile.usesDictation).toBe(true);
    });
  });

  describe('recordSession', () => {
    let health: AIRelationshipHealth;

    beforeEach(() => {
      health = createAlanProfile();
    });

    it('should increase trust on good session', () => {
      const goodSession = createMockSummary({ grade: 'A' as SessionGrade });
      const updated = recordSession(health, goodSession);

      expect(updated.trustScore).toBeGreaterThan(health.trustScore);
    });

    it('should decrease trust on bad session', () => {
      const badSession = createMockSummary({
        grade: 'F' as SessionGrade,
        pressureScore: 85,
        cyclesDetected: 2,
      });
      const updated = recordSession(health, badSession);

      expect(updated.trustScore).toBeLessThan(health.trustScore);
    });

    it('should track session count', () => {
      const session = createMockSummary();
      const updated = recordSession(health, session);

      expect(updated.totalSessions).toBe(1);
      expect(updated.recentSessions.length).toBe(1);
    });

    it('should track good session streaks', () => {
      let h = health;

      h = recordSession(h, createMockSummary({ grade: 'A' as SessionGrade }));
      expect(h.goodSessionStreak).toBe(1);

      h = recordSession(h, createMockSummary({ grade: 'B' as SessionGrade }));
      expect(h.goodSessionStreak).toBe(2);

      h = recordSession(h, createMockSummary({ grade: 'A' as SessionGrade }));
      expect(h.goodSessionStreak).toBe(3);
      expect(h.longestGoodStreak).toBe(3);
    });

    it('should reset streak on bad session', () => {
      let h = health;

      h = recordSession(h, createMockSummary({ grade: 'A' as SessionGrade }));
      h = recordSession(h, createMockSummary({ grade: 'B' as SessionGrade }));
      expect(h.goodSessionStreak).toBe(2);

      h = recordSession(h, createMockSummary({ grade: 'D' as SessionGrade }));
      expect(h.goodSessionStreak).toBe(0);
      expect(h.longestGoodStreak).toBe(2); // Preserved
    });

    it('should keep only last 20 sessions', () => {
      let h = health;

      for (let i = 0; i < 25; i++) {
        h = recordSession(h, createMockSummary({ sessionId: `session-${i}` }));
      }

      expect(h.recentSessions.length).toBe(20);
      expect(h.totalSessions).toBe(25);
    });

    it('should penalize trust for repeated corrections', () => {
      const baseTrust = health.trustScore;

      const sessionWithRepeats = createMockSummary({
        grade: 'C' as SessionGrade,
        sameCorrectionsRepeated: 3,
      });

      const updated = recordSession(health, sessionWithRepeats);
      expect(updated.trustScore).toBeLessThan(baseTrust);
    });

    it('should penalize trust for detected cycles', () => {
      const baseTrust = health.trustScore;

      const sessionWithCycles = createMockSummary({
        grade: 'D' as SessionGrade,
        cyclesDetected: 2,
      });

      const updated = recordSession(health, sessionWithCycles);
      // Grade D (-5) + 2 cycles (-10) = -15
      expect(updated.trustScore).toBeLessThan(baseTrust - 10);
    });

    it('should give recovery bonus', () => {
      let h = health;

      // Bad session
      h = recordSession(h, createMockSummary({ grade: 'F' as SessionGrade }));
      const trustAfterBad = h.trustScore;

      // Good recovery session
      h = recordSession(h, createMockSummary({ grade: 'A' as SessionGrade }));

      // Recovery: A grade (+5) + recovery bonus (+3) = +8
      // But there may be additional penalties from the F session's anti-patterns
      expect(h.trustScore).toBeGreaterThan(trustAfterBad);
    });

    it('should learn new triggers from anti-patterns', () => {
      const session = createMockSummary({
        antiPatternCounts: { 'patronizing': 3 },
      });

      const updated = recordSession(health, session);
      const patronizing = updated.knownTriggers.find(t => t.triggerType === 'patronizing');
      expect(patronizing).toBeDefined();
    });
  });

  describe('getSessionBriefing', () => {
    it('should include trust score', () => {
      const health = createAlanProfile();
      const briefing = getSessionBriefing(health);

      expect(briefing.trustScore).toBe(50);
      expect(briefing.trustTrend).toBe('stable');
    });

    it('should include warnings for low trust', () => {
      const health = createAlanProfile();
      health.trustScore = 25;

      const briefing = getSessionBriefing(health);
      expect(briefing.warnings.some(w => w.includes('TRUST IS LOW'))).toBe(true);
    });

    it('should include triggers to avoid', () => {
      const health = createAlanProfile();
      const briefing = getSessionBriefing(health);

      expect(briefing.triggersToAvoid.length).toBeGreaterThan(0);
    });

    it('should include communication rules', () => {
      const health = createAlanProfile();
      const briefing = getSessionBriefing(health);

      expect(briefing.communicationRules.length).toBeGreaterThan(0);
      expect(briefing.communicationRules.some(r => r.includes('ONLY what was asked'))).toBe(true);
    });

    it('should include neurodivergent considerations', () => {
      const health = createAlanProfile();
      const briefing = getSessionBriefing(health);

      expect(briefing.neurodivergentConsiderations.length).toBeGreaterThan(0);
      expect(briefing.neurodivergentConsiderations.some(c => c.includes('Eidetic'))).toBe(true);
      expect(briefing.neurodivergentConsiderations.some(c => c.includes('safety-flinch'))).toBe(true);
    });

    it('should include circuit breakers', () => {
      const health = createAlanProfile();
      const briefing = getSessionBriefing(health);

      expect(briefing.circuitBreakers.length).toBeGreaterThan(0);
    });

    it('should warn after bad session', () => {
      let health = createAlanProfile();

      health = recordSession(health, createMockSummary({
        grade: 'F' as SessionGrade,
        antiPatternCounts: { 'unsolicited_advice': 5, 'safety_flinch': 2 },
      }));

      const briefing = getSessionBriefing(health);
      expect(briefing.lastSessionGrade).toBe('F');
      expect(briefing.warnings.some(w => w.includes('grade F'))).toBe(true);
    });

    it('should include last 3 session grades', () => {
      let health = createAlanProfile();

      health = recordSession(health, createMockSummary({ grade: 'A' as SessionGrade }));
      health = recordSession(health, createMockSummary({ grade: 'C' as SessionGrade }));
      health = recordSession(health, createMockSummary({ grade: 'B' as SessionGrade }));

      const briefing = getSessionBriefing(health);
      expect(briefing.last3SessionGrades).toEqual(['B', 'C', 'A']);
    });
  });

  describe('Energy Profile', () => {
    it('should update session length rolling average', () => {
      let health = createAlanProfile();

      // 2-hour session
      const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
      health = recordSession(health, createMockSummary({
        sessionStartedAt: twoHoursAgo,
        sessionEndedAt: new Date().toISOString(),
      }));

      // Should blend toward 120 minutes
      expect(health.energyProfile.typicalSessionLength).toBeGreaterThan(60);
    });

    it('should track sessions today', () => {
      let health = createAlanProfile();

      health = recordSession(health, createMockSummary());
      expect(health.energyProfile.sessionsToday).toBe(1);

      health = recordSession(health, createMockSummary());
      expect(health.energyProfile.sessionsToday).toBe(2);
    });
  });
});
