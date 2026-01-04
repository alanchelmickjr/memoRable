/**
 * @file Defines the core data structures and types for the Memory Salience System.
 * Based on the Human-Like Memory Salience System specification v2.0
 *
 * Key principles:
 * - Calculate salience at capture time, not overnight
 * - Adaptive weight learning based on what user actually retrieves/acts on
 * - Context-dependent weight shifting (work vs social vs networking)
 * - Track commitments, open loops, and other people's timelines
 */
/**
 * The five core components that determine memory salience.
 * Each component is scored 0-100 and weighted to produce final salience.
 */
export interface SalienceComponents {
    /** Emotional arousal - high emotion = better encoding (weight: 0.30 default) */
    emotional: number;
    /** Novelty - new experiences get priority (weight: 0.20 default) */
    novelty: number;
    /** Personal relevance - relates to identity, goals, relationships (weight: 0.20 default) */
    relevance: number;
    /** Social significance - relationship events, status changes (weight: 0.15 default) */
    social: number;
    /** Consequentiality - things with downstream effects (weight: 0.15 default) */
    consequential: number;
}
/**
 * Complete salience metadata attached to a memory.
 */
export interface SalienceScore {
    /** Final weighted score 0-100 */
    score: number;
    /** Individual component scores */
    components: SalienceComponents;
    /** Weights used for calculation (may vary by context) */
    weightsUsed: SalienceWeights;
    /** Context at time of capture */
    captureContext: CaptureContext;
    /** Timestamp of salience calculation */
    calculatedAt: string;
}
/**
 * Configurable weights for salience components.
 * Can be personalized per user via adaptive learning.
 */
export interface SalienceWeights {
    emotional: number;
    novelty: number;
    relevance: number;
    social: number;
    consequential: number;
}
/**
 * Default weights based on psychological research.
 */
export declare const DEFAULT_SALIENCE_WEIGHTS: SalienceWeights;
/**
 * Context-specific weight modifiers.
 * Applied multiplicatively to base weights based on detected context.
 */
export type ContextType = 'work_meeting' | 'social_event' | 'one_on_one' | 'networking' | 'family' | 'default';
export interface ContextWeightModifiers {
    [key: string]: number | undefined;
    emotional?: number;
    novelty?: number;
    relevance?: number;
    social?: number;
    consequential?: number;
}
export declare const CONTEXT_WEIGHT_MODIFIERS: Record<ContextType, ContextWeightModifiers>;
/**
 * Features extracted from memory content for salience calculation.
 * This is the output of the LLM extraction call.
 */
export interface ExtractedFeatures {
    emotionalKeywords: string[];
    sentimentScore: number;
    sentimentIntensity: number;
    peopleMentioned: string[];
    relationshipEvents: RelationshipEventType[];
    topics: string[];
    actionItems: ActionItem[];
    decisions: string[];
    moneyMentioned: boolean;
    conflictPresent: boolean;
    intimacySignals: boolean;
    commitments: ExtractedCommitment[];
    datesMentioned: ExtractedDate[];
    questionsAsked: string[];
    requestsMade: ExtractedRequest[];
    mutualAgreements: ExtractedMutualAgreement[];
}
export type RelationshipEventType = 'death' | 'birth' | 'marriage' | 'divorce' | 'engagement' | 'promotion' | 'job_change' | 'graduation' | 'illness' | 'recovery' | 'move' | 'breakup' | 'reunion' | 'achievement' | 'loss' | 'conflict' | 'reconciliation';
export interface ActionItem {
    description: string;
    assignedTo: 'self' | 'other' | 'mutual';
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
}
export interface ExtractedCommitment {
    type: 'made' | 'received';
    from: string;
    to: string;
    what: string;
    byWhen: string | null;
    dueType: 'explicit' | 'implicit' | 'none';
    explicit: boolean;
}
export interface ExtractedDate {
    rawText: string;
    resolved: string | null;
    context: string;
    whose: string | null;
    type: 'deadline' | 'event' | 'milestone' | 'reference';
}
export interface ExtractedRequest {
    whoRequested: 'self' | string;
    what: string;
    fromWhom: string;
    byWhen: string | null;
}
export interface ExtractedMutualAgreement {
    what: string;
    parties: string[];
    timeframe: string | null;
    specificity: 'specific' | 'vague' | 'none';
}
/**
 * Context information captured at the time of memory creation.
 */
export interface CaptureContext {
    location?: string;
    locationIsNew?: boolean;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: string;
    timeBucket: 'work_hours' | 'evening' | 'weekend' | 'late_night';
    timeIsUnusual?: boolean;
    detectedContext: ContextType;
    nearHoliday?: string;
}
/**
 * Types of open loops that can be tracked.
 */
export type OpenLoopType = 'commitment_made' | 'commitment_received' | 'question_pending' | 'topic_unresolved' | 'follow_up_needed' | 'mutual_agreement' | 'information_waiting';
export type OpenLoopStatus = 'open' | 'completed' | 'overdue' | 'abandoned' | 'transferred';
export type LoopOwner = 'self' | 'them' | 'mutual' | 'unknown';
export type LoopCategory = 'deliverable' | 'meeting' | 'introduction' | 'favor' | 'information' | 'decision' | 'payment' | 'other';
export type LoopUrgency = 'low' | 'normal' | 'high' | 'urgent';
/**
 * An open loop - anything unresolved that should be tracked.
 */
export interface OpenLoop {
    id: string;
    userId: string;
    memoryId: string;
    loopType: OpenLoopType;
    description: string;
    category: LoopCategory;
    owner: LoopOwner;
    otherParty?: string;
    contactId?: string;
    createdAt: string;
    dueDate?: string;
    softDeadline?: string;
    urgency: LoopUrgency;
    status: OpenLoopStatus;
    completedAt?: string;
    completedMemoryId?: string;
    remindedCount: number;
    lastRemindedAt?: string;
    escalateAfterDays: number;
    nextReminder?: string;
}
/**
 * Types of events in other people's timelines.
 */
export type PersonEventType = 'personal' | 'professional' | 'family' | 'health' | 'milestone' | 'celebration' | 'deadline' | 'absence' | 'travel' | 'recurring';
export type EventSensitivity = 'neutral' | 'positive' | 'sensitive';
/**
 * An event in someone else's life/timeline.
 */
export interface PersonTimelineEvent {
    id: string;
    userId: string;
    contactId?: string;
    contactName: string;
    memoryId?: string;
    eventType: PersonEventType;
    description: string;
    eventDate?: string;
    eventEndDate?: string;
    isRecurring: boolean;
    recurrencePattern?: 'weekly' | 'monthly' | 'annual';
    remindBeforeDays?: number;
    goodToMention: boolean;
    sensitivity: EventSensitivity;
    lastMentionedAt?: string;
    createdAt: string;
    updatedAt: string;
}
export type EngagementTrend = 'increasing' | 'stable' | 'decreasing' | 'dormant';
/**
 * Tracks the rhythm and health of a relationship over time.
 */
export interface RelationshipPattern {
    id: string;
    userId: string;
    contactId: string;
    contactName: string;
    firstInteraction: string;
    lastInteraction?: string;
    totalInteractions: number;
    avgDaysBetweenInteractions?: number;
    typicalInteractionDays?: string[];
    typicalTimeOfDay?: string[];
    daysSinceLastInteraction?: number;
    interactionTrend: EngagementTrend;
    suggestedNextInteraction?: string;
    nudgeIfGapExceedsDays?: number;
    updatedAt: string;
}
/**
 * Periodic snapshot of relationship state for time-series analysis.
 */
export interface RelationshipSnapshot {
    id: string;
    userId: string;
    contactId: string;
    snapshotDate: string;
    interactionsCount: number;
    totalInteractions: number;
    avgSentiment?: number;
    engagementTrend: EngagementTrend;
    lastInteraction?: string;
    daysSinceInteraction: number;
    favorsGiven: number;
    favorsReceived: number;
    reciprocityBalance: number;
    openLoopsToThem: number;
    openLoopsFromThem: number;
}
/**
 * Log entry for memory retrieval, used for adaptive learning.
 */
export interface RetrievalLog {
    id: string;
    userId: string;
    memoryId: string;
    retrievedAt: string;
    query?: string;
    salienceComponents: SalienceComponents;
    salienceScore: number;
    resultedInAction: boolean;
    actionType?: string;
    userFeedback?: 'helpful' | 'not_helpful' | 'neutral';
}
/**
 * User-specific learned weights, updated periodically.
 */
export interface LearnedWeights {
    userId: string;
    weights: SalienceWeights;
    sampleSize: number;
    lastRecalculatedAt: string;
    confidence: number;
}
/**
 * Complete briefing assembled before talking to someone.
 */
export interface ConversationBriefing {
    contactId: string;
    contactName: string;
    relationship: {
        howMet?: string;
        firstInteraction?: string;
        lastInteraction?: string;
        daysSinceLastInteraction?: number;
        totalInteractions: number;
        trend: EngagementTrend;
    };
    theirTimeline: PersonTimelineEvent[];
    openLoops: {
        youOweThem: OpenLoop[];
        theyOweYou: OpenLoop[];
        mutual: OpenLoop[];
    };
    recentMemories: BriefingMemory[];
    highSalienceMemories: BriefingMemory[];
    recentSentiment?: number;
    suggestedTopics: string[];
    sensitivities: string[];
    generatedAt: string;
}
/**
 * Simplified memory for briefing display.
 */
export interface BriefingMemory {
    memoryId: string;
    text: string;
    salienceScore: number;
    createdAt: string;
    topics?: string[];
}
/**
 * Extension of MemoryMemento with salience data.
 * This is what gets stored after salience enrichment.
 */
export interface EnrichedMemoryData {
    salience: SalienceScore;
    extractedFeatures: ExtractedFeatures;
    captureContext: CaptureContext;
    lastRetrievedAt?: string;
    retrievalCount: number;
    hasFutureReferences: boolean;
    hasOpenLoops: boolean;
    earliestDueDate?: string;
    salienceVersion: string;
}
/**
 * Memory document stored in the memories collection.
 */
export interface MemoryDocument {
    _id?: string;
    mementoId?: string;
    memoryId: string;
    userId: string;
    text: string;
    content?: string | Record<string, unknown>;
    createdAt: string;
    eventTimestamp?: string;
    updatedAt?: string;
    state?: 'active' | 'archived' | 'suppressed' | 'deleted';
    salienceScore?: number;
    salienceComponents?: SalienceComponents;
    extractedFeatures?: ExtractedFeatures;
    retrievalCount?: number;
    lastRetrievedAt?: string;
    hasOpenLoops?: boolean;
    earliestDueDate?: string;
    [key: string]: unknown;
}
/**
 * Expected response structure from the LLM extraction call.
 */
export interface LLMExtractionResponse {
    emotional_keywords: string[];
    sentiment_score: number;
    sentiment_intensity: number;
    people_mentioned: string[];
    relationship_events: string[];
    topics: string[];
    action_items: {
        description: string;
        assigned_to: string;
        due_date?: string;
    }[];
    decisions: string[];
    money_mentioned: boolean;
    conflict_present: boolean;
    intimacy_signals: boolean;
    commitments: {
        type: 'made' | 'received';
        from: string;
        to: string;
        what: string;
        by_when: string | null;
        due_type: 'explicit' | 'implicit' | 'none';
    }[];
    dates_mentioned: {
        raw_text: string;
        resolved: string | null;
        context: string;
        whose: string | null;
        type: 'deadline' | 'event' | 'milestone' | 'reference';
    }[];
    questions_asked: string[];
    requests_made: {
        who_requested: string;
        what: string;
        from_whom: string;
        by_when: string | null;
    }[];
    mutual_agreements: {
        what: string;
        parties: string[];
        timeframe: string | null;
        specificity: 'specific' | 'vague' | 'none';
    }[];
}
/**
 * Loop closure check response from LLM.
 */
export interface LoopClosureCheckResponse {
    closed: boolean;
    confidence: number;
    reasoning?: string;
}
/**
 * Input for salience calculation.
 */
export interface SalienceCalculationInput {
    memoryId: string;
    text: string;
    userId: string;
    context?: Partial<CaptureContext>;
}
/**
 * Result of salience calculation.
 */
export interface SalienceCalculationResult {
    success: boolean;
    salience?: SalienceScore;
    extractedFeatures?: ExtractedFeatures;
    openLoopsCreated?: OpenLoop[];
    timelineEventsCreated?: PersonTimelineEvent[];
    error?: string;
}
/**
 * User profile for relevance calculation.
 */
export interface UserProfile {
    userId: string;
    name: string;
    interests: string[];
    goals: string[];
    closeContacts: string[];
    knownContacts: string[];
    recentTopics: string[];
}
/**
 * Time-aware retrieval options.
 */
export type TemporalFocus = 'recent' | 'this_week' | 'historical' | 'upcoming' | 'default';
export interface RetrievalOptions {
    query: string;
    userId: string;
    temporalFocus?: TemporalFocus;
    contactId?: string;
    minSalience?: number;
    limit?: number;
}
