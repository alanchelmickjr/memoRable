/**
 * @file Routine Tracker Service
 *
 * Tracks recurring patterns and rituals — the peer of open_loop_tracker.
 *
 * Loops close. Routines cycle.
 *
 * A Routine represents:
 *   - User-defined rituals ("morning briefing", "pre-commit checklist")
 *   - AI-learned patterns (promoted from anticipation_service)
 *   - Imported AI-side routines (Claude Code Routines, etc.)
 *
 * Check-in events evidence that a routine actually happened. They drive
 * streak tracking, confidence adjustments for learned routines, and surface
 * "missed routine" signals in the briefing.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Routine,
  RoutineCheckIn,
  RoutineStatus,
  RoutineSource,
  RoutineCategory,
  RoutineCadence,
} from './models';
import { collections } from './database';

// ============================================================================
// CONSTANTS
// ============================================================================

/** How many recent check-ins to consider for streak computation. */
const STREAK_HISTORY_LIMIT = 30;

/** Default minutes-window considered "on time" around expectedTimeOfDay. */
const ON_TIME_WINDOW_MINUTES = 60;

// ============================================================================
// CREATE / UPSERT
// ============================================================================

export interface UpsertRoutineInput {
  userId: string;
  name: string;
  category?: RoutineCategory;
  cadence: RoutineCadence;
  cadenceDetail?: string;
  expectedTimeOfDay?: string;   // "HH:MM"
  daysOfWeek?: number[];
  description?: string;
  source?: RoutineSource;
  confidence?: number;
  entities?: string[];
  sourceMemoryId?: string;
  importExternalId?: string;
  metadata?: Record<string, any>;
}

/**
 * Create a new routine, or update by (userId, source, importExternalId) if
 * an external import key is provided. For user-defined routines, always creates.
 */
export async function upsertRoutine(input: UpsertRoutineInput): Promise<Routine> {
  const now = new Date().toISOString();
  const source = input.source ?? 'user_defined';

  // Dedup path for imports
  if (input.importExternalId && source !== 'user_defined') {
    const existing = await collections.routines().findOne({
      userId: input.userId,
      source,
      importExternalId: input.importExternalId,
    });

    if (existing) {
      const update: Partial<Routine> = {
        name: input.name,
        description: input.description ?? existing.description,
        category: input.category ?? existing.category,
        cadence: input.cadence,
        cadenceDetail: input.cadenceDetail ?? existing.cadenceDetail,
        expectedTimeOfDay: input.expectedTimeOfDay ?? existing.expectedTimeOfDay,
        daysOfWeek: input.daysOfWeek ?? existing.daysOfWeek,
        confidence: input.confidence ?? existing.confidence,
        entities: input.entities ?? existing.entities,
        metadata: { ...(existing.metadata || {}), ...(input.metadata || {}) },
        updatedAt: now,
        nextExpectedAt: computeNextExpectedAt(input, new Date()),
      };
      await collections.routines().updateOne({ id: existing.id }, { $set: update });
      return { ...existing, ...update } as Routine;
    }
  }

  const routine: Routine = {
    id: uuidv4(),
    userId: input.userId,
    name: input.name,
    description: input.description,
    category: input.category ?? 'other',
    cadence: input.cadence,
    cadenceDetail: input.cadenceDetail,
    expectedTimeOfDay: input.expectedTimeOfDay,
    daysOfWeek: input.daysOfWeek,
    status: 'active',
    source,
    confidence: input.confidence,
    createdAt: now,
    updatedAt: now,
    nextExpectedAt: computeNextExpectedAt(input, new Date()),
    streak: 0,
    entities: input.entities,
    sourceMemoryId: input.sourceMemoryId,
    importExternalId: input.importExternalId,
    metadata: input.metadata,
  };

  await collections.routines().insertOne(routine);
  return routine;
}

// ============================================================================
// READ
// ============================================================================

export interface ListRoutinesOptions {
  status?: RoutineStatus;
  category?: RoutineCategory;
  source?: RoutineSource;
  ids?: string[];
  /** Only return routines whose nextExpectedAt is within this many hours from now. */
  dueWithinHours?: number;
}

/**
 * List routines for a user. Defaults to status='active' when no filter given.
 */
export async function listRoutines(
  userId: string,
  options: ListRoutinesOptions = {}
): Promise<Routine[]> {
  const query: any = { userId };

  if (options.status) query.status = options.status;
  else if (!options.ids) query.status = 'active';

  if (options.category) query.category = options.category;
  if (options.source) query.source = options.source;
  if (options.ids && options.ids.length > 0) query.id = { $in: options.ids };

  if (options.dueWithinHours !== undefined) {
    const horizon = new Date(Date.now() + options.dueWithinHours * 3600 * 1000).toISOString();
    query.nextExpectedAt = { $lte: horizon };
  }

  return collections.routines().find(query).sort({ nextExpectedAt: 1 }).toArray();
}

export async function getRoutine(routineId: string): Promise<Routine | null> {
  return collections.routines().findOne({ id: routineId });
}

// ============================================================================
// UPDATE / STATUS TRANSITIONS
// ============================================================================

/**
 * Suppress a routine — stop surfacing it until `until` (or indefinitely).
 * Alan: "don't bug me about the morning review this week."
 */
export async function suppressRoutine(
  routineId: string,
  until?: string
): Promise<void> {
  const now = new Date().toISOString();
  await collections.routines().updateOne(
    { id: routineId },
    {
      $set: {
        status: 'suppressed',
        suppressUntil: until,
        updatedAt: now,
      },
    }
  );
}

export async function resumeRoutine(routineId: string): Promise<void> {
  const now = new Date().toISOString();
  await collections.routines().updateOne(
    { id: routineId },
    {
      $set: { status: 'active', updatedAt: now },
      $unset: { suppressUntil: '' },
    }
  );
}

export async function pauseRoutine(routineId: string): Promise<void> {
  const now = new Date().toISOString();
  await collections.routines().updateOne(
    { id: routineId },
    { $set: { status: 'paused', updatedAt: now } }
  );
}

// ============================================================================
// CHECK-IN
// ============================================================================

export interface CheckInRoutineInput {
  routineId: string;
  userId: string;
  occurredAt?: string;          // Defaults to now
  memoryId?: string;
  notes?: string;
}

/**
 * Record a check-in for a routine.
 * Updates lastSeenAt, recomputes nextExpectedAt, adjusts streak.
 */
export async function checkInRoutine(input: CheckInRoutineInput): Promise<RoutineCheckIn> {
  const routine = await getRoutine(input.routineId);
  if (!routine) throw new Error(`Routine not found: ${input.routineId}`);

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const onTime = computeOnTime(routine, new Date(occurredAt));

  const checkIn: RoutineCheckIn = {
    id: uuidv4(),
    routineId: input.routineId,
    userId: input.userId,
    occurredAt,
    memoryId: input.memoryId,
    onTime,
    notes: input.notes,
  };

  await collections.routineCheckIns().insertOne(checkIn);

  // Update the routine: lastSeenAt, nextExpectedAt, streak
  const nextExpectedAt = computeNextExpectedAt(
    {
      cadence: routine.cadence,
      expectedTimeOfDay: routine.expectedTimeOfDay,
      daysOfWeek: routine.daysOfWeek,
    },
    new Date(occurredAt)
  );

  const newStreak = onTime ? (routine.streak ?? 0) + 1 : 0;

  await collections.routines().updateOne(
    { id: input.routineId },
    {
      $set: {
        lastSeenAt: occurredAt,
        nextExpectedAt,
        streak: newStreak,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  return checkIn;
}

/**
 * Get the most recent check-ins for a routine (for streak / history display).
 */
export async function getRecentCheckIns(
  routineId: string,
  limit = STREAK_HISTORY_LIMIT
): Promise<RoutineCheckIn[]> {
  return collections
    .routineCheckIns()
    .find({ routineId })
    .sort({ occurredAt: -1 })
    .limit(limit)
    .toArray();
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteRoutine(routineId: string): Promise<void> {
  await collections.routines().deleteOne({ id: routineId });
  await collections.routineCheckIns().deleteMany({ routineId });
}

// ============================================================================
// CADENCE / TIMING HELPERS
// ============================================================================

/**
 * Compute the next expected occurrence given cadence and the anchor time.
 * Returns ISO8601 string or undefined if cadence is 'custom' (no auto-schedule).
 */
function computeNextExpectedAt(
  input: {
    cadence: RoutineCadence;
    expectedTimeOfDay?: string;
    daysOfWeek?: number[];
  },
  anchor: Date
): string | undefined {
  if (input.cadence === 'custom') return undefined;

  const next = new Date(anchor.getTime());

  // Apply time-of-day if given (HH:MM local to the anchor's timezone)
  if (input.expectedTimeOfDay && /^\d{2}:\d{2}$/.test(input.expectedTimeOfDay)) {
    const [h, m] = input.expectedTimeOfDay.split(':').map(Number);
    next.setHours(h, m, 0, 0);
    // If that time has already passed today, push to next interval
    if (next.getTime() <= anchor.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  } else {
    // Default: push one interval out
    next.setDate(next.getDate() + 1);
  }

  switch (input.cadence) {
    case 'daily':
      break; // Already set above
    case 'weekday': {
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }
    case 'weekend': {
      while (next.getDay() !== 0 && next.getDay() !== 6) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }
    case 'weekly': {
      if (input.daysOfWeek && input.daysOfWeek.length > 0) {
        while (!input.daysOfWeek.includes(next.getDay())) {
          next.setDate(next.getDate() + 1);
        }
      } else {
        next.setDate(anchor.getDate() + 7);
      }
      break;
    }
    case 'biweekly': {
      next.setDate(anchor.getDate() + 14);
      break;
    }
    case 'monthly': {
      next.setMonth(anchor.getMonth() + 1);
      break;
    }
  }

  return next.toISOString();
}

/**
 * Was this check-in within the on-time window of the routine's expected schedule?
 */
function computeOnTime(routine: Routine, occurredAt: Date): boolean {
  if (!routine.nextExpectedAt) return true; // No schedule -> always on time
  const expected = new Date(routine.nextExpectedAt);
  const delta = Math.abs(occurredAt.getTime() - expected.getTime());
  return delta <= ON_TIME_WINDOW_MINUTES * 60 * 1000;
}

// ============================================================================
// BRIEFING HELPERS
// ============================================================================

/**
 * Format a routine for briefing display.
 * "morning briefing: due in 2h (streak: 14)"
 */
export function formatRoutineLine(routine: Routine, now: Date = new Date()): string {
  const parts: string[] = [routine.name];

  if (routine.nextExpectedAt) {
    const expected = new Date(routine.nextExpectedAt);
    const diffMs = expected.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (3600 * 1000));

    if (diffHours < -24) {
      parts.push(`missed (${Math.abs(Math.round(diffHours / 24))}d late)`);
    } else if (diffHours < 0) {
      parts.push(`overdue (${Math.abs(diffHours)}h)`);
    } else if (diffHours < 1) {
      parts.push('due now');
    } else if (diffHours < 24) {
      parts.push(`due in ${diffHours}h`);
    } else {
      parts.push(`due in ${Math.round(diffHours / 24)}d`);
    }
  }

  if (routine.streak && routine.streak > 1) {
    parts.push(`streak: ${routine.streak}`);
  }

  return parts.join(' — ');
}

/**
 * Get routines that are surfaced-worthy right now:
 * active status, not suppressed past now, due within horizon hours.
 */
export async function getSurfacableRoutines(
  userId: string,
  horizonHours = 24
): Promise<Routine[]> {
  const nowIso = new Date().toISOString();
  const routines = await listRoutines(userId, {
    status: 'active',
    dueWithinHours: horizonHours,
  });

  return routines.filter((r) => !r.suppressUntil || r.suppressUntil <= nowIso);
}
