/**
 * @file Pipeline Load Test - Find the Leaks Before Production
 *
 * "Calculate for pipe friction" - Versailles, 1666
 *
 * This hammers the entire pipeline to find:
 * - Memory leaks
 * - Slow queries
 * - Race conditions
 * - Connection pool exhaustion
 * - Redis evictions
 * - MongoDB timeouts
 *
 * Run with: npx ts-node tests/load/pipeline_load_test.ts [profile]
 * Profiles: smoke, standard, stress, versailles
 */

import {
  generateFullDataset,
  generateMemory,
  generatePressureVector,
  generateContextStream,
  MEMORY_TEMPLATES,
  PRESSURE_SCENARIOS,
  LOAD_TEST_PROFILES,
  type LoadTestConfig,
  type SyntheticMemory,
  type SyntheticPressureEvent,
} from '../fixtures/synthetic_generators.js';

// ============================================================================
// Metrics Collection
// ============================================================================

interface LoadTestMetrics {
  startTime: number;
  endTime?: number;

  // Counters
  memoriesStored: number;
  memoriesRetrieved: number;
  contextUpdates: number;
  pressureUpdates: number;
  hookEvaluations: number;
  hookFirings: number;

  // Latencies (ms)
  storeLatencies: number[];
  retrieveLatencies: number[];
  contextLatencies: number[];
  hookLatencies: number[];

  // Errors
  errors: { timestamp: number; operation: string; error: string }[];

  // Memory usage
  memorySnapshots: { timestamp: number; heapUsed: number; heapTotal: number }[];
}

function createMetrics(): LoadTestMetrics {
  return {
    startTime: Date.now(),
    memoriesStored: 0,
    memoriesRetrieved: 0,
    contextUpdates: 0,
    pressureUpdates: 0,
    hookEvaluations: 0,
    hookFirings: 0,
    storeLatencies: [],
    retrieveLatencies: [],
    contextLatencies: [],
    hookLatencies: [],
    errors: [],
    memorySnapshots: [],
  };
}

function recordLatency(latencies: number[], startTime: number): number {
  const latency = Date.now() - startTime;
  latencies.push(latency);
  return latency;
}

function recordError(metrics: LoadTestMetrics, operation: string, error: unknown): void {
  metrics.errors.push({
    timestamp: Date.now(),
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
}

function snapshotMemory(metrics: LoadTestMetrics): void {
  const usage = process.memoryUsage();
  metrics.memorySnapshots.push({
    timestamp: Date.now(),
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
  });
}

// ============================================================================
// Mock API Client (Replace with real client in integration)
// ============================================================================

interface APIClient {
  storeMemory(memory: SyntheticMemory): Promise<{ success: boolean; memoryId: string }>;
  retrieveMemories(query: string, limit: number): Promise<{ memories: unknown[] }>;
  updateContext(context: unknown): Promise<{ success: boolean }>;
  updatePressure(entityId: string, vector: unknown): Promise<{ success: boolean }>;
  evaluateHooks(context: unknown): Promise<{ surfaced: unknown[] }>;
}

// Mock client for dry runs - replace with real HTTP client
function createMockClient(): APIClient {
  return {
    async storeMemory(memory) {
      // Simulate network latency
      await sleep(Math.random() * 50 + 10);
      return { success: true, memoryId: memory.memoryId };
    },
    async retrieveMemories(_query, limit) {
      await sleep(Math.random() * 30 + 5);
      return { memories: new Array(limit).fill({}) };
    },
    async updateContext(_context) {
      await sleep(Math.random() * 10 + 2);
      return { success: true };
    },
    async updatePressure(_entityId, _vector) {
      await sleep(Math.random() * 20 + 5);
      return { success: true };
    },
    async evaluateHooks(_context) {
      await sleep(Math.random() * 15 + 3);
      return { surfaced: [] };
    },
  };
}

// Real HTTP client
function createHTTPClient(baseUrl: string): APIClient {
  return {
    async storeMemory(memory) {
      const response = await fetch(`${baseUrl}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memory),
      });
      return response.json();
    },
    async retrieveMemories(query, limit) {
      const response = await fetch(`${baseUrl}/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      return response.json();
    },
    async updateContext(context) {
      const response = await fetch(`${baseUrl}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      });
      return response.json();
    },
    async updatePressure(entityId, vector) {
      const response = await fetch(`${baseUrl}/entity/${entityId}/pressure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vector),
      });
      return response.json();
    },
    async evaluateHooks(context) {
      const response = await fetch(`${baseUrl}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      return response.json();
    },
  };
}

// ============================================================================
// Load Test Runner
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMemoryStoreLoad(
  client: APIClient,
  memories: SyntheticMemory[],
  metrics: LoadTestMetrics,
  concurrency: number
): Promise<void> {
  const batches = [];
  for (let i = 0; i < memories.length; i += concurrency) {
    batches.push(memories.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    const promises = batch.map(async (memory) => {
      const start = Date.now();
      try {
        await client.storeMemory(memory);
        recordLatency(metrics.storeLatencies, start);
        metrics.memoriesStored++;
      } catch (error) {
        recordError(metrics, 'store_memory', error);
      }
    });
    await Promise.all(promises);
  }
}

async function runContextUpdateLoad(
  client: APIClient,
  config: LoadTestConfig,
  metrics: LoadTestMetrics,
  stopSignal: { stop: boolean }
): Promise<void> {
  const intervalMs = 1000 / config.contextUpdatesPerSecond;
  const contexts = generateContextStream('load_test_user', 'mobile', 1, 1);
  let contextIndex = 0;

  while (!stopSignal.stop) {
    const start = Date.now();
    try {
      const context = contexts[contextIndex % contexts.length];
      await client.updateContext(context);
      recordLatency(metrics.contextLatencies, start);
      metrics.contextUpdates++;

      // Also evaluate hooks if enabled
      if (config.enablePredictionHooks) {
        const hookStart = Date.now();
        const result = await client.evaluateHooks(context);
        recordLatency(metrics.hookLatencies, hookStart);
        metrics.hookEvaluations++;
        metrics.hookFirings += (result.surfaced?.length || 0);
      }
    } catch (error) {
      recordError(metrics, 'context_update', error);
    }

    contextIndex++;
    const elapsed = Date.now() - start;
    const sleepTime = Math.max(0, intervalMs - elapsed);
    await sleep(sleepTime);
  }
}

async function runPressureUpdateLoad(
  client: APIClient,
  events: SyntheticPressureEvent[],
  metrics: LoadTestMetrics
): Promise<void> {
  for (const event of events) {
    const start = Date.now();
    try {
      await client.updatePressure(event.vector.targetEntityId, event.vector);
      metrics.pressureUpdates++;
    } catch (error) {
      recordError(metrics, 'pressure_update', error);
    }
    // Small delay between pressure events
    await sleep(100);
  }
}

async function runMemoryRetrievalLoad(
  client: APIClient,
  queries: string[],
  metrics: LoadTestMetrics,
  durationSeconds: number
): Promise<void> {
  const endTime = Date.now() + durationSeconds * 1000;

  while (Date.now() < endTime) {
    const query = queries[Math.floor(Math.random() * queries.length)];
    const start = Date.now();
    try {
      await client.retrieveMemories(query, 10);
      recordLatency(metrics.retrieveLatencies, start);
      metrics.memoriesRetrieved++;
    } catch (error) {
      recordError(metrics, 'retrieve_memories', error);
    }
    await sleep(100); // 10 queries per second
  }
}

// ============================================================================
// Main Load Test
// ============================================================================

async function runLoadTest(
  profile: LoadTestConfig,
  options?: {
    baseUrl?: string;
    dryRun?: boolean;
  }
): Promise<LoadTestMetrics> {
  const metrics = createMetrics();

  // Create client
  const client = options?.dryRun || !options?.baseUrl
    ? createMockClient()
    : createHTTPClient(options.baseUrl);

  console.log('🚀 Starting load test...');
  console.log(`   Profile: ${JSON.stringify(profile, null, 2)}`);
  console.log(`   Mode: ${options?.dryRun ? 'DRY RUN (mock)' : 'LIVE'}`);
  console.log('');

  // Generate test data
  console.log('📦 Generating synthetic data...');
  const dataset = generateFullDataset({
    memoryCount: profile.memoriesPerUser * profile.concurrentUsers,
    daysOfContext: 1,
    includeCascade: profile.enablePressureTracking,
  });
  console.log(`   Generated ${dataset.memories.length} memories`);
  console.log(`   Generated ${dataset.pressureEvents.length} pressure events`);
  console.log(`   Generated ${dataset.predictionHooks.length} prediction hooks`);
  console.log('');

  // Memory snapshot at start
  snapshotMemory(metrics);

  // Phase 1: Store memories
  console.log('💾 Phase 1: Storing memories...');
  const storeStart = Date.now();
  await runMemoryStoreLoad(client, dataset.memories, metrics, profile.concurrentUsers);
  console.log(`   Stored ${metrics.memoriesStored} memories in ${Date.now() - storeStart}ms`);

  // Phase 2: Pressure updates
  if (profile.enablePressureTracking) {
    console.log('🦋 Phase 2: Pressure cascade simulation...');
    await runPressureUpdateLoad(client, dataset.pressureEvents, metrics);
    console.log(`   Processed ${metrics.pressureUpdates} pressure events`);
  }

  // Phase 3: Concurrent context updates and retrievals
  console.log(`⚡ Phase 3: Sustained load for ${profile.durationSeconds}s...`);
  const stopSignal = { stop: false };

  const queries = ['salt', 'Sarah', 'doctor', 'work', 'meeting', 'Bob'];

  // Start background tasks
  const contextTask = runContextUpdateLoad(client, profile, metrics, stopSignal);
  const retrievalTask = runMemoryRetrievalLoad(client, queries, metrics, profile.durationSeconds);

  // Memory snapshots during test
  const snapshotInterval = setInterval(() => snapshotMemory(metrics), 10000);

  // Wait for duration
  await sleep(profile.durationSeconds * 1000);
  stopSignal.stop = true;

  // Wait for tasks to complete
  await Promise.all([contextTask, retrievalTask]);
  clearInterval(snapshotInterval);

  // Final snapshot
  snapshotMemory(metrics);
  metrics.endTime = Date.now();

  return metrics;
}

// ============================================================================
// Report Generation
// ============================================================================

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function generateReport(metrics: LoadTestMetrics, profile: LoadTestConfig): string {
  const duration = (metrics.endTime || Date.now()) - metrics.startTime;
  const durationSec = duration / 1000;

  const report = `
================================================================================
                         LOAD TEST REPORT
================================================================================

Profile: ${profile.concurrentUsers} users, ${profile.durationSeconds}s duration
Actual Duration: ${durationSec.toFixed(1)}s

--------------------------------------------------------------------------------
                              THROUGHPUT
--------------------------------------------------------------------------------
Memories Stored:     ${metrics.memoriesStored} (${(metrics.memoriesStored / durationSec).toFixed(1)}/sec)
Memories Retrieved:  ${metrics.memoriesRetrieved} (${(metrics.memoriesRetrieved / durationSec).toFixed(1)}/sec)
Context Updates:     ${metrics.contextUpdates} (${(metrics.contextUpdates / durationSec).toFixed(1)}/sec)
Pressure Updates:    ${metrics.pressureUpdates}
Hook Evaluations:    ${metrics.hookEvaluations}
Hooks Fired:         ${metrics.hookFirings}

--------------------------------------------------------------------------------
                              LATENCIES (ms)
--------------------------------------------------------------------------------
                    P50      P90      P95      P99      Max
Store Memory:       ${percentile(metrics.storeLatencies, 50).toFixed(0).padStart(4)}     ${percentile(metrics.storeLatencies, 90).toFixed(0).padStart(4)}     ${percentile(metrics.storeLatencies, 95).toFixed(0).padStart(4)}     ${percentile(metrics.storeLatencies, 99).toFixed(0).padStart(4)}     ${Math.max(...metrics.storeLatencies, 0).toFixed(0).padStart(4)}
Retrieve Memory:    ${percentile(metrics.retrieveLatencies, 50).toFixed(0).padStart(4)}     ${percentile(metrics.retrieveLatencies, 90).toFixed(0).padStart(4)}     ${percentile(metrics.retrieveLatencies, 95).toFixed(0).padStart(4)}     ${percentile(metrics.retrieveLatencies, 99).toFixed(0).padStart(4)}     ${Math.max(...metrics.retrieveLatencies, 0).toFixed(0).padStart(4)}
Context Update:     ${percentile(metrics.contextLatencies, 50).toFixed(0).padStart(4)}     ${percentile(metrics.contextLatencies, 90).toFixed(0).padStart(4)}     ${percentile(metrics.contextLatencies, 95).toFixed(0).padStart(4)}     ${percentile(metrics.contextLatencies, 99).toFixed(0).padStart(4)}     ${Math.max(...metrics.contextLatencies, 0).toFixed(0).padStart(4)}
Hook Evaluation:    ${percentile(metrics.hookLatencies, 50).toFixed(0).padStart(4)}     ${percentile(metrics.hookLatencies, 90).toFixed(0).padStart(4)}     ${percentile(metrics.hookLatencies, 95).toFixed(0).padStart(4)}     ${percentile(metrics.hookLatencies, 99).toFixed(0).padStart(4)}     ${Math.max(...metrics.hookLatencies, 0).toFixed(0).padStart(4)}

--------------------------------------------------------------------------------
                              ERRORS
--------------------------------------------------------------------------------
Total Errors: ${metrics.errors.length}
${metrics.errors.length > 0 ? metrics.errors.slice(0, 10).map(e =>
  `  [${new Date(e.timestamp).toISOString()}] ${e.operation}: ${e.error}`
).join('\n') : '  None! 🎉'}
${metrics.errors.length > 10 ? `  ... and ${metrics.errors.length - 10} more` : ''}

--------------------------------------------------------------------------------
                              MEMORY USAGE
--------------------------------------------------------------------------------
${metrics.memorySnapshots.length > 0 ? (() => {
  const first = metrics.memorySnapshots[0];
  const last = metrics.memorySnapshots[metrics.memorySnapshots.length - 1];
  const maxHeap = Math.max(...metrics.memorySnapshots.map(s => s.heapUsed));
  return `Start Heap:  ${(first.heapUsed / 1024 / 1024).toFixed(1)} MB
End Heap:    ${(last.heapUsed / 1024 / 1024).toFixed(1)} MB
Max Heap:    ${(maxHeap / 1024 / 1024).toFixed(1)} MB
Growth:      ${((last.heapUsed - first.heapUsed) / 1024 / 1024).toFixed(1)} MB`;
})() : 'No snapshots recorded'}

--------------------------------------------------------------------------------
                              VERDICT
--------------------------------------------------------------------------------
${metrics.errors.length === 0 ? '✅ PASSED - No errors detected' : '❌ FAILED - Errors detected'}
${percentile(metrics.storeLatencies, 99) > 500 ? '⚠️  WARNING - Store P99 > 500ms' : '✅ Store latency OK'}
${percentile(metrics.retrieveLatencies, 99) > 200 ? '⚠️  WARNING - Retrieve P99 > 200ms' : '✅ Retrieve latency OK'}
${metrics.memorySnapshots.length > 1 &&
  (metrics.memorySnapshots[metrics.memorySnapshots.length - 1].heapUsed -
   metrics.memorySnapshots[0].heapUsed) > 100 * 1024 * 1024
  ? '⚠️  WARNING - Memory growth > 100MB (potential leak)' : '✅ Memory usage OK'}

================================================================================
`;

  return report;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const profileName = args[0] || 'smoke';
  const baseUrl = args[1];

  const profile = LOAD_TEST_PROFILES[profileName as keyof typeof LOAD_TEST_PROFILES];

  if (!profile) {
    console.error(`Unknown profile: ${profileName}`);
    console.error(`Available profiles: ${Object.keys(LOAD_TEST_PROFILES).join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          MEMORABLE PIPELINE LOAD TEST                        ║');
  console.log('║          "Calculate for pipe friction"                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const metrics = await runLoadTest(profile, {
      baseUrl,
      dryRun: !baseUrl,
    });

    const report = generateReport(metrics, profile);
    console.log(report);

    // Exit with error if test failed
    if (metrics.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

export {
  runLoadTest,
  generateReport,
  createMockClient,
  createHTTPClient,
  LOAD_TEST_PROFILES,
};
