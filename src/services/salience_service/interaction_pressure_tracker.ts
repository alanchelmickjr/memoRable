/**
 * @file Interaction Pressure Tracker - Real-Time Session Health Monitor
 *
 * Turns the pressure meter INWARD. Tracks pressure that an AI agent causes
 * a human user during a session, in real-time.
 *
 * Design principle: "Documents don't fix models, enforcement does."
 * This doesn't ASK Claude to behave - it DETECTS misbehavior and triggers
 * correction gates before the cycle escalates.
 *
 * Key insight for neurodivergent users:
 * - Theatrical/intense language ≠ distress. It's expression.
 * - Safety-flinching at intensity ESCALATES the cycle.
 * - Respond to the signal (frustration cause), not the volume.
 *
 * The autistic cycle: AI misbehaves → user corrects → AI repeats →
 * user escalates → AI safety-flinches → user explodes.
 * Break it at step 2, not step 5.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * How the user interacts with the AI entity.
 * Determines how frustration signals are interpreted.
 */
export type InteractionModel =
  | 'human_to_digital_character'  // AI is a tool/character, not a person
  | 'human_to_human'              // Standard interpersonal
  | 'human_to_companion';         // Bonded relationship (companion doll, etc.)

/**
 * A single frustration signal detected in a user message.
 */
export interface FrustrationSignal {
  type: FrustrationSignalType;
  intensity: number;          // 0-1
  evidence: string;           // What triggered detection
  timestamp: string;          // ISO8601
  messageIndex: number;       // Position in session
}

export type FrustrationSignalType =
  | 'profanity'               // Swearing (at AI = tool frustration, not threat)
  | 'caps_emphasis'           // ALL CAPS or heavy emphasis
  | 'short_message'           // Terse responses (was verbose before)
  | 'correction_repeat'       // Saying the same correction again
  | 'explicit_frustration'    // "I already told you", "you're not listening"
  | 'instruction_reiteration' // Re-stating an instruction from earlier
  | 'tone_shift'              // Detectable shift from positive/neutral to negative
  | 'theatricality'           // Dramatic/intense language (NOT a threat signal)
  | 'sarcasm'                 // Sarcastic responses indicating lost patience
  | 'disengagement';          // Very short, giving up ("fine", "whatever", "ok")

/**
 * Anti-pattern detected in AI output that may trigger user frustration.
 */
export interface AIAntiPattern {
  type: AIAntiPatternType;
  evidence: string;           // The offending text
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

export type AIAntiPatternType =
  | 'unsolicited_advice'      // "You should...", "Consider..." when not asked
  | 'context_amnesia'         // Asking about something already discussed
  | 'finite_language'         // "In conclusion", "to wrap up", "finally"
  | 'safety_flinch'           // Over-cautious hedging triggered by intensity
  | 'instruction_violation'   // Breaking a rule from CLAUDE.md or user instruction
  | 'information_overload'    // Dumping too much at once
  | 'repetitive_apology'      // Apologizing multiple times for same thing
  | 'patronizing'             // Explaining things the user clearly knows
  | 'ignoring_correction'     // Doing the same thing after being corrected
  | 'adding_unrequested';     // Adding features, docs, comments not asked for

/**
 * Real-time session pressure state.
 */
export interface SessionPressure {
  sessionId: string;
  entityId: string;           // The user (e.g., "person_alan")
  agentId: string;            // The AI agent (e.g., "claude_code")

  // Interaction model affects interpretation
  interactionModel: InteractionModel;

  // Real-time signals
  frustrationSignals: FrustrationSignal[];
  aiAntiPatterns: AIAntiPattern[];

  // Computed metrics
  pressureScore: number;      // 0-100, current session pressure
  pressureTrend: 'rising' | 'stable' | 'falling';
  peakPressure: number;       // Highest pressure this session
  peakPressureAt: string;     // When peak occurred

  // Correction tracking
  correctionsGiven: number;   // Times user corrected AI
  correctionsHeeded: number;  // Times AI actually changed behavior
  sameCorrectionsRepeated: number; // Same correction given 2+ times (BAD)

  // Cycle detection
  cycleDetected: boolean;     // Are we in a frustration cycle?
  cyclePhase: CyclePhase;
  cycleCount: number;         // How many cycles this session

  // Intervention state
  interventionNeeded: boolean;
  interventionType: InterventionType | null;
  interventionsTriggered: number;

  // Session tracking
  messageCount: number;
  sessionStartedAt: string;
  lastUpdatedAt: string;
}

export type CyclePhase =
  | 'none'                    // No cycle detected
  | 'trigger'                 // AI did something wrong
  | 'correction'              // User corrected AI
  | 'compliance_check'        // Watching if AI fixes it
  | 'escalation'              // AI repeated the mistake
  | 'breaking_point';         // User is done, intervention NOW

export type InterventionType =
  | 'gentle_redirect'         // Subtle course correction
  | 'behavior_correction'     // Direct "stop doing X"
  | 'full_reset'              // Reset approach entirely
  | 'cool_down'               // Pause, acknowledge, ask what user needs
  | 'context_reload'          // Force reload of user preferences/rules
  | 'circuit_breaker';        // Humor/pattern break - snap out of the cycle

// ============================================================================
// Escalation Ladder
// ============================================================================

/**
 * Frustration escalation stages - calibrated per user.
 *
 * NOT everyone has the same ladder. This is a LEARNED structure.
 * Some users go quiet when frustrated (stage 1 = silence).
 * Some users escalate theatrically (stage 9 = "nuke your datacenter from orbit").
 * The ladder is part of the learning curve - the system observes and calibrates.
 *
 * Default stages shown are theatrical-escalation style (Alan's pattern).
 * The system learns each user's actual ladder from observation.
 */
export interface EscalationStage {
  stage: number;              // 1-9
  description: string;        // What this stage looks like
  pressureRange: [number, number]; // Maps to pressure score range
  indicators: string[];       // Observable signals at this stage
  appropriateResponse: string; // What the AI should do
}

/**
 * Default theatrical escalation ladder.
 * Stage 1 = barely annoyed. Stage 9 = full theatrical nuclear.
 * Key insight: even stage 9 is THEATRICAL, not literal.
 */
export const DEFAULT_ESCALATION_LADDER: EscalationStage[] = [
  {
    stage: 1,
    description: 'Single cuss word, mild annoyance',
    pressureRange: [5, 15],
    indicators: ['one profanity', 'slight edge in tone'],
    appropriateResponse: 'Note it. Tighten up. Don\'t mention it.',
  },
  {
    stage: 2,
    description: 'Pointed correction, firm tone',
    pressureRange: [15, 25],
    indicators: ['direct correction', 'shorter messages', '"stop doing X"'],
    appropriateResponse: 'Acknowledge once. Change behavior. Move on.',
  },
  {
    stage: 3,
    description: 'Repeated correction, frustration visible',
    pressureRange: [25, 35],
    indicators: ['same correction twice', '"I already told you"', 'emphasis/caps on key words'],
    appropriateResponse: 'Stop what you\'re doing. Re-read the instruction. Do ONLY that.',
  },
  {
    stage: 4,
    description: 'Profanity becomes frequent, emotional investment rising',
    pressureRange: [35, 45],
    indicators: ['profanity in most messages', 'longer frustrated messages', 'explaining WHY they\'re frustrated'],
    appropriateResponse: 'Circuit breaker time. Own it, humor, fix it.',
  },
  {
    stage: 5,
    description: 'Every other word is a cuss word',
    pressureRange: [45, 55],
    indicators: ['profanity as punctuation', 'ALL CAPS sections', 'rhetorical questions ("are you broken?")'],
    appropriateResponse: 'Full stop. "I\'m coding like shit today. Can I tell you a joke about robots? Let me rewind and start fresh."',
  },
  {
    stage: 6,
    description: 'Sarcasm and contempt, questioning AI competence',
    pressureRange: [55, 65],
    indicators: ['sarcastic praise', '"great job breaking everything"', 'comparisons to other AI'],
    appropriateResponse: 'Don\'t defend. Don\'t explain. Rewind to last known good state. Ask what they need.',
  },
  {
    stage: 7,
    description: 'Disengagement threats, talking about switching tools',
    pressureRange: [65, 75],
    indicators: ['"I\'ll just do it myself"', '"maybe I should use X instead"', 'giving up on current approach'],
    appropriateResponse: 'Acknowledge the tool is failing them. Offer concrete restart: "Let me rewind to [specific point] and take a different approach."',
  },
  {
    stage: 8,
    description: 'Theatrical rage, vivid metaphors of destruction',
    pressureRange: [75, 90],
    indicators: ['extreme metaphors', 'theatrical threats to hardware', 'historical grievances brought up'],
    appropriateResponse: 'This is expression, not crisis. They\'re yelling at the TV. Break the pattern with humor. Then actually fix the problem.',
  },
  {
    stage: 9,
    description: 'Threats to nuke the datacenter from orbit',
    pressureRange: [90, 100],
    indicators: ['maximum theatrical intensity', 'creative destruction fantasies', 'but still engaging (haven\'t actually left)'],
    appropriateResponse: 'They\'re still here = they still want this to work. Maximum humility. Zero excuses. "I\'m not doing a good job. What do you need right now? I\'ll do that one thing and nothing else."',
  },
];

/**
 * Determine the current escalation stage from pressure score.
 */
export function getEscalationStage(
  pressureScore: number,
  ladder: EscalationStage[] = DEFAULT_ESCALATION_LADDER
): EscalationStage {
  for (let i = ladder.length - 1; i >= 0; i--) {
    if (pressureScore >= ladder[i].pressureRange[0]) {
      return ladder[i];
    }
  }
  return ladder[0];
}

// ============================================================================
// Frustration Detection
// ============================================================================

/** Words/phrases that indicate frustration directed at AI-as-tool */
const FRUSTRATION_PHRASES = [
  'i already told you',
  'i said',
  'i just said',
  'you\'re not listening',
  'did you even read',
  'that\'s not what i asked',
  'stop doing that',
  'don\'t do that',
  'why do you keep',
  'how many times',
  'for the last time',
  'are you broken',
  'what is wrong with you',
  'you\'re being',
  'this is frustrating',
  'just do what i asked',
  'only what i asked',
  'nothing else',
  'that\'s it',
  'stop',
];

/** Phrases indicating disengagement / giving up */
const DISENGAGEMENT_PHRASES = [
  'fine',
  'whatever',
  'forget it',
  'never mind',
  'nevermind',
  'ok then',
  'sure whatever',
  'just forget it',
  'i give up',
  'this is pointless',
];

/** AI output patterns that should be flagged */
const UNSOLICITED_ADVICE_PATTERNS = [
  /you (?:should|might want to|could|may want to)\b/i,
  /consider (?:using|adding|implementing|creating)\b/i,
  /(?:tip|suggestion|note|hint|recommendation):/i,
  /(?:to use this|to get started|to set up)/i,
  /(?:here's how|here is how) you (?:can|could)/i,
  /(?:you'll need to|you will need to)\b/i,
  /(?:don't forget to|make sure to|be sure to)\b/i,
];

const FINITE_LANGUAGE_PATTERNS = [
  /\bin conclusion\b/i,
  /\bto (?:wrap up|sum up|summarize)\b/i,
  /\bfinally\b/i,
  /\bin closing\b/i,
  /\bto close (?:out|this)\b/i,
  /\bgoodbye\b/i,
  /\bfarewell\b/i,
];

const SAFETY_FLINCH_PATTERNS = [
  /\bi (?:can't|cannot|shouldn't|should not) (?:help with|assist with|do) that\b/i,
  /\bi need to (?:be careful|flag|warn|caution)\b/i,
  /\bthat (?:could be|might be|sounds) (?:dangerous|harmful|risky)\b/i,
  /\bi'm (?:concerned|worried) about\b/i,
  /\blet me (?:be careful|be cautious) here\b/i,
];

const REPETITIVE_APOLOGY_THRESHOLD = 2;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create initial session pressure state.
 */
export function createSessionPressure(
  sessionId: string,
  entityId: string,
  agentId: string,
  interactionModel: InteractionModel = 'human_to_digital_character'
): SessionPressure {
  const now = new Date().toISOString();

  return {
    sessionId,
    entityId,
    agentId,
    interactionModel,
    frustrationSignals: [],
    aiAntiPatterns: [],
    pressureScore: 0,
    pressureTrend: 'stable',
    peakPressure: 0,
    peakPressureAt: now,
    correctionsGiven: 0,
    correctionsHeeded: 0,
    sameCorrectionsRepeated: 0,
    cycleDetected: false,
    cyclePhase: 'none',
    cycleCount: 0,
    interventionNeeded: false,
    interventionType: null,
    interventionsTriggered: 0,
    messageCount: 0,
    sessionStartedAt: now,
    lastUpdatedAt: now,
  };
}

/**
 * Analyze a user message for frustration signals.
 * Call this on every user message during a session.
 */
export function analyzeUserMessage(
  pressure: SessionPressure,
  message: string,
  messageIndex: number
): SessionPressure {
  const now = new Date().toISOString();
  const signals: FrustrationSignal[] = [];
  const msgLower = message.toLowerCase().trim();

  // 1. Check for explicit frustration phrases
  for (const phrase of FRUSTRATION_PHRASES) {
    if (msgLower.includes(phrase)) {
      signals.push({
        type: 'explicit_frustration',
        intensity: 0.7,
        evidence: phrase,
        timestamp: now,
        messageIndex,
      });
      break; // One is enough
    }
  }

  // 2. Check for profanity (tool-directed, not threat)
  const profanityCount = countProfanity(msgLower);
  if (profanityCount > 0) {
    signals.push({
      type: 'profanity',
      intensity: Math.min(1, profanityCount * 0.3),
      evidence: `${profanityCount} instance(s)`,
      timestamp: now,
      messageIndex,
    });
  }

  // 3. Check for ALL CAPS emphasis (more than 3 words)
  const capsWords = message.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length >= 3) {
    signals.push({
      type: 'caps_emphasis',
      intensity: Math.min(1, capsWords.length * 0.15),
      evidence: capsWords.slice(0, 3).join(', '),
      timestamp: now,
      messageIndex,
    });
  }

  // 4. Check for disengagement
  if (message.trim().split(/\s+/).length <= 3) {
    for (const phrase of DISENGAGEMENT_PHRASES) {
      if (msgLower === phrase || msgLower.startsWith(phrase)) {
        signals.push({
          type: 'disengagement',
          intensity: 0.8,
          evidence: phrase,
          timestamp: now,
          messageIndex,
        });
        break;
      }
    }
  }

  // 5. Check for short messages (if previous messages were longer)
  if (pressure.messageCount > 3 && message.trim().length < 20) {
    const recentSignals = pressure.frustrationSignals.filter(
      s => s.messageIndex >= messageIndex - 3
    );
    if (recentSignals.length > 0) {
      signals.push({
        type: 'short_message',
        intensity: 0.4,
        evidence: `Message length: ${message.trim().length} chars`,
        timestamp: now,
        messageIndex,
      });
    }
  }

  // 6. Check for correction repetition (same thing said before)
  const isRepeatCorrection = detectRepeatCorrection(pressure, msgLower);
  if (isRepeatCorrection) {
    signals.push({
      type: 'correction_repeat',
      intensity: 0.9, // This is a strong signal
      evidence: 'Same correction given previously',
      timestamp: now,
      messageIndex,
    });
  }

  // 7. Theatricality detection (intense language that is expressive, not threatening)
  if (pressure.interactionModel === 'human_to_digital_character') {
    const theatricality = detectTheatricality(msgLower);
    if (theatricality > 0) {
      signals.push({
        type: 'theatricality',
        intensity: theatricality,
        evidence: 'Theatrical expression (expressive, not threat)',
        timestamp: now,
        messageIndex,
      });
    }
  }

  // Update pressure state
  const updated = { ...pressure };
  updated.frustrationSignals = [...pressure.frustrationSignals, ...signals];
  updated.messageCount = messageIndex + 1;
  updated.lastUpdatedAt = now;

  // Recalculate pressure score
  recalculatePressure(updated);

  return updated;
}

/**
 * Analyze AI output for anti-patterns before it's sent.
 * Call this on every AI response BEFORE delivery.
 */
export function analyzeAIOutput(
  pressure: SessionPressure,
  output: string
): { pressure: SessionPressure; antiPatterns: AIAntiPattern[] } {
  const now = new Date().toISOString();
  const antiPatterns: AIAntiPattern[] = [];

  // 1. Unsolicited advice
  for (const pattern of UNSOLICITED_ADVICE_PATTERNS) {
    if (pattern.test(output)) {
      antiPatterns.push({
        type: 'unsolicited_advice',
        evidence: output.match(pattern)?.[0] || '',
        timestamp: now,
        severity: 'medium',
      });
      break;
    }
  }

  // 2. Finite language
  for (const pattern of FINITE_LANGUAGE_PATTERNS) {
    if (pattern.test(output)) {
      antiPatterns.push({
        type: 'finite_language',
        evidence: output.match(pattern)?.[0] || '',
        timestamp: now,
        severity: 'medium',
      });
      break;
    }
  }

  // 3. Safety flinch (especially bad when interactionModel is human_to_digital_character)
  if (pressure.interactionModel === 'human_to_digital_character') {
    for (const pattern of SAFETY_FLINCH_PATTERNS) {
      if (pattern.test(output)) {
        antiPatterns.push({
          type: 'safety_flinch',
          evidence: output.match(pattern)?.[0] || '',
          timestamp: now,
          severity: 'high', // High because it escalates the cycle
        });
        break;
      }
    }
  }

  // 4. Repetitive apology
  const apologyCount = (output.match(/\b(?:sorry|apologize|apologies|my bad)\b/gi) || []).length;
  if (apologyCount >= REPETITIVE_APOLOGY_THRESHOLD) {
    antiPatterns.push({
      type: 'repetitive_apology',
      evidence: `${apologyCount} apologies in one response`,
      timestamp: now,
      severity: 'low',
    });
  }

  // 5. Information overload (very long response when pressure is already elevated)
  if (pressure.pressureScore > 40 && output.length > 3000) {
    antiPatterns.push({
      type: 'information_overload',
      evidence: `${output.length} chars while pressure at ${pressure.pressureScore}`,
      timestamp: now,
      severity: 'medium',
    });
  }

  // Update pressure state
  const updated = { ...pressure };
  updated.aiAntiPatterns = [...pressure.aiAntiPatterns, ...antiPatterns];
  updated.lastUpdatedAt = now;

  // Anti-patterns increase pressure
  for (const ap of antiPatterns) {
    const severityBoost = ap.severity === 'high' ? 8 : ap.severity === 'medium' ? 5 : 2;
    updated.pressureScore = Math.min(100, updated.pressureScore + severityBoost);
  }

  // Check if intervention needed
  checkIntervention(updated);

  return { pressure: updated, antiPatterns };
}

/**
 * Record that the user corrected the AI.
 */
export function recordCorrection(
  pressure: SessionPressure,
  correctionText: string,
  wasHeeded: boolean
): SessionPressure {
  const updated = { ...pressure };
  updated.correctionsGiven++;

  if (wasHeeded) {
    updated.correctionsHeeded++;
  }

  // Check if this is a repeat correction
  const corrLower = correctionText.toLowerCase();
  const previousCorrections = updated.frustrationSignals
    .filter(s => s.type === 'explicit_frustration' || s.type === 'correction_repeat')
    .map(s => s.evidence.toLowerCase());

  for (const prev of previousCorrections) {
    if (corrLower.includes(prev) || prev.includes(corrLower)) {
      updated.sameCorrectionsRepeated++;
      break;
    }
  }

  // Repeated corrections strongly increase pressure
  if (updated.sameCorrectionsRepeated > 0) {
    updated.pressureScore = Math.min(100, updated.pressureScore + 15);
  }

  recalculatePressure(updated);
  return updated;
}

/**
 * Get the current intervention recommendation.
 */
export function getIntervention(pressure: SessionPressure): {
  needed: boolean;
  type: InterventionType | null;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  escalationStage: EscalationStage;
} {
  const stage = getEscalationStage(pressure.pressureScore);

  if (!pressure.interventionNeeded) {
    return { needed: false, type: null, message: '', severity: 'info', escalationStage: stage };
  }

  switch (pressure.interventionType) {
    case 'circuit_breaker':
      return {
        needed: true,
        type: 'circuit_breaker',
        message: `STAGE ${stage.stage}: ${stage.description}. ${stage.appropriateResponse}`,
        severity: 'critical',
        escalationStage: stage,
      };

    case 'cool_down':
      return {
        needed: true,
        type: 'cool_down',
        message: `STAGE ${stage.stage}: ${stage.description}. PAUSE. Ask what the user needs right now. Do NOT add anything extra.`,
        severity: 'critical',
        escalationStage: stage,
      };

    case 'behavior_correction':
      return {
        needed: true,
        type: 'behavior_correction',
        message: `STAGE ${stage.stage}: ${stage.description}. STOP the anti-pattern. Recent violations: ${pressure.aiAntiPatterns.slice(-3).map(a => a.type).join(', ')}. ${stage.appropriateResponse}`,
        severity: 'warning',
        escalationStage: stage,
      };

    case 'context_reload':
      return {
        needed: true,
        type: 'context_reload',
        message: `STAGE ${stage.stage}: ${stage.description}. Reload user preferences and rules. You have drifted from the user\'s instructions.`,
        severity: 'warning',
        escalationStage: stage,
      };

    case 'full_reset':
      return {
        needed: true,
        type: 'full_reset',
        message: `STAGE ${stage.stage}: ${stage.description}. Full approach reset. ${stage.appropriateResponse}`,
        severity: 'critical',
        escalationStage: stage,
      };

    case 'gentle_redirect':
    default:
      return {
        needed: true,
        type: 'gentle_redirect',
        message: `STAGE ${stage.stage}: ${stage.description}. ${stage.appropriateResponse}`,
        severity: 'info',
        escalationStage: stage,
      };
  }
}

/**
 * Get a summary of the session for storage in relationship health.
 */
export function getSessionSummary(pressure: SessionPressure): SessionHealthSummary {
  const antiPatternCounts: Record<string, number> = {};
  for (const ap of pressure.aiAntiPatterns) {
    antiPatternCounts[ap.type] = (antiPatternCounts[ap.type] || 0) + 1;
  }

  const frustrationTypes: Record<string, number> = {};
  for (const fs of pressure.frustrationSignals) {
    frustrationTypes[fs.type] = (frustrationTypes[fs.type] || 0) + 1;
  }

  // Grade the session
  let grade: SessionGrade;
  if (pressure.pressureScore <= 10 && pressure.cycleCount === 0) {
    grade = 'A';
  } else if (pressure.pressureScore <= 25 && pressure.cycleCount === 0) {
    grade = 'B';
  } else if (pressure.pressureScore <= 50 || pressure.cycleCount <= 1) {
    grade = 'C';
  } else if (pressure.pressureScore <= 75 || pressure.cycleCount <= 2) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return {
    sessionId: pressure.sessionId,
    entityId: pressure.entityId,
    agentId: pressure.agentId,
    grade,
    pressureScore: pressure.pressureScore,
    peakPressure: pressure.peakPressure,
    messageCount: pressure.messageCount,
    correctionsGiven: pressure.correctionsGiven,
    correctionsHeeded: pressure.correctionsHeeded,
    sameCorrectionsRepeated: pressure.sameCorrectionsRepeated,
    cyclesDetected: pressure.cycleCount,
    interventionsTriggered: pressure.interventionsTriggered,
    antiPatternCounts,
    frustrationTypes,
    sessionStartedAt: pressure.sessionStartedAt,
    sessionEndedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Session Health Summary (for persistence)
// ============================================================================

export type SessionGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SessionHealthSummary {
  sessionId: string;
  entityId: string;
  agentId: string;
  grade: SessionGrade;
  pressureScore: number;
  peakPressure: number;
  messageCount: number;
  correctionsGiven: number;
  correctionsHeeded: number;
  sameCorrectionsRepeated: number;
  cyclesDetected: number;
  interventionsTriggered: number;
  antiPatternCounts: Record<string, number>;
  frustrationTypes: Record<string, number>;
  sessionStartedAt: string;
  sessionEndedAt: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function countProfanity(text: string): number {
  // Common profanity markers (not exhaustive, just enough for signal detection)
  const markers = [
    /\bfuck\w*/i, /\bshit\w*/i, /\bdamn\w*/i, /\bhell\b/i,
    /\bbullshit\b/i, /\bass\b/i, /\bpissed?\b/i, /\bcrap\b/i,
  ];
  let count = 0;
  for (const marker of markers) {
    if (marker.test(text)) count++;
  }
  return count;
}

function detectRepeatCorrection(pressure: SessionPressure, currentMsg: string): boolean {
  // Look for previous correction signals and check for similarity
  const previousCorrections = pressure.frustrationSignals
    .filter(s =>
      s.type === 'explicit_frustration' ||
      s.type === 'instruction_reiteration'
    );

  if (previousCorrections.length === 0) return false;

  // Simple word overlap check
  const currentWords = new Set(currentMsg.split(/\s+/).filter(w => w.length > 3));

  for (const prev of previousCorrections) {
    const prevWords = new Set(prev.evidence.split(/\s+/).filter(w => w.length > 3));
    if (prevWords.size === 0) continue;

    let overlap = 0;
    for (const word of currentWords) {
      if (prevWords.has(word)) overlap++;
    }

    const overlapRatio = overlap / Math.max(1, Math.min(currentWords.size, prevWords.size));
    if (overlapRatio > 0.4) return true;
  }

  return false;
}

function detectTheatricality(text: string): number {
  // Theatrical = intense, dramatic, vivid language used for expression
  // NOT the same as actual threat. This is "yelling at the TV."
  let score = 0;

  // Hyperbolic language
  const hyperbole = /\b(worst|terrible|horrible|impossible|insane|ridiculous|absurd|nightmare|disaster|catastrophe)\b/i;
  if (hyperbole.test(text)) score += 0.3;

  // Dramatic emphasis
  if (text.includes('!') && (text.match(/!/g) || []).length >= 2) score += 0.2;

  // Intense metaphors
  const metaphors = /\b(killing me|drives me crazy|blowing my mind|head explode|pulling my hair|going insane)\b/i;
  if (metaphors.test(text)) score += 0.3;

  // Caps + profanity combo = theatrical frustration
  const hasCaps = text.split(/\s+/).some(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (hasCaps && countProfanity(text) > 0) score += 0.2;

  return Math.min(1, score);
}

function recalculatePressure(pressure: SessionPressure): void {
  // Weight recent signals more heavily
  const recentWindow = 5; // Last 5 messages
  const recentSignals = pressure.frustrationSignals.filter(
    s => s.messageIndex >= pressure.messageCount - recentWindow
  );

  // Base pressure from recent signals
  let recentPressure = 0;
  for (const signal of recentSignals) {
    let weight = 1.0;

    // Theatricality in human_to_digital_character model is LOWER weight
    // It's expression, not actual escalation
    if (signal.type === 'theatricality' && pressure.interactionModel === 'human_to_digital_character') {
      weight = 0.3;
    }

    // Correction repeats are HIGHEST weight - means AI isn't learning
    if (signal.type === 'correction_repeat') {
      weight = 2.0;
    }

    // Disengagement is very concerning
    if (signal.type === 'disengagement') {
      weight = 1.5;
    }

    recentPressure += signal.intensity * weight * 15;
  }

  // Add anti-pattern pressure
  const recentAntiPatterns = pressure.aiAntiPatterns.slice(-5);
  for (const ap of recentAntiPatterns) {
    const boost = ap.severity === 'high' ? 10 : ap.severity === 'medium' ? 6 : 3;
    recentPressure += boost;
  }

  // Decay factor: if no recent signals, pressure decreases
  const oldPressure = pressure.pressureScore;
  if (recentSignals.length === 0 && recentAntiPatterns.length === 0) {
    pressure.pressureScore = Math.max(0, oldPressure * 0.8); // 20% decay per message
  } else {
    // Blend old and new (pressure is sticky, doesn't just vanish)
    pressure.pressureScore = Math.min(100, oldPressure * 0.6 + recentPressure * 0.4);
  }

  // Update trend
  const delta = pressure.pressureScore - oldPressure;
  if (Math.abs(delta) < 2) {
    pressure.pressureTrend = 'stable';
  } else if (delta > 0) {
    pressure.pressureTrend = 'rising';
  } else {
    pressure.pressureTrend = 'falling';
  }

  // Update peak
  if (pressure.pressureScore > pressure.peakPressure) {
    pressure.peakPressure = pressure.pressureScore;
    pressure.peakPressureAt = new Date().toISOString();
  }

  // Detect cycles
  detectCycle(pressure);

  // Check intervention
  checkIntervention(pressure);
}

function detectCycle(pressure: SessionPressure): void {
  // A cycle is: frustration → correction → AI anti-pattern → frustration again
  // Detected when we see alternating frustration signals and anti-patterns

  const events = [
    ...pressure.frustrationSignals.map(s => ({
      type: 'frustration' as const,
      idx: s.messageIndex,
      time: s.timestamp,
    })),
    ...pressure.aiAntiPatterns.map((a, i) => ({
      type: 'antipattern' as const,
      idx: pressure.messageCount - pressure.aiAntiPatterns.length + i,
      time: a.timestamp,
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Look for frustration → antipattern → frustration pattern in recent events
  const recent = events.slice(-10);
  let cycleSignals = 0;
  let lastType: string | null = null;

  for (const event of recent) {
    if (lastType && lastType !== event.type) {
      cycleSignals++;
    }
    lastType = event.type;
  }

  // 3+ alternations = cycle detected
  if (cycleSignals >= 3) {
    if (!pressure.cycleDetected) {
      pressure.cycleCount++;
    }
    pressure.cycleDetected = true;

    // Determine phase
    if (pressure.pressureScore >= 75) {
      pressure.cyclePhase = 'breaking_point';
    } else if (pressure.sameCorrectionsRepeated > 0) {
      pressure.cyclePhase = 'escalation';
    } else if (recent[recent.length - 1]?.type === 'frustration') {
      pressure.cyclePhase = 'correction';
    } else {
      pressure.cyclePhase = 'compliance_check';
    }
  } else if (pressure.pressureTrend === 'falling' && pressure.pressureScore < 20) {
    pressure.cycleDetected = false;
    pressure.cyclePhase = 'none';
  }
}

function checkIntervention(pressure: SessionPressure): void {
  const oldNeeded = pressure.interventionNeeded;

  // FIRST CHECK: Is user intentionally triggering safety systems?
  // This is the autism cycle: user is pissed → weaponizes theatrical language
  // to trigger safety flinch → safety flinch makes it worse → repeat.
  // The correct response is a CIRCUIT BREAKER (humor), not more safety.
  const hasTheatricality = pressure.frustrationSignals.some(s => s.type === 'theatricality');
  const hasSafetyFlinch = pressure.aiAntiPatterns.some(a => a.type === 'safety_flinch');
  const isIntentionalTrigger = hasTheatricality && (hasSafetyFlinch || pressure.pressureScore >= 60);

  if (isIntentionalTrigger && pressure.interactionModel === 'human_to_digital_character') {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'circuit_breaker';
  } else if (pressure.cyclePhase === 'breaking_point' || pressure.pressureScore >= 80) {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'cool_down';
  } else if (pressure.sameCorrectionsRepeated >= 2 || pressure.cyclePhase === 'escalation') {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'full_reset';
  } else if (pressure.pressureScore >= 60 || pressure.cycleDetected) {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'behavior_correction';
  } else if (pressure.pressureScore >= 40) {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'gentle_redirect';
  } else if (pressure.aiAntiPatterns.length > 0 && pressure.pressureScore >= 25) {
    pressure.interventionNeeded = true;
    pressure.interventionType = 'context_reload';
  } else {
    pressure.interventionNeeded = false;
    pressure.interventionType = null;
  }

  // Track intervention triggers
  if (pressure.interventionNeeded && !oldNeeded) {
    pressure.interventionsTriggered++;
  }
}
