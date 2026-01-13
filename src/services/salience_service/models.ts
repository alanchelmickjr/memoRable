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

// ============================================================================
// SALIENCE SCORING TYPES
// ============================================================================

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
  calculatedAt: string; // ISO8601
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
export const DEFAULT_SALIENCE_WEIGHTS: SalienceWeights = {
  emotional: 0.30,
  novelty: 0.20,
  relevance: 0.20,
  social: 0.15,
  consequential: 0.15,
};

/**
 * Context-specific weight modifiers.
 * Applied multiplicatively to base weights based on detected context.
 */
export type ContextType =
  | 'work_meeting'
  | 'social_event'
  | 'one_on_one'
  | 'networking'
  | 'family'
  | 'default';

export interface ContextWeightModifiers {
  [key: string]: number | undefined;
  emotional?: number;
  novelty?: number;
  relevance?: number;
  social?: number;
  consequential?: number;
}

export const CONTEXT_WEIGHT_MODIFIERS: Record<ContextType, ContextWeightModifiers> = {
  work_meeting: {
    consequential: 1.3,  // Boost action items
    social: 0.7,         // Reduce social weight
    emotional: 0.8,
  },
  social_event: {
    social: 1.4,         // Boost relationship signals
    emotional: 1.2,      // Feelings matter more
    consequential: 0.6,  // Tasks matter less
  },
  one_on_one: {
    relevance: 1.3,      // Personal connection matters
    social: 1.2,
    emotional: 1.1,
  },
  networking: {
    novelty: 1.4,        // New people priority
    consequential: 1.2,  // Follow-up potential
    social: 1.1,
  },
  family: {
    emotional: 1.4,
    social: 1.3,
    relevance: 1.2,
    consequential: 0.7,
  },
  default: {},
};

// ============================================================================
// FEATURE EXTRACTION TYPES
// ============================================================================

/**
 * Features extracted from memory content for salience calculation.
 * This is the output of the LLM extraction call.
 */
export interface ExtractedFeatures {
  // Emotional signals
  emotionalKeywords: string[];
  sentimentScore: number;       // -1 to 1
  sentimentIntensity: number;   // 0 to 1

  // People and relationships
  peopleMentioned: string[];
  relationshipEvents: RelationshipEventType[];

  // Content analysis
  topics: string[];
  actionItems: ActionItem[];
  decisions: string[];

  // Flags
  moneyMentioned: boolean;
  conflictPresent: boolean;
  intimacySignals: boolean;

  // Temporal extraction (for "the dance")
  commitments: ExtractedCommitment[];
  datesMentioned: ExtractedDate[];

  // Questions and requests
  questionsAsked: string[];
  requestsMade: ExtractedRequest[];
  mutualAgreements: ExtractedMutualAgreement[];
}

export type RelationshipEventType =
  | 'death'
  | 'birth'
  | 'marriage'
  | 'divorce'
  | 'engagement'
  | 'promotion'
  | 'job_change'
  | 'graduation'
  | 'illness'
  | 'recovery'
  | 'move'
  | 'breakup'
  | 'reunion'
  | 'achievement'
  | 'loss'
  | 'conflict'
  | 'reconciliation';

export interface ActionItem {
  description: string;
  assignedTo: 'self' | 'other' | 'mutual';
  dueDate?: string; // ISO8601 or null
  priority?: 'low' | 'medium' | 'high';
}

export interface ExtractedCommitment {
  type: 'made' | 'received';
  from: string;
  to: string;
  what: string;
  byWhen: string | null;       // ISO8601 or descriptive ("next week")
  dueType: 'explicit' | 'implicit' | 'none';
  explicit: boolean;           // Was it explicitly stated?
}

export interface ExtractedDate {
  rawText: string;
  resolved: string | null;     // ISO8601 if resolvable
  context: string;
  whose: string | null;        // Whose timeline?
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
  timeframe: string | null;    // "sometime", "next month", etc.
  specificity: 'specific' | 'vague' | 'none';
}

// ============================================================================
// CAPTURE CONTEXT
// ============================================================================

/**
 * Context information captured at the time of memory creation.
 */
export interface CaptureContext {
  location?: string;
  locationIsNew?: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  timeBucket: 'work_hours' | 'evening' | 'weekend' | 'late_night';
  timeIsUnusual?: boolean;     // Outside 8am-10pm
  detectedContext: ContextType;
  nearHoliday?: string;
}

// ============================================================================
// OPEN LOOPS & COMMITMENTS
// ============================================================================

/**
 * Types of open loops that can be tracked.
 */
export type OpenLoopType =
  | 'commitment_made'      // You promised something
  | 'commitment_received'  // They promised something
  | 'question_pending'     // Question asked, not answered
  | 'topic_unresolved'     // Discussion incomplete
  | 'follow_up_needed'     // General follow-up required
  | 'mutual_agreement'     // Both parties agreed to something
  | 'information_waiting'; // Waiting for update/news

export type OpenLoopStatus = 'open' | 'completed' | 'overdue' | 'abandoned' | 'transferred';

export type LoopOwner = 'self' | 'them' | 'mutual' | 'unknown';

export type LoopCategory =
  | 'deliverable'
  | 'meeting'
  | 'introduction'
  | 'favor'
  | 'information'
  | 'decision'
  | 'payment'
  | 'other';

export type LoopUrgency = 'low' | 'normal' | 'high' | 'urgent';

/**
 * An open loop - anything unresolved that should be tracked.
 */
export interface OpenLoop {
  id: string;                  // UUID
  userId: string;              // UUID
  memoryId: string;            // Source memory where created

  // What's open
  loopType: OpenLoopType;
  description: string;
  category: LoopCategory;

  // Who's involved
  owner: LoopOwner;
  otherParty?: string;         // Person name
  contactId?: string;          // UUID reference if matched

  // Timeline
  createdAt: string;           // ISO8601
  dueDate?: string;            // ISO8601 - explicit deadline
  softDeadline?: string;       // ISO8601 - inferred deadline
  urgency: LoopUrgency;

  // Status
  status: OpenLoopStatus;
  completedAt?: string;        // ISO8601
  completedMemoryId?: string;  // Memory where this was closed

  // Escalation
  remindedCount: number;
  lastRemindedAt?: string;     // ISO8601
  escalateAfterDays: number;
  nextReminder?: string;       // ISO8601
}

// ============================================================================
// PERSON TIMELINE EVENTS
// ============================================================================

/**
 * Types of events in other people's timelines.
 */
export type PersonEventType =
  | 'personal'
  | 'professional'
  | 'family'
  | 'health'
  | 'milestone'
  | 'celebration'
  | 'deadline'
  | 'absence'
  | 'travel'
  | 'recurring';

export type EventSensitivity = 'neutral' | 'positive' | 'sensitive';

/**
 * An event in someone else's life/timeline.
 */
export interface PersonTimelineEvent {
  id: string;                  // UUID
  userId: string;              // UUID - the user tracking this
  contactId?: string;          // UUID - the person this event is about
  contactName: string;         // Name for display
  memoryId?: string;           // Source memory where we learned this

  // Event details
  eventType: PersonEventType;
  description: string;
  eventDate?: string;          // ISO8601
  eventEndDate?: string;       // For ranges (vacation, leave)
  isRecurring: boolean;
  recurrencePattern?: 'weekly' | 'monthly' | 'annual';

  // For proactive surfacing
  remindBeforeDays?: number;
  goodToMention: boolean;      // Some things you note but don't bring up
  sensitivity: EventSensitivity;

  // Tracking
  lastMentionedAt?: string;    // ISO8601 - when you last brought this up
  createdAt: string;           // ISO8601
  updatedAt: string;           // ISO8601
}

// ============================================================================
// RELATIONSHIP PATTERNS
// ============================================================================

export type EngagementTrend = 'increasing' | 'stable' | 'decreasing' | 'dormant';

/**
 * Tracks the rhythm and health of a relationship over time.
 */
export interface RelationshipPattern {
  id: string;                  // UUID
  userId: string;              // UUID
  contactId: string;           // UUID
  contactName: string;

  // Interaction history
  firstInteraction: string;    // ISO8601
  lastInteraction?: string;    // ISO8601
  totalInteractions: number;

  // Computed rhythm
  avgDaysBetweenInteractions?: number;
  typicalInteractionDays?: string[];   // ['Monday', 'Thursday']
  typicalTimeOfDay?: string[];         // ['morning']

  // Relationship health
  daysSinceLastInteraction?: number;
  interactionTrend: EngagementTrend;

  // Proactive nudging
  suggestedNextInteraction?: string;   // ISO8601
  nudgeIfGapExceedsDays?: number;

  updatedAt: string;           // ISO8601
}

/**
 * Periodic snapshot of relationship state for time-series analysis.
 */
export interface RelationshipSnapshot {
  id: string;                  // UUID
  userId: string;              // UUID
  contactId: string;           // UUID
  snapshotDate: string;        // ISO8601 date only (YYYY-MM-DD)

  // Interaction metrics for this period
  interactionsCount: number;
  totalInteractions: number;   // Cumulative
  avgSentiment?: number;       // Rolling average

  // Trajectory
  engagementTrend: EngagementTrend;
  lastInteraction?: string;    // ISO8601
  daysSinceInteraction: number;

  // Reciprocity balance
  favorsGiven: number;
  favorsReceived: number;
  reciprocityBalance: number;  // Positive = they owe you

  // Open items count
  openLoopsToThem: number;     // Things you owe them
  openLoopsFromThem: number;   // Things they owe you
}

// ============================================================================
// ADAPTIVE WEIGHT LEARNING
// ============================================================================

/**
 * Log entry for memory retrieval, used for adaptive learning.
 */
export interface RetrievalLog {
  id: string;                  // UUID
  userId: string;              // UUID
  memoryId: string;            // UUID
  retrievedAt: string;         // ISO8601

  // What was retrieved
  query?: string;              // Search query that triggered retrieval
  salienceComponents: SalienceComponents;
  salienceScore: number;

  // Outcome
  resultedInAction: boolean;   // Did user act on this memory?
  actionType?: string;         // Type of action taken
  userFeedback?: 'helpful' | 'not_helpful' | 'neutral';
}

/**
 * User-specific learned weights, updated periodically.
 */
export interface LearnedWeights {
  userId: string;              // UUID
  weights: SalienceWeights;
  sampleSize: number;          // How many retrievals informed this
  lastRecalculatedAt: string;  // ISO8601
  confidence: number;          // 0-1 how confident we are in these weights
}

// ============================================================================
// PRE-CONVERSATION BRIEFING
// ============================================================================

/**
 * Complete briefing assembled before talking to someone.
 */
export interface ConversationBriefing {
  // Who
  contactId: string;
  contactName: string;

  // Relationship status
  relationship: {
    howMet?: string;
    firstInteraction?: string;
    lastInteraction?: string;
    daysSinceLastInteraction?: number;
    totalInteractions: number;
    trend: EngagementTrend;
  };

  // Their upcoming events
  theirTimeline: PersonTimelineEvent[];

  // Open loops
  openLoops: {
    youOweThem: OpenLoop[];
    theyOweYou: OpenLoop[];
    mutual: OpenLoop[];
  };

  // Recent context
  recentMemories: BriefingMemory[];
  highSalienceMemories: BriefingMemory[];

  // Sentiment
  recentSentiment?: number;    // Average sentiment of recent conversations

  // Suggestions
  suggestedTopics: string[];
  sensitivities: string[];     // Things to be careful about

  // Generated at
  generatedAt: string;         // ISO8601
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

// ============================================================================
// ENRICHED MEMORY (extends MemoryMemento)
// ============================================================================

/**
 * Extension of MemoryMemento with salience data.
 * This is what gets stored after salience enrichment.
 */
export interface EnrichedMemoryData {
  // Salience scoring
  salience: SalienceScore;

  // Extracted features
  extractedFeatures: ExtractedFeatures;

  // Context at capture
  captureContext: CaptureContext;

  // Retrieval tracking
  lastRetrievedAt?: string;    // ISO8601
  retrievalCount: number;

  // Computed flags
  hasFutureReferences: boolean;
  hasOpenLoops: boolean;
  earliestDueDate?: string;    // ISO8601 - for deadline proximity boosting

  // Version
  salienceVersion: string;     // Version of salience algorithm used
}

/**
 * Memory document stored in the memories collection.
 */
/**
 * Security tier for memory classification.
 * Determines encryption level, LLM routing, and storage behavior.
 *
 * - Tier1_General: Standard encryption, external LLM OK, vectors in Weaviate
 * - Tier2_Personal: Enhanced encryption, local LLM only (Ollama), vectors in Weaviate
 * - Tier3_Vault: Maximum security, no LLM processing, no vectors, heuristic only
 */
export type SecurityTier = 'Tier1_General' | 'Tier2_Personal' | 'Tier3_Vault';

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
  // Security tier classification
  securityTier?: SecurityTier;
  // Encryption metadata (for Tier2/3)
  encrypted?: boolean;
  encryptionVersion?: string;
  [key: string]: unknown;
}

// ============================================================================
// LLM EXTRACTION PROMPT RESPONSE
// ============================================================================

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
  confidence: number;          // 0-1
  reasoning?: string;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

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
  closeContacts: string[];     // Names or IDs
  knownContacts: string[];     // All contacts
  recentTopics: string[];      // Topics from recent conversations
}

/**
 * Time-aware retrieval options.
 */
export type TemporalFocus =
  | 'recent'
  | 'this_week'
  | 'historical'
  | 'upcoming'
  | 'default';

export interface RetrievalOptions {
  query: string;
  userId: string;
  temporalFocus?: TemporalFocus;
  contactId?: string;          // Filter to specific person
  minSalience?: number;        // Minimum salience score
  limit?: number;
}
