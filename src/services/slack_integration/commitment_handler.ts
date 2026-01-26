/**
 * @file Commitment Handler for Slack
 *
 * Listens to Slack messages and extracts commitments:
 * - "I'll send you the report by Friday" → commitment_made
 * - "Can you review this by EOD?" → commitment_received
 * - "Let's meet next week" → mutual_agreement
 *
 * Uses existing open_loop_tracker for storage.
 * Uses feature_extractor for LLM-based extraction.
 */

import { EventEmitter } from 'events';
import type { SlackMessage, SlackCommand } from './index';

// Types for commitment handling
export interface CommitmentConfig {
  /** MemoRable API base URL */
  apiBaseUrl: string;
  /** API key for authenticated requests */
  apiKey?: string;
  /** Whether to process all messages or only mentions */
  processAllMessages: boolean;
  /** Minimum confidence threshold for commitment detection */
  confidenceThreshold: number;
}

export interface ExtractedCommitment {
  type: 'made' | 'received';
  what: string;
  to?: string;
  from?: string;
  byWhen: string | null;
  dueType: 'explicit' | 'implicit' | 'none';
  confidence: number;
}

export interface CommitmentResult {
  found: boolean;
  commitments: ExtractedCommitment[];
  loopIds: string[];
}

// Default config
const DEFAULT_CONFIG: CommitmentConfig = {
  apiBaseUrl: process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com',
  processAllMessages: true,
  confidenceThreshold: 0.6,
};

/**
 * Commitment Handler Service
 *
 * Wires Slack messages → Feature Extractor → Open Loop Tracker
 */
export class CommitmentHandler extends EventEmitter {
  private config: CommitmentConfig;
  private apiKey: string | null = null;

  constructor(config: Partial<CommitmentConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Authenticate with MemoRable API
   */
  async authenticate(passphrase: string = 'I remember what I have learned from you.'): Promise<boolean> {
    try {
      // Step 1: Knock for challenge
      const knockResponse = await fetch(`${this.config.apiBaseUrl}/auth/knock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: { type: 'slack_bot', name: 'Commitment Handler' }
        }),
      });

      if (!knockResponse.ok) {
        console.error('[CommitmentHandler] Knock failed:', knockResponse.status);
        return false;
      }

      const { challenge } = await knockResponse.json();
      if (!challenge) {
        console.error('[CommitmentHandler] No challenge received');
        return false;
      }

      // Step 2: Exchange passphrase for API key
      const exchangeResponse = await fetch(`${this.config.apiBaseUrl}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge,
          passphrase,
          device: { type: 'slack_bot', name: 'Commitment Handler' }
        }),
      });

      if (!exchangeResponse.ok) {
        console.error('[CommitmentHandler] Exchange failed:', exchangeResponse.status);
        return false;
      }

      const { api_key } = await exchangeResponse.json();
      if (!api_key) {
        console.error('[CommitmentHandler] No API key received');
        return false;
      }

      this.apiKey = api_key;
      console.log('[CommitmentHandler] Authenticated successfully');
      return true;
    } catch (error) {
      console.error('[CommitmentHandler] Auth error:', error);
      return false;
    }
  }

  /**
   * Process a Slack message for commitments
   */
  async processMessage(message: SlackMessage, slackUserId: string): Promise<CommitmentResult> {
    const result: CommitmentResult = {
      found: false,
      commitments: [],
      loopIds: [],
    };

    // Skip bot messages
    if (message.type !== 'message' || !message.text) {
      return result;
    }

    // Ensure authenticated
    if (!this.apiKey) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        console.error('[CommitmentHandler] Cannot process - not authenticated');
        return result;
      }
    }

    try {
      // Call feature extraction endpoint
      const extractResponse = await fetch(`${this.config.apiBaseUrl}/extract/features`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey!,
        },
        body: JSON.stringify({
          text: message.text,
          context: {
            source: 'slack',
            channel: message.channel,
            thread: message.threadTs,
            user: message.user,
          },
        }),
      });

      if (!extractResponse.ok) {
        console.error('[CommitmentHandler] Feature extraction failed:', extractResponse.status);
        return result;
      }

      const features = await extractResponse.json();

      // Check for commitments
      const commitments = features.commitments || [];
      const agreements = features.mutualAgreements || [];

      if (commitments.length === 0 && agreements.length === 0) {
        return result;
      }

      result.found = true;
      result.commitments = commitments;

      // Create open loops for each commitment
      const createLoopsResponse = await fetch(`${this.config.apiBaseUrl}/loops/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey!,
        },
        body: JSON.stringify({
          userId: slackUserId,
          memoryId: `slack:${message.channel}:${message.ts}`,
          features,
        }),
      });

      if (createLoopsResponse.ok) {
        const loopsResult = await createLoopsResponse.json();
        result.loopIds = loopsResult.loopIds || [];
      }

      // Emit event for logging/notification
      this.emit('commitment:detected', {
        message,
        commitments: result.commitments,
        loopIds: result.loopIds,
      });

      return result;
    } catch (error) {
      console.error('[CommitmentHandler] Error processing message:', error);
      return result;
    }
  }

  /**
   * Handle /done command - close a commitment
   */
  async handleDoneCommand(cmd: SlackCommand): Promise<any> {
    if (!cmd.text.trim()) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: `/done @person description` or `/done <loop_id>`',
      };
    }

    // Ensure authenticated
    if (!this.apiKey) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return {
          response_type: 'ephemeral',
          text: 'Error: Could not authenticate with MemoRable',
        };
      }
    }

    try {
      // Try to find matching loop
      const searchResponse = await fetch(
        `${this.config.apiBaseUrl}/loops?status=open&search=${encodeURIComponent(cmd.text)}`,
        {
          headers: { 'X-API-Key': this.apiKey! },
        }
      );

      if (!searchResponse.ok) {
        return {
          response_type: 'ephemeral',
          text: 'Error searching for commitment',
        };
      }

      const { loops } = await searchResponse.json();

      if (!loops || loops.length === 0) {
        return {
          response_type: 'ephemeral',
          text: `No open commitment found matching "${cmd.text}"`,
        };
      }

      // Close the first matching loop
      const loopToClose = loops[0];
      const closeResponse = await fetch(
        `${this.config.apiBaseUrl}/loops/${loopToClose.id}/close`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey!,
          },
          body: JSON.stringify({
            note: `Closed via Slack /done by ${cmd.userId}`,
          }),
        }
      );

      if (!closeResponse.ok) {
        return {
          response_type: 'ephemeral',
          text: 'Error closing commitment',
        };
      }

      this.emit('commitment:closed', {
        loopId: loopToClose.id,
        userId: cmd.userId,
        channelId: cmd.channelId,
      });

      return {
        response_type: 'in_channel',
        text: `✅ Done: "${loopToClose.description}"`,
      };
    } catch (error) {
      console.error('[CommitmentHandler] Error in /done:', error);
      return {
        response_type: 'ephemeral',
        text: 'Error processing /done command',
      };
    }
  }

  /**
   * Handle /loops command - list open commitments
   */
  async handleLoopsCommand(cmd: SlackCommand): Promise<any> {
    // Ensure authenticated
    if (!this.apiKey) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return {
          response_type: 'ephemeral',
          text: 'Error: Could not authenticate with MemoRable',
        };
      }
    }

    try {
      // Parse optional person filter
      const personMatch = cmd.text.match(/@(\w+)/);
      const person = personMatch ? personMatch[1] : undefined;

      const url = person
        ? `${this.config.apiBaseUrl}/loops?status=open&person=${encodeURIComponent(person)}`
        : `${this.config.apiBaseUrl}/loops?status=open&limit=10`;

      const response = await fetch(url, {
        headers: { 'X-API-Key': this.apiKey! },
      });

      if (!response.ok) {
        return {
          response_type: 'ephemeral',
          text: 'Error fetching commitments',
        };
      }

      const { loops, count } = await response.json();

      if (!loops || loops.length === 0) {
        return {
          response_type: 'ephemeral',
          text: person
            ? `No open commitments with @${person}`
            : 'No open commitments! 🎉',
        };
      }

      // Build response blocks
      const blocks: any[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: person
              ? `*Open commitments with @${person}* (${count})`
              : `*Your open commitments* (${count})`,
          },
        },
        { type: 'divider' },
      ];

      // Group by owner
      const youOwe = loops.filter((l: any) => l.owner === 'self');
      const owedToYou = loops.filter((l: any) => l.owner === 'them');

      if (youOwe.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*You owe:*\n' + youOwe.map((l: any) => {
              const due = l.dueDate ? ` (due ${new Date(l.dueDate).toLocaleDateString()})` : '';
              const party = l.otherParty ? ` → ${l.otherParty}` : '';
              return `• ${l.description}${party}${due}`;
            }).join('\n'),
          },
        });
      }

      if (owedToYou.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Owed to you:*\n' + owedToYou.map((l: any) => {
              const due = l.dueDate ? ` (due ${new Date(l.dueDate).toLocaleDateString()})` : '';
              const party = l.otherParty ? ` ← ${l.otherParty}` : '';
              return `• ${l.description}${party}${due}`;
            }).join('\n'),
          },
        });
      }

      return {
        response_type: 'ephemeral',
        blocks,
      };
    } catch (error) {
      console.error('[CommitmentHandler] Error in /loops:', error);
      return {
        response_type: 'ephemeral',
        text: 'Error fetching commitments',
      };
    }
  }

  /**
   * Set API key directly (for cases where auth is handled externally)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.apiKey;
  }
}

// Export factory function
export function createCommitmentHandler(config?: Partial<CommitmentConfig>): CommitmentHandler {
  return new CommitmentHandler(config);
}

export default CommitmentHandler;
