/**
 * @file Prediction Hooks - Surface Before They Ask
 *
 * NORTH STAR: Real memory isn't "query → answer"
 * Real memory is "context shifts → relevant thing appears → 'Oh right!'"
 *
 * Hooks are generated at INGEST time. They fire at CONTEXT CHANGE time.
 * The LLM runs once (ingest) to generate hooks, not on every query.
 *
 * "Betty's doll knows to remind her about salt before the daughter calls"
 */

// ============================================================================
// Prediction Hook Types
// ============================================================================

export interface PredictionHook {
  hookId: string;
  memoryId: string;                 // Memory to surface when hook fires
  entityId: string;                 // Whose context to monitor

  // Trigger conditions (ALL must match for hook to fire)
  conditions: HookCondition[];

  // What to surface
  priority: HookPriority;
  surfaceText?: string;             // Optional custom text (else use memory text)

  // Lifecycle
  createdAt: string;
  expiresAt?: string;               // Some hooks are temporary (e.g., "remind tomorrow")

  // Tracking
  firedCount: number;
  lastFired?: string;
  cooldownMs: number;               // Minimum time between firings

  // Learning
  feedbackHistory: HookFeedback[];
  confidence: number;               // Adjusted based on feedback
  disabled: boolean;                // Can be disabled if feedback is bad
}

export type HookPriority = 'critical' | 'high' | 'medium' | 'low';

export interface HookCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: string | string[] | number | boolean;
  weight?: number;                  // For fuzzy matching (0-1)
}

export type ConditionType =
  // Entity-based
  | 'talking_to'                    // Currently interacting with this entity
  | 'mentioned'                     // Entity/topic mentioned in conversation
  | 'nearby'                        // Entity detected nearby (AR, sensors)

  // Location-based
  | 'location'                      // Physical location name
  | 'location_type'                 // "home", "work", "transit", etc.

  // Activity-based
  | 'activity'                      // What user is doing
  | 'activity_type'                 // "coding", "meeting", "cooking", etc.

  // Time-based
  | 'time_of_day'                   // "morning", "afternoon", "evening"
  | 'day_of_week'                   // "monday", "weekend", etc.
  | 'time_pattern'                  // Recurring pattern ID

  // Calendar-based
  | 'calendar_event'                // Event title/attendees
  | 'minutes_until_event'           // Number range

  // Device-based
  | 'device_type'                   // "mobile", "glasses", "doll", etc.
  | 'device_id'                     // Specific device

  // Emotional/state
  | 'emotional_state'               // Detected emotion
  | 'stress_level'                  // "low", "medium", "high"

  // Topic/content
  | 'topic'                         // Conversation topic
  | 'keyword'                       // Specific keyword mentioned

  // Open loop related
  | 'open_loop_entity'              // Open loop exists with this entity
  | 'open_loop_overdue';            // Has overdue open loop

export type ConditionOperator =
  | 'equals'                        // Exact match
  | 'not_equals'                    // Not equal
  | 'contains'                      // String contains / array includes
  | 'matches'                       // Regex match
  | 'greater_than'                  // Numeric comparison
  | 'less_than'
  | 'between'                       // Number in range [min, max]
  | 'near';                         // Fuzzy/proximity match

// ============================================================================
// Hook Feedback
// ============================================================================

export interface HookFeedback {
  timestamp: string;
  wasUseful: boolean;               // Did user engage with surfaced memory?
  interactionType: 'dismissed' | 'viewed' | 'acted_on' | 'saved' | 'blocked';
  context?: string;                 // What was happening when feedback given
}

// ============================================================================
// Context Frame (What we monitor)
// ============================================================================

export interface ContextFrame {
  entityId: string;
  timestamp: string;

  // Entity context
  talkingTo?: string[];             // Entity IDs currently interacting with
  mentioned?: string[];             // Recently mentioned entities/topics
  nearby?: string[];                // Detected nearby (sensors)

  // Location
  location?: string;
  locationType?: string;

  // Activity
  activity?: string;
  activityType?: string;

  // Time
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek?: string;
  matchedTimePatterns?: string[];

  // Calendar
  currentEvent?: {
    title: string;
    attendees: string[];
  };
  nextEvent?: {
    title: string;
    attendees: string[];
    minutesUntil: number;
  };

  // Device
  deviceType?: string;
  deviceId?: string;

  // Emotional state
  emotionalState?: string;
  stressLevel?: 'low' | 'medium' | 'high';

  // Topics
  topics?: string[];
  keywords?: string[];

  // Open loops
  openLoopEntities?: string[];
  hasOverdueLoops?: boolean;
}

// ============================================================================
// Surfaced Memory (What we return when hooks fire)
// ============================================================================

export interface SurfacedMemory {
  hookId: string;
  memoryId: string;
  surfaceText: string;
  priority: HookPriority;
  matchedConditions: string[];      // Which conditions triggered this
  confidence: number;
  timestamp: string;
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * Create a new prediction hook
 */
export function createHook(
  memoryId: string,
  entityId: string,
  conditions: HookCondition[],
  options?: {
    priority?: HookPriority;
    surfaceText?: string;
    expiresAt?: string;
    cooldownMs?: number;
  }
): PredictionHook {
  const now = new Date().toISOString();

  return {
    hookId: `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    memoryId,
    entityId,
    conditions,
    priority: options?.priority || 'medium',
    surfaceText: options?.surfaceText,
    createdAt: now,
    expiresAt: options?.expiresAt,
    firedCount: 0,
    cooldownMs: options?.cooldownMs || 60 * 60 * 1000, // Default 1 hour
    feedbackHistory: [],
    confidence: 1.0,
    disabled: false,
  };
}

// ============================================================================
// Condition Matching
// ============================================================================

/**
 * Check if a single condition matches the context
 */
export function conditionMatches(
  condition: HookCondition,
  context: ContextFrame
): boolean {
  const contextValue = getContextValue(condition.type, context);

  if (contextValue === undefined || contextValue === null) {
    return false;
  }

  switch (condition.operator) {
    case 'equals':
      return contextValue === condition.value;

    case 'not_equals':
      return contextValue !== condition.value;

    case 'contains':
      if (Array.isArray(contextValue)) {
        if (Array.isArray(condition.value)) {
          return condition.value.some(v => contextValue.includes(v));
        }
        return contextValue.includes(condition.value as string);
      }
      if (typeof contextValue === 'string' && typeof condition.value === 'string') {
        return contextValue.toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;

    case 'matches':
      if (typeof contextValue === 'string' && typeof condition.value === 'string') {
        try {
          return new RegExp(condition.value, 'i').test(contextValue);
        } catch {
          return false;
        }
      }
      return false;

    case 'greater_than':
      return typeof contextValue === 'number' &&
             typeof condition.value === 'number' &&
             contextValue > condition.value;

    case 'less_than':
      return typeof contextValue === 'number' &&
             typeof condition.value === 'number' &&
             contextValue < condition.value;

    case 'between':
      if (typeof contextValue === 'number' && Array.isArray(condition.value)) {
        const [min, max] = condition.value as number[];
        return contextValue >= min && contextValue <= max;
      }
      return false;

    case 'near':
      // Fuzzy matching - for location proximity, string similarity, etc.
      // Implementation depends on context type
      return fuzzyMatch(contextValue, condition.value, condition.weight || 0.8);

    default:
      return false;
  }
}

/**
 * Get value from context for a condition type
 */
function getContextValue(
  type: ConditionType,
  context: ContextFrame
): unknown {
  switch (type) {
    case 'talking_to': return context.talkingTo;
    case 'mentioned': return context.mentioned;
    case 'nearby': return context.nearby;
    case 'location': return context.location;
    case 'location_type': return context.locationType;
    case 'activity': return context.activity;
    case 'activity_type': return context.activityType;
    case 'time_of_day': return context.timeOfDay;
    case 'day_of_week': return context.dayOfWeek;
    case 'time_pattern': return context.matchedTimePatterns;
    case 'calendar_event': return context.currentEvent?.title;
    case 'minutes_until_event': return context.nextEvent?.minutesUntil;
    case 'device_type': return context.deviceType;
    case 'device_id': return context.deviceId;
    case 'emotional_state': return context.emotionalState;
    case 'stress_level': return context.stressLevel;
    case 'topic': return context.topics;
    case 'keyword': return context.keywords;
    case 'open_loop_entity': return context.openLoopEntities;
    case 'open_loop_overdue': return context.hasOverdueLoops;
    default: return undefined;
  }
}

/**
 * Simple fuzzy matching (can be enhanced)
 */
function fuzzyMatch(
  actual: unknown,
  expected: unknown,
  threshold: number
): boolean {
  if (typeof actual === 'string' && typeof expected === 'string') {
    // Simple case-insensitive contains for now
    // Could add Levenshtein distance, etc.
    return actual.toLowerCase().includes(expected.toLowerCase()) ||
           expected.toLowerCase().includes(actual.toLowerCase());
  }
  return actual === expected;
}

// ============================================================================
// Hook Evaluation
// ============================================================================

/**
 * Check if a hook should fire given current context
 */
export function shouldFireHook(
  hook: PredictionHook,
  context: ContextFrame
): { shouldFire: boolean; matchedConditions: string[] } {
  // Check if disabled or expired
  if (hook.disabled) {
    return { shouldFire: false, matchedConditions: [] };
  }

  if (hook.expiresAt && new Date(hook.expiresAt) < new Date()) {
    return { shouldFire: false, matchedConditions: [] };
  }

  // Check cooldown
  if (hook.lastFired) {
    const timeSinceLastFire = Date.now() - new Date(hook.lastFired).getTime();
    if (timeSinceLastFire < hook.cooldownMs) {
      return { shouldFire: false, matchedConditions: [] };
    }
  }

  // Check all conditions
  const matchedConditions: string[] = [];

  for (const condition of hook.conditions) {
    if (conditionMatches(condition, context)) {
      matchedConditions.push(`${condition.type}:${condition.value}`);
    } else {
      // ALL conditions must match
      return { shouldFire: false, matchedConditions: [] };
    }
  }

  return { shouldFire: true, matchedConditions };
}

/**
 * Mark a hook as fired
 */
export function markHookFired(hook: PredictionHook): PredictionHook {
  return {
    ...hook,
    firedCount: hook.firedCount + 1,
    lastFired: new Date().toISOString(),
  };
}

/**
 * Record feedback for a hook
 */
export function recordHookFeedback(
  hook: PredictionHook,
  feedback: Omit<HookFeedback, 'timestamp'>
): PredictionHook {
  const newFeedback: HookFeedback = {
    ...feedback,
    timestamp: new Date().toISOString(),
  };

  // Adjust confidence based on feedback
  let confidenceDelta = 0;
  switch (feedback.interactionType) {
    case 'acted_on':
    case 'saved':
      confidenceDelta = 0.1;
      break;
    case 'viewed':
      confidenceDelta = 0.02;
      break;
    case 'dismissed':
      confidenceDelta = -0.05;
      break;
    case 'blocked':
      confidenceDelta = -0.3;
      break;
  }

  const newConfidence = Math.max(0, Math.min(1, hook.confidence + confidenceDelta));

  // Disable if confidence drops too low
  const shouldDisable = newConfidence < 0.2 ||
    (feedback.interactionType === 'blocked');

  return {
    ...hook,
    feedbackHistory: [...hook.feedbackHistory.slice(-20), newFeedback], // Keep last 20
    confidence: newConfidence,
    disabled: shouldDisable,
  };
}

// ============================================================================
// Context Monitor
// ============================================================================

/**
 * Evaluate all hooks for an entity against current context
 */
export function evaluateHooks(
  hooks: PredictionHook[],
  context: ContextFrame
): SurfacedMemory[] {
  const surfaced: SurfacedMemory[] = [];

  for (const hook of hooks) {
    // Skip if not for this entity
    if (hook.entityId !== context.entityId) continue;

    const { shouldFire, matchedConditions } = shouldFireHook(hook, context);

    if (shouldFire) {
      surfaced.push({
        hookId: hook.hookId,
        memoryId: hook.memoryId,
        surfaceText: hook.surfaceText || '', // Will be filled from memory
        priority: hook.priority,
        matchedConditions,
        confidence: hook.confidence,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Sort by priority (critical first) then confidence
  const priorityOrder: Record<HookPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return surfaced
    .sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    })
    .slice(0, 3); // Don't overwhelm - max 3 surfaces
}

// ============================================================================
// Hook Generation Prompt
// ============================================================================

/**
 * Generate prompt for LLM to create hooks at ingest time
 */
export function generateHookPrompt(
  memoryText: string,
  entities: string[],
  openLoops?: { id: string; description: string }[]
): string {
  const loopInfo = openLoops?.length
    ? `\nOpen loops created: ${openLoops.map(l => l.description).join(', ')}`
    : '';

  return `Analyze this memory and generate prediction hooks.
A hook defines WHEN this memory should be proactively surfaced.

Memory: "${memoryText}"
Entities involved: ${entities.join(', ')}${loopInfo}

Generate 1-3 hooks. Think about:
- Who needs to know this?
- When would it be most useful?
- What context would trigger relevance?

For each hook, specify:
- conditions: Array of {type, operator, value} - all must match
- priority: "critical" | "high" | "medium" | "low"
- surfaceText: Optional custom reminder text

Condition types: talking_to, mentioned, nearby, location, location_type,
activity, activity_type, time_of_day, day_of_week, calendar_event,
minutes_until_event, device_type, emotional_state, topic, keyword,
open_loop_entity, open_loop_overdue

Operators: equals, contains, matches, greater_than, less_than, between

Example for "Doctor said reduce salt":
{
  "hooks": [
    {
      "conditions": [
        {"type": "talking_to", "operator": "contains", "value": "daughter"},
        {"type": "topic", "operator": "contains", "value": ["groceries", "food", "shopping"]}
      ],
      "priority": "high",
      "surfaceText": "Remember to ask about low-sodium options"
    },
    {
      "conditions": [
        {"type": "activity_type", "operator": "equals", "value": "cooking"}
      ],
      "priority": "medium"
    }
  ]
}

Respond with JSON only.`;
}

// ============================================================================
// Exports for testing
// ============================================================================

export const _internal = {
  getContextValue,
  fuzzyMatch,
};
