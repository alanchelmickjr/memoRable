#!/usr/bin/env node
/**
 * SessionStart Hook - MemoRable Context Loader
 *
 * On Claude Code start:
 * 1. Authenticate with MemoRable
 * 2. Detect/create project entity
 * 3. Load relevant indexed docs
 * 4. Load open loops (tasks)
 * 5. Load The Three Questions (ENGINE)
 *
 * NO TIME ESTIMATES. Just what needs doing.
 */

const { execSync } = require('child_process');

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const TIMEOUT = 8;

// HARD LIMIT: Configurable per model via env var
// Claude: ~4000, Gemini: ~16000, GPT-4: ~8000
const MAX_CONTEXT_CHARS = parseInt(process.env.MEMORABLE_MAX_CONTEXT || '4000', 10);

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
  // Reduced from 5 to 2 docs max
  const data = curl('GET', `${BASE_URL}/memory?entity=claude_docs&query=${encodeURIComponent(query)}&limit=${limit}`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 300) || ''); // Truncate each
}

function getProjectContext(apiKey, project) {
  // Reduced from 10 to 3, most recent only
  const data = curl('GET', `${BASE_URL}/memory?entity=${project}&limit=3`, apiKey);
  return (data?.memories || []).map(m => m.content?.substring(0, 150) || ''); // Truncate each
}

// TODO: Re-enable after auth is integrated into session start
// function getOpenLoops(apiKey) {
//   const data = curl('GET', `${BASE_URL}/loops?status=open&limit=15`, apiKey);
//   return data?.loops || [];
// }
function getOpenLoops(apiKey) {
  // DISABLED: loops endpoint causing issues, returns empty until auth fixed
  return [];
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
  if (existing?.memories?.length > 0) return;

  // Create initial project memory
  curl('POST', `${BASE_URL}/memory`, apiKey, {
    content: `Project ${project} initialized. Use this entity for project-specific context, decisions, and tasks.`,
    entities: [project],
    metadata: { type: 'project_init' }
  });
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const parts = [];

  try {
    const apiKey = authenticate();
    if (!apiKey) throw new Error('Auth failed');

    const project = detectProject();
    ensureProjectExists(apiKey, project);

    // 0. Get data for predictive greeting
    const loops = getOpenLoops(apiKey);
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

    // 3. Open Loops (tasks/commitments)
    // TODO: Re-enable after auth is integrated into session start
    // if (loops.length > 0) {
    //   parts.push('## Open Loops');
    //   loops.forEach(l => {
    //     // owner: 'self' = you owe, 'them' = owed to you, 'mutual' = shared
    //     const who = l.owner === 'self' ? 'You owe' : l.owner === 'them' ? 'Owed to you' : 'Mutual';
    //     const desc = l.description || l.content || '(no description)';
    //     const party = l.otherParty ? ` (${l.otherParty})` : '';
    //     const due = l.dueDate ? ` - due ${new Date(l.dueDate).toLocaleDateString()}` : '';
    //     parts.push(`- [${who}]${party} ${desc}${due}`);
    //   });
    //   parts.push('');
    // }

    // 3. Project-specific context (already truncated at source)
    const projectCtx = getProjectContext(apiKey, project);
    if (projectCtx.length > 0) {
      parts.push(`## Project: ${project}`);
      projectCtx.forEach(c => parts.push(`- ${c}`));
      parts.push('');
    }

    // 4. Relevant docs (already truncated at source, limit 2)
    const docs = queryDocs(apiKey, project.replace(/_/g, ' '));
    if (docs.length > 0) {
      parts.push('## Relevant Docs');
      docs.forEach(d => parts.push(`- ${d}`));
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
               output.slice(-MAX_CONTEXT_CHARS + 50); // Keep end, leave room for header
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
