/**
 * @file Energy-Aware Task Retrieval Service for TaskForge Triage Integration
 *
 * Matches tasks to user energy levels for optimal productivity.
 * High energy? Tackle complex strategic work. Low energy? Quick wins only.
 *
 * Key insight: Not all tasks are created equal - some require deep focus,
 * others can be done on autopilot. Energy-aware retrieval surfaces the
 * right tasks at the right time.
 *
 * TaskForge Triage Integration: Provides task recommendations based on
 * current energy state, cognitive load requirements, and deadline urgency.
 */
import type { OpenLoop, LoopCategory } from './models';
/**
 * User's current energy level.
 * Maps to cognitive capacity and focus availability.
 */
export type EnergyLevel = 'peak' | 'high' | 'medium' | 'low' | 'recovery';
/**
 * Cognitive load required for a task.
 * Higher load requires more energy and focus.
 */
export type CognitiveLoad = 'minimal' | 'light' | 'moderate' | 'heavy' | 'intense';
/**
 * Task complexity assessment.
 */
export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'strategic';
/**
 * Time block size for task batching.
 */
export type TimeBlock = '5min' | '15min' | '30min' | '1hour' | '2hours' | 'deep_work';
/**
 * Task with energy-aware metadata for optimal matching.
 */
export interface EnergyAwareTask {
    /** Original open loop */
    loop: OpenLoop;
    /** Computed cognitive requirements */
    cognitiveLoad: CognitiveLoad;
    complexity: TaskComplexity;
    estimatedMinutes: number;
    recommendedTimeBlock: TimeBlock;
    /** Energy matching */
    minEnergyLevel: EnergyLevel;
    optimalEnergyLevel: EnergyLevel;
    energyMatch: number;
    /** Urgency factors */
    urgencyScore: number;
    deadlinePressure: 'none' | 'low' | 'moderate' | 'high' | 'critical';
    daysUntilDue: number | null;
    /** TaskForge Triage metadata */
    triageCategory: TriageCategory;
    triagePriority: number;
    triageRecommendation: string;
}
/**
 * TaskForge Triage categories.
 */
export type TriageCategory = 'do_now' | 'schedule' | 'delegate' | 'quick_win' | 'deep_work' | 'batch' | 'defer' | 'reconsider';
/**
 * Energy context for task retrieval.
 */
export interface EnergyContext {
    /** Current energy level */
    currentEnergy: EnergyLevel;
    /** Available time in minutes */
    availableMinutes?: number;
    /** Time of day context */
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    /** Is this a focused work session? */
    focusMode?: boolean;
    /** Preferred task types */
    preferCategories?: LoopCategory[];
    /** Tasks to exclude */
    excludeLoopIds?: string[];
}
/**
 * Result of energy-aware task retrieval.
 */
export interface EnergyAwareTaskResult {
    /** Tasks matching current energy */
    recommended: EnergyAwareTask[];
    /** Quick wins available regardless of energy */
    quickWins: EnergyAwareTask[];
    /** Overdue tasks that need attention */
    overdue: EnergyAwareTask[];
    /** Tasks to consider when energy improves */
    deferredForHigherEnergy: EnergyAwareTask[];
    /** Summary stats */
    stats: {
        totalTasks: number;
        matchingEnergy: number;
        overdueCount: number;
        averageUrgency: number;
    };
}
/**
 * Get tasks matched to user's current energy level.
 *
 * @param userId - User ID
 * @param context - Current energy context
 * @returns Energy-matched task recommendations
 */
export declare function getEnergyAwareTasks(userId: string, context: EnergyContext): Promise<EnergyAwareTaskResult>;
/**
 * Get quick wins - tasks that can be completed with minimal energy.
 *
 * @param userId - User ID
 * @param maxMinutes - Maximum minutes per task (default 15)
 * @param limit - Maximum tasks to return (default 5)
 */
export declare function getQuickWins(userId: string, maxMinutes?: number, limit?: number): Promise<EnergyAwareTask[]>;
/**
 * Get tasks for deep work sessions (high energy, extended focus).
 *
 * @param userId - User ID
 * @param availableMinutes - Available time for deep work
 */
export declare function getDeepWorkTasks(userId: string, availableMinutes?: number): Promise<EnergyAwareTask[]>;
/**
 * Get tasks for a specific time block.
 *
 * @param userId - User ID
 * @param timeBlock - Available time block
 * @param energyLevel - Current energy level
 */
export declare function getTasksForTimeBlock(userId: string, timeBlock: TimeBlock, energyLevel: EnergyLevel): Promise<EnergyAwareTask[]>;
/**
 * Assess a single task for TaskForge Triage.
 *
 * @param loop - Open loop to assess
 * @param energyLevel - Current energy level for matching
 */
export declare function triageTask(loop: OpenLoop, energyLevel?: EnergyLevel): EnergyAwareTask;
/**
 * Batch triage multiple tasks.
 *
 * @param loops - Open loops to triage
 * @param energyLevel - Current energy level
 */
export declare function batchTriageTasks(loops: OpenLoop[], energyLevel?: EnergyLevel): EnergyAwareTask[];
/**
 * Get energy level description for UI display.
 */
export declare function getEnergyDescription(level: EnergyLevel): string;
/**
 * Get cognitive load description for UI display.
 */
export declare function getCognitiveLoadDescription(load: CognitiveLoad): string;
/**
 * Suggest optimal energy level for time of day.
 */
export declare function suggestEnergyForTimeOfDay(hour?: number): EnergyLevel;
