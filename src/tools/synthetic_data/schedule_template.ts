/**
 * @file Schedule Template for Synthetic Data Generation
 *
 * Defines realistic daily/weekly patterns for a developer (Alan-like persona).
 * This schedule drives memory generation - each activity slot produces
 * memories of specific types with appropriate entities and context.
 *
 * The goal: minimize sim2real gap by modeling actual work patterns.
 */

// ============================================================================
// Time Slots
// ============================================================================

export interface TimeSlot {
  /** Hour of day (0-23) */
  hour: number;
  /** Duration in minutes */
  duration: number;
  /** Activity type */
  activity: ActivityType;
  /** Typical location */
  location: LocationType;
  /** Energy level (affects memory emotional tone) */
  energyLevel: 'low' | 'medium' | 'high';
  /** Probability this slot occurs (0-1) */
  probability: number;
  /** People likely involved */
  typicalPeople: PersonRole[];
  /** Memory types this activity generates */
  memoryTypes: MemoryType[];
}

export type ActivityType =
  | 'wake_check_phone'
  | 'morning_routine'
  | 'commute'
  | 'standup'
  | 'email_triage'
  | 'code_review'
  | 'deep_work_coding'
  | 'research'
  | 'meeting_scheduled'
  | 'meeting_adhoc'
  | 'lunch'
  | 'break'
  | 'wrap_up'
  | 'personal_evening'
  | 'wind_down'
  | 'weekend_personal'
  | 'weekend_project';

export type LocationType =
  | 'home'
  | 'home_office'
  | 'office_hq'
  | 'cafe'
  | 'transit'
  | 'gym'
  | 'outside';

export type PersonRole =
  | 'teammate'
  | 'manager'
  | 'stakeholder'
  | 'external'
  | 'ai_assistant'
  | 'family'
  | 'friend';

export type MemoryType =
  | 'commitment_made'      // "I will do X by Y"
  | 'commitment_received'  // "They will do X by Y"
  | 'decision'             // "We decided to X"
  | 'context'              // "X mentioned Y"
  | 'question_asked'       // "Asked about X"
  | 'question_answered'    // "Learned that X"
  | 'status_update'        // "X is now Y"
  | 'blocker'              // "Blocked on X"
  | 'idea'                 // "What if we X"
  | 'feedback_given'       // "Told X that Y"
  | 'feedback_received'    // "X said Y about my work"
  | 'personal_note'        // Non-work memory
  | 'research_finding'     // "Found that X"
  | 'bug_found'            // "Discovered bug in X"
  | 'task_completed'       // "Finished X"
  | 'meeting_notes';       // Summary of meeting

// ============================================================================
// Weekday Schedule Template
// ============================================================================

export const WEEKDAY_SCHEDULE: TimeSlot[] = [
  // Early morning
  {
    hour: 6,
    duration: 30,
    activity: 'wake_check_phone',
    location: 'home',
    energyLevel: 'low',
    probability: 0.9,
    typicalPeople: [],
    memoryTypes: ['context', 'commitment_received'],
  },
  {
    hour: 7,
    duration: 60,
    activity: 'morning_routine',
    location: 'home',
    energyLevel: 'medium',
    probability: 1.0,
    typicalPeople: ['family'],
    memoryTypes: ['personal_note'],
  },

  // Work morning
  {
    hour: 9,
    duration: 30,
    activity: 'standup',
    location: 'home_office',
    energyLevel: 'high',
    probability: 0.85,
    typicalPeople: ['teammate', 'manager'],
    memoryTypes: ['status_update', 'blocker', 'commitment_made'],
  },
  {
    hour: 9,
    duration: 45,
    activity: 'email_triage',
    location: 'home_office',
    energyLevel: 'high',
    probability: 0.95,
    typicalPeople: ['teammate', 'stakeholder', 'external'],
    memoryTypes: ['commitment_received', 'question_asked', 'context'],
  },
  {
    hour: 10,
    duration: 60,
    activity: 'code_review',
    location: 'home_office',
    energyLevel: 'high',
    probability: 0.7,
    typicalPeople: ['teammate', 'ai_assistant'],
    memoryTypes: ['feedback_given', 'feedback_received', 'decision', 'question_asked'],
  },
  {
    hour: 11,
    duration: 120,
    activity: 'deep_work_coding',
    location: 'home_office',
    energyLevel: 'high',
    probability: 0.9,
    typicalPeople: ['ai_assistant'],
    memoryTypes: ['research_finding', 'bug_found', 'task_completed', 'idea', 'question_asked'],
  },

  // Midday
  {
    hour: 13,
    duration: 60,
    activity: 'lunch',
    location: 'home',
    energyLevel: 'medium',
    probability: 1.0,
    typicalPeople: ['family'],
    memoryTypes: ['personal_note', 'context'],
  },

  // Afternoon
  {
    hour: 14,
    duration: 60,
    activity: 'meeting_scheduled',
    location: 'home_office',
    energyLevel: 'medium',
    probability: 0.6,
    typicalPeople: ['teammate', 'manager', 'stakeholder'],
    memoryTypes: ['decision', 'commitment_made', 'commitment_received', 'meeting_notes'],
  },
  {
    hour: 15,
    duration: 120,
    activity: 'deep_work_coding',
    location: 'home_office',
    energyLevel: 'medium',
    probability: 0.85,
    typicalPeople: ['ai_assistant'],
    memoryTypes: ['research_finding', 'bug_found', 'task_completed', 'blocker'],
  },
  {
    hour: 17,
    duration: 30,
    activity: 'wrap_up',
    location: 'home_office',
    energyLevel: 'low',
    probability: 0.9,
    typicalPeople: ['ai_assistant'],
    memoryTypes: ['status_update', 'commitment_made', 'context'],
  },

  // Evening
  {
    hour: 18,
    duration: 180,
    activity: 'personal_evening',
    location: 'home',
    energyLevel: 'medium',
    probability: 1.0,
    typicalPeople: ['family', 'friend'],
    memoryTypes: ['personal_note', 'context'],
  },
  {
    hour: 22,
    duration: 60,
    activity: 'wind_down',
    location: 'home',
    energyLevel: 'low',
    probability: 0.8,
    typicalPeople: [],
    memoryTypes: ['idea', 'personal_note'],
  },
];

// ============================================================================
// Weekend Schedule Template
// ============================================================================

export const WEEKEND_SCHEDULE: TimeSlot[] = [
  {
    hour: 8,
    duration: 120,
    activity: 'morning_routine',
    location: 'home',
    energyLevel: 'medium',
    probability: 1.0,
    typicalPeople: ['family'],
    memoryTypes: ['personal_note'],
  },
  {
    hour: 10,
    duration: 180,
    activity: 'weekend_personal',
    location: 'outside',
    energyLevel: 'high',
    probability: 0.7,
    typicalPeople: ['family', 'friend'],
    memoryTypes: ['personal_note', 'context'],
  },
  {
    hour: 14,
    duration: 120,
    activity: 'weekend_project',
    location: 'home_office',
    energyLevel: 'medium',
    probability: 0.5,
    typicalPeople: ['ai_assistant'],
    memoryTypes: ['idea', 'research_finding', 'task_completed'],
  },
  {
    hour: 18,
    duration: 180,
    activity: 'personal_evening',
    location: 'home',
    energyLevel: 'medium',
    probability: 1.0,
    typicalPeople: ['family', 'friend'],
    memoryTypes: ['personal_note'],
  },
];

// ============================================================================
// Week Modifiers (stress patterns, deadlines, etc.)
// ============================================================================

export interface WeekModifier {
  /** Week number (1-4) */
  week: number;
  /** Name of the pattern */
  name: string;
  /** Adjustments to apply */
  adjustments: {
    /** Multiply meeting probability */
    meetingMultiplier?: number;
    /** Multiply deep work probability */
    deepWorkMultiplier?: number;
    /** Base stress level (0-1) */
    stressLevel?: number;
    /** Additional memory types to inject */
    injectMemoryTypes?: MemoryType[];
    /** Topics to emphasize */
    emphasisTopics?: string[];
  };
}

export const FOUR_WEEK_PATTERN: WeekModifier[] = [
  {
    week: 1,
    name: 'baseline',
    adjustments: {
      meetingMultiplier: 1.0,
      deepWorkMultiplier: 1.0,
      stressLevel: 0.2,
    },
  },
  {
    week: 2,
    name: 'ramping_up',
    adjustments: {
      meetingMultiplier: 1.2,
      deepWorkMultiplier: 1.1,
      stressLevel: 0.35,
      emphasisTopics: ['deadline', 'progress', 'blockers'],
    },
  },
  {
    week: 3,
    name: 'deadline_crunch',
    adjustments: {
      meetingMultiplier: 1.5,
      deepWorkMultiplier: 0.8,
      stressLevel: 0.7,
      injectMemoryTypes: ['blocker', 'commitment_made'],
      emphasisTopics: ['deadline', 'urgent', 'shipping', 'crunch'],
    },
  },
  {
    week: 4,
    name: 'post_deadline',
    adjustments: {
      meetingMultiplier: 0.8,
      deepWorkMultiplier: 1.2,
      stressLevel: 0.15,
      injectMemoryTypes: ['task_completed', 'feedback_received'],
      emphasisTopics: ['retro', 'learnings', 'next sprint', 'cleanup'],
    },
  },
];

// ============================================================================
// Schedule Generator
// ============================================================================

export interface ScheduledSlot extends TimeSlot {
  /** Actual date/time */
  datetime: Date;
  /** Week number */
  weekNumber: number;
  /** Day of week (0=Sunday) */
  dayOfWeek: number;
  /** Applied modifier */
  modifier: WeekModifier;
  /** Whether this slot actually occurs (based on probability) */
  occurs: boolean;
}

/**
 * Generate a full schedule for N weeks starting from a date.
 */
export function generateSchedule(
  startDate: Date,
  numWeeks: number = 4
): ScheduledSlot[] {
  const slots: ScheduledSlot[] = [];
  const currentDate = new Date(startDate);

  for (let week = 0; week < numWeeks; week++) {
    const modifier = FOUR_WEEK_PATTERN[week % FOUR_WEEK_PATTERN.length];

    for (let day = 0; day < 7; day++) {
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const template = isWeekend ? WEEKEND_SCHEDULE : WEEKDAY_SCHEDULE;

      for (const slot of template) {
        // Apply modifiers to probability
        let probability = slot.probability;
        if (slot.activity.includes('meeting') && modifier.adjustments.meetingMultiplier) {
          probability *= modifier.adjustments.meetingMultiplier;
        }
        if (slot.activity.includes('deep_work') && modifier.adjustments.deepWorkMultiplier) {
          probability *= modifier.adjustments.deepWorkMultiplier;
        }
        probability = Math.min(1, probability);

        const datetime = new Date(currentDate);
        datetime.setHours(slot.hour, 0, 0, 0);

        slots.push({
          ...slot,
          datetime,
          weekNumber: week + 1,
          dayOfWeek,
          modifier,
          occurs: Math.random() < probability,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return slots;
}

/**
 * Filter to only slots that occur.
 */
export function getOccurringSlots(schedule: ScheduledSlot[]): ScheduledSlot[] {
  return schedule.filter(slot => slot.occurs);
}

// ============================================================================
// Export
// ============================================================================

export default {
  WEEKDAY_SCHEDULE,
  WEEKEND_SCHEDULE,
  FOUR_WEEK_PATTERN,
  generateSchedule,
  getOccurringSlots,
};
