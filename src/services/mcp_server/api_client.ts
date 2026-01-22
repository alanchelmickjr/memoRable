/**
 * API Client for MemoRable - REST Mode
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  🔒 HTTPS REQUIRED IN PRODUCTION                                 ║
 * ║                                                                   ║
 * ║  All API communication MUST use TLS encryption in production.    ║
 * ║  HTTP allowed only when ALLOW_HTTP_DEV=true or NODE_ENV=dev.     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Two modes of operation:
 * - DIRECT MODE (default): MCP connects directly to MongoDB (TLS required)
 * - REST MODE (API_BASE_URL set): MCP calls HTTPS API (or HTTP in dev)
 *
 * REST mode requires:
 * - Domain with ACM certificate on ALB (production)
 * - API_BASE_URL starting with https:// (or http:// with ALLOW_HTTP_DEV=true)
 * - See docs/REST_MODE_SECURITY.md for setup
 */

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  passphrase?: string;
  deviceType?: string;
  deviceName?: string;
}

export interface Memory {
  id: string;
  content: string;
  userId: string;
  entities?: string[];
  salience?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface RecallResult {
  memories: Memory[];
  total: number;
}

export interface BriefingResult {
  person: string;
  summary: string;
  openLoops: unknown[];
  upcomingEvents: unknown[];
  sensitivities: string[];
  lastInteraction?: string;
}

export interface ContextResult {
  location?: string;
  people?: string[];
  activity?: string;
  relevantMemories?: Memory[];
}

/**
 * API Client for remote MemoRable access
 * Handles authentication and all memory operations via HTTPS only
 */
export class ApiClient {
  private baseUrl: string;
  private apiKey: string | null = null;
  private passphrase: string;
  private deviceType: string;
  private deviceName: string;

  constructor(config: ApiClientConfig) {
    const url = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // SECURITY: HTTPS REQUIRED - NO HTTP EVER (except dev mode)
    // The "weakest router" problem means any unencrypted hop can read traffic
    const allowHttpDev = process.env.ALLOW_HTTP_DEV === 'true' || process.env.NODE_ENV === 'development';
    if (!url.startsWith('https://') && !allowHttpDev) {
      throw new Error(
        'SECURITY ERROR: API_BASE_URL must use HTTPS. HTTP is not allowed.\n' +
        'Received: ' + url + '\n' +
        'Required: https://your-domain.com\n' +
        'Set ALLOW_HTTP_DEV=true for local development.\n' +
        'See docs/REST_MODE_SECURITY.md for HTTPS setup instructions.'
      );
    }
    if (!url.startsWith('https://') && allowHttpDev) {
      console.error('[ApiClient] WARNING: Using HTTP in dev mode. Do NOT use in production.');
    }

    this.baseUrl = url;
    this.apiKey = config.apiKey || null;
    // Passphrase from config > env var > public default (dev only)
    this.passphrase = config.passphrase ||
      process.env.MEMORABLE_PASSPHRASE ||
      'I remember what I have learned from you.';  // Public default for dev
    this.deviceType = config.deviceType || 'mcp';
    this.deviceName = config.deviceName || 'Claude Code MCP';
  }

  /**
   * Authenticate with the API using knock/exchange flow
   */
  async authenticate(): Promise<void> {
    if (this.apiKey) {
      // Already have an API key
      return;
    }

    try {
      // Step 1: Knock to get a challenge
      const knockResponse = await fetch(`${this.baseUrl}/auth/knock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: {
            type: this.deviceType,
            name: this.deviceName,
          },
        }),
      });

      if (!knockResponse.ok) {
        throw new Error(`Knock failed: ${knockResponse.status}`);
      }

      const knockData = await knockResponse.json() as { challenge: string };
      const challenge = knockData.challenge;

      if (!challenge) {
        throw new Error('No challenge received from knock');
      }

      // Step 2: Exchange passphrase for API key
      const exchangeResponse = await fetch(`${this.baseUrl}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge,
          passphrase: this.passphrase,
          device: {
            type: this.deviceType,
            name: this.deviceName,
          },
        }),
      });

      if (!exchangeResponse.ok) {
        throw new Error(`Exchange failed: ${exchangeResponse.status}`);
      }

      const exchangeData = await exchangeResponse.json() as { api_key: string };
      this.apiKey = exchangeData.api_key;

      if (!this.apiKey) {
        throw new Error('No API key received from exchange');
      }

      console.error('[ApiClient] Authenticated successfully');
    } catch (error) {
      console.error('[ApiClient] Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    await this.authenticate();

    let url = `${this.baseUrl}${path}`;

    // Add query parameters
    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Store a new memory
   */
  async storeMemory(content: string, options?: {
    entities?: string[];
    context?: Record<string, unknown>;
    securityTier?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    useLLM?: boolean;
  }): Promise<Memory> {
    return this.request<Memory>('POST', '/memory', {
      content,
      ...options,
    });
  }

  /**
   * Recall memories by query or entity
   */
  async recall(query: string, options?: {
    limit?: number;
    entity?: string;
    minSalience?: number;
  }): Promise<RecallResult> {
    return this.request<RecallResult>('GET', '/memory', undefined, {
      query,
      limit: options?.limit,
      entity: options?.entity,
      minSalience: options?.minSalience,
    });
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory> {
    return this.request<Memory>('GET', `/memory/${id}`);
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('DELETE', `/memory/${id}`);
  }

  /**
   * Get briefing for a person
   */
  async getBriefing(person: string, quick?: boolean): Promise<BriefingResult> {
    // The briefing endpoint might need to be added to the main API
    // For now, use the memory query with person filter
    const result = await this.recall(`briefing ${person}`, {
      entity: person,
      limit: 20,
    });

    // Synthesize a briefing from the memories
    return {
      person,
      summary: `Retrieved ${result.memories.length} memories involving ${person}`,
      openLoops: [],
      upcomingEvents: [],
      sensitivities: [],
      lastInteraction: result.memories[0]?.createdAt,
    };
  }

  /**
   * Set current context
   */
  async setContext(context: {
    location?: string;
    people?: string[];
    activity?: string;
    deviceId?: string;
    deviceType?: string;
  }): Promise<ContextResult> {
    return this.request<ContextResult>('POST', '/context/sync', context);
  }

  /**
   * Get what's relevant now
   */
  async getRelevant(options?: {
    deviceId?: string;
    unified?: boolean;
  }): Promise<ContextResult> {
    // Get context and relevant memories
    const contextResult = await this.request<ContextResult>('GET', '/frame', undefined, {
      deviceId: options?.deviceId,
    });

    return contextResult;
  }

  /**
   * Get open loops (commitments)
   */
  async listLoops(options?: {
    person?: string;
    owner?: 'self' | 'them' | 'mutual';
    includeOverdue?: boolean;
  }): Promise<unknown[]> {
    // Query memories for open loops
    const query = options?.person
      ? `open commitment ${options.person}`
      : 'open commitment follow-up';

    const result = await this.recall(query, {
      entity: options?.person,
      limit: 50,
    });

    // Filter for loop-like memories (this is a simplification)
    return result.memories.filter(m =>
      m.content.toLowerCase().includes('commit') ||
      m.content.toLowerCase().includes('promise') ||
      m.content.toLowerCase().includes('follow up') ||
      m.content.toLowerCase().includes('owe')
    );
  }

  /**
   * Vote on recalled memories to adjust salience scores
   */
  async voteOnMemories(votes: Array<{ memoryId: string; vote: string }>, queryContext?: string): Promise<{
    updated: number;
    adjustments: Array<{ memoryId: string; delta: number }>;
  }> {
    return this.request('POST', '/memory/vote', { votes, query_context: queryContext });
  }

  /**
   * Check if API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance - created when API_BASE_URL is set
 */
let apiClientInstance: ApiClient | null = null;

export function getApiClient(): ApiClient | null {
  const baseUrl = process.env.API_BASE_URL || process.env.MEMORABLE_API_URL;

  if (!baseUrl) {
    return null;
  }

  if (!apiClientInstance) {
    apiClientInstance = new ApiClient({
      baseUrl,
      apiKey: process.env.MEMORABLE_API_KEY,
      passphrase: process.env.MEMORABLE_PASSPHRASE,
      deviceType: 'mcp',
      deviceName: 'Claude Code MCP',
    });
  }

  return apiClientInstance;
}

/**
 * Check if we should use the API client (remote mode) or direct DB
 */
export function useRemoteApi(): boolean {
  return !!(process.env.API_BASE_URL || process.env.MEMORABLE_API_URL);
}
