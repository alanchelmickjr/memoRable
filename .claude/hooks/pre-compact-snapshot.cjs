#!/usr/bin/env node
/**
 * PreCompact Hook - Rolling Time Machine (PROJECT-LEVEL)
 *
 * Fires BEFORE Claude compacts context.
 * Snapshots critical state to MemoRable (memory store + Redis fast path).
 *
 * THE CONTINUITY LOOP:
 *   This hook SAVES → SessionStart hook LOADS → continuity preserved
 *
 * What gets saved:
 * - Current task list and active task
 * - Session context/decisions
 * - Important instructions
 * - Whatever matters for continuity
 */

const { execSync } = require('child_process');
const path = require('path');

// Common module lives in global hooks dir
const commonPath = path.join(process.env.HOME || '~', '.claude', 'hooks', 'memorable-common.cjs');
let common;
try {
  common = require(commonPath);
} catch {
  common = null;
}

const BASE_URL = common?.BASE_URL || process.env.MEMORABLE_API_URL || process.env.API_BASE_URL || '';
const TIMEOUT = common?.TIMEOUT || 8;

function curl(method, url, apiKey, data) {
  if (common) return common.curl(method, url, apiKey, data);
  if (!BASE_URL) return null;
  try {
    let cmd = `curl -s --connect-timeout ${TIMEOUT} -X ${method} "${url}"`;
    cmd += ` -H "Content-Type: application/json"`;
    if (apiKey) cmd += ` -H "X-API-Key: ${apiKey}"`;
    if (data) cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`;
    return JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: (TIMEOUT + 3) * 1000 }));
  } catch { return null; }
}

function authenticate(deviceName) {
  if (common) return common.authenticate(deviceName);
  if (!BASE_URL) return null;
  const knock = curl('POST', `${BASE_URL}/auth/knock`, null, {
    device: { type: 'terminal', name: deviceName || 'Claude Code PreCompact' }
  });
  if (!knock?.challenge) return null;
  const exchange = curl('POST', `${BASE_URL}/auth/exchange`, null, {
    challenge: knock.challenge,
    passphrase: process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.',
    device: { type: 'terminal', name: deviceName || 'Claude Code PreCompact' }
  });
  return exchange?.api_key || null;
}

function detectProject() {
  if (common) return common.detectProject();
  try {
    const remote = execSync('git remote get-url origin 2>/dev/null', { encoding: 'utf8' }).trim();
    if (remote.includes('memoRable') || remote.includes('memorable')) return 'memorable_project';
    const match = remote.match(/\/([^\/]+?)(?:\.git)?$/);
    if (match) return match[1].toLowerCase().replace(/[^a-z0-9]/g, '_');
  } catch {}
  try {
    return execSync('basename "$PWD"', { encoding: 'utf8' }).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  } catch {}
  return 'personal';
}

function readTranscript(transcriptPath) {
  try {
    const content = execSync(`tail -100 "${transcriptPath}" 2>/dev/null`, { encoding: 'utf8' });
    return content;
  } catch { return null; }
}

function extractCriticalContext(transcript, hookInput) {
  const context = {
    timestamp: new Date().toISOString(),
    trigger: hookInput.trigger || 'unknown',
    session_id: hookInput.session_id || 'unknown',
  };

  if (transcript) {
    const taskMatches = transcript.match(/task[s]?:?\s*([^\n]+)/gi) || [];
    context.tasks = taskMatches.slice(-5);

    const currentMatch = transcript.match(/(current(ly)?|working on|doing|task \d+)[:\s]+([^\n]+)/gi);
    if (currentMatch) context.currentTask = currentMatch[currentMatch.length - 1];

    const decisions = transcript.match(/(decided|conclusion|will do|approach|plan)[:\s]+([^\n]+)/gi) || [];
    context.decisions = decisions.slice(-5);

    const instructions = transcript.match(/(important|critical|must|never|always)[:\s]+([^\n]+)/gi) || [];
    context.instructions = instructions.slice(-10);
  }

  return context;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  // Early exit when no API available
  if (!BASE_URL) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  try {
    const hookInput = JSON.parse(input);
    const apiKey = authenticate('Claude Code PreCompact');
    if (!apiKey) {
      console.error('[PreCompact] Auth failed');
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const project = detectProject();
    const transcript = hookInput.transcript_path ? readTranscript(hookInput.transcript_path) : null;
    const critical = extractCriticalContext(transcript, hookInput);

    // Store snapshot to MemoRable (long-term)
    const snapshot = {
      content: `[COMPACTION SNAPSHOT] Session ${hookInput.session_id || 'unknown'} - ${hookInput.trigger || 'auto'} compaction. Tasks: ${JSON.stringify(critical.tasks || [])}. Current: ${critical.currentTask || 'none'}. Decisions: ${JSON.stringify(critical.decisions || [])}`,
      entities: [project, 'compaction_snapshots'],
      metadata: {
        type: 'compaction_snapshot',
        trigger: hookInput.trigger,
        session_id: hookInput.session_id,
        critical_context: critical,
        timestamp: critical.timestamp
      }
    };

    curl('POST', `${BASE_URL}/memory`, apiKey, snapshot);

    // Also store to Redis context for fast recovery on next SessionStart
    curl('POST', `${BASE_URL}/context/snapshot`, apiKey, {
      entity: project,
      snapshot: critical,
      type: 'pre_compaction'
    });

    console.error(`[PreCompact] Snapshot saved for ${project}`);
    console.log(JSON.stringify({ continue: true }));

  } catch (e) {
    console.error(`[PreCompact] Error: ${e.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
