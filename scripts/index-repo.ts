#!/usr/bin/env npx tsx
/**
 * Repo Indexer CLI - Index docs and code into Weaviate
 *
 * Usage:
 *   npx tsx scripts/index-repo.ts --docs          # Index /docs only
 *   npx tsx scripts/index-repo.ts --code          # Index /src only
 *   npx tsx scripts/index-repo.ts --all           # Index everything
 *   npx tsx scripts/index-repo.ts --test          # Test chunker only
 *   npx tsx scripts/index-repo.ts --search "auth" # Search indexed content
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { IngestionPipeline, AdaptiveChunker, Chunk, EmbeddingResult } from '../src/services/ingestion_pipeline/index.js';

// ============================================================================
// CONFIG
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const SRC_DIR = path.join(ROOT, 'src');

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.terraform',
  '*.lock*',
  '*.map'
];

// ============================================================================
// FILE SCANNER
// ============================================================================

function shouldIgnore(filepath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filepath);
    }
    return filepath.includes(pattern);
  });
}

function scanDirectory(dir: string, extensions: string[]): { filename: string; content: string }[] {
  const files: { filename: string; content: string }[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(ROOT, fullPath);

      if (shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1);
        if (extensions.includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            files.push({ filename: relativePath, content });
          } catch (e) {
            console.error(`[SKIP] ${relativePath}: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  walk(dir);
  return files;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function testChunker() {
  console.log('\n=== TESTING CHUNKER ===\n');

  const chunker = new AdaptiveChunker(1500, 100);

  // Test markdown
  const mdFile = path.join(DOCS_DIR, 'ENGINE_LAYER_DESIGN.md');
  if (fs.existsSync(mdFile)) {
    const content = fs.readFileSync(mdFile, 'utf8');
    const chunks = chunker.chunk('docs/ENGINE_LAYER_DESIGN.md', content);
    console.log(`[MD] ENGINE_LAYER_DESIGN.md → ${chunks.length} chunks`);
    console.log(`     First chunk: ${chunks[0]?.metadata.section || 'no section'} (${chunks[0]?.content.length} chars)`);
  }

  // Test code
  const tsFile = path.join(SRC_DIR, 'server.js');
  if (fs.existsSync(tsFile)) {
    const content = fs.readFileSync(tsFile, 'utf8');
    const chunks = chunker.chunk('src/server.js', content);
    console.log(`[JS] server.js → ${chunks.length} chunks`);
    console.log(`     First chunk: ${chunks[0]?.metadata.section || 'no section'} (${chunks[0]?.content.length} chars)`);
  }

  // Test README
  const readme = path.join(ROOT, 'README.md');
  if (fs.existsSync(readme)) {
    const content = fs.readFileSync(readme, 'utf8');
    const chunks = chunker.chunk('README.md', content);
    console.log(`[MD] README.md → ${chunks.length} chunks`);
  }

  // Test CLAUDE.md
  const claude = path.join(ROOT, 'CLAUDE.md');
  if (fs.existsSync(claude)) {
    const content = fs.readFileSync(claude, 'utf8');
    const chunks = chunker.chunk('CLAUDE.md', content);
    console.log(`[MD] CLAUDE.md → ${chunks.length} chunks`);
  }

  console.log('\n[OK] Chunker test complete');
}

async function indexDocs() {
  console.log('\n=== INDEXING DOCS ===\n');

  const files = [
    ...scanDirectory(DOCS_DIR, ['md']),
    { filename: 'README.md', content: fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') },
    { filename: 'CLAUDE.md', content: fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') }
  ];

  console.log(`Found ${files.length} documentation files\n`);

  const pipeline = new IngestionPipeline({
    workerCount: 4,
    batchSize: 50,
    embeddingModel: 'local' // Use local for testing
  });

  let totalChunks = 0;
  let embeddedChunks = 0;

  pipeline.on('file', ({ filename, chunks }) => {
    console.log(`[INDEX] ${filename} → ${chunks} chunks`);
    totalChunks += chunks;
  });

  pipeline.on('embedded', (results: EmbeddingResult[]) => {
    embeddedChunks += results.length;
    process.stdout.write('.');
  });

  pipeline.on('error', ({ batch, error }) => {
    console.error(`\n[ERROR] Batch failed: ${(error as Error).message}`);
  });

  pipeline.on('complete', (stats) => {
    console.log(`\n
=== INDEXING COMPLETE ===
Files processed: ${stats.filesProcessed}
Chunks created:  ${stats.chunksCreated}
Chunks embedded: ${stats.chunksEmbedded}
Chunks failed:   ${stats.chunksFailed}
Bytes processed: ${(stats.bytesProcessed / 1024).toFixed(1)} KB
Duration:        ${((stats.endTime! - stats.startTime) / 1000).toFixed(1)}s
`);
  });

  await pipeline.ingestFiles(files);
}

async function indexCode() {
  console.log('\n=== INDEXING CODE ===\n');

  const files = scanDirectory(SRC_DIR, ['ts', 'js', 'tsx', 'jsx']);

  console.log(`Found ${files.length} code files\n`);

  const pipeline = new IngestionPipeline({
    workerCount: 4,
    batchSize: 50,
    embeddingModel: 'local'
  });

  pipeline.on('file', ({ filename, chunks }) => {
    console.log(`[INDEX] ${filename} → ${chunks} chunks`);
  });

  pipeline.on('embedded', () => process.stdout.write('.'));

  pipeline.on('complete', (stats) => {
    console.log(`\n
=== INDEXING COMPLETE ===
Files: ${stats.filesProcessed} | Chunks: ${stats.chunksCreated} | Embedded: ${stats.chunksEmbedded}
`);
  });

  await pipeline.ingestFiles(files);
}

async function indexAll() {
  await indexDocs();
  await indexCode();
}

async function showStats() {
  const chunker = new AdaptiveChunker();

  // Docs
  const docFiles = [
    ...scanDirectory(DOCS_DIR, ['md']),
    { filename: 'README.md', content: fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') },
    { filename: 'CLAUDE.md', content: fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') }
  ];

  let docChunks = 0;
  for (const file of docFiles) {
    docChunks += chunker.chunk(file.filename, file.content).length;
  }

  // Code
  const codeFiles = scanDirectory(SRC_DIR, ['ts', 'js', 'tsx', 'jsx']);
  let codeChunks = 0;
  for (const file of codeFiles) {
    codeChunks += chunker.chunk(file.filename, file.content).length;
  }

  console.log(`
=== REPO STATS ===

Documentation:
  Files:  ${docFiles.length}
  Chunks: ${docChunks}

Code:
  Files:  ${codeFiles.length}
  Chunks: ${codeChunks}

Total:
  Files:  ${docFiles.length + codeFiles.length}
  Chunks: ${docChunks + codeChunks}
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || '--stats';

  switch (cmd) {
    case '--test':
      await testChunker();
      break;
    case '--docs':
      await indexDocs();
      break;
    case '--code':
      await indexCode();
      break;
    case '--all':
      await indexAll();
      break;
    case '--stats':
      await showStats();
      break;
    case '--help':
      console.log(`
Repo Indexer - Index docs and code for semantic search

Usage:
  npx tsx scripts/index-repo.ts [command]

Commands:
  --test    Test chunker on sample files
  --docs    Index documentation (/docs, README, CLAUDE.md)
  --code    Index source code (/src)
  --all     Index everything
  --stats   Show repo statistics (default)
  --help    Show this help
`);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
