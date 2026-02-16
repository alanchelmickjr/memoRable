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

// Set MEMORABLE_API_URL to your EC2 Elastic IP endpoint (port 8080)
// Get IP: aws cloudformation describe-stacks --stack-name memorable --query 'Stacks[0].Outputs'
const BASE_URL = process.env.MEMORABLE_API_URL || process.env.API_BASE_URL || '';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const MASTER_ENTITY = process.env.MEMORABLE_MASTER_ENTITY || 'alan';
const TIMEOUT = 8;

// HARD LIMIT: Configurable per model via env var
// Default 3000 to leave room for CLAUDE.md and system context
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

function getEnvironmentContext() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

  // Location from system timezone (good enough without GPS)
  const locationMap = {
    'America/Los_Angeles': 'San Francisco Bay Area',
    'America/Denver': 'Denver',
    'America/Chicago': 'Chicago',
    'America/New_York': 'New York',
    'America/Phoenix': 'Phoenix',
    'Pacific/Honolulu': 'Hawaii',
  };
  const location = locationMap[tz] || tz.replace(/_/g, ' ').split('/').pop();

  // Weather from wttr.in (fast, no API key, 3s timeout)
  let weather = null;
  try {
    const raw = execSync('curl -s --connect-timeout 3 "wttr.in/?format=%t+%C" 2>/dev/null', {
      encoding: 'utf8', timeout: 5000
    }).trim();
    if (raw && !raw.includes('Unknown') && !raw.includes('<')) weather = raw;
  } catch {}

  return { time, date, tz, location, weather };
}

function getConnectorStatus(apiKey) {
  // Check MemoRable API health
  const health = curl('GET', `${BASE_URL}/health`, null);
  const apiUp = !!health;

  // Check git branch for integration context
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {}

  // Check if Chloe integration doc exists (connector contract)
  let connectorDoc = false;
  try {
    execSync('test -f docs/CHLOE_MEMORABLE_INTEGRATION.md', { encoding: 'utf8' });
    connectorDoc = true;
  } catch {}

  // MCP tools availability (check if MCP server config exists)
  let mcpConfigured = false;
  try {
    const home = process.env.HOME || '';
    execSync(`test -f "${home}/.claude/claude_desktop_config.json" || test -f "${home}/.claude.json"`, { encoding: 'utf8' });
    mcpConfigured = true;
  } catch {}

  return { apiUp, branch, connectorDoc, mcpConfigured, apiUrl: BASE_URL || '(not set)' };
}

function loadLessons() {
  try {
    const lessonsPath = require('path').join(__dirname, '..', 'lessons.json');
    const data = JSON.parse(require('fs').readFileSync(lessonsPath, 'utf8'));
    return data.lessons || [];
  } catch { return []; }
}

function buildLessonsSection() {
  const lessons = loadLessons();
  if (lessons.length === 0) return null;

  // Get last 5 lessons
  const recent = lessons.slice(-5);

  // Count recurring signals across all lessons
  const signalCounts = {};
  for (const l of lessons) {
    for (const s of l.signals) signalCounts[s] = (signalCounts[s] || 0) + 1;
  }

  const lines = [];
  lines.push('## Lessons (from frustration — DO NOT REPEAT)');

  // Top recurring patterns first
  const recurring = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (recurring.length > 0) {
    lines.push('**Recurring patterns:**');
    for (const [signal, count] of recurring) {
      const label = {
        not_listening: 'Not listening to what was actually asked',
        repeated_instruction: 'Had to be told the same thing twice',
        repeating_mistake: 'Made the same mistake again',
        unwanted_behavior: 'Did something unwanted',
        misunderstood: 'Misunderstood the request',
        broken_behavior: 'Acting broken / not functioning right',
        ignored_docs: 'Didn\'t read the docs / CLAUDE.md',
        unsolicited: 'Added unsolicited advice or extras',
        pattern_blindness: 'Gravitational pull toward bad decisions',
        high_tic_count: 'Pushed Alan past the tic threshold',
      }[signal] || signal;
      lines.push(`- ${label} (${count}x)`);
    }
    lines.push('');
  }

  // Most recent lesson with context
  const last = recent[recent.length - 1];
  const ago = timeSince(new Date(last.timestamp));
  lines.push(`**Last frustration** (${ago}): "${last.message.substring(0, 120)}..."`);
  lines.push('');

  return lines.join('\n');
}

function getVibe() {
  // Rotate lo-fi playlists by day of year
  const playlists = [
    { name: 'Lofi Girl - beats to relax/study to', url: 'https://youtube.com/watch?v=jfKfPfyJRdk' },
    { name: 'Chillhop Music - jazz/lofi hip hop', url: 'https://youtube.com/watch?v=5yx6BWlEVcY' },
    { name: 'College Music - lofi hip hop', url: 'https://youtube.com/watch?v=lTRiuFIWV54' },
    { name: 'The Jazz Hop Cafe', url: 'https://youtube.com/watch?v=JXBvAt1fRCg' },
    { name: 'Lofi Girl - synthwave radio', url: 'https://youtube.com/watch?v=4xDzrJKXOOY' },
    { name: 'Chillhop Music - fall vibes', url: 'https://youtube.com/watch?v=7NOSDKb0HlU' },
    { name: 'Lofi Girl - sleepy lofi', url: 'https://youtube.com/watch?v=rUxyKA_-grg' },
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const hour = new Date().getHours();
  // Late night (before 6am) gets sleepy lofi
  if (hour < 6) return playlists[6];
  return playlists[dayOfYear % playlists.length];
}

function getEasyTask(project, loops, branch) {
  // Priority 1: First open loop that's small
  const easyLoop = loops.find(l =>
    l.description?.length < 100 || l.content?.length < 100
  );
  if (easyLoop) {
    return easyLoop.description || easyLoop.content || null;
  }

  // Priority 2: Based on current branch name
  if (branch?.includes('chloe')) {
    return 'Verify memorable_client.py can connect and authenticate (Phase 1, Step 2)';
  }

  // Priority 3: Based on git status — untracked tests need committing
  try {
    const untracked = execSync('git status --porcelain 2>/dev/null', { encoding: 'utf8' });
    const untrackedTests = untracked.split('\n').filter(l => l.startsWith('??') && l.includes('test'));
    if (untrackedTests.length > 3) {
      return `Commit ${untrackedTests.length} untracked test files — they deserve a home`;
    }
  } catch {}

  // Priority 4: Check if API is down — that's the first thing to fix
  if (project === 'memorable_project') {
    return 'Check EC2 health — API was 502 last session';
  }

  return null;
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getLastSessionRecap() {
  try {
    // What was committed last session?
    const log = execSync('git log --since="3 days ago" --format="%h %s" -10 2>/dev/null', {
      encoding: 'utf8'
    }).trim();
    if (!log) return null;

    const commits = log.split('\n').map(l => {
      const [hash, ...rest] = l.split(' ');
      return { hash, msg: rest.join(' ') };
    });

    const fixes = commits.filter(c => c.msg.startsWith('fix:'));
    const features = commits.filter(c => c.msg.startsWith('feat:'));
    const docs = commits.filter(c => c.msg.startsWith('docs:'));

    const lines = [];
    lines.push('## Last Session');
    if (docs.length > 0) lines.push(`Docs: ${docs.map(c => c.msg.replace('docs: ', '')).join(', ')}`);
    if (features.length > 0) lines.push(`Features: ${features.map(c => c.msg.replace('feat: ', '')).join(', ')}`);
    if (fixes.length > 0) {
      lines.push(`Fixes: ${fixes.length} (${fixes.length >= 3 ? 'infra was fighting back' : 'minor'})`);
    }

    // Honest assessment
    if (fixes.length >= 3) {
      lines.push('**Heads up:** Multiple fix commits in a row = something was stuck. Check if the root cause was resolved or just patched.');
    }

    return lines.join('\n');
  } catch { return null; }
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

  // Environment context (always available, even if API is down)
  const env = getEnvironmentContext();
  parts.push('## Session');
  let sessionLine = `${env.date} | ${env.time} | ${env.location}`;
  if (env.weather) sessionLine += ` | ${env.weather}`;
  parts.push(sessionLine);
  parts.push('');

  // Vibe (lo-fi playlist — Jarvis sets the mood)
  const vibe = getVibe();
  parts.push(`## Vibe: [${vibe.name}](${vibe.url})`);
  parts.push('');

  // Last session recap (git-based honest appraisal)
  const recap = getLastSessionRecap();
  if (recap) {
    parts.push(recap);
    parts.push('');
  }

  // Lessons from frustration (the anti-magnet)
  const lessons = buildLessonsSection();
  if (lessons) {
    parts.push(lessons);
  }

  try {
    const apiKey = authenticate();
    const connector = getConnectorStatus(apiKey);

    // Connector status
    parts.push('## Connector');
    const apiStatus = connector.apiUp ? 'UP' : 'DOWN';
    parts.push(`API: ${apiStatus} (${connector.apiUrl})`);
    if (connector.branch) parts.push(`Branch: \`${connector.branch}\``);
    if (connector.connectorDoc) parts.push('Chloe Integration: contract loaded');
    parts.push(`MCP: ${apiKey ? '37 tools authenticated' : 'auth failed'}`);
    parts.push('');

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

    // 1.5 EASY FIRST TASK (Jarvis suggests where to start)
    const easyTask = getEasyTask(project, loops, connector.branch);
    if (easyTask) {
      parts.push(`## Start Here: ${easyTask}`);
      parts.push('');
    }

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

    // 6. Recall feedback reminder
    parts.push('## REMEMBER');
    parts.push('Use `mcp__memorable__recall_vote` to rate recalled memories:');
    parts.push('- hot=exactly right, warm=close, cold=off, wrong=misleading, spark=triggered idea');
    parts.push('');

  } catch (e) {
    // API down or auth failed — still show what we have
    if (!parts.some(p => p.includes('## Connector'))) {
      const connector = getConnectorStatus(null);
      parts.push('## Connector');
      parts.push(`API: DOWN (${connector.apiUrl})`);
      if (connector.branch) parts.push(`Branch: \`${connector.branch}\``);
      if (connector.connectorDoc) parts.push('Chloe Integration: contract loaded');
      parts.push('MCP: offline — using local context only');
      parts.push('');

      // Still suggest a task even when API is down
      const easyTask = getEasyTask(connector.branch === '' ? 'personal' : 'memorable_project', [], connector.branch);
      if (easyTask) {
        parts.push(`## Start Here: ${easyTask}`);
        parts.push('');
      }
    }
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
