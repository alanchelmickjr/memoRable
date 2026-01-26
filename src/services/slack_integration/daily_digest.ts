/**
 * @file Daily Digest for Slack
 *
 * Builds and sends daily commitment summaries via Slack DM:
 * - What you owe others (due today, overdue)
 * - What others owe you
 * - Upcoming deadlines
 *
 * Designed for toy design teams tracking 3D design commitments.
 */

import type { SlackMessage } from './index';

// Types for digest building
export interface DigestConfig {
  /** MemoRable API base URL */
  apiBaseUrl: string;
  /** API key for authenticated requests */
  apiKey: string;
  /** Slack bot token for sending DMs */
  slackBotToken: string;
  /** Hour to send digest (0-23, default 8am) */
  digestHour: number;
  /** Timezone for user (default 'America/Los_Angeles') */
  timezone: string;
}

export interface LoopSummary {
  id: string;
  description: string;
  otherParty?: string;
  dueDate?: string;
  source?: string;
  isOverdue: boolean;
  daysUntilDue?: number;
}

export interface DigestData {
  youOwe: LoopSummary[];
  owedToYou: LoopSummary[];
  overdue: LoopSummary[];
  dueToday: LoopSummary[];
  dueSoon: LoopSummary[]; // Next 3 days
  totalOpen: number;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
    emoji?: boolean;
  }>;
}

// Default config
const DEFAULT_CONFIG: Partial<DigestConfig> = {
  apiBaseUrl: process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com',
  digestHour: parseInt(process.env.DIGEST_HOUR || '8', 10),
  timezone: process.env.DIGEST_TIMEZONE || 'America/Los_Angeles',
};

/**
 * Daily Digest Builder
 *
 * Fetches open loops and builds Slack Block Kit message
 */
export class DailyDigestBuilder {
  private config: DigestConfig;

  constructor(config: Partial<DigestConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as DigestConfig;
  }

  /**
   * Fetch open loops for a user
   */
  async fetchLoops(userId: string): Promise<DigestData> {
    const result: DigestData = {
      youOwe: [],
      owedToYou: [],
      overdue: [],
      dueToday: [],
      dueSoon: [],
      totalOpen: 0,
    };

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/loops?status=open&limit=50`,
        {
          headers: {
            'X-API-Key': this.config.apiKey,
          },
        }
      );

      if (!response.ok) {
        console.error('[DailyDigest] Failed to fetch loops:', response.status);
        return result;
      }

      const { loops } = await response.json();
      if (!loops || !Array.isArray(loops)) {
        return result;
      }

      const now = new Date();
      const today = now.toDateString();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      for (const loop of loops) {
        const summary: LoopSummary = {
          id: loop._id || loop.id,
          description: loop.description || loop.content || '(no description)',
          otherParty: loop.otherParty,
          dueDate: loop.dueDate,
          source: loop.source,
          isOverdue: false,
        };

        // Check due date status
        if (loop.dueDate) {
          const dueDate = new Date(loop.dueDate);
          summary.daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

          if (dueDate < now) {
            summary.isOverdue = true;
            result.overdue.push(summary);
          } else if (dueDate.toDateString() === today) {
            result.dueToday.push(summary);
          } else if (dueDate <= threeDaysFromNow) {
            result.dueSoon.push(summary);
          }
        }

        // Categorize by ownership
        if (loop.owner === 'self') {
          result.youOwe.push(summary);
        } else if (loop.owner === 'them') {
          result.owedToYou.push(summary);
        }
        // 'mutual' goes to both conceptually, but we'll show separately
      }

      result.totalOpen = loops.length;
      return result;
    } catch (error) {
      console.error('[DailyDigest] Error fetching loops:', error);
      return result;
    }
  }

  /**
   * Build Slack Block Kit message from digest data
   */
  buildBlocks(data: DigestData, userName?: string): SlackBlock[] {
    const blocks: SlackBlock[] = [];

    // Header
    const greeting = this.getTimeGreeting();
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${greeting} Daily Digest`,
        emoji: true,
      },
    });

    // Summary line
    if (data.totalOpen === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':sparkles: *All clear!* No open commitments. Great job!',
        },
      });
      return blocks;
    }

    // Overdue section (urgent!)
    if (data.overdue.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *OVERDUE* (${data.overdue.length})`,
        },
      });

      for (const loop of data.overdue.slice(0, 5)) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        const days = loop.daysUntilDue ? ` (${Math.abs(loop.daysUntilDue)} days overdue)` : '';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:red_circle: ${loop.description}${party}${days}`,
          },
        });
      }
    }

    // Due today section
    if (data.dueToday.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:calendar: *DUE TODAY* (${data.dueToday.length})`,
        },
      });

      for (const loop of data.dueToday.slice(0, 5)) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:large_yellow_circle: ${loop.description}${party}`,
          },
        });
      }
    }

    // You owe section
    if (data.youOwe.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:outbox_tray: *You Owe* (${data.youOwe.length})`,
        },
      });

      // Show non-overdue, non-today items
      const remaining = data.youOwe.filter(
        (l) => !l.isOverdue && !data.dueToday.find((d) => d.id === l.id)
      );
      for (const loop of remaining.slice(0, 5)) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        const due = loop.dueDate ? ` (due ${new Date(loop.dueDate).toLocaleDateString()})` : '';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• ${loop.description}${party}${due}`,
          },
        });
      }
      if (remaining.length > 5) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_...and ${remaining.length - 5} more_`,
            },
          ],
        });
      }
    }

    // Owed to you section
    if (data.owedToYou.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:inbox_tray: *Owed to You* (${data.owedToYou.length})`,
        },
      });

      for (const loop of data.owedToYou.slice(0, 5)) {
        const party = loop.otherParty ? ` ← ${loop.otherParty}` : '';
        const due = loop.dueDate ? ` (due ${new Date(loop.dueDate).toLocaleDateString()})` : '';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• ${loop.description}${party}${due}`,
          },
        });
      }
      if (data.owedToYou.length > 5) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_...and ${data.owedToYou.length - 5} more_`,
            },
          ],
        });
      }
    }

    // Footer with tip
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':bulb: Use `/done @person description` to mark items complete | `/loops` to see all',
        },
      ],
    });

    return blocks;
  }

  /**
   * Get time-appropriate greeting
   */
  private getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return ':sunrise: Good morning!';
    if (hour < 17) return ':sun_with_face: Good afternoon!';
    return ':city_sunset: Good evening!';
  }

  /**
   * Send digest DM to a Slack user
   */
  async sendDigest(slackUserId: string, memorableUserId: string): Promise<boolean> {
    if (!this.config.slackBotToken) {
      console.error('[DailyDigest] No Slack bot token configured');
      return false;
    }

    try {
      // Fetch loops
      const data = await this.fetchLoops(memorableUserId);

      // Skip if no commitments
      if (data.totalOpen === 0) {
        console.log(`[DailyDigest] No commitments for ${memorableUserId}, skipping DM`);
        return true;
      }

      // Build message blocks
      const blocks = this.buildBlocks(data);

      // Send DM via Slack API
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.slackBotToken}`,
        },
        body: JSON.stringify({
          channel: slackUserId, // DM by user ID
          text: `Daily Digest: ${data.overdue.length} overdue, ${data.dueToday.length} due today`,
          blocks,
        }),
      });

      if (!response.ok) {
        console.error('[DailyDigest] Slack API error:', response.status);
        return false;
      }

      const result = await response.json();
      if (!result.ok) {
        console.error('[DailyDigest] Slack error:', result.error);
        return false;
      }

      console.log(`[DailyDigest] Sent digest to ${slackUserId}`);
      return true;
    } catch (error) {
      console.error('[DailyDigest] Error sending digest:', error);
      return false;
    }
  }

  /**
   * Build plain text summary (for non-Slack use)
   */
  buildPlainText(data: DigestData): string {
    const lines: string[] = [];

    lines.push('📋 DAILY COMMITMENT DIGEST');
    lines.push('');

    if (data.totalOpen === 0) {
      lines.push('✨ All clear! No open commitments.');
      return lines.join('\n');
    }

    if (data.overdue.length > 0) {
      lines.push(`⚠️  OVERDUE (${data.overdue.length}):`);
      for (const loop of data.overdue) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        lines.push(`   🔴 ${loop.description}${party}`);
      }
      lines.push('');
    }

    if (data.dueToday.length > 0) {
      lines.push(`📅 DUE TODAY (${data.dueToday.length}):`);
      for (const loop of data.dueToday) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        lines.push(`   🟡 ${loop.description}${party}`);
      }
      lines.push('');
    }

    if (data.youOwe.length > 0) {
      lines.push(`📤 YOU OWE (${data.youOwe.length}):`);
      for (const loop of data.youOwe.slice(0, 10)) {
        const party = loop.otherParty ? ` → ${loop.otherParty}` : '';
        const due = loop.dueDate ? ` (${new Date(loop.dueDate).toLocaleDateString()})` : '';
        lines.push(`   • ${loop.description}${party}${due}`);
      }
      lines.push('');
    }

    if (data.owedToYou.length > 0) {
      lines.push(`📥 OWED TO YOU (${data.owedToYou.length}):`);
      for (const loop of data.owedToYou.slice(0, 10)) {
        const party = loop.otherParty ? ` ← ${loop.otherParty}` : '';
        const due = loop.dueDate ? ` (${new Date(loop.dueDate).toLocaleDateString()})` : '';
        lines.push(`   • ${loop.description}${party}${due}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Factory function
 */
export function createDailyDigestBuilder(config: Partial<DigestConfig>): DailyDigestBuilder {
  return new DailyDigestBuilder(config);
}

export default DailyDigestBuilder;
