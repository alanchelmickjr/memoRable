/**
 * Anticipation Service - Predictive Memory Surfacing
 *
 * Based on legacy research (confidenceService.js) with 21-day pattern formation:
 * - Patterns require 21 days of data before predictions become reliable
 * - Confidence ramps from 0.4 → 0.6 → 0.8 as occurrences accumulate
 * - Post-21 days, confidence = consistency (occurrences / days)
 * - Attention decay with exponential falloff
 *
 * Integrates with:
 * - Context frames (location, people, activity)
 * - Calendar events (recurring patterns)
 * - Memory access logs (what got used vs ignored)
 * - Salience scores (what mattered)
 */
import { ObjectId } from 'mongodb';
// ============================================================================
// Constants (from legacy research)
// ============================================================================
const THRESHOLDS = {
    quickResponse: 0.4, // Default/minimum confidence
    patternFormation: 0.6, // Mid-level confidence during formation
    habitConfirmation: 0.8, // High confidence after formation
    predictionReady: 0.7, // Minimum to surface predictions
};
const WINDOWS = {
    patternFormation: 21 * 24 * 60 * 60 * 1000, // 21 days in ms
    attention: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanup: 24 * 60 * 60 * 1000, // 1 day
    preBriefing: 15 * 60 * 1000, // 15 minutes before event
};
const REWARD_WEIGHTS = {
    used: 1.0,
    ignored: -0.1,
    dismissed: -0.5,
};
// ============================================================================
// Pattern Learning
// ============================================================================
/**
 * Calculate pattern confidence based on 21-day formation rule
 */
function calculatePatternConfidence(pattern) {
    const daysSinceStart = (Date.now() - new Date(pattern.firstSeen).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceStart <= 21) {
        // During 21-day formation period - gradual ramp based on occurrences
        const formationProgress = Math.min(1, pattern.occurrences / 21);
        return THRESHOLDS.patternFormation +
            formationProgress * (THRESHOLDS.habitConfirmation - THRESHOLDS.patternFormation);
    }
    // After 21 days, confidence based on consistency
    const consistency = pattern.occurrences / daysSinceStart;
    return Math.min(1, consistency * THRESHOLDS.habitConfirmation);
}
/**
 * Calculate reward signal from feedback
 */
function calculateRewardSignal(pattern) {
    const total = pattern.timesUsed + pattern.timesIgnored + pattern.timesDismissed;
    if (total === 0)
        return 0;
    return ((pattern.timesUsed * REWARD_WEIGHTS.used) +
        (pattern.timesIgnored * REWARD_WEIGHTS.ignored) +
        (pattern.timesDismissed * REWARD_WEIGHTS.dismissed)) / total;
}
/**
 * Create feature signature for pattern matching
 */
function createFeatureSignature(features) {
    const parts = [
        features.timeOfDay,
        features.dayOfWeek.toString(),
        features.location || '_',
        features.activity || '_',
        features.calendarEventType || '_',
        features.projectContext || '_',
    ];
    return parts.join('|');
}
/**
 * Match features with tolerance for partial matches
 */
function featuresMatch(a, b, strictness = 0.7) {
    let matches = 0;
    let total = 0;
    // Time of day (required)
    total++;
    if (a.timeOfDay === b.timeOfDay)
        matches++;
    // Day of week (required)
    total++;
    if (a.dayOfWeek === b.dayOfWeek)
        matches++;
    // Location (optional)
    if (a.location && b.location) {
        total++;
        if (a.location.toLowerCase() === b.location.toLowerCase())
            matches++;
    }
    // Activity (optional)
    if (a.activity && b.activity) {
        total++;
        if (a.activity.toLowerCase() === b.activity.toLowerCase())
            matches++;
    }
    // People overlap
    if (a.people?.length && b.people?.length) {
        total++;
        const overlap = a.people.filter(p => b.people.some(bp => bp.toLowerCase() === p.toLowerCase())).length;
        if (overlap > 0)
            matches++;
    }
    // Calendar event type
    if (a.calendarEventType && b.calendarEventType) {
        total++;
        if (a.calendarEventType === b.calendarEventType)
            matches++;
    }
    return (matches / total) >= strictness;
}
// ============================================================================
// Main Service Functions
// ============================================================================
let db = null;
export function initAnticipationService(database) {
    db = database;
}
/**
 * Record a context observation for pattern learning
 */
export async function observeContext(userId, features, accessedMemories, mentionedPeople, discussedTopics) {
    if (!db)
        throw new Error('Anticipation service not initialized');
    const now = new Date().toISOString();
    const signature = createFeatureSignature(features);
    // Find existing pattern or create new
    const existing = await db.collection('learned_patterns').findOne({
        userId,
        'features.timeOfDay': features.timeOfDay,
        'features.dayOfWeek': features.dayOfWeek,
        'features.location': features.location || { $exists: false },
        'features.activity': features.activity || { $exists: false },
    });
    if (existing) {
        // Update existing pattern
        await db.collection('learned_patterns').updateOne({ _id: existing._id }, {
            $inc: { occurrences: 1 },
            $set: { lastSeen: now },
            $addToSet: {
                relevantMemoryIds: { $each: accessedMemories },
                relevantPeople: { $each: mentionedPeople },
                relevantTopics: { $each: discussedTopics },
            },
        });
        // Recalculate confidence
        const pattern = await db.collection('learned_patterns').findOne({ _id: existing._id });
        const newConfidence = calculatePatternConfidence(pattern);
        const daysSinceStart = (Date.now() - new Date(pattern.firstSeen).getTime()) / (24 * 60 * 60 * 1000);
        await db.collection('learned_patterns').updateOne({ _id: existing._id }, {
            $set: {
                confidence: newConfidence,
                isFormed: daysSinceStart >= 21 && pattern.occurrences >= 7, // At least weekly occurrence
            },
        });
    }
    else {
        // Create new pattern
        const newPattern = {
            patternId: new ObjectId().toString(),
            userId,
            features,
            relevantMemoryIds: accessedMemories,
            relevantPeople: mentionedPeople,
            relevantTopics: discussedTopics,
            occurrences: 1,
            firstSeen: now,
            lastSeen: now,
            confidence: THRESHOLDS.quickResponse,
            isFormed: false,
            timesUsed: 0,
            timesIgnored: 0,
            timesDismissed: 0,
            rewardSignal: 0,
        };
        await db.collection('learned_patterns').insertOne(newPattern);
    }
}
/**
 * Record feedback on surfaced predictions (RL signal for pattern learning)
 */
export async function recordPatternFeedback(userId, feedback) {
    if (!db)
        throw new Error('Anticipation service not initialized');
    // Store raw feedback
    await db.collection('anticipation_feedback').insertOne({
        ...feedback,
        userId,
    });
    // Update pattern statistics
    const updateField = feedback.action === 'used'
        ? 'timesUsed'
        : feedback.action === 'dismissed'
            ? 'timesDismissed'
            : 'timesIgnored';
    await db.collection('learned_patterns').updateOne({ patternId: feedback.patternId }, { $inc: { [updateField]: 1 } });
    // Recalculate reward signal
    const pattern = await db.collection('learned_patterns').findOne({
        patternId: feedback.patternId
    });
    if (pattern) {
        const newReward = calculateRewardSignal(pattern);
        await db.collection('learned_patterns').updateOne({ patternId: feedback.patternId }, { $set: { rewardSignal: newReward } });
    }
}
/**
 * Get anticipated context for upcoming time window
 */
export async function getAnticipatedContext(userId, upcomingCalendar, lookAheadMinutes = 60) {
    if (!db)
        throw new Error('Anticipation service not initialized');
    const anticipations = [];
    const now = new Date();
    const lookAheadEnd = new Date(now.getTime() + lookAheadMinutes * 60 * 1000);
    // Get formed patterns for this user
    const patterns = await db.collection('learned_patterns').find({
        userId,
        isFormed: true,
        confidence: { $gte: THRESHOLDS.predictionReady },
        rewardSignal: { $gte: -0.3 }, // Skip patterns that are consistently wrong
    }).toArray();
    // Check calendar events
    for (const event of upcomingCalendar) {
        const eventStart = new Date(event.startTime);
        if (eventStart <= lookAheadEnd) {
            // Find patterns matching this calendar context
            const eventFeatures = {
                timeOfDay: getTimeOfDay(eventStart),
                dayOfWeek: eventStart.getDay(),
                location: event.location,
                activity: 'meeting',
                people: event.attendees,
                calendarEventType: event.recurring ? 'recurring' : 'one-time',
            };
            const matchingPatterns = patterns.filter(p => featuresMatch(p.features, eventFeatures, 0.6));
            if (matchingPatterns.length > 0) {
                // Aggregate suggestions from matching patterns
                const bestPattern = matchingPatterns.reduce((a, b) => a.confidence * (1 + a.rewardSignal) > b.confidence * (1 + b.rewardSignal) ? a : b);
                anticipations.push({
                    predictedAt: now.toISOString(),
                    triggerTime: new Date(eventStart.getTime() - WINDOWS.preBriefing).toISOString(),
                    confidence: bestPattern.confidence,
                    features: eventFeatures,
                    suggestedBriefings: event.attendees || bestPattern.relevantPeople,
                    suggestedMemories: bestPattern.relevantMemoryIds.slice(0, 5).map(id => ({
                        memoryId: id,
                        reason: `Relevant in similar past contexts`,
                        confidence: bestPattern.confidence,
                    })),
                    suggestedTopics: bestPattern.relevantTopics.slice(0, 5),
                    basedOn: {
                        calendarEvent: event,
                        learnedPattern: bestPattern.patternId,
                    },
                });
            }
            else if (event.attendees?.length) {
                // No learned pattern, but we have attendees - suggest briefings
                anticipations.push({
                    predictedAt: now.toISOString(),
                    triggerTime: new Date(eventStart.getTime() - WINDOWS.preBriefing).toISOString(),
                    confidence: THRESHOLDS.quickResponse,
                    features: eventFeatures,
                    suggestedBriefings: event.attendees,
                    suggestedMemories: [],
                    suggestedTopics: [],
                    basedOn: {
                        calendarEvent: event,
                    },
                });
            }
        }
    }
    // Check time-based patterns (no calendar event needed)
    const currentFeatures = {
        timeOfDay: getTimeOfDay(now),
        dayOfWeek: now.getDay(),
    };
    const timeBasedPatterns = patterns.filter(p => p.features.timeOfDay === currentFeatures.timeOfDay &&
        p.features.dayOfWeek === currentFeatures.dayOfWeek &&
        !p.features.calendarEventType // Not tied to calendar
    );
    for (const pattern of timeBasedPatterns) {
        anticipations.push({
            predictedAt: now.toISOString(),
            triggerTime: now.toISOString(),
            confidence: pattern.confidence,
            features: pattern.features,
            suggestedBriefings: pattern.relevantPeople.slice(0, 3),
            suggestedMemories: pattern.relevantMemoryIds.slice(0, 5).map(id => ({
                memoryId: id,
                reason: `You typically access this ${pattern.features.timeOfDay} on ${getDayName(pattern.features.dayOfWeek)}s`,
                confidence: pattern.confidence,
            })),
            suggestedTopics: pattern.relevantTopics.slice(0, 5),
            basedOn: {
                learnedPattern: pattern.patternId,
                recurringBehavior: `${pattern.features.timeOfDay} ${getDayName(pattern.features.dayOfWeek)} routine`,
            },
        });
    }
    // Sort by trigger time, then confidence
    return anticipations.sort((a, b) => {
        const timeDiff = new Date(a.triggerTime).getTime() - new Date(b.triggerTime).getTime();
        if (timeDiff !== 0)
            return timeDiff;
        return b.confidence - a.confidence;
    });
}
/**
 * Get pattern learning statistics
 */
export async function getPatternStats(userId) {
    if (!db)
        throw new Error('Anticipation service not initialized');
    const patterns = await db.collection('learned_patterns').find({ userId }).toArray();
    if (patterns.length === 0) {
        return {
            totalPatterns: 0,
            formedPatterns: 0,
            averageConfidence: 0,
            dataCollectionDays: 0,
            readyForPrediction: false,
        };
    }
    const formedPatterns = patterns.filter(p => p.isFormed);
    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
    // Calculate days since first observation
    const firstSeen = patterns.reduce((min, p) => {
        const date = new Date(p.firstSeen).getTime();
        return date < min ? date : min;
    }, Date.now());
    const dataCollectionDays = Math.floor((Date.now() - firstSeen) / (24 * 60 * 60 * 1000));
    return {
        totalPatterns: patterns.length,
        formedPatterns: formedPatterns.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        dataCollectionDays,
        readyForPrediction: dataCollectionDays >= 21 && formedPatterns.length > 0,
    };
}
/**
 * Generate morning briefing based on anticipated day
 */
export async function generateDayAnticipation(userId, calendar) {
    if (!db)
        throw new Error('Anticipation service not initialized');
    const stats = await getPatternStats(userId);
    const anticipated = await getAnticipatedContext(userId, calendar, 12 * 60); // 12 hours ahead
    const now = new Date();
    const dayName = getDayName(now.getDay());
    // Generate insights from patterns
    const insights = [];
    if (!stats.readyForPrediction) {
        insights.push(`Still learning your patterns (${stats.dataCollectionDays}/21 days). Predictions improve with more data.`);
    }
    else {
        insights.push(`Tracking ${stats.formedPatterns} established patterns with ${Math.round(stats.averageConfidence * 100)}% average confidence.`);
    }
    // High-confidence patterns for today
    const todayPatterns = anticipated.filter(a => a.confidence >= THRESHOLDS.patternFormation);
    if (todayPatterns.length > 0) {
        insights.push(`${todayPatterns.length} predicted context switches today based on your patterns.`);
    }
    // Meeting-heavy day?
    const meetingCount = calendar.length;
    if (meetingCount > 5) {
        insights.push(`Heavy meeting day (${meetingCount} events). Consider blocking focus time.`);
    }
    return {
        greeting: `Good ${getTimeOfDay(now)}, ready for ${dayName}?`,
        dayOutlook: generateDayOutlook(calendar, anticipated),
        anticipatedContexts: anticipated,
        patternInsights: insights,
    };
}
// ============================================================================
// Helpers
// ============================================================================
function getTimeOfDay(date) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12)
        return 'morning';
    if (hour >= 12 && hour < 17)
        return 'afternoon';
    if (hour >= 17 && hour < 21)
        return 'evening';
    return 'night';
}
function getDayName(day) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
}
function generateDayOutlook(calendar, anticipated) {
    const parts = [];
    if (calendar.length === 0) {
        parts.push('Clear calendar today.');
    }
    else {
        parts.push(`${calendar.length} scheduled event${calendar.length > 1 ? 's' : ''}.`);
        // First event
        const first = calendar[0];
        const startTime = new Date(first.startTime);
        parts.push(`First up: ${first.title} at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    }
    // High-confidence predictions
    const highConfidence = anticipated.filter(a => a.confidence >= THRESHOLDS.habitConfirmation);
    if (highConfidence.length > 0) {
        const firstHigh = highConfidence[0];
        if (firstHigh.suggestedBriefings.length > 0) {
            parts.push(`You'll likely need context on ${firstHigh.suggestedBriefings.slice(0, 2).join(' and ')}.`);
        }
    }
    return parts.join(' ');
}
// ============================================================================
// Exports
// ============================================================================
export { THRESHOLDS, WINDOWS, calculatePatternConfidence, calculateRewardSignal, getTimeOfDay, getDayName, };
