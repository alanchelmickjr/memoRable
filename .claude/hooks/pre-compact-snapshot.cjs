#!/usr/bin/env node
/**
 * PreCompact Hook - Rolling Time Machine
 *
 * Fires BEFORE Claude compacts context.
 * Snapshots critical state to Redis via MemoRable API.
 *
 * What gets saved:
 * - Current task list and active task
 * - Session context/decisions
 * - Important instructions
 * - Whatever matters for continuity
 */

const { execSync } = require('child_process');

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const TIMEOUT = 8;

function curl(method, url, apiKey, data) {
  try {
    let cmd = `curl -s --connect-timeout ${TIMEOUT} -X ${method} "${url}"`;
    cmd += ` -H "Content-Type: application/json"`;
    if (apiKey) cmd += ` -H "X-API-Key: ${apiKey}"`;
    if (data) cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`;
    return JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: (TIMEOUT + 3) * 1000 }));
  } catch { return null; }
}

function authenticate() {
  const knock = curl('POST', `${BASE_URL}/auth/knock`, null, {
    device: { type: 'terminal', name: 'Claude Code PreCompact' }
  });
  if (!knock?.challenge) return null;

  const exchange = curl('POST', `${BASE_URL}/auth/exchange`, null, {
    challenge: knock.challenge,
    passphrase: PASSPHRASE,
    device: { type: 'terminal', name: 'Claude Code PreCompact' }
  });
  return exchange?.api_key || null;
}

function detectProject() {
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
  // Read last N lines of transcript to extract important context
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

  // Extract task mentions
  if (transcript) {
    const taskMatches = transcript.match(/task[s]?:?\s*([^\n]+)/gi) || [];
    context.tasks = taskMatches.slice(-5); // Last 5 task mentions

    // Extract "current task" or "working on"
    const currentMatch = transcript.match(/(current(ly)?|working on|doing|task \d+)[:\s]+([^\n]+)/gi);
    if (currentMatch) context.currentTask = currentMatch[currentMatch.length - 1];

    // Extract decisions/conclusions
    const decisions = transcript.match(/(decided|conclusion|will do|approach|plan)[:\s]+([^\n]+)/gi) || [];
    context.decisions = decisions.slice(-5);

    // Extract important instructions
    const instructions = transcript.match(/(important|critical|must|never|always)[:\s]+([^\n]+)/gi) || [];
    context.instructions = instructions.slice(-10);
  }

  return context;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const hookInput = JSON.parse(input);
    const apiKey = authenticate();
    if (!apiKey) {
      console.error('[PreCompact] Auth failed');
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const project = detectProject();
    const transcript = hookInput.transcript_path ? readTranscript(hookInput.transcript_path) : null;
    const critical = extractCriticalContext(transcript, hookInput);

    // Store snapshot to MemoRable
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

    // Also store to Redis context for fast recovery
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
