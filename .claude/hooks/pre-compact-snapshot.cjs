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
const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');

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

    // Use MCP transport (same as session-start) — not raw curl (blocked by proxy)
    const mcpConnected = mcpInit();
    if (!mcpConnected) {
      console.error('[PreCompact] MCP not available — snapshot skipped');
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const project = detectProject();
    const transcript = hookInput.transcript_path ? readTranscript(hookInput.transcript_path) : null;
    const critical = extractCriticalContext(transcript, hookInput);

    // Store snapshot via MCP store_memory — goes through the real pipeline
    // with salience scoring, session threading, commitment detection
    const snapshotText = [
      `[COMPACTION SNAPSHOT] Session ${hookInput.session_id || 'unknown'}`,
      critical.currentTask ? `Current task: ${critical.currentTask}` : null,
      critical.decisions?.length ? `Decisions: ${critical.decisions.join('; ')}` : null,
      critical.tasks?.length ? `Active tasks: ${critical.tasks.join('; ')}` : null,
      critical.instructions?.length ? `Key instructions: ${critical.instructions.slice(0, 5).join('; ')}` : null,
    ].filter(Boolean).join('. ');

    mcpCall('store_memory', {
      text: snapshotText,
      category: 'startup',
      tags: ['compaction_snapshot', project],
      salienceBoost: 15,  // Compaction snapshots matter for continuity
    });

    console.error(`[PreCompact] Snapshot stored via MCP for ${project}`);
    console.log(JSON.stringify({ continue: true }));

  } catch (e) {
    console.error(`[PreCompact] Error: ${e.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
