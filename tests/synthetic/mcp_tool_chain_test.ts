#!/usr/bin/env npx tsx
/**
 * @file MCP Tool Chain Test
 *
 * Tests every core MCP tool end-to-end against the live stack.
 * Reports pass/fail for each tool with details.
 *
 * Usage:
 *   npx tsx tests/synthetic/mcp_tool_chain_test.ts
 *   npx tsx tests/synthetic/mcp_tool_chain_test.ts --url http://52.9.62.72:8080
 */

const DEFAULT_URL = process.env.MEMORABLE_API_URL || 'http://52.9.62.72:8080';

// ============================================================================
// MCP Client (same as 66day test)
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
      clientInfo: { name: 'mcp_tool_chain_test', version: '1.0' },
    });
    await this.notify('notifications/initialized', {});
    console.log(`Connected: ${result.serverInfo?.name} v${result.serverInfo?.version}\n`);
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: this.requestId }),
    });

    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId) this.sessionId = newSessionId;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(JSON.stringify(data.error));
          return data.result;
        }
      }
      throw new Error('No data in SSE response');
    } else {
      const data = await response.json();
      if (data.error) throw new Error(JSON.stringify(data.error));
      return data.result;
    }
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    await fetch(this.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method, params }) });
  }
}

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
  tool: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
  elapsed: number;
}

const results: TestResult[] = [];

async function test(tool: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ tool, status: 'PASS', detail, elapsed: Date.now() - start });
    console.log(`  PASS  ${tool} (${Date.now() - start}ms) - ${detail}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ tool, status: 'FAIL', detail, elapsed: Date.now() - start });
    console.log(`  FAIL  ${tool} (${Date.now() - start}ms) - ${detail.slice(0, 120)}`);
  }
}

async function run() {
  let url = DEFAULT_URL;
  const urlArgIdx = process.argv.indexOf('--url');
  if (urlArgIdx !== -1 && process.argv[urlArgIdx + 1]) {
    url = process.argv[urlArgIdx + 1];
  }
  const urlEqArg = process.argv.find(a => a.startsWith('--url='));
  if (urlEqArg) url = urlEqArg.split('=')[1];

  console.log('========================================');
  console.log('  MemoRable MCP Tool Chain Test');
  console.log(`  Endpoint: ${url}`);
  console.log('========================================\n');

  const client = new McpClient(url);
  await client.initialize();

  let storedMemoryId: string | undefined;
  let storedLoopMemoryId: string | undefined;

  // ─── 1. STORE + RECALL ───────────────────────────────────
  console.log('--- Memory Lifecycle ---');

  await test('store_memory', async () => {
    const result = await client.callTool('store_memory', {
      text: `Integration test memory ${Date.now()}: testing the full MCP pipeline on the boat`,
      context: { location: 'boat', activity: 'testing', mood: 'focused', people: ['Alan'] },
      deviceType: 'desktop',
      securityTier: 'Tier1_General',
    }) as any;
    storedMemoryId = result.memoryId;
    return `memoryId=${result.memoryId}, salience=${result.salienceScore || result.salience?.score}`;
  });

  await test('recall', async () => {
    const result = await client.callTool('recall', {
      query: 'integration test pipeline boat',
      limit: 3,
    }) as any[];
    if (!Array.isArray(result) || result.length === 0) throw new Error('No results returned');
    return `${result.length} results, first: "${result[0].text?.slice(0, 50)}..."`;
  });

  await test('recall (person filter)', async () => {
    const result = await client.callTool('recall', {
      query: 'boat testing',
      limit: 3,
      person: 'Alan',
    }) as any[];
    return `${Array.isArray(result) ? result.length : 0} results for person=Alan`;
  });

  await test('search_memories', async () => {
    const result = await client.callTool('search_memories', {
      query: 'morning routine',
      limit: 3,
    }) as any;
    const count = result.memories?.length || result.results?.length || (Array.isArray(result) ? result.length : 0);
    return `${count} results`;
  });

  // ─── 2. CONTEXT ──────────────────────────────────────────
  console.log('\n--- Context System ---');

  await test('set_context', async () => {
    const result = await client.callTool('set_context', {
      location: 'boat',
      activity: 'testing MemoRable',
      people: ['Alan'],
      deviceType: 'desktop',
    }) as any;
    if (result?.error) throw new Error(result.error);
    return `context set: ${JSON.stringify(result).slice(0, 80)}`;
  });

  await test('whats_relevant', async () => {
    const result = await client.callTool('whats_relevant', {}) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  await test('clear_context', async () => {
    const result = await client.callTool('clear_context', {}) as any;
    return `cleared: ${JSON.stringify(result).slice(0, 80)}`;
  });

  // ─── 3. BRIEFING ─────────────────────────────────────────
  console.log('\n--- Briefing ---');

  await test('get_briefing', async () => {
    const result = await client.callTool('get_briefing', {
      person: 'Sarah',
      quick: true,
    }) as any;
    return `briefing: ${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 4. LOOPS ────────────────────────────────────────────
  console.log('\n--- Open Loops ---');

  await test('store_memory (with commitment)', async () => {
    const result = await client.callTool('store_memory', {
      text: `I promised Alan I would finish the 66-day test by end of day ${new Date().toISOString().split('T')[0]}`,
      context: { activity: 'planning', people: ['Alan'] },
    }) as any;
    storedLoopMemoryId = result.memoryId;
    return `memoryId=${result.memoryId}, salience=${result.salienceScore || result.salience?.score}`;
  });

  await test('list_loops', async () => {
    const result = await client.callTool('list_loops', {}) as any;
    const count = result.loops?.length || result.openLoops?.length || (Array.isArray(result) ? result.length : 0);
    return `${count} open loops`;
  });

  // ─── 5. STATUS + PATTERNS ────────────────────────────────
  console.log('\n--- System Intelligence ---');

  await test('get_status', async () => {
    const result = await client.callTool('get_status', {}) as any;
    return `loops: ${JSON.stringify(result.openLoopsCount)}, weights: ${result.weightsLearned}`;
  });

  await test('pattern_stats', async () => {
    const result = await client.callTool('pattern_stats', {}) as any;
    return `patterns=${result.totalPatterns}, formed=${result.formedPatterns}, days=${result.dataCollectionDays}`;
  });

  // ─── 6. ANTICIPATION + PREDICTIONS ───────────────────────
  console.log('\n--- Predictive Memory ---');

  await test('anticipate', async () => {
    const result = await client.callTool('anticipate', {
      lookAheadMinutes: 60,
    }) as any;
    return `ready=${result.readyForPrediction}, days=${result.dataCollectionDays}, contexts=${result.anticipatedContexts?.length || 0}`;
  });

  await test('day_outlook', async () => {
    const result = await client.callTool('day_outlook', {}) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  await test('get_predictions', async () => {
    const result = await client.callTool('get_predictions', {
      context: { activity: 'coding', location: 'boat' },
      max_results: 3,
    }) as any;
    return `surfaced=${result.surfaced_count}, hooks=${result.total_hooks_evaluated}`;
  });

  await test('get_anticipated_context', async () => {
    const result = await client.callTool('get_anticipated_context', {
      max_memories: 3,
    }) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 7. EMOTION ──────────────────────────────────────────
  console.log('\n--- Emotion Analysis ---');

  await test('analyze_emotion', async () => {
    const result = await client.callTool('analyze_emotion', {
      text: 'I am absolutely thrilled that the system is working! This makes me so happy and hopeful.',
    }) as any;
    return `${JSON.stringify(result).slice(0, 120)}`;
  });

  await test('get_emotion_filters', async () => {
    const result = await client.callTool('get_emotion_filters', {}) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  await test('get_memories_by_emotion', async () => {
    const result = await client.callTool('get_memories_by_emotion', {
      emotions: ['happy', 'focused'],
      limit: 3,
    }) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 8. RELATIONSHIPS ────────────────────────────────────
  console.log('\n--- Relationship Intelligence ---');

  await test('get_relationship', async () => {
    const result = await client.callTool('get_relationship', {
      entity_a: 'Alan',
      entity_b: 'Sarah',
    }) as any;
    return `${JSON.stringify(result).slice(0, 120)}`;
  });

  await test('get_entity_pressure', async () => {
    const result = await client.callTool('get_entity_pressure', {
      entity_id: 'Alan',
      days: 30,
    }) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 9. DEVICES ──────────────────────────────────────────
  console.log('\n--- Device Management ---');

  await test('list_devices', async () => {
    const result = await client.callTool('list_devices', {}) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  await test('get_session_continuity', async () => {
    const result = await client.callTool('get_session_continuity', {
      deviceId: 'test_device_claude',
      deviceType: 'desktop',
    }) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 10. EXPORT/IMPORT ROUNDTRIP ─────────────────────────
  console.log('\n--- Export/Import ---');

  await test('export_memories', async () => {
    const result = await client.callTool('export_memories', {
      topics: ['testing'],
    }) as any;
    const count = result.memories?.length || result.exportedCount || 0;
    return `exported ${count} memories`;
  });

  // ─── 11. BEHAVIORAL + TIER STATS ────────────────────────
  console.log('\n--- System Stats ---');

  await test('get_tier_stats', async () => {
    const result = await client.callTool('get_tier_stats', {}) as any;
    return `${JSON.stringify(result).slice(0, 120)}`;
  });

  await test('get_pattern_stats', async () => {
    const result = await client.callTool('get_pattern_stats', {}) as any;
    return `${JSON.stringify(result).slice(0, 120)}`;
  });

  await test('get_daemon_status', async () => {
    const result = await client.callTool('get_daemon_status', {}) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── 12. RECALL VOTE (feedback loop) ─────────────────────
  console.log('\n--- Feedback ---');

  await test('recall_vote', async () => {
    if (!storedMemoryId) throw new Error('No memory to vote on');
    const result = await client.callTool('recall_vote', {
      votes: [{ memoryId: storedMemoryId, vote: 'hot' }],
      query_context: 'testing the MCP tool chain',
    }) as any;
    return `${JSON.stringify(result).slice(0, 100)}`;
  });

  // ─── SUMMARY ─────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  RESULTS SUMMARY');
  console.log('========================================');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const totalMs = results.reduce((sum, r) => sum + r.elapsed, 0);

  console.log(`  Total: ${results.length} tools tested`);
  console.log(`  PASS:  ${passed}`);
  console.log(`  FAIL:  ${failed}`);
  console.log(`  SKIP:  ${skipped}`);
  console.log(`  Time:  ${(totalMs / 1000).toFixed(1)}s`);

  if (failed > 0) {
    console.log('\n  Failed tools:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    - ${r.tool}: ${r.detail.slice(0, 80)}`);
    }
  }

  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
