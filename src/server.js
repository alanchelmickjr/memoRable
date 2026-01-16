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

// =============================================================================
// INTERACTIVE METRICS DASHBOARD - Game-like experience for everyone
// "Stop talking and start listening" - but make it FUN
// =============================================================================
app.get('/dashboard/interactive', (_req, res) => {
  const memories = Array.from(memoryStore.values());
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Calculate level based on total memories (every 10 memories = 1 level)
  const memoryCount = memories.length;
  const level = Math.floor(memoryCount / 10) + 1;
  const xpInLevel = memoryCount % 10;
  const xpToNextLevel = 10;

  // Calculate "Memory Power" score (0-100)
  const avgSalience = memories.length > 0
    ? Math.round(memories.reduce((sum, m) => sum + (m.salience || 0), 0) / memories.length)
    : 0;

  // Salience distribution for the "quality meter"
  const salienceRanges = {
    legendary: memories.filter(m => m.salience >= 90).length,
    epic: memories.filter(m => m.salience >= 70 && m.salience < 90).length,
    rare: memories.filter(m => m.salience >= 50 && m.salience < 70).length,
    common: memories.filter(m => m.salience < 50).length,
  };

  // Entity counts for "relationship constellation"
  const entityCounts = {};
  memories.forEach(m => {
    const entities = m.entities || [m.entity];
    entities.forEach(e => {
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });
  });

  const topEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Fidelity for "authenticity score"
  const fidelityCounts = {
    verbatim: memories.filter(m => m.fidelity === 'verbatim').length,
    derived: memories.filter(m => m.fidelity === 'derived').length,
    standard: memories.filter(m => m.fidelity === 'standard' || !m.fidelity).length,
  };
  const authenticityScore = memories.length > 0
    ? Math.round((fidelityCounts.verbatim * 100 + fidelityCounts.derived * 60 + fidelityCounts.standard * 40) / memories.length)
    : 0;

  // Source breakdown as "data streams"
  const sourceCounts = {};
  memories.forEach(m => {
    const source = m.context?.source || 'direct';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  // Recent activity (last 5 memories)
  const recentMemories = memories
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  // Calculate achievements
  const achievements = [];
  if (memoryCount >= 1) achievements.push({ icon: '🧠', name: 'First Memory', desc: 'Stored your first memory' });
  if (memoryCount >= 10) achievements.push({ icon: '📚', name: 'Memory Keeper', desc: 'Stored 10 memories' });
  if (memoryCount >= 50) achievements.push({ icon: '🏆', name: 'Memory Master', desc: 'Stored 50 memories' });
  if (memoryCount >= 100) achievements.push({ icon: '👑', name: 'Memory Monarch', desc: 'Stored 100 memories' });
  if (fidelityCounts.verbatim >= 5) achievements.push({ icon: '💎', name: 'Truth Seeker', desc: '5 verbatim memories' });
  if (Object.keys(entityCounts).length >= 5) achievements.push({ icon: '🌐', name: 'Connected', desc: '5 unique entities' });
  if (avgSalience >= 70) achievements.push({ icon: '⚡', name: 'High Impact', desc: 'Avg salience 70+' });
  if (Object.keys(sourceCounts).length >= 2) achievements.push({ icon: '📡', name: 'Multi-Source', desc: '2+ data sources' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>MemoRable - Memory Intelligence</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a1a;
      --bg-secondary: #12122a;
      --bg-card: #1a1a3a;
      --accent-primary: #00f0ff;
      --accent-secondary: #ff00ff;
      --accent-gold: #ffd700;
      --accent-green: #00ff88;
      --text-primary: #ffffff;
      --text-secondary: #8888aa;
      --glow-cyan: 0 0 20px rgba(0, 240, 255, 0.5);
      --glow-magenta: 0 0 20px rgba(255, 0, 255, 0.5);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Animated background */
    .bg-animation {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      background:
        radial-gradient(ellipse at 20% 80%, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(255, 0, 255, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(0, 255, 136, 0.05) 0%, transparent 70%);
      animation: bgPulse 8s ease-in-out infinite;
    }

    @keyframes bgPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* Floating particles */
    .particles {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      overflow: hidden;
    }

    .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: var(--accent-primary);
      border-radius: 50%;
      animation: float 15s infinite linear;
      opacity: 0.6;
    }

    @keyframes float {
      0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
      10% { opacity: 0.6; }
      90% { opacity: 0.6; }
      100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; }
    }

    /* Header */
    .header {
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 28px;
      font-weight: 900;
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: var(--glow-cyan);
    }

    .status-bar {
      display: flex;
      gap: 20px;
      align-items: center;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(0, 255, 136, 0); }
    }

    /* Main grid */
    .dashboard {
      padding: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      max-width: 1600px;
      margin: 0 auto;
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      border-radius: 16px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,0.1);
      position: relative;
      overflow: hidden;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--glow-cyan);
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
    }

    .card-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }

    /* Level Card - Main hero */
    .level-card {
      grid-column: span 2;
      display: flex;
      align-items: center;
      gap: 30px;
    }

    .level-orb {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, var(--accent-primary), var(--accent-secondary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Orbitron', sans-serif;
      font-size: 36px;
      font-weight: 900;
      box-shadow: var(--glow-cyan), var(--glow-magenta);
      animation: orbGlow 3s ease-in-out infinite;
      flex-shrink: 0;
    }

    @keyframes orbGlow {
      0%, 100% { box-shadow: 0 0 30px rgba(0, 240, 255, 0.5), 0 0 60px rgba(255, 0, 255, 0.3); }
      50% { box-shadow: 0 0 50px rgba(0, 240, 255, 0.8), 0 0 80px rgba(255, 0, 255, 0.5); }
    }

    .level-info { flex: 1; }
    .level-info h2 { font-family: 'Orbitron', sans-serif; font-size: 24px; margin-bottom: 8px; }
    .level-info p { color: var(--text-secondary); margin-bottom: 16px; }

    .xp-bar {
      height: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }

    .xp-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-green));
      border-radius: 6px;
      transition: width 0.5s ease;
      position: relative;
    }

    .xp-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      animation: shimmer 2s infinite;
    }

    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    .xp-text {
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Big number stat */
    .big-stat {
      text-align: center;
    }

    .big-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 56px;
      font-weight: 900;
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-green));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
    }

    .big-label {
      font-size: 14px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    /* Memory quality bars */
    .quality-bars {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .quality-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .quality-label {
      width: 80px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .quality-bar {
      flex: 1;
      height: 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      overflow: hidden;
    }

    .quality-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .legendary .quality-fill { background: linear-gradient(90deg, #ffd700, #ff8c00); }
    .epic .quality-fill { background: linear-gradient(90deg, #a855f7, #ec4899); }
    .rare .quality-fill { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
    .common .quality-fill { background: linear-gradient(90deg, #6b7280, #9ca3af); }

    .quality-count {
      width: 40px;
      text-align: right;
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
    }

    /* Entity constellation */
    .constellation {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .entity-node {
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-radius: 20px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.3s ease;
    }

    .entity-node:hover {
      border-color: var(--accent-primary);
      box-shadow: var(--glow-cyan);
    }

    .entity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-primary);
    }

    .entity-count {
      color: var(--text-secondary);
      font-size: 11px;
    }

    /* Achievements */
    .achievements {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    }

    .achievement {
      text-align: center;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 12px;
      transition: transform 0.3s ease;
    }

    .achievement:hover {
      transform: scale(1.05);
    }

    .achievement-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .achievement-name {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .achievement-desc {
      font-size: 10px;
      color: var(--text-secondary);
    }

    /* Activity feed */
    .activity-feed {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 250px;
      overflow-y: auto;
    }

    .activity-item {
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border-left: 3px solid var(--accent-primary);
      animation: slideIn 0.5s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .activity-content {
      font-size: 13px;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .activity-meta {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
    }

    /* Gauge meter */
    .gauge {
      position: relative;
      width: 150px;
      height: 75px;
      margin: 0 auto 20px;
      overflow: hidden;
    }

    .gauge-bg {
      position: absolute;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 12px solid var(--bg-secondary);
      border-bottom-color: transparent;
      border-left-color: transparent;
      transform: rotate(-45deg);
    }

    .gauge-fill {
      position: absolute;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 12px solid var(--accent-primary);
      border-bottom-color: transparent;
      border-left-color: transparent;
      transform: rotate(-45deg);
      clip-path: polygon(0 0, 100% 0, 100% 50%, 0 50%);
      transition: transform 0.5s ease;
    }

    .gauge-value {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 700;
    }

    /* Data streams */
    .data-streams {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stream {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: var(--bg-secondary);
      border-radius: 8px;
    }

    .stream-icon {
      width: 32px;
      height: 32px;
      background: var(--accent-primary);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .stream-info { flex: 1; }
    .stream-name { font-size: 13px; font-weight: 600; }
    .stream-count { font-size: 11px; color: var(--text-secondary); }

    .stream-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      animation: pulse 2s infinite;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 30px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .level-card { grid-column: span 1; flex-direction: column; text-align: center; }
      .level-orb { width: 80px; height: 80px; font-size: 24px; }
      .dashboard { padding: 15px; gap: 15px; }
      .header { padding: 15px 20px; flex-direction: column; gap: 15px; }
    }
  </style>
</head>
<body>
  <div class="bg-animation"></div>
  <div class="particles">
    ${Array.from({length: 20}, (_, i) => `
      <div class="particle" style="
        left: ${Math.random() * 100}%;
        animation-delay: ${Math.random() * 15}s;
        animation-duration: ${10 + Math.random() * 10}s;
      "></div>
    `).join('')}
  </div>

  <div class="header">
    <div class="logo">MemoRable</div>
    <div class="status-bar">
      <div class="status-item">
        <div class="status-dot"></div>
        <span>Live</span>
      </div>
      <div class="status-item">
        <span>Uptime: ${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m</span>
      </div>
    </div>
  </div>

  <div class="dashboard">
    <!-- Level Card -->
    <div class="card level-card">
      <div class="level-orb">${level}</div>
      <div class="level-info">
        <h2>Memory Level ${level}</h2>
        <p>Your AI memory system is growing stronger with every interaction</p>
        <div class="xp-bar">
          <div class="xp-fill" style="width: ${(xpInLevel / xpToNextLevel) * 100}%"></div>
        </div>
        <div class="xp-text">${xpInLevel} / ${xpToNextLevel} memories to next level</div>
      </div>
    </div>

    <!-- Total Memories -->
    <div class="card">
      <div class="card-title">Memory Bank</div>
      <div class="big-stat">
        <div class="big-number">${memoryCount}</div>
        <div class="big-label">Total Memories Stored</div>
      </div>
    </div>

    <!-- Memory Power -->
    <div class="card">
      <div class="card-title">Memory Power</div>
      <div class="big-stat">
        <div class="big-number">${avgSalience}</div>
        <div class="big-label">Average Salience Score</div>
      </div>
    </div>

    <!-- Quality Distribution -->
    <div class="card">
      <div class="card-title">Memory Quality</div>
      <div class="quality-bars">
        <div class="quality-row legendary">
          <span class="quality-label" style="color: #ffd700;">Legendary</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.legendary / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.legendary}</span>
        </div>
        <div class="quality-row epic">
          <span class="quality-label" style="color: #a855f7;">Epic</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.epic / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.epic}</span>
        </div>
        <div class="quality-row rare">
          <span class="quality-label" style="color: #3b82f6;">Rare</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.rare / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.rare}</span>
        </div>
        <div class="quality-row common">
          <span class="quality-label" style="color: #6b7280;">Common</span>
          <div class="quality-bar">
            <div class="quality-fill" style="width: ${memoryCount ? (salienceRanges.common / memoryCount) * 100 : 0}%"></div>
          </div>
          <span class="quality-count">${salienceRanges.common}</span>
        </div>
      </div>
    </div>

    <!-- Authenticity Score -->
    <div class="card">
      <div class="card-title">Authenticity Score</div>
      <div style="text-align: center;">
        <div class="big-number" style="font-size: 42px;">${authenticityScore}%</div>
        <div class="big-label">Memory Fidelity Rating</div>
        <div style="margin-top: 16px; display: flex; justify-content: center; gap: 16px; font-size: 12px;">
          <span style="color: var(--accent-green);">💎 ${fidelityCounts.verbatim} Verbatim</span>
          <span style="color: var(--accent-gold);">🔮 ${fidelityCounts.derived} Derived</span>
          <span style="color: var(--text-secondary);">📝 ${fidelityCounts.standard} Standard</span>
        </div>
      </div>
    </div>

    <!-- Entity Constellation -->
    <div class="card">
      <div class="card-title">Entity Constellation</div>
      <div class="constellation">
        ${topEntities.length > 0 ? topEntities.map(([name, count]) => `
          <div class="entity-node">
            <div class="entity-dot"></div>
            <span>${name}</span>
            <span class="entity-count">${count}</span>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">No entities yet</span>'}
      </div>
    </div>

    <!-- Data Streams -->
    <div class="card">
      <div class="card-title">Data Streams</div>
      <div class="data-streams">
        ${Object.entries(sourceCounts).map(([source, count]) => `
          <div class="stream">
            <div class="stream-icon">${source === 'slack' ? '💬' : source === 'api' ? '🔌' : '📡'}</div>
            <div class="stream-info">
              <div class="stream-name">${source.charAt(0).toUpperCase() + source.slice(1)}</div>
              <div class="stream-count">${count} memories ingested</div>
            </div>
            <div class="stream-indicator"></div>
          </div>
        `).join('') || '<span style="color: var(--text-secondary);">No data streams active</span>'}
      </div>
    </div>

    <!-- Achievements -->
    <div class="card" style="grid-column: span 2;">
      <div class="card-title">Achievements Unlocked</div>
      <div class="achievements">
        ${achievements.length > 0 ? achievements.map(a => `
          <div class="achievement">
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">Start storing memories to unlock achievements!</span>'}
      </div>
    </div>

    <!-- Activity Feed -->
    <div class="card">
      <div class="card-title">Recent Activity</div>
      <div class="activity-feed">
        ${recentMemories.length > 0 ? recentMemories.map(m => `
          <div class="activity-item">
            <div class="activity-content">${m.content.substring(0, 60)}${m.content.length > 60 ? '...' : ''}</div>
            <div class="activity-meta">
              <span>Salience: ${m.salience}</span>
              <span>${new Date(m.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        `).join('') : '<span style="color: var(--text-secondary);">No activity yet</span>'}
      </div>
    </div>
  </div>

  <div class="footer">
    <strong>MemoRable</strong> — Memory Intelligence for AI Agents<br>
    Dashboard auto-refreshes every 5 seconds | <a href="/dashboard" style="color: var(--accent-primary);">Classic View</a> | <a href="/metrics" style="color: var(--accent-primary);">Raw Metrics</a>
  </div>

  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);

    // Add subtle animation to numbers on load
    document.querySelectorAll('.big-number').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'all 0.5s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 100);
    });
  </script>
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

  // Calculate patterns from memories
  const patterns = analyzePatterns(memories);

  // Get active device contexts
  const devices = Array.from(deviceContextStore.values());
  const activeDevices = devices.filter(d => d.context?.isActive);

  res.json({
    summary: {
      totalMemories: memories.length,
      avgSalience,
      uniqueEntities: Object.keys(entityCounts).length,
      dataSources: Object.keys(sourceCounts).length,
      activeDevices: activeDevices.length,
      totalDevices: devices.length,
    },
    salience: salienceRanges,
    fidelity: fidelityCounts,
    sources: sourceCounts,
    topEntities: Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count })),
    patterns,
    devices: devices.map(d => ({
      deviceId: d.deviceId,
      deviceType: d.deviceType,
      location: d.context?.location,
      activity: d.context?.activity,
      isActive: d.context?.isActive,
      lastSeen: d.lastSeen,
    })),
  });
});

// Pattern analysis from memory data
function analyzePatterns(memories) {
  if (memories.length === 0) {
    return {
      observationDays: 0,
      readyForPrediction: false,
      cycles: {},
      appUsage: {},
      timePatterns: {},
    };
  }

  // Calculate observation window
  const timestamps = memories.map(m => new Date(m.timestamp).getTime());
  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const observationDays = Math.ceil((newest - oldest) / (24 * 60 * 60 * 1000));

  // App usage patterns (from context events)
  const appUsage = {};
  const timePatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  memories.forEach(m => {
    // App tracking
    if (m.context?.app) {
      appUsage[m.context.app] = (appUsage[m.context.app] || 0) + 1;
    }

    // Time of day patterns
    const hour = new Date(m.timestamp).getHours();
    if (hour >= 5 && hour < 12) timePatterns.morning++;
    else if (hour >= 12 && hour < 17) timePatterns.afternoon++;
    else if (hour >= 17 && hour < 21) timePatterns.evening++;
    else timePatterns.night++;
  });

  // Cycle detection (weekly patterns)
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
  memories.forEach(m => {
    const dow = new Date(m.timestamp).getDay();
    dayOfWeekCounts[dow]++;
  });

  const avgPerDay = memories.length / 7;
  const weeklyPattern = dayOfWeekCounts.map((count, day) => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
    count,
    deviation: avgPerDay > 0 ? ((count - avgPerDay) / avgPerDay * 100).toFixed(1) + '%' : '0%',
  }));

  return {
    observationDays,
    readyForPrediction: observationDays >= 21,
    confidence: Math.min(1, observationDays / 21).toFixed(2),
    cycles: {
      weekly: weeklyPattern,
      peakDay: weeklyPattern.sort((a, b) => b.count - a.count)[0]?.day || 'N/A',
    },
    timePatterns,
    topApps: Object.entries(appUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([app, count]) => ({ app, count })),
  };
}

// =============================================================================
// MEMORY ENDPOINTS
// Basic store/retrieve for testing - uses in-memory store or DocumentDB
// =============================================================================

// In-memory store (fallback if no DB configured)
const memoryStore = new Map();

// =============================================================================
// BACKUP & RESTORE SYSTEM
// "TEMPORAL CONTROL → The power to CHOOSE what to forget"
// Minute-level recovery with segmented storage
// =============================================================================

// Backup store - holds snapshots indexed by timestamp
const backupStore = new Map();

// Frames - named recovery points (like git tags)
const frameStore = new Map();

// Configuration
const BACKUP_CONFIG = {
  SEGMENT_SIZE: parseInt(process.env.BACKUP_SEGMENT_SIZE) || 100, // memories per segment
  MAX_BACKUPS: parseInt(process.env.MAX_BACKUPS) || 60, // keep last 60 backups (1 hour at 1/min)
  AUTO_BACKUP_INTERVAL_MS: parseInt(process.env.AUTO_BACKUP_INTERVAL_MS) || 60000, // 1 minute
};

/**
 * Create a backup snapshot of all memories.
 * Stores in segments for efficient retrieval and transfer.
 *
 * @param {string} reason - Why the backup was created
 * @param {string} frameName - Optional: create a named frame for this backup
 * @returns {object} Backup manifest
 */
function createBackup(reason = 'manual', frameName = null) {
  const timestamp = new Date().toISOString();
  const memories = Array.from(memoryStore.values());

  // Segment the memories
  const segments = [];
  for (let i = 0; i < memories.length; i += BACKUP_CONFIG.SEGMENT_SIZE) {
    const segment = memories.slice(i, i + BACKUP_CONFIG.SEGMENT_SIZE);
    segments.push({
      index: Math.floor(i / BACKUP_CONFIG.SEGMENT_SIZE),
      count: segment.length,
      memories: segment,
      checksum: simpleChecksum(JSON.stringify(segment)),
    });
  }

  // Create backup manifest
  const backup = {
    id: `backup_${Date.now()}`,
    timestamp,
    reason,
    total_memories: memories.length,
    segment_count: segments.length,
    segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
    segments,
    metadata: {
      created_by: 'memorable',
      version: '2.0.0',
      checksum: simpleChecksum(JSON.stringify(memories)),
    },
  };

  // Store the backup
  backupStore.set(backup.id, backup);

  // Create frame if requested
  if (frameName) {
    frameStore.set(frameName, {
      name: frameName,
      backup_id: backup.id,
      created_at: timestamp,
      memory_count: memories.length,
    });
  }

  // Prune old backups (keep only MAX_BACKUPS)
  pruneOldBackups();

  metrics.inc('backup_created_total', { reason });

  return {
    id: backup.id,
    timestamp,
    total_memories: memories.length,
    segment_count: segments.length,
    frame: frameName || null,
  };
}

/**
 * Restore from a backup - point-in-time recovery.
 *
 * @param {string} backupId - The backup ID to restore from
 * @param {object} options - Restore options
 * @returns {object} Restore result
 */
function restoreFromBackup(backupId, options = {}) {
  const backup = backupStore.get(backupId);
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const { merge = false, segmentFilter = null } = options;

  // Verify backup integrity
  const allMemories = backup.segments.flatMap(s => s.memories);
  const currentChecksum = simpleChecksum(JSON.stringify(allMemories));
  if (currentChecksum !== backup.metadata.checksum) {
    console.warn('[Backup] Checksum mismatch - backup may be corrupted');
  }

  // Apply segment filter if specified (restore only specific segments)
  let memoriesToRestore = allMemories;
  if (segmentFilter !== null) {
    const filteredSegments = backup.segments.filter(s =>
      Array.isArray(segmentFilter) ? segmentFilter.includes(s.index) : s.index === segmentFilter
    );
    memoriesToRestore = filteredSegments.flatMap(s => s.memories);
  }

  // Create backup of current state before restore (safety net)
  const preRestoreBackup = createBackup('pre_restore_safety', null);

  // Clear or merge
  if (!merge) {
    memoryStore.clear();
  }

  // Restore memories
  let restored = 0;
  let skipped = 0;
  for (const memory of memoriesToRestore) {
    if (merge && memoryStore.has(memory.id)) {
      skipped++;
      continue;
    }
    memoryStore.set(memory.id, memory);
    restored++;
  }

  metrics.inc('backup_restored_total', {});

  return {
    success: true,
    backup_id: backupId,
    backup_timestamp: backup.timestamp,
    restored_count: restored,
    skipped_count: skipped,
    merge_mode: merge,
    safety_backup_id: preRestoreBackup.id,
    current_memory_count: memoryStore.size,
  };
}

/**
 * Restore from a named frame.
 */
function restoreFromFrame(frameName, options = {}) {
  const frame = frameStore.get(frameName);
  if (!frame) {
    throw new Error(`Frame not found: ${frameName}`);
  }
  return restoreFromBackup(frame.backup_id, options);
}

/**
 * List all available backups.
 */
function listBackups(limit = 20) {
  const backups = Array.from(backupStore.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(b => ({
      id: b.id,
      timestamp: b.timestamp,
      reason: b.reason,
      total_memories: b.total_memories,
      segment_count: b.segment_count,
      age_minutes: Math.round((Date.now() - new Date(b.timestamp)) / 60000),
    }));

  return backups;
}

/**
 * List all named frames.
 */
function listFrames() {
  return Array.from(frameStore.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Get a specific segment from a backup (for efficient transfer).
 */
function getBackupSegment(backupId, segmentIndex) {
  const backup = backupStore.get(backupId);
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const segment = backup.segments.find(s => s.index === segmentIndex);
  if (!segment) {
    throw new Error(`Segment ${segmentIndex} not found in backup ${backupId}`);
  }

  return {
    backup_id: backupId,
    backup_timestamp: backup.timestamp,
    segment_index: segmentIndex,
    total_segments: backup.segment_count,
    memory_count: segment.count,
    checksum: segment.checksum,
    memories: segment.memories,
  };
}

/**
 * Simple checksum for integrity verification.
 */
function simpleChecksum(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Prune old backups to prevent memory bloat.
 * Keeps named frames and their backups.
 */
function pruneOldBackups() {
  const framedBackupIds = new Set(Array.from(frameStore.values()).map(f => f.backup_id));

  const backups = Array.from(backupStore.entries())
    .filter(([id]) => !framedBackupIds.has(id)) // Don't prune framed backups
    .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));

  // Remove oldest backups beyond MAX_BACKUPS
  const toRemove = backups.slice(BACKUP_CONFIG.MAX_BACKUPS);
  for (const [id] of toRemove) {
    backupStore.delete(id);
  }

  if (toRemove.length > 0) {
    console.log(`[Backup] Pruned ${toRemove.length} old backups`);
  }
}

// Auto-backup timer (disabled in test environment)
let autoBackupTimer = null;
if (process.env.NODE_ENV !== 'test' && BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS > 0) {
  autoBackupTimer = setInterval(() => {
    if (memoryStore.size > 0) {
      createBackup('auto');
      console.log(`[Backup] Auto-backup created: ${memoryStore.size} memories`);
    }
  }, BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS);
}

// =============================================================================
// BACKUP & RESTORE ENDPOINTS
// =============================================================================

// Create a backup
app.post('/backup', (_req, res) => {
  try {
    const { reason = 'manual', frame } = _req.body || {};
    const result = createBackup(reason, frame);
    res.status(201).json(result);
  } catch (error) {
    console.error('[Backup] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all backups
app.get('/backup', (_req, res) => {
  try {
    const limit = parseInt(_req.query.limit) || 20;
    const backups = listBackups(limit);
    res.json({
      count: backups.length,
      backups,
      config: {
        segment_size: BACKUP_CONFIG.SEGMENT_SIZE,
        max_backups: BACKUP_CONFIG.MAX_BACKUPS,
        auto_interval_minutes: BACKUP_CONFIG.AUTO_BACKUP_INTERVAL_MS / 60000,
      },
    });
  } catch (error) {
    console.error('[Backup] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get backup details
app.get('/backup/:id', (req, res) => {
  try {
    const backup = backupStore.get(req.params.id);
    if (!backup) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    // Return manifest without full memory data (for efficiency)
    res.json({
      id: backup.id,
      timestamp: backup.timestamp,
      reason: backup.reason,
      total_memories: backup.total_memories,
      segment_count: backup.segment_count,
      segment_size: backup.segment_size,
      metadata: backup.metadata,
      segments: backup.segments.map(s => ({
        index: s.index,
        count: s.count,
        checksum: s.checksum,
      })),
    });
  } catch (error) {
    console.error('[Backup] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific segment from a backup
app.get('/backup/:id/segment/:index', (req, res) => {
  try {
    const segment = getBackupSegment(req.params.id, parseInt(req.params.index));
    res.json(segment);
  } catch (error) {
    console.error('[Backup] Get segment error:', error);
    res.status(404).json({ error: error.message });
  }
});

// Restore from a backup
app.post('/restore', (req, res) => {
  try {
    const { backup_id, frame, merge = false, segments = null } = req.body;

    if (!backup_id && !frame) {
      res.status(400).json({ error: 'backup_id or frame is required' });
      return;
    }

    let result;
    if (frame) {
      result = restoreFromFrame(frame, { merge, segmentFilter: segments });
    } else {
      result = restoreFromBackup(backup_id, { merge, segmentFilter: segments });
    }

    res.json(result);
  } catch (error) {
    console.error('[Restore] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create a named frame (recovery point)
app.post('/frame', (req, res) => {
  try {
    const { name, reason = 'manual_frame' } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    if (frameStore.has(name)) {
      res.status(409).json({ error: `Frame '${name}' already exists` });
      return;
    }

    const backup = createBackup(reason, name);
    res.status(201).json({
      success: true,
      frame: name,
      backup_id: backup.id,
      memory_count: backup.total_memories,
      timestamp: backup.timestamp,
    });
  } catch (error) {
    console.error('[Frame] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all frames
app.get('/frame', (_req, res) => {
  try {
    const frames = listFrames();
    res.json({
      count: frames.length,
      frames,
    });
  } catch (error) {
    console.error('[Frame] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get frame details
app.get('/frame/:name', (req, res) => {
  try {
    const frame = frameStore.get(req.params.name);
    if (!frame) {
      res.status(404).json({ error: 'Frame not found' });
      return;
    }

    const backup = backupStore.get(frame.backup_id);
    res.json({
      ...frame,
      backup_available: !!backup,
      backup_segments: backup ? backup.segment_count : null,
    });
  } catch (error) {
    console.error('[Frame] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a frame (does not delete the backup)
app.delete('/frame/:name', (req, res) => {
  try {
    const frame = frameStore.get(req.params.name);
    if (!frame) {
      res.status(404).json({ error: 'Frame not found' });
      return;
    }

    frameStore.delete(req.params.name);
    res.json({
      success: true,
      deleted_frame: req.params.name,
      note: 'Backup still available until pruned',
    });
  } catch (error) {
    console.error('[Frame] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    // Apply better-self prosody filter
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      // Memory filtered - return success but with filter info
      metrics.inc('memory_prosody_filtered', { entityType });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
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
      metadata: {
        ...metadata,
        prosody: filterResult.prosody,  // Store prosody analysis
      },
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

    // Apply temporal perspective to each memory
    // This adjusts salience based on how time changes perception
    memories = memories.map(applyTemporalPerspective);

    // Sort by adjusted salience (highest first) - this is the "current" importance
    memories.sort((a, b) => (b.adjusted_salience || b.salience) - (a.adjusted_salience || a.salience));

    // Limit results
    memories = memories.slice(0, parseInt(limit));

    metrics.inc('memory_retrieve_total', {});
    metrics.observe('memory_retrieve_latency_ms', {}, Date.now() - start);

    res.json({
      count: memories.length,
      memories,
      _meta: {
        note: 'adjusted_salience reflects current temporal perspective - memories shift in importance over time',
      }
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
    // Apply temporal perspective to show current state
    const enrichedMemory = applyTemporalPerspective(memory);
    res.json(enrichedMemory);
  } catch (error) {
    console.error('[Memory] Get by ID error:', error);
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

// Get perspective analysis for a memory
// Shows how this memory's perceived importance has shifted over time
app.get('/memory/:id/perspective', (req, res) => {
  try {
    const memory = memoryStore.get(req.params.id);
    if (!memory) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }

    const perspective = calculatePerspective(memory.timestamp, memory.context);

    res.json({
      memory_id: memory.id,
      content_preview: memory.content.substring(0, 100),
      original_salience: memory.salience,
      perspective,
      adjusted_salience: Math.min(100, Math.max(0, Math.round(memory.salience * perspective.perspective_factor))),
      interpretation: perspective.perspective_factor > 1
        ? 'This memory has GROWN in importance over time (wisdom/pattern recognition)'
        : perspective.perspective_factor < 0.8
          ? 'This memory has FADED in emotional intensity (normal temporal drift)'
          : 'This memory maintains stable importance',
    });
  } catch (error) {
    console.error('[Memory] Perspective error:', error);
    res.status(500).json({ error: 'Failed to calculate perspective' });
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
// DEVICE CONTEXT SYNC
// Real-time context from OSX/iOS/Android agents
// =============================================================================

// Store for device contexts (in-memory, would be Redis in production)
const deviceContextStore = new Map();

// Sync device context (called by agents)
app.post('/context/sync', (req, res) => {
  try {
    const { userId, deviceId, deviceType, context, timestamp } = req.body;

    if (!userId || !deviceId) {
      res.status(400).json({ error: 'userId and deviceId required' });
      return;
    }

    const deviceContext = {
      userId,
      deviceId,
      deviceType: deviceType || 'unknown',
      context: context || {},
      timestamp: timestamp || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    // Store by device
    deviceContextStore.set(deviceId, deviceContext);

    // Update unified user context
    const userDevices = Array.from(deviceContextStore.values())
      .filter(d => d.userId === userId);

    const unifiedContext = {
      userId,
      devices: userDevices.map(d => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        isActive: d.context.isActive,
        lastSeen: d.lastSeen,
      })),
      // Merge contexts - most recent active device wins
      current: userDevices
        .filter(d => d.context.isActive)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.context || {},
      timestamp: new Date().toISOString(),
    };

    metrics.inc('context_sync_total', { deviceType });

    res.json({
      success: true,
      deviceContext,
      unifiedContext,
    });
  } catch (error) {
    console.error('[Context] Sync error:', error);
    res.status(500).json({ error: 'Failed to sync context' });
  }
});

// Get current context for user
app.get('/context/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const userDevices = Array.from(deviceContextStore.values())
      .filter(d => d.userId === userId);

    if (userDevices.length === 0) {
      res.json({ userId, devices: [], current: null });
      return;
    }

    // Find most recent active context
    const activeDevices = userDevices
      .filter(d => d.context.isActive)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      userId,
      devices: userDevices.map(d => ({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        context: d.context,
        lastSeen: d.lastSeen,
        isActive: d.context.isActive,
      })),
      current: activeDevices[0]?.context || null,
      primaryDevice: activeDevices[0]?.deviceId || null,
    });
  } catch (error) {
    console.error('[Context] Get error:', error);
    res.status(500).json({ error: 'Failed to get context' });
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
    const { content, entity, entities, entityType = 'user', source, context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source) {
      res.status(400).json({ error: 'source is required for verbatim memories (who said this?)' });
      return;
    }

    // Apply better-self prosody filter (even for verbatim - don't store meltdowns)
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      // Memory filtered - return success but with filter info
      metrics.inc('memory_prosody_filtered', { type: 'verbatim' });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
      return;
    }

    // Support both single entity and entities array (same as /memory endpoint)
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = ['default'];
    }

    const memory = {
      id: `vmem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,           // WHO was involved (array)
      entity: entityList[0],          // Backward compat: primary entity
      entityType,
      context: { ...context, verbatim: true },
      metadata: { ...metadata, source, exact_quote: true, prosody: filterResult.prosody },
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

// Analyze prosody without storing - test endpoint
app.post('/prosody/analyze', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    const prosody = analyzeProsody(content);
    const filterResult = applyBetterSelfFilter(content);

    res.json({
      prosody,
      wouldStore: filterResult.shouldStore,
      filterReason: filterResult.reason,
      message: filterResult.message || 'Content would be stored',
    });
  } catch (error) {
    console.error('[Prosody] Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze prosody' });
  }
});

// Store INTERPRETATION - must link to source verbatim memory
// Use this when storing AI understanding of what was said
app.post('/memory/interpretation', async (req, res) => {
  const start = Date.now();
  try {
    const { content, entity, entities, entityType = 'user', source_memory_id, interpreter = 'claude', context = {}, metadata = {} } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    if (!source_memory_id) {
      res.status(400).json({ error: 'source_memory_id is required - interpretations must link to verbatim source' });
      return;
    }

    // Apply better-self prosody filter
    const filterResult = applyBetterSelfFilter(content, {
      forceStore: metadata.forceStore || context.forceStore,
      bypassFilter: metadata.bypassFilter || context.bypassFilter,
    });

    if (!filterResult.shouldStore) {
      metrics.inc('memory_prosody_filtered', { type: 'interpretation' });
      res.status(200).json({
        success: true,
        filtered: true,
        reason: filterResult.reason,
        message: filterResult.message,
        prosody: filterResult.prosody,
      });
      return;
    }

    // Verify source exists
    const sourceMemory = memoryStore.get(source_memory_id);
    if (!sourceMemory) {
      res.status(404).json({ error: 'Source memory not found - interpretation must link to existing memory' });
      return;
    }

    // Support both single entity and entities array
    // Default to source memory's entities if not provided
    let entityList = entities || [];
    if (entity && !entityList.includes(entity)) {
      entityList = [entity, ...entityList];
    }
    if (entityList.length === 0) {
      entityList = sourceMemory.entities || [sourceMemory.entity] || ['default'];
    }

    const memory = {
      id: `imem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      entities: entityList,
      entity: entityList[0],
      entityType: entityType || sourceMemory.entityType,
      context,
      metadata: {
        ...metadata,
        interpreter,
        derived_from: source_memory_id,
        source_content: sourceMemory.content.substring(0, 100),
        prosody: filterResult.prosody,
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

// =============================================================================
// TEMPORAL PERSPECTIVE TRACKING
// "memories are like versioning atoms... distances and things change" - Alan
// When you were a child, stores were big. Now they're small. Same store.
// We track how memory perception shifts over time.
// =============================================================================

/**
 * Calculate temporal perspective factors for a memory.
 * This captures how the "scale" or importance of a memory might shift over time.
 *
 * @param {Date} createdAt - When the memory was created
 * @param {object} context - Context including emotional state, life stage, etc.
 * @returns {object} Perspective factors
 */
function calculatePerspective(createdAt, context = {}) {
  const now = new Date();
  const ageMs = now - new Date(createdAt);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Original scale - how "big" it felt when created (1-10)
  // Higher emotional content = felt bigger at the time
  let originalScale = 5; // Default neutral
  if (context.emotionalIntensity) {
    originalScale = Math.min(10, context.emotionalIntensity);
  }
  if (context.priority === 'high') originalScale = Math.min(10, originalScale + 2);
  if (context.isOpenLoop) originalScale = Math.min(10, originalScale + 1);

  // Temporal drift - how much perspective shifts over time
  // Memories generally "shrink" in emotional impact but can also grow in wisdom value
  // Uses logarithmic decay - rapid initial change, then stabilizes
  const driftRate = context.driftRate || 0.1; // Configurable via env
  const temporalDrift = Math.log10(1 + ageDays * driftRate);

  // Current perceived scale - adjusted by temporal drift
  // Fresh memories feel bigger, older memories feel more "settled"
  // But some memories GROW in importance (wisdom, patterns recognized later)
  let currentScale = originalScale;
  if (context.growsWithTime) {
    // This memory type appreciates with age (wisdom, pattern recognition)
    currentScale = Math.min(10, originalScale * (1 + temporalDrift * 0.2));
  } else {
    // Default: emotional intensity fades, but never below 20% of original
    currentScale = Math.max(originalScale * 0.2, originalScale * Math.exp(-temporalDrift * 0.3));
  }

  // Perspective factor - multiplier for salience recalculation
  // 1.0 = no change, >1 = grew in importance, <1 = diminished
  const perspectiveFactor = originalScale > 0 ? currentScale / originalScale : 1;

  return {
    original_scale: Math.round(originalScale * 10) / 10,
    current_scale: Math.round(currentScale * 10) / 10,
    temporal_drift: Math.round(temporalDrift * 100) / 100,
    perspective_factor: Math.round(perspectiveFactor * 100) / 100,
    age_days: Math.round(ageDays),
    assessed_at: now.toISOString(),
  };
}

/**
 * Recalculate salience with temporal perspective applied.
 * Call this when retrieving memories to get "current" salience.
 */
function applyTemporalPerspective(memory) {
  if (!memory.timestamp) return memory;

  const perspective = calculatePerspective(memory.timestamp, memory.context);
  const adjustedSalience = Math.round(memory.salience * perspective.perspective_factor);

  return {
    ...memory,
    perspective,
    adjusted_salience: Math.min(100, Math.max(0, adjustedSalience)),
  };
}

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
// PROSODY ANALYZER - "Better Self" Filter
// Detects emotional distress and filters memories to represent who you want to be
// =============================================================================

/**
 * Analyze text for prosody/emotional indicators
 * Returns emotional state and whether content represents "better self"
 */
function analyzeProsody(content) {
  const text = content.toLowerCase();

  // Distress indicators - signs of emotional flooding
  const distressMarkers = {
    drowning: ['drowning', 'underwater', 'cant breathe', "can't breathe", 'suffocating'],
    helplessness: ['helpless', 'hopeless', 'trapped', 'stuck', 'cant escape', "can't escape", 'no way out'],
    panic: ['panic', 'terrified', 'scared', 'afraid', 'fear', 'anxious', 'anxiety'],
    anger: ['furious', 'rage', 'hate you', 'fuck you', 'fucking', 'bullshit', 'piece of shit'],
    shutdown: ['give up', 'quit', 'done', 'leaving', 'goodbye forever', 'never again'],
    repetition: [], // Detected by pattern, not keywords
    threats: ['kill', 'hurt', 'destroy', 'end it', 'harm'],
  };

  // Recovery/forward indicators - signs of moving through it
  const recoveryMarkers = {
    pivot: ['so!', 'anyway', 'moving on', 'lets do', "let's do", 'next step'],
    humor: ['lol', 'haha', ':d', ':)', 'funny', 'laugh'],
    constructive: ['build', 'create', 'fix', 'solve', 'implement', 'plan'],
    reflection: ['i realize', 'i understand', 'makes sense', 'learned'],
    forward: ['now', 'next', 'continue', 'proceed', 'ready'],
  };

  // Calculate distress score
  let distressScore = 0;
  let distressSignals = [];

  for (const [category, markers] of Object.entries(distressMarkers)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        distressScore += 15;
        distressSignals.push({ category, marker });
      }
    }
  }

  // Calculate recovery score
  let recoveryScore = 0;
  let recoverySignals = [];

  for (const [category, markers] of Object.entries(recoveryMarkers)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        recoveryScore += 10;
        recoverySignals.push({ category, marker });
      }
    }
  }

  // Detect all-caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  if (capsRatio > 0.5 && text.length > 20) {
    distressScore += 20;
    distressSignals.push({ category: 'shouting', marker: 'excessive caps' });
  }

  // Detect excessive punctuation (!!!???)
  const excessivePunctuation = (text.match(/[!?]{3,}/g) || []).length;
  if (excessivePunctuation > 0) {
    distressScore += 10 * excessivePunctuation;
    distressSignals.push({ category: 'intensity', marker: 'excessive punctuation' });
  }

  // Net emotional state
  const netScore = recoveryScore - distressScore;

  // Determine if this represents "better self"
  // Better self = either positive content, OR recovery happening (moving through it)
  const isBetterSelf = netScore >= 0 || recoveryScore > 0;
  const isDistressed = distressScore > 30;
  const isRecovering = recoveryScore > 0 && distressScore > 0;

  return {
    distressScore,
    recoveryScore,
    netScore,
    distressSignals,
    recoverySignals,
    isBetterSelf,
    isDistressed,
    isRecovering,
    recommendation: isDistressed && !isRecovering
      ? 'suppress'
      : isRecovering
        ? 'store_with_flag'
        : 'store',
  };
}

/**
 * Apply better-self filter to memory storage
 * Returns { shouldStore, prosody, reason }
 */
function applyBetterSelfFilter(content, options = {}) {
  const { forceStore = false, bypassFilter = false } = options;

  // Bypass filter if explicitly requested
  if (bypassFilter || forceStore) {
    return { shouldStore: true, prosody: null, reason: 'filter_bypassed' };
  }

  const prosody = analyzeProsody(content);

  // If severely distressed with no recovery signals, suppress storage
  if (prosody.recommendation === 'suppress') {
    metrics.inc('memory_filtered_distress', {});
    return {
      shouldStore: false,
      prosody,
      reason: 'distress_filter',
      message: 'Content filtered - not representative of better self. Memory not stored.'
    };
  }

  return { shouldStore: true, prosody, reason: prosody.recommendation };
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
