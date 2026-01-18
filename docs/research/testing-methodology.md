# Testing Methodology: Validating Research-Backed Claims

## Overview

This document defines the methodology for testing and proving MemoRable's research-backed architecture claims. We have metrics infrastructure in place (`src/services/salience_service/metrics.ts`); this document describes what to measure and how to validate.

---

## Claims to Validate

### Claim 1: 3×7 Temporal Model
**Source:** Lally et al. (2009), internal 3×7 mathematical model
**Claim:** Patterns emerge at 21 days, stabilize at 63 days

### Claim 2: FFT Pattern Detection Accuracy
**Source:** `pattern_detector.ts` implementation
**Claim:** Cooley-Tukey FFT accurately detects daily/weekly/monthly periodicity

### Claim 3: Context Gating Effectiveness
**Source:** Engram paper (arXiv:2601.07372)
**Claim:** RMSNorm gating suppresses irrelevant memories, improving precision

### Claim 4: Zipfian Cache Efficiency
**Source:** `tier_manager.ts` implementation
**Claim:** ~20% of memories serve ~80% of requests (power law)

### Claim 5: Anticipatory Surfacing Value
**Source:** Competitive differentiation
**Claim:** Proactive memory surfacing reduces user query latency and improves relevance

---

## Existing Metrics Infrastructure

### Counters (totals)
| Metric | Description |
|--------|-------------|
| `salience_memories_processed_total` | Total memories processed |
| `salience_open_loops_created_total` | Open loops created |
| `salience_open_loops_closed_total` | Open loops closed |
| `salience_retrievals_total` | Memory retrievals by type |
| `salience_briefings_generated_total` | Briefings generated |
| `salience_feature_extractions_total` | Feature extractions |
| `salience_errors_total` | Errors by operation |

### Gauges (current state)
| Metric | Description |
|--------|-------------|
| `salience_open_loops_active` | Active open loops |
| `salience_open_loops_overdue` | Overdue loops |
| `salience_relationships_active` | Active relationships |
| `salience_weights_confidence` | Learned weights confidence |

### Histograms (distributions)
| Metric | Description |
|--------|-------------|
| `salience_processing_duration_ms` | Processing time |
| `salience_retrieval_duration_ms` | Retrieval time |
| `salience_briefing_duration_ms` | Briefing generation time |
| `salience_score_distribution` | Salience score distribution |
| `salience_llm_call_duration_ms` | LLM call latency |

---

## New Metrics Required

### For 3×7 Temporal Model Validation

```typescript
// Pattern formation tracking
salience_pattern_detected_total{pattern_type, confidence_bucket}
salience_pattern_stability_days{user_id, pattern_type}
salience_pattern_accuracy{pattern_type, window_days}

// Temporal validation
salience_pattern_formation_day{user_id}  // Day when pattern first detected
salience_pattern_stable_day{user_id}     // Day when pattern stabilized
```

### For FFT Accuracy Validation

```typescript
// FFT performance
salience_fft_detection_accuracy{period_type}     // daily/weekly/monthly
salience_fft_false_positive_rate{period_type}
salience_fft_false_negative_rate{period_type}
salience_fft_computation_time_ms
```

### For Context Gating Validation

```typescript
// Gating effectiveness
salience_gate_pass_rate                          // % memories passing gate
salience_gate_precision                          // True positives / all positives
salience_gate_recall                             // True positives / all relevant
salience_gate_f1_score                           // Harmonic mean
```

### For Zipfian Cache Validation

```typescript
// Cache distribution
salience_tier_distribution{tier}                 // hot/warm/cold counts
salience_tier_hit_rate{tier}                     // Hit rate per tier
salience_access_frequency_percentile{percentile} // P50, P90, P99 access counts
salience_zipf_alpha                              // Measured power law exponent
```

### For Anticipation Validation

```typescript
// Anticipation accuracy
salience_anticipation_accuracy                   // % predictions that were useful
salience_anticipation_latency_saved_ms           // Time saved vs on-demand
salience_anticipation_precision                  // Surfaced memories that were used
salience_anticipation_recall                     // Needed memories that were surfaced
```

---

## Testing Methodology

### Phase 1: Baseline Collection (Days 1-21)

**Objective:** Establish baseline patterns without intervention

**Protocol:**
1. Deploy to test environment with synthetic users
2. Generate realistic access patterns:
   - Daily check-ins (morning, evening)
   - Weekly reviews (Monday, Friday)
   - Monthly summaries (1st of month)
3. Collect all metrics without pattern detection active
4. Store raw access logs for ground truth

**Success Criteria:**
- [ ] 21+ days of continuous data
- [ ] 3+ simulated users with distinct patterns
- [ ] 1000+ memory access events per user
- [ ] No data gaps > 4 hours

### Phase 2: Pattern Detection Validation (Days 22-42)

**Objective:** Validate FFT pattern detection accuracy

**Protocol:**
1. Enable pattern detection
2. Compare detected patterns to known synthetic patterns
3. Calculate accuracy metrics:
   - True Positive: Detected pattern exists in ground truth
   - False Positive: Detected pattern doesn't exist
   - False Negative: Pattern exists but not detected

**Metrics to Capture:**
```
Daily Pattern Detection:
- Accuracy: TP / (TP + FP + FN)
- Precision: TP / (TP + FP)
- Recall: TP / (TP + FN)

Weekly Pattern Detection:
- Same metrics, 168-hour period

Monthly Pattern Detection:
- Same metrics, 720-hour period
```

**Success Criteria:**
- [ ] Daily pattern accuracy > 85%
- [ ] Weekly pattern accuracy > 80%
- [ ] FFT computation < 100ms per user
- [ ] No memory leaks over 21-day window

### Phase 3: Stability Validation (Days 43-63)

**Objective:** Validate 63-day stabilization claim

**Protocol:**
1. Continue pattern collection
2. Track confidence scores over time
3. Measure pattern stability (variance in detected patterns)
4. Compare 21-day vs 42-day vs 63-day confidence

**Metrics to Capture:**
```
Confidence Progression:
- Day 21 average confidence
- Day 42 average confidence
- Day 63 average confidence

Stability Measurement:
- Pattern variance at each checkpoint
- False positive rate at each checkpoint
```

**Success Criteria:**
- [ ] Confidence increases from day 21 → 63
- [ ] Pattern variance decreases from day 21 → 63
- [ ] False positive rate < 10% at day 63
- [ ] 63-day patterns more stable than 21-day (measurably)

### Phase 4: Context Gating Validation (Days 64-77)

**Objective:** Validate Engram-style gating effectiveness

**Protocol:**
1. Retrieve memories without gating (baseline)
2. Retrieve same memories with gating
3. Have humans label relevance (ground truth)
4. Compare precision/recall

**Test Scenarios:**
```
Scenario A: Location Match
- Current: "Office"
- Memory contexts: Office, Home, Gym, Cafe
- Expected: Office memories rank higher

Scenario B: People Match
- Current: ["Alice", "Bob"]
- Memory contexts: Various people combinations
- Expected: Alice/Bob memories rank higher

Scenario C: Activity Match
- Current: "coding"
- Memory contexts: coding, meeting, reading, exercise
- Expected: coding memories rank higher
```

**Success Criteria:**
- [ ] Gated precision > ungated precision
- [ ] Gated recall within 10% of ungated
- [ ] F1 score improvement > 15%
- [ ] Gate computation < 10ms per memory

### Phase 5: Zipfian Distribution Validation (Continuous)

**Objective:** Validate power-law access distribution

**Protocol:**
1. Collect access frequency for all memories
2. Fit power-law distribution (Zipf's law)
3. Calculate alpha exponent
4. Validate 80/20 rule approximation

**Analysis:**
```python
# Expected: α ≈ 1.0 for Zipfian
# 80/20 rule: top 20% of memories serve 80% of requests

from scipy.stats import zipf
alpha = fit_zipf(access_frequencies)
top_20_pct = sum(sorted(freq)[-20%:]) / sum(freq)
```

**Success Criteria:**
- [ ] Alpha exponent between 0.8 and 1.5
- [ ] Top 20% memories serve > 70% of requests
- [ ] Hot tier hit rate > 80%
- [ ] Cold tier access rate < 5%

### Phase 6: Anticipation Value Validation (Days 78-84)

**Objective:** Validate proactive surfacing provides value

**Protocol:**
1. A/B test: 50% users get anticipation, 50% don't
2. Measure time-to-relevant-memory
3. Measure user satisfaction (if available)
4. Compare query patterns

**Metrics:**
```
Group A (Anticipation ON):
- Average time to find relevant memory
- % queries satisfied by anticipated memories
- Number of explicit queries needed

Group B (Anticipation OFF):
- Same metrics for comparison
```

**Success Criteria:**
- [ ] Time-to-memory reduced by > 30%
- [ ] Anticipated memories used > 40% of time
- [ ] No increase in irrelevant surfacing
- [ ] User satisfaction maintained or improved

---

## Test Data Generation

### Synthetic User Profiles

```typescript
interface SyntheticUser {
  id: string;
  patterns: {
    daily: { hours: number[], strength: number };
    weekly: { days: number[], strength: number };
    monthly: { weeks: number[], strength: number };
  };
  noiseLevel: number; // 0-1, adds randomness
  contextPreferences: {
    locations: string[];
    activities: string[];
    people: string[];
  };
}

// Example users
const testUsers: SyntheticUser[] = [
  {
    id: 'morning-person',
    patterns: {
      daily: { hours: [7, 8, 9], strength: 0.9 },
      weekly: { days: [1, 2, 3, 4, 5], strength: 0.8 },
      monthly: { weeks: [1, 3], strength: 0.5 },
    },
    noiseLevel: 0.1,
    contextPreferences: { ... }
  },
  {
    id: 'evening-person',
    patterns: {
      daily: { hours: [18, 19, 20, 21], strength: 0.85 },
      weekly: { days: [0, 6], strength: 0.7 }, // weekends
      monthly: { weeks: [4], strength: 0.6 }, // end of month
    },
    noiseLevel: 0.2,
    contextPreferences: { ... }
  },
  // ... more users with different patterns
];
```

### Memory Content Templates

```typescript
const memoryTemplates = [
  { type: 'meeting', context: { activity: 'meeting', people: [...] } },
  { type: 'task', context: { activity: 'coding', project: '...' } },
  { type: 'personal', context: { location: 'home', activity: '...' } },
  { type: 'learning', context: { activity: 'reading', topic: '...' } },
];
```

---

## Reporting

### Weekly Report Template

```markdown
## Week N Testing Report (Days X-Y)

### Summary
- Total events collected: N
- Active test users: N
- System uptime: N%

### Pattern Detection
| Pattern Type | Accuracy | Precision | Recall |
|--------------|----------|-----------|--------|
| Daily        | N%       | N%        | N%     |
| Weekly       | N%       | N%        | N%     |
| Monthly      | N%       | N%        | N%     |

### Confidence Progression
- Average confidence: N%
- Trend: increasing/stable/decreasing

### Issues Identified
- [List any anomalies or concerns]

### Next Week Focus
- [Testing priorities]
```

### Final Validation Report

After 84 days (3×7×4), produce comprehensive report:

1. **Executive Summary** - Did claims hold up?
2. **Methodology Review** - What worked, what didn't
3. **Detailed Metrics** - All measurements with confidence intervals
4. **Comparative Analysis** - 21 vs 42 vs 63 vs 84 day windows
5. **Recommendations** - Tuning suggestions based on data
6. **Appendix** - Raw data, statistical analysis

---

## Implementation Priority

### Must Have (Phase 1-2)
1. Synthetic user generator
2. Pattern ground truth storage
3. Accuracy calculation functions
4. Basic reporting dashboard

### Should Have (Phase 3-4)
1. Automated confidence tracking
2. Gating A/B test infrastructure
3. Human labeling interface
4. Statistical significance tests

### Nice to Have (Phase 5-6)
1. Zipfian curve fitting
2. Anticipation A/B framework
3. Real-time monitoring dashboard
4. Automated anomaly detection

---

## Timeline

```
Week 1-3:   Build synthetic data generators
Week 4:     Deploy to test environment
Week 5-7:   Phase 1 - Baseline (21 days)
Week 8-10:  Phase 2 - Pattern Detection (21 days)
Week 11-13: Phase 3 - Stability (21 days)
Week 14-15: Phase 4 - Context Gating (14 days)
Week 16:    Phase 5-6 - Cache & Anticipation
Week 17:    Final analysis and report
```

**Total: ~17 weeks (4 months) for full validation**

---

## Success Definition

The research-backed architecture is VALIDATED if:

1. **3×7 Model:** Confidence at day 63 > confidence at day 21 by > 20%
2. **FFT Detection:** Accuracy > 80% for daily/weekly patterns
3. **Context Gating:** F1 improvement > 15% vs ungated
4. **Zipfian Cache:** Alpha between 0.8-1.5, top 20% serves > 70%
5. **Anticipation:** Time-to-memory reduced > 30%

If ANY claim fails validation, document findings and propose adjustments.

---

## Notes

- All testing uses synthetic data first, then opt-in real users
- Privacy: No PII in test data or reports
- Statistical significance: p < 0.05 required for claims
- Reproducibility: All random seeds documented
