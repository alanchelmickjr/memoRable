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
