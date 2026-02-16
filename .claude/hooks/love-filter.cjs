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
