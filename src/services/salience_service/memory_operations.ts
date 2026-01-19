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
import type { ExtractedFeatures, MemoryDocument } from './models';

// Declare console for Node.js environment
declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

// ============================================================================
// MEMORY LIFECYCLE STATES
// ============================================================================

export type MemoryState =
  | 'active'      // Normal state, fully searchable
  | 'archived'    // Hidden from default searches, but retrievable
  | 'suppressed'  // Actively hidden, won't surface in any context
  | 'deleted';    // Soft deleted, pending permanent removal

export interface MemoryStateChange {
  memoryId: string;
  fromState: MemoryState;
  toState: MemoryState;
  reason?: string;
  changedAt: string;
  changedBy: 'user' | 'system' | 'decay';
}

// ============================================================================
// FORGET OPERATIONS
// ============================================================================

export interface ForgetOptions {
  /** How to forget */
  mode: 'suppress' | 'archive' | 'delete';
  /** Why (for audit trail) */
  reason?: string;
  /** Also remove related open loops */
  cascadeLoops?: boolean;
  /** Also remove related timeline events */
  cascadeTimeline?: boolean;
}

export interface ForgetResult {
  success: boolean;
  memoryId: string;
  previousState: MemoryState;
  newState: MemoryState;
  loopsRemoved?: number;
  eventsRemoved?: number;
  error?: string;
}

/**
 * Forget a specific memory.
 *
 * Modes:
 * - suppress: Memory won't surface in any context, but data preserved
 * - archive: Memory hidden from default searches, can be explicitly retrieved
 * - delete: Soft delete, data removed after retention period
 */
export async function forgetMemory(
  userId: string,
  memoryId: string,
  options: ForgetOptions
): Promise<ForgetResult> {
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

    const previousState = (memory.state as MemoryState) || 'active';
    const newState = options.mode === 'suppress' ? 'suppressed' :
                     options.mode === 'archive' ? 'archived' : 'deleted';

    // Update memory state
    await collections.memories().updateOne(
      { memoryId, userId },
      {
        $set: {
          state: newState,
          stateChangedAt: new Date().toISOString(),
          stateChangeReason: options.reason,
          // If deleting, set expiration for permanent removal
          ...(options.mode === 'delete' ? {
            deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          } : {}),
        },
      }
    );

    let loopsRemoved = 0;
    let eventsRemoved = 0;

    // Cascade to open loops if requested
    if (options.cascadeLoops) {
      const loopResult = await collections.openLoops().updateMany(
        { userId, memoryId },
        { $set: { status: 'abandoned', abandonReason: 'source_memory_forgotten' } }
      );
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
  } catch (error) {
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
export async function forgetPerson(
  userId: string,
  personName: string,
  options: Omit<ForgetOptions, 'cascadeLoops' | 'cascadeTimeline'> & {
    alsoForgetLoops?: boolean;
    alsoForgetEvents?: boolean;
  }
): Promise<{
  memoriesForgotten: number;
  loopsForgotten: number;
  eventsForgotten: number;
}> {
  const newState = options.mode === 'suppress' ? 'suppressed' :
                   options.mode === 'archive' ? 'archived' : 'deleted';

  // Find and update memories mentioning this person
  const memoryResult = await collections.memories().updateMany(
    {
      userId,
      'extractedFeatures.peopleMentioned': {
        $regex: new RegExp(`^${escapeRegex(personName)}$`, 'i'),
      },
    },
    {
      $set: {
        state: newState,
        stateChangedAt: new Date().toISOString(),
        stateChangeReason: options.reason || `Forgot person: ${personName}`,
      },
    }
  );

  let loopsForgotten = 0;
  let eventsForgotten = 0;

  // Forget loops involving this person
  if (options.alsoForgetLoops) {
    const loopResult = await collections.openLoops().updateMany(
      {
        userId,
        otherParty: { $regex: new RegExp(`^${escapeRegex(personName)}$`, 'i') },
      },
      { $set: { status: 'abandoned', abandonReason: 'person_forgotten' } }
    );
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

// ============================================================================
// SELECTIVE FORGETTING - Granular control for healthy trajectories
// "Keep the lessons. Forget the pain."
// ============================================================================

export interface SelectiveForgetOptions {
  /** Entity (person, project, topic) to selectively forget */
  entity?: string;

  /** Temporal filters */
  before?: string;  // ISO date - forget memories before this
  after?: string;   // ISO date - forget memories after this

  /** Content filters */
  topic?: string;           // Only memories matching this topic/query
  emotionThreshold?: number; // Only memories above this emotion intensity (0-1)
  salienceBelow?: number;   // Only memories below this salience score

  /** Protective filters - DON'T forget these */
  keepPositive?: boolean;   // Preserve positive-emotion memories
  keepLessons?: boolean;    // Preserve memories tagged as lessons/insights
  keepMilestones?: boolean; // Preserve milestone/achievement memories

  /** How to forget */
  mode: 'suppress' | 'archive' | 'delete' | 'fade' | 'redact' | 'blur';

  /** Fade-specific: reduce salience by this factor (0-1) */
  fadeFactor?: number;

  /** Reason for audit trail */
  reason?: string;

  /** Who requested: user, system, or trajectory algorithm */
  requestedBy?: 'user' | 'system' | 'trajectory';
}

export interface SelectiveForgetResult {
  success: boolean;
  memoriesAffected: number;
  memoriesProtected: number;
  mode: string;
  filters: {
    entity?: string;
    temporal?: { before?: string; after?: string };
    topic?: string;
    emotion?: number;
    salience?: number;
  };
  protections: string[];
  recommendation?: string;
}

/**
 * Selectively forget memories based on granular criteria.
 *
 * This is the healthy forgetting engine - not nuclear deletion,
 * but therapeutic removal of what doesn't serve your best trajectory.
 *
 * "The best you. 66 days at a time."
 */
export async function forgetSelective(
  userId: string,
  options: SelectiveForgetOptions
): Promise<SelectiveForgetResult> {
  const {
    entity,
    before,
    after,
    topic,
    emotionThreshold,
    salienceBelow,
    keepPositive = true,
    keepLessons = true,
    keepMilestones = true,
    mode = 'fade',
    fadeFactor = 0.5,
    reason,
    requestedBy = 'user',
  } = options;

  // Build the query
  const query: Record<string, unknown> = { userId };

  // Entity filter (person, project, etc.)
  if (entity) {
    query.$or = [
      { 'extractedFeatures.peopleMentioned': { $regex: new RegExp(entity, 'i') } },
      { entities: { $regex: new RegExp(entity, 'i') } },
      { content: { $regex: new RegExp(entity, 'i') } },
    ];
  }

  // Temporal filters
  if (before || after) {
    query.timestamp = {};
    if (before) (query.timestamp as Record<string, string>).$lt = before;
    if (after) (query.timestamp as Record<string, string>).$gt = after;
  }

  // Topic filter (content search)
  if (topic) {
    query.content = { $regex: new RegExp(topic, 'i') };
  }

  // Emotion threshold (high-emotion memories only)
  if (emotionThreshold !== undefined) {
    query['extractedFeatures.emotionalIntensity'] = { $gte: emotionThreshold };
  }

  // Low salience filter
  if (salienceBelow !== undefined) {
    query.salience = { $lt: salienceBelow };
  }

  // Find matching memories
  const candidates = await collections.memories().find(query).toArray();

  // Apply protective filters
  const protections: string[] = [];
  const toForget: typeof candidates = [];
  let protectedCount = 0;

  for (const memory of candidates) {
    const features = memory.extractedFeatures as ExtractedFeatures | undefined;
    let protect = false;

    // Keep positive memories
    if (keepPositive && features?.emotionalValence === 'positive') {
      protect = true;
      if (!protections.includes('positive')) protections.push('positive');
    }

    // Keep lessons/insights
    if (keepLessons && (
      memory.content?.toLowerCase().includes('learned') ||
      memory.content?.toLowerCase().includes('lesson') ||
      memory.content?.toLowerCase().includes('insight') ||
      memory.content?.toLowerCase().includes('realized')
    )) {
      protect = true;
      if (!protections.includes('lessons')) protections.push('lessons');
    }

    // Keep milestones
    if (keepMilestones && (
      memory.content?.toLowerCase().includes('milestone') ||
      memory.content?.toLowerCase().includes('achieved') ||
      memory.content?.toLowerCase().includes('first time') ||
      memory.content?.toLowerCase().includes('accomplished')
    )) {
      protect = true;
      if (!protections.includes('milestones')) protections.push('milestones');
    }

    if (protect) {
      protectedCount++;
    } else {
      toForget.push(memory);
    }
  }

  // Apply the forgetting based on mode
  let affected = 0;

  for (const memory of toForget) {
    const update: Record<string, unknown> = {
      stateChangedAt: new Date().toISOString(),
      stateChangeReason: reason || `Selective forget: ${mode}`,
      stateChangeRequestedBy: requestedBy,
    };

    switch (mode) {
      case 'suppress':
        update.state = 'suppressed';
        break;

      case 'archive':
        update.state = 'archived';
        break;

      case 'delete':
        update.state = 'deleted';
        update.deleteScheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        break;

      case 'fade':
        // Don't change state, just reduce salience
        const currentSalience = memory.salience || 50;
        update.salience = Math.max(1, Math.floor(currentSalience * fadeFactor));
        update.fadedAt = new Date().toISOString();
        update.fadedReason = reason || 'Trajectory optimization';
        break;

      case 'redact':
        // Keep structure, remove sensitive content
        update.originalContent = memory.content;
        update.content = '[REDACTED]';
        update.redactedAt = new Date().toISOString();
        break;

      case 'blur':
        // Keep general shape, remove specifics
        update.originalContent = memory.content;
        update.content = blurContent(memory.content || '');
        update.blurredAt = new Date().toISOString();
        break;
    }

    await collections.memories().updateOne(
      { memoryId: memory.memoryId, userId },
      { $set: update }
    );
    affected++;
  }

  console.log(`[SelectiveForget] ${requestedBy} forgot ${affected} memories (protected ${protectedCount}) via ${mode}`);

  return {
    success: true,
    memoriesAffected: affected,
    memoriesProtected: protectedCount,
    mode,
    filters: {
      entity,
      temporal: (before || after) ? { before, after } : undefined,
      topic,
      emotion: emotionThreshold,
      salience: salienceBelow,
    },
    protections,
    recommendation: affected > 0
      ? `Faded ${affected} memories. Kept ${protectedCount} positive/lesson memories. The path forward is clearer.`
      : 'No memories matched your criteria, or all were protected.',
  };
}

/**
 * Blur content - keep structure, remove specifics
 */
function blurContent(content: string): string {
  // Replace names with [PERSON]
  let blurred = content.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, '[PERSON]');
  // Replace numbers with [NUMBER]
  blurred = blurred.replace(/\b\d+\b/g, '[NUMBER]');
  // Replace dates with [DATE]
  blurred = blurred.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[DATE]');
  blurred = blurred.replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?\b/gi, '[DATE]');
  return blurred;
}

// ============================================================================
// TRAJECTORY-AWARE FORGETTING - The healthy algorithm prescribes
// ============================================================================

export interface TrajectoryForgetRecommendation {
  memoryId: string;
  content: string;
  reason: string;
  distressScore: number;
  goalAlignment: number;
  recommendedAction: 'fade' | 'archive' | 'keep';
  confidence: number;
}

/**
 * Analyze memories and recommend what to forget for optimal trajectory.
 *
 * This is the "healthy algorithm" - it looks at patterns and suggests
 * what to let go of to support your best self.
 */
export async function recommendTrajectoryForgetting(
  userId: string,
  options: {
    lookbackDays?: number;
    minDistressScore?: number;
    maxGoalAlignment?: number;
  } = {}
): Promise<{
  recommendations: TrajectoryForgetRecommendation[];
  summary: string;
}> {
  const {
    lookbackDays = 66,  // Habit formation window
    minDistressScore = 0.6,
    maxGoalAlignment = 0.3,
  } = options;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Find memories that consistently cause distress
  const memories = await collections.memories().find({
    userId,
    timestamp: { $gte: since },
    state: { $ne: 'deleted' },
    'metadata.prosody.distressScore': { $gte: minDistressScore * 100 },
  }).toArray();

  const recommendations: TrajectoryForgetRecommendation[] = [];

  for (const memory of memories) {
    const prosody = memory.metadata?.prosody;
    const distressScore = (prosody?.distressScore || 0) / 100;

    // Simple goal alignment check - memories about current projects/goals score higher
    // This would be more sophisticated with actual goal tracking
    const goalAlignment = memory.salience ? memory.salience / 100 : 0.5;

    if (distressScore >= minDistressScore && goalAlignment <= maxGoalAlignment) {
      recommendations.push({
        memoryId: memory.memoryId,
        content: memory.content?.substring(0, 100) + '...',
        reason: prosody?.distressSignals?.map((s: { category: string }) => s.category).join(', ') || 'High distress',
        distressScore,
        goalAlignment,
        recommendedAction: distressScore > 0.8 ? 'archive' : 'fade',
        confidence: Math.min(0.95, distressScore * (1 - goalAlignment)),
      });
    }
  }

  // Sort by confidence
  recommendations.sort((a, b) => b.confidence - a.confidence);

  const summary = recommendations.length > 0
    ? `Found ${recommendations.length} memories that may be holding you back. ` +
      `These show distress patterns without contributing to your current goals. ` +
      `Consider fading them to clear your path forward.`
    : `Your memory landscape looks healthy. No recommendations at this time.`;

  return { recommendations, summary };
}

/**
 * Restore a forgotten memory.
 */
export async function restoreMemory(
  userId: string,
  memoryId: string
): Promise<{ success: boolean; previousState?: MemoryState; error?: string }> {
  try {
    const memory = await collections.memories().findOne({ memoryId, userId });
    if (!memory) {
      return { success: false, error: 'Memory not found' };
    }

    const previousState = memory.state as MemoryState;
    if (previousState === 'active') {
      return { success: true, previousState };
    }

    await collections.memories().updateOne(
      { memoryId, userId },
      {
        $set: { state: 'active', stateChangedAt: new Date().toISOString() },
        $unset: { deleteAfter: '' },
      }
    );

    await logStateChange({
      memoryId,
      fromState: previousState,
      toState: 'active',
      reason: 'User restored',
      changedAt: new Date().toISOString(),
      changedBy: 'user',
    }, userId);

    return { success: true, previousState };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// REASSOCIATION OPERATIONS
// ============================================================================

export interface ReassociateOptions {
  /** Add these people to the memory */
  addPeople?: string[];
  /** Remove these people from the memory */
  removePeople?: string[];
  /** Add these topics */
  addTopics?: string[];
  /** Remove these topics */
  removeTopics?: string[];
  /** Change the linked project/context */
  setProject?: string | null;
  /** Add tags */
  addTags?: string[];
  /** Remove tags */
  removeTags?: string[];
}

/**
 * Reassociate a memory - change how it's linked.
 */
export async function reassociateMemory(
  userId: string,
  memoryId: string,
  options: ReassociateOptions
): Promise<{
  success: boolean;
  changes: string[];
  error?: string;
}> {
  try {
    const memory = await collections.memories().findOne({ memoryId, userId });
    if (!memory) {
      return { success: false, changes: [], error: 'Memory not found' };
    }

    const changes: string[] = [];
    const updateOps: any = { $set: {}, $addToSet: {}, $pull: {} };
    let hasUpdates = false;

    const features = memory.extractedFeatures || {} as ExtractedFeatures;

    // Handle people changes
    if (options.addPeople?.length) {
      const currentPeople = features.peopleMentioned || [];
      const newPeople = options.addPeople.filter(
        (p: string) => !currentPeople.some((cp: string) => cp.toLowerCase() === p.toLowerCase())
      );
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
    if (Object.keys(updateOps.$set).length === 0) delete updateOps.$set;
    if (Object.keys(updateOps.$addToSet).length === 0) delete updateOps.$addToSet;
    if (Object.keys(updateOps.$pull).length === 0) delete updateOps.$pull;

    // Add modification timestamp
    updateOps.$set = updateOps.$set || {};
    updateOps.$set.lastModifiedAt = new Date().toISOString();
    updateOps.$set.lastModifiedReason = 'reassociation';

    await collections.memories().updateOne({ memoryId, userId }, updateOps);

    return { success: true, changes };
  } catch (error) {
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
export async function mergeMemories(
  userId: string,
  primaryMemoryId: string,
  secondaryMemoryId: string,
  options: {
    keepBothTexts?: boolean;
    deleteSecondary?: boolean;
  } = {}
): Promise<{
  success: boolean;
  mergedMemoryId?: string;
  error?: string;
}> {
  try {
    const [primary, secondary] = await Promise.all([
      collections.memories().findOne({ memoryId: primaryMemoryId, userId }),
      collections.memories().findOne({ memoryId: secondaryMemoryId, userId }),
    ]);

    if (!primary || !secondary) {
      return { success: false, error: 'One or both memories not found' };
    }

    // Merge extracted features
    const primaryFeatures = (primary.extractedFeatures || {}) as Partial<ExtractedFeatures>;
    const secondaryFeatures = (secondary.extractedFeatures || {}) as Partial<ExtractedFeatures>;

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
    const mergedSalience = Math.max(
      primary.salienceScore || 0,
      secondary.salienceScore || 0
    );

    // Update primary with merged data
    await collections.memories().updateOne(
      { memoryId: primaryMemoryId, userId },
      {
        $set: {
          text: mergedText,
          extractedFeatures: { ...primaryFeatures, ...mergedFeatures },
          salienceScore: mergedSalience,
          mergedFrom: [...((primary as any).mergedFrom || []), secondaryMemoryId],
          lastModifiedAt: new Date().toISOString(),
          lastModifiedReason: 'merge',
        },
      }
    );

    // Handle secondary memory
    if (options.deleteSecondary) {
      await collections.memories().updateOne(
        { memoryId: secondaryMemoryId, userId },
        {
          $set: {
            state: 'deleted',
            mergedInto: primaryMemoryId,
            stateChangedAt: new Date().toISOString(),
          },
        }
      );
    }

    return { success: true, mergedMemoryId: primaryMemoryId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EXPORT/IMPORT OPERATIONS
// ============================================================================

export interface ExportedMemory {
  id: string;
  text: string;
  createdAt: string;
  salienceScore?: number;
  people: string[];
  topics: string[];
  tags?: string[];
  project?: string;
  loops: Array<{
    description: string;
    owner: string;
    status: string;
    dueDate?: string;
  }>;
  timelineEvents: Array<{
    description: string;
    eventDate?: string;
    contactName: string;
  }>;
}

export interface ExportOptions {
  /** Filter by people */
  people?: string[];
  /** Filter by topics */
  topics?: string[];
  /** Filter by project */
  project?: string;
  /** Filter by date range */
  fromDate?: string;
  toDate?: string;
  /** Include related loops */
  includeLoops?: boolean;
  /** Include related timeline events */
  includeTimeline?: boolean;
  /** Only active memories */
  activeOnly?: boolean;
}

/**
 * Export memories for portability.
 */
export async function exportMemories(
  userId: string,
  options: ExportOptions = {}
): Promise<ExportedMemory[]> {
  const query: any = { userId };

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
    if (options.fromDate) query.createdAt.$gte = options.fromDate;
    if (options.toDate) query.createdAt.$lte = options.toDate;
  }

  const memories = await collections.memories().find(query).toArray();
  const memoryIds = memories.map((m: { memoryId: string }) => m.memoryId);

  // Get related loops
  let loopsMap = new Map<string, any[]>();
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
  let eventsMap = new Map<string, any[]>();
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
 * Automatically tracks import for undo capability.
 */
export async function importMemories(
  userId: string,
  memories: ExportedMemory[],
  options: {
    /** Prefix to add to imported memory IDs */
    idPrefix?: string;
    /** Project to assign imported memories to */
    targetProject?: string;
    /** Skip duplicates based on text similarity */
    skipDuplicates?: boolean;
    /** Source of import (mem0, file, api) */
    source?: 'mem0' | 'file' | 'api';
    /** Import tracking ID (if continuing an existing import) */
    importId?: string;
  } = {}
): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
  importId: string;
}> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const importedIds: { [collection: string]: string[] } = {
    memories: [],
    open_loops: [],
    person_timeline_events: [],
  };

  // Track this import for undo capability
  const importId = options.importId || `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const source = options.source || 'api';

  console.log(`[Import] Starting import ${importId} from ${source}: ${memories.length} memories`);

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
        } as Partial<ExtractedFeatures> as ExtractedFeatures,
        tags: memory.tags,
        project: options.targetProject || memory.project,
        state: 'active',
        importedFrom: memory.id,
        importId, // Track which import this came from
        importSource: source,
      } as any);

      importedIds.memories.push(newId);

      // Import loops
      for (const loop of memory.loops || []) {
        const loopId = `${newId}_loop_${Math.random().toString(36).slice(2, 8)}`;
        await collections.openLoops().insertOne({
          id: loopId,
          userId,
          memoryId: newId,
          description: loop.description,
          owner: loop.owner as any,
          status: loop.status as any,
          dueDate: loop.dueDate,
          createdAt: new Date().toISOString(),
          loopType: 'follow_up_needed',
          category: 'other',
          urgency: 'normal',
          remindedCount: 0,
          escalateAfterDays: 7,
          importId,
        } as any);
        importedIds.open_loops.push(loopId);
      }

      // Import timeline events
      for (const event of memory.timelineEvents || []) {
        const eventId = `${newId}_event_${Math.random().toString(36).slice(2, 8)}`;
        await collections.personTimelineEvents().insertOne({
          id: eventId,
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
          importId,
        } as any);
        importedIds.person_timeline_events.push(eventId);
      }

      imported++;
    } catch (error) {
      errors.push(`Failed to import ${memory.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[Import] Completed ${importId}: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);

  return { imported, skipped, errors, importId };
}

/**
 * Undo an import by removing all documents with matching importId.
 * This is the "undoable Mem0 integration" feature.
 */
export async function undoImport(
  userId: string,
  importId: string
): Promise<{
  success: boolean;
  removed: { [collection: string]: number };
}> {
  console.log(`[Import] Undoing import ${importId} for user ${userId}`);

  const removed: { [collection: string]: number } = {};

  // Remove from memories
  const memResult = await collections.memories().deleteMany({
    userId,
    importId,
  } as any);
  removed.memories = memResult.deletedCount;

  // Remove from open_loops
  const loopResult = await collections.openLoops().deleteMany({
    userId,
    importId,
  } as any);
  removed.open_loops = loopResult.deletedCount;

  // Remove from person_timeline_events
  const eventResult = await collections.personTimelineEvents().deleteMany({
    userId,
    importId,
  } as any);
  removed.person_timeline_events = eventResult.deletedCount;

  console.log(`[Import] Undone ${importId}: removed ${JSON.stringify(removed)}`);

  return { success: true, removed };
}

// ============================================================================
// HELPERS
// ============================================================================

async function logStateChange(change: MemoryStateChange, userId?: string): Promise<void> {
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
  } catch {
    // State change logging is non-critical
    // eslint-disable-next-line no-console
    console.warn('[MemoryOps] Could not log state change');
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
