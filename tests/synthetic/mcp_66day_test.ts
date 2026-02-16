#!/usr/bin/env npx tsx
/**
 * @file MCP 66-Day Synthetic Test
 *
 * Generates 66 days of synthetic memories and loads them via the MCP
 * import_memories tool (HTTP). Tests pattern detection, salience scoring,
 * and anticipation service end-to-end.
 *
 * Usage:
 *   npx tsx tests/synthetic/mcp_66day_test.ts [--smoke|--standard|--stress]
 *   npx tsx tests/synthetic/mcp_66day_test.ts --url http://52.9.62.72:8080
 *
 * Profiles:
 *   --smoke     21 days, ~100 memories (quick validation)
 *   --standard  66 days, ~500 memories (default, full pattern window)
 *   --stress    84 days, ~800 memories (extended with monthly patterns)
 */

import { generateTemporalDataset } from './temporal_data_generator.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_URL = process.env.MEMORABLE_API_URL || 'http://52.9.62.72:8080';
const BATCH_SIZE = 25; // Memories per import_memories call
const USER_ID = 'synthetic_test_user';

interface Profile {
  name: string;
  days: number;
  description: string;
}

const PROFILES: Record<string, Profile> = {
  smoke: { name: 'smoke', days: 21, description: '21 days, quick pattern formation test' },
  standard: { name: 'standard', days: 66, description: '66 days, full stability window' },
  stress: { name: 'stress', days: 84, description: '84 days, extended with monthly patterns' },
};

// ============================================================================
// MCP HTTP Client (StreamableHTTP)
// ============================================================================

class McpClient {
  private url: string;
  private sessionId: string | null = null;
  private requestId = 0;

  constructor(url: string) {
    this.url = url.replace(/\/$/, '') + '/mcp';
  }

  async initialize(): Promise<void> {
    const result = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp_66day_test', version: '1.0' },
    });
    console.log(`[MCP] Initialized: ${result.serverInfo?.name} v${result.serverInfo?.version}`);

    // Send initialized notification
    await this.notify('notifications/initialized', {});
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.send('tools/call', { name, arguments: args });
    if (result.content?.[0]?.text) {
      try {
        return JSON.parse(result.content[0].text);
      } catch {
        return result.content[0].text;
      }
    }
    return result;
  }

  private async send(method: string, params: Record<string, unknown>): Promise<any> {
    this.requestId++;
    const body = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // Capture session ID from response
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Parse SSE response
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);
          return data.result;
        }
      }
      throw new Error('No data in SSE response');
    } else {
      const data = await response.json();
      if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);
      return data.result;
    }
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const body = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }
}

// ============================================================================
// Test Runner
// ============================================================================

async function run() {
  // Parse args
  const args = process.argv.slice(2);
  let profileName = 'standard';
  let url = DEFAULT_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--smoke') profileName = 'smoke';
    else if (args[i] === '--standard') profileName = 'standard';
    else if (args[i] === '--stress') profileName = 'stress';
    else if (args[i] === '--url' && args[i + 1]) { url = args[++i]; }
  }

  const profile = PROFILES[profileName];
  console.log(`\n========================================`);
  console.log(`  MemoRable 66-Day Synthetic Test`);
  console.log(`  Profile: ${profile.name} (${profile.description})`);
  console.log(`  Endpoint: ${url}`);
  console.log(`========================================\n`);

  // 1. Initialize MCP client
  console.log('[1/6] Connecting to MCP server...');
  const client = new McpClient(url);
  await client.initialize();

  // 2. Check health
  console.log('[2/6] Checking system status...');
  const status = await client.callTool('get_status');
  console.log(`  Status: ${JSON.stringify(status, null, 2).slice(0, 200)}...`);

  // 3. Generate dataset
  console.log(`[3/6] Generating ${profile.days}-day synthetic dataset...`);
  const dataset = generateTemporalDataset(USER_ID, profile.days);
  console.log(`  Generated ${dataset.memories.length} memories`);
  console.log(`  Patterns: ${dataset.patterns.map(p => p.name).join(', ')}`);
  console.log(`  Date range: ${dataset.metadata.startDate.toISOString().split('T')[0]} to ${dataset.metadata.endDate.toISOString().split('T')[0]}`);

  // Show expected pattern confidence
  console.log('\n  Expected Pattern Detection:');
  for (const ep of dataset.metadata.expectedPatterns) {
    console.log(`    ${ep.name}: day21=${(ep.expectedConfidenceAtDay21 * 100).toFixed(0)}%, day63=${(ep.expectedConfidenceAtDay63 * 100).toFixed(0)}%`);
  }

  // 4. Import via MCP in batches
  console.log(`\n[4/6] Importing memories in batches of ${BATCH_SIZE}...`);
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  const batches = [];
  for (let i = 0; i < dataset.memories.length; i += BATCH_SIZE) {
    batches.push(dataset.memories.slice(i, i + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const memories = batch.map(m => ({
      id: m.memoryId,
      text: m.content,
      createdAt: m.timestamp.toISOString(),
      salienceScore: Math.round(m.salience * 100),
      people: m.context.people || [],
      topics: [m.patternName],
      tags: ['synthetic', `pattern:${m.patternName}`],
      project: m.context.project,
    }));

    try {
      const result = await client.callTool('import_memories', {
        memories,
        skipDuplicates: true,
        source: 'api',
      }) as { imported?: number; skipped?: number; errors?: string[] };

      totalImported += result.imported || 0;
      totalSkipped += result.skipped || 0;
      totalErrors += result.errors?.length || 0;

      const pct = Math.round(((batchIdx + 1) / batches.length) * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors)`);
    } catch (err) {
      console.error(`\n  Batch ${batchIdx + 1} failed: ${err}`);
      totalErrors += batch.length;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);

  // 5. Verify import
  console.log('\n[5/6] Verifying import...');

  // Test recall (returns array directly, not { memories: [...] })
  const morningRecall = await client.callTool('recall', {
    query: 'morning routine coffee',
    limit: 5,
  }) as any[];
  const morningCount = Array.isArray(morningRecall) ? morningRecall.length : 0;
  console.log(`  Recall "morning routine": ${morningCount} results`);
  if (morningCount > 0) console.log(`    First: "${(morningRecall as any[])[0]?.text?.slice(0, 60)}..." (salience: ${(morningRecall as any[])[0]?.salience})`);

  const medRecall = await client.callTool('recall', {
    query: 'medication pills',
    limit: 5,
  }) as any[];
  const medCount = Array.isArray(medRecall) ? medRecall.length : 0;
  console.log(`  Recall "medication": ${medCount} results`);

  const meetingRecall = await client.callTool('recall', {
    query: 'wednesday meeting team',
    limit: 5,
  }) as any[];
  const meetingCount = Array.isArray(meetingRecall) ? meetingRecall.length : 0;
  console.log(`  Recall "meeting": ${meetingCount} results`);

  // 6. Test pattern detection
  console.log('\n[6/6] Testing pattern detection...');

  const patternStats = await client.callTool('pattern_stats') as Record<string, unknown>;
  console.log(`  Pattern stats: ${JSON.stringify(patternStats, null, 2)}`);

  // Test anticipation
  try {
    const predictions = await client.callTool('get_predictions', {
      context: {
        activity: 'coding',
        location: 'home',
        topics: ['MemoRable'],
      },
      max_results: 3,
    });
    console.log(`  Predictions: ${JSON.stringify(predictions, null, 2).slice(0, 300)}`);
  } catch (err) {
    console.log(`  Predictions: ${err}`);
  }

  // Test anticipation with calendar
  try {
    const anticipated = await client.callTool('anticipate', {
      lookAheadMinutes: 120,
    });
    console.log(`  Anticipated: ${JSON.stringify(anticipated, null, 2).slice(0, 300)}`);
  } catch (err) {
    console.log(`  Anticipated: ${err}`);
  }

  // Summary
  console.log('\n========================================');
  console.log('  TEST COMPLETE');
  console.log('========================================');
  console.log(`  Profile: ${profile.name} (${profile.days} days)`);
  console.log(`  Memories imported: ${totalImported}`);
  console.log(`  Import errors: ${totalErrors}`);
  console.log(`  Pattern stats: ${JSON.stringify(patternStats)}`);
  console.log(`  Recall working: ${morningCount > 0 ? 'YES' : 'NO'}`);
  console.log('========================================\n');
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
