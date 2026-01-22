#!/usr/bin/env node
/**
 * SessionStart Hook - MemoRable API Context Loader
 *
 * Automatically authenticates and loads context at session start.
 * No more repeating yourself across sessions.
 *
 * Flow:
 * 1. Knock -> get challenge (5 min TTL)
 * 2. Exchange passphrase -> get API key
 * 3. Load memories for alan, memorable_project
 * 4. Inject as additionalContext
 */

const BASE_URL = process.env.MEMORABLE_API_URL || 'https://api.memorable.chat';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticate() {
  // Step 1: Knock to get challenge
  const knockResponse = await fetchWithTimeout(`${BASE_URL}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: { type: 'terminal', name: 'Claude Code SessionStart' }
    })
  });

  if (!knockResponse.ok) {
    throw new Error(`Knock failed: ${knockResponse.status}`);
  }

  const knockData = await knockResponse.json();
  const challenge = knockData.challenge;

  if (!challenge) {
    throw new Error('No challenge received from knock');
  }

  // Step 2: Exchange passphrase for API key
  const exchangeResponse = await fetchWithTimeout(`${BASE_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      passphrase: PASSPHRASE,
      device: { type: 'terminal', name: 'Claude Code SessionStart' }
    })
  });

  if (!exchangeResponse.ok) {
    throw new Error(`Exchange failed: ${exchangeResponse.status}`);
  }

  const exchangeData = await exchangeResponse.json();
  return exchangeData.api_key;
}

async function loadMemories(apiKey, entity, limit = 15) {
  const response = await fetchWithTimeout(
    `${BASE_URL}/memory?entity=${entity}&limit=${limit}`,
    {
      headers: { 'X-API-Key': apiKey }
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return (data.memories || []).map(m => m.content);
}

async function main() {
  // Read stdin (hook input)
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    // Authenticate
    const apiKey = await authenticate();

    // Load context in parallel
    const [alanMemories, projectMemories] = await Promise.all([
      loadMemories(apiKey, 'alan', 15),
      loadMemories(apiKey, 'memorable_project', 10)
    ]);

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
