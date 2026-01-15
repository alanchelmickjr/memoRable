# Metrics Framework

## Focus

ONE thing: Track metrics. Tune system. Learn patterns over 21-day cycles.

Everything else cascades from this.

---

## The 21-Day Cycle

```
Day 1-21:   OBSERVE     → Collect baseline patterns
Day 22-42:  TUNE        → Apply first adjustments
Day 43-63:  VALIDATE    → Measure improvement
Day 64+:    ITERATE     → Repeat with refinements
```

21 days = enough time for weekly patterns to emerge (3 full weeks).

---

## What We Track

### Layer 1: Infrastructure (CloudWatch - already exists)

| Component | Key Metrics | Source |
|-----------|-------------|--------|
| DocumentDB | Latency, Memory, Connections | CloudWatch |
| Redis | Evictions, HitRate, Memory | CloudWatch |
| ECS | HealthyHosts, CPU, Memory | CloudWatch |
| ALB | 5XX, ResponseTime | CloudWatch |

**Action:** Enable CloudWatch dashboards. Zero code needed.

### Layer 2: Application (Build This)

| Metric | What It Measures | Implementation |
|--------|------------------|----------------|
| `memory.store_latency` | Write path speed | Instrument store endpoint |
| `memory.recall_latency` | Read path speed | Instrument recall endpoint |
| `salience.calc_time` | Scoring speed | Wrap salience calculator |
| `context.hit_rate` | Context relevance | Track frame hits/misses |

**Action:** Add timing instrumentation to existing code.

### Layer 3: Business Logic (Future)

| Metric | What It Measures | When |
|--------|------------------|------|
| `relevance.accuracy` | Did we surface right memory? | After user feedback loop |
| `anticipation.accuracy` | Did prediction come true? | After 21-day patterns |
| `trajectory.improvement` | Are users achieving goals? | After sufficient data |

**Action:** Defer until Layer 1 & 2 are stable.

---

## Implementation: Layer 2 (Application Metrics)

### Step 1: Metrics Endpoint

Add `/metrics` endpoint to server:

```javascript
// Prometheus-compatible format
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsRegistry.export());
});
```

### Step 2: Instrument Critical Paths

```javascript
// Wrap existing functions
async function storeMemory(memory) {
  const start = Date.now();
  try {
    const result = await originalStoreMemory(memory);
    metrics.record('memory.store_latency', Date.now() - start);
    metrics.increment('memory.store_count');
    return result;
  } catch (err) {
    metrics.increment('memory.store_errors');
    throw err;
  }
}
```

### Step 3: Simple Registry

```javascript
class MetricsRegistry {
  constructor() {
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
  }

  increment(name, value = 1) {
    this.counters[name] = (this.counters[name] || 0) + value;
  }

  record(name, value) {
    if (!this.histograms[name]) this.histograms[name] = [];
    this.histograms[name].push({ value, timestamp: Date.now() });
  }

  export() {
    // Prometheus format
    let output = '';
    for (const [name, value] of Object.entries(this.counters)) {
      output += `${name} ${value}\n`;
    }
    return output;
  }
}
```

---

## First 21 Days: What to Watch

### Week 1: Baseline
- What's normal latency?
- What's normal traffic pattern?
- When do errors happen?
- When is load highest?

### Week 2: Patterns
- Daily patterns (morning vs evening)
- Weekly patterns (weekday vs weekend)
- Correlation patterns (high traffic → high latency?)

### Week 3: Anomalies
- What deviates from pattern?
- What triggers deviations?
- What's predictable vs random?

---

## Tuning Levers

What can we actually adjust based on metrics?

| Lever | Trigger | Action |
|-------|---------|--------|
| ECS task count | CPU > 70% sustained | Scale up |
| Redis cache size | Evictions > 0 | Increase memory |
| Connection pool | Pool exhaustion | Increase limit |
| Salience weights | Low relevance accuracy | Adjust weights |
| Context window | Miss rate high | Widen window |

### Manual First, Auto Later

**First 21 days:** Watch metrics, tune MANUALLY.
**After patterns emerge:** Build auto-tuning rules.
**After auto-tuning works:** Train models to predict.

Don't automate what you don't understand yet.

---

## Storage: Where Metrics Live

### Short-term (Real-time)
- In-memory registry
- Redis for recent values
- Query for dashboards

### Medium-term (Analysis)
- MongoDB collection: `metrics_observations`
- Uses canonical schema from metrics-landscape.md
- 90-day retention

### Long-term (Patterns)
- Aggregated summaries only
- Daily/weekly/monthly rollups
- Indefinite retention

```javascript
// Canonical metric observation
{
  timestamp: ISODate("2026-01-14T21:30:00Z"),
  entity: "memorable-app",
  activity: "memory.store_latency",
  value: 45,  // ms
  why: {
    cause: "normal_operation",
    trigger: null,
    pattern: "evening_baseline",
    predicted: true,
    preventable: false
  },
  context: {
    traffic_level: "medium",
    time_of_day: "evening",
    day_of_week: "tuesday"
  }
}
```

---

## Dashboard: One Screen

CloudWatch handles infrastructure. For application metrics:

```
┌─────────────────────────────────────────────────────┐
│  MEMORABLE HEALTH              2026-01-14 21:30    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Store Latency    [====    ] 45ms  (target: <100)  │
│  Recall Latency   [===     ] 32ms  (target: <50)   │
│  Context Hit Rate [========] 87%   (target: >80%)  │
│  Error Rate       [        ] 0.1%  (target: <1%)   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  24h Trend: stable | Pattern: evening_baseline     │
│  Anomalies: none   | Next predicted spike: 6pm Tue │
│                                                     │
└─────────────────────────────────────────────────────┘
```

One glance. Health or not. Done.

---

## Next Steps (In Order)

1. **Enable CloudWatch dashboards** for existing infrastructure
2. **Add `/metrics` endpoint** to server.js
3. **Instrument store/recall paths** with timing
4. **Create metrics MongoDB collection** with canonical schema
5. **Build simple dashboard** or use Grafana
6. **Run 21 days** - observe patterns
7. **Document patterns** - what did we learn?
8. **Build first tuning rule** - manual then auto
9. **Repeat**

---

## What We DON'T Do Yet

- TensorFlow models (costs $)
- All 7 specialists (premature)
- Complex auto-tuning (don't understand patterns yet)
- Grafana/Prometheus stack (CloudWatch is enough for now)

Observe first. Tune second. Automate third. Model fourth.

Step by step. 21 days at a time.
