# Temporal Control - The Superpower

**The power to CHOOSE what to forget.**

This is Pillar #1 of MemoRable's Core Philosophy. Not storage. Not retrieval. Forgetting.

## Why Forgetting is the Superpower

Every memory system focuses on remembering. That's the easy part. The hard part - the part that makes memory *useful* - is knowing what to let go.

Human memory doesn't work by storing everything forever. It works by:
- **Consolidation**: Important memories strengthen over time
- **Decay**: Irrelevant memories fade naturally
- **Suppression**: Traumatic or unhelpful memories can be deliberately forgotten

MemoRable must do the same. A system that remembers everything is just a database. A system that knows what to forget is *intelligent*.

## The Problem with Total Recall

- Context windows fill up with noise
- Old irrelevant data crowds out current relevance
- Users lose control over their own memory
- AI becomes a hoarder, not a helper

## How Memories Should Fade

### Salience-Based Decay

Memories have salience scores. Low-salience memories should naturally decay:

```
Initial salience → Time decay → Reinforcement check → Fade or consolidate
```

- **High salience + recent access** → Stays hot
- **High salience + no access** → Moves to warm, then cold
- **Low salience + no access** → Fades to archive, then deletion
- **Explicitly marked "forget"** → Immediate suppression

### The Three Forget Modes

From the MCP `forget` tool:

1. **suppress** - Hide but keep (reversible, for "I don't want to think about this")
2. **archive** - Hide from default queries (cold storage, still searchable if needed)
3. **delete** - Remove after 30-day grace period (true forgetting)

### Attention vs Storage

The Redis attention system (`:attention`, `:context`, `:predictions`) is where temporal control lives:

- Storage is permanent (MongoDB)
- Attention is temporary (Redis TTL)
- What's in attention RIGHT NOW is what matters
- Everything else exists but doesn't consume context

## User Control is Non-Negotiable

Users MUST be able to:

1. **Forget a memory** - Remove specific memories from the system
2. **Forget a person** - Remove all memories involving someone
3. **Set decay rates** - Control how fast things fade
4. **Override decay** - Mark memories as "never forget" or "forget faster"

This is privacy AND functionality. A user who can't control their memory has no autonomy.

## Implementation Principles

1. **Default to fade** - Memories decay unless explicitly preserved
2. **Salience drives retention** - High-salience memories resist decay
3. **Access reinforces** - Recalled memories get salience boost
4. **User intent trumps algorithm** - Explicit forget/keep overrides automatic decay
5. **Graceful degradation** - Fading memories lose detail before disappearing entirely

## The Alzheimer's Connection

Alan is building this for future self. Alzheimer's doesn't erase memories randomly - it disrupts the consolidation/decay balance. Understanding temporal control in software helps model what goes wrong in disease, and potentially how to compensate.

The system must handle:
- Memories that SHOULD fade but don't (rumination, trauma)
- Memories that SHOULDN'T fade but do (names, faces, loved ones)
- The difference between "gone" and "inaccessible"

## Summary

Total recall is a bug, not a feature. The power to forget - selectively, intentionally, gracefully - is what makes memory useful.

MemoRable's superpower isn't remembering. It's knowing when to let go.
