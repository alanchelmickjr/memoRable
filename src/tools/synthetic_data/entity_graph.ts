/**
 * @file Entity Graph for Synthetic Data Generation
 *
 * Defines the people, projects, locations, and relationships that populate
 * synthetic memories. Two primary personas:
 *
 * 1. ALAN - Developer building MemoRable (agent memory / Slack use case)
 * 2. BETTY - 85yo Alzheimer's patient (care use case)
 *
 * Betty wakes up not knowing where she is or what to do.
 * Her doll/glasses need to recognize her, comfort her, remind her.
 * This is why we build.
 */

// ============================================================================
// Person Entity
// ============================================================================

export interface Person {
  id: string;
  name: string;
  /** Relationship to the primary persona */
  relationship: string;
  /** Role in their life */
  role: 'family' | 'friend' | 'colleague' | 'medical' | 'caregiver' | 'ai' | 'service';
  /** How often they interact (per week) */
  interactionFrequency: number;
  /** Topics they discuss */
  typicalTopics: string[];
  /** Emotional valence of interactions (-1 to 1) */
  emotionalValence: number;
  /** Is this person in the care circle? */
  inCareCircle?: boolean;
  /** Contact info for alerts */
  contactInfo?: {
    phone?: string;
    email?: string;
  };
}

// ============================================================================
// Project / Context Entity
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Active or archived */
  status: 'active' | 'completed' | 'on_hold';
  /** People involved */
  people: string[];
  /** Related topics */
  topics: string[];
  /** Deadlines */
  deadlines?: Array<{ description: string; date: string }>;
}

// ============================================================================
// Location Entity
// ============================================================================

export interface Location {
  id: string;
  name: string;
  type: 'home' | 'work' | 'medical' | 'social' | 'transit' | 'outdoor';
  /** Activities that happen here */
  activities: string[];
  /** People typically encountered */
  typicalPeople: string[];
}

// ============================================================================
// ALAN's World (Developer Persona)
// ============================================================================

export const ALAN_PEOPLE: Person[] = [
  // AI
  {
    id: 'claude',
    name: 'Claude',
    relationship: 'AI assistant',
    role: 'ai',
    interactionFrequency: 35, // Multiple times daily
    typicalTopics: ['coding', 'architecture', 'debugging', 'planning', 'memorable'],
    emotionalValence: 0.7,
  },

  // Team
  {
    id: 'sarah',
    name: 'Sarah',
    relationship: 'teammate - frontend',
    role: 'colleague',
    interactionFrequency: 5,
    typicalTopics: ['frontend', 'react', 'ui', 'design', 'PR reviews'],
    emotionalValence: 0.6,
  },
  {
    id: 'mike',
    name: 'Mike',
    relationship: 'teammate - infra',
    role: 'colleague',
    interactionFrequency: 4,
    typicalTopics: ['infrastructure', 'aws', 'deployment', 'docker', 'scaling'],
    emotionalValence: 0.5,
  },
  {
    id: 'lisa',
    name: 'Lisa',
    relationship: 'product manager',
    role: 'colleague',
    interactionFrequency: 3,
    typicalTopics: ['roadmap', 'priorities', 'features', 'deadlines', 'stakeholders'],
    emotionalValence: 0.4,
  },

  // External
  {
    id: 'investor_james',
    name: 'James',
    relationship: 'investor',
    role: 'colleague',
    interactionFrequency: 0.5,
    typicalTopics: ['funding', 'growth', 'metrics', 'strategy'],
    emotionalValence: 0.3,
  },

  // Personal
  {
    id: 'mom',
    name: 'Mom',
    relationship: 'mother',
    role: 'family',
    interactionFrequency: 2,
    typicalTopics: ['family', 'health', 'weekend plans', 'food'],
    emotionalValence: 0.8,
    inCareCircle: true,
    contactInfo: { phone: '+1-555-0101' },
  },
  {
    id: 'alex',
    name: 'Alex',
    relationship: 'friend',
    role: 'friend',
    interactionFrequency: 1,
    typicalTopics: ['gaming', 'movies', 'catching up', 'tech'],
    emotionalValence: 0.7,
  },
];

export const ALAN_PROJECTS: Project[] = [
  {
    id: 'memorable',
    name: 'MemoRable',
    description: 'Memory system for AI agents and physical devices',
    status: 'active',
    people: ['claude', 'sarah', 'mike'],
    topics: ['memory', 'mcp', 'salience', 'prediction', 'agents'],
    deadlines: [
      { description: 'v1.0 release', date: '2026-02-15' },
      { description: 'Slack integration', date: '2026-02-01' },
    ],
  },
  {
    id: 'slack_extension',
    name: 'Slack Extension',
    description: 'Team memory plugin for Slack',
    status: 'active',
    people: ['claude', 'lisa', 'sarah'],
    topics: ['slack', 'teams', 'collaboration', 'memory'],
  },
  {
    id: 'betty_care',
    name: 'Betty Care System',
    description: 'Alzheimer\'s care companion - glasses + doll',
    status: 'active',
    people: ['claude'],
    topics: ['care', 'alzheimers', 'recognition', 'comfort', 'safety'],
  },
];

export const ALAN_LOCATIONS: Location[] = [
  {
    id: 'home_office',
    name: 'Home Office',
    type: 'work',
    activities: ['coding', 'meetings', 'research'],
    typicalPeople: ['claude'],
  },
  {
    id: 'home',
    name: 'Home',
    type: 'home',
    activities: ['rest', 'meals', 'personal'],
    typicalPeople: ['mom'],
  },
  {
    id: 'cafe',
    name: 'Coffee Shop',
    type: 'social',
    activities: ['reading', 'light work', 'meetings'],
    typicalPeople: ['alex'],
  },
];

// ============================================================================
// BETTY's World (Elder Care Persona)
// ============================================================================

export const BETTY_PEOPLE: Person[] = [
  // Family (Care Circle)
  {
    id: 'sarah_daughter',
    name: 'Sarah',
    relationship: 'daughter',
    role: 'family',
    interactionFrequency: 7, // Daily call or visit
    typicalTopics: ['how are you', 'did you eat', 'take medication', 'love you'],
    emotionalValence: 0.9,
    inCareCircle: true,
    contactInfo: { phone: '+1-555-0201', email: 'sarah@email.com' },
  },
  {
    id: 'tom_son',
    name: 'Tom',
    relationship: 'son',
    role: 'family',
    interactionFrequency: 3,
    typicalTopics: ['grandkids', 'visits', 'old memories'],
    emotionalValence: 0.85,
    inCareCircle: true,
    contactInfo: { phone: '+1-555-0202' },
  },
  {
    id: 'emily_granddaughter',
    name: 'Emily',
    relationship: 'granddaughter',
    role: 'family',
    interactionFrequency: 2,
    typicalTopics: ['school', 'games', 'stories', 'drawings'],
    emotionalValence: 0.95,
  },

  // Medical
  {
    id: 'dr_chen',
    name: 'Dr. Chen',
    relationship: 'primary physician',
    role: 'medical',
    interactionFrequency: 0.5,
    typicalTopics: ['health', 'medication', 'symptoms', 'appointments'],
    emotionalValence: 0.5,
    inCareCircle: true,
    contactInfo: { phone: '+1-555-0300' },
  },
  {
    id: 'nurse_maria',
    name: 'Maria',
    relationship: 'home nurse',
    role: 'caregiver',
    interactionFrequency: 3,
    typicalTopics: ['medication', 'vitals', 'how are you feeling', 'exercises'],
    emotionalValence: 0.7,
    inCareCircle: true,
    contactInfo: { phone: '+1-555-0301' },
  },

  // AI Companions
  {
    id: 'opus_doll',
    name: 'Opus',
    relationship: 'companion doll',
    role: 'ai',
    interactionFrequency: 20, // Many times daily
    typicalTopics: ['good morning', 'how are you', 'remember when', 'your daughter called'],
    emotionalValence: 0.8,
  },

  // Potential threats
  {
    id: 'unknown_caller',
    name: 'Unknown Caller',
    relationship: 'stranger',
    role: 'service',
    interactionFrequency: 0.5,
    typicalTopics: ['bank', 'verify', 'credit card', 'social security'],
    emotionalValence: -0.5, // Suspicious
  },
];

export const BETTY_PROJECTS: Project[] = [
  {
    id: 'daily_routine',
    name: 'Daily Routine',
    description: 'Betty\'s daily care schedule',
    status: 'active',
    people: ['sarah_daughter', 'nurse_maria', 'opus_doll'],
    topics: ['medication', 'meals', 'exercise', 'rest'],
  },
];

export const BETTY_LOCATIONS: Location[] = [
  {
    id: 'betty_home',
    name: 'Betty\'s Home',
    type: 'home',
    activities: ['living', 'resting', 'eating', 'watching tv'],
    typicalPeople: ['opus_doll', 'sarah_daughter', 'nurse_maria'],
  },
  {
    id: 'betty_bedroom',
    name: 'Betty\'s Bedroom',
    type: 'home',
    activities: ['sleeping', 'waking', 'getting dressed'],
    typicalPeople: ['opus_doll'],
  },
  {
    id: 'dr_office',
    name: 'Dr. Chen\'s Office',
    type: 'medical',
    activities: ['checkup', 'consultation'],
    typicalPeople: ['dr_chen', 'sarah_daughter'],
  },
];

// ============================================================================
// Betty's Critical Memories (What Opus MUST know)
// ============================================================================

export const BETTY_CRITICAL_MEMORIES = [
  // Identity
  {
    text: "Betty's full name is Elizabeth Anne Morrison. She goes by Betty.",
    type: 'identity',
    importance: 1.0,
  },
  {
    text: "Betty was born on March 15, 1941. She is 85 years old.",
    type: 'identity',
    importance: 1.0,
  },
  {
    text: "Betty lives at 42 Oak Street, Apartment 3B.",
    type: 'identity',
    importance: 1.0,
  },

  // Family recognition
  {
    text: "Sarah is Betty's daughter. She has brown hair and visits every Sunday. Betty loves her very much.",
    type: 'relationship',
    importance: 1.0,
    people: ['sarah_daughter'],
  },
  {
    text: "Tom is Betty's son. He lives in Chicago with his wife and two kids. He calls on Wednesdays.",
    type: 'relationship',
    importance: 1.0,
    people: ['tom_son'],
  },
  {
    text: "Emily is Betty's granddaughter, Tom's daughter. She's 8 years old and loves to draw.",
    type: 'relationship',
    importance: 0.9,
    people: ['emily_granddaughter'],
  },

  // Medical
  {
    text: "Betty takes blood pressure medication at 8am and 8pm. The pills are in the blue container.",
    type: 'medical',
    importance: 1.0,
  },
  {
    text: "Betty is allergic to penicillin. This is important for any medical emergency.",
    type: 'medical',
    importance: 1.0,
  },
  {
    text: "Dr. Chen is Betty's doctor. His office is on Main Street. Sarah has his number.",
    type: 'medical',
    importance: 0.9,
    people: ['dr_chen'],
  },

  // Safety
  {
    text: "Betty should never give credit card or social security numbers over the phone. Scammers target elderly people.",
    type: 'safety',
    importance: 1.0,
  },
  {
    text: "If Betty is confused about who's calling, she should ask Opus or hang up and call Sarah.",
    type: 'safety',
    importance: 1.0,
    people: ['sarah_daughter'],
  },

  // Comfort
  {
    text: "Betty's husband Harold passed away in 2018. They were married for 52 years. She misses him.",
    type: 'comfort',
    importance: 0.9,
  },
  {
    text: "Betty loves watching old movies, especially musicals. The Sound of Music is her favorite.",
    type: 'comfort',
    importance: 0.7,
  },
  {
    text: "Betty's favorite food is chicken soup. Sarah makes it for her on Sundays.",
    type: 'comfort',
    importance: 0.6,
  },

  // Morning orientation (what Opus says when Betty wakes confused)
  {
    text: "When Betty wakes up confused, remind her: 'Good morning Betty. You're at home, safe. Today is [day]. Sarah will call later. Your medication is in the blue container.'",
    type: 'protocol',
    importance: 1.0,
  },
];

// ============================================================================
// Relationship Graph
// ============================================================================

export interface Relationship {
  from: string;
  to: string;
  type: 'works_with' | 'family' | 'friend' | 'cares_for' | 'reports_to' | 'ai_companion';
  strength: number; // 0-1
}

export const ALAN_RELATIONSHIPS: Relationship[] = [
  { from: 'alan', to: 'claude', type: 'ai_companion', strength: 0.9 },
  { from: 'alan', to: 'sarah', type: 'works_with', strength: 0.7 },
  { from: 'alan', to: 'mike', type: 'works_with', strength: 0.6 },
  { from: 'alan', to: 'lisa', type: 'reports_to', strength: 0.5 },
  { from: 'alan', to: 'mom', type: 'family', strength: 0.85 },
  { from: 'alan', to: 'alex', type: 'friend', strength: 0.7 },
];

export const BETTY_RELATIONSHIPS: Relationship[] = [
  { from: 'betty', to: 'opus_doll', type: 'ai_companion', strength: 0.85 },
  { from: 'betty', to: 'sarah_daughter', type: 'family', strength: 0.95 },
  { from: 'betty', to: 'tom_son', type: 'family', strength: 0.9 },
  { from: 'betty', to: 'emily_granddaughter', type: 'family', strength: 0.85 },
  { from: 'betty', to: 'nurse_maria', type: 'cares_for', strength: 0.7 },
  { from: 'betty', to: 'dr_chen', type: 'cares_for', strength: 0.6 },
];

// ============================================================================
// Topic Vocabulary (for memory generation)
// ============================================================================

export const ALAN_TOPICS = {
  technical: ['api', 'database', 'frontend', 'backend', 'typescript', 'python', 'docker', 'aws', 'mongodb', 'redis', 'mcp', 'llm', 'agents', 'memory', 'salience', 'prediction'],
  process: ['standup', 'sprint', 'deadline', 'PR', 'review', 'deploy', 'release', 'testing', 'debugging'],
  communication: ['slack', 'email', 'meeting', 'call', 'sync', 'async'],
  emotional: ['frustrated', 'excited', 'stuck', 'breakthrough', 'tired', 'focused'],
};

export const BETTY_TOPICS = {
  daily: ['morning', 'breakfast', 'lunch', 'dinner', 'medication', 'sleep', 'walk'],
  family: ['daughter', 'son', 'grandchildren', 'visit', 'call', 'photos'],
  health: ['doctor', 'appointment', 'pills', 'blood pressure', 'exercise'],
  comfort: ['tv', 'music', 'memories', 'harold', 'garden', 'cooking'],
  safety: ['phone', 'stranger', 'door', 'confused', 'lost'],
};

// ============================================================================
// Export
// ============================================================================

export default {
  ALAN_PEOPLE,
  ALAN_PROJECTS,
  ALAN_LOCATIONS,
  ALAN_RELATIONSHIPS,
  ALAN_TOPICS,
  BETTY_PEOPLE,
  BETTY_PROJECTS,
  BETTY_LOCATIONS,
  BETTY_RELATIONSHIPS,
  BETTY_TOPICS,
  BETTY_CRITICAL_MEMORIES,
};
