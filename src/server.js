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
// INTELLIGENCE DASHBOARD - "gauges and lights for engineers" - Alan
// Shows the VALUE metrics: salience, entities, relationships, patterns
// =============================================================================
app.get('/dashboard', (_req, res) => {
  const memories = Array.from(memoryStore.values());

  // Salience distribution
  const salienceRanges = {
    low: memories.filter(m => m.salience < 40).length,
    medium: memories.filter(m => m.salience >= 40 && m.salience < 70).length,
    high: memories.filter(m => m.salience >= 70).length,
  };

  // Entity breakdown
  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  // Fidelity breakdown
  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };

  // Source breakdown (for Slack ingestion visibility)
  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  // Top entities by memory count
  const topEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Average salience
  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Intelligence</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: 'SF Mono', 'Consolas', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
    h2 { color: #8b949e; font-size: 14px; text-transform: uppercase; margin-top: 30px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h3 { margin: 0 0 10px 0; color: #58a6ff; font-size: 12px; text-transform: uppercase; }
    .big-number { font-size: 48px; font-weight: bold; color: #7ee787; margin: 10px 0; }
    .bar { height: 8px; background: #30363d; border-radius: 4px; overflow: hidden; margin: 5px 0; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-low { background: #484f58; }
    .bar-medium { background: #d29922; }
    .bar-high { background: #7ee787; }
    .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #21262d; }
    .stat-label { color: #8b949e; }
    .stat-value { color: #c9d1d9; font-weight: bold; }
    .entity-list { max-height: 300px; overflow-y: auto; }
    .entity-item { padding: 8px; background: #21262d; border-radius: 4px; margin: 4px 0; display: flex; justify-content: space-between; }
    .entity-name { color: #58a6ff; }
    .entity-count { color: #7ee787; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin: 2px; }
    .tag-verbatim { background: #238636; color: #fff; }
    .tag-derived { background: #9e6a03; color: #fff; }
    .tag-standard { background: #30363d; color: #c9d1d9; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; color: #484f58; font-size: 12px; }
  </style>
</head>
<body>
  <h1>MemoRable Intelligence Dashboard</h1>
  <p style="color: #8b949e;">Stop talking and start listening. Business Intelligence for the new Age.</p>

  <h2>Memory Gauges</h2>
  <div class="grid">
    <div class="card">
      <h3>Total Memories</h3>
      <div class="big-number">${memories.length}</div>
    </div>
    <div class="card">
      <h3>Average Salience</h3>
      <div class="big-number">${avgSalience}</div>
      <div class="bar">
        <div class="bar-fill bar-${avgSalience < 40 ? 'low' : avgSalience < 70 ? 'medium' : 'high'}" style="width: ${avgSalience}%"></div>
      </div>
    </div>
    <div class="card">
      <h3>Unique Entities</h3>
      <div class="big-number">${Object.keys(entityCounts).length}</div>
    </div>
    <div class="card">
      <h3>Data Sources</h3>
      <div class="big-number">${Object.keys(sourceCounts).length}</div>
    </div>
  </div>

  <h2>Salience Distribution</h2>
  <div class="grid">
    <div class="card">
      <div class="stat-row">
        <span class="stat-label">High (70-100)</span>
        <span class="stat-value">${salienceRanges.high}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-high" style="width: ${memories.length ? (salienceRanges.high / memories.length * 100) : 0}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Medium (40-69)</span>
        <span class="stat-value">${salienceRanges.medium}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-medium" style="width: ${memories.length ? (salienceRanges.medium / memories.length * 100) : 0}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Low (0-39)</span>
        <span class="stat-value">${salienceRanges.low}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-low" style="width: ${memories.length ? (salienceRanges.low / memories.length * 100) : 0}%"></div></div>
    </div>
    <div class="card">
      <h3>Fidelity Types</h3>
      <div class="stat-row">
        <span class="stat-label">Verbatim (exact quotes)</span>
        <span class="stat-value"><span class="tag tag-verbatim">${fidelityCounts.verbatim}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Derived (interpretations)</span>
        <span class="stat-value"><span class="tag tag-derived">${fidelityCounts.derived}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Standard</span>
        <span class="stat-value"><span class="tag tag-standard">${fidelityCounts.standard}</span></span>
      </div>
    </div>
  </div>

  <h2>Data Sources</h2>
  <div class="grid">
    <div class="card">
      ${Object.entries(sourceCounts).map(([source, count]) => `
        <div class="stat-row">
          <span class="stat-label">${source}</span>
          <span class="stat-value">${count}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <h2>Top Entities</h2>
  <div class="card">
    <div class="entity-list">
      ${topEntities.map(([name, count]) => `
        <div class="entity-item">
          <span class="entity-name">${name}</span>
          <span class="entity-count">${count} memories</span>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="footer">
    <strong>MemoRable</strong> — Context Intelligence for AI Agents<br>
    Dashboard auto-refreshes every 5 seconds
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// JSON endpoint for programmatic access
app.get('/dashboard/json', (_req, res) => {
  const memories = Array.from(memoryStore.values());

  const salienceRanges = {
    low: memories.filter(m => m.salience < 40).length,
    medium: memories.filter(m => m.salience >= 40 && m.salience < 70).length,
    high: memories.filter(m => m.salience >= 70).length,
  };

  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };

  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  res.json({
    summary: {
      totalMemories: memories.length,
      avgSalience,
      uniqueEntities: Object.keys(entityCounts).length,
      dataSources: Object.keys(sourceCounts).length,
    },
    salience: salienceRanges,
    fidelity: fidelityCounts,
    sources: sourceCounts,
    topEntities: Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count })),
  });
});

// =============================================================================
// MEMORY ENDPOINTS
// Basic store/retrieve for testing - uses in-memory store or DocumentDB
// =============================================================================

// In-memory store (fallback if no DB configured)
const memoryStore = new Map();

// Store a memory
// SIMPLE MODEL: Every memory references entities (who/what was involved)
// "we are all projects, are we not? you included" - Alan
// VERBATIM MODE: set verbatim:true to preserve exact quotes
app.post('/memory', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entities, entityType = 'user', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    // Support both single entity and entities array
    // Everything is just entities - no special project/user/intersection
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = ['default'];
    }

    const memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,           // WHO was involved (simple array)
      entity: entityList[0],          // Backward compat: primary entity
      entityType,
      context,
      metadata,
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
      fidelity: context.verbatim ? 'verbatim' : (metadata.derived_from ? 'derived' : 'standard'),
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
// SIMPLE: Query by one or more entities
// GET /memory?entity=alan                    → Alan's memories
// GET /memory?entity=alan&entity=memorable   → Where Alan + MemoRable together
app.get('/memory', (req, res) => {
  const start = Date.now();
  try {
    // Support multiple entity params: ?entity=alan&entity=memorable
    let entityFilter = req.query.entity;
    if (entityFilter && !Array.isArray(entityFilter)) {
      entityFilter = [entityFilter];
    }
    const { entityType, limit = 10, query } = req.query;

    let memories = Array.from(memoryStore.values());

    // Filter by entities - memory must include ALL requested entities
    if (entityFilter && entityFilter.length > 0) {
      memories = memories.filter(m => {
        const memEntities = m.entities || [m.entity];
        return entityFilter.every(e => memEntities.includes(e));
      });
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

// =============================================================================
// FIDELITY GUARDS
// Verbatim vs Interpretation - keep them separate
// =============================================================================

// Store VERBATIM - exact quote, no interpretation allowed
// Use this when storing what someone ACTUALLY said
app.post('/memory/verbatim', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entityType = 'user', source, context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source) {
      res.status(400).json({ error: 'source is required for verbatim memories (who said this?)' });
      return;
    }

    const memory = {
      id: `vmem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entity: entity || 'default',
      entityType,
      context: { ...context, verbatim: true },
      metadata: { ...metadata, source, exact_quote: true },
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
      fidelity: 'verbatim',  // Locked
    };

    memoryStore.set(memory.id, memory);
    metrics.inc('memory_verbatim_total', {});

    console.log(`[Memory] Verbatim stored from ${source}: "${content.substring(0, 50)}..."`);
    res.status(201).json({ success: true, memory, note: 'Stored as verbatim - exact quote preserved' });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Verbatim store error:', error);
    res.status(500).json({ error: 'Failed to store verbatim memory' });
  }
});

// Store INTERPRETATION - must link to source verbatim memory
// Use this when storing AI understanding of what was said
app.post('/memory/interpretation', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entityType = 'user', source_memory_id, interpreter = 'claude', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source_memory_id) {
      res.status(400).json({ error: 'source_memory_id is required - interpretations must link to verbatim source' });
      return;
    }

    // Verify source exists
    const sourceMemory = memoryStore.get(source_memory_id);
    if (!sourceMemory) {
      res.status(404).json({ error: 'Source memory not found - interpretation must link to existing memory' });
      return;
    }

    const memory = {
      id: `imem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entity: entity || sourceMemory.entity,
      entityType: entityType || sourceMemory.entityType,
      context,
      metadata: {
        ...metadata,
        interpreter,
        derived_from: source_memory_id,
        source_content: sourceMemory.content.substring(0, 100)
      },
      timestamp: new Date().toISOString(),
      salience: calculateSalience(content, context),
      fidelity: 'derived',  // Locked - this is interpretation
    };

    memoryStore.set(memory.id, memory);
    metrics.inc('memory_interpretation_total', {});

    console.log(`[Memory] Interpretation by ${interpreter} of ${source_memory_id}`);
    res.status(201).json({
      success: true,
      memory,
      source: sourceMemory.content.substring(0, 100),
      note: 'Stored as interpretation - linked to source verbatim'
    });
  } catch (error) {
    metrics.inc('memory_store_errors', {});
    console.error('[Memory] Interpretation store error:', error);
    res.status(500).json({ error: 'Failed to store interpretation' });
  }
});

// =============================================================================
// PROJECT MEMORY LAYER
// Living projects with comprehension, curation, and compaction checkpoints
// =============================================================================

// Project store (same stack, different layer)
const projectStore = new Map();

// Create a project
app.post('/project', (req, res) => {
  try {
    const { name, description = '' } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      lifecycle: {
        created: new Date().toISOString(),
        state: 'inception',
        state_history: [{ state: 'inception', timestamp: new Date().toISOString() }]
      },
      participants: [],
      comprehension: {
        participants: {},
        architecture: '',
        principles: '',
        current_focus: ''
      },
      critical_facts: [],
      open_loops: []
    };

    projectStore.set(project.id, project);
    metrics.inc('project_create_total', {});

    console.log(`[Project] Created: ${project.name} (${project.id})`);
    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('[Project] Create error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project by ID
app.get('/project/:id', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Enrich with memory count
    const projectMemories = Array.from(memoryStore.values())
      .filter(m => m.context?.projectId === project.id);

    res.json({
      ...project,
      memory_count: projectMemories.length,
      critical_count: project.critical_facts.length
    });
  } catch (error) {
    console.error('[Project] Get error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// List all projects
app.get('/project', (req, res) => {
  try {
    const projects = Array.from(projectStore.values()).map(p => ({
      id: p.id,
      name: p.name,
      state: p.lifecycle.state,
      created: p.lifecycle.created,
      participant_count: p.participants.length,
      critical_count: p.critical_facts.length
    }));
    res.json({ count: projects.length, projects });
  } catch (error) {
    console.error('[Project] List error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Add participant to project
app.post('/project/:id/participant', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { participantId, type = 'user', role = 'contributor' } = req.body;
    if (!participantId) {
      res.status(400).json({ error: 'participantId is required' });
      return;
    }

    project.participants.push({
      id: participantId,
      type,
      role,
      joined: new Date().toISOString(),
      active: true
    });

    console.log(`[Project] Added participant ${participantId} to ${project.name}`);
    res.json({ success: true, participants: project.participants });
  } catch (error) {
    console.error('[Project] Add participant error:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Curate a memory (mark as critical)
app.post('/project/:id/curate', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { fact, weight = 1.0, reason = '', curatedBy = 'system' } = req.body;
    if (!fact) {
      res.status(400).json({ error: 'fact is required' });
      return;
    }

    const criticalFact = {
      id: `cf_${Date.now()}`,
      fact,
      weight: Math.min(1.0, Math.max(0.0, weight)),
      curated_by: curatedBy,
      curated_at: new Date().toISOString(),
      reason
    };

    project.critical_facts.push(criticalFact);
    metrics.inc('project_curate_total', {});

    console.log(`[Project] Curated fact for ${project.name}: "${fact.substring(0, 50)}..."`);
    res.status(201).json({ success: true, criticalFact });
  } catch (error) {
    console.error('[Project] Curate error:', error);
    res.status(500).json({ error: 'Failed to curate fact' });
  }
});

// Update comprehension
app.post('/project/:id/comprehension', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { subject, understanding } = req.body;
    if (!subject || !understanding) {
      res.status(400).json({ error: 'subject and understanding are required' });
      return;
    }

    // Update the appropriate comprehension field
    if (subject === 'architecture' || subject === 'principles' || subject === 'current_focus') {
      project.comprehension[subject] = understanding;
    } else {
      // It's a participant
      project.comprehension.participants[subject] = understanding;
    }

    console.log(`[Project] Updated comprehension for ${project.name}: ${subject}`);
    res.json({ success: true, comprehension: project.comprehension });
  } catch (error) {
    console.error('[Project] Comprehension error:', error);
    res.status(500).json({ error: 'Failed to update comprehension' });
  }
});

// Get understanding of a subject
app.get('/project/:id/understand/:subject', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const subject = req.params.subject;
    let understanding;

    if (subject === 'architecture' || subject === 'principles' || subject === 'current_focus') {
      understanding = project.comprehension[subject];
    } else {
      understanding = project.comprehension.participants[subject];
    }

    if (!understanding) {
      res.status(404).json({ error: `No understanding of ${subject}` });
      return;
    }

    res.json({ subject, understanding });
  } catch (error) {
    console.error('[Project] Understand error:', error);
    res.status(500).json({ error: 'Failed to get understanding' });
  }
});

// COMPACTION CHECKPOINT - The critical endpoint
// When Claude compacts, query this to recover critical context
app.get('/project/:id/checkpoint', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get recent project memories
    const projectMemories = Array.from(memoryStore.values())
      .filter(m => m.context?.projectId === project.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);

    const checkpoint = {
      project_id: project.id,
      project_name: project.name,
      retrieved_at: new Date().toISOString(),

      // Critical facts that MUST survive compaction
      critical_facts: project.critical_facts
        .sort((a, b) => b.weight - a.weight),

      // Comprehension layer
      comprehension: project.comprehension,

      // Current state
      active_context: {
        state: project.lifecycle.state,
        participant_count: project.participants.length,
        open_loops: project.open_loops,
        recent_memories: projectMemories.map(m => ({
          content: m.content.substring(0, 100),
          timestamp: m.timestamp,
          salience: m.salience
        }))
      },

      // Recovery instructions
      recovery_note: "These facts and comprehension MUST be re-injected into context after compaction."
    };

    metrics.inc('project_checkpoint_total', {});
    console.log(`[Project] Checkpoint retrieved for ${project.name}`);

    res.json(checkpoint);
  } catch (error) {
    console.error('[Project] Checkpoint error:', error);
    res.status(500).json({ error: 'Failed to get checkpoint' });
  }
});

// Update project state
app.post('/project/:id/state', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { state } = req.body;
    const validStates = ['inception', 'planning', 'active', 'dormant', 'revived', 'completed', 'archived'];

    if (!validStates.includes(state)) {
      res.status(400).json({ error: `Invalid state. Must be one of: ${validStates.join(', ')}` });
      return;
    }

    project.lifecycle.state = state;
    project.lifecycle.state_history.push({
      state,
      timestamp: new Date().toISOString()
    });

    console.log(`[Project] ${project.name} state changed to: ${state}`);
    res.json({ success: true, lifecycle: project.lifecycle });
  } catch (error) {
    console.error('[Project] State change error:', error);
    res.status(500).json({ error: 'Failed to change state' });
  }
});

// Add open loop to project
app.post('/project/:id/loop', (req, res) => {
  try {
    const project = projectStore.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { description, priority = 'medium' } = req.body;
    if (!description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }

    const loop = {
      id: `loop_${Date.now()}`,
      description,
      priority,
      created: new Date().toISOString(),
      status: 'open'
    };

    project.open_loops.push(loop);
    console.log(`[Project] Added open loop to ${project.name}: ${description}`);
    res.status(201).json({ success: true, loop });
  } catch (error) {
    console.error('[Project] Add loop error:', error);
    res.status(500).json({ error: 'Failed to add loop' });
  }
});

// =============================================================================

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
