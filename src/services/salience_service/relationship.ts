/**
 * @file Relationship Synthesis - No Stored Graph
 *
 * Revolutionary approach: Don't store relationships. Store memories.
 * Synthesize relationships on demand via LLM.
 *
 * Traditional: (Alan)-[:WORKS_WITH]->(Bob) - rigid, context-blind
 * Our way: Get memories between Alan & Bob, ask LLM what the relationship is NOW
 *
 * "Walk through the cloud and coalesce what you need, when you need it"
 */

// ============================================================================
// Entity Relationship - Lightweight Evidence Tracker
// ============================================================================

/**
 * We don't store THE relationship. We store EVIDENCE of relationship.
 * The relationship itself is synthesized from evidence on demand.
 */
export interface EntityRelationship {
  // Identity
  entityA: string;
  entityB: string;
  relationshipId: string;          // `${entityA}:${entityB}` sorted

  // Evidence pointers (NOT the relationship itself)
  sharedMemoryIds: string[];       // Memories involving both entities

  // Lightweight counters for quick queries
  interactionCount: number;
  lastInteraction: string;
  firstInteraction: string;

  // Pressure flow between them (from entity pressure tracking)
  pressureBalance: number;         // Positive = A gives to B, negative = B gives to A
  pressureHistory: {
    timestamp: string;
    delta: number;
    memoryId: string;
  }[];

  // Cache for synthesis (invalidated on significant memories)
  cache?: RelationshipCache;
}

export interface RelationshipCache {
  synthesis: string;               // LLM-generated description
  sentiment: number;               // -1 to +1
  strength: number;                // 0 to 1 (based on interaction frequency)
  recentTrend: 'improving' | 'stable' | 'declining';
  keyMemoryIds: string[];          // Most significant memories used
  generatedAt: string;
  dirty: boolean;                  // Needs refresh on next query
}

// ============================================================================
// Relationship Synthesis Result
// ============================================================================

export interface RelationshipSynthesis {
  entityA: string;
  entityB: string;

  // The actual synthesis
  synthesis: string;               // Human-readable description

  // Derived metrics
  sentiment: number;               // -1 to +1
  strength: number;                // 0 to 1
  recentTrend: 'improving' | 'stable' | 'declining';

  // Evidence
  keyMemories: {
    memoryId: string;
    text: string;
    timestamp: string;
    significance: string;          // Why this memory matters
  }[];

  // Context-specific (if context was provided)
  contextualNote?: string;         // "Regarding work: ..."

  // Meta
  confidence: number;              // Based on evidence quantity
  lastUpdated: string;
  fromCache: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new relationship tracker between two entities
 */
export function createRelationship(
  entityA: string,
  entityB: string
): EntityRelationship {
  // Sort to ensure consistent ID regardless of order
  const sorted = [entityA, entityB].sort();
  const now = new Date().toISOString();

  return {
    entityA: sorted[0],
    entityB: sorted[1],
    relationshipId: `${sorted[0]}:${sorted[1]}`,
    sharedMemoryIds: [],
    interactionCount: 0,
    lastInteraction: now,
    firstInteraction: now,
    pressureBalance: 0,
    pressureHistory: [],
  };
}

/**
 * Add a memory to the relationship evidence
 */
export function addMemoryToRelationship(
  relationship: EntityRelationship,
  memoryId: string,
  salience: number,
  pressureDelta?: number
): EntityRelationship {
  const now = new Date().toISOString();

  // Add memory to evidence
  if (!relationship.sharedMemoryIds.includes(memoryId)) {
    relationship.sharedMemoryIds.push(memoryId);
    relationship.interactionCount++;
    relationship.lastInteraction = now;
  }

  // Track pressure if provided
  if (pressureDelta !== undefined && pressureDelta !== 0) {
    relationship.pressureBalance += pressureDelta;
    relationship.pressureHistory.push({
      timestamp: now,
      delta: pressureDelta,
      memoryId,
    });

    // Keep pressure history bounded
    if (relationship.pressureHistory.length > 100) {
      relationship.pressureHistory = relationship.pressureHistory.slice(-100);
    }
  }

  // Dirty the cache if this is a significant memory
  if (salience > 0.7 && relationship.cache) {
    relationship.cache.dirty = true;
  }

  return relationship;
}

/**
 * Generate a relationship ID from two entity IDs (order-independent)
 */
export function getRelationshipId(entityA: string, entityB: string): string {
  const sorted = [entityA, entityB].sort();
  return `${sorted[0]}:${sorted[1]}`;
}

// ============================================================================
// Synthesis Prompt Generator
// ============================================================================

/**
 * Generate the prompt for LLM relationship synthesis
 */
export function generateSynthesisPrompt(
  entityA: string,
  entityB: string,
  memories: { text: string; timestamp: string; salience?: number }[],
  pressureBalance: number,
  context?: string
): string {
  const memoryList = memories
    .map((m, i) => `${i + 1}. [${m.timestamp.split('T')[0]}] ${m.text}`)
    .join('\n');

  const pressureNote = pressureBalance > 0.5
    ? `Note: ${entityA} has been giving more support/pressure to ${entityB}.`
    : pressureBalance < -0.5
    ? `Note: ${entityB} has been giving more support/pressure to ${entityA}.`
    : '';

  const contextNote = context
    ? `Focus specifically on their relationship regarding: ${context}`
    : '';

  return `Analyze the relationship between "${entityA}" and "${entityB}" based on these memories:

${memoryList}

${pressureNote}
${contextNote}

Provide:
1. A 2-3 sentence synthesis of their relationship (natural language, like you'd describe it to a friend)
2. Overall sentiment (-1 = hostile, 0 = neutral, +1 = warm)
3. Relationship strength (0 = barely know each other, 1 = deeply connected)
4. Recent trend (improving, stable, or declining based on recent vs older memories)
5. The 2-3 most significant memories and WHY they're significant

Be specific. Note tensions AND strengths. Note changes over time.
Don't be generic - use evidence from the memories.

Respond in JSON format:
{
  "synthesis": "...",
  "sentiment": 0.0,
  "strength": 0.0,
  "recentTrend": "stable",
  "keyMemories": [
    { "index": 1, "significance": "why this matters" },
    ...
  ]
}`;
}

// ============================================================================
// Cache Management
// ============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if cached synthesis is still valid
 */
export function isCacheValid(cache: RelationshipCache | undefined): boolean {
  if (!cache) return false;
  if (cache.dirty) return false;

  const age = Date.now() - new Date(cache.generatedAt).getTime();
  return age < CACHE_TTL_MS;
}

/**
 * Create cache from synthesis result
 */
export function createCache(
  synthesis: RelationshipSynthesis
): RelationshipCache {
  return {
    synthesis: synthesis.synthesis,
    sentiment: synthesis.sentiment,
    strength: synthesis.strength,
    recentTrend: synthesis.recentTrend,
    keyMemoryIds: synthesis.keyMemories.map(m => m.memoryId),
    generatedAt: new Date().toISOString(),
    dirty: false,
  };
}

// ============================================================================
// Relationship Query Options
// ============================================================================

export interface RelationshipQueryOptions {
  context?: string;                // "regarding work", "regarding trust"
  forceRefresh?: boolean;          // Ignore cache
  includeMemories?: boolean;       // Include full memory text in response
  maxMemories?: number;            // Limit memories for synthesis (default 20)
}

export interface RelationshipListOptions {
  entityId: string;
  minInteractions?: number;        // Filter by interaction count
  minStrength?: number;            // Filter by relationship strength
  includeStale?: boolean;          // Include relationships with dirty cache
  context?: string;                // Context for synthesis
  limit?: number;                  // Max relationships to return
}

// ============================================================================
// Relationship Insights
// ============================================================================

/**
 * Quick relationship stats without full synthesis
 */
export interface RelationshipStats {
  entityA: string;
  entityB: string;
  interactionCount: number;
  firstInteraction: string;
  lastInteraction: string;
  daysSinceLastInteraction: number;
  pressureBalance: number;
  hasCachedSynthesis: boolean;
  cacheAge?: number;               // Hours since cache generated
}

export function getRelationshipStats(
  relationship: EntityRelationship
): RelationshipStats {
  const now = Date.now();
  const lastInteractionDate = new Date(relationship.lastInteraction).getTime();
  const daysSince = Math.floor((now - lastInteractionDate) / (1000 * 60 * 60 * 24));

  return {
    entityA: relationship.entityA,
    entityB: relationship.entityB,
    interactionCount: relationship.interactionCount,
    firstInteraction: relationship.firstInteraction,
    lastInteraction: relationship.lastInteraction,
    daysSinceLastInteraction: daysSince,
    pressureBalance: relationship.pressureBalance,
    hasCachedSynthesis: !!relationship.cache && !relationship.cache.dirty,
    cacheAge: relationship.cache
      ? Math.floor((now - new Date(relationship.cache.generatedAt).getTime()) / (1000 * 60 * 60))
      : undefined,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Find relationships that need cache refresh
 * (High interaction count but stale/dirty cache)
 */
export function findStaleRelationships(
  relationships: EntityRelationship[],
  minInteractions: number = 5
): EntityRelationship[] {
  return relationships.filter(r =>
    r.interactionCount >= minInteractions &&
    (!r.cache || r.cache.dirty || !isCacheValid(r.cache))
  );
}

/**
 * Find the most active relationships for an entity
 */
export function findActiveRelationships(
  relationships: EntityRelationship[],
  entityId: string,
  limit: number = 10
): EntityRelationship[] {
  return relationships
    .filter(r => r.entityA === entityId || r.entityB === entityId)
    .sort((a, b) => b.interactionCount - a.interactionCount)
    .slice(0, limit);
}
