# MemoRable Example Prompts

These are the official example prompts for testing MemoRable integration with Claude.ai. Each example demonstrates key capabilities of the memory system.

## Example 1: Context-Aware Meeting Prep

### User Prompt
```
I'm about to meet with Sarah Chen
```

### Expected MemoRable Behavior

MemoRable automatically:
1. Sets context with `set_context({ people: ["Sarah Chen"] })`
2. Retrieves briefing with `get_briefing({ person: "Sarah Chen" })`
3. Returns contextual information

### Expected Response Structure
```json
{
  "contextSet": true,
  "briefing": {
    "lastInteraction": "2024-01-10",
    "youOweThem": [
      { "description": "Send feedback on proposal", "dueDate": "2024-01-15" }
    ],
    "theyOweYou": [
      { "description": "Budget spreadsheet", "dueDate": "2024-01-20" }
    ],
    "upcomingEvents": [
      { "description": "Daughter's recital", "eventDate": "Thursday" }
    ],
    "recentTopics": ["Series B funding", "Q4 planning", "Team expansion"],
    "sensitivities": ["Don't mention the merger"]
  }
}
```

### Natural Language Response
```
Here's what you should know before meeting Sarah Chen:

**Open Commitments:**
- You owe her: Feedback on the proposal (due Jan 15)
- She owes you: Budget spreadsheet (due Jan 20)

**Her Upcoming Events:**
- Daughter's recital on Thursday

**Recent Topics:**
- Series B funding concerns
- Q4 planning discussions
- Team expansion plans

**Sensitivity:**
- Avoid mentioning the merger
```

---

## Example 2: Memory Storage with Auto-Extraction

### User Prompt
```
Remember that Mike promised to send the Q4 report by Friday
```

### Expected MemoRable Behavior

MemoRable automatically:
1. Stores memory with `store_memory({ text: "Mike promised to send the Q4 report by Friday" })`
2. Extracts commitment as an open loop
3. Associates with person "Mike"

### Expected Response Structure
```json
{
  "stored": true,
  "memoryId": "mem_1705340000_abc123",
  "salience": 72,
  "factors": {
    "consequential": 0.85,
    "social": 0.65,
    "relevance": 0.70
  },
  "openLoopsCreated": 1,
  "extractedFeatures": {
    "peopleMentioned": ["Mike"],
    "actionItems": ["Send Q4 report"],
    "dueDate": "Friday",
    "loopOwner": "them"
  }
}
```

### Natural Language Response
```
Got it! I've stored this memory with high salience (72/100).

**Extracted:**
- Person: Mike
- Commitment: He owes you the Q4 report
- Due: Friday

This will appear in Mike's briefing and your open loops.
```

---

## Example 3: Predictive Day Outlook

### User Prompt
```
What's my day outlook?
```

### Expected MemoRable Behavior

MemoRable automatically:
1. Calls `day_outlook({ calendar: [...] })` with today's calendar
2. Analyzes learned patterns (if 21+ days of data)
3. Pre-loads briefings for scheduled people

### Expected Response Structure
```json
{
  "greeting": "Good morning! Ready for Monday?",
  "outlook": "You have 4 scheduled events today. First up: Standup at 9:00 AM.",
  "patternInsights": [
    "Tracking 15 established patterns with 74% average confidence",
    "3 predicted context switches based on your behavior patterns"
  ],
  "upcomingContextSwitches": [
    {
      "time": "8:45 AM",
      "confidence": "78%",
      "briefingsNeeded": ["Sarah", "Mike", "Jake"],
      "topicsLikely": ["Sprint velocity", "Payment bug", "Q4 planning"],
      "trigger": "Standup"
    },
    {
      "time": "1:45 PM",
      "confidence": "65%",
      "briefingsNeeded": ["Product team"],
      "topicsLikely": ["Roadmap review", "Feature priorities"],
      "trigger": "Product Sync"
    }
  ],
  "readyForPrediction": true,
  "dataCollectionDays": 45
}
```

### Natural Language Response
```
**Good morning! Here's your Monday outlook:**

You have 4 scheduled events today.

**Upcoming Context Switches:**

**8:45 AM - Standup (78% confidence)**
- Briefings ready for: Sarah, Mike, Jake
- Topics you'll likely discuss: Sprint velocity, payment bug, Q4 planning

**1:45 PM - Product Sync (65% confidence)**
- Briefings ready for: Product team
- Topics you'll likely discuss: Roadmap review, feature priorities

*Based on 45 days of pattern learning with 74% average confidence.*
```

---

## Testing Instructions

### For Anthropic Directory Review

1. **Set up test account** with sample data:
   ```
   Remember that John Smith promised to review the contract by next Monday
   Remember that I need to send the quarterly report to the board
   Remember that Sarah's birthday is coming up next week
   ```

2. **Test Example 1** (Meeting Prep):
   - Say: "I'm about to meet with John Smith"
   - Verify: Briefing returns with commitment about contract review

3. **Test Example 2** (Memory Storage):
   - Say: "Remember that Lisa will send the design mockups tomorrow"
   - Verify: Open loop created with Lisa as owner

4. **Test Example 3** (Day Outlook):
   - Note: Requires 21+ days of usage for pattern predictions
   - For new accounts: Shows data collection progress
   - Say: "What's my day outlook?"
   - Verify: Returns greeting and any available predictions

### Verification Checklist

| Example | Tool Used | Key Verification |
|---------|-----------|------------------|
| Meeting Prep | `set_context`, `get_briefing` | Returns person-specific briefing |
| Memory Storage | `store_memory` | Creates open loop, extracts people |
| Day Outlook | `day_outlook` | Shows pattern progress or predictions |

---

## Additional Test Prompts

### Memory Search
```
What do I know about the payment integration project?
```

### Commitment Tracking
```
What do I owe people? What do they owe me?
```

### Context-Based Recall
```
I'm at the coffee shop working on the API - what's relevant?
```

### Forget Memory
```
Forget everything about Project X
```

### Pattern Feedback
```
That memory about the standup was really helpful
```

---

## Sample Data for Test Account

Use these prompts to populate a test account:

```
Remember that Mike from Engineering promised to fix the login bug by Wednesday
Remember that I committed to reviewing Sarah's proposal by end of week
Remember that the quarterly board meeting is scheduled for the 15th
Remember that John's wife just had a baby - his daughter Emma
Remember that the team decided to use React for the new dashboard
Remember that Lisa mentioned she's sensitive about the layoff discussions
Remember that we agreed to increase the API rate limit to 1000 req/min
Remember that the client meeting with Acme Corp is at their downtown office
```

These will create:
- 3 open loops (commitments)
- 5 people associations
- 2 timeline events
- 1 sensitivity flag
- Multiple topics for context matching
