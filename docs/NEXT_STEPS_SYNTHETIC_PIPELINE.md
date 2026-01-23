# Next Steps: Synthetic Data & Pipeline Testing

**Date**: 2026-01-23
**Priority**: CRITICAL - Must complete before user onboarding
**Why**: Pattern learning takes 21-63 days. Users can't wait. We pre-warm the system.

---

## The Goal

Load synthetic temporal data that exercises the FFT pattern detector, predictive anticipation service, and context gate - so we can verify the pipeline works BEFORE real users depend on it.

## Architecture of the Pipeline

```
Synthetic Generator → Ingestion API → Salience Scoring → MongoDB + Pattern Detector
                                                              ↓
                                              FFT Analysis (autocorrelation)
                                                              ↓
                                              Pattern Formation (21d) → Stability (63d)
                                                              ↓
                                              Predictive Anticipation → get_predictions tool
```

---

## Phase 1: Synthetic Data Generator

**File**: `tests/synthetic/temporal_data_generator.ts`

### Required Pattern Types

| Pattern | Frequency | Example | Min Events for Detection |
|---------|-----------|---------|-------------------------|
| Daily | Every 24h | Morning routine, medication | 21 (one per day) |
| Weekly | Every 7d | Wednesday meetings | 9 (9 weeks) |
| Tri-weekly | Every 21d | Monthly check-in | 3 (63 days) |
| Monthly | Every 30d | Bill payments | 2 (60 days) |

### Data Shape

Each synthetic memory needs:
```typescript
interface SyntheticMemory {
  userId: string;           // 'synthetic_test_user'
  content: string;          // Realistic text
  timestamp: Date;          // Spread across 84 days (21+63)
  salience: number;         // 0.4-0.9
  entities: string[];       // People/projects involved
  context: {
    location?: string;
    activity?: string;
    people?: string[];
    device?: string;
  };
}
```

### Realistic Variance

Patterns must NOT be perfect (humans aren't):
- **Time jitter**: +/- 2 hours from expected time
- **Skip rate**: 10% of expected events missing
- **Content variance**: Same activity, different words
- **Weekend gaps**: Some patterns pause on weekends

---

## Phase 2: Ingestion & Verification

### Loading Strategy

1. Generate 84 days of synthetic data (covers formation + stability)
2. Backdate timestamps (starting 84 days ago)
3. Load via REST API `/memory` endpoint (same path real data uses)
4. Each memory triggers salience scoring and pattern recording

### Verification Checkpoints

| Day | What to Check | Expected Result |
|-----|---------------|-----------------|
| 7 | `recordMemoryAccess` called for each | Access history populated |
| 14 | FFT has enough data points | `accessHistory.length >= 14` |
| 21 | Pattern formation | `confidence >= 0.4`, `isFormed = true` for daily |
| 42 | Pattern strengthening | `confidence >= 0.6` for daily, `>= 0.4` for weekly |
| 63 | Pattern stability | `confidence >= 0.8`, `stabilityDays = 63` |
| 84 | Full window | All pattern types detected and stable |

### Verification Commands

```bash
# Check pattern stats after loading
curl -s -H "X-API-Key: $API_KEY" "${BASE_URL}/memory?entity=synthetic_test_user&limit=1"

# Via MCP tool
get_pattern_stats  # Should show totalPatterns > 0, formedPatterns > 0
get_anticipated_context  # Should return predicted memories
```

---

## Phase 3: Pipeline Analysis

### Metrics to Capture

1. **Ingestion throughput**: memories/second at sustained load
2. **Salience calculation latency**: P50, P90, P99
3. **FFT computation time**: For 21/42/63/84 day windows
4. **Pattern detection accuracy**: Known patterns vs detected
5. **Prediction hit rate**: Anticipated context vs actual access
6. **Memory usage**: Heap growth over 1000+ memories

### Test Profiles

| Profile | Events | Duration | Purpose |
|---------|--------|----------|---------|
| Smoke | 100 | 21 days | Basic pattern formation |
| Standard | 500 | 63 days | Full stability window |
| Stress | 5000 | 84 days | Multi-pattern, multi-user |
| Versailles | 50000 | 84 days | 10 users, full pipeline friction |

---

## Phase 4: Context Gate Testing

The context gate filters memories based on current context. Synthetic data must include:

1. **Location-specific memories** (only surface when at that location)
2. **People-specific memories** (only surface when with that person)
3. **Activity-specific memories** (only surface during that activity)
4. **Cross-context memories** (should surface across multiple contexts)

### Test Scenarios

```
Scenario: "User is at work on Wednesday at 2pm"
Expected: Surface weekly meeting memories, work project context
NOT expected: Weekend plans, personal health notes

Scenario: "User is with Sarah at coffee shop"
Expected: Surface Sarah-related memories, previous coffee shop visits
NOT expected: Work meetings, medical appointments
```

---

## Phase 5: Relationship Intelligence

### Pressure Cascade Scenarios

1. **Trust damage**: Entity A says something hurtful to Entity B
   - Verify pressure vector recorded
   - Verify decay over time
   - Verify care circle notified at threshold

2. **Repair sequence**: Entity B apologizes, Entity A accepts
   - Verify negative pressure vector
   - Verify net pressure decreases

3. **Cascade detection**: High pressure on A causes A to pressure C
   - Verify butterfly-to-hurricane early warning fires

---

## Implementation Order

1. `tests/synthetic/temporal_data_generator.ts` - The generator
2. `tests/synthetic/load_synthetic_data.ts` - Script to load via API
3. `tests/synthetic/verify_patterns.ts` - Checkpoint verification
4. `tests/pipeline/throughput.test.ts` - Performance benchmarks
5. `tests/pipeline/context_gate.test.ts` - Context filtering
6. `tests/pipeline/pressure_cascade.test.ts` - Relationship intelligence

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/services/salience_service/pattern_detector.ts` | FFT implementation |
| `src/services/salience_service/predictive_anticipation.ts` | Anticipation engine |
| `src/services/salience_service/context_gate.ts` | Context filtering |
| `src/services/salience_service/entity.ts` | Pressure tracking |
| `src/services/salience_service/tier_manager.ts` | Hot/warm/cold cache |
| `tests/fixtures/synthetic_generators.ts` | Existing seed data (extend this) |

---

## Success Criteria

- [ ] 84 days of synthetic data loads without error
- [ ] FFT detects daily pattern by day 21 (confidence >= 0.4)
- [ ] FFT detects weekly pattern by day 42 (confidence >= 0.4)
- [ ] All patterns stable by day 63 (confidence >= 0.8)
- [ ] `get_predictions` returns relevant memories for given context
- [ ] `get_anticipated_context` pre-surfaces correct memories
- [ ] Context gate correctly filters by location/people/activity
- [ ] Pipeline handles 100 memories/second sustained (smoke test)
- [ ] No memory leaks over 5000 memory ingestion run
- [ ] Pressure cascade fires care circle alert at threshold
