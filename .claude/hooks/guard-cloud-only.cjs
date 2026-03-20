#!/usr/bin/env node
/**
 * Cloud-Only Content Guard (PreToolUse → Write|Edit)
 *
 * Scans file CONTENT before it hits disk. Catches what the other guards miss:
 * - localhost / 127.0.0.1 / hardcoded ports in non-test code
 * - Naked credentials (API_KEY=<value>, Bearer <token>, password=<value>)
 * - Direct fetch/axios/http.request to memory API (should be MCP)
 * - HTTP instead of HTTPS for external endpoints
 *
 * Before each decision, recalls prior pain memories from MCP so enforcement
 * compounds across sessions. "Read it before each write."
 *
 * Stores every block as a pain memory with salience boost.
 *
 * "enforce at the gate, don't ask at the door" — CLAUDE.md Rule 10
 * "NOTHING IS LOCAL" — CLAUDE.md, repeated 20+ times
 */

const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');
const path = require('path');

// ── FILES WE DON'T SCAN ─────────────────────────────────────────────────────
// Tests, docs, config examples, and this hook itself are exempt
const EXEMPT_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\/__tests__\//,
  /\/test\//,
  /\.md$/,
  /\.example$/,
  /\.env\.example$/,
  /CLAUDE\.md$/,
  /guard-cloud-only\.cjs$/,    // don't block yourself
  /mcp-transport\.cjs$/,       // transport layer needs URLs
  /session-start\.sh$/,        // setup scripts
  /session-start-memorable\.cjs$/, // context loader uses curl intentionally
  /guard-destructive\.cjs$/,   // guard references patterns it blocks
  /\.json$/,                   // package.json, tsconfig, etc
  /\.ya?ml$/,                  // CloudFormation, docker-compose — infra files
  /Dockerfile/,                // Docker configs reference ports
  /docker-compose/,            // Docker configs reference ports
];

function isExempt(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return EXEMPT_PATTERNS.some(p => p.test(normalized));
}

// ── CONTENT VIOLATIONS ───────────────────────────────────────────────────────
// Each: pattern to match, why it's bad, what to do instead
const CONTENT_VIOLATIONS = [
  // CLOUD ONLY: no localhost
  {
    pattern: /\blocalhost\b/g,
    id: 'localhost',
    block: true,
    rule: 'CLOUD ONLY: No localhost references',
    reason: 'This project has no local dev. Use cloud endpoints via env vars (MEMORABLE_API_URL).',
    fix: 'Use process.env.MEMORABLE_API_URL or the Elastic IP from CloudFormation stack outputs.',
  },
  // CLOUD ONLY: no 127.0.0.1
  {
    pattern: /\b127\.0\.0\.1\b/g,
    id: 'loopback',
    block: true,
    rule: 'CLOUD ONLY: No loopback addresses',
    reason: 'Same as localhost. Cloud only. No local dev.',
    fix: 'Use process.env.MEMORABLE_API_URL.',
  },
  // CLOUD ONLY: no hardcoded ports for our services
  {
    pattern: /['"`]https?:\/\/[^'"`:]+:(3000|3003|3004|8001|8080|27017|6379)\b/g,
    id: 'hardcoded_port',
    block: true,
    rule: 'CLOUD ONLY: No hardcoded service URLs with ports',
    reason: 'Service URLs must come from environment variables, not hardcoded.',
    fix: 'Use process.env.MEMORABLE_API_URL or similar env var.',
  },
  // RULE 0: No direct HTTP to memory API from agent code
  {
    pattern: /\b(fetch|axios|http\.request|http\.get|https\.request|https\.get)\s*\(\s*['"`].*\b(memory|memorable|memo)\b/g,
    id: 'direct_http',
    block: true,
    rule: 'Rule 0: No direct HTTP to memory API',
    reason: 'All memory operations go through MCP tools. No fetch/axios/http.request.',
    fix: 'Use MCP tools: store_memory, recall, recall_vote, search_memories, whats_relevant.',
  },
  // RULE 0: No fetch/axios to our API paths
  {
    pattern: /\b(fetch|axios)\s*\(\s*['"`].*\/(memory|auth|health|mcp)\b/g,
    id: 'direct_api_path',
    block: true,
    rule: 'Rule 0: No direct HTTP to API paths',
    reason: 'Paths like /memory, /auth, /health, /mcp must go through MCP, not HTTP.',
    fix: 'Use MCP tools. The transport layer handles the HTTP internally.',
  },
  // RULE 2: Naked API keys in code
  {
    pattern: /\b(ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|MONGO_PASSWORD|REDIS_PASSWORD)\s*[:=]\s*['"`][^'"` \n]{8,}/g,
    id: 'naked_secret',
    block: true,
    rule: 'Rule 2: No secrets in code',
    reason: 'API keys and passwords must come from environment variables or .env files.',
    fix: 'Use process.env.<KEY_NAME>. Add the key to .env (gitignored) and .env.example (no value).',
  },
  // Bearer tokens hardcoded
  {
    pattern: /['"`]Bearer\s+[A-Za-z0-9_\-\.]{20,}['"`]/g,
    id: 'bearer_token',
    block: true,
    rule: 'Rule 2: No hardcoded bearer tokens',
    reason: 'Bearer tokens are secrets. They must come from environment or auth flow.',
    fix: 'Use the auth knock/exchange flow or environment variables.',
  },
  // Hardcoded password values (not variable references)
  {
    pattern: /password\s*[:=]\s*['"`][^'"` \n]{4,}['"`]/gi,
    id: 'hardcoded_password',
    block: true,
    rule: 'Rule 2: No hardcoded passwords',
    reason: 'Passwords must come from environment variables.',
    fix: 'Use process.env.<PASSWORD_VAR>.',
  },
];

// ── RECALL PRIOR PAIN ────────────────────────────────────────────────────────
// "Read it before each write" — compound enforcement across sessions
async function recallPriorPain() {
  if (!isConnected() && !mcpInit()) return [];

  try {
    const result = mcpCall('search_memories', {
      query: 'cloud only localhost hardcoded credential guard block',
      limit: 5,
    });
    if (result && Array.isArray(result.memories)) {
      return result.memories.map(m => m.content || m.text || '').filter(Boolean);
    }
  } catch {}
  return [];
}

// ── STORE PAIN MEMORY ────────────────────────────────────────────────────────
function storePainMemory(filePath, violations) {
  if (!isConnected() && !mcpInit()) return;

  const summary = violations.map(v => `[${v.id}] ${v.rule}`).join('; ');
  try {
    mcpCall('store_memory', {
      text: `[CLOUD GUARD BLOCK] Write to "${path.basename(filePath)}" blocked. Violations: ${summary}. ` +
            `Fix: ${violations[0].fix}`,
      category: 'instruction',
      tags: ['guard_block', 'cloud_only', 'pain_memory', ...violations.map(v => v.id)],
      salienceBoost: 30,
    });
  } catch {}
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const hookData = JSON.parse(input);
    const toolName = hookData.tool_name || '';
    const toolInput = hookData.tool_input || {};

    // Only guard Write and Edit
    if (toolName !== 'Write' && toolName !== 'Edit') {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Skip exempt files
    if (isExempt(filePath)) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // Get the content being written
    const content = toolInput.content || toolInput.new_string || '';
    if (!content) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    // ── Scan for violations ──────────────────────────────────────
    const found = [];
    const lines = content.split('\n');

    for (const rule of CONTENT_VIOLATIONS) {
      // Reset regex state
      rule.pattern.lastIndex = 0;

      // Find all matches with line numbers
      for (let i = 0; i < lines.length; i++) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(lines[i])) {
          // Skip if it's in a comment
          const trimmed = lines[i].trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
            continue;
          }
          // Skip if it's a process.env reference (that's correct usage)
          if (/process\.env\b/.test(lines[i]) && rule.id !== 'naked_secret') {
            continue;
          }
          found.push({
            ...rule,
            line: i + 1,
            match: lines[i].trim().substring(0, 120),
          });
          break; // One match per rule is enough
        }
      }
    }

    if (found.length === 0) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const blocks = found.filter(v => v.block);
    const warnings = found.filter(v => !v.block);

    // ── Recall prior pain (compound enforcement) ─────────────────
    const priorPain = await recallPriorPain();
    const priorContext = priorPain.length > 0
      ? `\n\nPRIOR VIOLATIONS (you've done this before):\n${priorPain.map(p => `  - ${p}`).join('\n')}`
      : '';

    // ── HARD BLOCK ───────────────────────────────────────────────
    if (blocks.length > 0) {
      storePainMemory(filePath, blocks);

      const blockMsg = blocks.map(v =>
        `BLOCKED line ${v.line}: [${v.rule}]\n` +
        `  Content: ${v.match}\n` +
        `  Why: ${v.reason}\n` +
        `  Fix: ${v.fix}`
      ).join('\n\n');

      console.log(JSON.stringify({
        decision: 'block',
        reason: `CLOUD-ONLY GUARD: ${blocks.length} violation(s) in "${path.basename(filePath)}":\n\n` +
                blockMsg + priorContext,
      }));
      return;
    }

    // ── SOFT WARNING ─────────────────────────────────────────────
    if (warnings.length > 0) {
      const warnMsg = warnings.map(v =>
        `WARNING line ${v.line}: [${v.rule}] ${v.reason}. Fix: ${v.fix}`
      ).join('\n');

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `[CLOUD GUARD]\n${warnMsg}${priorContext}`,
        },
      }));
      return;
    }

    console.log(JSON.stringify({ continue: true }));

  } catch (err) {
    // Non-fatal — don't block Claude if the hook itself fails
    console.error(`[guard-cloud-only] Error: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
