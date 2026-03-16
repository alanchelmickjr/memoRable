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

    // Frustration detected — record the lesson AND alert Claude NOW
    if (frustrationSignals.length > 0) {
      const lesson = saveLesson(frustrationSignals, sanitized || message);

      // Load recent lessons for pattern detection
      const data = loadLessons();
      const recent = data.lessons.slice(-5);
      const signalCounts = {};
      for (const l of recent) {
        for (const s of l.signals) signalCounts[s] = (signalCounts[s] || 0) + 1;
      }
      const recurring = Object.entries(signalCounts)
        .filter(([, count]) => count >= 2)
        .map(([signal]) => signal);

      contextParts.push('[FRUSTRATION DETECTED — STOP AND REFLECT]');
      contextParts.push(`Signals: ${frustrationSignals.join(', ')}`);
      if (recurring.length > 0) {
        contextParts.push(`RECURRING pattern (${recurring.join(', ')}) — you have made this SAME mistake before. Check .claude/lessons.json.`);
      }
      contextParts.push('Action: Re-read what Alan actually asked. Do ONLY that. No extras.');
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
