/**
 * Anticipation Service - Predictive Memory Surfacing
 *
 * Based on legacy research (confidenceService.js) with 21-day pattern formation:
 * - Patterns require 21 days of data before predictions become reliable
 * - Confidence ramps from 0.4 → 0.6 → 0.8 as occurrences accumulate
 * - Post-21 days, confidence = consistency (occurrences / days)
 * - Attention decay with exponential falloff
 *
 * Integrates with:
 * - Context frames (location, people, activity)
 * - Calendar events (recurring patterns)
 * - Memory access logs (what got used vs ignored)
 * - Salience scores (what mattered)
 */
import { Db } from 'mongodb';
export interface PatternFeatures {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: number;
    location?: string;
    activity?: string;
    people?: string[];
    calendarEventType?: string;
    projectContext?: string;
}
export interface LearnedPattern {
    patternId: string;
    userId: string;
    features: PatternFeatures;
    relevantMemoryIds: string[];
    relevantPeople: string[];
    relevantTopics: string[];
    occurrences: number;
    firstSeen: string;
    lastSeen: string;
    confidence: number;
    isFormed: boolean;
    timesUsed: number;
    timesIgnored: number;
    timesDismissed: number;
    rewardSignal: number;
}
export interface CalendarEvent {
    eventId: string;
    title: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
    location?: string;
    recurring?: boolean;
    recurrencePattern?: string;
}
export interface AnticipatedContext {
    predictedAt: string;
    triggerTime: string;
    confidence: number;
    features: PatternFeatures;
    suggestedBriefings: string[];
    suggestedMemories: Array<{
        memoryId: string;
        reason: string;
        confidence: number;
    }>;
    suggestedTopics: string[];
    basedOn: {
        calendarEvent?: CalendarEvent;
        learnedPattern?: string;
        recurringBehavior?: string;
    };
}
export interface FeedbackSignal {
    patternId: string;
    memoryId?: string;
    action: 'used' | 'ignored' | 'dismissed';
    context: PatternFeatures;
    timestamp: string;
}
export interface PatternStats {
    totalPatterns: number;
    formedPatterns: number;
    averageConfidence: number;
    dataCollectionDays: number;
    readyForPrediction: boolean;
}
declare const THRESHOLDS: {
    quickResponse: number;
    patternFormation: number;
    habitConfirmation: number;
    predictionReady: number;
};
declare const WINDOWS: {
    patternFormation: number;
    attention: number;
    cleanup: number;
    preBriefing: number;
};
/**
 * Calculate pattern confidence based on 21-day formation rule
 */
declare function calculatePatternConfidence(pattern: LearnedPattern): number;
/**
 * Calculate reward signal from feedback
 */
declare function calculateRewardSignal(pattern: LearnedPattern): number;
export declare function initAnticipationService(database: Db): void;
/**
 * Record a context observation for pattern learning
 */
export declare function observeContext(userId: string, features: PatternFeatures, accessedMemories: string[], mentionedPeople: string[], discussedTopics: string[]): Promise<void>;
/**
 * Record feedback on surfaced predictions (RL signal for pattern learning)
 */
export declare function recordPatternFeedback(userId: string, feedback: FeedbackSignal): Promise<void>;
/**
 * Get anticipated context for upcoming time window
 */
export declare function getAnticipatedContext(userId: string, upcomingCalendar: CalendarEvent[], lookAheadMinutes?: number): Promise<AnticipatedContext[]>;
/**
 * Get pattern learning statistics
 */
export declare function getPatternStats(userId: string): Promise<PatternStats>;
/**
 * Generate morning briefing based on anticipated day
 */
export declare function generateDayAnticipation(userId: string, calendar: CalendarEvent[]): Promise<{
    greeting: string;
    dayOutlook: string;
    anticipatedContexts: AnticipatedContext[];
    patternInsights: string[];
}>;
declare function getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night';
declare function getDayName(day: number): string;
export { THRESHOLDS, WINDOWS, calculatePatternConfidence, calculateRewardSignal, getTimeOfDay, getDayName, };
