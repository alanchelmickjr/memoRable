/**
 * @file Entity Model - The Node in the Memory Graph
 *
 * FUNDAMENTAL PRINCIPLE: Entities are the nodes, not users.
 *
 * An Entity can be:
 * - A person (Alan, Betty, the Nurse)
 * - An organization (Company A, Omni Corp)
 * - A device (AR glasses, companion doll, Buddi pendant)
 * - A robot
 * - A toy
 * - Anything that needs memory
 *
 * Key properties:
 * - Entities OWN memories (not users)
 * - Entities have their own open loops
 * - Entities have their own prediction weights
 * - Entities can have an OWNER (another entity)
 * - Entities can transfer between owners
 * - Memories usually stay with the entity
 *
 * Conference call example:
 *   Company A says "I want 3 dogs"
 *   Company B says "no problem as soon as Company D provides 4 bowls"
 *   Company C says "I want one of those dogs"
 *
 * One memory event → 4 entity nodes affected → each has their own open loops
 */

// ============================================================================
// Entity Types
// ============================================================================

export type EntityType =
  // People
  | 'person'
  | 'contact'           // Someone you interact with but isn't a user

  // Organizations
  | 'organization'
  | 'company'
  | 'team'

  // Devices (sensors in the world)
  | 'device'            // Generic device
  | 'companion'         // Companion doll/robot (Betty's doll)
  | 'pendant'           // Wearable pendant (Buddi)
  | 'smartglasses'      // AR glasses (Omi)
  | 'robot'             // Full mobility robot
  | 'toy'               // Interactive toy (Omni corp gadgets)
  | 'vehicle'           // Car, bike with sensors
  | 'smarthome'         // Smart home device

  // Abstract
  | 'project'           // A project or initiative
  | 'topic'             // A subject matter
  | 'location'          // A place

  // System
  | 'system';           // System-level entity

// ============================================================================
// Entity Interface
// ============================================================================

export interface Entity {
  // Identity
  entityId: string;              // Unique identifier (e.g., "person_alan", "device_betty_doll_001")
  entityType: EntityType;
  name: string;                  // Display name
  aliases?: string[];            // Other names this entity is known by

  // Ownership & Access
  ownerId?: string;              // entityId of owner (e.g., Betty owns the doll)
  accessibleBy?: string[];       // entityIds that can access this entity's memories
  isTransferable?: boolean;      // Can this entity change owners?

  // Timestamps
  createdAt: string;             // ISO8601
  updatedAt: string;
  lastInteraction?: string;      // Last time this entity was involved in a memory

  // Metadata
  metadata?: Record<string, unknown>;

  // For devices
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    firmwareVersion?: string;
    capabilities?: string[];     // ["audio", "video", "servo", "gps"]
  };

  // For people/contacts
  contactInfo?: {
    relationship?: string;       // "colleague", "family", "friend"
    organization?: string;
    role?: string;
  };

  // For organizations
  orgInfo?: {
    industry?: string;
    size?: string;
    parentOrg?: string;          // entityId of parent organization
  };

  // Learning state (each entity has its own)
  learningState?: {
    salienceWeights?: Record<string, number>;  // Personalized weights
    patternConfidence?: number;                 // 0-1, how confident in patterns
    dataCollectionDays?: number;                // Days of data collected
  };
}

// ============================================================================
// Entity Participant - How an entity participated in a memory
// ============================================================================

export interface EntityParticipant {
  entityId: string;
  entityType: EntityType;
  name: string;
  role: ParticipantRole;
  confidence: number;            // 0-1, how sure we are they participated

  // What this entity's perspective created
  openLoopsCreated?: string[];   // Loop IDs from their perspective
  commitmentsFrom?: string[];    // Commitments this entity made
  commitmentsTo?: string[];      // Commitments made TO this entity
}

export type ParticipantRole =
  | 'speaker'           // Said something
  | 'listener'          // Was present, listening
  | 'mentioned'         // Was mentioned but not present
  | 'subject'           // The memory is ABOUT them
  | 'owner'             // Owns the capturing device
  | 'source'            // The device that captured this
  | 'recipient'         // Received a commitment/request
  | 'obligated'         // Has an obligation (may not know it yet!)
  | 'dependent';        // Depends on this memory's outcome

// ============================================================================
// Memory-Entity Link - The edge in the graph
// ============================================================================

export interface MemoryEntityLink {
  memoryId: string;
  entityId: string;
  role: ParticipantRole;
  perspective?: EntityPerspective;
  createdAt: string;
}

export interface EntityPerspective {
  // This entity's view of the memory
  salienceScore?: number;        // Salience from THEIR perspective
  openLoopIds?: string[];        // Loops created for THEM
  relevanceToGoals?: string[];   // Their goals this relates to
  actionRequired?: boolean;      // Do THEY need to do something?
}

// ============================================================================
// Entity Resolution - Matching mentions to entities
// ============================================================================

export interface EntityMention {
  rawText: string;               // "Company A", "the glasses", "Betty"
  resolvedEntityId?: string;     // If we matched to a known entity
  entityType?: EntityType;       // Inferred type
  confidence: number;
  context?: string;              // Surrounding text for disambiguation
}

// ============================================================================
// Default Entity Factory
// ============================================================================

export function createEntity(
  entityId: string,
  entityType: EntityType,
  name: string,
  options?: Partial<Entity>
): Entity {
  const now = new Date().toISOString();

  return {
    entityId,
    entityType,
    name,
    createdAt: now,
    updatedAt: now,
    isTransferable: entityType !== 'person', // People don't transfer ownership
    ...options,
  };
}

export function createDeviceEntity(
  deviceId: string,
  deviceType: EntityType,
  name: string,
  ownerId: string,
  capabilities?: string[]
): Entity {
  return createEntity(deviceId, deviceType, name, {
    ownerId,
    isTransferable: true,
    deviceInfo: {
      capabilities,
    },
  });
}

export function createPersonEntity(
  personId: string,
  name: string,
  aliases?: string[]
): Entity {
  return createEntity(personId, 'person', name, {
    aliases,
    isTransferable: false,
  });
}

export function createOrgEntity(
  orgId: string,
  name: string,
  industry?: string
): Entity {
  return createEntity(orgId, 'organization', name, {
    isTransferable: false,
    orgInfo: { industry },
  });
}

// ============================================================================
// Entity Pressure Tracking - Butterfly → Hurricane Early Warning
// ============================================================================

/**
 * Tracks pressure accumulation on an entity.
 *
 * The butterfly effect: A wounded person wounds another.
 * The hurricane: Accumulated pain finding an exit.
 *
 * We don't predict tragedies. We measure pressure and surface to those who can help.
 */
export interface EntityPressure {
  entityId: string;

  // Incoming vectors - pressure received
  negativeInputs: PressureVector[];
  positiveInputs: PressureVector[];

  // Outgoing vectors - pressure transmitted
  negativeOutputs: PressureVector[];
  positiveOutputs: PressureVector[];

  // Accumulation metrics
  pressureScore: number;              // Current pressure level (can be negative = giving support)
  pressureTrend: 'rising' | 'stable' | 'falling';
  trendDuration: number;              // Days the trend has held

  // Pattern flags for early warning
  patterns: {
    receivingFromMultipleSources: boolean;   // Multiple stressors
    transmittingToOthers: boolean;           // Passing pain along
    behaviorChangeDetected: boolean;         // Acting differently
    isolating: boolean;                      // Fewer positive interactions
    escalating: boolean;                     // Intensity increasing over time
  };

  // NOT prediction - readiness for intervention
  interventionUrgency: 'none' | 'monitor' | 'concern' | 'urgent';

  // Who should be notified if concerning
  careCircle?: string[];              // entityIds of people who care about this entity

  // Timestamps
  lastUpdated: string;
  lastSignificantChange: string;
}

export interface PressureVector {
  sourceEntityId: string;             // Who/what caused this
  targetEntityId: string;             // Who received it
  memoryId: string;                   // The memory that captured this
  timestamp: string;

  intensity: number;                  // 0-1, how impactful
  valence: number;                    // -1 (negative) to +1 (positive)

  category?: PressureCategory;
  isRepeated: boolean;                // Part of a pattern?

  // Causal chain tracking
  cascadeDepth: number;               // 0 = direct, 1+ = downstream effect
  originMemoryId?: string;            // Where did this chain start?
}

export type PressureCategory =
  | 'criticism'
  | 'rejection'
  | 'disappointment'
  | 'conflict'
  | 'loss'
  | 'stress'
  | 'support'
  | 'encouragement'
  | 'connection'
  | 'achievement'
  | 'neutral';

/**
 * Get or create pressure tracking for an entity from database
 */
export async function getEntityPressure(entityId: string): Promise<EntityPressure> {
  // Import here to avoid circular dependency
  const { getDatabase } = await import('../../config/database.js');
  const db = getDatabase();

  // Try to get existing pressure
  const existing = await db.collection('entity_pressure').findOne({ entityId });
  if (existing) {
    return existing as EntityPressure;
  }

  // Create new pressure tracking
  const newPressure = createEntityPressure(entityId);
  await db.collection('entity_pressure').insertOne(newPressure);
  return newPressure;
}

/**
 * Create initial pressure tracking for an entity
 */
export function createEntityPressure(entityId: string): EntityPressure {
  const now = new Date().toISOString();

  return {
    entityId,
    negativeInputs: [],
    positiveInputs: [],
    negativeOutputs: [],
    positiveOutputs: [],
    pressureScore: 0,
    pressureTrend: 'stable',
    trendDuration: 0,
    patterns: {
      receivingFromMultipleSources: false,
      transmittingToOthers: false,
      behaviorChangeDetected: false,
      isolating: false,
      escalating: false,
    },
    interventionUrgency: 'none',
    lastUpdated: now,
    lastSignificantChange: now,
  };
}

/**
 * Add a pressure vector and recalculate state
 */
export function addPressureVector(
  pressure: EntityPressure,
  vector: PressureVector
): EntityPressure {
  const now = new Date().toISOString();
  const isNegative = vector.valence < 0;
  const isIncoming = vector.targetEntityId === pressure.entityId;

  // Add to appropriate array
  if (isIncoming) {
    if (isNegative) {
      pressure.negativeInputs.push(vector);
    } else {
      pressure.positiveInputs.push(vector);
    }
  } else {
    if (isNegative) {
      pressure.negativeOutputs.push(vector);
    } else {
      pressure.positiveOutputs.push(vector);
    }
  }

  // Recalculate pressure score
  // Negative inputs increase pressure, positive decrease
  // Negative outputs indicate pressure transmission
  const negIn = pressure.negativeInputs.reduce((sum, v) => sum + Math.abs(v.valence) * v.intensity, 0);
  const posIn = pressure.positiveInputs.reduce((sum, v) => sum + v.valence * v.intensity, 0);
  const negOut = pressure.negativeOutputs.reduce((sum, v) => sum + Math.abs(v.valence) * v.intensity, 0);

  const oldScore = pressure.pressureScore;
  pressure.pressureScore = negIn - posIn + (negOut * 0.5); // Transmitting adds to your pressure too

  // Update trend
  const scoreDelta = pressure.pressureScore - oldScore;
  if (Math.abs(scoreDelta) < 0.1) {
    pressure.pressureTrend = 'stable';
  } else if (scoreDelta > 0) {
    pressure.pressureTrend = 'rising';
  } else {
    pressure.pressureTrend = 'falling';
  }

  // Detect patterns
  const recentWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now_ms = Date.now();
  const recentNegInputs = pressure.negativeInputs.filter(
    v => now_ms - new Date(v.timestamp).getTime() < recentWindow
  );

  const uniqueNegSources = new Set(recentNegInputs.map(v => v.sourceEntityId));
  pressure.patterns.receivingFromMultipleSources = uniqueNegSources.size >= 2;

  const recentNegOutputs = pressure.negativeOutputs.filter(
    v => now_ms - new Date(v.timestamp).getTime() < recentWindow
  );
  pressure.patterns.transmittingToOthers = recentNegOutputs.length > 0;

  // Check for escalation (intensity increasing)
  if (recentNegInputs.length >= 3) {
    const sorted = [...recentNegInputs].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    const avgFirst = firstHalf.reduce((s, v) => s + v.intensity, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v.intensity, 0) / secondHalf.length;
    pressure.patterns.escalating = avgSecond > avgFirst * 1.2;
  }

  // Check for isolation (fewer positive interactions over time)
  // Compare first half of window to second half
  const recentPosInputs = pressure.positiveInputs.filter(
    v => now_ms - new Date(v.timestamp).getTime() < recentWindow
  );
  const midpoint = now_ms - (recentWindow / 2);

  const firstHalfPositive = recentPosInputs.filter(
    v => new Date(v.timestamp).getTime() < midpoint
  );
  const secondHalfPositive = recentPosInputs.filter(
    v => new Date(v.timestamp).getTime() >= midpoint
  );

  // Isolation detected if:
  // 1. Had positive interactions in first half but fewer/none in second half, OR
  // 2. Unique positive sources decreased significantly
  const firstHalfPositiveCount = firstHalfPositive.length;
  const secondHalfPositiveCount = secondHalfPositive.length;
  const uniqueFirstHalf = new Set(firstHalfPositive.map(v => v.sourceEntityId)).size;
  const uniqueSecondHalf = new Set(secondHalfPositive.map(v => v.sourceEntityId)).size;

  pressure.patterns.isolating = (
    // Had at least 2 positive interactions in first half, but fewer than half in second
    (firstHalfPositiveCount >= 2 && secondHalfPositiveCount < firstHalfPositiveCount * 0.5) ||
    // Or unique sources decreased by more than half
    (uniqueFirstHalf >= 2 && uniqueSecondHalf < uniqueFirstHalf * 0.5)
  );

  // Determine intervention urgency
  let urgencyScore = 0;
  if (pressure.patterns.receivingFromMultipleSources) urgencyScore++;
  if (pressure.patterns.transmittingToOthers) urgencyScore++;
  if (pressure.patterns.escalating) urgencyScore += 2;
  if (pressure.patterns.isolating) urgencyScore++;
  if (pressure.pressureScore > 2) urgencyScore++;
  if (pressure.pressureScore > 4) urgencyScore++;

  if (urgencyScore >= 5) {
    pressure.interventionUrgency = 'urgent';
  } else if (urgencyScore >= 3) {
    pressure.interventionUrgency = 'concern';
  } else if (urgencyScore >= 1) {
    pressure.interventionUrgency = 'monitor';
  } else {
    pressure.interventionUrgency = 'none';
  }

  pressure.lastUpdated = now;
  if (Math.abs(scoreDelta) > 0.5) {
    pressure.lastSignificantChange = now;
  }

  return pressure;
}

// ============================================================================
// Emotional Decay Observation - Learn Individual Patterns
// ============================================================================

/**
 * Observes how emotional intensity changes over time for each person.
 *
 * "My anger for the guy that ripped me off is gone after a year...
 *  but my feelings about my father's murder, much longer decay."
 *
 * We don't impose decay formulas. We OBSERVE decay empirically.
 */
export interface EmotionalDecayObservation {
  observationId: string;
  memoryId: string;
  entityId: string;                 // Whose decay are we observing

  // Temporal
  observedAt: string;
  daysSinceMemory: number;

  // Emotional state at observation
  emotionDetected: string;          // 'anger', 'sadness', 'neutral', etc.
  valence: number;                  // -1 to +1
  intensity: number;                // 0 to 1

  // Context
  triggerType: 'mentioned' | 'encountered' | 'reminded' | 'queried' | 'surfaced';
  context?: string;                 // What triggered this reference

  // For comparison
  originalValence: number;          // What was the valence at creation
  originalIntensity: number;
  decayRatio: number;               // intensity / originalIntensity
}

/**
 * Learned decay rate for an entity + category combination.
 * Built from observations over time.
 */
export interface LearnedDecayRate {
  entityId: string;
  category: string;                 // 'financial', 'trauma', 'social', 'professional', etc.

  // Learned parameters
  halfLife: number;                 // Days until intensity halves
  floor: number;                    // Minimum intensity (trauma may never fully decay)
  confidence: number;               // 0-1, based on observation count

  // Evidence
  observationCount: number;
  memoryIds: string[];              // Which memories contributed
  lastObserved: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a decay observation when a memory is referenced
 */
export function createDecayObservation(
  memoryId: string,
  entityId: string,
  memoryCreatedAt: string,
  originalValence: number,
  originalIntensity: number,
  currentEmotion: {
    emotion: string;
    valence: number;
    intensity: number;
  },
  triggerType: EmotionalDecayObservation['triggerType']
): EmotionalDecayObservation {
  const now = new Date();
  const created = new Date(memoryCreatedAt);
  const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

  return {
    observationId: `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    memoryId,
    entityId,
    observedAt: now.toISOString(),
    daysSinceMemory: daysSince,
    emotionDetected: currentEmotion.emotion,
    valence: currentEmotion.valence,
    intensity: currentEmotion.intensity,
    triggerType,
    originalValence,
    originalIntensity,
    decayRatio: originalIntensity > 0 ? currentEmotion.intensity / originalIntensity : 1,
  };
}

/**
 * Update learned decay rate based on new observations.
 * Uses simple exponential decay model: I(t) = I_0 * e^(-t/τ) + floor
 */
export function updateDecayRate(
  existing: LearnedDecayRate | null,
  observations: EmotionalDecayObservation[],
  category: string,
  entityId: string
): LearnedDecayRate {
  const now = new Date().toISOString();

  if (observations.length < 2) {
    // Not enough data to learn decay
    return existing || {
      entityId,
      category,
      halfLife: 180,              // Default 6 months
      floor: 0.1,                 // Default small floor
      confidence: 0,
      observationCount: observations.length,
      memoryIds: observations.map(o => o.memoryId),
      lastObserved: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Sort by days since memory
  const sorted = [...observations].sort((a, b) => a.daysSinceMemory - b.daysSinceMemory);

  // Estimate half-life from observations
  // Find when intensity dropped to ~50% of original
  let halfLife = 180; // Default
  let floor = 0.1;

  // Look for the observation closest to 50% decay
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].decayRatio <= 0.5 && sorted[i - 1].decayRatio > 0.5) {
      // Interpolate
      const ratio = (0.5 - sorted[i].decayRatio) / (sorted[i - 1].decayRatio - sorted[i].decayRatio);
      halfLife = sorted[i].daysSinceMemory - ratio * (sorted[i].daysSinceMemory - sorted[i - 1].daysSinceMemory);
      break;
    }
  }

  // Estimate floor from longest observation
  const oldest = sorted[sorted.length - 1];
  if (oldest.daysSinceMemory > halfLife * 3) {
    // If we have data past 3 half-lives, use that intensity as floor estimate
    floor = oldest.intensity;
  }

  // Confidence based on observation count and time span
  const timeSpan = sorted[sorted.length - 1].daysSinceMemory - sorted[0].daysSinceMemory;
  const confidence = Math.min(1, (observations.length / 5) * (timeSpan / 365));

  return {
    entityId,
    category,
    halfLife,
    floor,
    confidence,
    observationCount: (existing?.observationCount || 0) + observations.length,
    memoryIds: [...(existing?.memoryIds || []), ...observations.map(o => o.memoryId)],
    lastObserved: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Predict current emotional intensity using learned decay rate
 */
export function predictCurrentIntensity(
  originalIntensity: number,
  daysSinceMemory: number,
  decayRate: LearnedDecayRate
): number {
  // Exponential decay with floor: I(t) = (I_0 - floor) * e^(-ln(2) * t / halfLife) + floor
  const decayedPortion = (originalIntensity - decayRate.floor) *
    Math.exp(-Math.log(2) * daysSinceMemory / decayRate.halfLife);

  return Math.max(decayRate.floor, decayedPortion + decayRate.floor);
}

// ============================================================================
// Entity ID Helpers
// ============================================================================

export function generateEntityId(type: EntityType, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const suffix = Date.now().toString(36).slice(-4);
  return `${type}_${slug}_${suffix}`;
}

export function parseEntityId(entityId: string): { type: string; slug: string } | null {
  const parts = entityId.split('_');
  if (parts.length < 2) return null;
  return {
    type: parts[0],
    slug: parts.slice(1).join('_'),
  };
}
// Build timestamp: 20260122003620
