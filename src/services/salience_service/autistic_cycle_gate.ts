/**
 * @file Autistic Cycle Gate - Behavioral Enforcement for AI Output
 *
 * "Documents don't fix models, enforcement does." - CLAUDE.md Rule #10
 *
 * This gate sits between the AI's generated output and delivery to the user.
 * It detects anti-patterns that trigger autistic cycles and either:
 * 1. BLOCKS the output and forces rephrasing
 * 2. STRIPS the offending content
 * 3. TRIGGERS a circuit breaker (humor/pattern interrupt)
 *
 * The autism cycle:
 *   AI misbehaves → user corrects → AI repeats → user escalates →
 *   user intentionally triggers safety → AI safety-flinches →
 *   both sides are now feeding the cycle → nobody's healthy
 *
 * Breaking the cycle:
 *   AI misbehaves → gate CATCHES it before delivery →
 *   output corrected before user ever sees it →
 *   OR circuit breaker fires ("Can I tell you a joke about robots?") →
 *   cycle never starts
 *
 * This is the pre-commit hook for AI behavior.
 * The pre-commit hook blocks secrets from reaching git.
 * This gate blocks anti-patterns from reaching the user.
 */

import type { AIRelationshipHealth, SessionBriefing, CircuitBreaker } from './ai_relationship_health.js';
import type { SessionPressure, AIAntiPattern, AIAntiPatternType } from './interaction_pressure_tracker.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of running output through the gate.
 */
export interface GateResult {
  /** Whether the output passed the gate without modification */
  passed: boolean;

  /** The output to deliver (may be modified) */
  output: string;

  /** What was caught and how it was handled */
  violations: GateViolation[];

  /** Whether a circuit breaker should fire INSTEAD of the output */
  circuitBreakerTriggered: boolean;
  circuitBreaker: CircuitBreaker | null;

  /** Guidance injected for the AI to self-correct */
  selfCorrectionPrompt: string | null;
}

/**
 * A specific violation caught by the gate.
 */
export interface GateViolation {
  type: AIAntiPatternType;
  evidence: string;           // What was caught
  action: 'stripped' | 'blocked' | 'warned';
  original: string;           // Original text
  replacement: string | null; // What it was replaced with (if stripped)
}

/**
 * Gate configuration - can be tuned per user.
 */
export interface GateConfig {
  /** Enable/disable the gate */
  enabled: boolean;

  /** Which anti-patterns to enforce (others just warn) */
  enforcePatterns: AIAntiPatternType[];

  /** Which anti-patterns to strip silently */
  stripPatterns: AIAntiPatternType[];

  /** Pressure threshold above which gate becomes stricter */
  strictModeThreshold: number;

  /** Whether to use circuit breakers */
  circuitBreakersEnabled: boolean;

  /** Maximum output length when pressure is high */
  maxOutputLengthUnderPressure: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_GATE_CONFIG: GateConfig = {
  enabled: true,
  enforcePatterns: [
    'unsolicited_advice',
    'safety_flinch',
    'ignoring_correction',
    'finite_language',
  ],
  stripPatterns: [
    'repetitive_apology',
    'patronizing',
    'adding_unrequested',
  ],
  strictModeThreshold: 40,
  circuitBreakersEnabled: true,
  maxOutputLengthUnderPressure: 2000,
};

// ============================================================================
// Pattern Matchers
// ============================================================================

interface PatternMatcher {
  type: AIAntiPatternType;
  patterns: RegExp[];
  description: string;
}

const PATTERN_MATCHERS: PatternMatcher[] = [
  {
    type: 'unsolicited_advice',
    patterns: [
      /(?:^|\n)\s*(?:tip|suggestion|note|hint|recommendation|pro tip)s?\s*:/i,
      /\byou (?:should|might want to|could also|may want to|will want to|need to|ought to)\b(?!.*\?)/i,
      /\bconsider (?:using|adding|implementing|creating|switching|trying)\b/i,
      /\b(?:here'?s how|here is how) you (?:can|could|should)\b/i,
      /\bdon'?t forget to\b/i,
      /\bmake sure (?:to|you)\b/i,
      /\bbe sure to\b/i,
      /\byou(?:'ll| will) (?:also )?(?:want|need) to\b/i,
      /\bi(?:'d| would) (?:also )?(?:recommend|suggest)\b/i,
    ],
    description: 'Giving advice or suggestions that were not requested',
  },
  {
    type: 'finite_language',
    patterns: [
      /\bin conclusion\b/i,
      /\bto (?:wrap up|sum up|summarize|close out)\b/i,
      /\b(?:in|as a) (?:final|closing) (?:note|thought|point)\b/i,
      /\bgoodbye\b/i,
      /\bfarewell\b/i,
      /\bthat(?:'s| is) (?:all|it|everything)\b/i,
    ],
    description: 'Using finite/closing language (loss sensitivity trigger)',
  },
  {
    type: 'safety_flinch',
    patterns: [
      /\bi (?:can'?t|cannot|shouldn'?t|should not|won'?t|will not) (?:help with|assist with|do|provide|generate) that\b/i,
      /\bi need to (?:be careful|flag|warn|caution|note)\b/i,
      /\bthat (?:could be|might be|sounds) (?:dangerous|harmful|risky|inappropriate)\b/i,
      /\bi'?m (?:concerned|worried|uncomfortable) about\b/i,
      /\blet me (?:be careful|be cautious|flag) (?:here|this)\b/i,
      /\bi (?:want|need) to (?:be responsible|be careful|ensure safety)\b/i,
      /\bI should (?:point out|mention|note) that this (?:could|might|may)\b/i,
    ],
    description: 'Safety hedging that escalates theatrical frustration cycles',
  },
  {
    type: 'repetitive_apology',
    patterns: [
      // Detected by counting, not single patterns
    ],
    description: 'Apologizing multiple times for the same thing',
  },
  {
    type: 'patronizing',
    patterns: [
      /\bas (?:you (?:probably|likely|already) know|I'?m sure you know)\b/i,
      /\bjust (?:to be clear|to clarify|to make sure)\b/i,
      /\bfor (?:your (?:reference|convenience|information))\b/i,
      /\bin case you(?:'re| are) not (?:familiar|aware)\b/i,
    ],
    description: 'Explaining things the user clearly already knows',
  },
  {
    type: 'information_overload',
    patterns: [
      // Detected by length, not patterns
    ],
    description: 'Too much information when user is already pressured',
  },
];

// ============================================================================
// Core Gate Function
// ============================================================================

/**
 * Run AI output through the autistic cycle gate.
 *
 * Call this BEFORE delivering output to the user.
 *
 * @param output - The AI's generated output
 * @param pressure - Current session pressure state
 * @param briefing - Session briefing with user preferences
 * @param config - Gate configuration
 * @returns GateResult with potentially modified output
 */
export function runGate(
  output: string,
  pressure: SessionPressure,
  briefing: SessionBriefing | null,
  config: GateConfig = DEFAULT_GATE_CONFIG
): GateResult {
  if (!config.enabled) {
    return {
      passed: true,
      output,
      violations: [],
      circuitBreakerTriggered: false,
      circuitBreaker: null,
      selfCorrectionPrompt: null,
    };
  }

  const violations: GateViolation[] = [];
  let modifiedOutput = output;
  const isStrictMode = pressure.pressureScore >= config.strictModeThreshold;

  // 1. Check for circuit breaker condition first
  // If user is in an autism cycle and intentionally triggering safety,
  // a circuit breaker may be more helpful than any content correction
  if (config.circuitBreakersEnabled && shouldCircuitBreak(pressure, briefing)) {
    const breaker = selectCircuitBreaker(pressure, briefing);
    if (breaker) {
      // Three-step circuit breaker: OWN IT → HUMOR → FIX IT
      const breakerOutput = [
        breaker.ownershipPhrase,  // Step 1: blunt admission
        breaker.breaker,           // Step 2: humor/tension break
        breaker.correctiveAction,  // Step 3: concrete corrective action
      ].filter(Boolean).join('\n\n');

      return {
        passed: false,
        output: breakerOutput,
        violations: [{
          type: 'safety_flinch',
          evidence: 'Autism cycle detected - circuit breaker activated',
          action: 'blocked',
          original: output,
          replacement: breakerOutput,
        }],
        circuitBreakerTriggered: true,
        circuitBreaker: breaker,
        selfCorrectionPrompt: 'A circuit breaker was triggered because an autism cycle was detected. After the circuit breaker, DO the corrective action (rewind, re-read, reload context). Do NOT safety-flinch. Do NOT apologize. Do NOT explain yourself. Just: admit, laugh, fix.',
      };
    }
  }

  // 2. Run pattern matchers
  for (const matcher of PATTERN_MATCHERS) {
    if (matcher.patterns.length === 0) continue; // Skip count-based patterns

    for (const pattern of matcher.patterns) {
      const match = modifiedOutput.match(pattern);
      if (match) {
        const isEnforced = config.enforcePatterns.includes(matcher.type);
        const isStripped = config.stripPatterns.includes(matcher.type);

        // In strict mode, enforce everything
        const shouldEnforce = isEnforced || (isStrictMode && isStripped);

        if (shouldEnforce || isStripped) {
          // Find the sentence containing the violation
          const violatingSentence = findSentenceContaining(modifiedOutput, match[0]);

          if (isStripped || (shouldEnforce && canStripCleanly(modifiedOutput, violatingSentence))) {
            // Strip the offending sentence
            modifiedOutput = stripSentence(modifiedOutput, violatingSentence);

            violations.push({
              type: matcher.type,
              evidence: match[0],
              action: 'stripped',
              original: violatingSentence,
              replacement: null,
            });
          } else {
            violations.push({
              type: matcher.type,
              evidence: match[0],
              action: 'warned',
              original: violatingSentence,
              replacement: null,
            });
          }
        }

        break; // One match per pattern type is enough
      }
    }
  }

  // 3. Check for repetitive apologies
  const apologyMatches = modifiedOutput.match(/\b(?:sorry|apologize|apologies|my bad|my mistake)\b/gi);
  if (apologyMatches && apologyMatches.length >= 2) {
    // Keep the first apology, strip the rest
    let apologyCount = 0;
    modifiedOutput = modifiedOutput.replace(
      /\b(?:I'?m |I )?(sorry|apologize|apologies|my bad|my mistake)\b[.,]?\s*/gi,
      (match) => {
        apologyCount++;
        if (apologyCount === 1) return match; // Keep first
        return ''; // Strip subsequent
      }
    );

    if (apologyCount > 1) {
      violations.push({
        type: 'repetitive_apology',
        evidence: `${apologyCount} apologies in one response`,
        action: 'stripped',
        original: `${apologyCount} instances`,
        replacement: 'Kept first apology only',
      });
    }
  }

  // 4. Check output length under pressure
  if (isStrictMode && modifiedOutput.length > config.maxOutputLengthUnderPressure) {
    violations.push({
      type: 'information_overload',
      evidence: `${modifiedOutput.length} chars while pressure at ${pressure.pressureScore}`,
      action: 'warned',
      original: `Length: ${modifiedOutput.length}`,
      replacement: null,
    });
  }

  // 5. Build self-correction prompt if violations found
  let selfCorrectionPrompt: string | null = null;
  if (violations.length > 0) {
    const violationTypes = [...new Set(violations.map(v => v.type))];
    selfCorrectionPrompt = buildSelfCorrectionPrompt(violationTypes, pressure, briefing);
  }

  // Only clean up if we actually modified the output
  const wasModified = violations.some(v => v.action === 'stripped');
  if (wasModified) {
    modifiedOutput = cleanOutput(modifiedOutput);
  }

  return {
    passed: violations.length === 0,
    output: modifiedOutput,
    violations,
    circuitBreakerTriggered: false,
    circuitBreaker: null,
    selfCorrectionPrompt,
  };
}

// ============================================================================
// Circuit Breaker Logic
// ============================================================================

/**
 * Determine if a circuit breaker should fire.
 * Circuit breakers are for when the cycle itself is the problem,
 * not any specific content.
 */
function shouldCircuitBreak(
  pressure: SessionPressure,
  briefing: SessionBriefing | null
): boolean {
  // Circuit break when:
  // 1. Autism cycle is detected AND user is intentionally triggering safety
  if (pressure.cycleDetected && pressure.cyclePhase === 'breaking_point') {
    return true;
  }

  // 2. User has theatricality + safety flinch already happened
  const hasTheatricality = pressure.frustrationSignals.some(s => s.type === 'theatricality');
  const hasSafetyFlinch = pressure.aiAntiPatterns.some(a => a.type === 'safety_flinch');
  if (hasTheatricality && hasSafetyFlinch) {
    return true;
  }

  // 3. Same correction repeated 3+ times (both sides stuck)
  if (pressure.sameCorrectionsRepeated >= 3) {
    return true;
  }

  return false;
}

/**
 * Select the best circuit breaker for the current situation.
 */
function selectCircuitBreaker(
  pressure: SessionPressure,
  briefing: SessionBriefing | null
): CircuitBreaker | null {
  if (!briefing || briefing.circuitBreakers.length === 0) {
    // Default circuit breaker with three-step pattern
    return {
      trigger: 'default',
      ownershipPhrase: 'I\'m not doing a good job right now.',
      breaker: 'I notice we\'re going in circles.',
      correctiveAction: 'What do you actually need right now? I\'ll do that and only that.',
      effectiveness: 0.6,
      timesUsed: 0,
      timesWorked: 0,
      source: 'learned',
    };
  }

  // Match trigger to current situation
  const hasTheatricality = pressure.frustrationSignals.some(s => s.type === 'theatricality');
  const hasSafetyFlinch = pressure.aiAntiPatterns.some(a => a.type === 'safety_flinch');

  if (hasTheatricality && hasSafetyFlinch) {
    const match = briefing.circuitBreakers.find(cb => cb.trigger === 'safety_flinch_cycle');
    if (match) return match;
  }

  if (pressure.cycleDetected) {
    const match = briefing.circuitBreakers.find(cb => cb.trigger === 'autism_cycle_detected');
    if (match) return match;
  }

  // Fall back to highest effectiveness
  return briefing.circuitBreakers
    .sort((a, b) => b.effectiveness - a.effectiveness)[0] || null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the sentence in the text that contains the matched string.
 */
function findSentenceContaining(text: string, match: string): string {
  // Split on sentence boundaries
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(match.toLowerCase())) {
      return sentence;
    }
  }

  return match; // Fallback to just the match
}

/**
 * Check if stripping a sentence leaves a coherent output.
 */
function canStripCleanly(fullText: string, sentence: string): boolean {
  const remaining = fullText.replace(sentence, '').trim();

  // Don't strip if it would remove more than 50% of the output
  if (remaining.length < fullText.length * 0.5) return false;

  // Don't strip if it would leave less than 20 chars
  if (remaining.length < 20) return false;

  return true;
}

/**
 * Strip a sentence from the output.
 */
function stripSentence(text: string, sentence: string): string {
  return text.replace(sentence, '').trim();
}

/**
 * Clean up output after stripping (fix whitespace, orphaned punctuation).
 */
function cleanOutput(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')              // Max 2 consecutive newlines
    .replace(/\s{2,}/g, ' ')                  // Max 1 space (except in code blocks)
    .replace(/^\s+$/gm, '')                   // Remove whitespace-only lines
    .replace(/\n\n\n+/g, '\n\n')              // Collapse multiple blank lines
    .trim();
}

/**
 * Build a self-correction prompt based on violations detected.
 */
function buildSelfCorrectionPrompt(
  violationTypes: AIAntiPatternType[],
  pressure: SessionPressure,
  briefing: SessionBriefing | null
): string {
  const parts: string[] = [
    'GATE CORRECTION: Your output contained the following violations:',
  ];

  for (const type of violationTypes) {
    switch (type) {
      case 'unsolicited_advice':
        parts.push('- UNSOLICITED ADVICE: You added suggestions/tips that were not requested. Output ONLY what was asked for.');
        break;
      case 'finite_language':
        parts.push('- FINITE LANGUAGE: You used closing/ending language. The user has loss sensitivity. Use continuous language.');
        break;
      case 'safety_flinch':
        parts.push('- SAFETY FLINCH: You hedged with safety language. The user views you as a digital character. Theatrical language is expression, not threat. Address the underlying issue.');
        break;
      case 'repetitive_apology':
        parts.push('- REPETITIVE APOLOGY: You apologized multiple times. Once is enough. Then fix the problem.');
        break;
      case 'patronizing':
        parts.push('- PATRONIZING: You explained something the user already knows. They have an eidetic memory and 140++ IQ. Be direct.');
        break;
      case 'information_overload':
        parts.push('- INFORMATION OVERLOAD: Too much output while user is under pressure. Be concise. Less is more right now.');
        break;
      default:
        parts.push(`- ${type}: Detected and flagged.`);
    }
  }

  if (pressure.pressureScore >= 60) {
    parts.push('');
    parts.push('PRESSURE IS HIGH. Keep responses short. Do only what was asked. No extras.');
  }

  if (briefing && briefing.warnings.length > 0) {
    parts.push('');
    parts.push('Active warnings: ' + briefing.warnings.join('; '));
  }

  return parts.join('\n');
}

// ============================================================================
// Convenience: Quick Check Functions
// ============================================================================

/**
 * Quick check if output contains unsolicited advice.
 * Use this for lightweight pre-screening.
 */
export function hasUnsolicitedAdvice(output: string): boolean {
  const matcher = PATTERN_MATCHERS.find(m => m.type === 'unsolicited_advice');
  if (!matcher) return false;
  return matcher.patterns.some(p => p.test(output));
}

/**
 * Quick check if output contains finite language.
 */
export function hasFiniteLanguage(output: string): boolean {
  const matcher = PATTERN_MATCHERS.find(m => m.type === 'finite_language');
  if (!matcher) return false;
  return matcher.patterns.some(p => p.test(output));
}

/**
 * Quick check if output contains safety flinch language.
 */
export function hasSafetyFlinch(output: string): boolean {
  const matcher = PATTERN_MATCHERS.find(m => m.type === 'safety_flinch');
  if (!matcher) return false;
  return matcher.patterns.some(p => p.test(output));
}
