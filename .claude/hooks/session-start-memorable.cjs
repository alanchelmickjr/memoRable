#!/usr/bin/env node
// CLOUD ONLY — No local dev, no local Docker, no localhost. All infra runs in AWS. No exceptions.
/**
 * SessionStart Hook - MemoRable Context Loader
 *
 * NOTHING IS EVER LOCAL. All memory lives in the cloud.
 * Uses MCP StreamableHTTP protocol — no REST, no knock/exchange.
 * Auth is skin: the device trust is the MCP session.
 *
 * Identity resolution:
 * 1. Check identity cache (cross-session persistence)
 * 2. If cached + high confidence → greet by name, load their context
 * 3. If no cache or low confidence → greet as unknown, wait for first message
 * 4. UserPromptSubmit hook handles stylometry on first message
 *
 * On Claude Code start:
 * 1. Initialize MCP session (skin — no auth ceremony)
 * 2. Resolve identity from cache + device fingerprint
 * 3. Call MCP tools for context (recall, list_loops, etc.)
 * 4. Build predictive greeting + context
 * 5. Output as additionalContext
 */

const { execSync } = require('child_process');
const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');
const { resolveFromCache, buildChallengeContext, getDeviceFingerprint } = require('./identity.cjs');

// HARD LIMIT: Configurable per model via env var
const MAX_CONTEXT_CHARS = parseInt(process.env.MEMORABLE_MAX_CONTEXT || '4000', 10);

// ─── Data Fetchers (MCP tools) ──────────────────────────────────────────────

function getRecall(query, limit = 3) {
  const result = mcpCall('recall', { query, limit });
  if (Array.isArray(result)) return result;
  if (result?.memories) return result.memories;
  return [];
}

function getLoops() {
  const result = mcpCall('list_loops', {});
  if (Array.isArray(result)) return result;
  if (result?.loops) return result.loops;
  return [];
}

function getAnticipated(project) {
  const result = mcpCall('get_anticipated_context', {
    context_frame: { project, activity: 'coding' },
    max_memories: 3
  });
  if (result?.memories) return result.memories;
  if (result?.anticipated) return result.anticipated;
  return [];
}

function getStatus() {
  return mcpCall('get_status', {}) || {};
}

function getRelevantContext() {
  const result = mcpCall('whats_relevant', { unified: true });
  return result || {};
}

// ─── Local Context (no cloud needed) ────────────────────────────────────────

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

function checkDocsChanged() {
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

  const recent = lessons.slice(-5);
  const signalCounts = {};
  for (const l of lessons) {
    for (const s of l.signals) signalCounts[s] = (signalCounts[s] || 0) + 1;
  }

  const lines = [];
  lines.push('## Lessons (from frustration — DO NOT REPEAT)');

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

  const last = recent[recent.length - 1];
  const ago = timeSince(new Date(last.timestamp));
  lines.push(`**Last frustration** (${ago}): "${last.message.substring(0, 120)}..."`);
  lines.push('');

  return lines.join('\n');
}

function getVibe() {
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
  if (hour < 6) return playlists[6];
  return playlists[dayOfYear % playlists.length];
}

function getEasyTask(project, loops, branch) {
  const easyLoop = loops.find(l =>
    l.description?.length < 100 || l.content?.length < 100
  );
  if (easyLoop) {
    return easyLoop.description || easyLoop.content || null;
  }

  if (branch?.includes('chloe')) {
    return 'Verify memorable_client.py can connect and authenticate (Phase 1, Step 2)';
  }

  try {
    const untracked = execSync('git status --porcelain 2>/dev/null', { encoding: 'utf8' });
    const untrackedTests = untracked.split('\n').filter(l => l.startsWith('??') && l.includes('test'));
    if (untrackedTests.length > 3) {
      return `Commit ${untrackedTests.length} untracked test files — they deserve a home`;
    }
  } catch {}

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

function getEnvironmentContext() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

  // IP geolocation — city-level, zero config
  let location = null;
  let weather = null;
  try {
    const geo = JSON.parse(execSync('curl -s --connect-timeout 3 ipinfo.io/json 2>/dev/null', {
      encoding: 'utf8', timeout: 5000
    }));
    if (geo.city) {
      location = geo.region ? `${geo.city}, ${geo.region}` : geo.city;
    }
  } catch {}

  // Timezone fallback if IP geolocation fails
  if (!location) {
    const locationMap = {
      'America/Los_Angeles': 'San Francisco Bay Area',
      'America/Denver': 'Denver',
      'America/Chicago': 'Chicago',
      'America/New_York': 'New York',
      'America/Phoenix': 'Phoenix',
      'Pacific/Honolulu': 'Hawaii',
    };
    location = locationMap[tz] || tz.replace(/_/g, ' ').split('/').pop();
  }

  try {
    const raw = execSync('curl -s --connect-timeout 3 "wttr.in/?format=%t+%C" 2>/dev/null', {
      encoding: 'utf8', timeout: 5000
    }).trim();
    if (raw && !raw.includes('Unknown') && !raw.includes('<')) weather = raw;
  } catch {}

  return { time, date, tz, location, weather };
}

function getLastSessionRecap() {
  try {
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

    if (fixes.length >= 3) {
      lines.push('**Heads up:** Multiple fix commits in a row = something was stuck. Check if the root cause was resolved or just patched.');
    }

    return lines.join('\n');
  } catch { return null; }
}

function buildPredictiveGreeting(loops, anticipated, project, opts = {}) {
  const { name, location } = opts;
  const nameGreet = name ? `Hi ${name}!` : 'Hey!';
  const locationLine = location ? ` Coding from ${location} I see.` : '';

  const overdue = loops.filter(l => l.dueDate && new Date(l.dueDate) < new Date());
  if (overdue.length > 0) {
    const first = overdue[0];
    const desc = first.description || first.content || 'a commitment';
    return `${nameGreet}${locationLine} You have ${overdue.length} overdue item(s). Ready to tackle "${desc}"?`;
  }

  const today = new Date().toDateString();
  const dueToday = loops.filter(l => l.dueDate && new Date(l.dueDate).toDateString() === today);
  if (dueToday.length > 0) {
    const first = dueToday[0];
    const desc = first.description || first.content || 'a commitment';
    return `${nameGreet}${locationLine} ${dueToday.length} item(s) due today. Start with "${desc}"?`;
  }

  if (anticipated.length > 0) {
    const first = anticipated[0];
    const content = first.content?.slice(0, 80) || 'recent work';
    return `${nameGreet}${locationLine} Ready to continue: "${content}"?`;
  }

  if (project && project !== 'personal') {
    return `${nameGreet}${locationLine} Ready to proceed with the plan for ${project.replace(/_/g, ' ')}?`;
  }

  return `${nameGreet}${locationLine} What shall we tackle?`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  const parts = [];

  // Environment context (always available, even if cloud is down)
  const env = getEnvironmentContext();
  parts.push('## Session');
  let sessionLine = `${env.date} | ${env.time} | ${env.location}`;
  if (env.weather) sessionLine += ` | ${env.weather}`;
  parts.push(sessionLine);
  parts.push('');

  // Vibe
  const vibe = getVibe();
  parts.push(`## Vibe: [${vibe.name}](${vibe.url})`);
  parts.push('');

  // Last session recap (git-based)
  const recap = getLastSessionRecap();
  if (recap) {
    parts.push(recap);
    parts.push('');
  }

  // Lessons from frustration
  const lessons = buildLessonsSection();
  if (lessons) {
    parts.push(lessons);
  }

  // Git context
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {}

  let connectorDoc = false;
  try {
    execSync('test -f docs/CHLOE_MEMORABLE_INTEGRATION.md', { encoding: 'utf8' });
    connectorDoc = true;
  } catch {}

  const project = detectProject();

  // ─── Identity Resolution (cache + device fingerprint) ───
  const identity = resolveFromCache();
  const identifiedEntity = identity.entity;

  // ─── MCP Cloud Connection (MCP init IS the health check) ───
  const mcpConnected = mcpInit();

  parts.push('## Connector');
  parts.push(`MCP: ${mcpConnected ? 'UP (StreamableHTTP)' : 'DOWN'} (${require('./mcp-transport.cjs').MCP_URL})`);
  if (branch) parts.push(`Branch: \`${branch}\``);
  if (connectorDoc) parts.push('Chloe Integration: contract loaded');
  parts.push(`Identity: ${identifiedEntity || 'unknown'} (${identity.source}, ${Math.round(identity.confidence * 100)}%)`);
  parts.push('');

  // Identity challenge context (if needed)
  const challengeCtx = buildChallengeContext(identity);
  if (challengeCtx) {
    parts.push('## Identity');
    parts.push(challengeCtx);
    parts.push('');
  }

  // ─── Write context to Redis (give the cloud eyes) ───
  if (mcpConnected) {
    try {
      const deviceFingerprint = getDeviceFingerprint();
      mcpCall('set_context', {
        location: env.location || undefined,
        activity: 'coding',
        people: identifiedEntity ? [identifiedEntity] : undefined,
        deviceId: deviceFingerprint.deviceId || `claude-code-${require('os').hostname()}`,
        deviceType: 'desktop',
      });
    } catch (e) {
      // Context write failed — non-fatal, continue
    }
  }

  if (mcpConnected && identifiedEntity) {
    try {
      // Fetch context via MCP tools — no auth needed, skin
      const loops = getLoops();
      const anticipated = getAnticipated(project);

      // Predictive greeting (personalized)
      const relevant = getRelevantContext();
      const greetLocation = relevant?.location || env.location;
      const greetName = identifiedEntity.charAt(0).toUpperCase() + identifiedEntity.slice(1);
      const greeting = buildPredictiveGreeting(loops, anticipated, project, { name: greetName, location: greetLocation });
      parts.push(`## ${greeting}`);
      parts.push('');

      // Easy first task
      const easyTask = getEasyTask(project, loops, branch);
      if (easyTask) {
        parts.push(`## Start Here: ${easyTask}`);
        parts.push('');
      }

      // Open Loops
      if (loops.length > 0) {
        parts.push(`## Open Loops`);
        loops.forEach(l => {
          const who = l.owner === 'self' ? 'You owe' : l.owner === 'them' ? 'Owed to you' : 'Mutual';
          const desc = l.description || l.content || '(no description)';
          const party = l.otherParty ? ` (${l.otherParty})` : '';
          const due = l.dueDate ? ` - due ${new Date(l.dueDate).toLocaleDateString()}` : '';
          parts.push(`- [${who}]${party} ${desc}${due}`);
        });
        parts.push('');
      }

      // Recent memories for this project
      const memories = getRecall(project.replace(/_/g, ' '), 3);
      if (memories.length > 0) {
        parts.push(`## Recent Context`);
        memories.forEach(m => {
          const content = (m.content || m.text || '').substring(0, 150);
          if (content) parts.push(`- ${content}`);
        });
        parts.push('');
      }

    } catch (e) {
      parts.push(`## MCP tool error: ${e.message || 'unknown'}`);
      parts.push('');
    }
  } else if (mcpConnected && !identifiedEntity) {
    // MCP is up but we don't know who this is
    // Challenge context already injected above — don't duplicate
    if (!challengeCtx) {
      parts.push('## Welcome to MemoRable');
      parts.push('Identity not yet confirmed.');
      parts.push('');
    }
  }

  // Check for doc changes (always, even offline)
  const docsStatus = checkDocsChanged();
  if (docsStatus.changed) {
    parts.push('## Docs Changed Since Last Index');
    parts.push(`Changed: ${docsStatus.files.join(', ')}`);
    parts.push('**Ask user:** Re-index docs?');
    parts.push('');
  }

  // Fallback greeting if MCP was down
  if (!mcpConnected) {
    if (identifiedEntity) {
      const greetLocation = env.location;
      const greetName = identifiedEntity.charAt(0).toUpperCase() + identifiedEntity.slice(1);
      const greeting = buildPredictiveGreeting([], [], project, { name: greetName, location: greetLocation });
      parts.push(`## ${greeting}`);
    } else {
      parts.push('## MCP is down and identity unknown. Say hello to get started.');
    }
    parts.push('');

    const easyTask = getEasyTask(project, [], branch);
    if (easyTask) {
      parts.push(`## Start Here: ${easyTask}`);
      parts.push('');
    }
  }

  // Recall feedback reminder
  parts.push('## REMEMBER');
  parts.push('Use `mcp__memorable__recall_vote` to rate recalled memories:');
  parts.push('- hot=exactly right, warm=close, cold=off, wrong=misleading, spark=triggered idea');
  parts.push('');

  if (parts.length > 0) {
    parts.unshift('# MemoRable Context\n');
    let output = parts.join('\n');

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
