# Context Sizing: The Art of Knowing What You Need

> "The ability to remember is golden but the ability to forget is priceless."
> — Alan, 2026

> "memoRable, only know what you need to."

---

## The Problem

AI context windows are precious real estate. Every token of context costs:
- **Attention** — model focuses on what's there
- **Latency** — more tokens = slower response
- **Money** — input tokens aren't free
- **Focus** — bloated context = diffuse responses

MemoRable must **augment without taxing**.

---

## The 8% Rule

Target: Keep memorable's context injection under **8% of model's limit**.

| Model | Context Limit | MemoRable Max | Notes |
|-------|---------------|---------------|-------|
| Claude Opus | 200k | 16k | Heavy reasoning, can handle more |
| Claude Sonnet | 200k | 12k | Balanced |
| Claude Haiku | 200k | 4k | Fast, focused, less context |
| GPT-4 Turbo | 128k | 10k | |
| GPT-4o | 128k | 10k | |
| Llama 3 70B | 8k | 600 | Local models need tight limits |
| Mistral 7B | 32k | 2.5k | |

**Why 8%?** Leaves 92% for:
- System prompts (~5-10%)
- User conversation history (~30-50%)
- Tool results (~10-20%)
- Response generation (~20-30%)

---

## What Gets Sized

### Session Start Hook
Current problem: Loads everything. Should load:
- Critical facts (5-10 items, ~500 tokens)
- Active loops (top 5, ~300 tokens)
- Recent context (last 3, ~200 tokens)
- **Total: ~1k tokens**

### Per-Prompt Context (Attention)
Before each prompt, surface:
- Relevant memories for THIS query (~500 tokens)
- Active loops involving mentioned people (~200 tokens)
- **Total: <1k tokens per prompt**

### Recall Results
When user asks to recall:
- Return top 10, not top 50
- Summarize if needed
- **Total: <2k tokens**

---

## Sizing Strategies

### 1. Token Budgets
```typescript
interface ContextBudget {
  model: string;
  totalLimit: number;
  memorableBudget: number;  // 8% of totalLimit

  allocations: {
    criticalFacts: number;   // 30% of budget
    activeLoops: number;     // 20% of budget
    relevantMemories: number; // 40% of budget
    recentContext: number;   // 10% of budget
  };
}
```

### 2. Salience-Based Truncation
High salience memories get priority. If over budget:
1. Drop lowest salience items first
2. Summarize mid-salience items
3. Keep high salience verbatim

### 3. Query-Aware Filtering
Don't load everything — load what's relevant to THIS prompt:
- Mentioned entities → their memories
- Current task type → relevant patterns
- Time of day → temporal patterns

### 4. Progressive Disclosure
Start minimal, expand on request:
- First: "3 open loops with Mike"
- On ask: Full details of those loops
- Never: Dump everything upfront

---

## Implementation Phases

### Phase 1: Measure Current State
- [ ] Add token counting to all context injections
- [ ] Log context size per prompt
- [ ] Identify worst offenders (list_loops was 16k!)

### Phase 2: Add Limits
- [ ] `MEMORABLE_MAX_CONTEXT` env var
- [ ] Per-endpoint token budgets
- [ ] Truncation with salience priority

### Phase 3: Smart Sizing
- [ ] Model detection → automatic budget
- [ ] Query analysis → relevant subset
- [ ] Feedback loop → learn what gets used

---

## The Two-Claude Model

```
┌─────────────────────┐          ┌─────────────────────┐
│  Claude-Interactive │          │   Claude-Daemon     │
│                     │          │                     │
│  Context: TIGHT     │   sync   │  Context: GENEROUS  │
│  8% memorable max   │◄────────►│  Can process more   │
│                     │          │                     │
│  User-facing speed  │          │  Background work    │
│  Focus on task      │          │  Pattern learning   │
│  Quick responses    │          │  Loop extraction    │
└─────────────────────┘          └─────────────────────┘
```

**Interactive Claude** stays lean — gets pre-digested context.
**Daemon Claude** does the heavy lifting — processes full history, extracts patterns, prepares context for interactive sessions.

They coordinate through MemoRable:
- Daemon stores prepared summaries
- Interactive recalls just what it needs
- Neither bloats the other

---

## Metrics to Track

1. **Context Injection Size** — tokens per prompt from memorable
2. **Context Utilization** — % of injected context referenced in response
3. **Truncation Rate** — how often we hit budget limits
4. **Salience Accuracy** — do high-salience items get used more?

---

## Remember

The goal isn't to remember everything.
The goal is to remember **what matters, when it matters**.

Less is more. Focused is better. Relevance beats completeness.

*memoRable, only know what you need to.*
