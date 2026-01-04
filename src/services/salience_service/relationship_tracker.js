/**
 * @file Relationship Rhythm Tracker Service
 * Tracks the cadence and health of relationships over time.
 *
 * Every relationship has a natural rhythm. The system learns it:
 * - How often do you typically interact with this person?
 * - What days/times are typical?
 * - Is the relationship getting warmer or going cold?
 * - What's the reciprocity balance (favors given vs received)?
 */
import { v4 as uuidv4 } from 'uuid';
import { collections, batchGetOrCreateContacts } from './database';
/**
 * Update relationship pattern when an interaction occurs.
 * Gracefully handles errors - returns minimal pattern on failure.
 */
export async function recordInteraction(userId, contactId, contactName, interactionDate = new Date(), features) {
    try {
        const patternsCollection = collections.relationshipPatterns();
        // Get or create pattern
        const existingPattern = await patternsCollection.findOne({ userId, contactId });
        if (!existingPattern) {
            // Create new pattern
            const newPattern = {
                id: uuidv4(),
                userId,
                contactId,
                contactName,
                firstInteraction: interactionDate.toISOString(),
                lastInteraction: interactionDate.toISOString(),
                totalInteractions: 1,
                interactionTrend: 'stable',
                updatedAt: new Date().toISOString(),
            };
            await patternsCollection.insertOne(newPattern);
            return newPattern;
        }
        const pattern = existingPattern;
        // Calculate gap since last interaction
        const lastInteraction = pattern.lastInteraction ? new Date(pattern.lastInteraction) : null;
        let gap = null;
        if (lastInteraction) {
            gap = Math.ceil((interactionDate.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));
        }
        // Update rolling average of days between interactions
        let newAvg = pattern.avgDaysBetweenInteractions;
        if (gap !== null && gap > 0) {
            if (newAvg) {
                // Exponential moving average with alpha=0.3
                newAvg = newAvg * 0.7 + gap * 0.3;
            }
            else {
                newAvg = gap;
            }
        }
        // Update typical interaction days
        const dayOfWeek = interactionDate.toLocaleDateString('en-US', { weekday: 'long' });
        const typicalDays = updateTypicalDays(pattern.typicalInteractionDays || [], dayOfWeek);
        // Update typical time of day
        const hour = interactionDate.getHours();
        const timeOfDay = getTimeOfDayLabel(hour);
        const typicalTimes = updateTypicalTimes(pattern.typicalTimeOfDay || [], timeOfDay);
        // Calculate trend
        const trend = calculateTrend(pattern, gap);
        // Calculate suggested next interaction
        const suggestedNext = newAvg
            ? new Date(interactionDate.getTime() + newAvg * 24 * 60 * 60 * 1000)
            : undefined;
        // Update pattern
        await patternsCollection.updateOne({ userId, contactId }, {
            $set: {
                lastInteraction: interactionDate.toISOString(),
                avgDaysBetweenInteractions: newAvg,
                typicalInteractionDays: typicalDays,
                typicalTimeOfDay: typicalTimes,
                interactionTrend: trend,
                suggestedNextInteraction: suggestedNext?.toISOString(),
                daysSinceLastInteraction: 0,
                updatedAt: new Date().toISOString(),
            },
            $inc: { totalInteractions: 1 },
        });
        return {
            ...pattern,
            lastInteraction: interactionDate.toISOString(),
            totalInteractions: pattern.totalInteractions + 1,
            avgDaysBetweenInteractions: newAvg,
            typicalInteractionDays: typicalDays,
            typicalTimeOfDay: typicalTimes,
            interactionTrend: trend,
            suggestedNextInteraction: suggestedNext?.toISOString(),
            daysSinceLastInteraction: 0,
            updatedAt: new Date().toISOString(),
        };
    }
    catch (error) {
        console.error('[RelationshipTracker] Error recording interaction:', error);
        // Return minimal pattern on error
        return {
            id: uuidv4(),
            userId,
            contactId,
            contactName,
            firstInteraction: interactionDate.toISOString(),
            lastInteraction: interactionDate.toISOString(),
            totalInteractions: 1,
            interactionTrend: 'stable',
            updatedAt: new Date().toISOString(),
        };
    }
}
/**
 * Get time of day label from hour.
 */
function getTimeOfDayLabel(hour) {
    if (hour >= 5 && hour < 12)
        return 'morning';
    if (hour >= 12 && hour < 17)
        return 'afternoon';
    if (hour >= 17 && hour < 21)
        return 'evening';
    return 'night';
}
/**
 * Update typical days array with frequency tracking.
 */
function updateTypicalDays(current, newDay) {
    // Keep track of the most common days (top 3)
    const dayCount = new Map();
    // Count existing
    for (const day of current) {
        dayCount.set(day, (dayCount.get(day) || 0) + 1);
    }
    // Add new day
    dayCount.set(newDay, (dayCount.get(newDay) || 0) + 1);
    // Sort by frequency and take top 3
    const sorted = Array.from(dayCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    // Return array with repetition based on frequency (max 3 per day)
    const result = [];
    for (const [day, count] of sorted) {
        const times = Math.min(3, count);
        for (let i = 0; i < times; i++) {
            result.push(day);
        }
    }
    return result;
}
/**
 * Update typical times array.
 */
function updateTypicalTimes(current, newTime) {
    const timeCount = new Map();
    for (const time of current) {
        timeCount.set(time, (timeCount.get(time) || 0) + 1);
    }
    timeCount.set(newTime, (timeCount.get(newTime) || 0) + 1);
    const sorted = Array.from(timeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
    const result = [];
    for (const [time, count] of sorted) {
        const times = Math.min(3, count);
        for (let i = 0; i < times; i++) {
            result.push(time);
        }
    }
    return result;
}
/**
 * Calculate engagement trend based on interaction patterns.
 */
function calculateTrend(pattern, currentGap) {
    if (!pattern.avgDaysBetweenInteractions || currentGap === null) {
        return 'stable';
    }
    const ratio = currentGap / pattern.avgDaysBetweenInteractions;
    // If interacting more frequently than average
    if (ratio < 0.7)
        return 'increasing';
    // If interacting at roughly normal rate
    if (ratio <= 1.5)
        return 'stable';
    // If gap is 1.5-3x normal
    if (ratio <= 3)
        return 'decreasing';
    // If gap is 3x+ normal
    return 'dormant';
}
/**
 * Get relationship pattern for a contact.
 */
export async function getRelationshipPattern(userId, contactId) {
    const pattern = await collections.relationshipPatterns().findOne({ userId, contactId });
    if (pattern && pattern.lastInteraction) {
        // Update days since last interaction
        const daysSince = Math.ceil((Date.now() - new Date(pattern.lastInteraction).getTime()) / (1000 * 60 * 60 * 24));
        pattern.daysSinceLastInteraction = daysSince;
        // Recalculate trend with current gap
        if (pattern.avgDaysBetweenInteractions) {
            pattern.interactionTrend = calculateTrend(pattern, daysSince);
        }
    }
    return pattern;
}
/**
 * Get relationships that have gone cold.
 */
export async function getColdRelationships(userId, options = {}) {
    const minInteractions = options.minInteractions ?? 2;
    const coldThreshold = options.coldThresholdDays ?? 30;
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() - coldThreshold);
    const patterns = await collections.relationshipPatterns()
        .find({
        userId,
        totalInteractions: { $gte: minInteractions },
        lastInteraction: { $lt: threshold.toISOString() },
    })
        .sort({ totalInteractions: -1 }) // Prioritize historically active relationships
        .toArray();
    // Update days since for each
    return patterns.map((p) => {
        if (p.lastInteraction) {
            p.daysSinceLastInteraction = Math.ceil((now.getTime() - new Date(p.lastInteraction).getTime()) / (1000 * 60 * 60 * 24));
        }
        return p;
    });
}
/**
 * Get relationships with decreasing engagement.
 */
export async function getDecreasingRelationships(userId) {
    // First get all patterns
    const patterns = await collections.relationshipPatterns()
        .find({
        userId,
        totalInteractions: { $gte: 2 },
    })
        .toArray();
    // Filter to those with decreasing or dormant trend
    const now = new Date();
    return patterns.filter((p) => {
        if (!p.lastInteraction || !p.avgDaysBetweenInteractions)
            return false;
        const daysSince = Math.ceil((now.getTime() - new Date(p.lastInteraction).getTime()) / (1000 * 60 * 60 * 24));
        const trend = calculateTrend(p, daysSince);
        return trend === 'decreasing' || trend === 'dormant';
    });
}
/**
 * Create a relationship snapshot for time-series tracking.
 */
export async function createRelationshipSnapshot(userId, contactId, openLoops, avgSentiment) {
    const pattern = await getRelationshipPattern(userId, contactId);
    const now = new Date();
    const snapshotDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    // Calculate open loops balance
    const loopsToThem = openLoops.filter((l) => l.owner === 'self').length;
    const loopsFromThem = openLoops.filter((l) => l.owner === 'them').length;
    // Calculate favors (approximate from loops)
    const favorsGiven = openLoops.filter((l) => l.owner === 'self' && l.category === 'favor' && l.status === 'completed').length;
    const favorsReceived = openLoops.filter((l) => l.owner === 'them' && l.category === 'favor' && l.status === 'completed').length;
    const snapshot = {
        id: uuidv4(),
        userId,
        contactId,
        snapshotDate,
        interactionsCount: 0, // Would need to count for this period
        totalInteractions: pattern?.totalInteractions || 0,
        avgSentiment,
        engagementTrend: pattern?.interactionTrend || 'stable',
        lastInteraction: pattern?.lastInteraction,
        daysSinceInteraction: pattern?.daysSinceLastInteraction || 0,
        favorsGiven,
        favorsReceived,
        reciprocityBalance: favorsReceived - favorsGiven, // Positive = they've done more for you
        openLoopsToThem: loopsToThem,
        openLoopsFromThem: loopsFromThem,
    };
    // Upsert (update if exists for same date)
    await collections.relationshipSnapshots().updateOne({ userId, contactId, snapshotDate }, { $set: snapshot }, { upsert: true });
    return snapshot;
}
/**
 * Get latest snapshot for a relationship.
 */
export async function getLatestSnapshot(userId, contactId) {
    return collections.relationshipSnapshots()
        .findOne({ userId, contactId }, { sort: { snapshotDate: -1 } });
}
/**
 * Get relationship trajectory over time.
 */
export async function getRelationshipTrajectory(userId, contactId, daysBack = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    return collections.relationshipSnapshots()
        .find({
        userId,
        contactId,
        snapshotDate: { $gte: startDate.toISOString().split('T')[0] },
    })
        .sort({ snapshotDate: 1 })
        .toArray();
}
/**
 * Get all active relationships for a user.
 */
export async function getActiveRelationships(userId, options = {}) {
    const minInteractions = options.minInteractions ?? 1;
    const activeWithin = options.activeWithinDays ?? 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - activeWithin);
    return collections.relationshipPatterns()
        .find({
        userId,
        totalInteractions: { $gte: minInteractions },
        lastInteraction: { $gte: cutoff.toISOString() },
    })
        .sort({ lastInteraction: -1 })
        .toArray();
}
/**
 * Update relationship from memory/interaction features.
 * Uses batch contact lookup for efficiency (1 DB call instead of N).
 * Gracefully handles errors - continues processing remaining people on failure.
 */
export async function updateRelationshipFromFeatures(userId, features, memoryCreatedAt = new Date()) {
    const personNames = features.peopleMentioned;
    if (personNames.length === 0)
        return;
    // Batch lookup all contacts in one DB call
    const contactsMap = await batchGetOrCreateContacts(userId, personNames);
    // Update patterns for all mentioned people
    for (const personName of personNames) {
        try {
            const contact = contactsMap.get(personName.toLowerCase());
            if (contact?._id) {
                await recordInteraction(userId, contact._id, personName, memoryCreatedAt, features);
            }
        }
        catch (error) {
            console.error(`[RelationshipTracker] Error updating relationship for ${personName}:`, error);
            // Continue with other people
        }
    }
}
/**
 * Get relationships that need attention.
 * Combines cold relationships, decreasing engagement, and overdue loops.
 */
export async function getRelationshipsNeedingAttention(userId) {
    const [cold, decreasing, allLoops] = await Promise.all([
        getColdRelationships(userId),
        getDecreasingRelationships(userId),
        collections.openLoops().find({
            userId,
            status: 'open',
            dueDate: { $lt: new Date().toISOString() },
        }).toArray(),
    ]);
    // Group overdue loops by contact
    const overdueByContact = new Map();
    for (const loop of allLoops) {
        if (loop.contactId) {
            overdueByContact.set(loop.contactId, (overdueByContact.get(loop.contactId) || 0) + 1);
        }
    }
    // Get patterns for contacts with overdue loops
    const withOverdueLoops = [];
    for (const [contactId, count] of overdueByContact) {
        const pattern = await getRelationshipPattern(userId, contactId);
        if (pattern) {
            withOverdueLoops.push({ pattern, overdueCount: count });
        }
    }
    return { cold, decreasing, withOverdueLoops };
}
/**
 * Set nudge threshold for a relationship.
 */
export async function setNudgeThreshold(userId, contactId, days) {
    await collections.relationshipPatterns().updateOne({ userId, contactId }, {
        $set: {
            nudgeIfGapExceedsDays: days,
            updatedAt: new Date().toISOString(),
        },
    });
}
/**
 * Get relationships due for a nudge.
 */
export async function getRelationshipsDueForNudge(userId) {
    const patterns = await collections.relationshipPatterns()
        .find({
        userId,
        nudgeIfGapExceedsDays: { $exists: true, $gt: 0 },
    })
        .toArray();
    const now = new Date();
    return patterns.filter((p) => {
        if (!p.lastInteraction || !p.nudgeIfGapExceedsDays)
            return false;
        const daysSince = Math.ceil((now.getTime() - new Date(p.lastInteraction).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= p.nudgeIfGapExceedsDays;
    });
}
/**
 * Batch update relationship snapshots (call weekly).
 */
export async function updateAllSnapshots(userId) {
    const activeRelationships = await getActiveRelationships(userId);
    let updated = 0;
    for (const pattern of activeRelationships) {
        // Get open loops for this contact
        const loops = await collections.openLoops()
            .find({
            userId,
            contactId: pattern.contactId,
            status: 'open',
        })
            .toArray();
        // Create snapshot
        await createRelationshipSnapshot(userId, pattern.contactId, loops);
        updated++;
    }
    return updated;
}
