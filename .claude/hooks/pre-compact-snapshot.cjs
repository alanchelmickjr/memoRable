#!/usr/bin/env node
/**
 * PreCompact Hook - Rolling Time Machine (Single Snapshot)
 *
 * Fires BEFORE Claude compacts context.
 * Snapshots critical coding state to MCP memory.
 *
 * KEY RULE: Only ONE snapshot at a time. Each compaction REPLACES
 * the previous snapshot — we don't accumulate stale context.
 * "Perfect memory is knowing what to forget."
 *
 * What gets saved:
 * - Current branch + git status
 * - Active task / what's being worked on
 * - Key decisions made this session
 * - Important instructions from the user
 * - Files touched (so Claude can re-read after compaction)
 */

const { execSync } = require('child_process');
const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');

// Tag used to find and replace previous snapshot
const SNAPSHOT_TAG = 'compaction_snapshot_current';

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

function getGitState() {
  const state = { branch: '', modifiedFiles: [], recentCommits: [] };
  try {
    state.branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {}
  try {
    const status = execSync('git diff --name-only 2>/dev/null', { encoding: 'utf8' }).trim();
    if (status) state.modifiedFiles = status.split('\n').slice(0, 10);
  } catch {}
  try {
    const log = execSync('git log --oneline -5 2>/dev/null', { encoding: 'utf8' }).trim();
    if (log) state.recentCommits = log.split('\n');
  } catch {}
  return state;
}

function readTranscript(transcriptPath) {
  try {
    const content = execSync(`tail -150 "${transcriptPath}" 2>/dev/null`, { encoding: 'utf8' });
    return content;
  } catch { return null; }
}

function extractCriticalContext(transcript, hookInput) {
  const context = {
    timestamp: new Date().toISOString(),
    session_id: hookInput.session_id || 'unknown',
  };

  if (transcript) {
    // What's being worked on RIGHT NOW
    const currentMatch = transcript.match(/(current(ly)?|working on|doing|task \d+|implementing|fixing|building)[:\s]+([^\n]+)/gi);
    if (currentMatch) context.currentTask = currentMatch[currentMatch.length - 1];

    // Decisions made (these are gold — lose these and you redo work)
    const decisions = transcript.match(/(decided|conclusion|will do|approach|plan|going with|the fix is|solution)[:\s]+([^\n]+)/gi) || [];
    context.decisions = decisions.slice(-5).map(d => d.substring(0, 150));

    // User instructions (non-negotiable directives)
    const instructions = transcript.match(/(important|critical|must|never|always|rule|don't|do not)[:\s]+([^\n]+)/gi) || [];
    context.instructions = instructions.slice(-5).map(i => i.substring(0, 150));

    // Files mentioned (so Claude knows what to re-read)
    const fileRefs = transcript.match(/(?:[\w./]+\.(?:ts|js|cjs|json|md|yaml|yml|py))/g) || [];
    context.filesReferenced = [...new Set(fileRefs)].slice(0, 15);
  }

  return context;
}

function forgetPreviousSnapshot() {
  // Find and forget the previous snapshot so we don't accumulate
  try {
    const previous = mcpCall('recall', {
      query: 'compaction_snapshot_current',
      limit: 3,
    });
    const memories = Array.isArray(previous) ? previous : (previous?.memories || []);
    for (const mem of memories) {
      const text = (mem.text || mem.content || '').toLowerCase();
      if (text.includes('[compaction snapshot]')) {
        const memId = mem.id || mem.memoryId || mem.memory_id;
        if (memId) {
          try { mcpCall('forget', { memory_id: memId }); } catch {}
        }
      }
    }
  } catch {}
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const hookInput = JSON.parse(input);

    const mcpConnected = mcpInit();
    if (!mcpConnected) {
      console.error('[PreCompact] MCP not available — snapshot skipped');
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const project = detectProject();
    const git = getGitState();
    const transcript = hookInput.transcript_path ? readTranscript(hookInput.transcript_path) : null;
    const critical = extractCriticalContext(transcript, hookInput);

    // ── FORGET previous snapshot — only one at a time ──────────
    forgetPreviousSnapshot();

    // ── BUILD new snapshot ─────────────────────────────────────
    const snapshotParts = [
      `[COMPACTION SNAPSHOT] Session ${critical.session_id}`,
      `Branch: ${git.branch || 'unknown'}`,
    ];

    if (critical.currentTask) {
      snapshotParts.push(`Current task: ${critical.currentTask}`);
    }

    if (critical.decisions?.length) {
      snapshotParts.push(`Decisions: ${critical.decisions.join('; ')}`);
    }

    if (critical.instructions?.length) {
      snapshotParts.push(`User instructions: ${critical.instructions.join('; ')}`);
    }

    if (git.modifiedFiles.length > 0) {
      snapshotParts.push(`Modified files: ${git.modifiedFiles.join(', ')}`);
    }

    if (critical.filesReferenced?.length) {
      snapshotParts.push(`Files referenced: ${critical.filesReferenced.join(', ')}`);
    }

    if (git.recentCommits.length > 0) {
      snapshotParts.push(`Recent commits: ${git.recentCommits.join(' | ')}`);
    }

    const snapshotText = snapshotParts.join('. ');

    mcpCall('store_memory', {
      text: snapshotText,
      category: 'startup',
      tags: [SNAPSHOT_TAG, project, 'coding_context'],
      salienceBoost: 20,
    });

    console.error(`[PreCompact] Single snapshot stored (previous forgotten) for ${project}`);
    console.log(JSON.stringify({ continue: true }));

  } catch (e) {
    console.error(`[PreCompact] Error: ${e.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
