#!/usr/bin/env node
/**
 * SessionStart Hook - MemoRable Context Loader (PROJECT-LEVEL)
 *
 * TWO MODES:
 *   1. MCP mode (default) - No server needed. Outputs directives for Claude
 *      to run MCP tools (get_status, set_context, recall). Works everywhere.
 *   2. HTTP mode (legacy) - When BASE_URL is set, loads context via curl.
 *      For when the server comes back online.
 *
 * ENTITY HIERARCHY:
 *   master (alan) → sees ALL sub-entity data
 *   └── sub-entity (repo) → sees ONLY its own data
 *
 * THE CONTINUITY LOOP:
 *   PreCompact saves snapshot → SessionStart loads it → continuity preserved
 *
 * NO TIME ESTIMATES. Just what needs doing.
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// Common module lives in global hooks dir
const commonPath = path.join(process.env.HOME || '~', '.claude', 'hooks', 'memorable-common.cjs');
let common;
try {
  common = require(commonPath);
} catch {
  common = null;
}

const BASE_URL = common?.BASE_URL || process.env.MEMORABLE_API_URL || process.env.API_BASE_URL || '';
const MASTER_ENTITY = common?.MASTER_ENTITY || process.env.MEMORABLE_MASTER_ENTITY || 'alan';
const TIMEOUT = common?.TIMEOUT || 8;

// Context injection limits
const MAX_CONTEXT_CHARS = parseInt(process.env.MEMORABLE_MAX_CONTEXT || '3000', 10);
const LOOPS_LIMIT = parseInt(process.env.MEMORABLE_LOOPS_LIMIT || '5', 10);
const CONTEXT_LIMIT = parseInt(process.env.MEMORABLE_CONTEXT_LIMIT || '3', 10);
const DOCS_LIMIT = parseInt(process.env.MEMORABLE_DOCS_LIMIT || '2', 10);
const ANTICIPATED_LIMIT = parseInt(process.env.MEMORABLE_ANTICIPATED_LIMIT || '3', 10);

// ── Device Detection (no HTTP needed) ────────────────────────────

function detectDevice() {
  const platform = os.platform();   // darwin, linux, win32
  const hostname = os.hostname();

  // Check for known device hints
  const isSSH = !!process.env.SSH_CLIENT || !!process.env.SSH_TTY;
  const isDocker = (() => {
    try { execSync('test -f /.dockerenv', { stdio: 'ignore' }); return true; } catch { return false; }
  })();
  const isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS;

  if (isCI) return { type: 'ci', name: `CI Runner (${process.env.GITHUB_ACTIONS ? 'GitHub' : 'unknown'})`, id: `ci_${hostname}` };
  if (isDocker) return { type: 'container', name: `Docker (${hostname})`, id: `docker_${hostname}` };
  if (isSSH) return { type: 'remote', name: `SSH Session (${hostname})`, id: `ssh_${hostname}` };

  // Local machine
  if (platform === 'darwin') return { type: 'desktop', name: `macOS (${hostname})`, id: 'claude_code_cli' };
  if (platform === 'linux') return { type: 'desktop', name: `Linux (${hostname})`, id: `linux_${hostname}` };
  if (platform === 'win32') return { type: 'desktop', name: `Windows (${hostname})`, id: `win_${hostname}` };

  return { type: 'unknown', name: `Unknown (${hostname})`, id: `unknown_${hostname}` };
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

function detectLocation() {
  const platform = os.platform();
  if (platform === 'darwin') return 'local macOS';
  if (platform === 'linux') return 'local Linux';
  if (platform === 'win32') return 'local Windows';
  return 'local';
}

function checkDocsChanged() {
  try {
    const paths = [];
    try { execSync('test -d docs', { stdio: 'ignore' }); paths.push('docs/'); } catch {}
    try { execSync('test -f README.md', { stdio: 'ignore' }); paths.push('README.md'); } catch {}
    try { execSync('test -f CLAUDE.md', { stdio: 'ignore' }); paths.push('CLAUDE.md'); } catch {}
    try { execSync('test -d doc', { stdio: 'ignore' }); paths.push('doc/'); } catch {}
    if (paths.length === 0) return { changed: false, files: [] };
    const status = execSync(`git status --porcelain ${paths.join(' ')} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (!status) return { changed: false, files: [] };
    const files = status.split('\n').map(l => l.replace(/^[A-Z?]{1,2}\s+/, '')).filter(f => f);
    return { changed: files.length > 0, files };
  } catch { return { changed: false, files: [] }; }
}

// ── MCP Mode: Build directives for Claude ────────────────────────

function buildMcpDirectives(device, project, location) {
  const parts = [];

  parts.push('# MemoRable Session Start');
  parts.push('');
  parts.push('## Device Identity');
  parts.push(`- **Device:** ${device.name} (${device.type})`);
  parts.push(`- **Device ID:** ${device.id}`);
  parts.push(`- **Project:** ${project}`);
  parts.push(`- **Entity:** ${project} | Parent: ${MASTER_ENTITY}`);
  parts.push(`- **Location:** ${location}`);
  parts.push('');

  // Doc changes (detected locally, no HTTP)
  const docsStatus = checkDocsChanged();
  if (docsStatus.changed) {
    parts.push('## Docs Changed Since Last Session');
    parts.push(`Changed: ${docsStatus.files.join(', ')}`);
    parts.push('Consider asking: Re-index docs?');
    parts.push('');
  }

  // THE DIRECTIVE: Implicit user request + MCP tools to run
  parts.push('## USER REQUEST: Context Update on Start');
  parts.push('**User requests context update on start.** This IS the user\'s implicit first request,');
  parts.push('injected by the session-start hook. Execute it BEFORE addressing whatever the user typed.');
  parts.push('Demonstrate the power of MemoRable by KNOWING where we are and PREDICTING what is next.');
  parts.push('');
  parts.push('### Step 1: Run MCP Context Sequence');
  parts.push('Execute these MCP tools NOW, in your first response:');
  parts.push('');
  parts.push('1. **`get_status`** - Confirm MCP is live');
  parts.push(`2. **\`set_context\`** - activity=coding, location="${location}", deviceType=${device.type === 'desktop' ? 'mcp' : device.type}, deviceId=${device.id}, people=[${MASTER_ENTITY}]`);
  parts.push(`3. **\`recall\`** - query="project plan roadmap current task ${project}", limit=10`);
  parts.push(`4. **\`get_anticipated_context\`** - context_frame: { project: "${project}", activity: "coding" }`);
  parts.push(`5. **\`get_predictions\`** - context: { activity: "coding", activity_type: "coding", topics: ["${project}"], talking_to: ["${MASTER_ENTITY}"] }`);
  parts.push('');
  parts.push('### Step 2: Greet as MemoRable Project AI');
  parts.push('After running the MCP tools above, deliver a proactive greeting:');
  parts.push('- State what project/task was last active (from recall)');
  parts.push('- State what is predicted next (from anticipate/predictions)');
  parts.push('- Reference the roadmap or last known state');
  parts.push('- Ask if they want to continue that, or pivot');
  parts.push('- NEVER ask a blank "what are we working on?" - YOU should already know');
  parts.push('- THEN address whatever the user actually typed');
  parts.push('');
  parts.push('### Recall Feedback');
  parts.push('Use `recall_vote` to rate recalled memories: hot/warm/cold/wrong/spark');
  parts.push('');

  return parts.join('\n');
}

// ── HTTP Mode: Legacy server-based context loading ───────────────

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
    device: { type: 'terminal', name: deviceName || 'Claude Code' }
  });
  if (!knock?.challenge) return null;
  const exchange = curl('POST', `${BASE_URL}/auth/exchange`, null, {
    challenge: knock.challenge,
    passphrase: process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.',
    device: { type: 'terminal', name: deviceName || 'Claude Code' }
  });
  return exchange?.api_key || null;
}

function buildIdentityString(project) {
  if (common) return common.buildIdentityString(project);
  return {
    line1: `I am Claude on a development workstation, in the ${project.replace(/_/g, ' ')} project.`,
    line2: `Entity: ${project} | Parent: ${MASTER_ENTITY} | Device: desktop`,
    deviceType: 'desktop',
    projectType: 'unknown'
  };
}

function queryDocs(apiKey, query, limit = 2) {
  const data = curl('GET', `${BASE_URL}/memory?entity=claude_docs&query=${encodeURIComponent(query)}&limit=${limit}`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 200) || '');
}

function getProjectContext(apiKey, project) {
  const data = curl('GET', `${BASE_URL}/memory?entity=${project}&limit=${CONTEXT_LIMIT}`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 150) || '');
}

function getOpenLoops(apiKey, project) {
  const data = curl('GET', `${BASE_URL}/loops?status=open&entity=${project}&limit=${LOOPS_LIMIT}`, apiKey);
  return data?.loops || [];
}

function getAnticipated(apiKey, project) {
  const data = curl('POST', `${BASE_URL}/predictions/anticipated`, apiKey, {
    context_frame: { project, activity: 'coding' },
    max_memories: ANTICIPATED_LIMIT
  });
  return data?.anticipated || data?.memories || [];
}

function getLastCompactionSnapshot(apiKey, project) {
  const fast = curl('GET', `${BASE_URL}/context/snapshot?entity=${project}&type=pre_compaction`, apiKey);
  if (fast?.snapshot) {
    const ts = fast.snapshot.timestamp || fast.timestamp;
    if (ts && (Date.now() - new Date(ts).getTime()) < 24 * 60 * 60 * 1000) {
      return fast.snapshot;
    }
  }
  const data = curl('GET', `${BASE_URL}/memory?entity=${project}&query=compaction+snapshot&limit=1`, apiKey);
  const memory = data?.memories?.[0];
  if (!memory) return null;
  const memTs = memory.metadata?.timestamp || memory.createdAt || memory.created_at;
  if (memTs && (Date.now() - new Date(memTs).getTime()) > 24 * 60 * 60 * 1000) {
    return null;
  }
  return memory.metadata?.critical_context || { content: memory.content };
}

function getThreeQuestions(apiKey) {
  const data = curl('GET', `${BASE_URL}/memory?entity=doc_engine&query=three+questions&limit=1`, apiKey);
  return data?.memories?.[0]?.content || null;
}

function buildPredictiveGreeting(loops, anticipated, project) {
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const overdue = loops.filter(l => l.dueDate && new Date(l.dueDate) < new Date());
  if (overdue.length > 0) {
    const desc = overdue[0].description || overdue[0].content || 'a commitment';
    return `Good ${timeGreet}. You have ${overdue.length} overdue item(s). Ready to tackle "${desc}"?`;
  }
  const today = new Date().toDateString();
  const dueToday = loops.filter(l => l.dueDate && new Date(l.dueDate).toDateString() === today);
  if (dueToday.length > 0) {
    const desc = dueToday[0].description || dueToday[0].content || 'a commitment';
    return `Good ${timeGreet}. ${dueToday.length} item(s) due today. Start with "${desc}"?`;
  }
  if (anticipated.length > 0) {
    const content = anticipated[0].content?.slice(0, 80) || 'recent work';
    return `Good ${timeGreet}. Based on patterns, ready to continue: "${content}"?`;
  }
  if (project && project !== 'personal') {
    return `Good ${timeGreet}. Ready to work on ${project.replace(/_/g, ' ')}?`;
  }
  return `Good ${timeGreet}. What shall we tackle?`;
}

function ensureProjectExists(apiKey, project, identity) {
  const existing = curl('GET', `${BASE_URL}/memory?entity=${project}&limit=1`, apiKey);
  if (existing?.memories?.length > 0) return false;
  curl('POST', `${BASE_URL}/memory`, apiKey, {
    content: `Project ${project} initialized as sub-entity of ${MASTER_ENTITY}. Device: ${identity.deviceType}. Project type: ${identity.projectType}. Scoped context - sees only its own data.`,
    entities: [project, MASTER_ENTITY],
    metadata: {
      type: 'project_init',
      parent_entity: MASTER_ENTITY,
      entity_scope: project,
      device_type: identity.deviceType,
      project_type: identity.projectType
    }
  });
  return true;
}

function buildHttpContext(device, project) {
  const parts = [];

  try {
    const apiKey = authenticate(`Claude Code (${device.name})`);
    if (!apiKey) throw new Error('Auth failed');

    const identity = buildIdentityString(project);
    const isNewProject = ensureProjectExists(apiKey, project, identity);

    parts.push('## Identity');
    parts.push(`${identity.line1} | Device: ${device.name} (${device.id})`);
    parts.push(identity.line2);
    parts.push('');

    if (isNewProject) {
      parts.push('**NEW PROJECT DETECTED** - Ask user about indexing this repo into MemoRable.');
      parts.push('');
    }

    const snapshot = getLastCompactionSnapshot(apiKey, project);
    if (snapshot) {
      parts.push('## Last Session Context');
      if (snapshot.currentTask) parts.push(`**Was working on:** ${snapshot.currentTask}`);
      if (snapshot.tasks?.length > 0) parts.push(`**Tasks:** ${snapshot.tasks.slice(0, 5).join('; ')}`);
      if (snapshot.decisions?.length > 0) parts.push(`**Decisions:** ${snapshot.decisions.slice(0, 3).join('; ')}`);
      if (snapshot.instructions?.length > 0) parts.push(`**Instructions:** ${snapshot.instructions.slice(0, 5).join('; ')}`);
      if (snapshot.content) parts.push(snapshot.content.substring(0, 500));
      parts.push('');
    }

    const docsStatus = checkDocsChanged();
    if (docsStatus.changed) {
      parts.push('## Docs Changed Since Last Index');
      parts.push(`Changed: ${docsStatus.files.join(', ')}`);
      parts.push('Consider asking: Re-index docs?');
      parts.push('');
    }

    const loops = getOpenLoops(apiKey, project);
    const anticipated = getAnticipated(apiKey, project);
    parts.push(`## ${buildPredictiveGreeting(loops, anticipated, project)}`);
    parts.push('');

    const questions = getThreeQuestions(apiKey);
    if (questions) {
      parts.push('## The Three Questions');
      parts.push(questions);
      parts.push('');
    }

    if (loops.length > 0) {
      parts.push(`## Open Loops (${project})`);
      loops.forEach(l => {
        const who = l.owner === 'self' ? 'You owe' : l.owner === 'them' ? 'Owed to you' : 'Mutual';
        const desc = l.description || l.content || '(no description)';
        const party = l.otherParty ? ` (${l.otherParty})` : '';
        const due = l.dueDate ? ` - due ${new Date(l.dueDate).toLocaleDateString()}` : '';
        parts.push(`- [${who}]${party} ${desc}${due}`);
      });
      parts.push('');
    }

    const projectCtx = getProjectContext(apiKey, project);
    if (projectCtx.length > 0) {
      parts.push(`## Project: ${project}`);
      projectCtx.slice(0, 5).forEach(c => parts.push(`- ${c.substring(0, 200)}...`));
      parts.push('');
    }

    const docs = queryDocs(apiKey, project.replace(/_/g, ' '), DOCS_LIMIT);
    if (docs.length > 0) {
      parts.push('## Relevant Docs');
      docs.forEach(d => { parts.push(d.split('\n').slice(0, 4).join('\n')); parts.push('---'); });
      parts.push('');
    }

    parts.push('## Recall Feedback');
    parts.push('Use `recall_vote` to rate recalled memories: hot/warm/cold/wrong/spark');

  } catch (e) {
    // HTTP failed - fall back to MCP directives
    return null;
  }

  return parts.length > 0 ? parts : null;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const device = detectDevice();
  const project = detectProject();
  const location = detectLocation();

  let output = '';

  // Try HTTP mode first (when server is available)
  if (BASE_URL) {
    const httpParts = buildHttpContext(device, project);
    if (httpParts) {
      output = '# MemoRable Context\n\n' + httpParts.join('\n');
    }
  }

  // MCP mode: always available, no server needed
  if (!output) {
    output = buildMcpDirectives(device, project, location);
  }

  // Truncate if needed
  if (output.length > MAX_CONTEXT_CHARS) {
    output = '# MemoRable Context (truncated)\n\n' + output.slice(-MAX_CONTEXT_CHARS + 50);
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: output
    }
  }));
}

main();
