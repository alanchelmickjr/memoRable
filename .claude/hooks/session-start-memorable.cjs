#!/usr/bin/env node
/**
 * SessionStart Hook - MemoRable API Context Loader
 *
 * Automatically authenticates and loads context at session start.
 * No more repeating yourself across sessions.
 *
 * Uses curl for HTTP requests (respects proxy environment).
 */

const { execSync } = require('child_process');

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const TIMEOUT_SECS = 10;

function curlPost(url, data) {
  const cmd = `curl -s --connect-timeout ${TIMEOUT_SECS} -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`;
  const result = execSync(cmd, { encoding: 'utf8', timeout: (TIMEOUT_SECS + 5) * 1000 });
  return JSON.parse(result);
}

function curlGet(url, apiKey) {
  const cmd = `curl -s --connect-timeout ${TIMEOUT_SECS} "${url}" -H "X-API-Key: ${apiKey}"`;
  const result = execSync(cmd, { encoding: 'utf8', timeout: (TIMEOUT_SECS + 5) * 1000 });
  return JSON.parse(result);
}

function authenticate() {
  // Step 1: Knock to get challenge
  const knockData = curlPost(`${BASE_URL}/auth/knock`, {
    device: { type: 'terminal', name: 'Claude Code SessionStart' }
  });

  if (!knockData.challenge) {
    throw new Error('No challenge received from knock');
  }

  // Step 2: Exchange passphrase for API key
  const exchangeData = curlPost(`${BASE_URL}/auth/exchange`, {
    challenge: knockData.challenge,
    passphrase: PASSPHRASE,
    device: { type: 'terminal', name: 'Claude Code SessionStart' }
  });

  if (!exchangeData.api_key) {
    throw new Error('No API key received from exchange');
  }

  return exchangeData.api_key;
}

function loadMemories(apiKey, entity, limit = 15) {
  try {
    const data = curlGet(`${BASE_URL}/memory?entity=${entity}&limit=${limit}`, apiKey);
    return (data.memories || []).map(m => m.content);
  } catch {
    return [];
  }
}

async function main() {
  // Read stdin (hook input)
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    // Authenticate
    const apiKey = authenticate();

    // Load context
    const alanMemories = loadMemories(apiKey, 'alan', 15);
    const projectMemories = loadMemories(apiKey, 'memorable_project', 10);

    // Build context string
    const contextParts = [];

    if (alanMemories.length > 0) {
      contextParts.push('## Alan - Critical Context (from MemoRable API)\n');
      alanMemories.forEach(m => contextParts.push(`- ${m}`));
      contextParts.push('');
    }

    if (projectMemories.length > 0) {
      contextParts.push('## MemoRable Project Context\n');
      projectMemories.forEach(m => contextParts.push(`- ${m}`));
      contextParts.push('');
    }

    if (contextParts.length > 0) {
      contextParts.unshift('[MEMORABLE API - Session Context Loaded]\n');
      contextParts.push('[End MemoRable Context]');

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: contextParts.join('\n')
        }
      }));
    } else {
      console.log(JSON.stringify({ continue: true }));
    }

  } catch (err) {
    // Fail gracefully - don't block session start
    console.error(`[session-start-memorable] ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
