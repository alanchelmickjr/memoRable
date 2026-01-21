#!/usr/bin/env node
/**
 * Love Filter Hook for Claude Code
 *
 * When 120wpm gets ahead of the heart, this catches you.
 * Sanitizes tics and passes the CLEAN version via additionalContext.
 * Claude responds to the clean version, not the original.
 *
 * "no garbage in your mind" - Alan
 */

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

    if (ticCount > 0) {
      // Pass sanitized version via additionalContext
      // Claude sees this and responds to IT, not the original
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[LOVE-FILTER ACTIVE: User's message sanitized. Respond to this version:]\n\n${sanitized}\n\n[End sanitized message. Do not repeat or reference the original tic words.]`
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
