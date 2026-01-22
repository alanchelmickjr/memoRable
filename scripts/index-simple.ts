#!/usr/bin/env npx tsx
/**
 * Simple Indexer - Elegant, testable, layered
 *
 * Usage:
 *   npx tsx scripts/index-simple.ts                    # Dry run (console only)
 *   npx tsx scripts/index-simple.ts --memorable        # Index to MemoRable API
 *   npx tsx scripts/index-simple.ts --file README.md   # Index single file
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AdaptiveChunker } from '../src/services/ingestion_pipeline/index.js';
import { Sink, MemorableSink, ConsoleSink, MultiSink } from '../src/services/ingestion_pipeline/sinks.js';

// ============================================================================
// CONFIG
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// SOURCE: File Scanner
// ============================================================================

interface FileSource {
  filename: string;
  content: string;
}

function scanFiles(dir: string, extensions: string[]): FileSource[] {
  const files: FileSource[] = [];
  const ignore = ['node_modules', '.git', 'dist', '.terraform', 'coverage'];

  function walk(d: string) {
    if (!fs.existsSync(d)) return;

    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      const rel = path.relative(ROOT, full);

      if (ignore.some(p => rel.includes(p))) continue;

      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = path.extname(entry.name).slice(1);
        if (extensions.includes(ext)) {
          try {
            files.push({ filename: rel, content: fs.readFileSync(full, 'utf8') });
          } catch {}
        }
      }
    }
  }

  walk(dir);
  return files;
}

// ============================================================================
// PIPELINE: Simple, layered
// ============================================================================

interface IndexResult {
  files: number;
  chunks: number;
  stored: number;
  failed: number;
}

async function indexFiles(sources: FileSource[], sink: Sink): Promise<IndexResult> {
  const chunker = new AdaptiveChunker(1500, 100);
  const result: IndexResult = { files: 0, chunks: 0, stored: 0, failed: 0 };

  for (const source of sources) {
    const chunks = chunker.chunk(source.filename, source.content);
    result.files++;
    result.chunks += chunks.length;

    process.stdout.write(`[${source.filename}] ${chunks.length} chunks `);

    const storeResults = await sink.storeBatch(chunks);
    for (const r of storeResults) {
      if (r.success) {
        result.stored++;
        process.stdout.write('.');
      } else {
        result.failed++;
        process.stdout.write('x');
      }
    }

    console.log(' done');
  }

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const useMemorableApi = args.includes('--memorable');
  const fileArg = args.find((_, i, arr) => arr[i - 1] === '--file');

  console.log('\n=== SIMPLE INDEXER ===\n');

  // Setup sink
  let sink: Sink;
  if (useMemorableApi) {
    console.log('Target: MemoRable API');
    const memorableSink = new MemorableSink();
    console.log('Authenticating...');
    const authed = await memorableSink.authenticate();
    if (!authed) {
      console.error('Authentication failed');
      process.exit(1);
    }
    console.log('Authenticated.\n');
    sink = memorableSink;
  } else {
    console.log('Target: Console (dry run)\n');
    sink = new ConsoleSink();
  }

  // Gather sources
  let sources: FileSource[];

  if (fileArg) {
    // Single file
    const filepath = path.resolve(ROOT, fileArg);
    if (!fs.existsSync(filepath)) {
      console.error(`File not found: ${fileArg}`);
      process.exit(1);
    }
    sources = [{ filename: fileArg, content: fs.readFileSync(filepath, 'utf8') }];
  } else {
    // All docs + key files
    sources = [
      ...scanFiles(path.join(ROOT, 'docs'), ['md']),
      { filename: 'README.md', content: fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') },
      { filename: 'CLAUDE.md', content: fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') }
    ];
  }

  console.log(`Found ${sources.length} files to index\n`);

  // Index
  const result = await indexFiles(sources, sink);

  // Cleanup
  await sink.close();

  // Report
  console.log(`
=== COMPLETE ===
Files:   ${result.files}
Chunks:  ${result.chunks}
Stored:  ${result.stored}
Failed:  ${result.failed}
Rate:    ${result.chunks > 0 ? ((result.stored / result.chunks) * 100).toFixed(1) : 0}%
`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
