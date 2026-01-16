#!/usr/bin/env node
/**
 * MemoRable CLI - A shell that remembers
 *
 * Every command, every thought, every context - remembered.
 * "What was I working on?" just works.
 */

import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Config - HTTPS by default for Betty's data
const API_URL = process.env.MEMORABLE_API || 'https://d3o7gt2rjhcgj0.cloudfront.net';
const API_KEY = process.env.MEMORABLE_API_KEY || '';
const USER = process.env.MEMORABLE_USER || process.env.USER || 'user';
const DEVICE = `cli-${os.hostname()}`;

// Colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// State
let cwd = process.cwd();
let sessionMemories = [];
let lastTensionCheck = null;

// API helpers
async function api(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_URL}${endpoint}`, opts);
    if (res.status === 401) {
      return { error: 'Authentication failed - check MEMORABLE_API_KEY' };
    }
    if (res.status === 429) {
      return { error: 'Rate limited - try again shortly' };
    }
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// Store memory
async function remember(content, type = 'command') {
  const memory = {
    content,
    entities: [USER, 'cli', type],
    metadata: { device: DEVICE, cwd, type, timestamp: new Date().toISOString() }
  };
  sessionMemories.push(memory);
  return api('/memory', 'POST', memory);
}

// Check tension (proactive intervention)
async function checkTension(input) {
  const result = await api('/prosody/tension', 'POST', {
    content: input,
    recentHistory: sessionMemories.slice(-5).map(m => m.content)
  });
  lastTensionCheck = result;
  return result;
}

// Recall memories
async function recall(query, limit = 5) {
  return api(`/memory?entity=${USER}&limit=${limit}&q=${encodeURIComponent(query)}`);
}

// Get briefing
async function briefing() {
  return api(`/dashboard/json`);
}

// Execute shell command
async function shell(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, shell: true });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { error: e.message, stdout: e.stdout?.trim(), stderr: e.stderr?.trim() };
  }
}

// Built-in commands
const builtins = {
  async help() {
    console.log(`
${c.cyan}${c.bright}MemoRable CLI${c.reset} - A shell that remembers

${c.yellow}Built-in commands:${c.reset}
  ${c.green}?${c.reset} <query>      Search your memories
  ${c.green}??${c.reset}             What was I working on?
  ${c.green}!${c.reset} <thought>    Store a thought/note
  ${c.green}cd${c.reset} <dir>       Change directory
  ${c.green}briefing${c.reset}       Get your daily briefing
  ${c.green}status${c.reset}         Check MemoRable status
  ${c.green}exit${c.reset}           Exit (memories persist)

${c.yellow}Everything else${c.reset} runs as a shell command and is remembered.
`);
  },

  async cd(args) {
    const dir = args[0] || os.homedir();
    const target = dir.startsWith('/') ? dir : `${cwd}/${dir}`;
    try {
      process.chdir(target);
      cwd = process.cwd();
      console.log(`${c.dim}${cwd}${c.reset}`);
    } catch (e) {
      console.log(`${c.red}${e.message}${c.reset}`);
    }
  },

  async '?'(args) {
    const query = args.join(' ');
    if (!query) {
      console.log(`${c.yellow}Usage: ? <query>${c.reset}`);
      return;
    }
    console.log(`${c.dim}Searching memories...${c.reset}`);
    const result = await recall(query, 10);
    if (result.memories?.length) {
      result.memories.forEach(m => {
        const date = new Date(m.timestamp).toLocaleDateString();
        console.log(`${c.cyan}[${date}]${c.reset} ${m.content.substring(0, 100)}...`);
      });
    } else {
      console.log(`${c.dim}No memories found for "${query}"${c.reset}`);
    }
  },

  async '??'() {
    console.log(`${c.dim}Checking recent context...${c.reset}`);
    const result = await recall('working on', 5);
    if (result.memories?.length) {
      console.log(`${c.cyan}${c.bright}Recently:${c.reset}`);
      result.memories.forEach(m => {
        const date = new Date(m.timestamp).toLocaleString();
        console.log(`  ${c.dim}${date}${c.reset}`);
        console.log(`  ${m.content.substring(0, 150)}`);
        console.log();
      });
    } else {
      console.log(`${c.dim}No recent context found${c.reset}`);
    }
  },

  async '!'(args) {
    const thought = args.join(' ');
    if (!thought) {
      console.log(`${c.yellow}Usage: ! <thought>${c.reset}`);
      return;
    }
    await remember(thought, 'thought');
    console.log(`${c.green}Remembered.${c.reset}`);
  },

  async briefing() {
    console.log(`${c.dim}Fetching briefing...${c.reset}`);
    const result = await briefing();
    if (result.error) {
      console.log(`${c.red}${result.error}${c.reset}`);
      return;
    }
    console.log(`
${c.cyan}${c.bright}Daily Briefing${c.reset}
${c.yellow}Memories:${c.reset} ${result.stats?.totalMemories || '?'}
${c.yellow}Entities:${c.reset} ${result.stats?.uniqueEntities || '?'}
${c.yellow}Open Loops:${c.reset} ${result.openLoops?.total || 0}
`);
    if (result.openLoops?.items?.length) {
      console.log(`${c.yellow}Pending:${c.reset}`);
      result.openLoops.items.slice(0, 5).forEach(loop => {
        console.log(`  - ${loop.content?.substring(0, 60) || loop.description}...`);
      });
    }
  },

  async status() {
    const health = await api('/health');
    if (health.healthy) {
      console.log(`${c.green}MemoRable: Online${c.reset}`);
      console.log(`${c.dim}API: ${API_URL}${c.reset}`);
      console.log(`${c.dim}User: ${USER}${c.reset}`);
      console.log(`${c.dim}Device: ${DEVICE}${c.reset}`);
    } else {
      console.log(`${c.red}MemoRable: Offline${c.reset}`);
    }
  },

  async exit() {
    console.log(`${c.dim}Session memories: ${sessionMemories.length}${c.reset}`);
    console.log(`${c.cyan}Memories persist. See you.${c.reset}`);
    process.exit(0);
  }
};

// Main REPL
async function main() {
  console.log(`
${c.cyan}${c.bright}MemoRable CLI${c.reset} ${c.dim}v0.1.0${c.reset}
${c.dim}Type 'help' for commands. Everything is remembered.${c.reset}
`);

  // Check status
  const health = await api('/health');
  if (!health.healthy) {
    console.log(`${c.yellow}Warning: MemoRable API not reachable${c.reset}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.cyan}>${c.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Check tension before processing
    const tension = await checkTension(input);
    if (tension.needsIntervention) {
      console.log();
      console.log(`${c.magenta}${tension.suggestedResponse}${c.reset}`);
      console.log();
    }

    // Parse command
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check for builtin
    if (builtins[cmd]) {
      await builtins[cmd](args);
    } else {
      // Run as shell command
      console.log(`${c.dim}$ ${input}${c.reset}`);
      const result = await shell(input);

      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.log(`${c.red}${result.stderr}${c.reset}`);
      if (result.error && !result.stdout && !result.stderr) {
        console.log(`${c.red}${result.error}${c.reset}`);
      }

      // Remember the command
      await remember(`${cwd}: ${input}`, 'command');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${c.cyan}Memories persist.${c.reset}`);
    process.exit(0);
  });
}

main().catch(console.error);
