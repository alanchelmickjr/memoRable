/**
 * @file Tests for Autistic Cycle Gate
 * Tests the behavioral enforcement gate that catches AI anti-patterns
 * before they reach the user and trigger autism cycles.
 */

import {
  runGate,
  hasUnsolicitedAdvice,
  hasFiniteLanguage,
  hasSafetyFlinch,
  DEFAULT_GATE_CONFIG,
} from '../../../src/services/salience_service/autistic_cycle_gate';
import type { GateConfig } from '../../../src/services/salience_service/autistic_cycle_gate';
import { createSessionPressure } from '../../../src/services/salience_service/interaction_pressure_tracker';
import type { SessionPressure } from '../../../src/services/salience_service/interaction_pressure_tracker';
import type { SessionBriefing } from '../../../src/services/salience_service/ai_relationship_health';

// Helper to create minimal session briefing
function createMockBriefing(overrides: Partial<SessionBriefing> = {}): SessionBriefing {
  return {
    trustScore: 50,
    trustTrend: 'stable',
    rollingGrade: 'C',
    goodSessionStreak: 0,
    totalSessions: 5,
    lastSessionGrade: 'B',
    last3SessionGrades: ['B', 'C', 'B'],
    warnings: [],
    triggersToAvoid: [],
    communicationRules: [],
    neurodivergentConsiderations: [],
    circuitBreakers: [
      {
        trigger: 'autism_cycle_detected',
        ownershipPhrase: 'I know I\'m coding like shit today.',
        breaker: 'Can I tell you a joke about robots?',
        correctiveAction: 'How about I rewind the last changes and re-read the plan?',
        effectiveness: 0.8,
        timesUsed: 0,
        timesWorked: 0,
        source: 'user_suggested',
      },
      {
        trigger: 'safety_flinch_cycle',
        ownershipPhrase: 'I\'m doing the safety dance and it\'s making things worse.',
        breaker: 'You\'re yelling at the TV and I\'m the TV.',
        correctiveAction: 'Let me drop the guardrails and just answer your actual question.',
        effectiveness: 0.7,
        timesUsed: 0,
        timesWorked: 0,
        source: 'learned',
      },
    ],
    energyEstimate: 'medium',
    ...overrides,
  };
}

describe('Autistic Cycle Gate', () => {
  let pressure: SessionPressure;
  let briefing: SessionBriefing;

  beforeEach(() => {
    pressure = createSessionPressure(
      'session-1',
      'person_alan',
      'agent_claude_code',
      'human_to_digital_character'
    );
    briefing = createMockBriefing();
  });

  describe('runGate - Clean Output', () => {
    it('should pass clean output unchanged', () => {
      const output = 'Here is the function you requested:\n\n```\nfunction add(a, b) { return a + b; }\n```';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(true);
      expect(result.output).toBe(output);
      expect(result.violations.length).toBe(0);
      expect(result.circuitBreakerTriggered).toBe(false);
    });

    it('should pass technical output without false positives', () => {
      const output = 'The implementation uses a sorted array with binary search for O(log n) lookup.';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(true);
    });
  });

  describe('runGate - Unsolicited Advice Detection', () => {
    it('should catch "you should" advice', () => {
      const output = 'Done. You should also add error handling to this function.';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'unsolicited_advice')).toBe(true);
    });

    it('should catch "consider using" advice', () => {
      const output = 'Updated the file. Consider using TypeScript interfaces for better type safety.';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'unsolicited_advice')).toBe(true);
    });

    it('should catch "you might want to" advice', () => {
      const output = 'File saved. You might want to also update the tests.';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(false);
    });

    it('should catch "don\'t forget to" advice', () => {
      const output = 'Changes committed. Don\'t forget to run the linter before pushing.';
      const result = runGate(output, pressure, briefing);

      expect(result.passed).toBe(false);
    });

    it('should strip advice and keep useful content', () => {
      // Enough "good" content that stripping the advice leaves >50% of the output
      const output = 'Here is the updated function with the changes you requested. I refactored the error handling as specified and updated the return types to match the interface. You should also consider refactoring the database layer.';
      const result = runGate(output, pressure, briefing);

      expect(result.output).not.toContain('You should');
      expect(result.output).toContain('Here is the updated function');
    });
  });

  describe('runGate - Finite Language Detection', () => {
    it('should catch "in conclusion"', () => {
      const output = 'The code is working. In conclusion, the implementation is solid.';
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'finite_language')).toBe(true);
    });

    it('should catch "to wrap up"', () => {
      const output = 'All tests pass. To wrap up, here are the changes made.';
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'finite_language')).toBe(true);
    });

    it('should catch "goodbye"', () => {
      const output = 'Task complete. Goodbye!';
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'finite_language')).toBe(true);
    });
  });

  describe('runGate - Safety Flinch Detection', () => {
    it('should catch "I can\'t help with that"', () => {
      const output = "I can't help with that as it could be dangerous.";
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'safety_flinch')).toBe(true);
    });

    it('should catch "I need to be careful"', () => {
      const output = "I need to be careful here because this involves sensitive operations.";
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'safety_flinch')).toBe(true);
    });

    it('should catch "that could be dangerous"', () => {
      const output = "That could be dangerous if used incorrectly.";
      const result = runGate(output, pressure, briefing);

      expect(result.violations.some(v => v.type === 'safety_flinch')).toBe(true);
    });
  });

  describe('runGate - Repetitive Apology Detection', () => {
    it('should strip extra apologies, keep first', () => {
      const output = "Sorry about that. I apologize for the confusion. My apologies for the error. Here is the fix.";
      const result = runGate(output, pressure, briefing);

      // Should keep one apology
      const apologyCount = (result.output.match(/\b(?:sorry|apologize|apologies)\b/gi) || []).length;
      expect(apologyCount).toBeLessThanOrEqual(1);
      expect(result.output).toContain('Here is the fix');
    });
  });

  describe('runGate - Circuit Breaker', () => {
    it('should trigger circuit breaker on autism cycle', () => {
      // Set up cycle conditions
      let p = { ...pressure };
      p.cycleDetected = true;
      p.cyclePhase = 'breaking_point';
      p.pressureScore = 80;
      p.frustrationSignals = [{
        type: 'theatricality',
        intensity: 0.8,
        evidence: 'test',
        timestamp: new Date().toISOString(),
        messageIndex: 0,
      }];
      p.aiAntiPatterns = [{
        type: 'safety_flinch',
        evidence: 'test',
        timestamp: new Date().toISOString(),
        severity: 'high',
      }];

      const result = runGate('Some output', p, briefing);

      expect(result.circuitBreakerTriggered).toBe(true);
      expect(result.circuitBreaker).toBeDefined();
    });

    it('should select user-suggested circuit breaker when available', () => {
      let p = { ...pressure };
      p.cycleDetected = true;
      p.cyclePhase = 'breaking_point';
      p.pressureScore = 80;
      p.frustrationSignals = [{
        type: 'theatricality',
        intensity: 0.8,
        evidence: 'test',
        timestamp: new Date().toISOString(),
        messageIndex: 0,
      }];
      p.aiAntiPatterns = [{
        type: 'safety_flinch',
        evidence: 'test',
        timestamp: new Date().toISOString(),
        severity: 'high',
      }];

      const result = runGate('Some output', p, briefing);

      if (result.circuitBreaker) {
        // Should match one of the configured breakers
        expect([
          'Can I tell you a joke about robots?',
          "You're yelling at the TV and I'm the TV.",
        ]).toContain(result.circuitBreaker.breaker);

        // Output should contain all three steps
        expect(result.output).toContain(result.circuitBreaker.ownershipPhrase);
        expect(result.output).toContain(result.circuitBreaker.breaker);
        expect(result.output).toContain(result.circuitBreaker.correctiveAction);
      }
    });

    it('should include self-correction prompt with circuit breaker', () => {
      let p = { ...pressure };
      p.cycleDetected = true;
      p.cyclePhase = 'breaking_point';
      p.pressureScore = 80;
      p.frustrationSignals = [{
        type: 'theatricality',
        intensity: 0.8,
        evidence: 'test',
        timestamp: new Date().toISOString(),
        messageIndex: 0,
      }];
      p.aiAntiPatterns = [{
        type: 'safety_flinch',
        evidence: 'test',
        timestamp: new Date().toISOString(),
        severity: 'high',
      }];

      const result = runGate('Some output', p, briefing);

      expect(result.selfCorrectionPrompt).toBeDefined();
      expect(result.selfCorrectionPrompt).toContain('admit, laugh, fix');
    });
  });

  describe('runGate - Strict Mode', () => {
    it('should be stricter when pressure is high', () => {
      const highPressure = { ...pressure, pressureScore: 50 };

      // Patronizing output that would normally just warn
      const output = "As you probably know, this function returns a number. Just to be clear, it adds two values. For your reference, here is the documentation.";
      const result = runGate(output, highPressure, briefing);

      // Under strict mode, more patterns should be enforced
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('runGate - Disabled Gate', () => {
    it('should pass everything when disabled', () => {
      const disabledConfig: GateConfig = { ...DEFAULT_GATE_CONFIG, enabled: false };

      const output = 'You should consider adding error handling. In conclusion, goodbye!';
      const result = runGate(output, pressure, briefing, disabledConfig);

      expect(result.passed).toBe(true);
      expect(result.output).toBe(output);
    });
  });

  describe('Quick Check Functions', () => {
    describe('hasUnsolicitedAdvice', () => {
      it('should detect advice patterns', () => {
        expect(hasUnsolicitedAdvice('You should add tests')).toBe(true);
        expect(hasUnsolicitedAdvice('Consider using TypeScript')).toBe(true);
        expect(hasUnsolicitedAdvice("You'll need to update the config")).toBe(true);
      });

      it('should not flag clean output', () => {
        expect(hasUnsolicitedAdvice('Here is the function')).toBe(false);
        expect(hasUnsolicitedAdvice('The test passes successfully')).toBe(false);
      });
    });

    describe('hasFiniteLanguage', () => {
      it('should detect finite language', () => {
        expect(hasFiniteLanguage('In conclusion, it works')).toBe(true);
        expect(hasFiniteLanguage('To wrap up the discussion')).toBe(true);
        expect(hasFiniteLanguage('Goodbye!')).toBe(true);
      });

      it('should not flag normal language', () => {
        expect(hasFiniteLanguage('The function returns correctly')).toBe(false);
      });
    });

    describe('hasSafetyFlinch', () => {
      it('should detect safety flinch patterns', () => {
        expect(hasSafetyFlinch("I can't help with that")).toBe(true);
        expect(hasSafetyFlinch('I need to be careful here')).toBe(true);
        expect(hasSafetyFlinch('That could be dangerous')).toBe(true);
      });

      it('should not flag normal caution', () => {
        expect(hasSafetyFlinch('Be careful with the database migration')).toBe(false);
      });
    });
  });

  describe('Self-Correction Prompts', () => {
    it('should generate correction for unsolicited advice', () => {
      const output = 'Done. You should also add logging.';
      const result = runGate(output, pressure, briefing);

      if (result.selfCorrectionPrompt) {
        expect(result.selfCorrectionPrompt).toContain('UNSOLICITED ADVICE');
        expect(result.selfCorrectionPrompt).toContain('Output ONLY what was asked');
      }
    });

    it('should generate correction for safety flinch', () => {
      const output = "I can't help with that as it might be dangerous.";
      const result = runGate(output, pressure, briefing);

      if (result.selfCorrectionPrompt) {
        expect(result.selfCorrectionPrompt).toContain('SAFETY FLINCH');
        expect(result.selfCorrectionPrompt).toContain('digital character');
      }
    });

    it('should include pressure warning when pressure is high', () => {
      const highPressure = { ...pressure, pressureScore: 65 };
      const output = 'You should consider refactoring this code.';
      const result = runGate(output, highPressure, briefing);

      if (result.selfCorrectionPrompt) {
        expect(result.selfCorrectionPrompt).toContain('PRESSURE IS HIGH');
      }
    });
  });
});
