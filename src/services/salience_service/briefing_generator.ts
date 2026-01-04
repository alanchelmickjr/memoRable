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

import type {
  ConversationBriefing,
  BriefingMemory,
  PersonTimelineEvent,
  OpenLoop,
  RelationshipPattern,
  RelationshipSnapshot,
  EngagementTrend,
} from './models';
import { collections, getOrCreateContact, type ContactDocument } from './database';
import { getOpenLoops } from './open_loop_tracker';
import {
  getUpcomingEventsForContact,
  getRecentEventsForContact,
  getSensitiveContext,
} from './timeline_tracker';
import {
  getRelationshipPattern,
  getLatestSnapshot,
} from './relationship_tracker';

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

const DEFAULT_OPTIONS: BriefingOptions = {
  upcomingEventsDays: 14,
  recentEventsDays: 30,
  minSalience: 60,
  maxMemories: 5,
  includeSuggestions: true,
};

/**
 * Generate a complete pre-conversation briefing for a contact.
 */
export async function generateBriefing(
  userId: string,
  contactId: string,
  options: BriefingOptions = {}
): Promise<ConversationBriefing> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get contact info
  const contact = await collections.contacts?.().findOne({ _id: contactId }) as ContactDocument | null;
  const contactName = contact?.name || 'Unknown';

  // Fetch all data in parallel (consolidated open loops query: 1 DB call instead of 3)
  const [
    pattern,
    snapshot,
    allOpenLoops,
    upcomingEvents,
    recentEvents,
    sensitiveContext,
  ] = await Promise.all([
    getRelationshipPattern(userId, contactId),
    getLatestSnapshot(userId, contactId),
    getOpenLoops(userId, { contactId, status: 'open' }), // Single query for all owners
    getUpcomingEventsForContact(userId, contactId, opts.upcomingEventsDays),
    getRecentEventsForContact(userId, contactId, opts.recentEventsDays),
    getSensitiveContext(userId, contactId),
  ]);

  // Client-side filtering by owner (replaces 3 DB queries with 1 + filtering)
  const openLoopsYouOwe = allOpenLoops.filter(l => l.owner === 'self');
  const openLoopsTheyOwe = allOpenLoops.filter(l => l.owner === 'them');
  const openLoopsMutual = allOpenLoops.filter(l => l.owner === 'mutual');

  // Get high-salience memories with this person
  // Note: This would query the memories collection with salience filter
  const keyMemories = await getHighSalienceMemories(
    userId,
    contactId,
    opts.minSalience!,
    opts.maxMemories!
  );

  // Get recent memories (for context)
  const recentMemories = await getRecentMemories(userId, contactId, 3);

  // Calculate recent sentiment from memories
  const recentSentiment = calculateRecentSentiment(recentMemories);

  // Build relationship info
  const relationship = buildRelationshipInfo(contact, pattern);

  // Generate suggestions
  const suggestions = opts.includeSuggestions
    ? generateSuggestions(
        openLoopsYouOwe,
        upcomingEvents,
        sensitiveContext,
        recentEvents
      )
    : { topics: [], sensitivities: [] };

  return {
    contactId,
    contactName,
    relationship,
    theirTimeline: upcomingEvents,
    openLoops: {
      youOweThem: openLoopsYouOwe,
      theyOweYou: openLoopsTheyOwe,
      mutual: openLoopsMutual,
    },
    recentMemories,
    highSalienceMemories: keyMemories,
    recentSentiment,
    suggestedTopics: suggestions.topics,
    sensitivities: suggestions.sensitivities,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build relationship info from pattern and contact.
 */
function buildRelationshipInfo(
  contact: ContactDocument | null,
  pattern: RelationshipPattern | null
): ConversationBriefing['relationship'] {
  return {
    howMet: contact?.howMet,
    firstInteraction: pattern?.firstInteraction || contact?.firstSeenAt,
    lastInteraction: pattern?.lastInteraction,
    daysSinceLastInteraction: pattern?.daysSinceLastInteraction,
    totalInteractions: pattern?.totalInteractions || 0,
    trend: pattern?.interactionTrend || 'stable',
  };
}

/**
 * Get high-salience memories involving a contact.
 */
async function getHighSalienceMemories(
  userId: string,
  contactId: string,
  minSalience: number,
  limit: number
): Promise<BriefingMemory[]> {
  // This would query the memories collection
  // For now, return empty - this connects to the main memory storage
  try {
    // Assuming memories collection has salience data
    const memoriesCollection = collections.memories();

    const memories = await memoriesCollection
      .find({
        userId,
        'extractedFeatures.peopleMentioned': { $regex: new RegExp(contactId, 'i') },
        salienceScore: { $gte: minSalience },
      })
      .sort({ salienceScore: -1, createdAt: -1 })
      .limit(limit)
      .toArray();

    return memories.map((m: any) => ({
      memoryId: m._id?.toString() || m.mementoId,
      text: typeof m.content === 'string' ? m.content : m.text || JSON.stringify(m.content),
      salienceScore: m.salienceScore || 50,
      createdAt: m.createdAt || m.eventTimestamp,
      topics: m.extractedFeatures?.topics || [],
    }));
  } catch (error) {
    console.error('[BriefingGenerator] Error fetching high-salience memories:', error);
    return [];
  }
}

/**
 * Get recent memories with a contact.
 */
async function getRecentMemories(
  userId: string,
  contactId: string,
  limit: number
): Promise<BriefingMemory[]> {
  try {
    const memoriesCollection = collections.memories();

    const memories = await memoriesCollection
      .find({
        userId,
        'extractedFeatures.peopleMentioned': { $regex: new RegExp(contactId, 'i') },
      } as any)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return memories.map((m: any) => ({
      memoryId: m._id?.toString() || m.mementoId,
      text: typeof m.content === 'string' ? m.content : m.text || JSON.stringify(m.content),
      salienceScore: m.salienceScore || 50,
      createdAt: m.createdAt || m.eventTimestamp,
      topics: m.extractedFeatures?.topics || [],
    }));
  } catch (error) {
    console.error('[BriefingGenerator] Error fetching recent memories:', error);
    return [];
  }
}

/**
 * Calculate average sentiment from recent memories.
 */
function calculateRecentSentiment(memories: BriefingMemory[]): number | undefined {
  // Would need sentiment data in memories
  // For now, return undefined
  return undefined;
}

/**
 * Generate conversation suggestions based on available data.
 */
function generateSuggestions(
  loopsYouOwe: OpenLoop[],
  upcomingEvents: PersonTimelineEvent[],
  sensitiveContext: PersonTimelineEvent[],
  recentEvents: PersonTimelineEvent[]
): { topics: string[]; sensitivities: string[] } {
  const topics: string[] = [];
  const sensitivities: string[] = [];

  // Add topics from things you owe
  for (const loop of loopsYouOwe) {
    if (loop.status === 'open') {
      const urgency = getDueDateUrgency(loop);
      if (urgency === 'overdue') {
        topics.unshift(`Apologize for delay on: ${loop.description}`);
      } else if (urgency === 'due_soon') {
        topics.push(`Mention progress on: ${loop.description}`);
      } else {
        topics.push(`Remember to complete: ${loop.description}`);
      }
    }
  }

  // Add topics from upcoming events
  for (const event of upcomingEvents) {
    if (event.goodToMention) {
      const daysUntil = getDaysUntil(event.eventDate);
      if (daysUntil !== null && daysUntil <= 7) {
        topics.push(`Ask about: ${event.description} (${getDaysDescription(daysUntil)})`);
      }
    }
  }

  // Add topics from recent positive events
  for (const event of recentEvents) {
    if (event.sensitivity === 'positive' && event.goodToMention) {
      const daysSince = getDaysSince(event.eventDate);
      if (daysSince !== null && daysSince <= 14) {
        topics.push(`Congratulate/ask about: ${event.description}`);
      }
    }
  }

  // Add sensitivities from sensitive context
  for (const event of sensitiveContext) {
    sensitivities.push(`Be sensitive about: ${event.description}`);
  }

  // Add implicit sensitivities
  const deathEvents = [...sensitiveContext, ...recentEvents].filter(
    (e) => e.description.toLowerCase().includes('death') ||
           e.description.toLowerCase().includes('passed') ||
           e.description.toLowerCase().includes('funeral')
  );

  if (deathEvents.length > 0) {
    sensitivities.push('Recent loss - be careful about family topics');
  }

  return {
    topics: topics.slice(0, 5), // Limit to 5 suggestions
    sensitivities: [...new Set(sensitivities)], // Deduplicate
  };
}

/**
 * Get urgency of a loop based on due date.
 */
function getDueDateUrgency(loop: OpenLoop): 'overdue' | 'due_soon' | 'upcoming' | 'none' {
  const dueDate = loop.dueDate || loop.softDeadline;
  if (!dueDate) return 'none';

  const due = new Date(dueDate);
  const now = new Date();
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 3) return 'due_soon';
  return 'upcoming';
}

/**
 * Get days until a date.
 */
function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get days since a date.
 */
function getDaysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get human-readable days description.
 */
function getDaysDescription(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days === 7) return 'next week';
  return `in ${Math.ceil(days / 7)} weeks`;
}

/**
 * Format briefing as a readable string.
 */
export function formatBriefing(briefing: ConversationBriefing): string {
  const lines: string[] = [];

  // Header
  lines.push(`═══ BRIEFING: ${briefing.contactName} ═══`);
  lines.push('');

  // Relationship status
  lines.push('📊 RELATIONSHIP:');
  if (briefing.relationship.howMet) {
    lines.push(`   Met: ${briefing.relationship.howMet}`);
  }
  if (briefing.relationship.lastInteraction) {
    lines.push(`   Last spoke: ${formatDate(briefing.relationship.lastInteraction)} (${briefing.relationship.daysSinceLastInteraction || 0} days ago)`);
  }
  lines.push(`   Total interactions: ${briefing.relationship.totalInteractions}`);
  lines.push(`   Trend: ${formatTrend(briefing.relationship.trend)}`);
  lines.push('');

  // Their timeline
  if (briefing.theirTimeline.length > 0) {
    lines.push('📅 THEIR UPCOMING EVENTS:');
    for (const event of briefing.theirTimeline.slice(0, 5)) {
      const icon = event.sensitivity === 'sensitive' ? '⚫' :
                   event.sensitivity === 'positive' ? '🟢' : '🔵';
      lines.push(`   ${icon} ${event.description} - ${formatDate(event.eventDate)}`);
    }
    lines.push('');
  }

  // Open loops
  const hasLoops = briefing.openLoops.youOweThem.length > 0 ||
                   briefing.openLoops.theyOweYou.length > 0 ||
                   briefing.openLoops.mutual.length > 0;

  if (hasLoops) {
    lines.push('🔄 OPEN LOOPS:');

    if (briefing.openLoops.youOweThem.length > 0) {
      lines.push('   You owe them:');
      for (const loop of briefing.openLoops.youOweThem.slice(0, 3)) {
        const due = loop.dueDate ? ` (due: ${formatDate(loop.dueDate)})` : '';
        lines.push(`   • ${loop.description}${due}`);
      }
    }

    if (briefing.openLoops.theyOweYou.length > 0) {
      lines.push('   They owe you:');
      for (const loop of briefing.openLoops.theyOweYou.slice(0, 3)) {
        lines.push(`   • ${loop.description}`);
      }
    }

    if (briefing.openLoops.mutual.length > 0) {
      lines.push('   Mutual:');
      for (const loop of briefing.openLoops.mutual.slice(0, 3)) {
        lines.push(`   • ${loop.description}`);
      }
    }
    lines.push('');
  }

  // Recent context
  if (briefing.recentMemories.length > 0) {
    lines.push('💭 RECENT CONTEXT:');
    for (const memory of briefing.recentMemories) {
      const text = memory.text.length > 80
        ? memory.text.slice(0, 77) + '...'
        : memory.text;
      lines.push(`   • ${text}`);
    }
    lines.push('');
  }

  // Suggestions
  if (briefing.suggestedTopics.length > 0) {
    lines.push('💡 SUGGESTED TOPICS:');
    for (const topic of briefing.suggestedTopics) {
      lines.push(`   • ${topic}`);
    }
    lines.push('');
  }

  // Sensitivities
  if (briefing.sensitivities.length > 0) {
    lines.push('⚠️ SENSITIVITIES:');
    for (const sensitivity of briefing.sensitivities) {
      lines.push(`   • ${sensitivity}`);
    }
    lines.push('');
  }

  lines.push(`Generated: ${formatDate(briefing.generatedAt)}`);
  lines.push('════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format date for display.
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';

  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return date.toLocaleDateString('en-US', { weekday: 'long' });

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format engagement trend for display.
 */
function formatTrend(trend: EngagementTrend): string {
  switch (trend) {
    case 'increasing': return '📈 Increasing';
    case 'stable': return '➡️ Stable';
    case 'decreasing': return '📉 Decreasing';
    case 'dormant': return '💤 Dormant';
  }
}

/**
 * Generate a quick briefing (less data, faster).
 */
export async function generateQuickBriefing(
  userId: string,
  contactId: string
): Promise<{
  name: string;
  youOwe: string[];
  theyOwe: string[];
  upcoming: string[];
  sensitive: boolean;
}> {
  const contact = await collections.contacts?.().findOne({ _id: contactId }) as ContactDocument | null;

  // Consolidated: 1 query for all loops instead of 2
  const [allLoops, upcoming, sensitive] = await Promise.all([
    getOpenLoops(userId, { contactId, status: 'open' }),
    getUpcomingEventsForContact(userId, contactId, 7),
    getSensitiveContext(userId, contactId),
  ]);

  // Client-side filtering
  const loopsYouOwe = allLoops.filter(l => l.owner === 'self');
  const loopsTheyOwe = allLoops.filter(l => l.owner === 'them');

  return {
    name: contact?.name || 'Unknown',
    youOwe: loopsYouOwe.slice(0, 3).map((l) => l.description),
    theyOwe: loopsTheyOwe.slice(0, 3).map((l) => l.description),
    upcoming: upcoming.slice(0, 3).map((e) => e.description),
    sensitive: sensitive.length > 0,
  };
}

/**
 * Search for a contact by name and generate briefing.
 */
export async function generateBriefingByName(
  userId: string,
  contactName: string,
  options?: BriefingOptions
): Promise<ConversationBriefing | null> {
  const contact = await getOrCreateContact(userId, contactName);

  if (!contact._id) {
    return null;
  }

  return generateBriefing(userId, contact._id, options);
}
