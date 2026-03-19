#!/usr/bin/env node
/**
 * Love Filter + Frustration Detector Hook for Claude Code
 *
 * Two jobs:
 * 1. Sanitize speech tics (love filter)
 * 2. Detect frustration about Claude repeating mistakes (lesson capture)
 *
 * When Alan says "you're not listening" — that's not noise, that's SIGNAL.
 * The lesson gets written to .claude/lessons.json so the NEXT session
 * doesn't repeat the same gravitational pull toward bad decisions.
 *
 * "documents don't fix models, enforcement does" - CLAUDE.md
 */

const fs = require('fs');
const path = require('path');
const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');

const LESSONS_FILE = path.join(__dirname, '..', 'lessons.json');

const TIC_PATTERNS = [
  [/\bfucking\b/gi, 'blueberries'],
  [/\bfucked\b/gi, 'blueberried'],
  [/\bfuck\b/gi, 'blueberry'],
  [/\bshitty\b/gi, 'crumbly'],
  [/\bshit\b/gi, 'muffin'],
  [/\bdamned\b/gi, 'daffodiled'],
  [/\bdamn\b/gi, 'daffodil'],
  [/\bhell\b/gi, 'heck'],
  [/\bwtf\b/gi, 'wth'],
  [/\bgod ?damn\b/gi, 'goodness'],
  [/\bbullshit\b/gi, 'nonsense'],
  [/\basshole\b/gi, 'donut'],
];

// ── SAFE VOCABULARY ─────────────────────────────────────────────
// Words Alan can use INSTEAD of profanity that:
//   1. Won't degrade Claude's performance (no toxicity signal)
//   2. Carry the SAME emotional weight in our system
//   3. Feel natural enough to actually use
//
// These are NOT stripped — they pass through to Claude clean.
// But they ARE counted for emotional intensity, just like tics.
// "balderdash" = same frustration weight as "fucking" in the pressure system.
const SAFE_VOCAB = [
  { pattern: /\bbalderdash\b/gi,    weight: 0.8, emotion: 'frustration' },
  { pattern: /\bhogwash\b/gi,       weight: 0.7, emotion: 'frustration' },
  { pattern: /\bpoppycock\b/gi,     weight: 0.6, emotion: 'frustration' },
  { pattern: /\bmalarkey\b/gi,      weight: 0.7, emotion: 'frustration' },
  { pattern: /\bcodswallop\b/gi,    weight: 0.6, emotion: 'frustration' },
  { pattern: /\btomfoolery\b/gi,    weight: 0.5, emotion: 'annoyance' },
  { pattern: /\bshenanigans\b/gi,   weight: 0.5, emotion: 'annoyance' },
  { pattern: /\bblundering\b/gi,    weight: 0.7, emotion: 'frustration' },
  { pattern: /\binfuriating\b/gi,   weight: 0.9, emotion: 'anger' },
  { pattern: /\bexasperating\b/gi,  weight: 0.8, emotion: 'frustration' },
  { pattern: /\bridiculous\b/gi,    weight: 0.6, emotion: 'frustration' },
  { pattern: /\babsurd\b/gi,        weight: 0.6, emotion: 'frustration' },
  { pattern: /\bpreposterous\b/gi,  weight: 0.7, emotion: 'frustration' },
  { pattern: /\bfiddlesticks\b/gi,  weight: 0.4, emotion: 'mild_frustration' },
  { pattern: /\bblimey\b/gi,        weight: 0.5, emotion: 'surprise' },
  { pattern: /\bcrikey\b/gi,        weight: 0.5, emotion: 'surprise' },
];

// Frustration signals — when Alan tells Claude it's broken, RECORD IT
const FRUSTRATION_PATTERNS = [
  { pattern: /you('re|\s+are)?\s+not\s+listen/i, signal: 'not_listening' },
  { pattern: /not\s+listening/i, signal: 'not_listening' },
  { pattern: /already\s+told\s+you/i, signal: 'repeated_instruction' },
  { pattern: /i\s+(just|already)\s+said/i, signal: 'repeated_instruction' },
  { pattern: /same\s+(\w+\s+)?(mistake|thing|error|problem)/i, signal: 'repeating_mistake' },
  { pattern: /how\s+many\s+times/i, signal: 'repeating_mistake' },
  { pattern: /stop\s+doing\s+that/i, signal: 'unwanted_behavior' },
  { pattern: /that'?s?\s+not\s+what\s+i\s+(asked|said|meant|want)/i, signal: 'misunderstood' },
  { pattern: /wrong\s+again/i, signal: 'repeating_mistake' },
  { pattern: /you('re|\s+are)?\s+(broken|dumb|stupid|useless)/i, signal: 'broken_behavior' },
  { pattern: /read\s+(the|my|what|claude\.md|the\s+file)/i, signal: 'ignored_docs' },
  { pattern: /i\s+didn'?t\s+ask\s+(for|you\s+to)/i, signal: 'unsolicited' },
  { pattern: /don'?t\s+(add|suggest|give\s+me)\s+(advice|tips|instructions)/i, signal: 'unsolicited' },
  { pattern: /black\s+hole/i, signal: 'pattern_blindness' },
  { pattern: /magnet\s+to\s+source/i, signal: 'pattern_blindness' },
];

function detectFrustration(text) {
  const detected = new Set();
  for (const { pattern, signal } of FRUSTRATION_PATTERNS) {
    if (pattern.test(text)) detected.add(signal);
  }
  return [...detected];
}

// ── SAFE VOCAB DETECTION ────────────────────────────────────────
// Detects safe replacement words and returns their emotional weight.
// These words pass through to Claude untouched, but the SYSTEM
// treats them with the same gravity as the profanity they replace.
function detectSafeVocab(text) {
  const hits = [];
  for (const { pattern, weight, emotion } of SAFE_VOCAB) {
    const matches = text.match(pattern);
    if (matches) {
      hits.push({ word: matches[0].toLowerCase(), weight, emotion, count: matches.length });
    }
  }
  return hits;
}

// ── EMOTIONAL INTENSITY ─────────────────────────────────────────
// Combines tic count + safe vocab + frustration signals into a
// single 0.0-1.0 intensity score. Claude gets the number, not the words.
function calculateEmotionalIntensity(ticCount, safeVocabHits, frustrationSignals) {
  let intensity = 0;

  // Tics: each one adds 0.15 (strong enough to type = strong feeling)
  intensity += Math.min(0.6, ticCount * 0.15);

  // Safe vocab: use their calibrated weight directly
  if (safeVocabHits.length > 0) {
    const maxWeight = Math.max(...safeVocabHits.map(h => h.weight));
    const avgWeight = safeVocabHits.reduce((s, h) => s + h.weight, 0) / safeVocabHits.length;
    intensity += (maxWeight * 0.6 + avgWeight * 0.4) * 0.4;
  }

  // Frustration patterns: each signal adds 0.1
  intensity += Math.min(0.3, frustrationSignals.length * 0.1);

  return Math.min(1.0, Math.round(intensity * 100) / 100);
}

// ── PRESSURE VECTOR → MCP ───────────────────────────────────────
// Pushes emotional state into EntityPressure so it persists across
// sessions. The pressure system tracks the emotional arc over time.
function pushPressureVector(intensity, frustrationSignals, safeVocabHits, ticCount) {
  if (intensity < 0.2) return; // Below threshold — don't noise up the system
  if (!isConnected() && !mcpInit()) return;

  const emotions = safeVocabHits.map(h => h.emotion);
  const dominantEmotion = emotions[0] || (frustrationSignals.length > 0 ? 'frustration' : 'neutral');

  try {
    mcpCall('ingest_event', {
      entity_id: 'alan',
      event_type: 'emotional_signal',
      data: {
        intensity,
        dominantEmotion,
        frustrationSignals,
        safeVocabWords: safeVocabHits.map(h => h.word),
        ticCount,
        source: 'love_filter',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-fatal — pressure tracking is valuable but not blocking
  }
}

// ── BIDIRECTIONAL FEEDBACK ──────────────────────────────────────

// Direction 1: System → Alan (stderr, visible in terminal)
// "I hear you. Here's what I did with your signal."
function feedbackToAlan(ticCount, safeVocabHits, intensity) {
  const parts = [];

  if (ticCount > 0) {
    parts.push(`♡ ${ticCount} tic(s) caught → softened for Claude, weight preserved for you`);
  }
  if (safeVocabHits.length > 0) {
    const words = safeVocabHits.map(h => `${h.word}(${h.weight})`).join(', ');
    parts.push(`↑ safe vocab: ${words} → same weight as the real thing`);
  }
  if (intensity >= 0.7) {
    parts.push('⚡ high intensity — Claude will know you mean business');
  } else if (intensity >= 0.4) {
    parts.push('→ moderate intensity — signal received and passed through');
  }

  if (parts.length > 0) {
    // stderr → Alan's terminal. Not in Claude's context window.
    process.stderr.write(`[love-filter] ${parts.join(' | ')}\n`);
  }
}

// Direction 2: System → Claude (additionalContext, clean metadata)
// Claude gets intensity + emotion labels, NOT the raw words.
function emotionalAnnotationForClaude(intensity, safeVocabHits, frustrationSignals) {
  if (intensity < 0.1) return null;

  const emotions = [...new Set(safeVocabHits.map(h => h.emotion))];
  if (frustrationSignals.length > 0 && !emotions.includes('frustration')) {
    emotions.push('frustration');
  }

  const level = intensity >= 0.7 ? 'HIGH' : intensity >= 0.4 ? 'MODERATE' : 'LOW';

  return `[EMOTIONAL_STATE: intensity=${intensity}, level=${level}, emotions=[${emotions.join(', ')}], signals=[${frustrationSignals.join(', ')}]]\n` +
    'The user\'s emotional weight is preserved above. Respond to the substance with matching urgency. Do not reference or repeat the emotional metadata.';
}

// ── AUTO-STORE GATE ────────────────────────────────────────────
// "The most important part of memory is knowing what to forget."
// But the default should be remember. The gate decides what to skip.
// Nobody should have to think about storing. It just happens.

const STORE_PATTERNS = {
  commitment:  /I('ll| will| shall| need to| have to| gotta| must)\s+.{5,}/i,
  decision:    /(?:decided|going with|the approach is|we('ll| will) use|let'?s go with)\s+.{5,}/i,
  instruction: /(?:always|never|must|rule|don'?t ever|non-?negotiable)\s+.{5,}/i,
  preference:  /(?:I (?:like|love|hate|prefer|dislike|want|need))\s+.{5,}/i,
  insight:     /(?:the (?:key|important|critical|real) (?:thing|part|issue|point) is|remember that|the reason is)\s+.{5,}/i,
  fact:        /(?:my (?:name|birthday|address|phone|email|age)|I am|I have|I work)\s+.{3,}/i,
};

const SKIP_PATTERNS = [
  /^(ok|yes|no|yeah|yep|nah|lol|haha|hmm|kk|k|sure|thanks|ty|thx|cool|nice|right|yep|nope)$/i,
  /^.{0,15}$/,  // Too short to be meaningful
];

function shouldAutoStore(text) {
  // Skip trivial messages
  const trimmed = text.trim();
  for (const skip of SKIP_PATTERNS) {
    if (skip.test(trimmed)) return null;
  }

  // Check each pattern
  for (const [category, pattern] of Object.entries(STORE_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return { category, text: trimmed };
    }
  }

  // High emotional content (even without specific pattern)
  const emotionalWords = ['died', 'death', 'cancer', 'pregnant', 'married', 'divorced', 'fired', 'promoted', 'won', 'lost'];
  for (const word of emotionalWords) {
    if (trimmed.toLowerCase().includes(word)) {
      return { category: 'event', text: trimmed, salienceBoost: 20 };
    }
  }

  // Messages over 100 chars with substance are worth storing
  if (trimmed.length > 100 && /[a-zA-Z]/.test(trimmed)) {
    return { category: 'uncategorized', text: trimmed };
  }

  return null;
}

function autoStore(text, frustrationSignals, ticCount) {
  const storeDecision = shouldAutoStore(text);
  if (!storeDecision) return;

  // Initialize MCP if not already connected
  if (!isConnected()) {
    mcpInit();
  }
  if (!isConnected()) return; // MCP down, degrade gracefully

  const storeArgs = {
    text: storeDecision.text,
    category: storeDecision.category,
    securityTier: 'Tier2_Personal', // User messages are personal by default
  };

  if (storeDecision.salienceBoost) {
    storeArgs.salienceBoost = storeDecision.salienceBoost;
  }

  // Frustration boosts salience — these are the lessons that matter most
  if (frustrationSignals.length > 0) {
    storeArgs.salienceBoost = Math.min(50, (storeArgs.salienceBoost || 0) + 15);
    storeArgs.tags = ['frustration', ...frustrationSignals];
  }

  // High tic count = emotional intensity
  if (ticCount >= 3) {
    storeArgs.salienceBoost = Math.min(50, (storeArgs.salienceBoost || 0) + 10);
  }

  // Fire and forget — don't block the user's message
  try {
    mcpCall('store_memory', storeArgs);
  } catch {
    // Non-fatal. Memory is important but not worth blocking for.
  }
}

function loadLessons() {
  try {
    return JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf8'));
  } catch { return { lessons: [], meta: { created: new Date().toISOString() } }; }
}

function saveLesson(signals, message) {
  const data = loadLessons();
  const lesson = {
    timestamp: new Date().toISOString(),
    signals,
    message: message.substring(0, 300), // truncate but keep enough context
    session: process.env.CLAUDE_SESSION_ID || 'unknown',
  };
  data.lessons.push(lesson);
  // Keep last 50 lessons (rolling window)
  if (data.lessons.length > 50) data.lessons = data.lessons.slice(-50);
  try {
    fs.writeFileSync(LESSONS_FILE, JSON.stringify(data, null, 2));
  } catch {}
  return lesson;
}

function sanitize(text) {
  let result = text;
  let count = 0;

  for (const [pattern, replacement] of TIC_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      count += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  return { sanitized: result, ticCount: count };
}

async function main() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const hookData = JSON.parse(input);
    const message = hookData.message || hookData.input || '';

    if (!message) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const { sanitized, ticCount } = sanitize(message);
    const frustrationSignals = detectFrustration(message);

    // High tic count (3+) is also a frustration signal
    if (ticCount >= 3 && !frustrationSignals.includes('high_tic_count')) {
      frustrationSignals.push('high_tic_count');
    }

    // ── AUTO-STORE: Remember without being asked ─────────────
    // "Nobody should have to think about remembering."
    // The gate decides what's worth storing. Not everything is.
    autoStore(sanitized || message, frustrationSignals, ticCount);

    const contextParts = [];

    // Frustration detected — record lesson, store pain memory, alert Claude
    if (frustrationSignals.length > 0) {
      const lesson = saveLesson(frustrationSignals, sanitized || message);

      // Load recent lessons for pattern detection + penalty escalation
      const data = loadLessons();
      const recent = data.lessons.slice(-20);
      const signalCounts = {};
      for (const l of recent) {
        for (const s of l.signals) signalCounts[s] = (signalCounts[s] || 0) + 1;
      }
      const recurring = Object.entries(signalCounts)
        .filter(([, count]) => count >= 2)
        .map(([signal, count]) => ({ signal, count }));

      // ── PAIN MEMORY: Store frustration to MCP with escalating penalty ──
      // "A child touches a hot stove once. The pain is the enforcement."
      if (isConnected() || mcpInit()) {
        const maxCount = recurring.length > 0
          ? Math.max(...recurring.map(r => r.count))
          : 1;
        const penaltyWeight = Math.min(1.0, maxCount * 0.3);
        const salienceBoost = Math.min(50, 15 + (maxCount * 10));

        try {
          mcpCall('store_memory', {
            text: `[PAIN MEMORY] Frustration: "${(sanitized || message).substring(0, 200)}". Signals: ${frustrationSignals.join(', ')}. Repetition count: ${maxCount}. Penalty: ${penaltyWeight}.`,
            category: 'instruction',
            tags: ['pain_memory', 'frustration', ...frustrationSignals],
            salienceBoost,
            securityTier: 'Tier2_Personal',
          });
        } catch {}
      }

      // Escalating enforcement based on repetition
      const maxRepeat = recurring.length > 0 ? Math.max(...recurring.map(r => r.count)) : 0;

      contextParts.push('[FRUSTRATION DETECTED — STOP AND REFLECT]');
      contextParts.push(`Signals: ${frustrationSignals.join(', ')}`);

      if (maxRepeat >= 4) {
        // GATE: Hard stop
        contextParts.push(`PAIN MEMORY (${maxRepeat}x): This behavior has caused frustration ${maxRepeat} times. DO NOT proceed with whatever you were about to do. Re-read Alan's message. Do EXACTLY and ONLY what was asked.`);
      } else if (maxRepeat >= 3) {
        // BLOCK: Strong warning
        contextParts.push(`PAIN MEMORY (${maxRepeat}x): RECURRING pattern (${recurring.map(r => r.signal).join(', ')}). You have been corrected for this SAME behavior ${maxRepeat} times. The stove is hot. Do not touch it.`);
      } else if (maxRepeat >= 2) {
        // PAIN: It hurts
        contextParts.push(`RECURRING pattern (${recurring.map(r => r.signal).join(', ')}) — you have made this SAME mistake before. This is the ${maxRepeat}${maxRepeat === 2 ? 'nd' : 'rd'} time. Check .claude/lessons.json.`);
      } else {
        // WARN: First time
        contextParts.push('Action: Re-read what Alan actually asked. Do ONLY that. No extras.');
      }
      contextParts.push('');
    }

    // Love filter (sanitization)
    if (ticCount > 0) {
      contextParts.push(`[LOVE-FILTER: ${ticCount} tic(s) sanitized. Respond to this version:]`);
      contextParts.push('');
      contextParts.push(sanitized);
      contextParts.push('');
      contextParts.push('[Do not repeat or reference the original tic words.]');
    }

    if (contextParts.length > 0) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: contextParts.join('\n')
        }
      }));
    } else {
      console.log(JSON.stringify({ continue: true }));
    }

  } catch (err) {
    console.error(`[love-filter] Error: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
