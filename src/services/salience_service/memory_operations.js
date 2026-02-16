/**
 * @file Memory Operations - Forget, Reassociate, Export
 *
 * Operations for managing memory lifecycle:
 * - Forget: Soft delete, suppress, or hard delete memories
 * - Reassociate: Change how memories are linked (people, projects, topics)
 * - Export/Import: Move memories between contexts
 *
 * Philosophy:
 * - Forgetting is a feature, not a bug
 * - Memories should be portable
 * - Users control their data
 */
import { collections } from './database';
import { recordMemoryAccess } from './pattern_detector';
/**
 * Forget a specific memory.
 *
 * Modes:
 * - suppress: Memory won't surface in any context, but data preserved
 * - archive: Memory hidden from default searches, can be explicitly retrieved
 * - delete: Soft delete, data removed after retention period
 */
export async function forgetMemory(userId, memoryId, options) {
    try {
        // Get current memory state
        const memory = await collections.memories().findOne({
            memoryId,
            userId,
        });
        if (!memory) {
            return {
                success: false,
                memoryId,
                previousState: 'active',
                newState: 'active',
                error: 'Memory not found',
            };
        }
        const previousState = memory.state || 'active';
        const newState = options.mode === 'suppress' ? 'suppressed' :
            options.mode === 'archive' ? 'archived' : 'deleted';
        // Update memory state
        await collections.memories().updateOne({ memoryId, userId }, {
            $set: {
                state: newState,
                stateChangedAt: new Date().toISOString(),
                stateChangeReason: options.reason,
                // If deleting, set expiration for permanent removal
                ...(options.mode === 'delete' ? {
                    deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                } : {}),
            },
        });
        let loopsRemoved = 0;
        let eventsRemoved = 0;
        // Cascade to open loops if requested
        if (options.cascadeLoops) {
            const loopResult = await collections.openLoops().updateMany({ userId, memoryId }, { $set: { status: 'abandoned', abandonReason: 'source_memory_forgotten' } });
            loopsRemoved = loopResult.modifiedCount;
        }
        // Cascade to timeline events if requested
        if (options.cascadeTimeline) {
            const eventResult = await collections.personTimelineEvents().deleteMany({
                userId,
                memoryId,
            });
            eventsRemoved = eventResult.deletedCount;
        }
        // Log the state change
        await logStateChange({
            memoryId,
            fromState: previousState,
            toState: newState,
            reason: options.reason,
            changedAt: new Date().toISOString(),
            changedBy: 'user',
        }, userId);
        return {
            success: true,
            memoryId,
            previousState,
            newState,
            loopsRemoved,
            eventsRemoved,
        };
    }
    catch (error) {
        console.error('[MemoryOps] Error forgetting memory:', error);
        return {
            success: false,
            memoryId,
            previousState: 'active',
            newState: 'active',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Forget all memories involving a specific person.
 */
export async function forgetPerson(userId, personName, options) {
    const newState = options.mode === 'suppress' ? 'suppressed' :
        options.mode === 'archive' ? 'archived' : 'deleted';
    // Find and update memories mentioning this person
    const memoryResult = await collections.memories().updateMany({
        userId,
        'extractedFeatures.peopleMentioned': {
            $regex: new RegExp(`^${escapeRegex(personName)}$`, 'i'),
        },
    }, {
        $set: {
            state: newState,
            stateChangedAt: new Date().toISOString(),
            stateChangeReason: options.reason || `Forgot person: ${personName}`,
        },
    });
    let loopsForgotten = 0;
    let eventsForgotten = 0;
    // Forget loops involving this person
    if (options.alsoForgetLoops) {
        const loopResult = await collections.openLoops().updateMany({
            userId,
            otherParty: { $regex: new RegExp(`^${escapeRegex(personName)}$`, 'i') },
        }, { $set: { status: 'abandoned', abandonReason: 'person_forgotten' } });
        loopsForgotten = loopResult.modifiedCount;
    }
    // Forget timeline events for this person
    if (options.alsoForgetEvents) {
        const eventResult = await collections.personTimelineEvents().deleteMany({
            userId,
            contactName: { $regex: new RegExp(`^${escapeRegex(personName)}$`, 'i') },
        });
        eventsForgotten = eventResult.deletedCount;
    }
    return {
        memoriesForgotten: memoryResult.modifiedCount,
        loopsForgotten,
        eventsForgotten,
    };
}
/**
 * Restore a forgotten memory.
 */
export async function restoreMemory(userId, memoryId) {
    try {
        const memory = await collections.memories().findOne({ memoryId, userId });
        if (!memory) {
            return { success: false, error: 'Memory not found' };
        }
        const previousState = memory.state;
        if (previousState === 'active') {
            return { success: true, previousState };
        }
        await collections.memories().updateOne({ memoryId, userId }, {
            $set: { state: 'active', stateChangedAt: new Date().toISOString() },
            $unset: { deleteAfter: '' },
        });
        await logStateChange({
            memoryId,
            fromState: previousState,
            toState: 'active',
            reason: 'User restored',
            changedAt: new Date().toISOString(),
            changedBy: 'user',
        }, userId);
        return { success: true, previousState };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Reassociate a memory - change how it's linked.
 */
export async function reassociateMemory(userId, memoryId, options) {
    try {
        const memory = await collections.memories().findOne({ memoryId, userId });
        if (!memory) {
            return { success: false, changes: [], error: 'Memory not found' };
        }
        const changes = [];
        const updateOps = { $set: {}, $addToSet: {}, $pull: {} };
        let hasUpdates = false;
        const features = memory.extractedFeatures || {};
        // Handle people changes
        if (options.addPeople?.length) {
            const currentPeople = features.peopleMentioned || [];
            const newPeople = options.addPeople.filter((p) => !currentPeople.some((cp) => cp.toLowerCase() === p.toLowerCase()));
            if (newPeople.length > 0) {
                updateOps.$addToSet['extractedFeatures.peopleMentioned'] = { $each: newPeople };
                changes.push(`Added people: ${newPeople.join(', ')}`);
                hasUpdates = true;
            }
        }
        if (options.removePeople?.length) {
            updateOps.$pull['extractedFeatures.peopleMentioned'] = {
                $in: options.removePeople.map(p => new RegExp(`^${escapeRegex(p)}$`, 'i')),
            };
            changes.push(`Removed people: ${options.removePeople.join(', ')}`);
            hasUpdates = true;
        }
        // Handle topic changes
        if (options.addTopics?.length) {
            updateOps.$addToSet['extractedFeatures.topics'] = { $each: options.addTopics };
            changes.push(`Added topics: ${options.addTopics.join(', ')}`);
            hasUpdates = true;
        }
        if (options.removeTopics?.length) {
            updateOps.$pull['extractedFeatures.topics'] = { $in: options.removeTopics };
            changes.push(`Removed topics: ${options.removeTopics.join(', ')}`);
            hasUpdates = true;
        }
        // Handle project/context
        if (options.setProject !== undefined) {
            updateOps.$set.project = options.setProject;
            changes.push(options.setProject ? `Set project: ${options.setProject}` : 'Cleared project');
            hasUpdates = true;
        }
        // Handle tags
        if (options.addTags?.length) {
            updateOps.$addToSet.tags = { $each: options.addTags };
            changes.push(`Added tags: ${options.addTags.join(', ')}`);
            hasUpdates = true;
        }
        if (options.removeTags?.length) {
            updateOps.$pull.tags = { $in: options.removeTags };
            changes.push(`Removed tags: ${options.removeTags.join(', ')}`);
            hasUpdates = true;
        }
        if (!hasUpdates) {
            return { success: true, changes: ['No changes needed'] };
        }
        // Clean up empty operators
        if (Object.keys(updateOps.$set).length === 0)
            delete updateOps.$set;
        if (Object.keys(updateOps.$addToSet).length === 0)
            delete updateOps.$addToSet;
        if (Object.keys(updateOps.$pull).length === 0)
            delete updateOps.$pull;
        // Add modification timestamp
        updateOps.$set = updateOps.$set || {};
        updateOps.$set.lastModifiedAt = new Date().toISOString();
        updateOps.$set.lastModifiedReason = 'reassociation';
        await collections.memories().updateOne({ memoryId, userId }, updateOps);
        return { success: true, changes };
    }
    catch (error) {
        console.error('[MemoryOps] Error reassociating memory:', error);
        return {
            success: false,
            changes: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Merge two memories (when you realize they're about the same thing).
 */
export async function mergeMemories(userId, primaryMemoryId, secondaryMemoryId, options = {}) {
    try {
        const [primary, secondary] = await Promise.all([
            collections.memories().findOne({ memoryId: primaryMemoryId, userId }),
            collections.memories().findOne({ memoryId: secondaryMemoryId, userId }),
        ]);
        if (!primary || !secondary) {
            return { success: false, error: 'One or both memories not found' };
        }
        // Merge extracted features
        const primaryFeatures = primary.extractedFeatures || {};
        const secondaryFeatures = secondary.extractedFeatures || {};
        const mergedFeatures = {
            peopleMentioned: [...new Set([
                    ...(primaryFeatures.peopleMentioned || []),
                    ...(secondaryFeatures.peopleMentioned || []),
                ])],
            topics: [...new Set([
                    ...(primaryFeatures.topics || []),
                    ...(secondaryFeatures.topics || []),
                ])],
            emotionalKeywords: [...new Set([
                    ...(primaryFeatures.emotionalKeywords || []),
                    ...(secondaryFeatures.emotionalKeywords || []),
                ])],
        };
        // Optionally merge text
        const mergedText = options.keepBothTexts
            ? `${primary.text}\n\n---\n\n${secondary.text}`
            : primary.text;
        // Take higher salience score
        const mergedSalience = Math.max(primary.salienceScore || 0, secondary.salienceScore || 0);
        // Update primary with merged data
        await collections.memories().updateOne({ memoryId: primaryMemoryId, userId }, {
            $set: {
                text: mergedText,
                extractedFeatures: { ...primaryFeatures, ...mergedFeatures },
                salienceScore: mergedSalience,
                mergedFrom: [...(primary.mergedFrom || []), secondaryMemoryId],
                lastModifiedAt: new Date().toISOString(),
                lastModifiedReason: 'merge',
            },
        });
        // Handle secondary memory
        if (options.deleteSecondary) {
            await collections.memories().updateOne({ memoryId: secondaryMemoryId, userId }, {
                $set: {
                    state: 'deleted',
                    mergedInto: primaryMemoryId,
                    stateChangedAt: new Date().toISOString(),
                },
            });
        }
        return { success: true, mergedMemoryId: primaryMemoryId };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Export memories for portability.
 */
export async function exportMemories(userId, options = {}) {
    const query = { userId };
    if (options.activeOnly !== false) {
        query.$or = [
            { state: 'active' },
            { state: { $exists: false } },
        ];
    }
    if (options.people?.length) {
        query['extractedFeatures.peopleMentioned'] = {
            $in: options.people.map(p => new RegExp(escapeRegex(p), 'i')),
        };
    }
    if (options.topics?.length) {
        query['extractedFeatures.topics'] = { $in: options.topics };
    }
    if (options.project) {
        query.project = options.project;
    }
    if (options.fromDate || options.toDate) {
        query.createdAt = {};
        if (options.fromDate)
            query.createdAt.$gte = options.fromDate;
        if (options.toDate)
            query.createdAt.$lte = options.toDate;
    }
    const memories = await collections.memories().find(query).toArray();
    const memoryIds = memories.map((m) => m.memoryId);
    // Get related loops
    let loopsMap = new Map();
    if (options.includeLoops) {
        const loops = await collections.openLoops().find({
            userId,
            memoryId: { $in: memoryIds },
        }).toArray();
        for (const loop of loops) {
            const existing = loopsMap.get(loop.memoryId) || [];
            existing.push(loop);
            loopsMap.set(loop.memoryId, existing);
        }
    }
    // Get related timeline events
    let eventsMap = new Map();
    if (options.includeTimeline) {
        const events = await collections.personTimelineEvents().find({
            userId,
            memoryId: { $in: memoryIds },
        }).toArray();
        for (const event of events) {
            if (event.memoryId) {
                const existing = eventsMap.get(event.memoryId) || [];
                existing.push(event);
                eventsMap.set(event.memoryId, existing);
            }
        }
    }
    return memories.map(m => ({
        id: m.memoryId,
        text: m.text,
        createdAt: m.createdAt,
        salienceScore: m.salienceScore,
        people: m.extractedFeatures?.peopleMentioned || [],
        topics: m.extractedFeatures?.topics || [],
        tags: Array.isArray(m.tags) ? m.tags : undefined,
        project: typeof m.project === 'string' ? m.project : undefined,
        loops: (loopsMap.get(m.memoryId) || []).map(l => ({
            description: l.description,
            owner: l.owner,
            status: l.status,
            dueDate: l.dueDate,
        })),
        timelineEvents: (eventsMap.get(m.memoryId) || []).map(e => ({
            description: e.description,
            eventDate: e.eventDate,
            contactName: e.contactName,
        })),
    }));
}
/**
 * Import memories from export format.
 */
export async function importMemories(userId, memories, options = {}) {
    let imported = 0;
    let skipped = 0;
    const errors = [];
    for (const memory of memories) {
        try {
            const newId = options.idPrefix
                ? `${options.idPrefix}_${memory.id}`
                : `imported_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            // Check for duplicates if requested
            if (options.skipDuplicates) {
                const existing = await collections.memories().findOne({
                    userId,
                    text: memory.text,
                });
                if (existing) {
                    skipped++;
                    continue;
                }
            }
            // Insert memory
            await collections.memories().insertOne({
                memoryId: newId,
                userId,
                text: memory.text,
                createdAt: memory.createdAt,
                salienceScore: memory.salienceScore,
                extractedFeatures: {
                    peopleMentioned: memory.people,
                    topics: memory.topics,
                },
                tags: memory.tags,
                project: options.targetProject || memory.project,
                state: 'active',
                importedFrom: memory.id,
            });
            // Create access_history record for pattern detection (FFT needs these)
            const accessTimestamp = memory.createdAt ? new Date(memory.createdAt) : new Date();
            try {
                await recordMemoryAccess(userId, newId, {
                    people: memory.people,
                    project: options.targetProject || memory.project,
                }, accessTimestamp);
            } catch (accessErr) {
                console.warn(`[Import] Access history record failed for ${newId}:`, accessErr);
            }
            // Import loops
            for (const loop of memory.loops || []) {
                await collections.openLoops().insertOne({
                    id: `${newId}_loop_${Math.random().toString(36).slice(2, 8)}`,
                    userId,
                    memoryId: newId,
                    description: loop.description,
                    owner: loop.owner,
                    status: loop.status,
                    dueDate: loop.dueDate,
                    createdAt: new Date().toISOString(),
                    loopType: 'follow_up_needed',
                    category: 'other',
                    urgency: 'normal',
                    remindedCount: 0,
                    escalateAfterDays: 7,
                });
            }
            // Import timeline events
            for (const event of memory.timelineEvents || []) {
                await collections.personTimelineEvents().insertOne({
                    id: `${newId}_event_${Math.random().toString(36).slice(2, 8)}`,
                    userId,
                    memoryId: newId,
                    description: event.description,
                    eventDate: event.eventDate,
                    contactName: event.contactName,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    eventType: 'personal',
                    isRecurring: false,
                    goodToMention: true,
                    sensitivity: 'neutral',
                });
            }
            imported++;
        }
        catch (error) {
            errors.push(`Failed to import ${memory.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    return { imported, skipped, errors };
}
// ============================================================================
// HELPERS
// ============================================================================
async function logStateChange(change, userId) {
    try {
        await collections.stateChanges?.().insertOne({
            memoryId: change.memoryId,
            userId: userId || 'unknown',
            previousState: change.fromState,
            newState: change.toState,
            reason: change.reason,
            changedAt: change.changedAt,
            changedBy: change.changedBy,
        });
    }
    catch {
        // State change logging is non-critical
        // eslint-disable-next-line no-console
        console.warn('[MemoryOps] Could not log state change');
    }
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
