/**
 * @file Memory Generator - Schedule-Driven Synthetic Data
 *
 * Generates realistic memories from schedule slots.
 * Each scheduled activity produces memories appropriate to that context.
 *
 * Two personas:
 * - Alan (developer): work memories, coding, meetings, personal
 * - Betty (elder): care memories, family, safety, orientation
 */

import {
  generateSchedule,
  getOccurringSlots,
  type ScheduledSlot,
  type MemoryType,
  type ActivityType,
} from './schedule_template.js';

import {
  ALAN_PEOPLE,
  ALAN_PROJECTS,
  ALAN_TOPICS,
  BETTY_PEOPLE,
  BETTY_CRITICAL_MEMORIES,
  BETTY_TOPICS,
  type Person,
} from './entity_graph.js';

// ============================================================================
// Types
// ============================================================================

export interface GeneratedMemory {
  /** Unique ID */
  id: string;
  /** Memory content */
  text: string;
  /** When this memory was created */
  createdAt: string;
  /** People mentioned */
  people: string[];
  /** Topics */
  topics: string[];
  /** Project if relevant */
  project?: string;
  /** Location */
  location?: string;
  /** Activity that generated this */
  activity: string;
  /** Emotional valence (-1 to 1) */
  emotionalValence: number;
  /** Whether this creates an open loop */
  hasLoop: boolean;
  /** Loop details if hasLoop */
  loop?: {
    description: string;
    owner: 'self' | 'them';
    dueDate?: string;
  };
  /** Security tier */
  securityTier: 'Tier1_General' | 'Tier2_Personal' | 'Tier3_Vault';
  /** Persona this belongs to */
  persona: 'alan' | 'betty';
}

// ============================================================================
// Memory Templates
// ============================================================================

const MEMORY_TEMPLATES: Record<MemoryType, string[]> = {
  commitment_made: [
    "I told {person} I would {action} by {deadline}",
    "Committed to {action} for {project}",
    "Promised {person} to {action}",
    "Said I'd {action} before end of {timeframe}",
  ],
  commitment_received: [
    "{person} said they would {action} by {deadline}",
    "{person} committed to {action} for {project}",
    "{person} promised to {action}",
    "Waiting on {person} to {action}",
  ],
  decision: [
    "Decided to {action} for {project}",
    "Team agreed: {action}",
    "We're going with {choice} instead of {alternative}",
    "{person} and I decided to {action}",
  ],
  context: [
    "{person} mentioned that {fact}",
    "Learned that {fact}",
    "{person} said {fact}",
    "Note: {fact}",
  ],
  question_asked: [
    "Asked {person} about {topic}",
    "Need to find out: {question}",
    "Wondering about {topic}",
    "Asked Claude to help with {topic}",
  ],
  question_answered: [
    "Found out that {fact}",
    "{person} explained that {fact}",
    "Answer to {question}: {fact}",
    "Claude helped me understand {topic}",
  ],
  status_update: [
    "{project} is now {status}",
    "Progress on {task}: {status}",
    "{person} updated: {status}",
    "Sprint update: {status}",
  ],
  blocker: [
    "Blocked on {task} - need {dependency}",
    "Can't proceed with {task} until {blocker}",
    "Stuck on {issue}",
    "Need help from {person} with {task}",
  ],
  idea: [
    "What if we {idea}?",
    "Idea: {idea}",
    "Could try {idea} for {project}",
    "Random thought: {idea}",
  ],
  feedback_given: [
    "Reviewed {person}'s PR - {feedback}",
    "Told {person} that {feedback}",
    "Suggested {person} should {suggestion}",
    "Gave feedback on {task}: {feedback}",
  ],
  feedback_received: [
    "{person} said my {work} was {feedback}",
    "Got feedback: {feedback}",
    "{person} suggested I {suggestion}",
    "Review comments on my PR: {feedback}",
  ],
  personal_note: [
    "{note}",
    "Personal: {note}",
    "Reminder: {note}",
  ],
  research_finding: [
    "Found that {finding}",
    "Research: {topic} - {finding}",
    "Discovered: {finding}",
    "Interesting: {finding}",
  ],
  bug_found: [
    "Bug in {component}: {description}",
    "Found issue: {description}",
    "Need to fix: {description}",
    "Debugging {component} - {description}",
  ],
  task_completed: [
    "Finished {task}",
    "Done: {task}",
    "Completed {task} for {project}",
    "Shipped {task}",
  ],
  meeting_notes: [
    "Meeting with {people}: discussed {topics}. Action items: {actions}",
    "Sync with {person}: {summary}",
    "Standup: {summary}",
    "{meeting_type} notes: {summary}",
  ],
};

// ============================================================================
// Fill Templates
// ============================================================================

const ACTIONS = [
  'finish the API refactor',
  'review the PR',
  'update the documentation',
  'fix the failing tests',
  'deploy to staging',
  'investigate the bug',
  'write the spec',
  'set up the monitoring',
  'migrate the database',
  'implement the feature',
];

const FACTS = [
  'the deadline moved to Friday',
  'we need to prioritize security',
  'the client wants changes',
  'the team is growing',
  'we\'re switching to TypeScript',
  'the API is rate limited',
  'the feature shipped successfully',
  'there\'s a bug in production',
];

const STATUSES = [
  'in progress',
  'blocked',
  'ready for review',
  'deployed',
  'needs testing',
  'on hold',
  'complete',
];

const FEEDBACK_OPTIONS = [
  'looks good, approved',
  'needs some changes',
  'great work',
  'a few nits',
  'needs more tests',
  'clean code',
];

const IDEAS = [
  'use caching to speed this up',
  'add a retry mechanism',
  'split this into smaller services',
  'automate this process',
  'add better error handling',
  'create a dashboard for this',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string, slot: ScheduledSlot, persona: 'alan' | 'betty'): string {
  const people = persona === 'alan' ? ALAN_PEOPLE : BETTY_PEOPLE;
  const topics = persona === 'alan' ? ALAN_TOPICS : BETTY_TOPICS;
  const projects = persona === 'alan' ? ALAN_PROJECTS : [];

  // Get a person appropriate for this slot
  const personRoles = slot.typicalPeople;
  const matchingPeople = people.filter(p => personRoles.includes(p.role as any));
  const person = matchingPeople.length > 0 ? pickRandom(matchingPeople) : pickRandom(people);

  // Get a project
  const project = projects.length > 0 ? pickRandom(projects) : null;

  // Get topics
  const topicList = Object.values(topics).flat();

  return template
    .replace(/{person}/g, person.name)
    .replace(/{people}/g, matchingPeople.slice(0, 2).map(p => p.name).join(' and ') || person.name)
    .replace(/{action}/g, pickRandom(ACTIONS))
    .replace(/{deadline}/g, pickRandom(['tomorrow', 'end of week', 'Monday', 'end of sprint']))
    .replace(/{timeframe}/g, pickRandom(['day', 'week', 'sprint']))
    .replace(/{project}/g, project?.name || 'the project')
    .replace(/{choice}/g, pickRandom(['option A', 'the new approach', 'TypeScript', 'MongoDB']))
    .replace(/{alternative}/g, pickRandom(['option B', 'the old way', 'JavaScript', 'PostgreSQL']))
    .replace(/{fact}/g, pickRandom(FACTS))
    .replace(/{topic}/g, pickRandom(topicList))
    .replace(/{question}/g, `how does ${pickRandom(topicList)} work`)
    .replace(/{status}/g, pickRandom(STATUSES))
    .replace(/{task}/g, pickRandom(ACTIONS))
    .replace(/{dependency}/g, pickRandom(['the API', 'design approval', 'test data', 'credentials']))
    .replace(/{blocker}/g, pickRandom(['API is down', 'waiting on review', 'missing data']))
    .replace(/{issue}/g, pickRandom(['async bug', 'race condition', 'type error']))
    .replace(/{idea}/g, pickRandom(IDEAS))
    .replace(/{feedback}/g, pickRandom(FEEDBACK_OPTIONS))
    .replace(/{suggestion}/g, pickRandom(['add tests', 'refactor this', 'document it']))
    .replace(/{work}/g, pickRandom(['PR', 'code', 'design', 'proposal']))
    .replace(/{note}/g, pickRandom(['call mom later', 'dentist next week', 'buy groceries']))
    .replace(/{finding}/g, pickRandom(FACTS))
    .replace(/{component}/g, pickRandom(['auth', 'API', 'database', 'frontend']))
    .replace(/{description}/g, pickRandom(['null pointer', 'timeout', 'race condition']))
    .replace(/{topics}/g, topicList.slice(0, 3).join(', '))
    .replace(/{actions}/g, ACTIONS.slice(0, 2).join('; '))
    .replace(/{summary}/g, pickRandom(FACTS))
    .replace(/{meeting_type}/g, pickRandom(['standup', '1:1', 'planning', 'retro']));
}

// ============================================================================
// Memory Generator
// ============================================================================

function generateMemoryFromSlot(
  slot: ScheduledSlot,
  persona: 'alan' | 'betty'
): GeneratedMemory[] {
  const memories: GeneratedMemory[] = [];
  const memoryTypes = slot.memoryTypes;

  // Generate 1-3 memories per slot based on activity
  const numMemories = slot.activity === 'deep_work_coding' ? 3 :
                      slot.activity.includes('meeting') ? 2 : 1;

  for (let i = 0; i < numMemories; i++) {
    const memoryType = pickRandom(memoryTypes);
    const templates = MEMORY_TEMPLATES[memoryType];
    const template = pickRandom(templates);
    const text = fillTemplate(template, slot, persona);

    const people = persona === 'alan' ? ALAN_PEOPLE : BETTY_PEOPLE;
    const topics = persona === 'alan' ? ALAN_TOPICS : BETTY_TOPICS;
    const projects = persona === 'alan' ? ALAN_PROJECTS : [];

    // Extract people mentioned
    const mentionedPeople = people
      .filter(p => text.toLowerCase().includes(p.name.toLowerCase()))
      .map(p => p.id);

    // Extract topics
    const allTopics = Object.values(topics).flat();
    const mentionedTopics = allTopics.filter(t =>
      text.toLowerCase().includes(t.toLowerCase())
    );

    // Determine if this creates a loop
    const hasLoop = memoryType === 'commitment_made' || memoryType === 'commitment_received';
    const loop = hasLoop ? {
      description: text,
      owner: memoryType === 'commitment_made' ? 'self' as const : 'them' as const,
      dueDate: new Date(slot.datetime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } : undefined;

    // Calculate emotional valence
    const stressMultiplier = slot.modifier.adjustments.stressLevel || 0.2;
    const baseValence = slot.energyLevel === 'high' ? 0.5 :
                        slot.energyLevel === 'medium' ? 0.3 : 0.1;
    const emotionalValence = baseValence - (stressMultiplier * 0.5) + (Math.random() * 0.4 - 0.2);

    // Determine security tier
    const securityTier = slot.activity === 'personal_evening' || slot.activity === 'personal_note'
      ? 'Tier2_Personal'
      : 'Tier1_General';

    memories.push({
      id: `${persona}_${slot.datetime.getTime()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date(slot.datetime.getTime() + i * 15 * 60 * 1000).toISOString(), // Spread within slot
      people: mentionedPeople,
      topics: mentionedTopics,
      project: projects.length > 0 ? pickRandom(projects).id : undefined,
      location: slot.location,
      activity: slot.activity,
      emotionalValence,
      hasLoop,
      loop,
      securityTier,
      persona,
    });
  }

  return memories;
}

// ============================================================================
// Betty-Specific Generator
// ============================================================================

function generateBettyMemories(startDate: Date, numDays: number): GeneratedMemory[] {
  const memories: GeneratedMemory[] = [];

  // First, add all critical memories (these are foundational)
  for (const critical of BETTY_CRITICAL_MEMORIES) {
    memories.push({
      id: `betty_critical_${Math.random().toString(36).slice(2, 8)}`,
      text: critical.text,
      createdAt: new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      people: critical.people || [],
      topics: [critical.type],
      location: 'betty_home',
      activity: 'setup',
      emotionalValence: 0.5,
      hasLoop: false,
      securityTier: 'Tier2_Personal',
      persona: 'betty',
    });
  }

  // Generate daily memories
  const currentDate = new Date(startDate);
  for (let day = 0; day < numDays; day++) {
    // Morning orientation (every day)
    memories.push({
      id: `betty_morning_${currentDate.toISOString().split('T')[0]}`,
      text: `Betty woke up at ${6 + Math.floor(Math.random() * 2)}am. ${Math.random() > 0.7 ? 'She seemed confused about where she was.' : 'Good morning.'}`,
      createdAt: new Date(currentDate.setHours(6 + Math.floor(Math.random() * 2), 0, 0, 0)).toISOString(),
      people: ['opus_doll'],
      topics: ['morning', 'orientation'],
      location: 'betty_bedroom',
      activity: 'morning_orientation',
      emotionalValence: Math.random() > 0.7 ? -0.3 : 0.4,
      hasLoop: false,
      securityTier: 'Tier2_Personal',
      persona: 'betty',
    });

    // Medication reminder (8am and 8pm)
    for (const hour of [8, 20]) {
      const took = Math.random() > 0.1; // 90% compliance
      memories.push({
        id: `betty_med_${currentDate.toISOString().split('T')[0]}_${hour}`,
        text: took
          ? `Betty took her blood pressure medication at ${hour}:00. Good job Betty!`
          : `Betty missed her ${hour}:00 medication. Reminded her and she took it at ${hour}:15.`,
        createdAt: new Date(currentDate.setHours(hour, took ? 0 : 15, 0, 0)).toISOString(),
        people: ['opus_doll'],
        topics: ['medication', 'health'],
        location: 'betty_home',
        activity: 'medication_reminder',
        emotionalValence: took ? 0.5 : 0.2,
        hasLoop: !took,
        loop: !took ? {
          description: 'Ensure Betty takes medication',
          owner: 'self',
        } : undefined,
        securityTier: 'Tier2_Personal',
        persona: 'betty',
      });
    }

    // Family call (daughter calls daily)
    if (Math.random() > 0.15) { // 85% chance
      memories.push({
        id: `betty_sarah_call_${currentDate.toISOString().split('T')[0]}`,
        text: `Sarah called Betty. They talked about ${pickRandom(['how Betty is feeling', 'what Betty had for lunch', 'the grandkids', 'Sunday\'s visit'])}. Betty was ${pickRandom(['happy to hear from her', 'a bit confused but glad', 'in good spirits'])}.`,
        createdAt: new Date(currentDate.setHours(17 + Math.floor(Math.random() * 2), 0, 0, 0)).toISOString(),
        people: ['sarah_daughter'],
        topics: ['family', 'call', 'daughter'],
        location: 'betty_home',
        activity: 'family_call',
        emotionalValence: 0.8,
        hasLoop: false,
        securityTier: 'Tier2_Personal',
        persona: 'betty',
      });
    }

    // Potential scam call (rare)
    if (Math.random() > 0.95) { // 5% chance
      memories.push({
        id: `betty_scam_attempt_${currentDate.toISOString().split('T')[0]}`,
        text: `Unknown caller claimed to be from "the bank" and asked Betty about her credit card. Opus intercepted and ended the call. Notified Sarah.`,
        createdAt: new Date(currentDate.setHours(14 + Math.floor(Math.random() * 3), 0, 0, 0)).toISOString(),
        people: ['unknown_caller', 'sarah_daughter'],
        topics: ['safety', 'scam', 'phone'],
        location: 'betty_home',
        activity: 'scam_detection',
        emotionalValence: -0.5,
        hasLoop: true,
        loop: {
          description: 'Follow up with Sarah about scam attempt',
          owner: 'self',
        },
        securityTier: 'Tier2_Personal',
        persona: 'betty',
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return memories;
}

// ============================================================================
// Main Generator
// ============================================================================

export interface GenerateOptions {
  /** Persona to generate for */
  persona: 'alan' | 'betty' | 'both';
  /** Start date */
  startDate: Date;
  /** Number of weeks */
  numWeeks: number;
}

export function generateSyntheticData(options: GenerateOptions): GeneratedMemory[] {
  const { persona, startDate, numWeeks } = options;
  let memories: GeneratedMemory[] = [];

  if (persona === 'alan' || persona === 'both') {
    const schedule = generateSchedule(startDate, numWeeks);
    const occurringSlots = getOccurringSlots(schedule);

    for (const slot of occurringSlots) {
      memories = memories.concat(generateMemoryFromSlot(slot, 'alan'));
    }
  }

  if (persona === 'betty' || persona === 'both') {
    memories = memories.concat(generateBettyMemories(startDate, numWeeks * 7));
  }

  // Sort by createdAt
  memories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return memories;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const startDate = new Date('2026-01-01');
  const memories = generateSyntheticData({
    persona: 'both',
    startDate,
    numWeeks: 4,
  });

  console.log(`Generated ${memories.length} memories`);
  console.log(`Alan: ${memories.filter(m => m.persona === 'alan').length}`);
  console.log(`Betty: ${memories.filter(m => m.persona === 'betty').length}`);
  console.log(`With loops: ${memories.filter(m => m.hasLoop).length}`);

  // Output to file
  const fs = await import('fs');
  fs.writeFileSync(
    'synthetic_memories.json',
    JSON.stringify(memories, null, 2)
  );
  console.log('Written to synthetic_memories.json');
}

export default generateSyntheticData;
