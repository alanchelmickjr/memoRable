/**
 * @file Synthetic Data Generators - Run the Pipes at Full Load
 *
 * "He didn't calculate for pipe friction" - Versailles Fountains, 1666
 *
 * This generates realistic synthetic data to stress test the entire pipeline:
 * - Entities (people, devices, organizations)
 * - Memories with realistic patterns
 * - Pressure events (cascade scenarios)
 * - Context streams (device telemetry)
 *
 * Goal: Find the leaks before production.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Entity, EntityType, EntityPressure, PressureVector, PressureCategory } from '../../src/services/salience_service/entity.js';
import type { PredictionHook, ContextFrame, HookCondition } from '../../src/services/salience_service/prediction_hooks.js';
import type { DeviceType } from '../../src/services/salience_service/device_context.js';

// ============================================================================
// Seed Data - The Cast of Characters
// ============================================================================

export const SEED_PEOPLE = {
  betty: {
    id: 'person_betty',
    name: 'Betty',
    type: 'person' as EntityType,
    traits: ['elderly', 'memory_issues', 'kind', 'lonely'],
    careCircle: ['person_sarah_daughter', 'person_dr_chen'],
    decayProfile: { trauma: 3650, social: 30, health: 90 }, // days to half-life
  },
  sarah: {
    id: 'person_sarah_daughter',
    name: 'Sarah',
    type: 'person' as EntityType,
    traits: ['caregiver', 'busy', 'loving', 'stressed'],
    relationship_to_betty: 'daughter',
    decayProfile: { trauma: 1825, social: 14, work: 60 },
  },
  alan: {
    id: 'person_alan',
    name: 'Alan',
    type: 'person' as EntityType,
    traits: ['technical', 'visionary', 'photographic_memory', 'kind'],
    decayProfile: { trauma: 10950, financial: 365, social: 60 }, // 30 years for trauma
  },
  dr_chen: {
    id: 'person_dr_chen',
    name: 'Dr. Chen',
    type: 'person' as EntityType,
    traits: ['medical', 'professional', 'caring'],
    relationship_to_betty: 'doctor',
  },
  bob: {
    id: 'person_bob',
    name: 'Bob',
    type: 'person' as EntityType,
    traits: ['colleague', 'technical', 'reliable'],
    relationship_to_alan: 'colleague',
  },
};

export const SEED_ORGANIZATIONS = {
  company_a: {
    id: 'org_company_a',
    name: 'Company A',
    type: 'organization' as EntityType,
    industry: 'retail',
  },
  company_b: {
    id: 'org_company_b',
    name: 'Company B',
    type: 'organization' as EntityType,
    industry: 'supply',
  },
  company_c: {
    id: 'org_company_c',
    name: 'Company C',
    type: 'organization' as EntityType,
    industry: 'retail',
  },
  company_d: {
    id: 'org_company_d',
    name: 'Company D',
    type: 'organization' as EntityType,
    industry: 'manufacturing',
  },
  omni_corp: {
    id: 'org_omni_corp',
    name: 'Omni Corp',
    type: 'organization' as EntityType,
    industry: 'toys',
  },
};

export const SEED_DEVICES = {
  betty_doll: {
    id: 'device_betty_doll',
    name: "Betty's Companion Doll",
    type: 'companion' as DeviceType,
    ownerId: 'person_betty',
    capabilities: ['audio', 'servo'],
  },
  alan_glasses: {
    id: 'device_alan_glasses',
    name: "Alan's AR Glasses",
    type: 'smartglasses' as DeviceType,
    ownerId: 'person_alan',
    capabilities: ['audio', 'video', 'gps'],
  },
  alan_pendant: {
    id: 'device_alan_pendant',
    name: "Alan's Buddi Pendant",
    type: 'pendant' as DeviceType,
    ownerId: 'person_alan',
    capabilities: ['audio', 'gps', 'biometric'],
  },
};

// ============================================================================
// Memory Templates - Realistic Scenarios
// ============================================================================

export const MEMORY_TEMPLATES = {
  // Betty scenarios
  betty_doctor: [
    { text: "Dr. Chen said I need to reduce my salt intake", salience: 0.8, emotion: 'concern', category: 'health' },
    { text: "Doctor appointment went well, blood pressure is stable", salience: 0.5, emotion: 'relief', category: 'health' },
    { text: "Dr. Chen increased my medication dosage", salience: 0.7, emotion: 'worry', category: 'health' },
  ],
  betty_daughter: [
    { text: "Sarah called, she's bringing groceries Thursday", salience: 0.6, emotion: 'happy', category: 'family' },
    { text: "Sarah seemed stressed on the phone, hope she's okay", salience: 0.7, emotion: 'worry', category: 'family' },
    { text: "Sarah forgot to visit this week", salience: 0.8, emotion: 'sad', category: 'family' },
    { text: "Sarah brought the grandkids over, wonderful day", salience: 0.9, emotion: 'joy', category: 'family' },
  ],
  betty_daily: [
    { text: "Watched my morning show", salience: 0.2, emotion: 'neutral', category: 'routine' },
    { text: "Made tea and looked at old photos", salience: 0.4, emotion: 'nostalgic', category: 'routine' },
    { text: "Couldn't remember where I put my glasses again", salience: 0.5, emotion: 'frustrated', category: 'memory' },
  ],

  // Alan scenarios
  alan_work: [
    { text: "Bob and I shipped the new auth system", salience: 0.7, emotion: 'satisfied', category: 'work' },
    { text: "Meeting with investors went well, they're excited about MemoRable", salience: 0.8, emotion: 'optimistic', category: 'work' },
    { text: "Debugging session with Bob until 2am", salience: 0.5, emotion: 'tired', category: 'work' },
    { text: "Bob said he can't trust me after the incident", salience: 0.95, emotion: 'hurt', category: 'trust' },
  ],
  alan_personal: [
    { text: "Thinking about what memory means, for Betty, for all of us", salience: 0.7, emotion: 'reflective', category: 'philosophy' },
    { text: "Someone ripped me off for $3k on that deal", salience: 0.8, emotion: 'angry', category: 'financial' },
    { text: "Remembered dad today. Still hurts after all these years.", salience: 0.95, emotion: 'grief', category: 'trauma' },
  ],

  // Conference call scenario (multi-entity)
  conference: [
    {
      text: "Company A: 'We need 3 dogs by end of quarter'",
      salience: 0.7,
      emotion: 'business',
      category: 'commitment',
      entities: ['org_company_a'],
      creates_loop: { owner: 'org_company_a', description: 'Get 3 dogs by EOQ' },
    },
    {
      text: "Company B: 'No problem, as soon as Company D provides the 4 bowls'",
      salience: 0.8,
      emotion: 'business',
      category: 'commitment',
      entities: ['org_company_b', 'org_company_d'],
      creates_loop: { owner: 'org_company_b', description: 'Supply 3 dogs', blocked_by: 'org_company_d' },
    },
    {
      text: "Company C: 'I want one of those dogs'",
      salience: 0.6,
      emotion: 'business',
      category: 'commitment',
      entities: ['org_company_c', 'org_company_a'],
      creates_loop: { owner: 'org_company_c', description: 'Get 1 dog from A', blocked_by: 'org_company_a' },
    },
  ],
};

// ============================================================================
// Entity Generator
// ============================================================================

export function generateEntity(
  seed: typeof SEED_PEOPLE[keyof typeof SEED_PEOPLE] | typeof SEED_ORGANIZATIONS[keyof typeof SEED_ORGANIZATIONS]
): Entity {
  const now = new Date().toISOString();

  return {
    entityId: seed.id,
    entityType: seed.type,
    name: seed.name,
    createdAt: now,
    updatedAt: now,
    isTransferable: seed.type !== 'person',
  };
}

export function generateAllSeedEntities(): Entity[] {
  const entities: Entity[] = [];

  for (const person of Object.values(SEED_PEOPLE)) {
    entities.push(generateEntity(person));
  }

  for (const org of Object.values(SEED_ORGANIZATIONS)) {
    entities.push(generateEntity(org));
  }

  return entities;
}

// ============================================================================
// Memory Generator
// ============================================================================

export interface SyntheticMemory {
  memoryId: string;
  text: string;
  userId: string;
  createdAt: string;
  salience: number;
  emotion: string;
  category: string;
  entities: string[];
  deviceId?: string;
  deviceType?: string;
  creates_loop?: {
    owner: string;
    description: string;
    blocked_by?: string;
  };
}

export function generateMemory(
  template: typeof MEMORY_TEMPLATES.betty_doctor[0] & { entities?: string[]; creates_loop?: unknown },
  userId: string,
  timestamp?: Date,
  deviceId?: string,
  deviceType?: string
): SyntheticMemory {
  const ts = timestamp || new Date();

  return {
    memoryId: `mem_syn_${ts.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    text: template.text,
    userId,
    createdAt: ts.toISOString(),
    salience: template.salience,
    emotion: template.emotion,
    category: template.category,
    entities: template.entities || [],
    deviceId,
    deviceType,
    creates_loop: template.creates_loop as SyntheticMemory['creates_loop'],
  };
}

export function generateMemoryStream(
  templateKey: keyof typeof MEMORY_TEMPLATES,
  userId: string,
  count: number,
  options?: {
    startDate?: Date;
    intervalHours?: number;
    deviceId?: string;
    deviceType?: string;
    addNoise?: boolean;
  }
): SyntheticMemory[] {
  const templates = MEMORY_TEMPLATES[templateKey];
  const memories: SyntheticMemory[] = [];
  const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const intervalMs = (options?.intervalHours || 24) * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const timestamp = new Date(startDate.getTime() + i * intervalMs);

    // Add some noise to timing if requested
    if (options?.addNoise) {
      timestamp.setTime(timestamp.getTime() + (Math.random() - 0.5) * intervalMs * 0.5);
    }

    memories.push(generateMemory(
      template,
      userId,
      timestamp,
      options?.deviceId,
      options?.deviceType
    ));
  }

  return memories;
}

// ============================================================================
// Pressure Event Generator
// ============================================================================

export interface SyntheticPressureEvent {
  vector: PressureVector;
  description: string;
}

const PRESSURE_SCENARIOS = {
  // Betty receiving pressure from multiple sources
  betty_multi_source: [
    { source: 'person_sarah_daughter', target: 'person_betty', valence: -0.3, intensity: 0.6, category: 'disappointment' as PressureCategory, desc: 'Sarah cancelled visit' },
    { source: 'person_dr_chen', target: 'person_betty', valence: -0.2, intensity: 0.4, category: 'stress' as PressureCategory, desc: 'Doctor delivered concerning news' },
    { source: 'environment', target: 'person_betty', valence: -0.1, intensity: 0.3, category: 'stress' as PressureCategory, desc: 'Lonely evening' },
  ],

  // Cascade: Parent → Child → Classmate (butterfly effect)
  cascade_school: [
    { source: 'person_parent', target: 'person_child', valence: -0.7, intensity: 0.8, category: 'criticism' as PressureCategory, desc: 'Parent yelled at child', cascadeDepth: 0 },
    { source: 'person_child', target: 'person_classmate', valence: -0.5, intensity: 0.6, category: 'conflict' as PressureCategory, desc: 'Child bullied classmate', cascadeDepth: 1 },
    { source: 'person_classmate', target: 'person_other_child', valence: -0.4, intensity: 0.5, category: 'rejection' as PressureCategory, desc: 'Classmate excluded another', cascadeDepth: 2 },
  ],

  // Positive pressure (support flowing)
  support_network: [
    { source: 'person_sarah_daughter', target: 'person_betty', valence: 0.6, intensity: 0.7, category: 'support' as PressureCategory, desc: 'Sarah visited with flowers' },
    { source: 'person_dr_chen', target: 'person_betty', valence: 0.3, intensity: 0.5, category: 'encouragement' as PressureCategory, desc: 'Doctor praised progress' },
    { source: 'device_betty_doll', target: 'person_betty', valence: 0.2, intensity: 0.4, category: 'connection' as PressureCategory, desc: 'Doll played favorite song' },
  ],
};

export function generatePressureVector(
  scenario: typeof PRESSURE_SCENARIOS.betty_multi_source[0],
  memoryId: string,
  timestamp?: Date
): PressureVector {
  const ts = timestamp || new Date();

  return {
    sourceEntityId: scenario.source,
    targetEntityId: scenario.target,
    memoryId,
    timestamp: ts.toISOString(),
    intensity: scenario.intensity,
    valence: scenario.valence,
    category: scenario.category,
    isRepeated: false,
    cascadeDepth: (scenario as { cascadeDepth?: number }).cascadeDepth || 0,
  };
}

export function generatePressureScenario(
  scenarioKey: keyof typeof PRESSURE_SCENARIOS,
  options?: {
    startDate?: Date;
    intervalHours?: number;
  }
): SyntheticPressureEvent[] {
  const scenario = PRESSURE_SCENARIOS[scenarioKey];
  const events: SyntheticPressureEvent[] = [];
  const startDate = options?.startDate || new Date();
  const intervalMs = (options?.intervalHours || 4) * 60 * 60 * 1000;

  scenario.forEach((event, i) => {
    const timestamp = new Date(startDate.getTime() + i * intervalMs);
    const memoryId = `mem_pressure_${timestamp.getTime()}_${i}`;

    events.push({
      vector: generatePressureVector(event, memoryId, timestamp),
      description: event.desc,
    });
  });

  return events;
}

// ============================================================================
// Context Stream Generator (Device Telemetry)
// ============================================================================

export function generateContextStream(
  entityId: string,
  deviceType: DeviceType,
  durationHours: number,
  intervalMinutes: number = 5
): ContextFrame[] {
  const frames: ContextFrame[] = [];
  const startTime = new Date();
  const intervals = Math.floor((durationHours * 60) / intervalMinutes);

  const locationPatterns = ['home', 'office', 'coffee_shop', 'transit', 'grocery_store'];
  const activityPatterns = ['resting', 'working', 'meeting', 'cooking', 'walking', 'reading'];
  const timeOfDayMap: Record<number, 'morning' | 'afternoon' | 'evening' | 'night'> = {
    6: 'morning', 7: 'morning', 8: 'morning', 9: 'morning', 10: 'morning', 11: 'morning',
    12: 'afternoon', 13: 'afternoon', 14: 'afternoon', 15: 'afternoon', 16: 'afternoon', 17: 'afternoon',
    18: 'evening', 19: 'evening', 20: 'evening', 21: 'evening',
    22: 'night', 23: 'night', 0: 'night', 1: 'night', 2: 'night', 3: 'night', 4: 'night', 5: 'night',
  };

  for (let i = 0; i < intervals; i++) {
    const timestamp = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
    const hour = timestamp.getHours();

    // Simulate realistic patterns
    const isWorkHour = hour >= 9 && hour <= 17;
    const isEvening = hour >= 18 && hour <= 21;

    const location = isWorkHour
      ? (Math.random() > 0.3 ? 'office' : 'coffee_shop')
      : (isEvening ? 'home' : locationPatterns[Math.floor(Math.random() * locationPatterns.length)]);

    const activity = isWorkHour
      ? (Math.random() > 0.3 ? 'working' : 'meeting')
      : activityPatterns[Math.floor(Math.random() * activityPatterns.length)];

    frames.push({
      entityId,
      timestamp: timestamp.toISOString(),
      location,
      locationType: location === 'office' ? 'work' : location === 'home' ? 'home' : 'other',
      activity,
      activityType: activity,
      timeOfDay: timeOfDayMap[hour] || 'afternoon',
      dayOfWeek: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][timestamp.getDay()],
      deviceType,
    });
  }

  return frames;
}

// ============================================================================
// Prediction Hook Generator
// ============================================================================

export function generatePredictionHook(
  memoryId: string,
  entityId: string,
  conditions: HookCondition[],
  options?: {
    priority?: 'critical' | 'high' | 'medium' | 'low';
    surfaceText?: string;
  }
): PredictionHook {
  return {
    hookId: `hook_syn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    memoryId,
    entityId,
    conditions,
    priority: options?.priority || 'medium',
    surfaceText: options?.surfaceText,
    createdAt: new Date().toISOString(),
    firedCount: 0,
    cooldownMs: 60 * 60 * 1000,
    feedbackHistory: [],
    confidence: 1.0,
    disabled: false,
  };
}

// Pre-built hooks for common scenarios
export function generateBettyHooks(memoryIds: { salt: string; daughter: string }): PredictionHook[] {
  return [
    generatePredictionHook(
      memoryIds.salt,
      'person_betty',
      [
        { type: 'talking_to', operator: 'contains', value: 'sarah' },
        { type: 'topic', operator: 'contains', value: 'groceries' },
      ],
      { priority: 'high', surfaceText: 'Remember to ask Sarah about low-sodium options' }
    ),
    generatePredictionHook(
      memoryIds.salt,
      'person_betty',
      [
        { type: 'activity_type', operator: 'equals', value: 'cooking' },
      ],
      { priority: 'medium', surfaceText: 'Doctor said reduce salt intake' }
    ),
    generatePredictionHook(
      memoryIds.daughter,
      'person_betty',
      [
        { type: 'time_of_day', operator: 'equals', value: 'evening' },
        { type: 'emotional_state', operator: 'equals', value: 'lonely' },
      ],
      { priority: 'low', surfaceText: 'Sarah visited last Thursday, she cares about you' }
    ),
  ];
}

// ============================================================================
// Bulk Generator - Full Test Dataset
// ============================================================================

export interface SyntheticDataset {
  entities: Entity[];
  memories: SyntheticMemory[];
  pressureEvents: SyntheticPressureEvent[];
  contextFrames: ContextFrame[];
  predictionHooks: PredictionHook[];
}

export function generateFullDataset(options?: {
  memoryCount?: number;
  daysOfContext?: number;
  includeCascade?: boolean;
}): SyntheticDataset {
  const memoryCount = options?.memoryCount || 100;
  const daysOfContext = options?.daysOfContext || 7;

  // Entities
  const entities = generateAllSeedEntities();

  // Memories
  const memories: SyntheticMemory[] = [
    ...generateMemoryStream('betty_doctor', 'person_betty', Math.floor(memoryCount * 0.2), {
      deviceId: 'device_betty_doll',
      deviceType: 'companion',
    }),
    ...generateMemoryStream('betty_daughter', 'person_betty', Math.floor(memoryCount * 0.3), {
      deviceId: 'device_betty_doll',
      deviceType: 'companion',
    }),
    ...generateMemoryStream('betty_daily', 'person_betty', Math.floor(memoryCount * 0.2)),
    ...generateMemoryStream('alan_work', 'person_alan', Math.floor(memoryCount * 0.2), {
      deviceId: 'device_alan_glasses',
      deviceType: 'smartglasses',
    }),
    ...generateMemoryStream('alan_personal', 'person_alan', Math.floor(memoryCount * 0.1)),
  ];

  // Pressure events
  const pressureEvents: SyntheticPressureEvent[] = [
    ...generatePressureScenario('betty_multi_source'),
    ...generatePressureScenario('support_network'),
  ];

  if (options?.includeCascade) {
    pressureEvents.push(...generatePressureScenario('cascade_school'));
  }

  // Context frames
  const contextFrames: ContextFrame[] = [
    ...generateContextStream('person_betty', 'companion', daysOfContext * 24, 15),
    ...generateContextStream('person_alan', 'smartglasses', daysOfContext * 24, 5),
  ];

  // Prediction hooks
  const saltMemory = memories.find(m => m.text.includes('salt'));
  const daughterMemory = memories.find(m => m.text.includes('Sarah'));
  const predictionHooks = saltMemory && daughterMemory
    ? generateBettyHooks({ salt: saltMemory.memoryId, daughter: daughterMemory.memoryId })
    : [];

  return {
    entities,
    memories,
    pressureEvents,
    contextFrames,
    predictionHooks,
  };
}

// ============================================================================
// Load Test Configuration
// ============================================================================

export interface LoadTestConfig {
  concurrentUsers: number;
  memoriesPerUser: number;
  contextUpdatesPerSecond: number;
  durationSeconds: number;
  enablePressureTracking: boolean;
  enablePredictionHooks: boolean;
}

export const LOAD_TEST_PROFILES = {
  smoke: {
    concurrentUsers: 1,
    memoriesPerUser: 10,
    contextUpdatesPerSecond: 1,
    durationSeconds: 30,
    enablePressureTracking: true,
    enablePredictionHooks: true,
  } as LoadTestConfig,

  standard: {
    concurrentUsers: 10,
    memoriesPerUser: 100,
    contextUpdatesPerSecond: 10,
    durationSeconds: 300,
    enablePressureTracking: true,
    enablePredictionHooks: true,
  } as LoadTestConfig,

  stress: {
    concurrentUsers: 50,
    memoriesPerUser: 500,
    contextUpdatesPerSecond: 50,
    durationSeconds: 600,
    enablePressureTracking: true,
    enablePredictionHooks: true,
  } as LoadTestConfig,

  // Named after our cautionary tale
  versailles: {
    concurrentUsers: 100,
    memoriesPerUser: 1000,
    contextUpdatesPerSecond: 100,
    durationSeconds: 1800,
    enablePressureTracking: true,
    enablePredictionHooks: true,
  } as LoadTestConfig,
};

// ============================================================================
// Export for tests
// ============================================================================

export {
  SEED_PEOPLE,
  SEED_ORGANIZATIONS,
  SEED_DEVICES,
  MEMORY_TEMPLATES,
  PRESSURE_SCENARIOS,
};
