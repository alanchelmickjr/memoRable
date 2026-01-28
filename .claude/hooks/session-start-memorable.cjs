#!/usr/bin/env node
/**
 * SessionStart Hook - MemoRable Context Loader
 *
 * ENTITY HIERARCHY:
 *   master (alan) → sees ALL sub-entity data
 *   └── sub-entity (repo) → sees ONLY its own data
 *
 * On Claude Code start:
 * 1. Authenticate with MemoRable
 * 2. Detect repo → becomes sub-entity of master
 * 3. Load ONLY sub-entity's context (scoped queries)
 * 4. Check for doc changes → prompt to index
 *
 * NO TIME ESTIMATES. Just what needs doing.
 */

const { execSync } = require('child_process');

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const MASTER_ENTITY = process.env.MEMORABLE_MASTER_ENTITY || 'alan';
const TIMEOUT = 8;

// HARD LIMIT: Configurable per model via env var
// Default 3000 to leave room for CLAUDE.md and system context
const MAX_CONTEXT_CHARS = parseInt(process.env.MEMORABLE_MAX_CONTEXT || '3000', 10);

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
    device: { type: 'terminal', name: 'Claude Code' }
  });
  if (!knock?.challenge) return null;

  const exchange = curl('POST', `${BASE_URL}/auth/exchange`, null, {
    challenge: knock.challenge,
    passphrase: PASSPHRASE,
    device: { type: 'terminal', name: 'Claude Code' }
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

function queryDocs(apiKey, query, limit = 2) {
  // Reduced limit, truncate each to save context
  const data = curl('GET', `${BASE_URL}/memory?entity=claude_docs&query=${encodeURIComponent(query)}&limit=${limit}`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 200) || '');
}

function getProjectContext(apiKey, project) {
  // Reduced limit, truncate each to save context
  const data = curl('GET', `${BASE_URL}/memory?entity=${project}&limit=3`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 150) || '');
}

function getOpenLoops(apiKey, project) {
  // Scope loops to this entity only (sub-entity sees only itself)
  const data = curl('GET', `${BASE_URL}/loops?status=open&entity=${project}&limit=10`, apiKey);
  return data?.loops || [];
}

function checkDocsChanged() {
  // Check git status for docs changes - auto-detect common doc locations
  try {
    const paths = [];
    try { execSync('test -d docs', { encoding: 'utf8' }); paths.push('docs/'); } catch {}
    try { execSync('test -f README.md', { encoding: 'utf8' }); paths.push('README.md'); } catch {}
    try { execSync('test -f CLAUDE.md', { encoding: 'utf8' }); paths.push('CLAUDE.md'); } catch {}
    try { execSync('test -d doc', { encoding: 'utf8' }); paths.push('doc/'); } catch {}
    if (paths.length === 0) return { changed: false, files: [] };
    const status = execSync(`git status --porcelain ${paths.join(' ')} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (!status) return { changed: false, files: [] };
    const files = status.split('\n').map(l => l.replace(/^[A-Z?]{1,2}\s+/, '')).filter(f => f);
    return { changed: files.length > 0, files };
  } catch { return { changed: false, files: [] }; }
}

function getThreeQuestions(apiKey) {
  const data = curl('GET', `${BASE_URL}/memory?entity=doc_engine&query=three+questions&limit=1`, apiKey);
  return data?.memories?.[0]?.content || null;
}

function getAnticipated(apiKey, project) {
  // Get predicted memories based on current context
  const data = curl('POST', `${BASE_URL}/predictions/anticipated`, apiKey, {
    context_frame: { project, activity: 'coding' },
    max_memories: 3
  });
  return data?.anticipated || data?.memories || [];
}

function buildPredictiveGreeting(loops, anticipated, project) {
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  // Priority 1: Overdue loops
  const overdue = loops.filter(l => l.dueDate && new Date(l.dueDate) < new Date());
  if (overdue.length > 0) {
    const first = overdue[0];
    const desc = first.description || first.content || 'a commitment';
    return `Good ${timeGreet}. You have ${overdue.length} overdue item(s). Ready to tackle "${desc}"?`;
  }

  // Priority 2: Due today
  const today = new Date().toDateString();
  const dueToday = loops.filter(l => l.dueDate && new Date(l.dueDate).toDateString() === today);
  if (dueToday.length > 0) {
    const first = dueToday[0];
    const desc = first.description || first.content || 'a commitment';
    return `Good ${timeGreet}. ${dueToday.length} item(s) due today. Start with "${desc}"?`;
  }

  // Priority 3: Anticipated memories (pattern-matched)
  if (anticipated.length > 0) {
    const first = anticipated[0];
    const content = first.content?.slice(0, 80) || 'recent work';
    return `Good ${timeGreet}. Based on patterns, ready to continue: "${content}"?`;
  }

  // Priority 4: Recent project context
  if (project && project !== 'personal') {
    return `Good ${timeGreet}. Ready to work on ${project.replace(/_/g, ' ')}?`;
  }

  // Fallback (still better than "how can I help")
  return `Good ${timeGreet}. What shall we tackle?`;
}

function ensureProjectExists(apiKey, project) {
  // Check if project has any memories
  const existing = curl('GET', `${BASE_URL}/memory?entity=${project}&limit=1`, apiKey);
  if (existing?.memories?.length > 0) return false; // Already exists

  // Create initial project memory with parent relationship
  curl('POST', `${BASE_URL}/memory`, apiKey, {
    content: `Project ${project} initialized as sub-entity of ${MASTER_ENTITY}. Scoped context - sees only its own data.`,
    entities: [project, MASTER_ENTITY],
    metadata: { type: 'project_init', parent_entity: MASTER_ENTITY, entity_scope: project }
  });
  return true; // New project
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const parts = [];

  try {
    const apiKey = authenticate();
    if (!apiKey) throw new Error('Auth failed');

    const project = detectProject();
    const isNewProject = ensureProjectExists(apiKey, project);

    // Entity hierarchy header
    parts.push(`## Entity: ${project}`);
    parts.push(`Parent: ${MASTER_ENTITY} (master sees all, sub sees only itself)`);
    if (isNewProject) {
      parts.push('');
      parts.push('**NEW PROJECT DETECTED**');
      parts.push('**Ask user:** Would you like me to index this repo and start tracking in MemoRable?');
    }
    parts.push('');

    // Check for doc changes
    const docsStatus = checkDocsChanged();
    if (docsStatus.changed) {
      parts.push('## Docs Changed Since Last Index');
      parts.push(`Changed: ${docsStatus.files.join(', ')}`);
      parts.push('**Ask user:** Re-index docs?');
      parts.push('');
    }

    // 0. Get data for predictive greeting (scoped to entity)
    const loops = getOpenLoops(apiKey, project);
    const anticipated = getAnticipated(apiKey, project);

    // 1. PREDICTIVE GREETING (most important - sets the tone)
    const greeting = buildPredictiveGreeting(loops, anticipated, project);
    parts.push(`## ${greeting}`);
    parts.push('');

    // 2. The Three Questions (always load)
    const questions = getThreeQuestions(apiKey);
    if (questions) {
      parts.push('## The Three Questions');
      parts.push(questions);
      parts.push('');
    }

    // 3. Open Loops (scoped to this entity)
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

    // 4. Project-specific context
    const projectCtx = getProjectContext(apiKey, project);
    if (projectCtx.length > 0) {
      parts.push(`## Project: ${project}`);
      projectCtx.slice(0, 5).forEach(c => parts.push(`- ${c.substring(0, 200)}...`));
      parts.push('');
    }

    // 5. Relevant docs (query based on project name)
    const docs = queryDocs(apiKey, project.replace(/_/g, ' '), 3);
    if (docs.length > 0) {
      parts.push('## Relevant Docs');
      docs.forEach(d => {
        const lines = d.split('\n').slice(0, 4).join('\n');
        parts.push(lines);
        parts.push('---');
      });
      parts.push('');
    }

  } catch (e) {
    // Silent fail
  }

  if (parts.length > 0) {
    parts.unshift('# MemoRable Context\n');
    let output = parts.join('\n');

    // HARD LIMIT: Truncate to MAX_CONTEXT_CHARS, keep most recent (end of output)
    if (output.length > MAX_CONTEXT_CHARS) {
      output = '# MemoRable Context (truncated)\n\n' +
               output.slice(-MAX_CONTEXT_CHARS + 50);
    }

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: output
      }
    }));
  } else {
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
