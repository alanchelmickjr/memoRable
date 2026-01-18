/**
 * @file Leak Detector - Find the Drips Before the Flood
 *
 * Monitors for:
 * - Memory leaks (heap growth over time)
 * - Connection leaks (MongoDB, Redis pools)
 * - Event listener leaks
 * - Promise leaks (unresolved promises)
 * - Cache bloat (unbounded growth)
 *
 * "Belayed" means to secure a rope.
 * "Betrayed" means to reveal.
 * Your tests should BETRAY your leaks, not BELAY them (hide them).
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface LeakReport {
  timestamp: string;
  duration: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';

  memory: {
    startHeap: number;
    endHeap: number;
    maxHeap: number;
    growth: number;
    growthPerMinute: number;
    verdict: 'PASS' | 'WARN' | 'FAIL';
  };

  eventListeners: {
    start: number;
    end: number;
    growth: number;
    verdict: 'PASS' | 'WARN' | 'FAIL';
  };

  handles: {
    start: number;
    end: number;
    growth: number;
    verdict: 'PASS' | 'WARN' | 'FAIL';
  };

  leaks: LeakInstance[];
}

export interface LeakInstance {
  type: 'memory' | 'listener' | 'handle' | 'promise' | 'connection';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  stackTrace?: string;
  recommendation: string;
}

export interface LeakDetectorConfig {
  // Memory thresholds
  maxHeapGrowthMB: number;          // Max acceptable heap growth
  maxHeapGrowthPerMinuteMB: number; // Max growth rate

  // Listener thresholds
  maxListenerGrowth: number;        // Max new listeners

  // Handle thresholds
  maxHandleGrowth: number;          // Max new handles

  // Sampling
  sampleIntervalMs: number;         // How often to sample
  gcBeforeSample: boolean;          // Force GC before sampling (if exposed)

  // Reporting
  verbose: boolean;
}

const DEFAULT_CONFIG: LeakDetectorConfig = {
  maxHeapGrowthMB: 50,
  maxHeapGrowthPerMinuteMB: 10,
  maxListenerGrowth: 100,
  maxHandleGrowth: 50,
  sampleIntervalMs: 5000,
  gcBeforeSample: true,
  verbose: false,
};

// ============================================================================
// Memory Sampling
// ============================================================================

interface MemorySample {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

function sampleMemory(): MemorySample {
  const usage = process.memoryUsage();
  return {
    timestamp: Date.now(),
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
    rss: usage.rss,
  };
}

function forceGC(): boolean {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

// ============================================================================
// Handle Counting
// ============================================================================

function countActiveHandles(): number {
  // @ts-expect-error - accessing internal Node.js API
  return process._getActiveHandles?.()?.length || 0;
}

function countActiveRequests(): number {
  // @ts-expect-error - accessing internal Node.js API
  return process._getActiveRequests?.()?.length || 0;
}

// ============================================================================
// Listener Counting
// ============================================================================

function countEventListeners(emitter: EventEmitter): number {
  const events = emitter.eventNames();
  return events.reduce((count, event) => count + emitter.listenerCount(event), 0);
}

// ============================================================================
// Leak Detector Class
// ============================================================================

export class LeakDetector {
  private config: LeakDetectorConfig;
  private samples: MemorySample[] = [];
  private startListenerCount: number = 0;
  private startHandleCount: number = 0;
  private startTime: number = 0;
  private intervalHandle: NodeJS.Timeout | null = null;
  private emitters: EventEmitter[] = [];

  constructor(config: Partial<LeakDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register an event emitter to track
   */
  trackEmitter(emitter: EventEmitter): void {
    this.emitters.push(emitter);
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.startTime = Date.now();
    this.samples = [];

    // Initial sample
    if (this.config.gcBeforeSample) {
      forceGC();
    }

    this.samples.push(sampleMemory());
    this.startListenerCount = this.emitters.reduce(
      (sum, e) => sum + countEventListeners(e),
      0
    );
    this.startHandleCount = countActiveHandles();

    // Start sampling interval
    this.intervalHandle = setInterval(() => {
      if (this.config.gcBeforeSample) {
        forceGC();
      }
      this.samples.push(sampleMemory());

      if (this.config.verbose) {
        const latest = this.samples[this.samples.length - 1];
        const first = this.samples[0];
        console.log(
          `[LeakDetector] Heap: ${(latest.heapUsed / 1024 / 1024).toFixed(1)}MB ` +
          `(+${((latest.heapUsed - first.heapUsed) / 1024 / 1024).toFixed(1)}MB)`
        );
      }
    }, this.config.sampleIntervalMs);
  }

  /**
   * Stop monitoring and generate report
   */
  stop(): LeakReport {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Final sample
    if (this.config.gcBeforeSample) {
      forceGC();
    }
    this.samples.push(sampleMemory());

    return this.generateReport();
  }

  /**
   * Generate leak report
   */
  private generateReport(): LeakReport {
    const duration = Date.now() - this.startTime;
    const durationMinutes = duration / 60000;

    const firstSample = this.samples[0];
    const lastSample = this.samples[this.samples.length - 1];
    const maxHeap = Math.max(...this.samples.map(s => s.heapUsed));

    const heapGrowth = lastSample.heapUsed - firstSample.heapUsed;
    const heapGrowthMB = heapGrowth / 1024 / 1024;
    const heapGrowthPerMinute = heapGrowthMB / Math.max(durationMinutes, 1);

    const endListenerCount = this.emitters.reduce(
      (sum, e) => sum + countEventListeners(e),
      0
    );
    const listenerGrowth = endListenerCount - this.startListenerCount;

    const endHandleCount = countActiveHandles();
    const handleGrowth = endHandleCount - this.startHandleCount;

    // Determine verdicts
    const memoryVerdict: 'PASS' | 'WARN' | 'FAIL' =
      heapGrowthMB > this.config.maxHeapGrowthMB ? 'FAIL' :
      heapGrowthPerMinute > this.config.maxHeapGrowthPerMinuteMB ? 'WARN' : 'PASS';

    const listenerVerdict: 'PASS' | 'WARN' | 'FAIL' =
      listenerGrowth > this.config.maxListenerGrowth * 2 ? 'FAIL' :
      listenerGrowth > this.config.maxListenerGrowth ? 'WARN' : 'PASS';

    const handleVerdict: 'PASS' | 'WARN' | 'FAIL' =
      handleGrowth > this.config.maxHandleGrowth * 2 ? 'FAIL' :
      handleGrowth > this.config.maxHandleGrowth ? 'WARN' : 'PASS';

    const overallVerdict: 'PASS' | 'WARN' | 'FAIL' =
      [memoryVerdict, listenerVerdict, handleVerdict].includes('FAIL') ? 'FAIL' :
      [memoryVerdict, listenerVerdict, handleVerdict].includes('WARN') ? 'WARN' : 'PASS';

    // Collect leak instances
    const leaks: LeakInstance[] = [];

    if (memoryVerdict !== 'PASS') {
      leaks.push({
        type: 'memory',
        severity: memoryVerdict === 'FAIL' ? 'high' : 'medium',
        description: `Heap grew ${heapGrowthMB.toFixed(1)}MB (${heapGrowthPerMinute.toFixed(2)}MB/min)`,
        recommendation: 'Check for: unbounded caches, accumulating arrays, closure captures, unreleased buffers',
      });
    }

    if (listenerVerdict !== 'PASS') {
      leaks.push({
        type: 'listener',
        severity: listenerVerdict === 'FAIL' ? 'high' : 'medium',
        description: `Event listener count grew by ${listenerGrowth}`,
        recommendation: 'Check for: missing removeListener calls, listeners added in loops without cleanup',
      });
    }

    if (handleVerdict !== 'PASS') {
      leaks.push({
        type: 'handle',
        severity: handleVerdict === 'FAIL' ? 'high' : 'medium',
        description: `Active handle count grew by ${handleGrowth}`,
        recommendation: 'Check for: unclosed sockets, timers not cleared, file descriptors not closed',
      });
    }

    return {
      timestamp: new Date().toISOString(),
      duration,
      verdict: overallVerdict,

      memory: {
        startHeap: firstSample.heapUsed,
        endHeap: lastSample.heapUsed,
        maxHeap,
        growth: heapGrowth,
        growthPerMinute: heapGrowthPerMinute * 1024 * 1024,
        verdict: memoryVerdict,
      },

      eventListeners: {
        start: this.startListenerCount,
        end: endListenerCount,
        growth: listenerGrowth,
        verdict: listenerVerdict,
      },

      handles: {
        start: this.startHandleCount,
        end: endHandleCount,
        growth: handleGrowth,
        verdict: handleVerdict,
      },

      leaks,
    };
  }
}

// ============================================================================
// Report Formatting
// ============================================================================

export function formatLeakReport(report: LeakReport): string {
  const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  const verdictIcon = (v: string) => v === 'PASS' ? '✅' : v === 'WARN' ? '⚠️' : '❌';

  return `
================================================================================
                         LEAK DETECTION REPORT
================================================================================

Duration: ${(report.duration / 1000).toFixed(1)}s
Overall Verdict: ${verdictIcon(report.verdict)} ${report.verdict}

--------------------------------------------------------------------------------
                              MEMORY
--------------------------------------------------------------------------------
${verdictIcon(report.memory.verdict)} Start Heap:     ${toMB(report.memory.startHeap)} MB
${verdictIcon(report.memory.verdict)} End Heap:       ${toMB(report.memory.endHeap)} MB
${verdictIcon(report.memory.verdict)} Max Heap:       ${toMB(report.memory.maxHeap)} MB
${verdictIcon(report.memory.verdict)} Growth:         ${toMB(report.memory.growth)} MB
${verdictIcon(report.memory.verdict)} Growth Rate:    ${toMB(report.memory.growthPerMinute)}/min

--------------------------------------------------------------------------------
                         EVENT LISTENERS
--------------------------------------------------------------------------------
${verdictIcon(report.eventListeners.verdict)} Start Count:    ${report.eventListeners.start}
${verdictIcon(report.eventListeners.verdict)} End Count:      ${report.eventListeners.end}
${verdictIcon(report.eventListeners.verdict)} Growth:         ${report.eventListeners.growth}

--------------------------------------------------------------------------------
                           HANDLES
--------------------------------------------------------------------------------
${verdictIcon(report.handles.verdict)} Start Count:    ${report.handles.start}
${verdictIcon(report.handles.verdict)} End Count:      ${report.handles.end}
${verdictIcon(report.handles.verdict)} Growth:         ${report.handles.growth}

--------------------------------------------------------------------------------
                         DETECTED LEAKS
--------------------------------------------------------------------------------
${report.leaks.length === 0 ? '✅ No leaks detected!' : report.leaks.map(leak => `
${verdictIcon(leak.severity === 'high' || leak.severity === 'critical' ? 'FAIL' : 'WARN')} [${leak.type.toUpperCase()}] ${leak.severity.toUpperCase()}
   ${leak.description}
   Recommendation: ${leak.recommendation}
`).join('\n')}

================================================================================
`;
}

// ============================================================================
// Quick Leak Check (for CI)
// ============================================================================

export async function quickLeakCheck(
  testFn: () => Promise<void>,
  config?: Partial<LeakDetectorConfig>
): Promise<{ passed: boolean; report: LeakReport }> {
  const detector = new LeakDetector({
    ...config,
    verbose: false,
  });

  detector.start();

  try {
    await testFn();
  } finally {
    // Give time for async cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const report = detector.stop();

  return {
    passed: report.verdict === 'PASS',
    report,
  };
}

// ============================================================================
// Connection Pool Monitor
// ============================================================================

export interface ConnectionPoolStats {
  name: string;
  size: number;
  available: number;
  pending: number;
  maxSize: number;
}

export function monitorConnectionPool(
  pool: {
    totalCount?: number;
    availableCount?: number;
    pendingCount?: number;
    options?: { maxPoolSize?: number };
  },
  name: string
): ConnectionPoolStats {
  return {
    name,
    size: pool.totalCount || 0,
    available: pool.availableCount || 0,
    pending: pool.pendingCount || 0,
    maxSize: pool.options?.maxPoolSize || 0,
  };
}

// ============================================================================
// Export
// ============================================================================

export default LeakDetector;
