/**
 * @file Pre-Conversation Briefing Generator
 * Assembles everything you need to know before talking to someone.
 *
 * The dance card - what you need to know:
 * - What you owe them
 * - What they owe you
 * - What's coming up in their life
 * - Recent emotional context
 * - High-salience history
 * - Suggested topics
 * - Sensitivities to avoid
 *
 * "Now you know to ask about the recital, acknowledge you're sending the paper,
 * be sensitive given recent context, and not ask 'how's your mom?'"
 */
import type { ConversationBriefing } from './models';
/**
 * Options for briefing generation.
 */
export interface BriefingOptions {
    /** Days ahead to look for upcoming events */
    upcomingEventsDays?: number;
    /** Days back to look for recent events */
    recentEventsDays?: number;
    /** Minimum salience for key memories */
    minSalience?: number;
    /** Maximum memories to include */
    maxMemories?: number;
    /** Include suggested topics */
    includeSuggestions?: boolean;
}
/**
 * Generate a complete pre-conversation briefing for a contact.
 */
export declare function generateBriefing(userId: string, contactId: string, options?: BriefingOptions): Promise<ConversationBriefing>;
/**
 * Format briefing as a readable string.
 */
export declare function formatBriefing(briefing: ConversationBriefing): string;
/**
 * Generate a quick briefing (less data, faster).
 */
export declare function generateQuickBriefing(userId: string, contactId: string): Promise<{
    name: string;
    youOwe: string[];
    theyOwe: string[];
    upcoming: string[];
    sensitive: boolean;
}>;
/**
 * Search for a contact by name and generate briefing.
 */
export declare function generateBriefingByName(userId: string, contactName: string, options?: BriefingOptions): Promise<ConversationBriefing | null>;
