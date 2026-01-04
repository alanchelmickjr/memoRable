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
import { getOpenLoops, getOverdueLoops, getUpcomingDueLoops } from './open_loop_tracker';
// ============================================================================
// ENERGY LEVEL MAPPINGS
// ============================================================================
/**
 * Energy level to cognitive capacity mapping.
 */
const ENERGY_CAPACITY = {
    peak: 100,
    high: 80,
    medium: 60,
    low: 35,
    recovery: 15,
};
/**
 * Cognitive load requirements.
 */
const COGNITIVE_REQUIREMENTS = {
    minimal: 10,
    light: 25,
    moderate: 50,
    heavy: 75,
    intense: 90,
};
/**
 * Time block durations in minutes.
 */
const TIME_BLOCK_MINUTES = {
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1hour': 60,
    '2hours': 120,
    'deep_work': 180,
};
/**
 * Category to cognitive load mapping (heuristic).
 */
const CATEGORY_COGNITIVE_LOAD = {
    deliverable: 'moderate',
    meeting: 'moderate',
    introduction: 'light',
    favor: 'light',
    information: 'minimal',
    decision: 'heavy',
    payment: 'minimal',
    other: 'moderate',
};
/**
 * Urgency to priority mapping.
 */
const URGENCY_PRIORITY = {
    urgent: 1,
    high: 2,
    normal: 3,
    low: 4,
};
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Get tasks matched to user's current energy level.
 *
 * @param userId - User ID
 * @param context - Current energy context
 * @returns Energy-matched task recommendations
 */
export async function getEnergyAwareTasks(userId, context) {
    // Fetch all open loops
    const allLoops = await getOpenLoops(userId, { status: 'open' });
    const overdueLoops = await getOverdueLoops(userId);
    const upcomingLoops = await getUpcomingDueLoops(userId, 7);
    // Filter by category preference if specified
    let relevantLoops = allLoops;
    if (context.preferCategories && context.preferCategories.length > 0) {
        relevantLoops = allLoops.filter((loop) => context.preferCategories.includes(loop.category));
    }
    // Exclude specified loops
    if (context.excludeLoopIds && context.excludeLoopIds.length > 0) {
        const excludeSet = new Set(context.excludeLoopIds);
        relevantLoops = relevantLoops.filter((loop) => !excludeSet.has(loop.id));
    }
    // Convert to energy-aware tasks
    const energyTasks = relevantLoops.map((loop) => assessTaskForEnergy(loop, context));
    // Categorize by energy match
    const recommended = [];
    const quickWins = [];
    const deferredForHigherEnergy = [];
    for (const task of energyTasks) {
        // Filter by available time if specified
        if (context.availableMinutes && task.estimatedMinutes > context.availableMinutes) {
            continue;
        }
        // Quick wins: low cognitive load, can be done at any energy
        if (task.cognitiveLoad === 'minimal' || task.cognitiveLoad === 'light') {
            if (task.estimatedMinutes <= 15) {
                quickWins.push(task);
                continue;
            }
        }
        // Good energy match (>= 0.6)
        if (task.energyMatch >= 0.6) {
            recommended.push(task);
        }
        else if (task.energyMatch < 0.4) {
            // Save for when energy improves
            deferredForHigherEnergy.push(task);
        }
        else {
            // Borderline - include in recommended but lower priority
            recommended.push(task);
        }
    }
    // Process overdue tasks
    const overdueTasks = overdueLoops.map((loop) => assessTaskForEnergy(loop, context));
    // Sort by priority within categories
    recommended.sort((a, b) => {
        // First by urgency score (higher first)
        if (b.urgencyScore !== a.urgencyScore) {
            return b.urgencyScore - a.urgencyScore;
        }
        // Then by energy match (better match first)
        return b.energyMatch - a.energyMatch;
    });
    quickWins.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    overdueTasks.sort((a, b) => {
        // Most overdue first
        const aDays = a.daysUntilDue ?? 0;
        const bDays = b.daysUntilDue ?? 0;
        return aDays - bDays;
    });
    deferredForHigherEnergy.sort((a, b) => b.urgencyScore - a.urgencyScore);
    // Calculate stats
    const totalTasks = energyTasks.length;
    const matchingEnergy = recommended.length + quickWins.length;
    const averageUrgency = totalTasks > 0
        ? energyTasks.reduce((sum, t) => sum + t.urgencyScore, 0) / totalTasks
        : 0;
    return {
        recommended: recommended.slice(0, 10),
        quickWins: quickWins.slice(0, 5),
        overdue: overdueTasks,
        deferredForHigherEnergy: deferredForHigherEnergy.slice(0, 5),
        stats: {
            totalTasks,
            matchingEnergy,
            overdueCount: overdueTasks.length,
            averageUrgency: Math.round(averageUrgency),
        },
    };
}
/**
 * Get quick wins - tasks that can be completed with minimal energy.
 *
 * @param userId - User ID
 * @param maxMinutes - Maximum minutes per task (default 15)
 * @param limit - Maximum tasks to return (default 5)
 */
export async function getQuickWins(userId, maxMinutes = 15, limit = 5) {
    const result = await getEnergyAwareTasks(userId, {
        currentEnergy: 'low', // Quick wins should work at any energy
        availableMinutes: maxMinutes,
    });
    return result.quickWins.slice(0, limit);
}
/**
 * Get tasks for deep work sessions (high energy, extended focus).
 *
 * @param userId - User ID
 * @param availableMinutes - Available time for deep work
 */
export async function getDeepWorkTasks(userId, availableMinutes = 120) {
    const result = await getEnergyAwareTasks(userId, {
        currentEnergy: 'peak',
        availableMinutes,
        focusMode: true,
    });
    // Filter to complex/strategic tasks
    return result.recommended.filter((task) => task.complexity === 'complex' ||
        task.complexity === 'strategic' ||
        task.cognitiveLoad === 'heavy' ||
        task.cognitiveLoad === 'intense');
}
/**
 * Get tasks for a specific time block.
 *
 * @param userId - User ID
 * @param timeBlock - Available time block
 * @param energyLevel - Current energy level
 */
export async function getTasksForTimeBlock(userId, timeBlock, energyLevel) {
    const availableMinutes = TIME_BLOCK_MINUTES[timeBlock];
    const result = await getEnergyAwareTasks(userId, {
        currentEnergy: energyLevel,
        availableMinutes,
    });
    // Combine recommended and quick wins, sorted by best fit
    const allMatching = [...result.recommended, ...result.quickWins];
    return allMatching
        .filter((task) => task.estimatedMinutes <= availableMinutes)
        .sort((a, b) => {
        // Best energy match first
        if (Math.abs(b.energyMatch - a.energyMatch) > 0.1) {
            return b.energyMatch - a.energyMatch;
        }
        // Then by urgency
        return b.urgencyScore - a.urgencyScore;
    })
        .slice(0, 5);
}
/**
 * Assess a single task for TaskForge Triage.
 *
 * @param loop - Open loop to assess
 * @param energyLevel - Current energy level for matching
 */
export function triageTask(loop, energyLevel = 'medium') {
    return assessTaskForEnergy(loop, { currentEnergy: energyLevel });
}
/**
 * Batch triage multiple tasks.
 *
 * @param loops - Open loops to triage
 * @param energyLevel - Current energy level
 */
export function batchTriageTasks(loops, energyLevel = 'medium') {
    return loops.map((loop) => triageTask(loop, energyLevel));
}
// ============================================================================
// INTERNAL HELPERS
// ============================================================================
/**
 * Assess a task's energy requirements and match to current context.
 */
function assessTaskForEnergy(loop, context) {
    // Estimate cognitive load from category and description
    const cognitiveLoad = estimateCognitiveLoad(loop);
    const complexity = estimateComplexity(loop);
    const estimatedMinutes = estimateDuration(loop, complexity);
    const recommendedTimeBlock = getRecommendedTimeBlock(estimatedMinutes);
    // Determine energy requirements
    const minEnergyLevel = getMinEnergyLevel(cognitiveLoad);
    const optimalEnergyLevel = getOptimalEnergyLevel(cognitiveLoad, complexity);
    // Calculate energy match
    const energyMatch = calculateEnergyMatch(context.currentEnergy, minEnergyLevel, optimalEnergyLevel);
    // Calculate urgency factors
    const { urgencyScore, deadlinePressure, daysUntilDue } = calculateUrgency(loop);
    // Determine triage category
    const triageCategory = determineTriageCategory(loop, cognitiveLoad, urgencyScore, energyMatch, context);
    // Generate recommendation
    const triageRecommendation = generateTriageRecommendation(loop, triageCategory, context.currentEnergy, energyMatch);
    return {
        loop,
        cognitiveLoad,
        complexity,
        estimatedMinutes,
        recommendedTimeBlock,
        minEnergyLevel,
        optimalEnergyLevel,
        energyMatch,
        urgencyScore,
        deadlinePressure,
        daysUntilDue,
        triageCategory,
        triagePriority: URGENCY_PRIORITY[loop.urgency],
        triageRecommendation,
    };
}
/**
 * Estimate cognitive load from task attributes.
 */
function estimateCognitiveLoad(loop) {
    const baseLoad = CATEGORY_COGNITIVE_LOAD[loop.category];
    const description = loop.description.toLowerCase();
    // Adjust based on description signals
    if (description.includes('complex') ||
        description.includes('analyze') ||
        description.includes('design') ||
        description.includes('strategy')) {
        return upgradeLoad(baseLoad);
    }
    if (description.includes('quick') ||
        description.includes('simple') ||
        description.includes('just') ||
        description.includes('only')) {
        return downgradeLoad(baseLoad);
    }
    return baseLoad;
}
/**
 * Upgrade cognitive load one level.
 */
function upgradeLoad(load) {
    const levels = ['minimal', 'light', 'moderate', 'heavy', 'intense'];
    const index = levels.indexOf(load);
    return levels[Math.min(index + 1, levels.length - 1)];
}
/**
 * Downgrade cognitive load one level.
 */
function downgradeLoad(load) {
    const levels = ['minimal', 'light', 'moderate', 'heavy', 'intense'];
    const index = levels.indexOf(load);
    return levels[Math.max(index - 1, 0)];
}
/**
 * Estimate task complexity.
 */
function estimateComplexity(loop) {
    const description = loop.description.toLowerCase();
    // Strategic tasks
    if (description.includes('strategy') ||
        description.includes('plan') ||
        description.includes('decide') ||
        description.includes('evaluate')) {
        return 'strategic';
    }
    // Complex tasks
    if (description.includes('research') ||
        description.includes('analyze') ||
        description.includes('design') ||
        description.includes('implement')) {
        return 'complex';
    }
    // Simple tasks
    if (description.includes('send') ||
        description.includes('forward') ||
        description.includes('reply') ||
        description.includes('confirm')) {
        return 'simple';
    }
    // Trivial tasks
    if (description.length < 30 || description.includes('quick')) {
        return 'trivial';
    }
    return 'moderate';
}
/**
 * Estimate task duration in minutes.
 */
function estimateDuration(loop, complexity) {
    const baseDurations = {
        trivial: 5,
        simple: 15,
        moderate: 30,
        complex: 60,
        strategic: 120,
    };
    let duration = baseDurations[complexity];
    // Adjust based on category
    if (loop.category === 'meeting') {
        duration = Math.max(30, duration);
    }
    if (loop.category === 'deliverable') {
        duration = Math.max(45, duration);
    }
    return duration;
}
/**
 * Get recommended time block for duration.
 */
function getRecommendedTimeBlock(minutes) {
    if (minutes <= 5)
        return '5min';
    if (minutes <= 15)
        return '15min';
    if (minutes <= 30)
        return '30min';
    if (minutes <= 60)
        return '1hour';
    if (minutes <= 120)
        return '2hours';
    return 'deep_work';
}
/**
 * Get minimum energy level required.
 */
function getMinEnergyLevel(load) {
    const mapping = {
        minimal: 'recovery',
        light: 'low',
        moderate: 'medium',
        heavy: 'high',
        intense: 'peak',
    };
    return mapping[load];
}
/**
 * Get optimal energy level for best performance.
 */
function getOptimalEnergyLevel(load, complexity) {
    // Strategic/complex work always benefits from peak energy
    if (complexity === 'strategic' || complexity === 'complex') {
        return 'peak';
    }
    const mapping = {
        minimal: 'low',
        light: 'medium',
        moderate: 'high',
        heavy: 'peak',
        intense: 'peak',
    };
    return mapping[load];
}
/**
 * Calculate how well current energy matches task requirements.
 */
function calculateEnergyMatch(current, minimum, optimal) {
    const currentCapacity = ENERGY_CAPACITY[current];
    const minRequired = ENERGY_CAPACITY[minimum];
    const optimalRequired = ENERGY_CAPACITY[optimal];
    // Below minimum = poor match
    if (currentCapacity < minRequired) {
        return currentCapacity / minRequired * 0.3; // Max 30% if below minimum
    }
    // At or above optimal = perfect match
    if (currentCapacity >= optimalRequired) {
        return 1.0;
    }
    // Between minimum and optimal = proportional match
    const range = optimalRequired - minRequired;
    const position = currentCapacity - minRequired;
    return 0.5 + (position / range) * 0.5; // 50-100% range
}
/**
 * Calculate urgency factors for a task.
 */
function calculateUrgency(loop) {
    let urgencyScore = 0;
    let deadlinePressure = 'none';
    let daysUntilDue = null;
    // Base urgency from loop urgency field
    const baseScores = {
        urgent: 80,
        high: 60,
        normal: 40,
        low: 20,
    };
    urgencyScore = baseScores[loop.urgency];
    // Calculate days until due
    const targetDate = loop.dueDate || loop.softDeadline;
    if (targetDate) {
        const now = new Date();
        const due = new Date(targetDate);
        daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        // Adjust urgency based on deadline proximity
        if (daysUntilDue < 0) {
            // Overdue
            urgencyScore = 100;
            deadlinePressure = 'critical';
        }
        else if (daysUntilDue === 0) {
            urgencyScore = Math.max(urgencyScore, 95);
            deadlinePressure = 'critical';
        }
        else if (daysUntilDue <= 1) {
            urgencyScore = Math.max(urgencyScore, 85);
            deadlinePressure = 'high';
        }
        else if (daysUntilDue <= 3) {
            urgencyScore = Math.max(urgencyScore, 70);
            deadlinePressure = 'moderate';
        }
        else if (daysUntilDue <= 7) {
            urgencyScore = Math.max(urgencyScore, 50);
            deadlinePressure = 'low';
        }
    }
    // Boost for "you owe" tasks (your responsibility)
    if (loop.owner === 'self') {
        urgencyScore = Math.min(100, urgencyScore + 10);
    }
    return { urgencyScore, deadlinePressure, daysUntilDue };
}
/**
 * Determine TaskForge Triage category.
 */
function determineTriageCategory(loop, cognitiveLoad, urgencyScore, energyMatch, context) {
    // Critical urgency + good energy match = do now
    if (urgencyScore >= 80 && energyMatch >= 0.6) {
        return 'do_now';
    }
    // High urgency but low energy = schedule for better time
    if (urgencyScore >= 60 && energyMatch < 0.5) {
        return 'schedule';
    }
    // Low cognitive load + short duration = quick win
    if ((cognitiveLoad === 'minimal' || cognitiveLoad === 'light') &&
        loop.description.length < 100) {
        return 'quick_win';
    }
    // Heavy/intense cognitive load = deep work
    if (cognitiveLoad === 'heavy' || cognitiveLoad === 'intense') {
        return 'deep_work';
    }
    // Tasks that could be delegated
    if (loop.owner === 'mutual' || loop.category === 'introduction') {
        return 'delegate';
    }
    // Low urgency + low energy match = defer
    if (urgencyScore < 40 && energyMatch < 0.5) {
        return 'defer';
    }
    // Similar category tasks = batch
    if (context.preferCategories && context.preferCategories.includes(loop.category)) {
        return 'batch';
    }
    // Very low urgency + old task = reconsider
    if (urgencyScore < 20 && loop.remindedCount > 2) {
        return 'reconsider';
    }
    // Default: schedule for appropriate time
    return 'schedule';
}
/**
 * Generate human-readable triage recommendation.
 */
function generateTriageRecommendation(loop, category, currentEnergy, energyMatch) {
    const owner = loop.owner === 'self' ? 'You owe' : loop.owner === 'them' ? 'They owe' : 'Mutual';
    const party = loop.otherParty || 'someone';
    switch (category) {
        case 'do_now':
            return `Priority: ${owner} ${party}. Energy match is good (${Math.round(energyMatch * 100)}%). Do this now.`;
        case 'schedule':
            return `${owner} ${party}. Current energy too low. Schedule for high-energy time.`;
        case 'quick_win':
            return `Easy task with ${party}. Good for low-energy moments or between meetings.`;
        case 'deep_work':
            return `Complex task. Reserve for focused deep work session with ${party}.`;
        case 'delegate':
            return `Consider delegating or sharing responsibility with ${party}.`;
        case 'batch':
            return `Group with similar ${loop.category} tasks for ${party}.`;
        case 'defer':
            return `Low priority. Defer until you have more energy or urgency increases.`;
        case 'reconsider':
            return `This has been pending a while. Consider if still needed with ${party}.`;
        default:
            return `Review task with ${party} and schedule appropriately.`;
    }
}
// ============================================================================
// UTILITY EXPORTS
// ============================================================================
/**
 * Get energy level description for UI display.
 */
export function getEnergyDescription(level) {
    const descriptions = {
        peak: 'Peak energy - ready for complex, strategic work',
        high: 'High energy - good for challenging tasks',
        medium: 'Moderate energy - suitable for routine work',
        low: 'Low energy - stick to simple, familiar tasks',
        recovery: 'Recovery mode - minimal tasks only',
    };
    return descriptions[level];
}
/**
 * Get cognitive load description for UI display.
 */
export function getCognitiveLoadDescription(load) {
    const descriptions = {
        minimal: 'Autopilot - can do without thinking',
        light: 'Light focus - some attention needed',
        moderate: 'Moderate focus - requires concentration',
        heavy: 'Heavy focus - demanding mental work',
        intense: 'Intense focus - maximum cognitive effort',
    };
    return descriptions[load];
}
/**
 * Suggest optimal energy level for time of day.
 */
export function suggestEnergyForTimeOfDay(hour = new Date().getHours()) {
    // Typical energy patterns (adjust based on user data if available)
    if (hour >= 9 && hour <= 11)
        return 'peak'; // Morning peak
    if (hour >= 14 && hour <= 16)
        return 'medium'; // Post-lunch dip
    if (hour >= 16 && hour <= 18)
        return 'high'; // Afternoon recovery
    if (hour >= 6 && hour <= 8)
        return 'high'; // Early morning
    if (hour >= 19 && hour <= 21)
        return 'medium'; // Evening
    return 'low'; // Late night/early morning
}
