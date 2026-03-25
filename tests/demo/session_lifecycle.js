/**
 * Session Lifecycle Test — A Day in the Life
 *
 * Full rolling test: opening greeting to closing moment.
 * Every MCP tool call a user would make in a real session.
 * Humans should be able to wipe portions. Elegance is genius.
 *
 * Run via MCP tools in Claude Code. This is the guided walkthrough.
 *
 * SEQUENCE:
 *   1. Session start — load continuity, get briefing
 *   2. Morning — set context, store memories, check what's relevant
 *   3. Midday — recall with LoRA synthesis, track commitments
 *   4. Afternoon — switch device, context follows
 *   5. Evening — forget something, verify it's gone
 *   6. Session end — export, verify state
 *
 * Each step shows the MCP tool call and expected result.
 */

/*
═══════════════════════════════════════════════════════════════════
  PHASE 1: OPENING — Good morning, remember me?
═══════════════════════════════════════════════════════════════════

  // Session starts. Load what happened last time.
  get_session_continuity({})

  EXPECTED:
  - Previous session summary
  - Open loops carried forward
  - Last device used
  - Time since last session

  // Who am I meeting today?
  day_outlook({})

  EXPECTED:
  - Anticipated events
  - Open commitments due today
  - Pattern-predicted needs (21-day learning)


═══════════════════════════════════════════════════════════════════
  PHASE 2: MORNING — Context sets the stage
═══════════════════════════════════════════════════════════════════

  // I'm at the office working on the memoRable project
  set_context({
    location: "office",
    activity: "coding",
    project: "memorable",
    deviceId: "macbook-alan",
    deviceType: "desktop"
  })

  EXPECTED:
  - Context frame set
  - Relevant memories auto-surfaced for this location+activity+project

  // What matters right now given my context?
  whats_relevant({})

  EXPECTED:
  - Memories filtered by current context (office, coding, memorable)
  - NOT: home stuff, family stuff, other projects
  - YES: open loops for this project, recent decisions, blockers

  // Store a decision
  store_memory({
    text: "Decided to use per-user LoRA composition instead of one big model. ~40 docs at rank 8 composes cleanly. O(1) at inference.",
    context: { activity: "architecture", people: ["alan"] }
  })

  EXPECTED:
  - Memory stored with salience score
  - Auto-internalized into LoRA weights (salience > 0.6)
  - Open loops detected if any commitments in text

  // Store another — this one has a commitment
  store_memory({
    text: "Need to write the RAG vs LoRA paper before the grant deadline. Alan promised Dr. Chen a draft by April 15.",
    context: { activity: "planning", people: ["alan", "dr_chen"] }
  })

  EXPECTED:
  - Memory stored
  - Open loop created: "draft paper by April 15" (alan owes dr_chen)
  - High salience (consequential + social + deadline)


═══════════════════════════════════════════════════════════════════
  PHASE 3: MIDDAY — Recall with understanding
═══════════════════════════════════════════════════════════════════

  // What do I know about the LoRA architecture?
  recall({ query: "LoRA architecture decisions", limit: 10 })

  EXPECTED:
  - Memories about LoRA ranked by salience
  - loraEnhanced.synthesis (if 2+ memories have weights):
    Composed understanding, not just text chunks
  - Context-gated: only showing project-relevant memories

  // Briefing before a call with Dr. Chen
  get_briefing({ person: "dr_chen" })

  EXPECTED:
  - Open loops: alan owes paper draft by April 15
  - Recent interactions
  - Relationship state
  - Suggestions: bring up the paper, mention progress

  // What commitments do I have?
  list_loops({})

  EXPECTED:
  - "Draft paper for Dr. Chen by April 15" — OPEN
  - Any other carried-forward loops

  // Compose everything I know about the project
  compose_context({ entity: "memorable_project", limit: 20 })

  EXPECTED:
  - LoRA weights composed from project memories
  - weights_key returned for future generation
  - Effective rank based on number of internalized memories


═══════════════════════════════════════════════════════════════════
  PHASE 4: AFTERNOON — Switch devices, context follows
═══════════════════════════════════════════════════════════════════

  // Heading out. Switching to phone.
  handoff_device({
    fromDeviceId: "macbook-alan",
    toDeviceId: "iphone-alan",
    toDeviceType: "mobile"
  })

  EXPECTED:
  - Context transferred
  - Active memories carried over
  - Device-appropriate filtering (mobile = shorter responses)

  // Set new context — at a cafe now
  set_context({
    location: "cafe",
    activity: "thinking",
    deviceId: "iphone-alan",
    deviceType: "mobile"
  })

  EXPECTED:
  - Context updated
  - Memories re-filtered for new location
  - Project context still available but cafe-relevant stuff surfaces

  // Quick thought while walking
  store_memory({
    text: "The name O(1) captures the whole thesis. Constant time intelligence. LoRA is O(1), RAG is O(n). That's the paper title.",
    context: { activity: "thinking", people: ["alan"] },
    deviceId: "iphone-alan",
    deviceType: "mobile"
  })

  EXPECTED:
  - Stored with mobile device tag
  - High salience (novel insight, strategic)
  - Auto-internalized


═══════════════════════════════════════════════════════════════════
  PHASE 5: EVENING — The power to forget
═══════════════════════════════════════════════════════════════════

  // I stored something earlier I want to forget
  recall({ query: "coffee preference", limit: 5 })

  // Find the memory ID, then forget it
  forget({ memoryId: "<id_from_recall>", mode: "suppress" })

  EXPECTED:
  - Memory suppressed (hidden from default recall)
  - NOT deleted — can be restored
  - "Perfect memory is about knowing what to forget"

  // Verify it's gone from recall
  recall({ query: "coffee preference", limit: 5 })

  EXPECTED:
  - Suppressed memory does NOT appear
  - Other memories still intact

  // Actually, bring it back
  restore({ memoryId: "<id_from_forget>" })

  EXPECTED:
  - Memory restored to active state
  - Shows up in recall again

  // No wait, actually delete it for real
  forget({ memoryId: "<id>", mode: "delete" })

  EXPECTED:
  - Soft deleted, pending removal
  - Gone from all recall paths


═══════════════════════════════════════════════════════════════════
  PHASE 6: CLOSING — Export and verify
═══════════════════════════════════════════════════════════════════

  // What did we accomplish today?
  list_loops({ overdue: false })

  EXPECTED:
  - Paper draft for Dr. Chen — still open
  - Any loops closed during session marked done

  // How's the system feeling about me?
  behavioral_metrics({})

  EXPECTED:
  - Session activity summary
  - Memory count, loop count
  - Device usage pattern

  // Export everything for backup
  export_memories({})

  EXPECTED:
  - Full memory export
  - Encrypted if Tier 2/3
  - Portable format

  // Clear context for the night
  clear_context({})

  EXPECTED:
  - Context frame cleared
  - System ready for next session
  - Continuity saved for morning


═══════════════════════════════════════════════════════════════════
  VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════════════════

  [ ] Session continuity loads from previous session
  [ ] Context gates memory recall (office → only work stuff)
  [ ] store_memory assigns salience scores
  [ ] store_memory auto-internalizes to LoRA (salience > 0.6)
  [ ] recall returns LoRA-enhanced synthesis when weights exist
  [ ] Open loops detected from commitment language
  [ ] get_briefing assembles person context
  [ ] compose_context creates per-entity LoRA composition
  [ ] handoff_device transfers context between devices
  [ ] forget suppresses memories from recall
  [ ] restore brings them back
  [ ] forget with delete mode removes permanently
  [ ] export_memories produces portable backup
  [ ] clear_context resets for next session
  [ ] No session state leaks between contexts

  Total MCP tools exercised: 18 of 52
  Lifecycle: open → store → recall → switch → forget → close


═══════════════════════════════════════════════════════════════════
  THE POINT
═══════════════════════════════════════════════════════════════════

  A day is a day. A session is a session.
  Open → work → remember → forget → close.
  Tomorrow it all comes back — the parts that matter.

  Memorable is context for life.

*/
