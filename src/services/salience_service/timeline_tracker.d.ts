/**
 * @file Person Timeline Tracker Service
 * Tracks what's happening in other people's lives - their events, not just yours.
 *
 * Critical for "the dance" - knowing:
 * - Sarah's daughter's recital is Thursday
 * - Jennifer's Series B is closing next month
 * - Mike's father is in the hospital
 *
 * This lets you ask the right questions and avoid the wrong ones.
 */
import type { PersonTimelineEvent, ExtractedFeatures } from './models';
/**
 * Create timeline events from extracted features.
 * Gracefully handles errors to avoid disrupting the main ingestion flow.
 */
export declare function createTimelineEventsFromFeatures(features: ExtractedFeatures, userId: string, memoryId: string, memoryCreatedAt?: Date): Promise<PersonTimelineEvent[]>;
/**
 * Get upcoming events for a specific person.
 */
export declare function getUpcomingEventsForContact(userId: string, contactId: string, daysAhead?: number): Promise<PersonTimelineEvent[]>;
/**
 * Get upcoming events across all contacts.
 */
export declare function getUpcomingEvents(userId: string, daysAhead?: number): Promise<PersonTimelineEvent[]>;
/**
 * Get recent events (what happened recently in their lives).
 */
export declare function getRecentEventsForContact(userId: string, contactId: string, daysBack?: number): Promise<PersonTimelineEvent[]>;
/**
 * Get events that should trigger reminders.
 */
export declare function getEventsNeedingReminders(userId: string): Promise<PersonTimelineEvent[]>;
/**
 * Mark an event as mentioned (so we don't keep suggesting it).
 */
export declare function markEventMentioned(eventId: string): Promise<void>;
/**
 * Get sensitive events to be aware of (but not proactively mention).
 */
export declare function getSensitiveContext(userId: string, contactId: string): Promise<PersonTimelineEvent[]>;
/**
 * Process recurring events (advance annual events to next year).
 * Should be called periodically (e.g., daily).
 */
export declare function processRecurringEvents(userId: string): Promise<number>;
