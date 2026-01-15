# MemoRable Metrics Landscape

## Philosophy

Metrics are weights. Not all signals are equal. Like salience scoring for memories, infrastructure telemetry must be balanced by **impact** and **value**. Chasing every metric leads to alert fatigue and noise. The right metrics surface the right problems at the right time.

---

## Component Metrics Map

### 1. DocumentDB (MongoDB-compatible)

**Source:** AWS CloudWatch (built-in)

| Metric | Impact | Value | Why |
|--------|--------|-------|-----|
| `CPUUtilization` | HIGH | MEDIUM | Sustained >80% = scaling needed |
| `FreeableMemory` | HIGH | HIGH | Memory exhaustion = queries fail |
| `DatabaseConnections` | MEDIUM | HIGH | Connection pool exhaustion kills apps |
| `ReadLatency` / `WriteLatency` | HIGH | HIGH | Direct user experience impact |
| `DiskQueueDepth` | MEDIUM | MEDIUM | Early warning for I/O bottleneck |
| `OpsCounter` (read/write/command) | LOW | MEDIUM | Capacity planning, not alerting |

**Weight Priority:** Latency > Memory > Connections > CPU > Disk > Ops

**MongoDB Atlas Advantage:** If migrating to Atlas, their Performance Advisor automatically identifies slow queries and index suggestions. Exquisite.

---

### 2. Redis (ElastiCache)

**Source:** AWS CloudWatch (built-in)

| Metric | Impact | Value | Why |
|--------|--------|-------|-----|
| `CacheHitRate` | HIGH | HIGH | Low hit rate = cache is pointless |
| `CurrConnections` | MEDIUM | MEDIUM | Connection limits rarely hit |
| `Evictions` | HIGH | HIGH | Data loss - cache too small |
| `ReplicationLag` | HIGH | LOW | Only matters with replicas |
| `CPUUtilization` | MEDIUM | MEDIUM | Redis is memory-bound, not CPU |
| `FreeableMemory` | HIGH | HIGH | OOM = crash |
| `CacheMisses` | MEDIUM | HIGH | Pattern indicator |

**Weight Priority:** Evictions > Memory > HitRate > Misses > CPU > Connections

**Context Frames Live Here:** Redis holds the real-time context. If it's evicting, you're losing user context mid-conversation.

---

### 3. ECS (Fargate)

**Source:** AWS CloudWatch (built-in)

| Metric | Impact | Value | Why |
|--------|--------|-------|-----|
| `CPUUtilization` | HIGH | HIGH | Scaling trigger, cost indicator |
| `MemoryUtilization` | HIGH | HIGH | OOM kills containers |
| `RunningTaskCount` | HIGH | MEDIUM | Zero = outage |
| `HealthyHostCount` | HIGH | HIGH | ALB routing depends on this |
| `TaskFailureCount` | HIGH | HIGH | Crash loop detection |

**Weight Priority:** HealthyHosts > TaskFailures > Memory > CPU > RunningCount

**The Heartbeat:** If ECS tasks aren't healthy, nothing else matters.

---

### 4. ALB (Application Load Balancer)

**Source:** AWS CloudWatch (built-in)

| Metric | Impact | Value | Why |
|--------|--------|-------|-----|
| `RequestCount` | LOW | MEDIUM | Traffic volume, not health |
| `TargetResponseTime` | HIGH | HIGH | User-facing latency |
| `HTTPCode_Target_5XX` | HIGH | HIGH | Your app is erroring |
| `HTTPCode_ELB_5XX` | HIGH | HIGH | Infrastructure is erroring |
| `HealthyHostCount` | HIGH | HIGH | Zero = complete outage |
| `UnHealthyHostCount` | HIGH | HIGH | Partial outage indicator |

**Weight Priority:** 5XX Errors > HealthyHosts > ResponseTime > RequestCount

**The Front Door:** Users see ALB latency and errors first.

---

### 5. Application-Level (Custom)

**Source:** `/health` endpoints, application logs

| Metric | Impact | Value | Why |
|--------|--------|-------|-----|
| `health.ready` | HIGH | HIGH | Service accepting traffic? |
| `health.uptime` | LOW | LOW | Curiosity, not actionable |
| `salience.calculation_time` | MEDIUM | HIGH | Core feature performance |
| `memory.store_latency` | HIGH | HIGH | Write path performance |
| `memory.recall_latency` | HIGH | HIGH | Read path performance |
| `context_frame.hit_rate` | HIGH | HIGH | Is context working? |
| `anticipation.accuracy` | MEDIUM | HIGH | Is prediction working? |

**Weight Priority:** Latencies > Hit Rates > Health > Accuracy > Uptime

**The Secret Sauce Metrics:** These measure whether MemoRable actually works better than vanilla mem0.

---

## Unified Weighting Model

Like salience scoring, we weight by category:

```
Infrastructure Health:  35%
├── ECS HealthyHosts
├── ALB 5XX Errors
└── Task Failures

Data Layer Health:      30%
├── DocumentDB Latency
├── Redis Evictions
└── Connection Pools

Performance:            25%
├── Response Times
├── Cache Hit Rates
└── Memory/CPU

Business Logic:         10%
├── Salience Accuracy
├── Anticipation Success
└── Context Relevance
```

**Why this weighting?**
- If infrastructure is down, nothing else matters (35%)
- If data layer is slow/broken, features fail (30%)
- If performance degrades, users leave (25%)
- Business logic issues are bugs, not emergencies (10%)

---

## Alert Tiers

### P1 - Wake Someone Up
- `HealthyHostCount = 0`
- `HTTPCode_Target_5XX > 10% of requests`
- `Redis Evictions > 0` (losing context)
- `DocumentDB FreeableMemory < 10%`

### P2 - Fix Today
- `TargetResponseTime > 2s`
- `CacheHitRate < 80%`
- `CPUUtilization > 80% sustained`
- `TaskFailureCount > 0`

### P3 - Track and Trend
- Request volume changes
- Ops counter patterns
- Replication lag
- Connection pool usage

---

## Dashboard Philosophy

**Don't build dashboards. Use what exists.**

- AWS CloudWatch: Infrastructure (free, already there)
- MongoDB Atlas: Database deep-dive (if migrated)
- Application `/metrics` endpoint: Business logic (future)

**One Screen Rule:** If you can't see system health in one glance, you have too many dashboards.

---

## Connection to MemoRable Core

These metrics ARE the salience inputs for infrastructure:

| Metric Category | Salience Parallel |
|-----------------|-------------------|
| 5XX Errors | Emotional (pain) |
| Latency Spikes | Novelty (deviation from norm) |
| Resource Exhaustion | Consequential (will cause failure) |
| Traffic Patterns | Relevance (what matters now) |
| Connection Health | Social (relationships between components) |

The same weighting philosophy that makes memory retrieval smart makes observability smart.

---

## Summary

**Impact:** Will this metric tell me about user-facing problems?
**Value:** Can I act on this metric when it changes?

High Impact + High Value = Alert on it
High Impact + Low Value = Log it
Low Impact + High Value = Dashboard it
Low Impact + Low Value = Ignore it

The system that knows what metrics matter, before you do.

---

## Canonical Input Schema (Self-Tuning Model)

Every observation - human memory, infrastructure metric, robot action, AR glasses event - uses the same tuple:

```json
{
  "timestamp": "ISO-8601",           // WHEN - the anchor, universal coordinate
  "entity": "string",                // WHO - person, component, unit, wearer
  "activity": "string",              // WHAT - action, metric, event
  "value": "any",                    // MEASUREMENT - the data point
  "why": {                           // WHY - the magic (causal context)
    "cause": "string",               // root cause
    "trigger": "string",             // immediate trigger
    "pattern": "string",             // recognized pattern name
    "predicted": "boolean",          // did we see this coming?
    "preventable": "boolean"         // could we have stopped it?
  },
  "context": {                       // HOOKS - for retrieval
    "temporal": {},                  // time-of-day, day-of-week, season
    "environmental": {},             // load, weather, location
    "relational": {}                 // what else was happening
  }
}
```

### Why This Schema

| Field | Purpose |
|-------|---------|
| `timestamp` | Join key across all tables. Time is truth. |
| `entity` | Who/what is this about? Enables per-entity patterns. |
| `activity` | What happened? The event type. |
| `value` | The measurement. Numbers, strings, objects. |
| `why` | **Causal reasoning.** Logs record WHAT. MemoRable records WHY. |
| `context` | Retrieval hooks. The smell, time, moment, color that trigger recall. |

### Cross-Domain Unity

| Domain | timestamp | entity | activity | why |
|--------|-----------|--------|----------|-----|
| Human Memory | when remembered | person | what happened | emotional/causal context |
| Infrastructure | when measured | component | metric name | system causality |
| Robot | when acted | unit ID | action taken | decision reasoning |
| AR Glasses | when observed | wearer | what seen | attention trigger |
| Community | when occurred | group | collective event | social causality |

Same model. Same weights. Same salience engine. Self-tuning everywhere.

**Docs get lost. MemoRable doesn't.**
