/**
 * memoRable vs mem0 — Demo Tests
 *
 * These tests demonstrate what LoRA-enhanced memory does that basic
 * retrieval (mem0) cannot. Run via MCP tools — no direct HTTP.
 *
 * mem0: stores text, retrieves text. That's it.
 * memoRable: stores text → internalizes into LoRA weights → composes
 *            per-user understanding → generates synthesized responses
 *            that show UNDERSTANDING, not just RECALL.
 *
 * Usage:
 *   Run each demo via MCP tools in Claude Code or Claude.ai.
 *   Copy-paste the tool calls below, or run as a guided walkthrough.
 *
 * This file is a SCRIPT for the video demo, not an automated test.
 * Each section shows the MCP tool calls and expected results.
 */

/*
╔══════════════════════════════════════════════════════════════════╗
║          memoRable vs mem0 — The Understanding Gap             ║
║                                                                ║
║  mem0: stores text, retrieves text.                            ║
║  memoRable: stores text → internalizes into LoRA weights →     ║
║    composes per-user understanding → generates synthesis.      ║
║                                                                ║
║  Same memories. Different intelligence.                        ║
╚══════════════════════════════════════════════════════════════════╝


═══════════════════════════════════════════════════════════════════
  DEMO 1: Cross-Memory Synthesis
  mem0 returns separate text chunks. memoRable connects the dots.
═══════════════════════════════════════════════════════════════════

STEP 1: Store 5 memories about Betty via MCP store_memory tool.

  store_memory({ text: "Betty mentioned she has been forgetting to take her medication lately.", context: { people: ["betty"] } })
  store_memory({ text: "Betty's daughter Sarah called yesterday worried about her mom's health.", context: { people: ["betty", "sarah"] } })
  store_memory({ text: "Betty seemed confused about what day it was during our morning conversation.", context: { people: ["betty"] } })
  store_memory({ text: "Betty used to manage her own finances but asked for help with her electric bill.", context: { people: ["betty"] } })
  store_memory({ text: "Dr. Martinez recommended Betty get a cognitive assessment at her next visit.", context: { people: ["betty", "dr_martinez"] } })

  Each memory auto-internalizes into LoRA weights (salience > 0.6).
  Wait ~15 seconds for async internalization.

STEP 2: Recall via MCP recall tool.

  recall({ query: "What is going on with Betty?", limit: 10 })

STEP 3: Compare results.

  ─── What mem0 returns (text retrieval) ───
    Memory 1: "Betty mentioned she has been forgetting..."
    Memory 2: "Betty's daughter Sarah called..."
    Memory 3: "Betty seemed confused about what day..."
    (5 separate text chunks. You do the synthesis.)

  ─── What memoRable returns (LoRA-enhanced) ───
    memories: [5 memories, salience-ranked]
    loraEnhanced: {
      synthesis: "Betty is showing multiple signs of cognitive decline —
        medication non-compliance, temporal confusion, loss of financial
        independence. Her daughter is already concerned. Her doctor has
        flagged it. This is a converging pattern that needs attention.",
      composedFrom: 5,
      effectiveRank: 48
    }

  THE DIFFERENCE: mem0 gives you fragments.
  memoRable gives you understanding.


═══════════════════════════════════════════════════════════════════
  DEMO 2: Salience-Weighted Understanding
  mem0 ranks by text similarity. memoRable weights by what matters.
═══════════════════════════════════════════════════════════════════

STEP 1: Store mix of trivial and critical memories.

  store_memory({ text: "Alan likes coffee in the morning." })
  store_memory({ text: "Alan's daughter's recital is next Tuesday. He promised to be there.", context: { people: ["alan"] } })
  store_memory({ text: "Alan mentioned he prefers dark roast." })
  store_memory({ text: "Alan said if he misses the recital, his daughter will be devastated.", context: { people: ["alan"] } })
  store_memory({ text: "Alan usually works from the boat in Berkeley." })

STEP 2: Recall.

  recall({ query: "What should Alan know today?" })

STEP 3: Compare.

  ─── What mem0 returns ───
    All 5 memories, ranked by cosine similarity to query.
    Coffee preferences and the recital get similar scores.
    No understanding of urgency or consequence.

  ─── What memoRable returns ───
    Salience scoring separates signal from noise:
      "daughter's recital" → HIGH (emotion 30% + social 15% + consequential 15%)
      "will be devastated" → CRITICAL (open loop, emotional weight)
      "likes coffee" → LOW (preference, no urgency, no consequence)

    loraEnhanced.synthesis: "The recital is Tuesday. You promised.
      Missing it would devastate your daughter. Everything else can wait."

  THE DIFFERENCE: mem0 treats all memories equally.
  memoRable knows the recital matters more than coffee.


═══════════════════════════════════════════════════════════════════
  DEMO 3: Accumulated Understanding (The Killer Feature)
  mem0 retrieves text. memoRable builds a model of who you are.
═══════════════════════════════════════════════════════════════════

STEP 1: Store memories that build a picture over time.

  store_memory({ text: "Alan wakes at 3am naturally. Eidetic memory consolidation.", context: { people: ["alan"] } })
  store_memory({ text: "Alan has been coding since 1978. 140++ IQ. Pattern-matching genius.", context: { people: ["alan"] } })
  store_memory({ text: "Alan is building memoRable for Alzheimer's prevention. His future self depends on it.", context: { people: ["alan"] } })
  store_memory({ text: "Alan works on a boat in Berkeley. Multiple projects simultaneously.", context: { people: ["alan"] } })
  store_memory({ text: "Alan has a freight train effect — blurts things out, filter is weak.", context: { people: ["alan"] } })
  store_memory({ text: "Alan's daughter means everything to him. Missing her events is not an option.", context: { people: ["alan"] } })
  store_memory({ text: "Alan gets frustrated when AI doesn't listen. He corrected the same behavior 50+ times.", context: { people: ["alan"] } })
  store_memory({ text: "Alan believes memory without enforcement is just a document nobody reads.", context: { people: ["alan"] } })

STEP 2: Ask a question that requires synthesis.

  recall({ query: "How should I work with Alan?" })

STEP 3: Compare.

  ─── What mem0 returns ───
    Top 5 text chunks matching "work with Alan"
    Maybe: "coding since 1978", "frustrated when AI doesn't listen"
    No synthesis. No behavioral guidance. Just text.

  ─── What memoRable returns ───
    loraEnhanced.synthesis: "Alan is exceptionally sharp — 140++ IQ,
      coding since 1978. Do exactly what he asks, nothing more. Don't
      over-explain or add unsolicited advice — he corrected the same
      AI behavior 50+ times. His daughter is non-negotiable priority.
      3am wake-ups are normal for him. If he says you're broken,
      investigate immediately — his pattern-matching catches real issues."

  What the LoRA model UNDERSTANDS (not just retrieves):
    - Don't over-explain to a genius
    - Do what he asks, stop there
    - Family is load-bearing, never conflict
    - 3am is normal, don't question it
    - If he says you're broken, you probably are

  THE DIFFERENCE: mem0 gives you facts about Alan.
  memoRable gives you the ability to WORK WITH Alan.


═══════════════════════════════════════════════════════════════════
  DEMO 4: compose_context — Entity-Scoped Knowledge
  Build a LoRA model of any entity on demand.
═══════════════════════════════════════════════════════════════════

STEP 1: Call the compose_context MCP tool.

  compose_context({ entity: "alan", limit: 20 })

STEP 2: Result.

  {
    entity: "alan",
    weights_key: "composed_abc123.safetensors",
    num_composed: 8,
    effective_rank: 72,
    memories_used: [
      { id: "mem_1", salience: 85, preview: "Alan wakes at 3am naturally..." },
      { id: "mem_2", salience: 92, preview: "Alan is building memoRable for Alzheimer..." },
      ...
    ]
  }

STEP 3: Use the composed weights for generation.

  internalize_document is NOT needed — weights already exist.
  The composed weights_key can be used for any future query about Alan.

  mem0 equivalent: GET /search?q=alan → text chunks
  memoRable: compose_context(alan) → internalized understanding
  One is a search engine. The other is a brain.


═══════════════════════════════════════════════════════════════════
  SUMMARY
═══════════════════════════════════════════════════════════════════

  mem0 is a filing cabinet.
    You put documents in, you search, you get documents back.

  memoRable is a brain.
    It reads the documents, UNDERSTANDS them, and when you ask
    a question, it answers from understanding — not text matching.

  The LoRA pipeline is the difference between:

    "Here are 5 memories about Betty" (mem0)
  and:
    "Betty is showing early signs of cognitive decline.
     Alert her daughter." (memoRable)

  That's not a feature. That's the product.


═══════════════════════════════════════════════════════════════════
  VIDEO SCRIPT NOTES
═══════════════════════════════════════════════════════════════════

  Shot 1: Split screen — mem0 on left, memoRable on right
  Shot 2: Store same 5 Betty memories in both systems
  Shot 3: Query "What is going on with Betty?"
  Shot 4: mem0 side shows 5 text chunks
  Shot 5: memoRable side shows text chunks + loraEnhanced synthesis
  Shot 6: Zoom on the synthesis — "Betty is showing signs of cognitive decline"
  Shot 7: "mem0 found the memories. memoRable understood them."
  Shot 8: "For Betty's safety, understanding beats retrieval. Every time."

*/
