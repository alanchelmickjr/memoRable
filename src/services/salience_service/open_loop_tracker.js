/**
 * @file Open Loop Tracker Service
 * Tracks commitments, promises, and unresolved exchanges.
 *
 * An "open loop" is anything unresolved:
 * - Commitments made ("I'll send you that paper")
 * - Commitments received ("I'll email you next week")
 * - Questions pending answers
 * - Topics raised but not concluded
 *
 * The dance dies when loops stay open too long.
 */
import { v4 as uuidv4 } from 'uuid';
import { collections, getOrCreateContact, batchGetOrCreateContacts } from './database';
/**
 * Create open loops from extracted features.
 * Uses batch contact lookup for efficiency (1 DB call instead of N).
 */
export async function createOpenLoopsFromFeatures(features, userId, memoryId, memoryCreatedAt = new Date()) {
    const loops = [];
    // Step 1: Collect all person names that need contact lookup
    const personNames = [];
    for (const commitment of features.commitments) {
        const party = commitment.type === 'made' ? commitment.to : commitment.from;
        if (party && party !== 'unknown')
            personNames.push(party);
    }
    for (const request of features.requestsMade) {
        const isUserRequest = request.whoRequested === 'self';
        const party = isUserRequest ? request.fromWhom : request.whoRequested;
        if (party && party !== 'unknown')
            personNames.push(party);
    }
    for (const agreement of features.mutualAgreements) {
        const otherParties = agreement.parties.filter((p) => p.toLowerCase() !== 'self' && p.toLowerCase() !== 'me');
        personNames.push(...otherParties);
    }
    // Step 2: Batch lookup/create all contacts in one DB call
    const contactsMap = await batchGetOrCreateContacts(userId, personNames);
    // Step 3: Process commitments with cached contacts
    for (const commitment of features.commitments) {
        const loop = createLoopFromCommitmentSync(commitment, userId, memoryId, memoryCreatedAt, contactsMap);
        if (loop)
            loops.push(loop);
    }
    // Step 4: Process requests with cached contacts
    for (const request of features.requestsMade) {
        const loop = createLoopFromRequestSync(request, userId, memoryId, memoryCreatedAt, contactsMap);
        if (loop)
            loops.push(loop);
    }
    // Step 5: Process mutual agreements with cached contacts
    for (const agreement of features.mutualAgreements) {
        const loop = createLoopFromAgreementSync(agreement, userId, memoryId, memoryCreatedAt, contactsMap);
        if (loop)
            loops.push(loop);
    }
    // Step 6: Process questions asked (no contact lookup needed)
    for (const question of features.questionsAsked) {
        const loop = createLoopFromQuestion(question, userId, memoryId, memoryCreatedAt);
        loops.push(loop);
    }
    // Step 7: Batch insert all loops
    if (loops.length > 0) {
        await collections.openLoops().insertMany(loops);
    }
    return loops;
}
/**
 * Create an open loop from a commitment (sync version with cached contacts).
 */
function createLoopFromCommitmentSync(commitment, userId, memoryId, createdAt, contactsMap) {
    // Determine owner: who has to do something?
    let owner;
    let otherParty;
    if (commitment.type === 'made') {
        owner = 'self';
        otherParty = commitment.to;
    }
    else {
        owner = 'them';
        otherParty = commitment.from;
    }
    // Skip if no clear other party
    if (!otherParty || otherParty === 'unknown') {
        return null;
    }
    // Get contact from cache
    const contact = contactsMap.get(otherParty.toLowerCase());
    if (!contact)
        return null;
    // Parse due date
    const { dueDate, softDeadline } = parseDueDate(commitment.byWhen, commitment.dueType, createdAt);
    // Determine urgency
    const urgency = determineUrgency(dueDate, commitment.dueType);
    // Categorize the commitment
    const category = categorizeCommitment(commitment.what);
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: commitment.type === 'made' ? 'commitment_made' : 'commitment_received',
        description: commitment.what,
        category,
        owner,
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: getEscalationDays(urgency),
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a commitment (async version for standalone use).
 */
async function createLoopFromCommitment(commitment, userId, memoryId, createdAt) {
    // Determine owner: who has to do something?
    let owner;
    let otherParty;
    if (commitment.type === 'made') {
        owner = 'self';
        otherParty = commitment.to;
    }
    else {
        owner = 'them';
        otherParty = commitment.from;
    }
    // Skip if no clear other party
    if (!otherParty || otherParty === 'unknown') {
        return null;
    }
    // Get or create contact
    const contact = await getOrCreateContact(userId, otherParty);
    // Parse due date
    const { dueDate, softDeadline } = parseDueDate(commitment.byWhen, commitment.dueType, createdAt);
    // Determine urgency
    const urgency = determineUrgency(dueDate, commitment.dueType);
    // Categorize the commitment
    const category = categorizeCommitment(commitment.what);
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: commitment.type === 'made' ? 'commitment_made' : 'commitment_received',
        description: commitment.what,
        category,
        owner,
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: getEscalationDays(urgency),
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a request (sync version with cached contacts).
 */
function createLoopFromRequestSync(request, userId, memoryId, createdAt, contactsMap) {
    const isUserRequest = request.whoRequested === 'self';
    const otherParty = isUserRequest ? request.fromWhom : request.whoRequested;
    if (!otherParty || otherParty === 'unknown') {
        return null;
    }
    const contact = contactsMap.get(otherParty.toLowerCase());
    if (!contact)
        return null;
    const { dueDate, softDeadline } = parseDueDate(request.byWhen, 'implicit', createdAt);
    const urgency = determineUrgency(dueDate, 'implicit');
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: 'information_waiting',
        description: request.what,
        category: 'information',
        owner: isUserRequest ? 'them' : 'self',
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: 7,
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a request (async version for standalone use).
 */
async function createLoopFromRequest(request, userId, memoryId, createdAt) {
    // This is a request made by someone - creates an information_waiting loop
    const isUserRequest = request.whoRequested === 'self';
    const otherParty = isUserRequest ? request.fromWhom : request.whoRequested;
    if (!otherParty || otherParty === 'unknown') {
        return null;
    }
    const contact = await getOrCreateContact(userId, otherParty);
    const { dueDate, softDeadline } = parseDueDate(request.byWhen, 'implicit', createdAt);
    const urgency = determineUrgency(dueDate, 'implicit');
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: 'information_waiting',
        description: request.what,
        category: 'information',
        owner: isUserRequest ? 'them' : 'self',
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: 7,
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a mutual agreement (sync version with cached contacts).
 */
function createLoopFromAgreementSync(agreement, userId, memoryId, createdAt, contactsMap) {
    // Get the other party (not self)
    const otherParties = agreement.parties.filter((p) => p.toLowerCase() !== 'self' && p.toLowerCase() !== 'me');
    if (otherParties.length === 0) {
        return null;
    }
    const otherParty = otherParties[0];
    const contact = contactsMap.get(otherParty.toLowerCase());
    if (!contact)
        return null;
    // Parse timeframe
    const { dueDate, softDeadline } = parseTimeframe(agreement.timeframe, createdAt);
    const urgency = determineUrgency(dueDate, agreement.specificity === 'specific' ? 'explicit' : 'implicit');
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: 'mutual_agreement',
        description: agreement.what,
        category: categorizeCommitment(agreement.what),
        owner: 'mutual',
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: 14, // More lenient for mutual agreements
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a mutual agreement (async version for standalone use).
 */
async function createLoopFromAgreement(agreement, userId, memoryId, createdAt) {
    // Get the other party (not self)
    const otherParties = agreement.parties.filter((p) => p.toLowerCase() !== 'self' && p.toLowerCase() !== 'me');
    if (otherParties.length === 0) {
        return null;
    }
    const otherParty = otherParties[0];
    const contact = await getOrCreateContact(userId, otherParty);
    // Parse timeframe
    const { dueDate, softDeadline } = parseTimeframe(agreement.timeframe, createdAt);
    const urgency = determineUrgency(dueDate, agreement.specificity === 'specific' ? 'explicit' : 'implicit');
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: 'mutual_agreement',
        description: agreement.what,
        category: categorizeCommitment(agreement.what),
        owner: 'mutual',
        otherParty,
        contactId: contact._id,
        createdAt: createdAt.toISOString(),
        dueDate: dueDate?.toISOString(),
        softDeadline: softDeadline?.toISOString(),
        urgency,
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: 14, // More lenient for mutual agreements
        nextReminder: calculateNextReminder(dueDate, softDeadline, createdAt)?.toISOString(),
    };
}
/**
 * Create an open loop from a question asked.
 */
function createLoopFromQuestion(question, userId, memoryId, createdAt) {
    return {
        id: uuidv4(),
        userId,
        memoryId,
        loopType: 'question_pending',
        description: question,
        category: 'information',
        owner: 'them', // They need to answer
        createdAt: createdAt.toISOString(),
        urgency: 'low',
        status: 'open',
        remindedCount: 0,
        escalateAfterDays: 14,
    };
}
/**
 * Parse due date from various formats.
 */
function parseDueDate(byWhen, dueType, referenceDate) {
    if (!byWhen || dueType === 'none') {
        // No date - set a soft deadline of 2 weeks
        const softDeadline = new Date(referenceDate);
        softDeadline.setDate(softDeadline.getDate() + 14);
        return { softDeadline };
    }
    // Try ISO8601 first
    const isoDate = new Date(byWhen);
    if (!isNaN(isoDate.getTime())) {
        if (dueType === 'explicit') {
            return { dueDate: isoDate };
        }
        return { softDeadline: isoDate };
    }
    // Parse relative dates
    const lowerDate = byWhen.toLowerCase();
    const now = new Date(referenceDate);
    if (lowerDate.includes('today')) {
        return dueType === 'explicit' ? { dueDate: now } : { softDeadline: now };
    }
    if (lowerDate.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return dueType === 'explicit' ? { dueDate: tomorrow } : { softDeadline: tomorrow };
    }
    if (lowerDate.includes('next week')) {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return { softDeadline: nextWeek };
    }
    if (lowerDate.includes('end of week') || lowerDate.includes('by friday')) {
        const endOfWeek = new Date(now);
        const daysUntilFriday = (5 - endOfWeek.getDay() + 7) % 7;
        endOfWeek.setDate(endOfWeek.getDate() + (daysUntilFriday || 7));
        return { softDeadline: endOfWeek };
    }
    if (lowerDate.includes('next month')) {
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return { softDeadline: nextMonth };
    }
    // Day of week parsing
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
        if (lowerDate.includes(days[i])) {
            const targetDay = new Date(now);
            const currentDay = targetDay.getDay();
            let daysToAdd = i - currentDay;
            if (daysToAdd <= 0)
                daysToAdd += 7; // Next week's day
            targetDay.setDate(targetDay.getDate() + daysToAdd);
            return dueType === 'explicit' ? { dueDate: targetDay } : { softDeadline: targetDay };
        }
    }
    // Default: soft deadline 2 weeks out
    const softDeadline = new Date(now);
    softDeadline.setDate(softDeadline.getDate() + 14);
    return { softDeadline };
}
/**
 * Parse vague timeframe into dates.
 */
function parseTimeframe(timeframe, referenceDate) {
    if (!timeframe) {
        const softDeadline = new Date(referenceDate);
        softDeadline.setDate(softDeadline.getDate() + 30);
        return { softDeadline };
    }
    return parseDueDate(timeframe, 'implicit', referenceDate);
}
/**
 * Determine urgency based on due date.
 */
function determineUrgency(dueDate, dueType) {
    if (!dueDate)
        return 'low';
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 1)
        return 'urgent';
    if (daysUntilDue <= 3)
        return 'high';
    if (daysUntilDue <= 7)
        return 'normal';
    return 'low';
}
/**
 * Get escalation days based on urgency.
 */
function getEscalationDays(urgency) {
    switch (urgency) {
        case 'urgent': return 1;
        case 'high': return 3;
        case 'normal': return 7;
        case 'low': return 14;
    }
}
/**
 * Calculate next reminder date.
 */
function calculateNextReminder(dueDate, softDeadline, createdAt) {
    const targetDate = dueDate || softDeadline;
    if (!targetDate)
        return undefined;
    const now = createdAt || new Date();
    const daysUntilDue = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    // Remind at halfway point, minimum 1 day
    const remindInDays = Math.max(1, Math.floor(daysUntilDue / 2));
    const reminderDate = new Date(now);
    reminderDate.setDate(reminderDate.getDate() + remindInDays);
    return reminderDate;
}
/**
 * Categorize a commitment based on its description.
 */
function categorizeCommitment(description) {
    const lower = description.toLowerCase();
    if (lower.includes('send') || lower.includes('deliver') || lower.includes('provide')) {
        return 'deliverable';
    }
    if (lower.includes('meet') || lower.includes('call') || lower.includes('coffee') || lower.includes('lunch')) {
        return 'meeting';
    }
    if (lower.includes('introduce') || lower.includes('connect')) {
        return 'introduction';
    }
    if (lower.includes('help') || lower.includes('assist') || lower.includes('favor')) {
        return 'favor';
    }
    if (lower.includes('pay') || lower.includes('money') || lower.includes('reimburse')) {
        return 'payment';
    }
    if (lower.includes('let you know') || lower.includes('update') || lower.includes('tell')) {
        return 'information';
    }
    if (lower.includes('decide') || lower.includes('choose') || lower.includes('pick')) {
        return 'decision';
    }
    return 'other';
}
/**
 * Get open loops for a user.
 * Returns loops with computed `isOverdue` flag (original status preserved).
 */
export async function getOpenLoops(userId, options = {}) {
    const query = { userId };
    if (options.contactId)
        query.contactId = options.contactId;
    if (options.contactName)
        query.otherParty = new RegExp(`^${options.contactName}$`, 'i');
    if (options.owner)
        query.owner = options.owner;
    if (options.status)
        query.status = options.status;
    if (options.loopType)
        query.loopType = options.loopType;
    // Default to open loops only
    if (!options.status) {
        query.status = 'open';
    }
    const loops = await collections.openLoops().find(query).sort({ dueDate: 1 }).toArray();
    const now = new Date();
    // Add computed isOverdue flag without mutating original status
    // This preserves DB consistency while giving callers the info they need
    return loops.map((loop) => ({
        ...loop,
        isOverdue: !!(loop.dueDate && new Date(loop.dueDate) < now && loop.status === 'open'),
    }));
}
/**
 * Close an open loop.
 */
export async function closeLoop(loopId, completedMemoryId) {
    await collections.openLoops().updateOne({ id: loopId }, {
        $set: {
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedMemoryId,
        },
    });
}
/**
 * Check if a new memory closes any existing open loops.
 * IMPORTANT: Excludes loops created from the same memory to prevent self-closing race condition.
 */
export async function checkLoopClosures(newMemoryText, features, userId, memoryId, llmClient) {
    const closedLoopIds = [];
    // Get open loops involving mentioned people
    for (const person of features.peopleMentioned) {
        const openLoops = await getOpenLoops(userId, {
            contactName: person,
            status: 'open',
        });
        for (const loop of openLoops) {
            // CRITICAL: Skip loops created from this same memory to prevent self-closing
            // This fixes a race condition where a loop could be closed by the very memory that created it
            if (loop.memoryId === memoryId) {
                continue;
            }
            // Quick heuristic check first
            if (!quickClosureCheck(newMemoryText, loop.description)) {
                continue;
            }
            // LLM confirmation for ambiguous cases
            if (llmClient) {
                const result = await checkClosureWithLLM(newMemoryText, loop.description, llmClient);
                if (result.closed && result.confidence > 0.7) {
                    await closeLoop(loop.id, memoryId);
                    closedLoopIds.push(loop.id);
                }
            }
            else {
                // Without LLM, use heuristic threshold
                if (heuristicClosureConfidence(newMemoryText, loop.description) > 0.8) {
                    await closeLoop(loop.id, memoryId);
                    closedLoopIds.push(loop.id);
                }
            }
        }
    }
    return closedLoopIds;
}
/**
 * Quick heuristic check for potential loop closure.
 */
function quickClosureCheck(memoryText, loopDescription) {
    // Extract keywords from loop description
    const keywords = extractKeywords(loopDescription);
    const lowerMemory = memoryText.toLowerCase();
    // Check if any keywords appear in the memory
    return keywords.some((kw) => lowerMemory.includes(kw));
}
/**
 * Extract keywords from text.
 */
function extractKeywords(text) {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'that',
        'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
        'their', 'send', 'tell', 'let', 'know', 'get', 'give', 'take', 'make'
    ]);
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
}
/**
 * Heuristic closure confidence calculation.
 */
function heuristicClosureConfidence(memoryText, loopDescription) {
    const loopKeywords = extractKeywords(loopDescription);
    const memoryLower = memoryText.toLowerCase();
    if (loopKeywords.length === 0)
        return 0;
    // Count matching keywords
    const matches = loopKeywords.filter((kw) => memoryLower.includes(kw)).length;
    const matchRatio = matches / loopKeywords.length;
    // Check for completion signals
    const completionSignals = [
        'sent', 'done', 'finished', 'completed', 'delivered', 'shared',
        'received', 'got', 'thanks', 'thank you', 'appreciated',
        'here is', 'here\'s', 'attached', 'forwarded'
    ];
    const hasCompletionSignal = completionSignals.some((signal) => memoryLower.includes(signal));
    // Base confidence on keyword match + completion signal bonus
    let confidence = matchRatio * 0.7;
    if (hasCompletionSignal)
        confidence += 0.3;
    return Math.min(1, confidence);
}
/** Timeout for LLM calls in milliseconds (prevents indefinite stalls) */
const LLM_TIMEOUT_MS = 10000; // 10 seconds
/**
 * Wrap a promise with a timeout.
 * Prevents indefinite stalls from slow/stuck LLM calls.
 */
function withTimeout(promise, timeoutMs, fallback) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            setTimeout(() => {
                console.warn(`[OpenLoopTracker] LLM call timed out after ${timeoutMs}ms`);
                resolve(fallback);
            }, timeoutMs);
        }),
    ]);
}
/**
 * Check loop closure with LLM.
 * Includes timeout protection to prevent pipeline stalls.
 */
async function checkClosureWithLLM(memoryText, loopDescription, llmClient) {
    const prompt = `Open loop: ${loopDescription}
New memory: ${memoryText}

Does this memory indicate the open loop is closed/completed?
Return JSON only: {"closed": true/false, "confidence": 0-1, "reasoning": "brief explanation"}`;
    const fallbackResponse = { closed: false, confidence: 0 };
    try {
        // Wrap LLM call with timeout to prevent indefinite stalls
        const response = await withTimeout(llmClient.complete(prompt, {
            temperature: 0.1,
            maxTokens: 200,
        }), LLM_TIMEOUT_MS, '' // Empty string triggers fallback in parsing
        );
        // Handle timeout (empty response)
        if (!response) {
            return fallbackResponse;
        }
        // Clean and parse response
        let cleaned = response.trim();
        if (cleaned.startsWith('```json'))
            cleaned = cleaned.slice(7);
        if (cleaned.startsWith('```'))
            cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```'))
            cleaned = cleaned.slice(0, -3);
        return JSON.parse(cleaned.trim());
    }
    catch (error) {
        console.error('[OpenLoopTracker] Error checking closure with LLM:', error);
        return fallbackResponse;
    }
}
/**
 * Get overdue loops for notification.
 */
export async function getOverdueLoops(userId) {
    const now = new Date();
    return collections.openLoops()
        .find({
        userId,
        status: 'open',
        dueDate: { $lt: now.toISOString() },
    })
        .sort({ dueDate: 1 })
        .toArray();
}
/**
 * Get loops due soon for proactive surfacing.
 */
export async function getUpcomingDueLoops(userId, daysAhead = 3) {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + daysAhead);
    return collections.openLoops()
        .find({
        userId,
        status: 'open',
        $or: [
            { dueDate: { $gte: now.toISOString(), $lte: future.toISOString() } },
            { softDeadline: { $gte: now.toISOString(), $lte: future.toISOString() } },
        ],
    })
        .sort({ dueDate: 1, softDeadline: 1 })
        .toArray();
}
/**
 * Update reminder sent status.
 */
export async function markReminderSent(loopId) {
    const loop = await collections.openLoops().findOne({ id: loopId });
    if (!loop)
        return;
    const nextReminder = new Date();
    nextReminder.setDate(nextReminder.getDate() + Math.max(1, loop.escalateAfterDays / 2));
    await collections.openLoops().updateOne({ id: loopId }, {
        $set: {
            lastRemindedAt: new Date().toISOString(),
            nextReminder: nextReminder.toISOString(),
        },
        $inc: { remindedCount: 1 },
    });
}
/**
 * Abandon an open loop (not completed, just no longer relevant).
 */
export async function abandonLoop(loopId, reason) {
    await collections.openLoops().updateOne({ id: loopId }, {
        $set: {
            status: 'abandoned',
            completedAt: new Date().toISOString(),
            metadata: reason ? { abandonReason: reason } : undefined,
        },
    });
}
