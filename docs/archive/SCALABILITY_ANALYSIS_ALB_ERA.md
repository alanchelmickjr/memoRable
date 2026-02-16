# MemoRable Scalability & Viability Analysis

> **NOTE (Feb 2026):** DocumentDB references below are stale. Current stack uses MongoDB Atlas + EC2 Elastic IP (~$11/mo hobbyist tier). Cost analysis below reflects the old enterprise stack.

**Date:** 2026-01-13
**Purpose:** Comprehensive analysis for AWS enterprise scale deployment
**Verdict:** Scalable with targeted optimizations

---

## Executive Summary

MemoRable is architecturally sound for scale. The core design (stateless services, document storage, vector search, Redis caching) follows cloud-native patterns. However, several components need optimization before handling enterprise loads (100K+ users, millions of memories).

| Component | Current State | Scale Ready? | Work Needed |
|-----------|--------------|--------------|-------------|
| MongoDB/DocumentDB | Good | Yes | Index optimization |
| Redis Context | Good | Yes | Cluster mode |
| Weaviate Vectors | Good | Mostly | Sharding strategy |
| MCP Server | Bottleneck | No | Stateless redesign |
| LLM Integration | Expensive | Mostly | Caching, batching |
| Security Tiers | New | Mostly | Key management at scale |

---

## Architecture Scalability Assessment

### 1. Data Layer (MongoDB/DocumentDB)

**Current Design:** Single MongoDB instance, multiple collections

```
Collections:
├── memories          (~80% of storage)
├── open_loops        (~5%)
├── relationships     (~5%)
├── timeline_events   (~5%)
├── behavioral_fingerprints (~2%)
├── patterns          (~2%)
└── context_frames    (Redis, not Mongo)
```

**Scale Analysis:**

| Metric | 1K Users | 100K Users | 1M Users |
|--------|----------|------------|----------|
| Memories | 100K docs | 10M docs | 100M docs |
| Storage | 1 GB | 100 GB | 1 TB |
| Queries/sec | 100 | 10K | 100K |

**Bottlenecks:**
1. **Text search on encrypted content** - Tier2/3 content is encrypted, can't use MongoDB text indexes
2. **Compound queries** - Salience + time + person filters require composite indexes
3. **Aggregation pipelines** - Briefing generation scans many documents

**Optimizations Required:**

```javascript
// Required indexes for scale
db.memories.createIndex({ userId: 1, createdAt: -1, salienceScore: -1 })
db.memories.createIndex({ userId: 1, "extractedFeatures.peopleMentioned": 1 })
db.memories.createIndex({ userId: 1, securityTier: 1 })
db.memories.createIndex({ encrypted: 1, securityTier: 1 })

db.open_loops.createIndex({ userId: 1, status: 1, dueDate: 1 })
db.relationships.createIndex({ userId: 1, personName: 1 })
```

**DocumentDB Considerations:**
- Use `db.r5.large` minimum for production (4 vCPU, 16 GB)
- Enable auto-scaling for read replicas
- Consider sharding by `userId` hash at 100M+ docs

**Verdict:** Scale-ready with index optimization

---

### 2. Vector Storage (Weaviate)

**Current Design:** Single Weaviate instance, Memory class

**Scale Analysis:**

| Metric | 1K Users | 100K Users | 1M Users |
|--------|----------|------------|----------|
| Vectors | 100K | 10M | 100M |
| Storage | 500 MB | 50 GB | 500 GB |
| Query latency | <50ms | <100ms | <200ms |

**Bottlenecks:**
1. **Single-node limits** - Weaviate handles ~50M vectors per node efficiently
2. **Cross-user queries** - No efficient way to query across all users
3. **Tier3 exclusion** - Need to ensure Tier3_Vault NEVER enters Weaviate

**Optimizations Required:**

```yaml
# Weaviate production config
weaviate:
  environment:
    - PERSISTENCE_DATA_PATH=/var/lib/weaviate
    - QUERY_DEFAULTS_LIMIT=25
    - AUTHENTICATION_APIKEY_ENABLED=true
    - CLUSTER_HOSTNAME=weaviate-node-1
    # For multi-node:
    - CLUSTER_JOIN=weaviate-node-1,weaviate-node-2,weaviate-node-3
```

**Sharding Strategy:**
- Shard by `userId` hash (horizontal scaling)
- Replicas for read throughput (3x for production)
- Separate clusters for high-value enterprise tenants

**Verdict:** Scale-ready with multi-node cluster

---

### 3. Redis Context Layer

**Current Design:** Single Redis for context frames + OAuth tokens

**Scale Analysis:**

| Metric | 1K Users | 100K Users | 1M Users |
|--------|----------|------------|----------|
| Active contexts | 100 | 10K | 100K |
| Memory usage | 10 MB | 1 GB | 10 GB |
| Operations/sec | 1K | 100K | 1M |

**Bottlenecks:**
1. **Single point of failure** - No clustering configured
2. **Multi-device sync** - Each device creates separate keys
3. **TTL management** - Context frames expire, need cleanup

**Optimizations Required:**

```yaml
# Redis Cluster for production
redis:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
  deploy:
    replicas: 6  # 3 masters + 3 replicas
```

**ElastiCache Configuration:**
- Use `cache.r6g.large` minimum (2 vCPU, 13 GB)
- Enable cluster mode with 3 shards
- Configure automatic failover

**Verdict:** Scale-ready with cluster mode

---

### 4. MCP Server (Critical Bottleneck)

**Current Design:** Single Node.js process, stdio transport

**Scale Issues:**
1. **Stateful session** - Each MCP connection is a persistent process
2. **In-memory LLM client** - Created per server instance
3. **No horizontal scaling** - stdio transport is 1:1 with client
4. **Blocking operations** - LLM calls block the event loop

**Current Architecture (Not Scalable):**
```
Claude Code ──stdio──▶ MCP Server (single process)
                            │
                            ├── MongoDB (shared)
                            ├── Redis (shared)
                            └── LLM (per-request)
```

**Scalable Architecture (Recommended):**
```
┌─────────────────────────────────────────────────────────────────┐
│                    SCALABLE MCP ARCHITECTURE                     │
│                                                                  │
│   Claude.ai ──HTTP──▶ ALB ──▶ ECS MCP Fleet (10-100 instances)  │
│                              │                                   │
│   Claude Code ──stdio──▶ Gateway ──HTTP──▶ MCP API Service      │
│                                                                  │
│                              │                                   │
│                    ┌─────────┴─────────┐                        │
│                    │   Shared Layer    │                        │
│                    │  ├── MongoDB      │                        │
│                    │  ├── Redis        │                        │
│                    │  ├── Weaviate     │                        │
│                    │  └── LLM Pool     │                        │
│                    └───────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**Required Changes:**
1. **HTTP Transport** - Already partially implemented for Claude.ai
2. **Stateless Design** - Move all state to Redis/MongoDB
3. **LLM Connection Pool** - Shared Bedrock/Anthropic clients
4. **Request Queue** - SQS for async heavy operations

**Effort Estimate:** Medium (2-3 weeks)

**Verdict:** Needs redesign for scale

---

### 5. LLM Integration (Cost & Latency)

**Current Design:** Direct LLM calls for feature extraction

**Scale Analysis:**

| Metric | 1K Users | 100K Users | 1M Users |
|--------|----------|------------|----------|
| LLM calls/day | 10K | 1M | 10M |
| Cost/day (Claude) | $10 | $1,000 | $10,000 |
| Cost/day (Bedrock) | $5 | $500 | $5,000 |

**Bottlenecks:**
1. **Cost explosion** - Every memory store triggers LLM call
2. **Latency** - 500ms-2s per extraction
3. **Rate limits** - Anthropic limits concurrent requests

**Optimizations Required:**

```typescript
// LLM Call Optimization Strategy

// 1. Batch similar requests
const batchExtractor = new BatchFeatureExtractor({
  maxBatchSize: 10,
  maxWaitMs: 100,
  llmClient: bedrockClient
});

// 2. Cache common extractions
const extractionCache = new Redis({
  keyPrefix: 'extract:',
  ttl: 3600  // 1 hour
});

// 3. Tiered LLM routing (ALREADY IMPLEMENTED)
// Tier1 → External LLM (expensive)
// Tier2 → Local Ollama (cheap)
// Tier3 → Heuristic only (free)

// 4. Smart skip for low-value content
if (text.length < 20 || isBoilerplate(text)) {
  return heuristicExtraction(text);
}
```

**Cost Projection with Optimizations:**

| Optimization | Reduction |
|--------------|-----------|
| Tier routing | -40% (Tier2/3 bypass external) |
| Batching | -20% (fewer API calls) |
| Caching | -30% (repeat patterns) |
| Smart skip | -10% (boilerplate) |
| **Total** | **-70% cost reduction** |

**Verdict:** Scalable with optimizations

---

### 6. Security Tier System (New)

**Current Design:** AES-256-GCM encryption, per-memory keys

**Scale Concerns:**
1. **Key management** - Current design derives from env var
2. **Encryption overhead** - ~5ms per encrypt/decrypt
3. **Search limitations** - Can't search encrypted content

**Optimizations Required:**

```typescript
// Key Management at Scale
interface KeyManagementService {
  // Use AWS KMS for key hierarchy
  masterKey: KMSKeyId;

  // Per-user data encryption keys (DEKs)
  getUserDEK(userId: string): Promise<Buffer>;

  // Rotate keys without re-encrypting all data
  rotateKey(userId: string): Promise<void>;
}

// Encrypted Search Strategy
// Option 1: Searchable encryption (complex)
// Option 2: Encrypted metadata with plaintext tags
// Option 3: Client-side search (recommended for Tier3)
```

**AWS KMS Integration:**
```yaml
# CloudFormation addition
MemorableKMSKey:
  Type: AWS::KMS::Key
  Properties:
    Description: MemoRable memory encryption key
    EnableKeyRotation: true
    KeyPolicy:
      # Allow ECS tasks to use key
```

**Verdict:** Needs AWS KMS integration for enterprise

---

## Performance Benchmarks (Projected)

### Target SLAs

| Operation | Target | Current | At Scale |
|-----------|--------|---------|----------|
| store_memory | <500ms | 800ms | 300ms* |
| recall | <200ms | 150ms | 200ms |
| get_briefing | <1s | 2s | 800ms* |
| set_context | <50ms | 30ms | 50ms |

*With optimizations

### Throughput Targets

| Tier | Users | Memories/sec | Queries/sec |
|------|-------|--------------|-------------|
| Small | 1K | 10 | 100 |
| Medium | 100K | 100 | 10K |
| Large | 1M | 1K | 100K |

---

## Cost Projections (AWS)

### Infrastructure Costs

| Component | Small | Medium | Large |
|-----------|-------|--------|-------|
| ECS (MCP) | $50/mo | $500/mo | $2,000/mo |
| DocumentDB | $50/mo | $200/mo | $1,000/mo |
| ElastiCache | $30/mo | $150/mo | $500/mo |
| Weaviate (EC2) | $50/mo | $300/mo | $1,500/mo |
| ALB | $20/mo | $100/mo | $500/mo |
| **Subtotal** | **$200/mo** | **$1,250/mo** | **$5,500/mo** |

### LLM Costs (with optimizations)

| Tier | Small | Medium | Large |
|------|-------|--------|-------|
| Bedrock Claude | $50/mo | $1,500/mo | $15,000/mo |
| **Optimized** | $15/mo | $450/mo | $4,500/mo |

### Total Cost of Ownership

| Scale | Monthly | Per User |
|-------|---------|----------|
| Small (1K) | $250 | $0.25 |
| Medium (100K) | $1,700 | $0.017 |
| Large (1M) | $10,000 | $0.01 |

---

## Lean Mode: Reduced Functionality Options

If cost/complexity is a concern, here are options to reduce scope:

### Option A: Remove Predictive Memory
- **Savings:** -20% compute, -10% storage
- **Impact:** No 21-day learning, no pattern predictions
- **Recommendation:** Keep - it's a differentiator

### Option B: Remove Behavioral Identity
- **Savings:** -10% compute, -5% storage
- **Impact:** No stylometry-based identification
- **Recommendation:** Make optional (feature flag)

### Option C: Simplified Security (Not Recommended)
- **Savings:** -15% compute (no encryption overhead)
- **Impact:** All data same security level
- **Recommendation:** DO NOT DO THIS - security is core value

### Option D: External LLM Only (Remove Ollama)
- **Savings:** -$50/mo infra, simpler deployment
- **Impact:** No local LLM option, all Tier2 goes to heuristic
- **Recommendation:** Acceptable for initial launch

### Option E: Remove Multi-Device Sync
- **Savings:** -5% Redis usage
- **Impact:** No brain-inspired context fusion
- **Recommendation:** Keep - critical for sensor net vision

---

## Recommended Scale Path

### Phase 1: Launch Ready (Current + Fixes)
- Fix MCP server HTTP transport for Claude.ai
- Add MongoDB indexes
- Enable Redis cluster mode
- **Timeline:** 2 weeks
- **Cost:** Small tier ($250/mo)

### Phase 2: Growth (100K users)
- Deploy ECS fleet with auto-scaling
- Add LLM batching and caching
- Integrate AWS KMS for key management
- Weaviate multi-node cluster
- **Timeline:** 4 weeks
- **Cost:** Medium tier ($1,700/mo)

### Phase 3: Enterprise (1M users)
- Multi-region deployment
- Dedicated Weaviate clusters per tenant
- Custom LLM fine-tuning for extraction
- SOC2 compliance audit
- **Timeline:** 8 weeks
- **Cost:** Large tier ($10,000/mo)

---

## Critical Path Items

### Must Fix Before AWS Launch

| Item | Risk | Effort | Priority |
|------|------|--------|----------|
| MongoDB indexes | High | Low | P0 |
| Redis cluster config | Medium | Low | P0 |
| MCP HTTP transport | High | Medium | P1 |
| LLM cost optimization | High | Medium | P1 |
| AWS KMS integration | Medium | Medium | P2 |

### Can Defer

| Item | Risk | Effort | Priority |
|------|------|--------|----------|
| Multi-region | Low | High | P3 |
| Weaviate sharding | Low | Medium | P3 |
| Custom LLM fine-tuning | Low | High | P4 |

---

## Conclusion

**MemoRable is viable at scale.** The architecture follows sound cloud-native patterns. The main work needed:

1. **MCP Server** - Needs stateless redesign for horizontal scaling
2. **LLM Costs** - Tiered routing is implemented; add batching/caching
3. **Key Management** - Integrate AWS KMS for enterprise security

The cost structure is competitive:
- $0.25/user/month at small scale
- $0.01/user/month at large scale

**Recommendation:** Proceed with AWS launch. Address P0/P1 items in Phase 1.

---

## Appendix: Load Testing Plan

```bash
# k6 load test script
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100 users
    { duration: '5m', target: 100 },   // Hold
    { duration: '2m', target: 500 },   // Ramp to 500
    { duration: '5m', target: 500 },   // Hold
    { duration: '2m', target: 0 },     // Ramp down
  ],
};

export default function () {
  // Test store_memory
  let storeRes = http.post('http://localhost:3000/mcp', JSON.stringify({
    method: 'tools/call',
    params: { name: 'store_memory', arguments: { text: 'Test memory' } }
  }));
  check(storeRes, { 'store < 500ms': (r) => r.timings.duration < 500 });

  // Test recall
  let recallRes = http.post('http://localhost:3000/mcp', JSON.stringify({
    method: 'tools/call',
    params: { name: 'recall', arguments: { query: 'test' } }
  }));
  check(recallRes, { 'recall < 200ms': (r) => r.timings.duration < 200 });

  sleep(1);
}
```

---

*Analysis prepared for AWS partnership evaluation*
