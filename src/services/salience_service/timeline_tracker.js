/**
 * @file Person Timeline Tracker Service
 * Tracks what's happening in other people's lives - their events, not just yours.
 *
 * Critical for "the dance" - knowing:
 * - Sarah's daughter's recital is Thursday
 * - Jennifer's Series B is closing next month
 * - Mike's father is in the hospital
 *
 * This lets you ask the right questions and avoid the wrong ones.
 */
import { v4 as uuidv4 } from 'uuid';
import { collections, getOrCreateContact } from './database';
/**
 * Mapping from relationship events to event types and sensitivity.
 */
const RELATIONSHIP_EVENT_MAPPING = {
    death: { type: 'family', sensitivity: 'sensitive', goodToMention: false },
    birth: { type: 'family', sensitivity: 'positive', goodToMention: true },
    marriage: { type: 'milestone', sensitivity: 'positive', goodToMention: true },
    divorce: { type: 'personal', sensitivity: 'sensitive', goodToMention: false },
    engagement: { type: 'milestone', sensitivity: 'positive', goodToMention: true },
    promotion: { type: 'professional', sensitivity: 'positive', goodToMention: true },
    job_change: { type: 'professional', sensitivity: 'neutral', goodToMention: true },
    graduation: { type: 'milestone', sensitivity: 'positive', goodToMention: true },
    illness: { type: 'health', sensitivity: 'sensitive', goodToMention: false },
    recovery: { type: 'health', sensitivity: 'positive', goodToMention: true },
    move: { type: 'personal', sensitivity: 'neutral', goodToMention: true },
    breakup: { type: 'personal', sensitivity: 'sensitive', goodToMention: false },
    reunion: { type: 'personal', sensitivity: 'positive', goodToMention: true },
    achievement: { type: 'milestone', sensitivity: 'positive', goodToMention: true },
    loss: { type: 'personal', sensitivity: 'sensitive', goodToMention: false },
    conflict: { type: 'personal', sensitivity: 'sensitive', goodToMention: false },
    reconciliation: { type: 'personal', sensitivity: 'positive', goodToMention: true },
};
/**
 * Create timeline events from extracted features.
 * Gracefully handles errors to avoid disrupting the main ingestion flow.
 */
export async function createTimelineEventsFromFeatures(features, userId, memoryId, memoryCreatedAt = new Date()) {
    const events = [];
    try {
        // Process dates mentioned (other people's events)
        for (const date of features.datesMentioned) {
            if (date.whose && date.whose.toLowerCase() !== 'self') {
                try {
                    const event = await createEventFromDate(date, userId, memoryId, memoryCreatedAt);
                    if (event)
                        events.push(event);
                }
                catch (error) {
                    console.error('[TimelineTracker] Error creating event from date:', error);
                    // Continue processing other dates
                }
            }
        }
        // Process relationship events
        for (const person of features.peopleMentioned) {
            for (const relEvent of features.relationshipEvents) {
                try {
                    const event = await createEventFromRelationship(person, relEvent, userId, memoryId, memoryCreatedAt);
                    if (event)
                        events.push(event);
                }
                catch (error) {
                    console.error('[TimelineTracker] Error creating event from relationship:', error);
                    // Continue processing other events
                }
            }
        }
        // Deduplicate events (same person + similar description + close date)
        const uniqueEvents = deduplicateEvents(events);
        // Store events
        if (uniqueEvents.length > 0) {
            // Check for existing similar events to avoid duplicates in DB
            for (const event of uniqueEvents) {
                try {
                    const existing = await findSimilarEvent(userId, event);
                    if (!existing) {
                        await collections.personTimelineEvents().insertOne(event);
                    }
                }
                catch (error) {
                    console.error('[TimelineTracker] Error storing timeline event:', error);
                    // Continue with other events
                }
            }
        }
        return uniqueEvents;
    }
    catch (error) {
        console.error('[TimelineTracker] Error creating timeline events:', error);
        return events; // Return whatever was successfully created
    }
}
/**
 * Create a timeline event from an extracted date.
 */
async function createEventFromDate(date, userId, memoryId, createdAt) {
    if (!date.whose || !date.context)
        return null;
    const contact = await getOrCreateContact(userId, date.whose);
    const eventDate = date.resolved ? new Date(date.resolved) : undefined;
    // Determine event type and sensitivity from context
    const { type, sensitivity, goodToMention } = inferEventTypeFromContext(date.context);
    // Check if this is a recurring event (birthdays, anniversaries)
    const isRecurring = isRecurringEvent(date.context);
    const recurrencePattern = isRecurring ? 'annual' : undefined;
    // Determine reminder timing
    const remindBeforeDays = getRemindBeforeDays(type, sensitivity);
    const now = createdAt.toISOString();
    return {
        id: uuidv4(),
        userId,
        contactId: contact._id,
        contactName: date.whose,
        memoryId,
        eventType: type,
        description: date.context,
        eventDate: eventDate?.toISOString(),
        isRecurring,
        recurrencePattern,
        remindBeforeDays,
        goodToMention,
        sensitivity,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Create a timeline event from a relationship event.
 */
async function createEventFromRelationship(personName, relEvent, userId, memoryId, createdAt) {
    const contact = await getOrCreateContact(userId, personName);
    const mapping = RELATIONSHIP_EVENT_MAPPING[relEvent];
    if (!mapping)
        return null;
    // Generate a description
    const description = generateRelationshipEventDescription(personName, relEvent);
    const now = createdAt.toISOString();
    return {
        id: uuidv4(),
        userId,
        contactId: contact._id,
        contactName: personName,
        memoryId,
        eventType: mapping.type,
        description,
        eventDate: createdAt.toISOString(), // Use memory date as event date if not specified
        isRecurring: false,
        remindBeforeDays: mapping.sensitivity === 'sensitive' ? 0 : 2,
        goodToMention: mapping.goodToMention,
        sensitivity: mapping.sensitivity,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Generate description for relationship event.
 */
function generateRelationshipEventDescription(personName, event) {
    const descriptions = {
        death: `${personName} experienced a death in their life`,
        birth: `${personName} welcomed a new baby`,
        marriage: `${personName} got married`,
        divorce: `${personName} went through a divorce`,
        engagement: `${personName} got engaged`,
        promotion: `${personName} got promoted`,
        job_change: `${personName} changed jobs`,
        graduation: `${personName} graduated`,
        illness: `${personName} or someone close is dealing with illness`,
        recovery: `${personName} or someone close recovered`,
        move: `${personName} moved`,
        breakup: `${personName} went through a breakup`,
        reunion: `${personName} had a reunion`,
        achievement: `${personName} achieved something significant`,
        loss: `${personName} experienced a loss`,
        conflict: `${personName} is dealing with conflict`,
        reconciliation: `${personName} reconciled with someone`,
    };
    return descriptions[event] || `${personName}: ${event}`;
}
/**
 * Infer event type and sensitivity from context.
 */
function inferEventTypeFromContext(context) {
    const lower = context.toLowerCase();
    // Health-related
    if (lower.includes('hospital') || lower.includes('sick') || lower.includes('surgery') || lower.includes('cancer')) {
        return { type: 'health', sensitivity: 'sensitive', goodToMention: false };
    }
    // Family events
    if (lower.includes('recital') || lower.includes('school') || lower.includes('game') || lower.includes('concert')) {
        return { type: 'family', sensitivity: 'positive', goodToMention: true };
    }
    if (lower.includes('birthday')) {
        return { type: 'celebration', sensitivity: 'positive', goodToMention: true };
    }
    if (lower.includes('anniversary')) {
        return { type: 'celebration', sensitivity: 'positive', goodToMention: true };
    }
    if (lower.includes('funeral') || lower.includes('memorial') || lower.includes('passed')) {
        return { type: 'family', sensitivity: 'sensitive', goodToMention: false };
    }
    // Professional
    if (lower.includes('meeting') || lower.includes('presentation') || lower.includes('deadline')) {
        return { type: 'deadline', sensitivity: 'neutral', goodToMention: true };
    }
    if (lower.includes('series') || lower.includes('funding') || lower.includes('closing')) {
        return { type: 'professional', sensitivity: 'positive', goodToMention: true };
    }
    if (lower.includes('interview') || lower.includes('offer') || lower.includes('job')) {
        return { type: 'professional', sensitivity: 'neutral', goodToMention: true };
    }
    // Travel / Absence
    if (lower.includes('vacation') || lower.includes('trip') || lower.includes('leave') || lower.includes('off')) {
        return { type: 'absence', sensitivity: 'neutral', goodToMention: true };
    }
    if (lower.includes('travel')) {
        return { type: 'travel', sensitivity: 'neutral', goodToMention: true };
    }
    // Default
    return { type: 'personal', sensitivity: 'neutral', goodToMention: true };
}
/**
 * Check if an event is recurring (birthdays, anniversaries).
 */
function isRecurringEvent(context) {
    const lower = context.toLowerCase();
    return lower.includes('birthday') || lower.includes('anniversary');
}
/**
 * Get days to remind before event based on type.
 */
function getRemindBeforeDays(type, sensitivity) {
    if (sensitivity === 'sensitive')
        return 0; // Don't proactively remind
    switch (type) {
        case 'deadline':
            return 1;
        case 'celebration':
            return 3; // Time to prepare/send wishes
        case 'professional':
            return 2;
        case 'family':
            return 2;
        default:
            return 1;
    }
}
/**
 * Find similar existing event to avoid duplicates.
 */
async function findSimilarEvent(userId, event) {
    // Look for events with same contact and similar description within ±7 days
    const query = {
        userId,
        contactId: event.contactId,
    };
    // Add date range if we have an event date
    if (event.eventDate) {
        const eventDate = new Date(event.eventDate);
        const minDate = new Date(eventDate);
        minDate.setDate(minDate.getDate() - 7);
        const maxDate = new Date(eventDate);
        maxDate.setDate(maxDate.getDate() + 7);
        query.eventDate = {
            $gte: minDate.toISOString(),
            $lte: maxDate.toISOString(),
        };
    }
    const candidates = await collections.personTimelineEvents().find(query).toArray();
    // Check for description similarity
    for (const candidate of candidates) {
        if (isSimilarDescription(event.description, candidate.description)) {
            return candidate;
        }
    }
    return null;
}
/**
 * Check if two descriptions are similar.
 */
function isSimilarDescription(desc1, desc2) {
    const words1 = new Set(desc1.toLowerCase().split(/\s+/));
    const words2 = new Set(desc2.toLowerCase().split(/\s+/));
    // Count common words
    let common = 0;
    for (const word of words1) {
        if (words2.has(word))
            common++;
    }
    // If more than 50% overlap, consider similar
    const similarity = (2 * common) / (words1.size + words2.size);
    return similarity > 0.5;
}
/**
 * Deduplicate events in memory.
 */
function deduplicateEvents(events) {
    const seen = new Map();
    for (const event of events) {
        // Create a key based on contact + description
        const key = `${event.contactId || event.contactName}:${event.description.toLowerCase().slice(0, 50)}`;
        if (!seen.has(key)) {
            seen.set(key, event);
        }
    }
    return Array.from(seen.values());
}
/**
 * Get upcoming events for a specific person.
 */
export async function getUpcomingEventsForContact(userId, contactId, daysAhead = 14) {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + daysAhead);
    return collections.personTimelineEvents()
        .find({
        userId,
        contactId,
        eventDate: {
            $gte: now.toISOString(),
            $lte: future.toISOString(),
        },
    })
        .sort({ eventDate: 1 })
        .toArray();
}
/**
 * Get upcoming events across all contacts.
 */
export async function getUpcomingEvents(userId, daysAhead = 14) {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + daysAhead);
    return collections.personTimelineEvents()
        .find({
        userId,
        eventDate: {
            $gte: now.toISOString(),
            $lte: future.toISOString(),
        },
    })
        .sort({ eventDate: 1 })
        .toArray();
}
/**
 * Get recent events (what happened recently in their lives).
 */
export async function getRecentEventsForContact(userId, contactId, daysBack = 30) {
    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - daysBack);
    return collections.personTimelineEvents()
        .find({
        userId,
        contactId,
        eventDate: {
            $gte: past.toISOString(),
            $lte: now.toISOString(),
        },
    })
        .sort({ eventDate: -1 })
        .toArray();
}
/**
 * Get events that should trigger reminders.
 */
export async function getEventsNeedingReminders(userId) {
    const now = new Date();
    // Find events where eventDate - remindBeforeDays <= now < eventDate
    const events = await collections.personTimelineEvents()
        .find({
        userId,
        eventDate: { $gte: now.toISOString() },
        goodToMention: true,
    })
        .toArray();
    // Filter to those within reminder window
    return events.filter((event) => {
        if (!event.eventDate || !event.remindBeforeDays)
            return false;
        const eventDate = new Date(event.eventDate);
        const reminderDate = new Date(eventDate);
        reminderDate.setDate(reminderDate.getDate() - event.remindBeforeDays);
        return now >= reminderDate && now < eventDate;
    });
}
/**
 * Mark an event as mentioned (so we don't keep suggesting it).
 */
export async function markEventMentioned(eventId) {
    await collections.personTimelineEvents().updateOne({ id: eventId }, {
        $set: {
            lastMentionedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    });
}
/**
 * Get sensitive events to be aware of (but not proactively mention).
 */
export async function getSensitiveContext(userId, contactId) {
    // Get recent sensitive events
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return collections.personTimelineEvents()
        .find({
        userId,
        contactId,
        sensitivity: 'sensitive',
        createdAt: { $gte: thirtyDaysAgo.toISOString() },
    })
        .sort({ createdAt: -1 })
        .toArray();
}
/**
 * Process recurring events (advance annual events to next year).
 * Should be called periodically (e.g., daily).
 */
export async function processRecurringEvents(userId) {
    const now = new Date();
    // Find recurring events whose date has passed
    const pastRecurring = await collections.personTimelineEvents()
        .find({
        userId,
        isRecurring: true,
        recurrencePattern: 'annual',
        eventDate: { $lt: now.toISOString() },
    })
        .toArray();
    let updated = 0;
    for (const event of pastRecurring) {
        if (!event.eventDate)
            continue;
        // Advance to next year
        const nextDate = new Date(event.eventDate);
        nextDate.setFullYear(now.getFullYear());
        // If already passed this year, move to next year
        if (nextDate < now) {
            nextDate.setFullYear(now.getFullYear() + 1);
        }
        await collections.personTimelineEvents().updateOne({ id: event.id }, {
            $set: {
                eventDate: nextDate.toISOString(),
                lastMentionedAt: undefined, // Reset so it can be mentioned again
                updatedAt: new Date().toISOString(),
            },
        });
        updated++;
    }
    return updated;
}
