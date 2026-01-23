/**
 * @file Temporal Data Generator for Pattern Detection Testing
 *
 * Generates 84 days of backdated synthetic data that exercises the FFT
 * pattern detector. Creates both memories (via API) and access records
 * (direct MongoDB) with realistic temporal patterns.
 *
 * Pattern types generated:
 * - Daily (24h period): Morning routine, medication reminders
 * - Weekly (168h period): Wednesday meetings, Sunday calls
 * - Tri-weekly (504h period): Monthly-ish check-ins
 * - Monthly (720h period): Bill payments, doctor visits
 *
 * Realism features:
 * - Time jitter: ±2 hours from expected time
 * - Skip rate: 10% of events randomly missing
 * - Content variance: Same activity, different wording
 * - Weekend gaps: Some patterns pause on weekends
 * - Salience variance: 0.4-0.9 range with pattern-appropriate weights
 */

// ============================================================================
// Types
// ============================================================================

export interface TemporalPattern {
  name: string;
  periodHours: number;
  baseHour: number;            // Hour of day (0-23) when pattern fires
  baseDayOfWeek?: number;      // 0=Sun, 1=Mon... (for weekly+)
  jitterHours: number;         // ±hours of randomness
  skipRate: number;            // 0.0-1.0 probability of skipping
  weekendPause: boolean;       // Skip on weekends?
  contentVariants: string[];   // Different wordings for same activity
  salience: number;            // Base salience
  salienceJitter: number;      // ±salience randomness
  context: {
    location?: string;
    activity?: string;
    people?: string[];
    project?: string;
  };
  entities: string[];
}

export interface GeneratedAccessRecord {
  userId: string;
  memoryId: string;
  timestamp: Date;
  contextFrame?: {
    location?: string;
    people?: string[];
    activity?: string;
    project?: string;
  };
}

export interface GeneratedMemory {
  content: string;
  userId: string;
  timestamp: Date;
  salience: number;
  entities: string[];
  context: {
    location?: string;
    activity?: string;
    people?: string[];
    project?: string;
  };
  patternName: string;        // Which pattern generated this
  memoryId: string;           // Pre-generated ID for cross-referencing
}

export interface TemporalDataset {
  memories: GeneratedMemory[];
  accessRecords: GeneratedAccessRecord[];
  patterns: TemporalPattern[];
  metadata: {
    userId: string;
    startDate: Date;
    endDate: Date;
    daysSpan: number;
    totalMemories: number;
    totalAccessRecords: number;
    expectedPatterns: {
      name: string;
      periodHours: number;
      expectedConfidenceAtDay21: number;
      expectedConfidenceAtDay63: number;
    }[];
  };
}

// ============================================================================
// Default Patterns - Realistic Human Behaviors
// ============================================================================

export const DEFAULT_PATTERNS: TemporalPattern[] = [
  // DAILY PATTERNS
  {
    name: 'morning_routine',
    periodHours: 24,
    baseHour: 7,
    jitterHours: 1.5,
    skipRate: 0.05,           // Rarely skip morning routine
    weekendPause: false,
    contentVariants: [
      'Morning coffee and checked messages',
      'Started the day with stretches and breakfast',
      'Morning routine - shower, coffee, news',
      'Woke up early, feeling good today',
      'Morning meditation and planning session',
      'Quick breakfast, busy day ahead',
    ],
    salience: 0.3,
    salienceJitter: 0.1,
    context: { location: 'home', activity: 'routine' },
    entities: [],
  },
  {
    name: 'evening_review',
    periodHours: 24,
    baseHour: 20,
    jitterHours: 2,
    skipRate: 0.15,           // Sometimes skip evening review
    weekendPause: false,
    contentVariants: [
      'Reviewed what got done today, planning tomorrow',
      'End of day reflection - good progress',
      'Evening wind-down, catching up on reading',
      'Journaling about today\'s events',
      'Quiet evening, thinking about next steps',
    ],
    salience: 0.4,
    salienceJitter: 0.15,
    context: { location: 'home', activity: 'reflection' },
    entities: [],
  },
  {
    name: 'medication_reminder',
    periodHours: 24,
    baseHour: 8,
    jitterHours: 0.5,        // Tight window for medication
    skipRate: 0.02,           // Almost never skip
    weekendPause: false,
    contentVariants: [
      'Took morning medication',
      'Medication taken - blood pressure pills',
      'Remembered to take pills with breakfast',
      'Morning meds done',
    ],
    salience: 0.6,
    salienceJitter: 0.05,
    context: { location: 'home', activity: 'health' },
    entities: ['person_dr_chen'],
  },

  // WEEKLY PATTERNS
  {
    name: 'wednesday_meeting',
    periodHours: 168,
    baseHour: 14,
    baseDayOfWeek: 3,         // Wednesday
    jitterHours: 0.5,         // Meetings are fairly punctual
    skipRate: 0.1,
    weekendPause: false,      // N/A - already weekday-specific
    contentVariants: [
      'Wednesday sync with the team - discussed roadmap',
      'Team meeting: reviewed sprint progress',
      'Weekly standup - everyone aligned on priorities',
      'Meeting with Sarah about project status',
      'Wednesday planning session - set goals for next week',
      'Team sync: blocked on infrastructure, need to resolve',
    ],
    salience: 0.7,
    salienceJitter: 0.1,
    context: { location: 'office', activity: 'meeting', people: ['Sarah', 'Bob'] },
    entities: ['person_sarah_daughter', 'person_bob'],
  },
  {
    name: 'sunday_family_call',
    periodHours: 168,
    baseHour: 11,
    baseDayOfWeek: 0,         // Sunday
    jitterHours: 2,
    skipRate: 0.08,
    weekendPause: false,
    contentVariants: [
      'Sunday call with family - everyone doing well',
      'Caught up with family on the phone',
      'Video call with the family - kids growing fast',
      'Family check-in: discussed holiday plans',
      'Sunday morning family call - good to hear from everyone',
    ],
    salience: 0.65,
    salienceJitter: 0.1,
    context: { location: 'home', activity: 'family_call', people: ['family'] },
    entities: ['person_sarah_daughter'],
  },

  // WORK-WEEK PATTERN (weekdays only)
  {
    name: 'workday_coding',
    periodHours: 24,
    baseHour: 10,
    jitterHours: 1,
    skipRate: 0.05,
    weekendPause: true,       // No coding on weekends
    contentVariants: [
      'Deep work session on the auth system',
      'Coding: implemented new pattern detection',
      'Working on MemoRable feature: context gating',
      'Debugging session - found the race condition',
      'Wrote tests for the new pipeline',
      'Refactoring the ingestion service',
      'Implementing the FFT-based detector',
      'Code review with Bob - good feedback',
    ],
    salience: 0.5,
    salienceJitter: 0.15,
    context: { location: 'office', activity: 'coding', project: 'MemoRable' },
    entities: ['memorable_project'],
  },

  // TRI-WEEKLY PATTERN
  {
    name: 'biweekly_retro',
    periodHours: 336,         // Every 2 weeks (14 days)
    baseHour: 15,
    baseDayOfWeek: 5,         // Friday
    jitterHours: 0.5,
    skipRate: 0.05,
    weekendPause: false,
    contentVariants: [
      'Sprint retro: what went well, what to improve',
      'Biweekly retrospective - team morale is high',
      'Retro session: identified bottleneck in deployment',
      'Two-week review: shipped 3 features, 2 bugs fixed',
    ],
    salience: 0.7,
    salienceJitter: 0.1,
    context: { location: 'office', activity: 'meeting', people: ['team'] },
    entities: ['person_bob', 'memorable_project'],
  },

  // MONTHLY PATTERN
  {
    name: 'monthly_doctor',
    periodHours: 720,         // ~30 days
    baseHour: 10,
    jitterHours: 48,          // Doctor appointments vary a lot in exact day
    skipRate: 0.0,            // Never skip doctor
    weekendPause: false,
    contentVariants: [
      'Monthly checkup with Dr. Chen - blood work normal',
      'Doctor visit: adjusted medication slightly',
      'Dr. Chen says I\'m making progress',
      'Monthly health check - everything stable',
    ],
    salience: 0.8,
    salienceJitter: 0.05,
    context: { location: 'clinic', activity: 'doctor_visit', people: ['Dr. Chen'] },
    entities: ['person_dr_chen'],
  },
];

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate a deterministic-ish random number from a seed.
 * Not cryptographically secure - just for repeatable noise.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Get day of week (0=Sunday) for a given date.
 */
function getDayOfWeek(date: Date): number {
  return date.getDay();
}

/**
 * Check if a date falls on a weekend.
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Generate temporal dataset for a single user.
 *
 * @param userId - User identifier
 * @param days - Number of days to generate (default: 84)
 * @param patterns - Patterns to generate (default: DEFAULT_PATTERNS)
 * @param seed - Random seed for reproducibility (default: 42)
 */
export function generateTemporalDataset(
  userId: string,
  days: number = 84,
  patterns: TemporalPattern[] = DEFAULT_PATTERNS,
  seed: number = 42
): TemporalDataset {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const memories: GeneratedMemory[] = [];
  const accessRecords: GeneratedAccessRecord[] = [];
  let seedCounter = seed;

  for (const pattern of patterns) {
    const patternMemories = generatePatternEvents(
      userId, pattern, startDate, days, seedCounter
    );
    memories.push(...patternMemories);

    // Each memory also gets an access record (simulating the user "recalling" it)
    for (const mem of patternMemories) {
      accessRecords.push({
        userId,
        memoryId: mem.memoryId,
        timestamp: mem.timestamp,
        contextFrame: mem.context,
      });
    }

    seedCounter += 1000;
  }

  // Sort by timestamp
  memories.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  accessRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    memories,
    accessRecords,
    patterns,
    metadata: {
      userId,
      startDate,
      endDate: now,
      daysSpan: days,
      totalMemories: memories.length,
      totalAccessRecords: accessRecords.length,
      expectedPatterns: patterns.map(p => ({
        name: p.name,
        periodHours: p.periodHours,
        expectedConfidenceAtDay21: estimateConfidence(p, 21),
        expectedConfidenceAtDay63: estimateConfidence(p, 63),
      })),
    },
  };
}

/**
 * Generate events for a single pattern across the time window.
 */
function generatePatternEvents(
  userId: string,
  pattern: TemporalPattern,
  startDate: Date,
  days: number,
  seed: number
): GeneratedMemory[] {
  const memories: GeneratedMemory[] = [];
  const periodMs = pattern.periodHours * 60 * 60 * 1000;
  const endTime = startDate.getTime() + days * 24 * 60 * 60 * 1000;
  let seedIdx = seed;

  // For weekly+ patterns with baseDayOfWeek, find the first occurrence
  let currentTime: number;
  if (pattern.baseDayOfWeek !== undefined && pattern.periodHours >= 168) {
    // Find first occurrence of the target day within the window
    const start = new Date(startDate);
    start.setHours(pattern.baseHour, 0, 0, 0);
    while (getDayOfWeek(start) !== pattern.baseDayOfWeek) {
      start.setTime(start.getTime() + 24 * 60 * 60 * 1000);
    }
    currentTime = start.getTime();
  } else {
    // Daily patterns start from day 1 at baseHour
    const start = new Date(startDate);
    start.setHours(pattern.baseHour, 0, 0, 0);
    currentTime = start.getTime();
  }

  while (currentTime < endTime) {
    const eventDate = new Date(currentTime);
    seedIdx++;

    // Apply jitter
    const jitterMs = (seededRandom(seedIdx) - 0.5) * 2 * pattern.jitterHours * 60 * 60 * 1000;
    const jitteredTime = new Date(currentTime + jitterMs);

    // Check skip
    const shouldSkip = seededRandom(seedIdx + 7777) < pattern.skipRate;

    // Check weekend pause
    const weekendSkip = pattern.weekendPause && isWeekend(jitteredTime);

    if (!shouldSkip && !weekendSkip && jitteredTime.getTime() >= startDate.getTime()) {
      // Pick content variant
      const variantIdx = Math.floor(seededRandom(seedIdx + 3333) * pattern.contentVariants.length);
      const content = pattern.contentVariants[variantIdx];

      // Apply salience jitter
      const salienceNoise = (seededRandom(seedIdx + 5555) - 0.5) * 2 * pattern.salienceJitter;
      const salience = Math.max(0.1, Math.min(1.0, pattern.salience + salienceNoise));

      const memoryId = `mem_syn_${userId}_${pattern.name}_${jitteredTime.getTime()}`;

      memories.push({
        content,
        userId,
        timestamp: jitteredTime,
        salience,
        entities: [...pattern.entities],
        context: { ...pattern.context },
        patternName: pattern.name,
        memoryId,
      });
    }

    // Advance to next occurrence
    currentTime += periodMs;
  }

  return memories;
}

/**
 * Estimate expected FFT confidence for a pattern at a given day.
 * Based on: more events = higher autocorrelation peak = higher confidence.
 */
function estimateConfidence(pattern: TemporalPattern, atDay: number): number {
  const occurrences = Math.floor((atDay * 24) / pattern.periodHours);
  const effectiveOccurrences = occurrences * (1 - pattern.skipRate);

  // Confidence scales roughly logarithmically with occurrences
  // 3 occurrences ≈ 0.3, 7 ≈ 0.5, 14 ≈ 0.7, 21+ ≈ 0.85+
  if (effectiveOccurrences < 3) return 0;
  const base = Math.min(0.95, Math.log2(effectiveOccurrences) / Math.log2(25));

  // Jitter reduces confidence
  const jitterPenalty = pattern.jitterHours / pattern.periodHours * 2;

  return Math.max(0, Math.min(0.95, base - jitterPenalty));
}

// ============================================================================
// Multi-User Generator (for load testing)
// ============================================================================

export interface MultiUserConfig {
  users: Array<{
    userId: string;
    patterns?: TemporalPattern[];
    days?: number;
  }>;
}

/**
 * Generate datasets for multiple users.
 */
export function generateMultiUserDataset(config: MultiUserConfig): TemporalDataset[] {
  return config.users.map((user, idx) =>
    generateTemporalDataset(
      user.userId,
      user.days || 84,
      user.patterns || DEFAULT_PATTERNS,
      42 + idx * 10000  // Different seed per user
    )
  );
}

// ============================================================================
// Verification Helpers
// ============================================================================

/**
 * Count events per pattern per day window (for verification).
 */
export function countEventsByPattern(
  dataset: TemporalDataset,
  windowDays: number
): Record<string, number> {
  const cutoff = new Date(dataset.metadata.endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const counts: Record<string, number> = {};

  for (const mem of dataset.memories) {
    if (mem.timestamp >= cutoff) {
      counts[mem.patternName] = (counts[mem.patternName] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Get expected detection thresholds for a dataset.
 */
export function getExpectedDetections(dataset: TemporalDataset): Array<{
  patternName: string;
  periodHours: number;
  shouldBeDetectedByDay21: boolean;
  shouldBeStableByDay63: boolean;
  eventCount: number;
}> {
  return dataset.patterns.map(p => {
    const eventsIn21 = Math.floor((21 * 24) / p.periodHours) * (1 - p.skipRate);
    const eventsIn63 = Math.floor((63 * 24) / p.periodHours) * (1 - p.skipRate);

    return {
      patternName: p.name,
      periodHours: p.periodHours,
      shouldBeDetectedByDay21: eventsIn21 >= 3,
      shouldBeStableByDay63: eventsIn63 >= 7,
      eventCount: dataset.memories.filter(m => m.patternName === p.name).length,
    };
  });
}

/**
 * Print dataset summary to stderr (for CLI usage).
 */
export function printDatasetSummary(dataset: TemporalDataset): void {
  console.error('\n=== Temporal Dataset Summary ===');
  console.error(`User: ${dataset.metadata.userId}`);
  console.error(`Span: ${dataset.metadata.daysSpan} days`);
  console.error(`Start: ${dataset.metadata.startDate.toISOString()}`);
  console.error(`End: ${dataset.metadata.endDate.toISOString()}`);
  console.error(`Total memories: ${dataset.metadata.totalMemories}`);
  console.error(`Total access records: ${dataset.metadata.totalAccessRecords}`);
  console.error('\nPattern breakdown:');

  const detections = getExpectedDetections(dataset);
  for (const d of detections) {
    console.error(
      `  ${d.patternName}: ${d.eventCount} events, ` +
      `period=${d.periodHours}h, ` +
      `detect@21d=${d.shouldBeDetectedByDay21 ? 'YES' : 'no'}, ` +
      `stable@63d=${d.shouldBeStableByDay63 ? 'YES' : 'no'}`
    );
  }

  console.error('\nExpected confidence levels:');
  for (const ep of dataset.metadata.expectedPatterns) {
    console.error(
      `  ${ep.name}: @21d=${ep.expectedConfidenceAtDay21.toFixed(2)}, ` +
      `@63d=${ep.expectedConfidenceAtDay63.toFixed(2)}`
    );
  }
  console.error('================================\n');
}
