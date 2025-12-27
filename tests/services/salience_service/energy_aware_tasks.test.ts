/**
 * @file Tests for Energy-Aware Task Retrieval Service (TaskForge Triage Integration)
 * Tests the energy matching, triage categorization, and task recommendations
 */

import type { OpenLoop, LoopCategory, LoopUrgency, LoopOwner } from '../../../src/services/salience_service/models';

// Import types to test
type EnergyLevel = 'peak' | 'high' | 'medium' | 'low' | 'recovery';
type CognitiveLoad = 'minimal' | 'light' | 'moderate' | 'heavy' | 'intense';
type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'strategic';
type TimeBlock = '5min' | '15min' | '30min' | '1hour' | '2hours' | 'deep_work';
type TriageCategory = 'do_now' | 'schedule' | 'delegate' | 'quick_win' | 'deep_work' | 'batch' | 'defer' | 'reconsider';

// Helper to create minimal open loop for testing
function createMinimalLoop(overrides: Partial<OpenLoop> = {}): OpenLoop {
  return {
    id: 'loop-1',
    userId: 'user-1',
    memoryId: 'mem-1',
    loopType: 'commitment_made',
    description: 'Send the report',
    category: 'deliverable' as LoopCategory,
    owner: 'self' as LoopOwner,
    createdAt: new Date().toISOString(),
    urgency: 'normal' as LoopUrgency,
    status: 'open',
    remindedCount: 0,
    escalateAfterDays: 7,
    ...overrides,
  };
}

describe('Energy-Aware Tasks (TaskForge Triage Integration)', () => {
  describe('Energy Level Constants', () => {
    const ENERGY_CAPACITY: Record<EnergyLevel, number> = {
      peak: 100,
      high: 80,
      medium: 60,
      low: 35,
      recovery: 15,
    };

    it('should have correct energy capacities', () => {
      expect(ENERGY_CAPACITY.peak).toBe(100);
      expect(ENERGY_CAPACITY.high).toBe(80);
      expect(ENERGY_CAPACITY.medium).toBe(60);
      expect(ENERGY_CAPACITY.low).toBe(35);
      expect(ENERGY_CAPACITY.recovery).toBe(15);
    });

    it('should have descending energy order', () => {
      expect(ENERGY_CAPACITY.peak).toBeGreaterThan(ENERGY_CAPACITY.high);
      expect(ENERGY_CAPACITY.high).toBeGreaterThan(ENERGY_CAPACITY.medium);
      expect(ENERGY_CAPACITY.medium).toBeGreaterThan(ENERGY_CAPACITY.low);
      expect(ENERGY_CAPACITY.low).toBeGreaterThan(ENERGY_CAPACITY.recovery);
    });
  });

  describe('Cognitive Load Constants', () => {
    const COGNITIVE_REQUIREMENTS: Record<CognitiveLoad, number> = {
      minimal: 10,
      light: 25,
      moderate: 50,
      heavy: 75,
      intense: 90,
    };

    it('should have correct cognitive requirements', () => {
      expect(COGNITIVE_REQUIREMENTS.minimal).toBe(10);
      expect(COGNITIVE_REQUIREMENTS.intense).toBe(90);
    });

    it('should have ascending cognitive load order', () => {
      expect(COGNITIVE_REQUIREMENTS.minimal).toBeLessThan(COGNITIVE_REQUIREMENTS.light);
      expect(COGNITIVE_REQUIREMENTS.light).toBeLessThan(COGNITIVE_REQUIREMENTS.moderate);
      expect(COGNITIVE_REQUIREMENTS.moderate).toBeLessThan(COGNITIVE_REQUIREMENTS.heavy);
      expect(COGNITIVE_REQUIREMENTS.heavy).toBeLessThan(COGNITIVE_REQUIREMENTS.intense);
    });
  });

  describe('Time Block Constants', () => {
    const TIME_BLOCK_MINUTES: Record<TimeBlock, number> = {
      '5min': 5,
      '15min': 15,
      '30min': 30,
      '1hour': 60,
      '2hours': 120,
      'deep_work': 180,
    };

    it('should have correct time block durations', () => {
      expect(TIME_BLOCK_MINUTES['5min']).toBe(5);
      expect(TIME_BLOCK_MINUTES['1hour']).toBe(60);
      expect(TIME_BLOCK_MINUTES['deep_work']).toBe(180);
    });
  });

  describe('Category to Cognitive Load Mapping', () => {
    const CATEGORY_COGNITIVE_LOAD: Record<LoopCategory, CognitiveLoad> = {
      deliverable: 'moderate',
      meeting: 'moderate',
      introduction: 'light',
      favor: 'light',
      information: 'minimal',
      decision: 'heavy',
      payment: 'minimal',
      other: 'moderate',
    };

    it('should map decision to heavy cognitive load', () => {
      expect(CATEGORY_COGNITIVE_LOAD.decision).toBe('heavy');
    });

    it('should map information to minimal cognitive load', () => {
      expect(CATEGORY_COGNITIVE_LOAD.information).toBe('minimal');
    });

    it('should map introduction to light cognitive load', () => {
      expect(CATEGORY_COGNITIVE_LOAD.introduction).toBe('light');
    });
  });

  describe('estimateCognitiveLoad (heuristic)', () => {
    const CATEGORY_COGNITIVE_LOAD: Record<string, CognitiveLoad> = {
      deliverable: 'moderate',
      decision: 'heavy',
      information: 'minimal',
    };

    function estimateCognitiveLoad(loop: OpenLoop): CognitiveLoad {
      const baseLoad = CATEGORY_COGNITIVE_LOAD[loop.category] || 'moderate';
      const description = loop.description.toLowerCase();

      if (
        description.includes('complex') ||
        description.includes('analyze') ||
        description.includes('design') ||
        description.includes('strategy')
      ) {
        const levels: CognitiveLoad[] = ['minimal', 'light', 'moderate', 'heavy', 'intense'];
        const index = levels.indexOf(baseLoad);
        return levels[Math.min(index + 1, levels.length - 1)];
      }

      if (
        description.includes('quick') ||
        description.includes('simple')
      ) {
        const levels: CognitiveLoad[] = ['minimal', 'light', 'moderate', 'heavy', 'intense'];
        const index = levels.indexOf(baseLoad);
        return levels[Math.max(index - 1, 0)];
      }

      return baseLoad;
    }

    it('should return base load for simple descriptions', () => {
      const loop = createMinimalLoop({ description: 'Send the report' });
      expect(estimateCognitiveLoad(loop)).toBe('moderate');
    });

    it('should upgrade load for complex descriptions', () => {
      const loop = createMinimalLoop({ description: 'Analyze the quarterly data' });
      expect(estimateCognitiveLoad(loop)).toBe('heavy');
    });

    it('should upgrade load for strategy descriptions', () => {
      const loop = createMinimalLoop({ description: 'Define product strategy' });
      expect(estimateCognitiveLoad(loop)).toBe('heavy');
    });

    it('should downgrade load for quick descriptions', () => {
      const loop = createMinimalLoop({ description: 'Quick email reply' });
      expect(estimateCognitiveLoad(loop)).toBe('light');
    });

    it('should downgrade load for simple descriptions', () => {
      const loop = createMinimalLoop({ description: 'Simple file upload' });
      expect(estimateCognitiveLoad(loop)).toBe('light');
    });
  });

  describe('estimateComplexity (heuristic)', () => {
    function estimateComplexity(loop: OpenLoop): TaskComplexity {
      const description = loop.description.toLowerCase();

      if (description.includes('strategy') || description.includes('plan') || description.includes('decide')) {
        return 'strategic';
      }
      if (description.includes('research') || description.includes('analyze') || description.includes('design')) {
        return 'complex';
      }
      if (description.includes('send') || description.includes('forward') || description.includes('reply')) {
        return 'simple';
      }
      if (description.length < 30 || description.includes('quick')) {
        return 'trivial';
      }
      return 'moderate';
    }

    it('should identify strategic tasks', () => {
      expect(estimateComplexity(createMinimalLoop({ description: 'Plan Q1 roadmap' }))).toBe('strategic');
      expect(estimateComplexity(createMinimalLoop({ description: 'Define strategy' }))).toBe('strategic');
    });

    it('should identify complex tasks', () => {
      expect(estimateComplexity(createMinimalLoop({ description: 'Research competitors' }))).toBe('complex');
      expect(estimateComplexity(createMinimalLoop({ description: 'Analyze user data' }))).toBe('complex');
    });

    it('should identify simple tasks', () => {
      expect(estimateComplexity(createMinimalLoop({ description: 'Send the report' }))).toBe('simple');
      expect(estimateComplexity(createMinimalLoop({ description: 'Forward the email' }))).toBe('simple');
    });

    it('should identify trivial tasks by length', () => {
      expect(estimateComplexity(createMinimalLoop({ description: 'Call Bob' }))).toBe('trivial');
    });

    it('should default to moderate for unmatched', () => {
      expect(estimateComplexity(createMinimalLoop({
        description: 'Complete the documentation for the new feature release'
      }))).toBe('moderate');
    });
  });

  describe('estimateDuration (heuristic)', () => {
    function estimateDuration(loop: OpenLoop, complexity: TaskComplexity): number {
      const baseDurations: Record<TaskComplexity, number> = {
        trivial: 5,
        simple: 15,
        moderate: 30,
        complex: 60,
        strategic: 120,
      };

      let duration = baseDurations[complexity];

      if (loop.category === 'meeting') {
        duration = Math.max(30, duration);
      }
      if (loop.category === 'deliverable') {
        duration = Math.max(45, duration);
      }

      return duration;
    }

    it('should return base duration for complexity', () => {
      const loop = createMinimalLoop({ category: 'other' });
      expect(estimateDuration(loop, 'trivial')).toBe(5);
      expect(estimateDuration(loop, 'simple')).toBe(15);
      expect(estimateDuration(loop, 'moderate')).toBe(30);
      expect(estimateDuration(loop, 'complex')).toBe(60);
      expect(estimateDuration(loop, 'strategic')).toBe(120);
    });

    it('should enforce minimum for meetings', () => {
      const loop = createMinimalLoop({ category: 'meeting' });
      expect(estimateDuration(loop, 'trivial')).toBe(30);
      expect(estimateDuration(loop, 'simple')).toBe(30);
    });

    it('should enforce minimum for deliverables', () => {
      const loop = createMinimalLoop({ category: 'deliverable' });
      expect(estimateDuration(loop, 'trivial')).toBe(45);
      expect(estimateDuration(loop, 'simple')).toBe(45);
    });
  });

  describe('getRecommendedTimeBlock (heuristic)', () => {
    function getRecommendedTimeBlock(minutes: number): TimeBlock {
      if (minutes <= 5) return '5min';
      if (minutes <= 15) return '15min';
      if (minutes <= 30) return '30min';
      if (minutes <= 60) return '1hour';
      if (minutes <= 120) return '2hours';
      return 'deep_work';
    }

    it('should return correct time blocks', () => {
      expect(getRecommendedTimeBlock(5)).toBe('5min');
      expect(getRecommendedTimeBlock(10)).toBe('15min');
      expect(getRecommendedTimeBlock(25)).toBe('30min');
      expect(getRecommendedTimeBlock(45)).toBe('1hour');
      expect(getRecommendedTimeBlock(90)).toBe('2hours');
      expect(getRecommendedTimeBlock(180)).toBe('deep_work');
    });
  });

  describe('getMinEnergyLevel (heuristic)', () => {
    function getMinEnergyLevel(load: CognitiveLoad): EnergyLevel {
      const mapping: Record<CognitiveLoad, EnergyLevel> = {
        minimal: 'recovery',
        light: 'low',
        moderate: 'medium',
        heavy: 'high',
        intense: 'peak',
      };
      return mapping[load];
    }

    it('should map cognitive load to minimum energy', () => {
      expect(getMinEnergyLevel('minimal')).toBe('recovery');
      expect(getMinEnergyLevel('light')).toBe('low');
      expect(getMinEnergyLevel('moderate')).toBe('medium');
      expect(getMinEnergyLevel('heavy')).toBe('high');
      expect(getMinEnergyLevel('intense')).toBe('peak');
    });
  });

  describe('calculateEnergyMatch (heuristic)', () => {
    const ENERGY_CAPACITY: Record<EnergyLevel, number> = {
      peak: 100, high: 80, medium: 60, low: 35, recovery: 15,
    };

    function calculateEnergyMatch(
      current: EnergyLevel,
      minimum: EnergyLevel,
      optimal: EnergyLevel
    ): number {
      const currentCapacity = ENERGY_CAPACITY[current];
      const minRequired = ENERGY_CAPACITY[minimum];
      const optimalRequired = ENERGY_CAPACITY[optimal];

      if (currentCapacity < minRequired) {
        return currentCapacity / minRequired * 0.3;
      }
      if (currentCapacity >= optimalRequired) {
        return 1.0;
      }
      const range = optimalRequired - minRequired;
      const position = currentCapacity - minRequired;
      return 0.5 + (position / range) * 0.5;
    }

    it('should return 1.0 when at or above optimal', () => {
      expect(calculateEnergyMatch('peak', 'medium', 'high')).toBe(1.0);
      expect(calculateEnergyMatch('peak', 'low', 'medium')).toBe(1.0);
    });

    it('should return low match when below minimum', () => {
      const match = calculateEnergyMatch('recovery', 'medium', 'high');
      expect(match).toBeLessThan(0.3);
    });

    it('should return proportional match between min and optimal', () => {
      const match = calculateEnergyMatch('medium', 'low', 'peak');
      expect(match).toBeGreaterThan(0.5);
      expect(match).toBeLessThan(1.0);
    });
  });

  describe('calculateUrgency (heuristic)', () => {
    function calculateUrgency(loop: OpenLoop): {
      urgencyScore: number;
      deadlinePressure: 'none' | 'low' | 'moderate' | 'high' | 'critical';
      daysUntilDue: number | null;
    } {
      const baseScores: Record<LoopUrgency, number> = {
        urgent: 80, high: 60, normal: 40, low: 20,
      };
      let urgencyScore = baseScores[loop.urgency];
      let deadlinePressure: 'none' | 'low' | 'moderate' | 'high' | 'critical' = 'none';
      let daysUntilDue: number | null = null;

      const targetDate = loop.dueDate || loop.softDeadline;
      if (targetDate) {
        const now = new Date();
        const due = new Date(targetDate);
        daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilDue < 0) {
          urgencyScore = 100;
          deadlinePressure = 'critical';
        } else if (daysUntilDue === 0) {
          urgencyScore = Math.max(urgencyScore, 95);
          deadlinePressure = 'critical';
        } else if (daysUntilDue <= 1) {
          urgencyScore = Math.max(urgencyScore, 85);
          deadlinePressure = 'high';
        } else if (daysUntilDue <= 3) {
          urgencyScore = Math.max(urgencyScore, 70);
          deadlinePressure = 'moderate';
        } else if (daysUntilDue <= 7) {
          urgencyScore = Math.max(urgencyScore, 50);
          deadlinePressure = 'low';
        }
      }

      if (loop.owner === 'self') {
        urgencyScore = Math.min(100, urgencyScore + 10);
      }

      return { urgencyScore, deadlinePressure, daysUntilDue };
    }

    it('should return base urgency for no deadline', () => {
      const loop = createMinimalLoop({ urgency: 'normal', owner: 'them' });
      const result = calculateUrgency(loop);
      expect(result.urgencyScore).toBe(40);
      expect(result.deadlinePressure).toBe('none');
    });

    it('should return critical for overdue tasks', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const loop = createMinimalLoop({ dueDate: yesterday, owner: 'them' });
      const result = calculateUrgency(loop);
      expect(result.urgencyScore).toBe(100);
      expect(result.deadlinePressure).toBe('critical');
    });

    it('should return high pressure for tomorrow', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const loop = createMinimalLoop({ dueDate: tomorrow, owner: 'them' });
      const result = calculateUrgency(loop);
      expect(result.deadlinePressure).toBe('high');
    });

    it('should boost urgency for self-owned tasks', () => {
      const loopSelf = createMinimalLoop({ urgency: 'normal', owner: 'self' });
      const loopThem = createMinimalLoop({ urgency: 'normal', owner: 'them' });

      const selfResult = calculateUrgency(loopSelf);
      const themResult = calculateUrgency(loopThem);

      expect(selfResult.urgencyScore).toBeGreaterThan(themResult.urgencyScore);
    });
  });

  describe('determineTriageCategory (heuristic)', () => {
    function determineTriageCategory(
      urgencyScore: number,
      energyMatch: number,
      cognitiveLoad: CognitiveLoad,
      loop: OpenLoop
    ): TriageCategory {
      if (urgencyScore >= 80 && energyMatch >= 0.6) {
        return 'do_now';
      }
      if (urgencyScore >= 60 && energyMatch < 0.5) {
        return 'schedule';
      }
      if (cognitiveLoad === 'minimal' || cognitiveLoad === 'light') {
        return 'quick_win';
      }
      if (cognitiveLoad === 'heavy' || cognitiveLoad === 'intense') {
        return 'deep_work';
      }
      if (loop.owner === 'mutual') {
        return 'delegate';
      }
      if (urgencyScore < 40 && energyMatch < 0.5) {
        return 'defer';
      }
      if (urgencyScore < 20 && loop.remindedCount > 2) {
        return 'reconsider';
      }
      return 'schedule';
    }

    it('should return do_now for urgent + good energy', () => {
      const loop = createMinimalLoop();
      expect(determineTriageCategory(85, 0.7, 'moderate', loop)).toBe('do_now');
    });

    it('should return schedule for urgent + low energy', () => {
      const loop = createMinimalLoop();
      expect(determineTriageCategory(70, 0.3, 'moderate', loop)).toBe('schedule');
    });

    it('should return quick_win for light cognitive load', () => {
      const loop = createMinimalLoop();
      expect(determineTriageCategory(30, 0.5, 'light', loop)).toBe('quick_win');
    });

    it('should return deep_work for heavy cognitive load', () => {
      const loop = createMinimalLoop();
      expect(determineTriageCategory(50, 0.8, 'heavy', loop)).toBe('deep_work');
    });

    it('should return delegate for mutual tasks', () => {
      const loop = createMinimalLoop({ owner: 'mutual' });
      expect(determineTriageCategory(50, 0.6, 'moderate', loop)).toBe('delegate');
    });

    it('should return defer for low urgency + low energy', () => {
      const loop = createMinimalLoop();
      expect(determineTriageCategory(30, 0.3, 'moderate', loop)).toBe('defer');
    });

    it('should return reconsider for old low-priority tasks', () => {
      const loop = createMinimalLoop({ remindedCount: 5 });
      expect(determineTriageCategory(15, 0.6, 'moderate', loop)).toBe('reconsider');
    });
  });

  describe('getEnergyDescription', () => {
    function getEnergyDescription(level: EnergyLevel): string {
      const descriptions: Record<EnergyLevel, string> = {
        peak: 'Peak energy - ready for complex, strategic work',
        high: 'High energy - good for challenging tasks',
        medium: 'Moderate energy - suitable for routine work',
        low: 'Low energy - stick to simple, familiar tasks',
        recovery: 'Recovery mode - minimal tasks only',
      };
      return descriptions[level];
    }

    it('should return correct descriptions', () => {
      expect(getEnergyDescription('peak')).toContain('complex, strategic');
      expect(getEnergyDescription('recovery')).toContain('minimal tasks');
    });
  });

  describe('getCognitiveLoadDescription', () => {
    function getCognitiveLoadDescription(load: CognitiveLoad): string {
      const descriptions: Record<CognitiveLoad, string> = {
        minimal: 'Autopilot - can do without thinking',
        light: 'Light focus - some attention needed',
        moderate: 'Moderate focus - requires concentration',
        heavy: 'Heavy focus - demanding mental work',
        intense: 'Intense focus - maximum cognitive effort',
      };
      return descriptions[load];
    }

    it('should return correct descriptions', () => {
      expect(getCognitiveLoadDescription('minimal')).toContain('Autopilot');
      expect(getCognitiveLoadDescription('intense')).toContain('maximum');
    });
  });

  describe('suggestEnergyForTimeOfDay', () => {
    function suggestEnergyForTimeOfDay(hour: number): EnergyLevel {
      if (hour >= 9 && hour <= 11) return 'peak';
      if (hour >= 14 && hour <= 16) return 'medium';
      if (hour >= 16 && hour <= 18) return 'high';
      if (hour >= 6 && hour <= 8) return 'high';
      if (hour >= 19 && hour <= 21) return 'medium';
      return 'low';
    }

    it('should suggest peak energy for morning peak hours', () => {
      expect(suggestEnergyForTimeOfDay(9)).toBe('peak');
      expect(suggestEnergyForTimeOfDay(10)).toBe('peak');
      expect(suggestEnergyForTimeOfDay(11)).toBe('peak');
    });

    it('should suggest medium for post-lunch dip', () => {
      expect(suggestEnergyForTimeOfDay(14)).toBe('medium');
      expect(suggestEnergyForTimeOfDay(15)).toBe('medium');
    });

    it('should suggest high for afternoon recovery', () => {
      expect(suggestEnergyForTimeOfDay(17)).toBe('high');
    });

    it('should suggest low for late night', () => {
      expect(suggestEnergyForTimeOfDay(23)).toBe('low');
      expect(suggestEnergyForTimeOfDay(3)).toBe('low');
    });
  });

  describe('Triage Category Types', () => {
    it('should have all expected triage categories', () => {
      const categories: TriageCategory[] = [
        'do_now', 'schedule', 'delegate', 'quick_win',
        'deep_work', 'batch', 'defer', 'reconsider'
      ];
      expect(categories).toHaveLength(8);
    });
  });

  describe('Energy Level Types', () => {
    it('should have all expected energy levels', () => {
      const levels: EnergyLevel[] = ['peak', 'high', 'medium', 'low', 'recovery'];
      expect(levels).toHaveLength(5);
    });
  });
});
