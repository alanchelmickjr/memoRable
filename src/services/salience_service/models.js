/**
 * @file Defines the core data structures and types for the Memory Salience System.
 * Based on the Human-Like Memory Salience System specification v2.0
 *
 * Key principles:
 * - Calculate salience at capture time, not overnight
 * - Adaptive weight learning based on what user actually retrieves/acts on
 * - Context-dependent weight shifting (work vs social vs networking)
 * - Track commitments, open loops, and other people's timelines
 */
/**
 * Default weights based on psychological research.
 */
export const DEFAULT_SALIENCE_WEIGHTS = {
    emotional: 0.30,
    novelty: 0.20,
    relevance: 0.20,
    social: 0.15,
    consequential: 0.15,
};
export const CONTEXT_WEIGHT_MODIFIERS = {
    work_meeting: {
        consequential: 1.3, // Boost action items
        social: 0.7, // Reduce social weight
        emotional: 0.8,
    },
    social_event: {
        social: 1.4, // Boost relationship signals
        emotional: 1.2, // Feelings matter more
        consequential: 0.6, // Tasks matter less
    },
    one_on_one: {
        relevance: 1.3, // Personal connection matters
        social: 1.2,
        emotional: 1.1,
    },
    networking: {
        novelty: 1.4, // New people priority
        consequential: 1.2, // Follow-up potential
        social: 1.1,
    },
    family: {
        emotional: 1.4,
        social: 1.3,
        relevance: 1.2,
        consequential: 0.7,
    },
    default: {},
};
