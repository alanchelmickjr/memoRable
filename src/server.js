/**
 * Main server entry point for Docker/ECS deployment.
 * Express server with health endpoints and metrics tracking.
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Track startup state
let isReady = false;
const startTime = Date.now();

// =============================================================================
// METRICS REGISTRY
// Simple in-memory metrics tracking - Prometheus-compatible output
// =============================================================================
const metrics = {
  counters: {},
  histograms: {},
  gauges: {},

  // Increment a counter
  inc(name, labels = {}, value = 1) {
    const key = this._key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  },

  // Record a value in a histogram (for latencies)
  observe(name, labels = {}, value) {
    const key = this._key(name, labels);
    if (!this.histograms[key]) {
      this.histograms[key] = { count: 0, sum: 0, values: [] };
    }
    this.histograms[key].count++;
    this.histograms[key].sum += value;
    this.histograms[key].values.push(value);
    // Keep last 1000 values for percentile calculation
    if (this.histograms[key].values.length > 1000) {
      this.histograms[key].values.shift();
    }
  },

  // Set a gauge value
  set(name, labels = {}, value) {
    const key = this._key(name, labels);
    this.gauges[key] = value;
  },

  // Generate key from name + labels
  _key(name, labels) {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  },

  // Calculate percentile from histogram
  _percentile(values, p) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  },

  // Export in Prometheus format
  export() {
    let output = '';

    // Counters
    for (const [key, value] of Object.entries(this.counters)) {
      output += `${key} ${value}\n`;
    }

    // Gauges
    for (const [key, value] of Object.entries(this.gauges)) {
      output += `${key} ${value}\n`;
    }

    // Histograms (export count, sum, and percentiles)
    for (const [key, data] of Object.entries(this.histograms)) {
      const baseName = key.split('{')[0];
      const labels = key.includes('{') ? key.slice(key.indexOf('{')) : '';
      output += `${baseName}_count${labels} ${data.count}\n`;
      output += `${baseName}_sum${labels} ${data.sum}\n`;
      output += `${baseName}_p50${labels} ${this._percentile(data.values, 50)}\n`;
      output += `${baseName}_p95${labels} ${this._percentile(data.values, 95)}\n`;
      output += `${baseName}_p99${labels} ${this._percentile(data.values, 99)}\n`;
    }

    return output;
  },

  // Export as JSON (for dashboard)
  toJSON() {
    const result = {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      histograms: {}
    };

    for (const [key, data] of Object.entries(this.histograms)) {
      result.histograms[key] = {
        count: data.count,
        sum: data.sum,
        avg: data.count > 0 ? data.sum / data.count : 0,
        p50: this._percentile(data.values, 50),
        p95: this._percentile(data.values, 95),
        p99: this._percentile(data.values, 99)
      };
    }

    return result;
  }
};

// Middleware to track request metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode;

    metrics.inc('http_requests_total', { method, route, status });
    metrics.observe('http_request_duration_ms', { method, route }, duration);
  });

  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Health endpoints for load balancers and Kubernetes
app.get('/health', (_req, res) => {
  res.status(isReady ? 200 : 503).json({
    healthy: isReady,
    uptime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/live', (_req, res) => {
  // Liveness: is the process running?
  res.status(200).json({ alive: true });
});

app.get('/health/ready', (_req, res) => {
  // Readiness: is the service ready for traffic?
  res.status(isReady ? 200 : 503).json({ ready: isReady });
});

app.get('/health/startup', (_req, res) => {
  // Startup: has initialization completed?
  res.status(isReady ? 200 : 503).json({ initialized: isReady });
});

// Basic info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'MemoRable',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Context-aware memory system for AI agents',
    status: isReady ? 'ready' : 'starting',
  });
});

// =============================================================================
// METRICS ENDPOINTS
// =============================================================================

// Prometheus-compatible metrics endpoint
app.get('/metrics', (_req, res) => {
  // Update system gauges before export
  metrics.set('process_uptime_seconds', {}, Math.floor((Date.now() - startTime) / 1000));
  metrics.set('process_memory_heap_bytes', {}, process.memoryUsage().heapUsed);
  metrics.set('process_memory_rss_bytes', {}, process.memoryUsage().rss);
  metrics.set('nodejs_active_handles', {}, process._getActiveHandles?.()?.length || 0);

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.export());
});

// JSON metrics endpoint (for dashboards)
app.get('/metrics/json', (_req, res) => {
  metrics.set('process_uptime_seconds', {}, Math.floor((Date.now() - startTime) / 1000));
  metrics.set('process_memory_heap_bytes', {}, process.memoryUsage().heapUsed);
  metrics.set('process_memory_rss_bytes', {}, process.memoryUsage().rss);

  res.json({
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    ...metrics.toJSON()
  });
});

// Simple dashboard view
app.get('/metrics/dashboard', (_req, res) => {
  const data = metrics.toJSON();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const memory = process.memoryUsage();

  // Build simple ASCII dashboard
  let html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Metrics</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #0f0; padding: 20px; }
    h1 { color: #00ff88; }
    .metric { margin: 10px 0; padding: 10px; background: #16213e; border-radius: 4px; }
    .label { color: #888; }
    .value { color: #0f0; font-size: 1.2em; }
    .section { margin-top: 20px; border-top: 1px solid #333; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>MemoRable Metrics Dashboard</h1>
  <p class="label">Auto-refreshes every 5 seconds</p>

  <div class="section">
    <h2>System</h2>
    <div class="metric">
      <span class="label">Uptime:</span>
      <span class="value">${uptime}s (${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m)</span>
    </div>
    <div class="metric">
      <span class="label">Memory (Heap):</span>
      <span class="value">${Math.round(memory.heapUsed / 1024 / 1024)}MB</span>
    </div>
    <div class="metric">
      <span class="label">Memory (RSS):</span>
      <span class="value">${Math.round(memory.rss / 1024 / 1024)}MB</span>
    </div>
  </div>

  <div class="section">
    <h2>Request Counters</h2>
    ${Object.entries(data.counters).map(([k, v]) =>
      `<div class="metric"><span class="label">${k}:</span> <span class="value">${v}</span></div>`
    ).join('') || '<div class="metric">No requests yet</div>'}
  </div>

  <div class="section">
    <h2>Latency Histograms</h2>
    ${Object.entries(data.histograms).map(([k, v]) =>
      `<div class="metric">
        <span class="label">${k}:</span><br>
        <span class="value">count=${v.count} avg=${v.avg.toFixed(1)}ms p50=${v.p50}ms p95=${v.p95}ms p99=${v.p99}ms</span>
      </div>`
    ).join('') || '<div class="metric">No latency data yet</div>'}
  </div>

  <div class="section">
    <h2>Raw JSON</h2>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start server
async function start() {
  try {
    console.log('[Server] Starting MemoRable...');

    app.listen(PORT, () => {
      console.log(`[Server] MemoRable listening on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);

      // Mark as ready after server starts
      isReady = true;
      console.log('[Server] Service is ready for traffic');
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
