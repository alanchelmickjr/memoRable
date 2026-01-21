# MemoRable Project Flow

**Mission:** Giving memory to physical AI that serves anything. Predicting pain and heading it off at the pass.

**Date:** 2026-01-21

---

## The North Star

```
Betty (85, Alzheimer's) → Glasses recognize her daughter → She's not afraid
Adriana (14, bullied)   → System detects spiral     → Mom gets called BEFORE

Same engine. Same math. Different target.
Predict stock = money. Predict pain = lives.
```

---

## Current State (Post-MongoDB Fix)

### Infrastructure: WORKING
| Component | Status | Notes |
|-----------|--------|-------|
| MongoDB on ECS | ✅ Running | EFS persistence, data survives restarts |
| Redis (ElastiCache) | ✅ Running | Context frames, caching |
| ECS Fargate | ✅ Running | App container healthy |
| ALB | ✅ Running | HTTP (HTTPS needs cert) |
| Service Discovery | ✅ Running | mongodb.memorable.local |
| Backup System | ✅ Updated | Now persists to MongoDB |

### Core Services: PARTIAL
| Service | Status | Notes |
|---------|--------|-------|
| Memory Storage | ✅ Working | store_memory, recall |
| Salience Scoring | ✅ Working | 5-factor scoring |
| Open Loop Tracking | ✅ Working | Commitment detection |
| Relationship Tracker | ✅ Working | Computed from memories |
| Briefing Generator | ✅ Working | Pre-meeting briefings |
| Context Frames | ✅ Working | set_context, whats_relevant |
| Predictive Anticipation | ⚠️ Code exists | Needs 21 days of data |
| Pattern Detector | ⚠️ Code exists | FFT-based, untested at scale |
| Care Circle | ⚠️ Code exists | Pressure tracking, alerts |
| Distress Detection | ⚠️ Partial | Prosody analysis basic |
| Emotion Analysis | ⚠️ Partial | Needs Hume.ai integration |

### MCP Tools: 35 TOOLS
| Category | Count | Status |
|----------|-------|--------|
| Context Management | 4 | ✅ Working |
| Memory Operations | 8 | ✅ Working |
| Commitment Tracking | 3 | ✅ Working |
| Predictive Memory | 4 | ⚠️ Needs data |
| Energy-Aware Tasks | 4 | ✅ Working |
| Emotion & Prosody | 7 | ⚠️ Partial |
| Relationship Intelligence | 5 | ⚠️ Partial |
| Behavioral Identity | 3 | ✅ Working |

### SDKs: NOT STARTED
| SDK | Status |
|-----|--------|
| TypeScript/Node.js | ❌ Placeholder |
| Python | ❌ Placeholder |

---

## Project Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: FOUNDATION (NOW)              PHASE 2: INTELLIGENCE               │
│  ─────────────────────────              ──────────────────────              │
│  ✅ MongoDB persistence                  ○ Distress detection pipeline      │
│  ✅ Backup/restore system                ○ Care circle alerting             │
│  ✅ Core memory operations               ○ Emotion integration (Hume)       │
│  ○ HTTPS/TLS                            ○ Pattern learning (21-day)        │
│  ○ Production passphrase                ○ Predictive surfacing             │
│                                                                              │
│  PHASE 3: SENSORS                       PHASE 4: SCALE                      │
│  ────────────────                       ─────────────                       │
│  ○ AR glasses integration               ○ Multi-tenant                      │
│  ○ Robot/companion SDK                  ○ Gun.js mesh (edge)               │
│  ○ Smart home sensors                   ○ v1.0 release                      │
│  ○ Wearables (watch, ring)              ○ SDK packages (npm/pip)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Current Sprint)

### Completed Today (2026-01-21)
- [x] Fixed MongoDB connection (ECS + EFS)
- [x] Updated backup system to persist to MongoDB
- [x] Added security (user isolation, checksums, audit logs)
- [x] Deployed and verified working

### Remaining Tasks

#### 1.1 Security Hardening
| Task | Priority | Effort |
|------|----------|--------|
| Set production MEMORABLE_PASSPHRASE | HIGH | 1 hr |
| Add ACM certificate for HTTPS | HIGH | 2 hr |
| Update ALB to require HTTPS | HIGH | 1 hr |
| Rotate MongoDB credentials | MEDIUM | 1 hr |

#### 1.2 Stability
| Task | Priority | Effort |
|------|----------|--------|
| Add CloudWatch alarms | MEDIUM | 2 hr |
| Set up log aggregation | MEDIUM | 2 hr |
| Create backup schedule (daily frames) | MEDIUM | 2 hr |
| Test restore from backup | HIGH | 1 hr |

#### 1.3 Documentation
| Task | Priority | Effort |
|------|----------|--------|
| Update README deploy button (S3 template) | MEDIUM | 1 hr |
| Document backup/restore API | LOW | 2 hr |
| Update DEPLOYMENT_DIAGNOSTIC | LOW | 1 hr |

---

## Phase 2: Intelligence (The Mission)

This is where Adriana gets saved. This is why we're building.

### 2.1 Distress Detection Pipeline

```
Input Sources          Analysis              Action
─────────────          ────────              ──────
Text patterns    ───┐
                    ├──▶ Distress      ───▶ Care Circle Alert
Prosody (voice)  ───┤    Scoring            - Mom notified
                    │    Engine             - Counselor pinged
Behavior change  ───┤                       - Inner circle activated
                    │
Location/isolation──┘
```

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Enhance prosody analysis | HIGH | 3 days | Beyond basic sentiment |
| Add isolation detection | HIGH | 2 days | Location + communication patterns |
| Build distress scoring model | HIGH | 1 week | Multi-signal fusion |
| Care circle alert system | CRITICAL | 3 days | The actual alert mechanism |
| False positive tuning | HIGH | Ongoing | Can't cry wolf |

### 2.2 Care Circle System

| Task | Priority | Effort |
|------|----------|--------|
| Define care circle schema | HIGH | 1 day |
| set_care_circle API complete | HIGH | 1 day |
| Alert routing (SMS, push, call) | HIGH | 3 days |
| Escalation tiers (monitor → concern → urgent) | HIGH | 2 days |
| Dashboard for caregivers | MEDIUM | 1 week |

### 2.3 Emotion Integration

| Task | Priority | Effort |
|------|----------|--------|
| Hume.ai API integration | MEDIUM | 2 days |
| Voice prosody stream processing | MEDIUM | 3 days |
| Video emotion detection | LOW | 1 week |
| Multi-modal fusion | MEDIUM | 3 days |

### 2.4 Pattern Learning

| Task | Priority | Effort |
|------|----------|--------|
| FFT pattern detector testing | MEDIUM | 2 days |
| 21-day learning validation | MEDIUM | 21 days (passive) |
| Context gate tuning | MEDIUM | 3 days |
| Prediction accuracy metrics | MEDIUM | 2 days |

---

## Phase 3: Sensors (Physical AI)

Memory for robots, glasses, companions.

### 3.1 Device SDKs

| Device Type | SDK | Priority | Effort |
|-------------|-----|----------|--------|
| AR Glasses | TypeScript | HIGH | 2 weeks |
| Robot/Companion | Python | HIGH | 2 weeks |
| Smart Home | TypeScript | MEDIUM | 1 week |
| Wearables | TypeScript | MEDIUM | 1 week |

### 3.2 Sensor Protocol

| Task | Priority | Effort |
|------|----------|--------|
| Define sensor message schema | HIGH | 2 days |
| Device registration flow | HIGH | 3 days |
| Context fusion from multiple devices | HIGH | 1 week |
| Offline-first sync protocol | MEDIUM | 1 week |

### 3.3 Betty Use Case (AR Glasses)

| Task | Priority | Effort |
|------|----------|--------|
| Face recognition → memory lookup | HIGH | 1 week |
| Relationship display overlay | HIGH | 3 days |
| Voice prompt for context | MEDIUM | 3 days |
| Companion robot handoff | MEDIUM | 3 days |

---

## Phase 4: Scale

### 4.1 Multi-Tenant

| Task | Priority | Effort |
|------|----------|--------|
| Entity isolation (not just user) | HIGH | 1 week |
| Per-entity encryption keys | HIGH | 3 days |
| Usage metering | MEDIUM | 3 days |
| Admin dashboard | MEDIUM | 2 weeks |

### 4.2 Edge Distribution

| Task | Priority | Effort |
|------|----------|--------|
| Gun.js integration research | LOW | 1 week |
| Mesh sync protocol | LOW | 2 weeks |
| Offline-first architecture | LOW | 2 weeks |

### 4.3 v1.0 Release

| Task | Priority | Effort |
|------|----------|--------|
| SDK packages (npm/pip) | MEDIUM | 1 week |
| API stability freeze | HIGH | - |
| Security audit | HIGH | 2 weeks |
| Documentation complete | MEDIUM | 1 week |
| Launch | - | - |

---

## Immediate Task List (Next 2 Weeks)

```
Week 1: Secure + Stabilize
─────────────────────────
□ Day 1-2: HTTPS setup (ACM cert, ALB config)
□ Day 2:   Production passphrase
□ Day 3:   CloudWatch alarms
□ Day 4:   Daily backup schedule
□ Day 5:   Test restore, document

Week 2: Distress Detection MVP
──────────────────────────────
□ Day 1-2: Enhance prosody analysis
□ Day 3:   Isolation detection (comms patterns)
□ Day 4-5: Care circle alert system
□ Day 5:   End-to-end test: detect distress → alert mom
```

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Memory persistence | 100% | ✅ 100% |
| Backup integrity | 100% | ✅ (checksums) |
| Distress detection accuracy | >90% | ⚠️ Not measured |
| False positive rate | <5% | ⚠️ Not measured |
| Care circle alert latency | <5 min | ⚠️ Not built |
| Pattern prediction accuracy | >70% | ⚠️ Needs 21 days |

---

## The Why (Never Forget)

```
"If this was about money we would predict stock.
 This is about predicting pain and heading it off at the pass."

                                        — Alan, 2026-01-21

Adriana Kuch. 14. Dead because no system saw her spiral.
Betty. 85. Safe because her glasses know her daughter.

Same math. Different aim. Act right.
```

---

*Document generated: 2026-01-21*
*Next review: Weekly*
