#!/usr/bin/env npx tsx
/**
 * Project Indexer - Auto-index any git repo to MemoRable
 *
 * Detects .git, absorbs docs and code, tags with project entity.
 * Living projects that document themselves.
 *
 * Usage:
 *   npx tsx scripts/index-project.ts /path/to/repo project_name
 *   npx tsx scripts/index-project.ts ~/dev/android-bot android_bot
 *   npx tsx scripts/index-project.ts . memorable_project  # current dir
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AdaptiveChunker, Chunk } from '../src/services/ingestion_pipeline/index.js';

// ============================================================================
// CONFIG
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';

// File patterns to index
const DOC_EXTENSIONS = ['md', 'txt', 'rst'];
const CODE_EXTENSIONS = ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'dart', 'swift', 'c', 'cpp', 'h', 'rb', 'php'];
const CONFIG_EXTENSIONS = ['json', 'yaml', 'yml', 'toml'];

// Directories to ignore
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.terraform', 'coverage', '__pycache__', '.gradle', '.idea', '.vscode'];

// ============================================================================
// AUTH
// ============================================================================

async function authenticate(): Promise<string | null> {
  try {
    // Knock
    const knockResp = await fetch(`${BASE_URL}/auth/knock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: { type: 'terminal', name: 'ProjectIndexer' } })
    });
    if (!knockResp.ok) return null;
    const knockData = await knockResp.json();

    // Exchange
    const exchangeResp = await fetch(`${BASE_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge: knockData.challenge,
        passphrase: PASSPHRASE,
        device: { type: 'terminal', name: 'ProjectIndexer' }
      })
    });
    if (!exchangeResp.ok) return null;
    const exchangeData = await exchangeResp.json();
    return exchangeData.api_key || null;
  } catch {
    return null;
  }
}

// ============================================================================
// FILE SCANNER
// ============================================================================

interface FileSource {
  filename: string;
  content: string;
  type: 'doc' | 'code' | 'config';
}

function scanRepo(repoPath: string): FileSource[] {
  const files: FileSource[] = [];
  const allExtensions = [...DOC_EXTENSIONS, ...CODE_EXTENSIONS, ...CONFIG_EXTENSIONS];

  function getType(ext: string): 'doc' | 'code' | 'config' {
    if (DOC_EXTENSIONS.includes(ext)) return 'doc';
    if (CODE_EXTENSIONS.includes(ext)) return 'code';
    return 'config';
  }

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(repoPath, full);

      // Skip ignored directories
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.includes(entry.name)) {
          walk(full);
        }
        continue;
      }

      // Check extension
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (allExtensions.includes(ext)) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          // Skip very large files (>100KB)
          if (content.length <= 100000) {
            files.push({ filename: rel, content, type: getType(ext) });
          }
        } catch {}
      }
    }
  }

  walk(repoPath);
  return files;
}

// ============================================================================
// STORAGE
// ============================================================================

interface StoreResult {
  success: boolean;
  error?: string;
}

async function storeChunk(
  apiKey: string,
  chunk: Chunk,
  projectEntity: string
): Promise<StoreResult> {
  const entity = chunk.metadata.sourceType === 'code' ? `${projectEntity}_code` : `${projectEntity}_docs`;

  const body = {
    content: `[${chunk.metadata.sourceFile}]${chunk.metadata.section ? ` ${chunk.metadata.section}` : ''}\n\n${chunk.content}`,
    entities: [projectEntity, entity],
    metadata: {
      source_file: chunk.metadata.sourceFile,
      source_type: chunk.metadata.sourceType,
      section: chunk.metadata.section,
      chunk_index: chunk.metadata.chunkIndex,
      line_start: chunk.metadata.lineStart,
      line_end: chunk.metadata.lineEnd,
      indexed_at: new Date().toISOString()
    }
  };

  try {
    const resp = await fetch(`${BASE_URL}/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    return { success: data.success || !!data.memory };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Project Indexer - Auto-index git repos to MemoRable

Usage:
  npx tsx scripts/index-project.ts <repo-path> <project-entity>

Examples:
  npx tsx scripts/index-project.ts ~/dev/android-bot android_bot
  npx tsx scripts/index-project.ts . memorable_project
  npx tsx scripts/index-project.ts /path/to/repo my_project

The indexer will:
  1. Detect .git directory (confirm it's a repo)
  2. Scan for docs (md, txt) and code (ts, js, py, etc.)
  3. Chunk adaptively by content type
  4. Store to MemoRable with project entity tags
`);
    process.exit(1);
  }

  const repoPath = path.resolve(args[0]);
  const projectEntity = args[1];

  console.log(`\n=== PROJECT INDEXER ===\n`);
  console.log(`Repo:    ${repoPath}`);
  console.log(`Entity:  ${projectEntity}`);

  // Check .git exists
  const gitPath = path.join(repoPath, '.git');
  if (!fs.existsSync(gitPath)) {
    console.error(`\nNo .git directory found at ${repoPath}`);
    console.error('This doesn\'t appear to be a git repository.');
    process.exit(1);
  }
  console.log(`Git:     detected\n`);

  // Authenticate
  console.log('Authenticating...');
  let apiKey = await authenticate();
  if (!apiKey) {
    console.error('Authentication failed');
    process.exit(1);
  }
  console.log('Authenticated.\n');

  // Scan repo
  console.log('Scanning repository...');
  const files = scanRepo(repoPath);
  const docCount = files.filter(f => f.type === 'doc').length;
  const codeCount = files.filter(f => f.type === 'code').length;
  const configCount = files.filter(f => f.type === 'config').length;
  console.log(`Found: ${docCount} docs, ${codeCount} code, ${configCount} config files\n`);

  if (files.length === 0) {
    console.log('No files to index.');
    process.exit(0);
  }

  // Chunk and store
  const chunker = new AdaptiveChunker(1500, 100);
  let totalChunks = 0;
  let storedChunks = 0;
  let failedChunks = 0;
  let consecutiveFailures = 0;
  let delayMs = 100;

  for (const file of files) {
    const chunks = chunker.chunk(file.filename, file.content);
    totalChunks += chunks.length;

    process.stdout.write(`[${file.filename}] ${chunks.length} chunks `);

    for (const chunk of chunks) {
      const result = await storeChunk(apiKey, chunk, projectEntity);

      if (result.success) {
        storedChunks++;
        consecutiveFailures = 0;
        delayMs = Math.max(100, delayMs - 10);
        process.stdout.write('.');
      } else {
        failedChunks++;
        consecutiveFailures++;
        delayMs = Math.min(2000, delayMs * 2);
        process.stdout.write('x');

        // Re-authenticate if too many failures
        if (consecutiveFailures >= 5) {
          process.stdout.write('\n[Re-auth...]');
          apiKey = await authenticate();
          if (!apiKey) {
            console.error('\nRe-authentication failed');
            process.exit(1);
          }
          consecutiveFailures = 0;
        }
      }

      await new Promise(r => setTimeout(r, delayMs));
    }

    console.log(' done');
  }

  // Report
  const rate = totalChunks > 0 ? ((storedChunks / totalChunks) * 100).toFixed(1) : '0';
  console.log(`
=== COMPLETE ===
Project: ${projectEntity}
Files:   ${files.length}
Chunks:  ${totalChunks}
Stored:  ${storedChunks}
Failed:  ${failedChunks}
Rate:    ${rate}%

Query with:
  curl -H "X-API-Key: \$KEY" "${BASE_URL}/memory?entity=${projectEntity}&limit=10"
`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
