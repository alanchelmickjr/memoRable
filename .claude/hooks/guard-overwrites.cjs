#!/usr/bin/env node
/**
 * Guard Overwrites Hook (PreToolUse)
 *
 * GATE that blocks Claude from overwriting newer/uncommitted files.
 *
 * Three rules:
 * 1. BLOCK writes to files with uncommitted changes (user's work in progress)
 * 2. BLOCK any sourcing from .bak files (stale data)
 * 3. WARN when overwriting a file that was modified more recently than session start
 *
 * "enforce at the gate, don't ask at the door" — CLAUDE.md Rule 10
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Session start time — files modified after this are "fresh work"
const SESSION_START = Date.now();

function getUncommittedFiles() {
  try {
    const output = execSync('git diff --name-only && git diff --cached --name-only', {
      encoding: 'utf8',
      timeout: 5000,
    });
    return new Set(output.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function getUntrackedFiles() {
  try {
    const output = execSync('git ls-files --others --exclude-standard', {
      encoding: 'utf8',
      timeout: 5000,
    });
    return new Set(output.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function isNewerThanSessionStart(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs > (SESSION_START - 60000); // 1min grace
  } catch {
    return false; // File doesn't exist yet — safe to create
  }
}

function resolveRelativePath(filePath) {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    return path.relative(root, abs);
  } catch {
    return filePath;
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const hookData = JSON.parse(input);
    const toolName = hookData.tool_name || '';
    const toolInput = hookData.tool_input || {};

    // Only guard Write and Edit tools
    if (toolName !== 'Write' && toolName !== 'Edit') {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const filePath = toolInput.file_path || toolInput.path || '';
    if (!filePath) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const reasons = [];

    // Rule 1: Block .bak sourcing
    // Check if the new content references or comes from a .bak file
    const newContent = toolInput.content || toolInput.new_string || '';
    if (filePath.endsWith('.bak') || filePath.includes('.bak.')) {
      reasons.push('BLOCKED: Target is a .bak file. Do not read from or write to .bak files.');
    }

    // Rule 2: Block overwrites of files with uncommitted changes
    const relPath = resolveRelativePath(filePath);
    const uncommitted = getUncommittedFiles();
    const untracked = getUntrackedFiles();

    if (uncommitted.has(relPath)) {
      reasons.push(
        `BLOCKED: "${relPath}" has UNCOMMITTED CHANGES. You are about to overwrite the user's work in progress. ` +
        `This has happened 3 times in 7 days. STOP. Ask the user before modifying files with uncommitted changes.`
      );
    }

    // Rule 3: Warn about overwriting recently modified untracked files
    if (untracked.has(relPath) && isNewerThanSessionStart(filePath)) {
      reasons.push(
        `WARNING: "${relPath}" is an untracked file modified recently. ` +
        `Verify this is not the user's work in progress before overwriting.`
      );
    }

    // Rule 4: For Edit tool, check if old_string looks like it came from a .bak
    if (toolName === 'Edit' && toolInput.old_string) {
      // Not much we can do here, but we already block .bak file paths above
    }

    if (reasons.length > 0) {
      const hasBlock = reasons.some(r => r.startsWith('BLOCKED'));
      if (hasBlock) {
        // Hard block — reject the tool call
        console.log(JSON.stringify({
          decision: 'block',
          reason: reasons.join('\n'),
        }));
      } else {
        // Soft warning — let it through with context
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: reasons.join('\n'),
          },
        }));
      }
      return;
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (err) {
    // Non-fatal — don't block Claude if the hook itself fails
    console.error(`[guard-overwrites] Error: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

main();
