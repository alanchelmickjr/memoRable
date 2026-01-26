/**
 * @file Cron Scheduler for Slack Daily Digest
 *
 * Runs scheduled tasks:
 * - Daily digest at configured hour (default 8am)
 * - Uses simple interval checking (no external cron deps)
 *
 * Small, elegant, no magic.
 */

import { createDailyDigestBuilder, type DigestConfig } from './daily_digest';

// Types
export interface CronConfig {
  /** MemoRable API base URL */
  apiBaseUrl: string;
  /** API key for MemoRable */
  apiKey: string;
  /** Slack bot token */
  slackBotToken: string;
  /** Hour to send digest (0-23) */
  digestHour: number;
  /** Timezone (IANA format) */
  timezone: string;
  /** Check interval in ms (default: 60000 = 1 min) */
  checkIntervalMs: number;
}

export interface UserMapping {
  slackUserId: string;
  memorableUserId: string;
  digestEnabled: boolean;
}

// Constants from env
const DEFAULT_CONFIG: Partial<CronConfig> = {
  apiBaseUrl: process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com',
  digestHour: parseInt(process.env.DIGEST_HOUR || '8', 10),
  timezone: process.env.DIGEST_TIMEZONE || 'America/Los_Angeles',
  checkIntervalMs: parseInt(process.env.CRON_CHECK_INTERVAL_MS || '60000', 10),
};

/**
 * Simple Cron Scheduler
 *
 * No dependencies, just setInterval + hour check
 */
export class DigestCron {
  private config: CronConfig;
  private digestBuilder: ReturnType<typeof createDailyDigestBuilder>;
  private intervalId: NodeJS.Timeout | null = null;
  private lastRunDate: string | null = null;
  private users: Map<string, UserMapping> = new Map();

  constructor(config: Partial<CronConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as CronConfig;

    this.digestBuilder = createDailyDigestBuilder({
      apiBaseUrl: this.config.apiBaseUrl,
      apiKey: this.config.apiKey,
      slackBotToken: this.config.slackBotToken,
      digestHour: this.config.digestHour,
      timezone: this.config.timezone,
    });
  }

  /**
   * Register a user for daily digest
   */
  registerUser(mapping: UserMapping): void {
    this.users.set(mapping.slackUserId, mapping);
    console.log(`[DigestCron] Registered user ${mapping.slackUserId} -> ${mapping.memorableUserId}`);
  }

  /**
   * Unregister a user
   */
  unregisterUser(slackUserId: string): void {
    this.users.delete(slackUserId);
    console.log(`[DigestCron] Unregistered user ${slackUserId}`);
  }

  /**
   * Load users from MemoRable API (or other source)
   */
  async loadUsersFromApi(): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/users?digest_enabled=true`,
        {
          headers: {
            'X-API-Key': this.config.apiKey,
          },
        }
      );

      if (!response.ok) {
        console.warn('[DigestCron] Could not load users from API:', response.status);
        return;
      }

      const { users } = await response.json();
      if (users && Array.isArray(users)) {
        for (const user of users) {
          if (user.slackUserId && user.memorableUserId) {
            this.registerUser({
              slackUserId: user.slackUserId,
              memorableUserId: user.memorableUserId,
              digestEnabled: user.digestEnabled !== false,
            });
          }
        }
        console.log(`[DigestCron] Loaded ${users.length} users from API`);
      }
    } catch (error) {
      console.warn('[DigestCron] Error loading users:', error);
    }
  }

  /**
   * Check if it's time to run the digest
   */
  private shouldRunDigest(): boolean {
    const now = new Date();

    // Get current hour in configured timezone
    const hour = parseInt(
      now.toLocaleString('en-US', {
        timeZone: this.config.timezone,
        hour: 'numeric',
        hour12: false,
      }),
      10
    );

    // Get today's date string for dedup
    const todayStr = now.toLocaleString('en-US', {
      timeZone: this.config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // Run if: correct hour AND haven't run today
    if (hour === this.config.digestHour && this.lastRunDate !== todayStr) {
      this.lastRunDate = todayStr;
      return true;
    }

    return false;
  }

  /**
   * Run digest for all registered users
   */
  async runDigestForAll(): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };

    console.log(`[DigestCron] Running digest for ${this.users.size} users`);

    for (const [slackUserId, mapping] of this.users) {
      if (!mapping.digestEnabled) {
        continue;
      }

      try {
        const success = await this.digestBuilder.sendDigest(
          slackUserId,
          mapping.memorableUserId
        );

        if (success) {
          results.sent++;
        } else {
          results.failed++;
        }

        // Small delay between sends to avoid rate limits
        await this.sleep(500);
      } catch (error) {
        console.error(`[DigestCron] Error sending to ${slackUserId}:`, error);
        results.failed++;
      }
    }

    console.log(`[DigestCron] Digest complete: ${results.sent} sent, ${results.failed} failed`);
    return results;
  }

  /**
   * Main check loop
   */
  private async check(): Promise<void> {
    if (this.shouldRunDigest()) {
      await this.runDigestForAll();
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[DigestCron] Already running');
      return;
    }

    console.log(
      `[DigestCron] Starting scheduler: digest at ${this.config.digestHour}:00 ${this.config.timezone}`
    );

    // Run check immediately
    this.check();

    // Then run on interval
    this.intervalId = setInterval(
      () => this.check(),
      this.config.checkIntervalMs
    );
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[DigestCron] Scheduler stopped');
    }
  }

  /**
   * Manual trigger (for testing)
   */
  async triggerNow(): Promise<{ sent: number; failed: number }> {
    console.log('[DigestCron] Manual trigger');
    return this.runDigestForAll();
  }

  /**
   * Get status
   */
  getStatus(): {
    running: boolean;
    userCount: number;
    lastRun: string | null;
    nextRunHour: number;
    timezone: string;
  } {
    return {
      running: this.intervalId !== null,
      userCount: this.users.size,
      lastRun: this.lastRunDate,
      nextRunHour: this.config.digestHour,
      timezone: this.config.timezone,
    };
  }

  /**
   * Helper: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function
 */
export function createDigestCron(config: Partial<CronConfig>): DigestCron {
  return new DigestCron(config);
}

/**
 * Quick start helper - creates and starts cron with env config
 */
export async function startDigestCron(): Promise<DigestCron> {
  const cron = createDigestCron({
    apiKey: process.env.MEMORABLE_API_KEY,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
  });

  // Try to load users from API
  await cron.loadUsersFromApi();

  // Start scheduler
  cron.start();

  return cron;
}

export default DigestCron;
