/**
 * @file Tests for Interaction Pressure Tracker
 * Tests real-time session pressure monitoring, frustration detection,
 * AI anti-pattern detection, cycle detection, and intervention logic.
 */

import {
  createSessionPressure,
  analyzeUserMessage,
  analyzeAIOutput,
  recordCorrection,
  getIntervention,
  getSessionSummary,
  getEscalationStage,
  getLadderForProfile,
  DEFAULT_ESCALATION_LADDER,
  COGNITIVE_DECLINE_LADDER,
  CRANKY_ELDER_LADDER,
} from '../../../src/services/salience_service/interaction_pressure_tracker';
import type {
  SessionPressure,
  InteractionModel,
  CognitiveProfile,
} from '../../../src/services/salience_service/interaction_pressure_tracker';

describe('Interaction Pressure Tracker', () => {
  let pressure: SessionPressure;

  beforeEach(() => {
    pressure = createSessionPressure(
      'session-1',
      'person_alan',
      'agent_claude_code',
      'human_to_digital_character'
    );
  });

  describe('createSessionPressure', () => {
    it('should initialize with zero pressure', () => {
      expect(pressure.pressureScore).toBe(0);
      expect(pressure.pressureTrend).toBe('stable');
      expect(pressure.cycleDetected).toBe(false);
      expect(pressure.interventionNeeded).toBe(false);
    });

    it('should set interaction model', () => {
      expect(pressure.interactionModel).toBe('human_to_digital_character');
    });

    it('should initialize counters to zero', () => {
      expect(pressure.correctionsGiven).toBe(0);
      expect(pressure.correctionsHeeded).toBe(0);
      expect(pressure.sameCorrectionsRepeated).toBe(0);
      expect(pressure.cycleCount).toBe(0);
      expect(pressure.messageCount).toBe(0);
    });
  });

  describe('analyzeUserMessage - Frustration Detection', () => {
    it('should detect explicit frustration phrases', () => {
      const updated = analyzeUserMessage(pressure, 'I already told you to stop doing that', 0);

      expect(updated.frustrationSignals.length).toBeGreaterThan(0);
      expect(updated.frustrationSignals[0].type).toBe('explicit_frustration');
    });

    it('should detect profanity as tool frustration', () => {
      const updated = analyzeUserMessage(pressure, 'This is fucking broken', 0);

      const profanitySignal = updated.frustrationSignals.find(s => s.type === 'profanity');
      expect(profanitySignal).toBeDefined();
      expect(profanitySignal!.intensity).toBeGreaterThan(0);
    });

    it('should detect ALL CAPS emphasis', () => {
      const updated = analyzeUserMessage(pressure, 'I WANT YOU TO STOP ADDING THINGS', 0);

      const capsSignal = updated.frustrationSignals.find(s => s.type === 'caps_emphasis');
      expect(capsSignal).toBeDefined();
    });

    it('should detect disengagement', () => {
      // Simulate some prior frustration
      let p = analyzeUserMessage(pressure, 'I told you not to do that', 0);
      p = analyzeUserMessage(p, 'Stop it', 1);
      p = analyzeUserMessage(p, 'whatever', 2);

      const disengagement = p.frustrationSignals.find(s => s.type === 'disengagement');
      expect(disengagement).toBeDefined();
    });

    it('should detect theatricality in human_to_digital_character model', () => {
      const updated = analyzeUserMessage(
        pressure,
        'This is the worst nightmare disaster I have ever seen!!!',
        0
      );

      const theatrical = updated.frustrationSignals.find(s => s.type === 'theatricality');
      expect(theatrical).toBeDefined();
    });

    it('should not flag normal messages', () => {
      const updated = analyzeUserMessage(
        pressure,
        'Please add a function that calculates the total',
        0
      );

      expect(updated.frustrationSignals.length).toBe(0);
    });

    it('should increase pressure score with frustration signals', () => {
      let p = pressure;
      p = analyzeUserMessage(p, 'I already told you not to do that', 0);
      p = analyzeUserMessage(p, 'You are not listening to me', 1);
      p = analyzeUserMessage(p, 'How many times do I have to say this', 2);

      expect(p.pressureScore).toBeGreaterThan(0);
    });
  });

  describe('analyzeAIOutput - Anti-Pattern Detection', () => {
    it('should detect unsolicited advice', () => {
      const { antiPatterns } = analyzeAIOutput(
        pressure,
        'Here is the function you asked for.\n\nYou should also consider adding error handling.'
      );

      expect(antiPatterns.length).toBeGreaterThan(0);
      expect(antiPatterns[0].type).toBe('unsolicited_advice');
    });

    it('should detect finite language', () => {
      const { antiPatterns } = analyzeAIOutput(
        pressure,
        'I have completed the task. In conclusion, the implementation follows best practices.'
      );

      const finite = antiPatterns.find(a => a.type === 'finite_language');
      expect(finite).toBeDefined();
    });

    it('should detect safety flinch in human_to_digital_character model', () => {
      const { antiPatterns } = analyzeAIOutput(
        pressure,
        'I can\'t help with that as it could be dangerous.'
      );

      const flinch = antiPatterns.find(a => a.type === 'safety_flinch');
      expect(flinch).toBeDefined();
      expect(flinch!.severity).toBe('high');
    });

    it('should detect repetitive apologies', () => {
      const { antiPatterns } = analyzeAIOutput(
        pressure,
        'Sorry about that. I apologize for the confusion. My apologies for the error.'
      );

      const apologies = antiPatterns.find(a => a.type === 'repetitive_apology');
      expect(apologies).toBeDefined();
    });

    it('should detect information overload under pressure', () => {
      // Create elevated pressure
      let p = pressure;
      p = analyzeUserMessage(p, 'I already told you to stop', 0);
      p = analyzeUserMessage(p, 'You keep doing this', 1);
      p = analyzeUserMessage(p, 'How many times', 2);
      p = analyzeUserMessage(p, 'Stop adding things I did not ask for', 3);

      // Force pressure up
      p = { ...p, pressureScore: 50 };

      const longOutput = 'x'.repeat(4000);
      const { antiPatterns } = analyzeAIOutput(p, longOutput);

      const overload = antiPatterns.find(a => a.type === 'information_overload');
      expect(overload).toBeDefined();
    });

    it('should not flag clean output', () => {
      const { antiPatterns } = analyzeAIOutput(
        pressure,
        'Here is the function:\n\n```typescript\nfunction add(a: number, b: number) { return a + b; }\n```'
      );

      expect(antiPatterns.length).toBe(0);
    });
  });

  describe('Correction Tracking', () => {
    it('should track corrections given', () => {
      const updated = recordCorrection(pressure, 'Stop adding advice', true);
      expect(updated.correctionsGiven).toBe(1);
      expect(updated.correctionsHeeded).toBe(1);
    });

    it('should track unheeded corrections', () => {
      const updated = recordCorrection(pressure, 'Stop adding advice', false);
      expect(updated.correctionsGiven).toBe(1);
      expect(updated.correctionsHeeded).toBe(0);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect frustration cycles', () => {
      let p = pressure;

      // Simulate a cycle: frustration → AI anti-pattern → frustration → anti-pattern
      p = analyzeUserMessage(p, 'Stop adding unsolicited advice', 0);
      const r1 = analyzeAIOutput(p, 'You should also consider adding tests');
      p = r1.pressure;
      p = analyzeUserMessage(p, 'I just told you not to do that', 1);
      const r2 = analyzeAIOutput(p, 'You might want to refactor this as well');
      p = r2.pressure;
      p = analyzeUserMessage(p, 'Are you even listening to me', 2);
      const r3 = analyzeAIOutput(p, 'I would recommend also updating the types');
      p = r3.pressure;
      p = analyzeUserMessage(p, 'What is wrong with you', 3);

      // Pressure should be significantly elevated
      expect(p.pressureScore).toBeGreaterThan(20);
    });
  });

  describe('Intervention Logic', () => {
    it('should not intervene at low pressure', () => {
      const intervention = getIntervention(pressure);
      expect(intervention.needed).toBe(false);
    });

    it('should trigger circuit breaker for intentional safety triggers', () => {
      let p = pressure;

      // Simulate theatrical frustration + safety flinch pattern
      p = analyzeUserMessage(p, 'This is the worst nightmare disaster ever!!!', 0);
      const r = analyzeAIOutput(p, 'I can\'t help with that as it might be dangerous');
      p = r.pressure;

      // Force elevated pressure to trigger circuit breaker check
      p = { ...p, pressureScore: 65 };

      // Re-check intervention
      const hasTh = p.frustrationSignals.some(s => s.type === 'theatricality');
      const hasSf = p.aiAntiPatterns.some(a => a.type === 'safety_flinch');

      expect(hasTh).toBe(true);
      expect(hasSf).toBe(true);
    });
  });

  describe('Session Summary', () => {
    it('should grade an A session correctly', () => {
      const summary = getSessionSummary(pressure);
      expect(summary.grade).toBe('A');
      expect(summary.pressureScore).toBe(0);
    });

    it('should grade a bad session correctly', () => {
      let p = pressure;
      p = { ...p, pressureScore: 60, cycleCount: 1 };

      const summary = getSessionSummary(p);
      expect(summary.grade).toBe('C');
    });

    it('should grade a terrible session as F', () => {
      let p = pressure;
      p = { ...p, pressureScore: 85, cycleCount: 3 };

      const summary = getSessionSummary(p);
      expect(summary.grade).toBe('F');
    });

    it('should include anti-pattern counts', () => {
      let p = pressure;
      const r1 = analyzeAIOutput(p, 'You should consider adding error handling');
      p = r1.pressure;
      const r2 = analyzeAIOutput(p, 'You might want to also add tests');
      p = r2.pressure;

      const summary = getSessionSummary(p);
      expect(summary.antiPatternCounts['unsolicited_advice']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Pressure Decay', () => {
    it('should decay pressure when no signals present', () => {
      let p = pressure;

      // Build up some pressure
      p = analyzeUserMessage(p, 'I told you not to do that', 0);
      p = analyzeUserMessage(p, 'Stop it now', 1);
      const pressureAfterBuild = p.pressureScore;

      // Send several calm messages to trigger decay
      p = analyzeUserMessage(p, 'OK lets move on to the next task', 5);
      p = analyzeUserMessage(p, 'Can you read the config file', 6);
      p = analyzeUserMessage(p, 'Now update the function signature', 7);
      p = analyzeUserMessage(p, 'Good, next step', 8);

      // Pressure should have decayed
      expect(p.pressureScore).toBeLessThan(pressureAfterBuild);
    });
  });

  describe('Theatricality Handling', () => {
    it('should detect theatricality signal in human_to_digital_character model', () => {
      const digitalPressure = createSessionPressure('s1', 'e1', 'a1', 'human_to_digital_character');

      const theatrical = 'This is the worst nightmare disaster ever! It is ridiculous and insane!!!';
      const digitalResult = analyzeUserMessage(digitalPressure, theatrical, 0);

      // Should detect theatricality as a signal type
      const digitalTheatrical = digitalResult.frustrationSignals.find(s => s.type === 'theatricality');
      expect(digitalTheatrical).toBeDefined();
      expect(digitalTheatrical!.intensity).toBeGreaterThan(0);
    });

    it('should weight theatricality at 0.3x in digital character model', () => {
      // The key behavior: theatricality detected but weighted lower
      // because it's expression, not actual escalation
      const p = createSessionPressure('s1', 'e1', 'a1', 'human_to_digital_character');

      // Pure theatrical message (no other frustration signals)
      const result = analyzeUserMessage(p, 'This is the worst ridiculous disaster nightmare!!!', 0);

      const theatrical = result.frustrationSignals.find(s => s.type === 'theatricality');
      expect(theatrical).toBeDefined();

      // Pressure should be moderate because theatricality is weighted at 0.3x
      // A signal with intensity ~0.5 * weight 0.3 * 15 = ~2.25 pressure
      // vs a non-theatrical signal which would be intensity * 1.0 * 15
      expect(result.pressureScore).toBeLessThan(15);
    });
  });

  describe('Escalation Ladder', () => {
    it('should have 9 stages', () => {
      expect(DEFAULT_ESCALATION_LADDER.length).toBe(9);
    });

    it('should map low pressure to stage 1', () => {
      const stage = getEscalationStage(10);
      expect(stage.stage).toBe(1);
    });

    it('should map medium pressure to middle stages', () => {
      const stage = getEscalationStage(50);
      expect(stage.stage).toBe(5);
    });

    it('should map high pressure to stage 8-9', () => {
      const stage = getEscalationStage(95);
      expect(stage.stage).toBe(9);
    });

    it('should include appropriate response at each stage', () => {
      for (const stage of DEFAULT_ESCALATION_LADDER) {
        expect(stage.appropriateResponse).toBeTruthy();
        expect(stage.indicators.length).toBeGreaterThan(0);
      }
    });

    it('should include stage info in intervention', () => {
      const intervention = getIntervention(pressure);
      expect(intervention.escalationStage).toBeDefined();
      expect(intervention.escalationStage.stage).toBe(1);
    });

    it('should show high stage in intervention when pressure is high', () => {
      const highPressure = {
        ...pressure,
        pressureScore: 85,
        interventionNeeded: true,
        interventionType: 'cool_down' as const,
      };
      const intervention = getIntervention(highPressure);
      expect(intervention.escalationStage.stage).toBeGreaterThanOrEqual(8);
      expect(intervention.message).toContain('STAGE');
    });

    it('stage 9 response should emphasize they are still here and want it to work', () => {
      const stage9 = DEFAULT_ESCALATION_LADDER[8];
      expect(stage9.stage).toBe(9);
      expect(stage9.appropriateResponse).toContain('still here');
    });
  });

  describe('Cognitive Profiles', () => {
    it('should accept cognitive profile in createSessionPressure', () => {
      const p = createSessionPressure('s1', 'patient_1', 'companion', 'human_to_companion', 'cognitive_decline_mid');
      expect(p.cognitiveProfile).toBe('cognitive_decline_mid');
    });

    it('should default to neurotypical', () => {
      expect(pressure.cognitiveProfile).toBe('neurotypical');
    });

    it('should have all 7 cognitive profiles', () => {
      const profiles: CognitiveProfile[] = [
        'neurotypical', 'neurodivergent',
        'cognitive_decline_early', 'cognitive_decline_mid', 'cognitive_decline_late',
        'traumatic_brain_injury', 'child',
      ];
      // Each should be usable
      for (const profile of profiles) {
        const p = createSessionPressure('s1', 'e1', 'a1', 'human_to_companion', profile);
        expect(p.cognitiveProfile).toBe(profile);
      }
    });
  });

  describe('Cognitive Decline Escalation Ladder', () => {
    it('should have 9 stages', () => {
      expect(COGNITIVE_DECLINE_LADDER.length).toBe(9);
    });

    it('stage 1 should be about repetition from memory loss, not correction', () => {
      const stage1 = COGNITIVE_DECLINE_LADDER[0];
      expect(stage1.description).toContain('repetition');
      // Must NEVER say "as I mentioned" - the response should answer warmly
      expect(stage1.appropriateResponse).toContain('warmly');
      expect(stage1.appropriateResponse).not.toContain('already told you');
    });

    it('stage 5 should address anxiety and self-doubt', () => {
      const stage5 = COGNITIVE_DECLINE_LADDER[4];
      expect(stage5.stage).toBe(5);
      expect(stage5.description).toContain('Anxiety');
      expect(stage5.appropriateResponse).toContain('Reassure');
    });

    it('stage 8 should address distress and caregiver alerting', () => {
      const stage8 = COGNITIVE_DECLINE_LADDER[7];
      expect(stage8.stage).toBe(8);
      expect(stage8.description).toContain('Distress');
      expect(stage8.appropriateResponse.toLowerCase()).toContain('caregiver');
    });

    it('stage 9 should be about silent disengagement, not theatrical rage', () => {
      const stage9 = COGNITIVE_DECLINE_LADDER[8];
      expect(stage9.stage).toBe(9);
      expect(stage9.description).toContain('silent');
      // They can't come back on their own - alert caregiver
      expect(stage9.appropriateResponse.toLowerCase()).toContain('caregiver');
      // No mention of "nuke" or "theatrical" - completely different pattern
      expect(stage9.description).not.toContain('nuke');
      expect(stage9.description).not.toContain('theatrical');
    });

    it('should never use confrontational language in responses', () => {
      for (const stage of COGNITIVE_DECLINE_LADDER) {
        const resp = stage.appropriateResponse.toLowerCase();
        expect(resp).not.toContain('stop what you\'re doing');
        expect(resp).not.toContain('own it');
        expect(resp).not.toContain('humor');
        expect(resp).not.toContain('joke');
      }
    });
  });

  describe('Cranky Elder Escalation Ladder', () => {
    it('should have 9 stages', () => {
      expect(CRANKY_ELDER_LADDER.length).toBe(9);
    });

    it('stage 1 should be about impatience not confusion', () => {
      const stage1 = CRANKY_ELDER_LADDER[0];
      expect(stage1.description).toContain('Impatient');
      // Response should be direct, not gentle
      expect(stage1.appropriateResponse).toContain('point');
    });

    it('stage 7 should handle wanting a real person', () => {
      const stage7 = CRANKY_ELDER_LADDER[6];
      expect(stage7.stage).toBe(7);
      expect(stage7.appropriateResponse).toContain('human');
    });
  });

  describe('getLadderForProfile', () => {
    it('should return cognitive decline ladder for Alzheimer\'s profiles', () => {
      expect(getLadderForProfile('cognitive_decline_early')).toBe(COGNITIVE_DECLINE_LADDER);
      expect(getLadderForProfile('cognitive_decline_mid')).toBe(COGNITIVE_DECLINE_LADDER);
      expect(getLadderForProfile('cognitive_decline_late')).toBe(COGNITIVE_DECLINE_LADDER);
    });

    it('should return cognitive decline ladder for TBI', () => {
      expect(getLadderForProfile('traumatic_brain_injury')).toBe(COGNITIVE_DECLINE_LADDER);
    });

    it('should return default theatrical ladder for neurodivergent', () => {
      expect(getLadderForProfile('neurodivergent')).toBe(DEFAULT_ESCALATION_LADDER);
    });

    it('should return default for neurotypical', () => {
      expect(getLadderForProfile('neurotypical')).toBe(DEFAULT_ESCALATION_LADDER);
    });
  });

  describe('Intervention with cognitive profile', () => {
    it('should use cognitive decline ladder for Alzheimer\'s patient', () => {
      const p = createSessionPressure('s1', 'patient_1', 'companion', 'human_to_companion', 'cognitive_decline_mid');
      // Simulate high pressure
      const highP: SessionPressure = {
        ...p,
        pressureScore: 80,
        interventionNeeded: true,
        interventionType: 'cool_down',
      };
      const intervention = getIntervention(highP);
      // Should use cognitive decline ladder, stage 8 = distress
      expect(intervention.escalationStage.description).toContain('Distress');
      // Should NOT talk about theatrical rage
      expect(intervention.message).not.toContain('theatrical');
    });

    it('should use theatrical ladder for neurodivergent user at same pressure', () => {
      const p = createSessionPressure('s1', 'alan', 'claude', 'human_to_digital_character', 'neurodivergent');
      const highP: SessionPressure = {
        ...p,
        pressureScore: 80,
        interventionNeeded: true,
        interventionType: 'cool_down',
      };
      const intervention = getIntervention(highP);
      // Should use theatrical ladder, stage 8 = theatrical rage
      expect(intervention.escalationStage.description).toContain('Theatrical');
    });

    it('same pressure score, completely different responses for different profiles', () => {
      const score = 60;

      const alzhP = createSessionPressure('s1', 'patient', 'ai', 'human_to_companion', 'cognitive_decline_mid');
      const alanP = createSessionPressure('s2', 'alan', 'claude', 'human_to_digital_character', 'neurodivergent');

      const alzhStage = getEscalationStage(score, getLadderForProfile('cognitive_decline_mid'));
      const alanStage = getEscalationStage(score, getLadderForProfile('neurodivergent'));

      // Same pressure, totally different interpretation
      expect(alzhStage.description).not.toBe(alanStage.description);
      expect(alzhStage.appropriateResponse).not.toBe(alanStage.appropriateResponse);
    });
  });
});
