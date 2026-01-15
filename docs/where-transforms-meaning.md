# WHERE Transforms Meaning

> "What we do in front of the mirror at home and in front of 100 people at an auditorium are drastically different, even if it's the same speech." - Alan

---

## The 4 W's of Every Memory

Every memory MUST store:

```
WHO   → entities[] (who was involved)
WHAT  → content (what was said/done)
WHEN  → timestamp
WHERE → location
```

**Critical insight:** WHEN and WHERE are entangled (spacetime). They change each other more than WHO or WHAT.

- "Boat at 3am" ≠ "boat at noon"
- "Office today" ≠ "office tomorrow"

And we often forget WHY.

---

## WHERE Is Not Metadata

WHERE is not a tag. **WHERE transforms meaning.**

Same content, different universe:
- Confession at home vs confession in court
- "I love you" in bed vs at the airport
- Code review alone vs in front of the team
- Practice speech in bathroom vs auditorium performance

The room isn't background. **The room IS the context.**

This is why "reading the room" is literal.

---

## Current State Analysis

### What We Have (salience_service layer)

**context_frame.ts:**
- Location as a FrameDimension with source tracking
- Sources: explicit, inferred, calendar, location_service
- Auto-population from calendar events
- Change tracking for location updates

**device_context.ts:**
- Multi-device location resolution
- GPS, WiFi, BLE beacon support
- Confidence scoring (0-1)
- Resolution strategy: "mobile wins for location"
- Indoor positioning support

### What's Missing (server.js MVP layer)

The MVP endpoints accept `context.location` but:
1. **No validation** - location not required
2. **No prompting** - doesn't ask for location if missing
3. **No inference** - doesn't derive from device context
4. **No weighting** - location doesn't affect salience score
5. **No spacetime index** - can't query by WHERE-WHEN together

---

## Improvement Suggestions

### Tier 1: Quick Wins (1-2 days)

| Change | Effort | Impact |
|--------|--------|--------|
| Add `location` warning if missing | 2 hrs | Medium - awareness |
| Session context inheritance | 4 hrs | High - set once, inherit all |
| Add location to dashboard display | 2 hrs | Low - visibility |

### Tier 2: Medium Effort (1 week)

| Change | Effort | Impact |
|--------|--------|--------|
| Location affects salience calculation | 2 days | High - same words weigh different by WHERE |
| Spacetime composite index | 2 days | High - query by WHERE-WHEN |
| "Where are you?" session prompt | 1 day | Medium - explicit capture |

### Tier 3: Full Integration (2-3 weeks)

| Change | Effort | Impact |
|--------|--------|--------|
| Connect device_context.ts to MVP | 1 week | Very High - automatic location |
| Calendar integration for location | 3 days | High - meeting locations auto-populate |
| Location-based retrieval boosting | 1 week | Very High - "what did we discuss HERE?" |

---

## Recommended Path

**For current delivery timeline:**

1. **Now:** Add session-level location that inherits to all memories in session
2. **Next sprint:** Location affects salience (office conversations weight different than boat conversations)
3. **Future:** Full device_context integration when sensors are available

**The principle:** Ask what you cannot derive. More sensors come later. For now, ask once per session, inherit everywhere.

---

*WHERE-WHEN is spacetime. WHO-WHAT is content. Content travels through spacetime. The journey changes the cargo.*
