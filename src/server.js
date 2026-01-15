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

// =============================================================================
// MEMORY ENDPOINTS
// Basic store/retrieve for testing - uses in-memory store or DocumentDB
// =============================================================================

// In-memory store (fallback if no DB configured)
const memoryStore = new Map();

// Store a memory
app.post('/memory', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entityType = 'user', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entity: entity || 'default',
      entityType,
      context,
      metadata,
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
    };

    // Store in memory (or DB when connected)
    memoryStore.set(memory.id, memory);

    metrics.inc('memory_store_total', { entityType });
    metrics.observe('memory_store_latency_ms', {}, Date.now() - start);

    res.status(201).json({
      success: true,
      memory,
    });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Store error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

// Retrieve memories
app.get('/memory', (req, res) => {
  const start = Date.now();
  try {
    const { entity, entityType, limit = 10, query } = req.query;

    let memories = Array.from(memoryStore.values());

    // Filter by entity if provided
    if (entity) {
      memories = memories.filter(m => m.entity === entity);
    }
    if (entityType) {
      memories = memories.filter(m => m.entityType === entityType);
    }

    // Simple text search if query provided
    if (query) {
      const q = query.toLowerCase();
      memories = memories.filter(m =>
        m.content.toLowerCase().includes(q)
      );
    }

    // Sort by salience (highest first)
    memories.sort((a, b) => b.salience - a.salience);

    // Limit results
    memories = memories.slice(0, parseInt(limit));

    metrics.inc('memory_retrieve_total', {});
    metrics.observe('memory_retrieve_latency_ms', {}, Date.now() - start);

    res.json({
      count: memories.length,
      memories,
    });
  } catch (error) {
    metrics.inc('memory_retrieve_errors', {});
    console.error('[Memory] Retrieve error:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
});

// Get memory by ID
app.get('/memory/:id', (req, res) => {
  try {
    const memory = memoryStore.get(req.params.id);
    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json(memory);
  } catch (error) {
    console.error('[Memory] Get by ID error:', error);
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

// Delete memory
app.delete('/memory/:id', (req, res) => {
  try {
    const deleted = memoryStore.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('[Memory] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// Simple salience calculation (placeholder for real salience service)
function calculateSalience(content, context) {
  let salience = 50; // Base salience

  // Emotional markers boost salience
  const emotionalWords = ['important', 'urgent', 'love', 'hate', 'amazing', 'terrible', 'critical'];
  const hasEmotion = emotionalWords.some(w => content.toLowerCase().includes(w));
  if (hasEmotion) salience += 20;

  // Questions are more salient (open loops)
  if (content.includes('?')) salience += 10;

  // Length factor (not too short, not too long)
  if (content.length > 50 && content.length < 500) salience += 10;

  // Context factors
  if (context.priority === 'high') salience += 15;
  if (context.isOpenLoop) salience += 15;

  return Math.min(100, Math.max(0, salience));
}

// =============================================================================

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
