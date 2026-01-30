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
      // Already have a valid API key
      console.error('[ApiClient] Using existing API key');
      return;
    }

    console.error('[ApiClient] No API key - initiating knock/exchange handshake...');

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
   * Get open loops (commitments) from the open_loops collection
   */
  async listLoops(options?: {
    person?: string;
    owner?: 'self' | 'them' | 'mutual';
    includeOverdue?: boolean;
  }): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (options?.person) params.person = options.person;
    if (options?.owner) params.owner = options.owner;
    if (options?.includeOverdue !== undefined) {
      params.includeOverdue = String(options.includeOverdue);
    }

    const result = await this.request<{ loops: unknown[]; count: number }>(
      'GET',
      '/loops',
      undefined,
      params
    );

    return result.loops || [];
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

  // =========================================================================
  // LOOPS / COMMITMENTS
  // =========================================================================

  async closeLoop(loopId: string, note?: string): Promise<{ closed: boolean; loopId: string }> {
    return this.request('POST', `/loops/${loopId}/close`, { note });
  }

  /**
   * DEV ONLY: Clear a collection for testing
   * REMOVE BEFORE PRODUCTION
   */
  async devClearCollection(collection: string): Promise<{ cleared: boolean; deletedCount: number }> {
    return this.request('POST', `/admin/dev/clear/${collection}`, {});
  }

  async resolveOpenLoop(memoryId: string, resolutionNote?: string): Promise<{ resolved: boolean }> {
    return this.request('POST', `/loops/${memoryId}/resolve`, { resolution_note: resolutionNote });
  }

  // =========================================================================
  // MEMORY MANAGEMENT
  // =========================================================================

  async forgetMemory(memoryId: string, mode?: string, reason?: string): Promise<{ forgotten: boolean }> {
    return this.request('POST', '/memory/forget', { memoryId, mode, reason });
  }

  async forgetPerson(person: string, options?: {
    mode?: string;
    alsoForgetEvents?: boolean;
    alsoForgetLoops?: boolean;
  }): Promise<{ forgotten: boolean; count: number }> {
    return this.request('POST', '/memory/forget-person', { person, ...options });
  }

  async restoreMemory(memoryId: string): Promise<{ restored: boolean }> {
    return this.request('POST', '/memory/restore', { memoryId });
  }

  async reassociateMemory(memoryId: string, changes: {
    addPeople?: string[];
    removePeople?: string[];
    addTags?: string[];
    removeTags?: string[];
    addTopics?: string[];
    removeTopics?: string[];
    setProject?: string;
  }): Promise<{ updated: boolean }> {
    return this.request('POST', '/memory/reassociate', { memoryId, ...changes });
  }

  async exportMemories(options?: {
    password?: string;
    fromDate?: string;
    toDate?: string;
    people?: string[];
    topics?: string[];
    project?: string;
    includeLoops?: boolean;
    includeTimeline?: boolean;
  }): Promise<unknown> {
    return this.request('POST', '/memory/export', options);
  }

  async importMemories(data: {
    memories?: unknown[];
    encryptedData?: string;
    password?: string;
    source?: string;
    skipDuplicates?: boolean;
    targetProject?: string;
    idPrefix?: string;
  }): Promise<{ imported: number }> {
    return this.request('POST', '/memory/import', data);
  }

  async searchMemories(query: string, filters?: {
    tags?: string[];
    min_importance?: number;
    pattern_type?: string;
  }, limit?: number): Promise<{ memories: Memory[] }> {
    return this.request('GET', '/memory/search', undefined, {
      query,
      limit,
      tags: filters?.tags?.join(','),
      min_importance: filters?.min_importance,
      pattern_type: filters?.pattern_type,
    });
  }

  async getTierStats(): Promise<unknown> {
    return this.request('GET', '/memory/tiers');
  }

  // =========================================================================
  // CONTEXT & DEVICES
  // =========================================================================

  async clearContext(deviceId?: string, dimensions?: string[]): Promise<{ cleared: boolean }> {
    return this.request('DELETE', '/context', { deviceId, dimensions });
  }

  async listDevices(): Promise<unknown[]> {
    return this.request('GET', '/devices');
  }

  // =========================================================================
  // PREDICTIONS & ANTICIPATION
  // =========================================================================

  async anticipate(calendar?: unknown[], lookAheadMinutes?: number): Promise<unknown> {
    return this.request('POST', '/anticipate', { calendar, lookAheadMinutes });
  }

  async dayOutlook(calendar?: unknown[]): Promise<unknown> {
    return this.request('GET', '/outlook', undefined, {
      calendar: calendar ? JSON.stringify(calendar) : undefined,
    });
  }

  async patternStats(): Promise<unknown> {
    return this.request('GET', '/patterns/stats');
  }

  async getPatternStats(): Promise<unknown> {
    return this.request('GET', '/patterns/stats');
  }

  async memoryFeedback(patternId: string, action: string, memoryId?: string): Promise<{ recorded: boolean }> {
    return this.request('POST', '/patterns/feedback', { patternId, action, memoryId });
  }

  async getPredictions(context: unknown, maxResults?: number): Promise<unknown> {
    return this.request('POST', '/predictions', { context, max_results: maxResults });
  }

  async recordPredictionFeedback(hookId: string, interaction: string, context?: string): Promise<{ recorded: boolean }> {
    return this.request('POST', '/predictions/feedback', { hook_id: hookId, interaction, context });
  }

  async getAnticipatedContext(contextFrame?: unknown, maxMemories?: number): Promise<unknown> {
    return this.request('POST', '/predictions/anticipated', { context_frame: contextFrame, max_memories: maxMemories });
  }

  // =========================================================================
  // EMOTION & SENTIMENT
  // =========================================================================

  async analyzeEmotion(text?: string, memoryId?: string): Promise<unknown> {
    return this.request('POST', '/emotion/analyze', { text, memory_id: memoryId });
  }

  async getEmotionalContext(sessionId?: string): Promise<unknown> {
    return this.request('GET', '/emotion/context', undefined, { session_id: sessionId });
  }

  async startEmotionalSession(sessionId: string, options?: {
    entityId?: string;
    useVoice?: boolean;
    useVideo?: boolean;
    useEvi?: boolean;
    bufferSize?: number;
  }): Promise<unknown> {
    return this.request('POST', '/emotion/session/start', { session_id: sessionId, ...options });
  }

  async stopEmotionalSession(sessionId: string): Promise<unknown> {
    return this.request('POST', '/emotion/session/stop', { session_id: sessionId });
  }

  async listEmotionalSessions(): Promise<unknown> {
    return this.request('GET', '/emotion/sessions');
  }

  async setEmotionFilter(emotions: string[], action: string, options?: {
    threshold?: number;
    enabled?: boolean;
  }): Promise<unknown> {
    return this.request('POST', '/emotion/filter', { emotions, action, ...options });
  }

  async getEmotionFilters(): Promise<unknown> {
    return this.request('GET', '/emotion/filters');
  }

  async getMemoriesByEmotion(emotions: string[], options?: {
    minIntensity?: number;
    limit?: number;
    excludeSuppressed?: boolean;
  }): Promise<unknown> {
    return this.request('GET', '/emotion/memories', undefined, {
      emotions: emotions.join(','),
      min_intensity: options?.minIntensity,
      limit: options?.limit,
      exclude_suppressed: options?.excludeSuppressed,
    });
  }

  async correctEmotion(memoryId: string, options?: {
    correctedEmotions?: Array<{ name: string; confidence: number }>;
    clearAll?: boolean;
    reason?: string;
  }): Promise<unknown> {
    return this.request('POST', '/emotion/correct', { memory_id: memoryId, ...options });
  }

  async clarifyIntent(memoryId: string, whatIMeant: string, options?: {
    whatISaid?: string;
    whyTheGap?: string;
    pattern?: string;
    visibility?: string;
  }): Promise<unknown> {
    return this.request('POST', '/emotion/clarify', { memory_id: memoryId, what_i_meant: whatIMeant, ...options });
  }

  // =========================================================================
  // BEHAVIORAL IDENTITY
  // =========================================================================

  async identifyUser(message: string, candidateUsers?: string[]): Promise<unknown> {
    return this.request('POST', '/behavioral/identify', { message, candidateUsers });
  }

  async behavioralMetrics(timeRange?: string, userId?: string): Promise<unknown> {
    return this.request('GET', '/behavioral/metrics', undefined, { timeRange, userId });
  }

  async behavioralFeedback(predictionId: string, correct: boolean, actualUserId?: string): Promise<unknown> {
    return this.request('POST', '/behavioral/feedback', { predictionId, correct, actualUserId });
  }

  // =========================================================================
  // RELATIONSHIPS & PRESSURE
  // =========================================================================

  async getRelationship(entityA: string, entityB: string, options?: {
    context?: string;
    forceRefresh?: boolean;
  }): Promise<unknown> {
    return this.request('POST', '/relationship', { entity_a: entityA, entity_b: entityB, ...options });
  }

  async getEntityPressure(entityId: string, options?: {
    days?: number;
    includeVectors?: boolean;
  }): Promise<unknown> {
    return this.request('GET', `/pressure/${entityId}`, undefined, {
      days: options?.days,
      include_vectors: options?.includeVectors,
    });
  }

  async setCareCircle(entityId: string, careCircle: string[], alertThreshold?: string): Promise<unknown> {
    return this.request('POST', '/care-circle', { entity_id: entityId, care_circle: careCircle, alert_threshold: alertThreshold });
  }

  async setEntityVulnerability(entityId: string, vulnerability: string, notes?: string): Promise<unknown> {
    return this.request('POST', '/vulnerability', { entity_id: entityId, vulnerability, notes });
  }

  // =========================================================================
  // EVENT DAEMON
  // =========================================================================

  async ingestEvent(type: string, entityId: string, options?: {
    deviceId?: string;
    metadata?: unknown;
    payload?: unknown;
  }): Promise<unknown> {
    return this.request('POST', '/events/ingest', { type, entity_id: entityId, ...options });
  }

  async scheduleCheck(entityId: string, checkType: string, delayMinutes: number, message?: string): Promise<unknown> {
    return this.request('POST', '/events/schedule', { entity_id: entityId, check_type: checkType, delay_minutes: delayMinutes, message });
  }

  async getDaemonStatus(): Promise<unknown> {
    return this.request('GET', '/events/daemon/status');
  }

  // =========================================================================
  // SYSTEM
  // =========================================================================

  async getStatus(): Promise<unknown> {
    return this.request('GET', '/status');
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

// Default API URL - same as session-start hook
const DEFAULT_API_URL = 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';

export function getApiClient(): ApiClient | null {
  const baseUrl = process.env.API_BASE_URL || process.env.MEMORABLE_API_URL || DEFAULT_API_URL;

  // Always have a base URL now (fallback to default)

  if (!apiClientInstance) {
    // Only use MEMORABLE_API_KEY if it looks like a valid key (starts with memorable_)
    // Empty strings, undefined, or invalid-looking keys will trigger handshake auth
    const envApiKey = process.env.MEMORABLE_API_KEY;
    const validApiKey = envApiKey && envApiKey.startsWith('memorable_') ? envApiKey : undefined;

    apiClientInstance = new ApiClient({
      baseUrl,
      apiKey: validApiKey,
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
