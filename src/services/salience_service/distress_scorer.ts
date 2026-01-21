/**
 * @file Multi-Signal Distress Scoring
 *
 * Combines multiple signals to predict distress BEFORE it reaches crisis:
 * - Hume.ai emotion analysis
 * - Pressure vector patterns
 * - Isolation detection
 * - Keyword analysis
 * - Communication frequency changes
 *
 * "If this was about money we would predict stock.
 *  This is about predicting pain and heading it off at the pass."
 */

import type { EntityPressure } from './entity.js';

// ============================================================================
// Types
// ============================================================================

export interface DistressSignals {
  // Hume.ai emotion signals (0-1)
  humeDistress?: number;        // Direct distress score
  humeAnxiety?: number;         // Anxiety indicator
  humeSadness?: number;         // Sadness indicator
  humeAnger?: number;           // Anger (can precede crisis)

  // Pressure tracking signals
  pressureScore?: number;       // Current pressure level
  pressureTrend?: 'rising' | 'stable' | 'falling';
  escalating?: boolean;         // Intensity increasing
  isolating?: boolean;          // Withdrawing from connection
  receivingFromMultiple?: boolean;  // Multiple stressors

  // Text analysis signals
  distressKeywords?: string[];  // Keywords found
  sentimentScore?: number;      // -1 to +1

  // Communication patterns
  communicationFrequency?: 'increasing' | 'stable' | 'decreasing';
  responseLatency?: 'faster' | 'stable' | 'slower';
}

export interface DistressScore {
  score: number;                // 0-100 composite score
  level: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  confidence: number;           // 0-1 confidence in score
  triggeringSignals: string[];  // What contributed
  recommendation: string;       // What to do
}

// ============================================================================
// Weights (tuned based on research and testing)
// ============================================================================

const WEIGHTS = {
  humeDistress: 0.25,           // Direct distress is strong signal
  humeAnxiety: 0.10,
  humeSadness: 0.10,
  humeAnger: 0.05,              // Anger alone isn't distress but contributes
  pressureScore: 0.15,          // Accumulated pressure
  escalating: 0.10,             // Getting worse
  isolating: 0.15,              // Withdrawal is major warning sign
  receivingFromMultiple: 0.05,  // Multiple sources
  distressKeywords: 0.05,       // Keywords are weak signal alone
};

// Distress keywords that boost score
const DISTRESS_KEYWORDS = [
  // Crisis indicators
  'suicide', 'kill myself', 'end it', 'no point', 'give up',
  'hopeless', 'worthless', 'burden', 'better off without',
  // Severe distress
  'can\'t take it', 'falling apart', 'breaking down', 'drowning',
  'trapped', 'no way out', 'desperate', 'unbearable',
  // Moderate distress
  'overwhelmed', 'exhausted', 'can\'t cope', 'too much',
  'stressed', 'anxious', 'scared', 'worried', 'hurt',
  // Social distress
  'alone', 'nobody cares', 'no friends', 'rejected', 'bullied',
  'left out', 'excluded', 'humiliated', 'embarrassed',
];

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Calculate multi-signal distress score.
 *
 * @param signals - Input signals from various sources
 * @returns Composite distress score with level and recommendation
 */
export function calculateDistressScore(signals: DistressSignals): DistressScore {
  let score = 0;
  let totalWeight = 0;
  const triggeringSignals: string[] = [];

  // 1. Hume.ai emotion signals
  if (signals.humeDistress !== undefined) {
    const contribution = signals.humeDistress * WEIGHTS.humeDistress * 100;
    score += contribution;
    totalWeight += WEIGHTS.humeDistress;
    if (signals.humeDistress > 0.5) {
      triggeringSignals.push(`Hume distress: ${(signals.humeDistress * 100).toFixed(0)}%`);
    }
  }

  if (signals.humeAnxiety !== undefined) {
    const contribution = signals.humeAnxiety * WEIGHTS.humeAnxiety * 100;
    score += contribution;
    totalWeight += WEIGHTS.humeAnxiety;
    if (signals.humeAnxiety > 0.6) {
      triggeringSignals.push(`Anxiety elevated: ${(signals.humeAnxiety * 100).toFixed(0)}%`);
    }
  }

  if (signals.humeSadness !== undefined) {
    const contribution = signals.humeSadness * WEIGHTS.humeSadness * 100;
    score += contribution;
    totalWeight += WEIGHTS.humeSadness;
    if (signals.humeSadness > 0.6) {
      triggeringSignals.push(`Sadness detected: ${(signals.humeSadness * 100).toFixed(0)}%`);
    }
  }

  if (signals.humeAnger !== undefined) {
    const contribution = signals.humeAnger * WEIGHTS.humeAnger * 100;
    score += contribution;
    totalWeight += WEIGHTS.humeAnger;
  }

  // 2. Pressure tracking signals
  if (signals.pressureScore !== undefined) {
    // Normalize pressure score (assume 0-10 range)
    const normalizedPressure = Math.min(1, signals.pressureScore / 10);
    const contribution = normalizedPressure * WEIGHTS.pressureScore * 100;
    score += contribution;
    totalWeight += WEIGHTS.pressureScore;
    if (signals.pressureScore > 3) {
      triggeringSignals.push(`Elevated pressure: ${signals.pressureScore.toFixed(1)}`);
    }
  }

  if (signals.escalating) {
    score += WEIGHTS.escalating * 100;
    totalWeight += WEIGHTS.escalating;
    triggeringSignals.push('Pattern escalating');
  }

  if (signals.isolating) {
    score += WEIGHTS.isolating * 100;
    totalWeight += WEIGHTS.isolating;
    triggeringSignals.push('Isolation detected');
  }

  if (signals.receivingFromMultiple) {
    score += WEIGHTS.receivingFromMultiple * 100;
    totalWeight += WEIGHTS.receivingFromMultiple;
    triggeringSignals.push('Multiple stressors');
  }

  // 3. Keyword analysis
  if (signals.distressKeywords && signals.distressKeywords.length > 0) {
    // Weight by severity of keywords found
    let keywordScore = 0;
    const crisisKeywords = ['suicide', 'kill myself', 'end it', 'no point'];

    for (const keyword of signals.distressKeywords) {
      if (crisisKeywords.some(ck => keyword.toLowerCase().includes(ck))) {
        keywordScore = Math.max(keywordScore, 1.0);  // Crisis keywords = max
        triggeringSignals.push(`CRISIS KEYWORD: "${keyword}"`);
      } else {
        keywordScore = Math.max(keywordScore, 0.5);
      }
    }

    score += keywordScore * WEIGHTS.distressKeywords * 100;
    totalWeight += WEIGHTS.distressKeywords;
  }

  // 4. Sentiment analysis
  if (signals.sentimentScore !== undefined) {
    // Convert -1 to +1 sentiment to 0-1 distress contribution
    // -1 (very negative) → 1.0 distress, +1 (very positive) → 0 distress
    const sentimentDistress = Math.max(0, -signals.sentimentScore);
    score += sentimentDistress * 10;  // 10% max contribution
  }

  // 5. Communication patterns
  if (signals.communicationFrequency === 'decreasing') {
    score += 5;  // Withdrawal indicator
    triggeringSignals.push('Communication decreasing');
  }

  // Normalize if we have weight
  if (totalWeight > 0) {
    score = (score / totalWeight) * (totalWeight / sumWeights());
  }

  // Determine level
  let level: DistressScore['level'];
  let recommendation: string;

  if (score >= 80 || triggeringSignals.some(s => s.includes('CRISIS'))) {
    level = 'critical';
    recommendation = 'IMMEDIATE: Activate care circle, consider crisis resources.';
  } else if (score >= 60) {
    level = 'high';
    recommendation = 'Alert care circle. Check in with person directly.';
  } else if (score >= 40) {
    level = 'moderate';
    recommendation = 'Monitor closely. Consider reaching out.';
  } else if (score >= 20) {
    level = 'low';
    recommendation = 'Continue monitoring. Normal fluctuation possible.';
  } else {
    level = 'none';
    recommendation = 'No intervention needed.';
  }

  // Calculate confidence based on how many signals we had
  const signalCount = Object.keys(signals).filter(k => signals[k as keyof DistressSignals] !== undefined).length;
  const maxSignals = 10;
  const confidence = Math.min(1, signalCount / maxSignals);

  return {
    score: Math.round(score),
    level,
    confidence,
    triggeringSignals,
    recommendation,
  };
}

function sumWeights(): number {
  return Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
}

// ============================================================================
// Helper: Build signals from available data
// ============================================================================

/**
 * Build distress signals from available sources.
 *
 * @param humeEmotions - Array of Hume.ai emotions with scores
 * @param pressure - Entity pressure record
 * @param text - Original text (for keyword analysis)
 * @param sentimentScore - Sentiment score if available
 */
export function buildDistressSignals(
  humeEmotions: Array<{ name: string; score: number }> | undefined,
  pressure: EntityPressure | null,
  text: string,
  sentimentScore?: number
): DistressSignals {
  const signals: DistressSignals = {};

  // Extract Hume emotions
  if (humeEmotions) {
    for (const emotion of humeEmotions) {
      const name = emotion.name.toLowerCase();
      if (name === 'distress' || name === 'pain') {
        signals.humeDistress = Math.max(signals.humeDistress || 0, emotion.score);
      }
      if (name === 'anxiety' || name === 'fear' || name === 'worry') {
        signals.humeAnxiety = Math.max(signals.humeAnxiety || 0, emotion.score);
      }
      if (name === 'sadness' || name === 'disappointment' || name === 'grief') {
        signals.humeSadness = Math.max(signals.humeSadness || 0, emotion.score);
      }
      if (name === 'anger' || name === 'annoyance' || name === 'contempt') {
        signals.humeAnger = Math.max(signals.humeAnger || 0, emotion.score);
      }
    }
  }

  // Extract pressure signals
  if (pressure) {
    signals.pressureScore = pressure.pressureScore;
    signals.pressureTrend = pressure.pressureTrend;
    signals.escalating = pressure.patterns.escalating;
    signals.isolating = pressure.patterns.isolating;
    signals.receivingFromMultiple = pressure.patterns.receivingFromMultipleSources;
  }

  // Extract keywords from text
  const textLower = text.toLowerCase();
  const foundKeywords = DISTRESS_KEYWORDS.filter(kw => textLower.includes(kw));
  if (foundKeywords.length > 0) {
    signals.distressKeywords = foundKeywords;
  }

  // Sentiment
  if (sentimentScore !== undefined) {
    signals.sentimentScore = sentimentScore;
  }

  return signals;
}

// ============================================================================
// Export
// ============================================================================

export { DISTRESS_KEYWORDS };
