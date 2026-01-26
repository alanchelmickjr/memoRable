# Slack Commitments MVP

**Goal:** Ship a working Slack bot that tracks commitments this week.

---

## The One Thing (This Sprint)

**Extract commitments from Slack messages and surface them before they're forgotten.**

This adds to the existing Slack integration (text → 3D toy design). Commitments + 3D generation = complete workflow for toy design teams.

---

## What Exists (Don't Rebuild)

| Component | File | Status |
|-----------|------|--------|
| Open Loop Tracker | `src/services/salience_service/open_loop_tracker.ts` | ✅ Complete |
| Feature Extractor (LLM) | `src/services/salience_service/feature_extractor.ts` | ✅ Complete |
| Contact Management | `src/services/salience_service/database.ts` | ✅ Complete |
| Slack Service (3D/SCAD) | `src/services/slack_integration/index.ts` | ✅ Core feature - text → 3D |

The open loop tracker already does:
- Extract commitments from text (made/received)
- Parse due dates (explicit/implicit/relative)
- Track urgency (urgent/high/normal/low)
- Auto-close loops when fulfilled
- Reminder scheduling

**We just need to wire Slack → Open Loop Tracker.**

---

## MVP Scope (This Week)

### Must Have
1. **Listen to Slack channels** - Bot joins channels, sees messages
2. **Extract commitments** - Use existing feature extractor
3. **Store as open loops** - Use existing tracker
4. **Daily digest DM** - "You owe: X, Y, Z. Owed to you: A, B, C"
5. **Manual close** - `/done @person thing` marks loop closed

### Don't Build Yet
- Inline commitment confirmation ("Did you mean...?")
- Thread context analysis
- Slack reactions as signals
- Real-time notifications
- Web dashboard
- Multi-workspace

---

## User Flow

```
1. User says in #project-alpha:
   "Hey @sarah I'll send you the design doc by Friday"

2. Bot (silently):
   - Extracts: commitment_made, to: sarah, what: "send design doc", by: Friday
   - Creates open loop: owner=self, urgency=normal

3. Friday morning, user gets DM:
   "📋 Due today:
    • Send design doc to Sarah (#project-alpha)"

4. User sends doc, then types:
   /done @sarah design doc

5. Bot closes the loop, responds:
   "✅ Marked complete: Send design doc to Sarah"
```

---

## Technical Plan

### Step 1: Slack App Setup
- Create Slack app at api.slack.com
- Enable Event Subscriptions (message.channels, message.groups, message.im)
- Enable slash commands (/done, /loops)
- OAuth scopes: channels:history, chat:write, im:write, users:read
- Install to workspace

### Step 2: Event Handler (New Code)

```typescript
// src/services/slack_integration/commitment_handler.ts

import { extractFeatures } from '../salience_service/feature_extractor';
import { createOpenLoopsFromFeatures, getOpenLoops, closeLoop } from '../salience_service/open_loop_tracker';

export async function handleSlackMessage(event: SlackMessageEvent): Promise<void> {
  // Skip bot messages
  if (event.bot_id) return;

  // Extract features using existing LLM extractor
  const features = await extractFeatures(event.text, {
    context: { channel: event.channel, thread: event.thread_ts }
  });

  // Create loops if commitments found
  if (features.commitments.length > 0 || features.mutualAgreements.length > 0) {
    await createOpenLoopsFromFeatures(
      features,
      event.user,
      `slack:${event.channel}:${event.ts}`,
      new Date()
    );
  }
}
```

### Step 3: Daily Digest (New Code)

```typescript
// src/services/slack_integration/daily_digest.ts

export async function sendDailyDigest(userId: string, slackUserId: string): Promise<void> {
  const ownedByMe = await getOpenLoops(userId, { owner: 'self', status: 'open' });
  const owedToMe = await getOpenLoops(userId, { owner: 'them', status: 'open' });
  const overdue = await getOverdueLoops(userId);

  if (ownedByMe.length === 0 && owedToMe.length === 0) return;

  const blocks = buildDigestBlocks(ownedByMe, owedToMe, overdue);
  await postDM(slackUserId, blocks);
}
```

### Step 4: Slash Commands (New Code)

```typescript
// /done @person thing - Close a loop
// /loops - Show my open loops
// /loops @person - Show loops with person
```

### Step 5: Cron Job
- Run daily digest at 8am user timezone
- Use existing event_daemon or simple cron

---

## Files to Create

```
src/services/slack_integration/
├── index.ts              # Existing - text → 3D toy generation (core feature)
├── commitment_handler.ts # NEW - message → loop extraction
├── daily_digest.ts       # NEW - DM builder
├── slash_commands.ts     # NEW - /done, /loops
└── cron.ts               # NEW - scheduled digest
```

---

## Environment Variables

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...  # For socket mode
DIGEST_HOUR=8             # When to send daily digest
```

---

## Test Scenarios

1. **Basic commitment made**
   - Input: "I'll send you the report tomorrow"
   - Expected: Loop created, owner=self, due=tomorrow

2. **Commitment received**
   - Input: "@bob said he'll review by EOD"
   - Expected: Loop created, owner=them, party=bob, due=today

3. **Vague commitment**
   - Input: "Let's grab coffee sometime"
   - Expected: Loop created, soft deadline 2 weeks

4. **Closure detection**
   - Setup: Open loop "send report to Sarah"
   - Input: "Here's the report @sarah"
   - Expected: Loop auto-closed

5. **Manual closure**
   - Input: `/done @sarah report`
   - Expected: Matching loop closed

---

## What Success Looks Like

**Day 1:** Bot joins channel, extracts first commitment
**Day 2:** User gets first daily digest
**Day 3:** User closes loop with /done
**Day 4:** Auto-closure works
**Day 5:** Ship to one real team for feedback

---

## Out of Scope (Future)

- **Slack reactions** - 👍 = acknowledged, ✅ = done
- **Thread awareness** - "RE: design doc" closes parent loop
- **Confidence prompts** - "Did you commit to X? [Yes/No]"
- **Escalation** - "Sarah hasn't responded in 3 days"
- **Team view** - Who owes what to whom
- **Analytics** - Commitment completion rates

---

## Risk: Rate Limits

Slack rate limits:
- Posting: 1 msg/sec/channel
- Events: Real-time, but app must respond in 3s

Mitigation:
- Feature extraction is async (don't block event ack)
- Digest is batched (one DM per user)
- LLM calls have 10s timeout (already in open_loop_tracker.ts)

---

## Dependencies

| Dependency | Status |
|------------|--------|
| MongoDB Atlas | ✅ Running |
| LLM Provider (Anthropic) | ✅ Configured |
| Open Loop Tracker | ✅ Complete |
| Feature Extractor | ✅ Complete |
| Slack App | ❌ Need to create |

---

## Blockers

None. Everything needed exists. Just need to wire it together.

---

*Ship small. Ship this week. Iterate based on real usage.*
