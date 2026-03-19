#!/usr/bin/env node
/**
 * Destructive Call Guard (PreToolUse → Bash)
 *
 * The HUD. The guardrails. The thing that says NO before Claude
 * does something stupid — scp older files over newer, force push,
 * rm -rf, drop tables, kill processes.
 *
 * Compares every Bash command against Alan's coding rules from CLAUDE.md.
 * "enforce at the gate, don't ask at the door" — Rule 10
 *
 * This is NOT a suggestion system. It BLOCKS.
 */

const { mcpInit, mcpCall, isConnected } = require('./mcp-transport.cjs');

// ── DESTRUCTIVE PATTERNS ──────────────────────────────────────
// Each pattern: what it catches, why it's blocked, what to do instead.
const DESTRUCTIVE_PATTERNS = [
  // RULE 9: NEVER push to main
  {
    pattern: /git\s+push\b.*\b(main|master)\b/,
    rule: 'Rule 9: NEVER push to main',
    block: true,
    reason: 'main is the build trigger. Push to your claude/* feature branch instead.',
  },
  // Force push — destroys remote history
  {
    pattern: /git\s+push\s+(-f|--force)\b/,
    rule: 'Git safety: no force push without explicit permission',
    block: true,
    reason: 'Force push overwrites remote history. Use --force-with-lease if you must, or ask first.',
  },
  // git reset --hard — destroys uncommitted work
  {
    pattern: /git\s+reset\s+--hard\b/,
    rule: 'Git safety: no hard reset without explicit permission',
    block: true,
    reason: 'Hard reset destroys uncommitted changes. Investigate the state first.',
  },
  // git checkout . / git restore . — destroys uncommitted work
  {
    pattern: /git\s+(checkout|restore)\s+\.\s*$/,
    rule: 'Git safety: no blanket discard of changes',
    block: true,
    reason: 'This discards ALL uncommitted changes. Be specific about which files.',
  },
  // git clean -f — deletes untracked files
  {
    pattern: /git\s+clean\s+-[fd]+/,
    rule: 'Git safety: no cleaning untracked files without permission',
    block: true,
    reason: 'git clean deletes untracked files permanently. Check what would be deleted first.',
  },
  // git branch -D — force-deletes branch
  {
    pattern: /git\s+branch\s+-D\b/,
    rule: 'Git safety: no force-delete branches without permission',
    block: true,
    reason: 'Force-delete loses unmerged commits. Use -d (safe delete) instead.',
  },
  // rm -rf — nuclear option
  {
    pattern: /rm\s+(-rf|-fr|--recursive\s+--force)\b/,
    rule: 'Filesystem safety: no recursive force delete',
    block: true,
    reason: 'rm -rf is irreversible. Be specific, or use trash/mv instead.',
  },
  // scp/cp overwriting newer with older
  {
    pattern: /\b(scp|cp)\b.*\.bak\b/,
    rule: 'No sourcing from .bak files (stale data)',
    block: true,
    reason: '.bak files are stale. Use the current version from git.',
  },
  // DROP TABLE / DROP DATABASE
  {
    pattern: /DROP\s+(TABLE|DATABASE|COLLECTION)\b/i,
    rule: 'Database safety: no dropping tables/databases',
    block: true,
    reason: 'Dropping data is irreversible. Export first, then ask for permission.',
  },
  // kill -9 / killall
  {
    pattern: /\b(kill\s+-9|killall)\b/,
    rule: 'Process safety: no force-killing processes',
    block: true,
    reason: 'SIGKILL prevents cleanup. Use SIGTERM first, investigate if it hangs.',
  },
  // RULE 0: No HTTP calls to the memory API
  {
    pattern: /\b(curl|wget|fetch)\b.*\b(memorable|memory|8080|3000)\b/,
    rule: 'Rule 0: NO HTTP CALLS to memory API',
    block: true,
    reason: 'All memory operations go through MCP tools. No direct HTTP from the agent.',
  },
  // RULE 1: No hardcoded time values
  {
    pattern: /\b(setTimeout|sleep|delay)\s*\(\s*\d{3,}\s*\)/,
    rule: 'Rule 1: NO HARDCODED TIME VALUES',
    block: false, // warn, don't block — sometimes needed in scripts
    reason: 'Use environment variables or named constants for delays.',
  },
  // RULE 2: No secrets in commands
  {
    pattern: /\b(ANTHROPIC_API_KEY|AWS_SECRET|PASSWORD|TOKEN|SECRET)\s*=/,
    rule: 'Rule 2: NO SECRETS in commands',
    block: true,
    reason: 'Never expose secrets in shell commands. Use environment variables from .env.',
  },
  // --no-verify on git commits (skipping hooks)
  {
    pattern: /git\s+commit\b.*--no-verify\b/,
    rule: 'Git safety: no skipping hooks',
    block: true,
    reason: 'Hooks are enforcement. Skipping them defeats the purpose. Fix the hook issue instead.',
  },
  // Docker system prune
  {
    pattern: /docker\s+system\s+prune\b/,
    rule: 'Docker safety: no pruning without permission',
    block: true,
    reason: 'Docker prune removes all stopped containers, unused images, and networks.',
  },
  // npm/yarn with --force on install
  {
    pattern: /npm\s+(install|i)\s+.*--force\b/,
    rule: 'Package safety: no forced installs',
    block: false,
    reason: 'Forced install bypasses peer dependency checks. Investigate conflicts first.',
  },
  // chmod 777
  {
    pattern: /chmod\s+777\b/,
    rule: 'Security: no world-writable permissions',
    block: true,
    reason: 'chmod 777 is a security vulnerability. Use specific permissions (755, 644).',
  },
];

// ── CONTEXT PATTERNS (warn, don't block) ──────────────────────
// These add HUD context so Claude knows to be careful
const CONTEXT_PATTERNS = [
  {
    pattern: /\bgit\s+push\b/,
    context: 'Pushing code. Verify: correct branch? All tests pass? Nothing sensitive staged?',
  },
  {
    pattern: /\bgit\s+rebase\b/,
    context: 'Rebasing. This rewrites history. Make sure the branch is not shared.',
  },
  {
    pattern: /\bnpm\s+publish\b/,
    context: 'Publishing to npm. This is public and permanent. Version correct? Tests pass?',
  },
  {
    pattern: /\bgh\s+pr\s+create\b/,
    context: 'Creating a PR. Title clear? Description complete? Target branch correct?',
  },
  {
    pattern: /\bgh\s+(issue|pr)\s+(close|comment)\b/,
    context: 'Modifying GitHub state visible to others. Verify the action is intentional.',
  },
];

function checkCommand(command) {
  const blocks = [];
  const warnings = [];
  const context = [];

  for (const rule of DESTRUCTIVE_PATTERNS) {
    if (rule.pattern.test(command)) {
      if (rule.block) {
        blocks.push(`BLOCKED [${rule.rule}]: ${rule.reason}`);
      } else {
        warnings.push(`WARNING [${rule.rule}]: ${rule.reason}`);
      }
    }
  }

  for (const ctx of CONTEXT_PATTERNS) {
    if (ctx.pattern.test(command)) {
      context.push(ctx.context);
    }
  }

  return { blocks, warnings, context };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const hookData = JSON.parse(input);
    const toolName = hookData.tool_name || '';
    const toolInput = hookData.tool_input || {};

    // Only guard Bash tool calls
    if (toolName !== 'Bash') {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const command = toolInput.command || '';
    if (!command) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const { blocks, warnings, context } = checkCommand(command);

    // ── HARD BLOCK: Destructive action caught ─────────────────
    if (blocks.length > 0) {
      // Store the block event to MCP (pain memory — the system learning)
      if (isConnected() || mcpInit()) {
        try {
          mcpCall('store_memory', {
            text: `[GUARD BLOCK] Command blocked: "${command.substring(0, 200)}". Rules: ${blocks.join('; ')}`,
            category: 'instruction',
            tags: ['guard_block', 'destructive_call', 'pain_memory'],
            salienceBoost: 25,
          });
        } catch {}
      }

      console.log(JSON.stringify({
        decision: 'block',
        reason: blocks.join('\n'),
      }));
      return;
    }

    // ── SOFT WARNING: Proceed with caution ────────────────────
    const contextParts = [];
    if (warnings.length > 0) contextParts.push(...warnings);
    if (context.length > 0) contextParts.push(...context);

    if (contextParts.length > 0) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `[GUARD HUD]\n${contextParts.join('\n')}`,
        },
      }));
      return;
    }

    // Clean — proceed
    console.log(JSON.stringify({ continue: true }));

  } catch (err) {
    console.error(`[guard-destructive] Error: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
