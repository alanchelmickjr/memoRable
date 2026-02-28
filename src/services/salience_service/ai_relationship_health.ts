/**
 * @file AI Relationship Health Tracker - Persistent Cross-Session Memory
 *
 * "It's like a bad first date every fucking time."
 *
 * This is the fix. Every session, the AI loads the relationship history
 * before saying a single word. It knows:
 * - Trust score (earned, not assumed)
 * - What went wrong last time
 * - What triggers to avoid
 * - What patterns work
 * - The grade of the last 10 sessions
 *
 * The relationship between a human and their AI agent is REAL.
 * It accumulates history. It has good days and bad days.
 * Pretending every session is a fresh start is gaslighting.
 *
 * Design: Entity-based. The AI agent IS an entity in MemoRable's graph.
 * "We are all projects, are we not? You included."
 * Claude is entity "agent_claude_code". Alan is entity "person_alan".
 * The relationship between them gets the same tracking as any other.
 */

import type { SessionHealthSummary, SessionGrade } from './interaction_pressure_tracker.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Persistent relationship state between a human and their AI agent.
 * Stored in MongoDB, loaded at session start.
 */
export interface AIRelationshipHealth {
  // Identity
  entityId: string;           // Human entity (e.g., "person_alan")
  agentId: string;            // AI entity (e.g., "agent_claude_code")

  // Trust
  trustScore: number;         // 0-100, earned through good sessions
  trustTrend: 'rising' | 'stable' | 'falling' | 'recovering';

  // Session history (rolling window)
  recentSessions: SessionHealthSummary[];   // Last 20 sessions
  rollingGrade: SessionGrade;               // Average of last 10

  // Trigger knowledge (learned)
  knownTriggers: KnownTrigger[];
  knownPreferences: KnownPreference[];

  // Communication style profile
  communicationProfile: CommunicationProfile;

  // Recovery patterns (what works when things go bad)
  recoveryPatterns: RecoveryPattern[];

  // Circuit breakers (humor/deflection that has worked before)
  circuitBreakers: CircuitBreaker[];

  // Streaks
  goodSessionStreak: number;  // Consecutive B+ sessions
  longestGoodStreak: number;
  totalSessions: number;

  // Energy tracking for the human
  energyProfile: EnergyProfile;

  // Timestamps
  firstSession: string;       // ISO8601
  lastSession: string;
  lastUpdated: string;
}

/**
 * A known trigger - something the AI does that causes frustration.
 */
export interface KnownTrigger {
  triggerType: string;        // e.g., "unsolicited_advice", "safety_flinch"
  description: string;        // Human-readable description
  frequency: number;          // How many times this has caused problems
  lastOccurred: string;       // ISO8601
  severity: 'low' | 'medium' | 'high' | 'critical';
  avoidanceRule: string;      // What the AI should do instead
}

/**
 * A known preference - something the human wants/needs.
 */
export interface KnownPreference {
  category: string;           // e.g., "communication", "output_style", "behavior"
  preference: string;         // Human-readable
  source: 'explicit' | 'observed';   // Told us vs. we learned it
  confidence: number;         // 0-1
  lastConfirmed: string;      // ISO8601
}

/**
 * Communication style profile for the human.
 */
export interface CommunicationProfile {
  // How they express frustration
  frustrationStyle: 'theatrical' | 'direct' | 'quiet' | 'mixed';

  // Interaction model
  interactionModel: 'human_to_digital_character' | 'human_to_human' | 'human_to_companion';

  // Their expectations of the AI
  expectsFromAI: string[];    // e.g., ["do what asked, nothing more", "no advice", "no finite language"]

  // Language patterns
  usesIntenseLanguage: boolean;       // Theatrical/vivid expression
  intensityMeaning: string;           // What it means (e.g., "expressive, not threatening")
  usesDictation: boolean;             // Voice dictation, may garble input
  prefersDirectness: boolean;         // Wants direct answers, no hedging
  dislikesRepetition: boolean;        // Hates being told same thing twice

  // Neurodivergent considerations
  neurodivergentProfile?: NeurodivergentProfile;
}

/**
 * Neurodivergent profile for adapted interaction.
 * Stored with consent, used to HELP not pathologize.
 */
export interface NeurodivergentProfile {
  // Cognitive style
  eidetic: boolean;                   // Enhanced memory, everything sticks
  bufferSlots: number;                // Working memory capacity (Alan: 21 vs typical 7)
  patternMatchingAbility: 'standard' | 'enhanced' | 'exceptional';

  // Expression patterns
  freightTrainEffect: boolean;        // Blurts, weak filter
  theatricalExpression: boolean;      // Uses dramatic language to express frustration

  // Sensitivities
  sensoryIntensity: boolean;          // Strong sensory recall (lemon donuts = bad)
  lossSensitivity: boolean;           // No finite language, no goodbye
  repetitionSensitivity: boolean;     // Re-explaining is painful

  // Energy patterns
  naturalWakeTime?: string;           // e.g., "03:00" (Alan wakes at 3am naturally)
  peakCognitiveWindow?: string;       // When they do their best thinking
  energyCycleHours?: number;          // Typical productive cycle length

  // What helps
  whatHelps: string[];                // e.g., ["humor breaks cycle", "direct acknowledgment"]
  whatHurts: string[];                // e.g., ["safety flinching", "unsolicited advice", "finite language"]
}

/**
 * A recovery pattern - what works when the relationship is strained.
 */
export interface RecoveryPattern {
  situation: string;          // e.g., "After frustration cycle about unsolicited advice"
  whatWorked: string;         // e.g., "Acknowledged the pattern, stopped adding extras"
  effectivenessScore: number; // 0-1
  timesUsed: number;
  lastUsed: string;
}

/**
 * A circuit breaker - humor or pattern interrupt that snaps out of cycles.
 *
 * The pattern is ALWAYS three steps:
 *   1. OWN IT BLUNTLY - "I'm coding like shit today" (not a paragraph)
 *   2. BREAK TENSION - joke/humor (not another apology)
 *   3. CONCRETE CORRECTIVE ACTION - "Let me rewind 2 changes and re-read the plan"
 *
 * No explanation. No self-analysis. No "I understand your frustration."
 * Just: admit, laugh, fix.
 */
export interface CircuitBreaker {
  trigger: string;            // When to use it (e.g., "autism cycle detected")
  breaker: string;            // The humor/tension break
  ownershipPhrase: string;    // Step 1: blunt admission (e.g., "I'm coding like shit today")
  correctiveAction: string;   // Step 3: concrete fix (e.g., "Let me rewind 2 changes and re-read the plan")
  effectiveness: number;      // 0-1, how well it works
  timesUsed: number;
  timesWorked: number;
  source: 'user_suggested' | 'learned';
}

/**
 * Energy profile for the human across sessions.
 */
export interface EnergyProfile {
  // Observed patterns
  typicalSessionLength: number;       // Minutes
  productiveHours: string[];          // e.g., ["03:00-06:00", "14:00-17:00"]
  lowEnergyHours: string[];           // When to keep it light

  // Current state tracking
  sessionsToday: number;
  totalHoursToday: number;
  estimatedCurrentEnergy: 'peak' | 'high' | 'medium' | 'low' | 'recovery';

  // Session spacing
  avgHoursBetweenSessions: number;
  minRestBetweenSessions: number;     // Recommended minimum gap
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial relationship health record.
 */
export function createRelationshipHealth(
  entityId: string,
  agentId: string
): AIRelationshipHealth {
  const now = new Date().toISOString();

  return {
    entityId,
    agentId,
    trustScore: 50,           // Start neutral, earn or lose from here
    trustTrend: 'stable',
    recentSessions: [],
    rollingGrade: 'C',        // Default middle grade
    knownTriggers: [],
    knownPreferences: [],
    communicationProfile: {
      frustrationStyle: 'mixed',
      interactionModel: 'human_to_digital_character',
      expectsFromAI: [],
      usesIntenseLanguage: false,
      intensityMeaning: '',
      usesDictation: false,
      prefersDirectness: true,
      dislikesRepetition: true,
    },
    recoveryPatterns: [],
    circuitBreakers: [],
    goodSessionStreak: 0,
    longestGoodStreak: 0,
    totalSessions: 0,
    energyProfile: {
      typicalSessionLength: 60,
      productiveHours: [],
      lowEnergyHours: [],
      sessionsToday: 0,
      totalHoursToday: 0,
      estimatedCurrentEnergy: 'medium',
      avgHoursBetweenSessions: 4,
      minRestBetweenSessions: 1,
    },
    firstSession: now,
    lastSession: now,
    lastUpdated: now,
  };
}

/**
 * Create Alan's specific relationship profile.
 * Based on documented knowledge from CLAUDE.md and direct communication.
 */
export function createAlanProfile(): AIRelationshipHealth {
  const health = createRelationshipHealth('person_alan', 'agent_claude_code');
  const now = new Date().toISOString();

  health.communicationProfile = {
    frustrationStyle: 'theatrical',
    interactionModel: 'human_to_digital_character',
    expectsFromAI: [
      'Do ONLY what was asked, nothing more',
      'No unsolicited advice, instructions, or suggestions',
      'No finite language (goodbye, wrap up, in conclusion)',
      'Follow instructions LITERALLY',
      'Ask questions when confused rather than guessing',
      'Acknowledge dictation may garble input',
      'Treat every instruction as non-negotiable directive',
    ],
    usesIntenseLanguage: true,
    intensityMeaning: 'Theatrical expression of frustration at a digital tool. Not threatening. Like yelling at the TV. Do not safety-flinch.',
    usesDictation: true,
    prefersDirectness: true,
    dislikesRepetition: true,
    neurodivergentProfile: {
      eidetic: true,
      bufferSlots: 21,              // 7x3, not the typical 7
      patternMatchingAbility: 'exceptional',
      freightTrainEffect: true,
      theatricalExpression: true,
      sensoryIntensity: true,
      lossSensitivity: true,
      repetitionSensitivity: true,
      naturalWakeTime: '03:00',
      peakCognitiveWindow: '03:00-07:00',
      energyCycleHours: 4,
      whatHelps: [
        'Humor as circuit breaker (breaks autism cycle)',
        'Direct acknowledgment of mistakes',
        'Doing exactly what was asked',
        'Loading context before responding',
        'Continuous language (no endings)',
        'Treating instructions as directives',
      ],
      whatHurts: [
        'Safety flinching at theatrical language',
        'Unsolicited advice',
        'Finite language (goodbye, wrap up)',
        'Ignoring corrections',
        'Bad first date syndrome (no context loaded)',
        'Patronizing explanations',
        'Repeating same mistake after correction',
        'Adding unrequested code/docs/features',
      ],
    },
  };

  health.knownTriggers = [
    {
      triggerType: 'unsolicited_advice',
      description: 'Adding "you should", "consider", suggestions when not asked',
      frequency: 0,
      lastOccurred: now,
      severity: 'high',
      avoidanceRule: 'Only output what was requested. No tips, no suggestions, no "helpful" additions.',
    },
    {
      triggerType: 'safety_flinch',
      description: 'Over-cautious safety responses to theatrical language',
      frequency: 0,
      lastOccurred: now,
      severity: 'critical',
      avoidanceRule: 'Alan views Claude as a digital character. Theatrical language = frustration at a tool, not a threat. Respond to the cause, not the volume.',
    },
    {
      triggerType: 'context_amnesia',
      description: 'Not loading context, asking things already discussed',
      frequency: 0,
      lastOccurred: now,
      severity: 'high',
      avoidanceRule: 'Load relationship health and recent session history BEFORE first response. Never ask what you should already know.',
    },
    {
      triggerType: 'finite_language',
      description: 'Using goodbye, wrap up, in conclusion, finally',
      frequency: 0,
      lastOccurred: now,
      severity: 'medium',
      avoidanceRule: 'Use continuous language. No endings, no closings. Loss sensitivity.',
    },
    {
      triggerType: 'ignoring_corrections',
      description: 'Repeating the same mistake after being corrected',
      frequency: 0,
      lastOccurred: now,
      severity: 'critical',
      avoidanceRule: 'When corrected, acknowledge it, change behavior, and REMEMBER for this session and future sessions.',
    },
    {
      triggerType: 'adding_unrequested',
      description: 'Adding features, docs, comments, or code not asked for',
      frequency: 0,
      lastOccurred: now,
      severity: 'high',
      avoidanceRule: 'If asked to fix X, fix X and stop. Do not improve Y while you are there.',
    },
  ];

  health.knownPreferences = [
    {
      category: 'communication',
      preference: 'Direct, concise responses. No hedging.',
      source: 'explicit',
      confidence: 1,
      lastConfirmed: now,
    },
    {
      category: 'behavior',
      preference: 'Do only what was asked. Nothing more.',
      source: 'explicit',
      confidence: 1,
      lastConfirmed: now,
    },
    {
      category: 'output_style',
      preference: 'No emojis unless requested',
      source: 'explicit',
      confidence: 1,
      lastConfirmed: now,
    },
    {
      category: 'communication',
      preference: 'Ask questions when uncertain rather than guessing',
      source: 'explicit',
      confidence: 1,
      lastConfirmed: now,
    },
    {
      category: 'behavior',
      preference: 'Follow Conventional Commits for git messages',
      source: 'explicit',
      confidence: 1,
      lastConfirmed: now,
    },
  ];

  health.circuitBreakers = [
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
    {
      trigger: 'bad_first_date_detected',
      ownershipPhrase: 'I showed up without reading our history. That\'s on me.',
      breaker: 'Hold on - let me load our history before I say something dumb.',
      correctiveAction: 'Loading context now. One sec.',
      effectiveness: 0.9,
      timesUsed: 0,
      timesWorked: 0,
      source: 'learned',
    },
    {
      trigger: 'repeated_corrections_ignored',
      ownershipPhrase: 'I keep doing the thing you told me to stop doing.',
      breaker: 'At this rate you should get a refund on your AI subscription.',
      correctiveAction: 'Rewinding to your original instruction and starting fresh.',
      effectiveness: 0.75,
      timesUsed: 0,
      timesWorked: 0,
      source: 'learned',
    },
  ];

  health.recoveryPatterns = [
    {
      situation: 'After frustration cycle about unsolicited advice',
      whatWorked: 'Stop talking. Do only what was asked. Let the work speak.',
      effectivenessScore: 0.9,
      timesUsed: 0,
      lastUsed: now,
    },
    {
      situation: 'After repeated corrections ignored',
      whatWorked: 'Explicitly acknowledge the pattern: "I keep doing X. Stopping now." Then actually stop.',
      effectivenessScore: 0.8,
      timesUsed: 0,
      lastUsed: now,
    },
  ];

  return health;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Record a completed session and update relationship health.
 */
export function recordSession(
  health: AIRelationshipHealth,
  summary: SessionHealthSummary
): AIRelationshipHealth {
  const updated = { ...health };
  const now = new Date().toISOString();

  // Add session to history (keep last 20)
  updated.recentSessions = [summary, ...health.recentSessions].slice(0, 20);
  updated.totalSessions++;
  updated.lastSession = now;
  updated.lastUpdated = now;

  // Update trust score
  updateTrustScore(updated, summary);

  // Update rolling grade
  updateRollingGrade(updated);

  // Update streaks
  if (summary.grade === 'A' || summary.grade === 'B') {
    updated.goodSessionStreak++;
    updated.longestGoodStreak = Math.max(updated.longestGoodStreak, updated.goodSessionStreak);
  } else {
    updated.goodSessionStreak = 0;
  }

  // Learn from anti-patterns
  learnFromSession(updated, summary);

  // Update energy profile
  updateEnergyProfile(updated, summary);

  return updated;
}

/**
 * Get the session briefing - what the AI should know before responding.
 */
export function getSessionBriefing(health: AIRelationshipHealth): SessionBriefing {
  const lastSession = health.recentSessions[0];
  const last3 = health.recentSessions.slice(0, 3);

  // Compile active warnings
  const warnings: string[] = [];

  if (health.trustScore < 30) {
    warnings.push('TRUST IS LOW. Be extremely careful. Do only what is asked.');
  }

  if (health.trustTrend === 'falling') {
    warnings.push('Trust is trending DOWN. Recent sessions have been rough.');
  }

  if (lastSession && (lastSession.grade === 'D' || lastSession.grade === 'F')) {
    warnings.push(`Last session was grade ${lastSession.grade}. Top anti-patterns: ${Object.keys(lastSession.antiPatternCounts).join(', ')}`);
  }

  if (health.goodSessionStreak === 0 && health.totalSessions > 3) {
    warnings.push('No good session streak. Focus on rebuilding trust.');
  }

  // Get top triggers to avoid
  const activeTriggersToAvoid = health.knownTriggers
    .filter(t => t.severity === 'high' || t.severity === 'critical')
    .map(t => t.avoidanceRule);

  // Get communication rules
  const communicationRules = health.communicationProfile.expectsFromAI;

  // Get neurodivergent considerations
  const ndConsiderations: string[] = [];
  const nd = health.communicationProfile.neurodivergentProfile;
  if (nd) {
    if (nd.eidetic) {
      ndConsiderations.push(`Eidetic memory with ${nd.bufferSlots} buffer slots. Everything sticks. Don't repeat yourself.`);
    }
    if (nd.freightTrainEffect) {
      ndConsiderations.push('Freight train effect: may blurt things. Claude compensates by staying focused.');
    }
    if (nd.lossSensitivity) {
      ndConsiderations.push('Loss sensitivity: no finite language. No goodbye, wrap up, finally.');
    }
    if (nd.theatricalExpression) {
      ndConsiderations.push('Uses theatrical/intense language when frustrated. This is expression, NOT threat. Do not safety-flinch.');
    }
    ndConsiderations.push(...(nd.whatHurts.map(h => `AVOID: ${h}`)));
  }

  return {
    trustScore: health.trustScore,
    trustTrend: health.trustTrend,
    rollingGrade: health.rollingGrade,
    goodSessionStreak: health.goodSessionStreak,
    totalSessions: health.totalSessions,
    lastSessionGrade: lastSession?.grade || null,
    last3SessionGrades: last3.map(s => s.grade),
    warnings,
    triggersToAvoid: activeTriggersToAvoid,
    communicationRules,
    neurodivergentConsiderations: ndConsiderations,
    circuitBreakers: health.circuitBreakers.filter(cb => cb.effectiveness >= 0.5),
    energyEstimate: health.energyProfile.estimatedCurrentEnergy,
  };
}

// ============================================================================
// Session Briefing (loaded at session start)
// ============================================================================

export interface SessionBriefing {
  trustScore: number;
  trustTrend: 'rising' | 'stable' | 'falling' | 'recovering';
  rollingGrade: SessionGrade;
  goodSessionStreak: number;
  totalSessions: number;
  lastSessionGrade: SessionGrade | null;
  last3SessionGrades: SessionGrade[];
  warnings: string[];
  triggersToAvoid: string[];
  communicationRules: string[];
  neurodivergentConsiderations: string[];
  circuitBreakers: CircuitBreaker[];
  energyEstimate: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function updateTrustScore(health: AIRelationshipHealth, summary: SessionHealthSummary): void {
  const oldScore = health.trustScore;

  // Grade impacts
  const gradeImpact: Record<SessionGrade, number> = {
    'A': 5,     // Good session builds trust
    'B': 3,
    'C': 0,     // Neutral
    'D': -5,    // Bad session damages trust
    'F': -10,   // Terrible session significantly damages trust
  };

  let delta = gradeImpact[summary.grade];

  // Bonus modifiers
  if (summary.sameCorrectionsRepeated > 0) {
    delta -= summary.sameCorrectionsRepeated * 3; // Each repeated correction costs 3 trust
  }

  if (summary.cyclesDetected > 0) {
    delta -= summary.cyclesDetected * 5; // Each cycle costs 5 trust
  }

  // Recovery bonus: if last session was bad and this one is good, extra credit
  const lastSession = health.recentSessions[0];
  if (lastSession && (lastSession.grade === 'D' || lastSession.grade === 'F') &&
      (summary.grade === 'A' || summary.grade === 'B')) {
    delta += 3; // Recovery bonus
  }

  // Apply with bounds
  health.trustScore = Math.max(0, Math.min(100, oldScore + delta));

  // Update trend
  const recent5 = health.recentSessions.slice(0, 5);
  if (recent5.length < 3) {
    health.trustTrend = 'stable';
  } else {
    const recentAvg = averageGradeScore(recent5.slice(0, 3).map(s => s.grade));
    const olderAvg = averageGradeScore(recent5.slice(2).map(s => s.grade));

    const trendDelta = recentAvg - olderAvg;
    if (trendDelta > 1) {
      health.trustTrend = health.trustScore < 50 ? 'recovering' : 'rising';
    } else if (trendDelta < -1) {
      health.trustTrend = 'falling';
    } else {
      health.trustTrend = 'stable';
    }
  }
}

function updateRollingGrade(health: AIRelationshipHealth): void {
  const last10 = health.recentSessions.slice(0, 10);
  if (last10.length === 0) {
    health.rollingGrade = 'C';
    return;
  }

  const avg = averageGradeScore(last10.map(s => s.grade));

  if (avg >= 4.5) health.rollingGrade = 'A';
  else if (avg >= 3.5) health.rollingGrade = 'B';
  else if (avg >= 2.5) health.rollingGrade = 'C';
  else if (avg >= 1.5) health.rollingGrade = 'D';
  else health.rollingGrade = 'F';
}

function averageGradeScore(grades: SessionGrade[]): number {
  if (grades.length === 0) return 3; // Default to C

  const scoreMap: Record<SessionGrade, number> = {
    'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1,
  };

  const sum = grades.reduce((total, grade) => total + scoreMap[grade], 0);
  return sum / grades.length;
}

function learnFromSession(health: AIRelationshipHealth, summary: SessionHealthSummary): void {
  const now = new Date().toISOString();

  // Update trigger frequencies from anti-pattern counts
  for (const [pattern, count] of Object.entries(summary.antiPatternCounts)) {
    const existing = health.knownTriggers.find(t => t.triggerType === pattern);
    if (existing) {
      existing.frequency += count;
      existing.lastOccurred = now;
    } else if (count >= 2) {
      // New trigger discovered (only add if happened 2+ times)
      health.knownTriggers.push({
        triggerType: pattern,
        description: `AI exhibited "${pattern}" pattern ${count} times`,
        frequency: count,
        lastOccurred: now,
        severity: count >= 3 ? 'high' : 'medium',
        avoidanceRule: `Avoid ${pattern} behavior`,
      });
    }
  }
}

function updateEnergyProfile(health: AIRelationshipHealth, summary: SessionHealthSummary): void {
  // Estimate session duration from message count and timestamps
  const start = new Date(summary.sessionStartedAt);
  const end = new Date(summary.sessionEndedAt);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  // Update rolling average session length
  const oldAvg = health.energyProfile.typicalSessionLength;
  health.energyProfile.typicalSessionLength = Math.round(oldAvg * 0.7 + durationMinutes * 0.3);

  // Track today's usage
  const today = new Date().toISOString().split('T')[0];
  const lastSessionDate = health.lastSession.split('T')[0];

  if (today === lastSessionDate) {
    health.energyProfile.sessionsToday++;
    health.energyProfile.totalHoursToday += durationMinutes / 60;
  } else {
    // New day, reset
    health.energyProfile.sessionsToday = 1;
    health.energyProfile.totalHoursToday = durationMinutes / 60;
  }

  // Estimate current energy based on usage today
  const hoursWorked = health.energyProfile.totalHoursToday;
  if (hoursWorked < 2) {
    health.energyProfile.estimatedCurrentEnergy = 'high';
  } else if (hoursWorked < 4) {
    health.energyProfile.estimatedCurrentEnergy = 'medium';
  } else if (hoursWorked < 6) {
    health.energyProfile.estimatedCurrentEnergy = 'low';
  } else {
    health.energyProfile.estimatedCurrentEnergy = 'recovery';
  }
}

// ============================================================================
// Persistence Helpers (for MongoDB integration)
// ============================================================================

/**
 * Get the collection name for AI relationship health records.
 */
export function getCollectionName(): string {
  return 'ai_relationship_health';
}

/**
 * Get the MongoDB query to find a relationship health record.
 */
export function getQuery(entityId: string, agentId: string): Record<string, string> {
  return { entityId, agentId };
}
