/**
 * @file Feature Extractor Service
 * Extracts salience-relevant features from memory content using a single LLM call.
 *
 * SECURITY: Respects SecurityTier for privacy protection.
 * - Tier3_Vault: NEVER uses external LLM, heuristic only (grandma's credit card)
 * - Tier2_Personal: Local LLM (Ollama) only, fallback to heuristic
 * - Tier1_General: External LLM allowed (Anthropic/OpenAI)
 *
 * Cost: ~$0.002-0.003 per memory (Claude Haiku) - Tier1 only
 */

import type {
  ExtractedFeatures,
  LLMExtractionResponse,
  ExtractedCommitment,
  ExtractedDate,
  ExtractedRequest,
  ExtractedMutualAgreement,
  ActionItem,
  RelationshipEventType,
  MemoryCategory,
} from './models';

// Import SecurityTier type
import type { SecurityTier } from '../ingestion_service/models';

/**
 * LLM client interface - can be implemented with any LLM provider.
 */
export interface LLMClient {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * The extraction prompt sent to the LLM.
 * Designed for a single efficient call that extracts all salience-relevant features.
 */
const EXTRACTION_PROMPT = `Analyze this conversation excerpt for memory salience factors.
Return JSON only. No explanation, no markdown formatting, just valid JSON.

Text: "{TEXT}"

Current date for resolving relative dates: {CURRENT_DATE}

Extract:
{
  "emotional_keywords": [],
  "sentiment_score": 0,
  "sentiment_intensity": 0,
  "people_mentioned": [],
  "relationship_events": [],
  "topics": [],
  "action_items": [],
  "decisions": [],
  "money_mentioned": false,
  "conflict_present": false,
  "intimacy_signals": false,
  "commitments": [],
  "dates_mentioned": [],
  "questions_asked": [],
  "requests_made": [],
  "mutual_agreements": [],
  "urgency_level": "none",
  "urgency_keywords": [],
  "directive_strength": 0,
  "memory_category": "uncategorized"
}

Field specifications:
- emotional_keywords: Words indicating emotion (died, love, fired, pregnant, cancer, excited, worried, etc.)
- sentiment_score: -1 (very negative) to 1 (very positive)
- sentiment_intensity: 0 (neutral) to 1 (extreme emotional intensity)
- people_mentioned: Names of people referenced
- relationship_events: Events like ["death", "birth", "marriage", "promotion", "illness", "job_change", "graduation", "breakup", "reconciliation"]
- topics: Main subjects discussed
- action_items: [{description, assigned_to: "self"|"other"|"mutual", due_date: ISO8601 or null}]
- decisions: Choices made or discussed
- money_mentioned: true if financial topics discussed
- conflict_present: true if tension, disagreement, or conflict present
- intimacy_signals: true if vulnerability, deep sharing, attraction, or emotional closeness
- commitments: [{type: "made"|"received", from, to, what, by_when: ISO8601 or null, due_type: "explicit"|"implicit"|"none"}]
- dates_mentioned: [{raw_text, resolved: ISO8601 or null, context, whose: person name or null, type: "deadline"|"event"|"milestone"|"reference"}]
- questions_asked: Questions that were asked
- requests_made: [{who_requested: "self" or name, what, from_whom, by_when: ISO8601 or null}]
- mutual_agreements: [{what, parties: [], timeframe, specificity: "specific"|"vague"|"none"}]
- urgency_level: "none"|"low"|"medium"|"high"|"critical" — based on imperative language (CRITICAL, MUST, NEVER, non-negotiable, essential, mandatory, required, urgent, immediately, top priority)
- urgency_keywords: Specific urgency/imperative words found in the text
- directive_strength: 0.0 (purely informational) to 1.0 (absolute command/rule). Rules, instructions, "always do X", "never do Y" = high. Casual observations = low.
- memory_category: "instruction"|"preference"|"fact"|"event"|"project"|"task"|"startup"|"relationship"|"strategy"|"uncategorized" — classify what kind of memory this is`;

/**
 * Extract features from memory text.
 *
 * SECURITY: Routes based on SecurityTier to protect sensitive data.
 * - Tier3_Vault: NEVER sends to external LLM (uses heuristic only)
 * - Tier2_Personal: Uses local LLM only (Ollama), falls back to heuristic
 * - Tier1_General: External LLM allowed
 *
 * @param text - The memory text to extract features from
 * @param llmClient - The LLM client (external)
 * @param currentDate - Current date for resolving relative dates
 * @param securityTier - Security tier determining LLM routing
 * @param localLLMClient - Optional local LLM client (Ollama) for Tier2
 */
export async function extractFeatures(
  text: string,
  llmClient: LLMClient,
  currentDate: Date = new Date(),
  securityTier: SecurityTier = 'Tier2_Personal',
  localLLMClient?: LLMClient
): Promise<ExtractedFeatures> {

  // SECURITY: Tier3_Vault data NEVER goes to any LLM
  // This is grandma's credit card - heuristic extraction only
  if (securityTier === 'Tier3_Vault') {
    console.log('[FeatureExtractor] Tier3_Vault: Using heuristic extraction only (no LLM)');
    return extractFeaturesHeuristic(text);
  }

  // SECURITY: Tier2_Personal uses local LLM only (Ollama)
  // Falls back to heuristic if local LLM unavailable
  if (securityTier === 'Tier2_Personal') {
    if (localLLMClient) {
      console.log('[FeatureExtractor] Tier2_Personal: Using local LLM (Ollama)');
      try {
        return await extractFeaturesWithLLM(text, localLLMClient, currentDate);
      } catch (error) {
        console.error('[FeatureExtractor] Local LLM failed, using heuristic:', error);
        return extractFeaturesHeuristic(text);
      }
    } else {
      console.log('[FeatureExtractor] Tier2_Personal: No local LLM, using heuristic');
      return extractFeaturesHeuristic(text);
    }
  }

  // Tier1_General: External LLM allowed
  console.log('[FeatureExtractor] Tier1_General: Using external LLM');
  return extractFeaturesWithLLM(text, llmClient, currentDate);
}

/**
 * Internal function to extract features using an LLM client.
 */
async function extractFeaturesWithLLM(
  text: string,
  llmClient: LLMClient,
  currentDate: Date
): Promise<ExtractedFeatures> {
  const prompt = EXTRACTION_PROMPT
    .replace('{TEXT}', escapeForPrompt(text))
    .replace('{CURRENT_DATE}', currentDate.toISOString().split('T')[0]);

  try {
    const response = await llmClient.complete(prompt, {
      temperature: 0.1, // Low temperature for consistent extraction
      maxTokens: 2000,
      model: 'claude-3-haiku', // Fast and cheap
    });

    const parsed = parseExtractionResponse(response);
    return transformToExtractedFeatures(parsed);
  } catch (error) {
    console.error('[FeatureExtractor] Error extracting features:', error);
    // Return empty features on error - let salience calculation proceed with zeros
    return getEmptyFeatures();
  }
}

/**
 * Parse the LLM response into structured data.
 */
function parseExtractionResponse(response: string): LLMExtractionResponse {
  // Clean up the response - remove any markdown formatting
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[FeatureExtractor] Failed to parse LLM response:', cleaned);
    throw new Error('Invalid JSON response from LLM');
  }
}

/**
 * Transform LLM response to our internal ExtractedFeatures format.
 */
function transformToExtractedFeatures(response: LLMExtractionResponse): ExtractedFeatures {
  const validUrgencyLevels = ['none', 'low', 'medium', 'high', 'critical'] as const;
  const urgencyLevel = validUrgencyLevels.includes(response.urgency_level as any)
    ? response.urgency_level as typeof validUrgencyLevels[number]
    : 'none';

  const validCategories = [
    'instruction', 'preference', 'fact', 'event', 'project',
    'task', 'startup', 'relationship', 'strategy', 'uncategorized',
  ] as const;
  const memoryCategory = validCategories.includes(response.memory_category as any)
    ? response.memory_category as MemoryCategory
    : 'uncategorized';

  return {
    emotionalKeywords: response.emotional_keywords || [],
    sentimentScore: clamp(response.sentiment_score || 0, -1, 1),
    sentimentIntensity: clamp(response.sentiment_intensity || 0, 0, 1),
    peopleMentioned: response.people_mentioned || [],
    relationshipEvents: (response.relationship_events || []).filter(isValidRelationshipEvent) as RelationshipEventType[],
    topics: response.topics || [],
    actionItems: (response.action_items || []).map(transformActionItem),
    decisions: response.decisions || [],
    moneyMentioned: response.money_mentioned || false,
    conflictPresent: response.conflict_present || false,
    intimacySignals: response.intimacy_signals || false,
    commitments: (response.commitments || []).map(transformCommitment),
    datesMentioned: (response.dates_mentioned || []).map(transformDate),
    questionsAsked: response.questions_asked || [],
    requestsMade: (response.requests_made || []).map(transformRequest),
    mutualAgreements: (response.mutual_agreements || []).map(transformAgreement),
    urgencyLevel,
    urgencyKeywords: response.urgency_keywords || [],
    directiveStrength: clamp(response.directive_strength || 0, 0, 1),
    memoryCategory,
  };
}

/**
 * Transform action item from LLM format.
 */
function transformActionItem(item: any): ActionItem {
  return {
    description: item.description || '',
    assignedTo: (['self', 'other', 'mutual'].includes(item.assigned_to)
      ? item.assigned_to
      : 'other') as 'self' | 'other' | 'mutual',
    dueDate: item.due_date || undefined,
    priority: item.priority || undefined,
  };
}

/**
 * Transform commitment from LLM format.
 */
function transformCommitment(item: any): ExtractedCommitment {
  return {
    type: item.type === 'made' ? 'made' : 'received',
    from: item.from || 'unknown',
    to: item.to || 'unknown',
    what: item.what || '',
    byWhen: item.by_when || null,
    dueType: (['explicit', 'implicit', 'none'].includes(item.due_type)
      ? item.due_type
      : 'none') as 'explicit' | 'implicit' | 'none',
    explicit: item.due_type === 'explicit',
  };
}

/**
 * Transform date mention from LLM format.
 */
function transformDate(item: any): ExtractedDate {
  return {
    rawText: item.raw_text || '',
    resolved: item.resolved || null,
    context: item.context || '',
    whose: item.whose || null,
    type: (['deadline', 'event', 'milestone', 'reference'].includes(item.type)
      ? item.type
      : 'reference') as 'deadline' | 'event' | 'milestone' | 'reference',
  };
}

/**
 * Transform request from LLM format.
 */
function transformRequest(item: any): ExtractedRequest {
  return {
    whoRequested: item.who_requested || 'self',
    what: item.what || '',
    fromWhom: item.from_whom || 'unknown',
    byWhen: item.by_when || null,
  };
}

/**
 * Transform mutual agreement from LLM format.
 */
function transformAgreement(item: any): ExtractedMutualAgreement {
  return {
    what: item.what || '',
    parties: item.parties || [],
    timeframe: item.timeframe || null,
    specificity: (['specific', 'vague', 'none'].includes(item.specificity)
      ? item.specificity
      : 'none') as 'specific' | 'vague' | 'none',
  };
}

/**
 * Check if a string is a valid relationship event type.
 */
function isValidRelationshipEvent(event: string): boolean {
  const validEvents = [
    'death', 'birth', 'marriage', 'divorce', 'engagement', 'promotion',
    'job_change', 'graduation', 'illness', 'recovery', 'move', 'breakup',
    'reunion', 'achievement', 'loss', 'conflict', 'reconciliation'
  ];
  return validEvents.includes(event);
}

/**
 * Get empty features object for fallback.
 */
function getEmptyFeatures(): ExtractedFeatures {
  return {
    emotionalKeywords: [],
    sentimentScore: 0,
    sentimentIntensity: 0,
    peopleMentioned: [],
    relationshipEvents: [],
    topics: [],
    actionItems: [],
    decisions: [],
    moneyMentioned: false,
    conflictPresent: false,
    intimacySignals: false,
    commitments: [],
    datesMentioned: [],
    questionsAsked: [],
    requestsMade: [],
    mutualAgreements: [],
    urgencyLevel: 'none',
    urgencyKeywords: [],
    directiveStrength: 0,
    memoryCategory: 'uncategorized',
  };
}

/**
 * Maximum text length to send to LLM (characters).
 * Prevents cost overruns and potential DoS via huge inputs.
 */
const MAX_PROMPT_TEXT_LENGTH = 10000;

/**
 * Escape and sanitize text for safe insertion into LLM prompt.
 * Prevents prompt injection and limits resource usage.
 */
function escapeForPrompt(text: string): string {
  // Truncate to prevent cost overruns
  let sanitized = text.slice(0, MAX_PROMPT_TEXT_LENGTH);

  // Remove null bytes and other control characters (except \n, \t, \r)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Escape special characters for JSON string
  return sanitized
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Clamp a number to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Simple heuristic-based feature extraction (no LLM).
 * Use as fallback when LLM is unavailable or for cost savings on low-priority content.
 */
export function extractFeaturesHeuristic(text: string): ExtractedFeatures {
  const lowerText = text.toLowerCase();
  const features = getEmptyFeatures();

  // Emotional keywords detection
  const emotionalPatterns = [
    'died', 'death', 'passed away', 'funeral',
    'love', 'loved', 'hate', 'hated',
    'fired', 'promoted', 'quit',
    'pregnant', 'baby', 'born',
    'cancer', 'sick', 'hospital',
    'married', 'wedding', 'divorced',
    'excited', 'worried', 'scared', 'happy', 'sad', 'angry',
    'amazing', 'terrible', 'wonderful', 'awful'
  ];

  for (const pattern of emotionalPatterns) {
    if (lowerText.includes(pattern)) {
      features.emotionalKeywords.push(pattern);
    }
  }

  // Simple sentiment detection
  const positiveWords = ['good', 'great', 'happy', 'excited', 'love', 'wonderful', 'amazing', 'fantastic'];
  const negativeWords = ['bad', 'sad', 'angry', 'hate', 'terrible', 'awful', 'worried', 'scared', 'died', 'death'];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (lowerText.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (lowerText.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total > 0) {
    features.sentimentScore = (positiveCount - negativeCount) / total;
    features.sentimentIntensity = Math.min(1, total * 0.2);
  }

  // Name detection (simple: capitalized words that aren't sentence starters)
  const namePattern = /(?:^|[.!?]\s+)(?:\w+\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
  const names = new Set<string>();
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const potentialName = match[1];
    // Filter out common non-names
    const nonNames = ['the', 'this', 'that', 'there', 'here', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!nonNames.includes(potentialName.toLowerCase())) {
      names.add(potentialName);
    }
  }
  features.peopleMentioned = Array.from(names);

  // Money detection
  features.moneyMentioned = /\$|dollar|money|pay|cost|price|budget|invest|funding|revenue|salary/i.test(text);

  // Conflict detection
  features.conflictPresent = /disagree|argument|fight|conflict|tension|angry|upset|frustrated/i.test(text);

  // Intimacy signals
  features.intimacySignals = /love|miss you|care about|close to|vulnerable|trust|honest|feeling/i.test(text);

  // Relationship events
  if (/died|passed away|funeral|death/i.test(text)) features.relationshipEvents.push('death');
  if (/married|wedding|engaged/i.test(text)) features.relationshipEvents.push('marriage');
  if (/divorced|separation/i.test(text)) features.relationshipEvents.push('divorce');
  if (/pregnant|baby|born|birth/i.test(text)) features.relationshipEvents.push('birth');
  if (/promoted|promotion/i.test(text)) features.relationshipEvents.push('promotion');
  if (/graduated|graduation/i.test(text)) features.relationshipEvents.push('graduation');
  if (/sick|illness|hospital|cancer/i.test(text)) features.relationshipEvents.push('illness');

  // Action items (very basic)
  if (/I('ll| will) send|I need to|don't forget to|remember to/i.test(text)) {
    features.actionItems.push({
      description: 'Action item detected (heuristic)',
      assignedTo: 'self',
    });
  }

  // ── COMMITMENT EXTRACTION (heuristic) ────────────────────────
  // Commitments run the world. Even without LLM, we track promises.
  // "The most important part of memory is knowing what to forget."
  // But commitments? Those you NEVER forget.

  // Commitments MADE (I → someone)
  const commitmentMadePatterns = [
    /I('ll| will| shall)\s+(.{5,60})/i,
    /I('m going to| am going to)\s+(.{5,60})/i,
    /I promise(?:d)?\s+(?:to\s+)?(.{5,60})/i,
    /I need to\s+(.{5,60})/i,
    /don'?t forget to\s+(.{5,60})/i,
    /remember to\s+(.{5,60})/i,
    /let me\s+(.{5,60})/i,
    /I('ll| will) get (?:back to|it to)\s+(.{5,60})/i,
  ];

  for (const pattern of commitmentMadePatterns) {
    const m = pattern.exec(text);
    if (m) {
      const what = (m[2] || m[1] || '').replace(/[.!?,;]+$/, '').trim();
      if (what.length >= 5) {
        features.commitments.push({
          type: 'made',
          from: 'self',
          to: features.peopleMentioned[0] || 'unknown',
          what,
          byWhen: null,
          dueType: 'none',
          explicit: true,
        });
      }
    }
  }

  // Commitments RECEIVED (someone → I)
  const commitmentReceivedPatterns = [
    /(\w+)\s+(?:will|shall|'ll)\s+(.{5,60})/i,
    /(\w+)\s+promise[sd]?\s+(?:to\s+)?(.{5,60})/i,
    /(\w+)\s+(?:said|agreed)\s+(?:they'?d|they would|to)\s+(.{5,60})/i,
  ];

  for (const pattern of commitmentReceivedPatterns) {
    const m = pattern.exec(text);
    if (m) {
      const who = m[1];
      const what = (m[2] || '').replace(/[.!?,;]+$/, '').trim();
      // Skip if "I" was matched as the committer (that's a made commitment)
      if (who.toLowerCase() !== 'i' && what.length >= 5) {
        features.commitments.push({
          type: 'received',
          from: who,
          to: 'self',
          what,
          byWhen: null,
          dueType: 'none',
          explicit: true,
        });
      }
    }
  }

  // Requests (asking someone for something)
  const requestPatterns = [
    /(?:can|could|would) you\s+(.{5,60})/i,
    /(?:please|pls)\s+(.{5,60})/i,
    /I (?:asked|need|want)\s+(\w+)\s+to\s+(.{5,60})/i,
  ];

  for (const pattern of requestPatterns) {
    const m = pattern.exec(text);
    if (m) {
      const what = (m[2] || m[1] || '').replace(/[.!?,;]+$/, '').trim();
      if (what.length >= 5) {
        features.requestsMade.push({
          whoRequested: 'self',
          what,
          fromWhom: features.peopleMentioned[0] || 'unknown',
          byWhen: null,
        });
      }
    }
  }

  // Mutual agreements
  if (/we (?:agreed|decided|committed)\s+(?:to\s+)?(.{5,60})/i.test(text)) {
    const m = /we (?:agreed|decided|committed)\s+(?:to\s+)?(.{5,60})/i.exec(text);
    if (m) {
      features.mutualAgreements.push({
        what: m[1].replace(/[.!?,;]+$/, '').trim(),
        parties: ['self', ...features.peopleMentioned.slice(0, 2)],
        timeframe: null,
        specificity: 'vague',
      });
    }
  }

  // Date extraction for commitment timing
  const datePatterns = [
    { pattern: /\b(?:by|before|due|until)\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, type: 'deadline' as const },
    { pattern: /\b(?:by|before|due|until)\s+(next week|next month|end of (?:day|week|month))/i, type: 'deadline' as const },
    { pattern: /\b(tomorrow|tonight|today)\b/i, type: 'deadline' as const },
  ];

  for (const { pattern, type } of datePatterns) {
    const m = pattern.exec(text);
    if (m) {
      features.datesMentioned.push({
        rawText: m[1],
        resolved: null,
        context: text.substring(Math.max(0, (m.index || 0) - 20), (m.index || 0) + m[0].length + 20),
        whose: 'self',
        type,
      });
      // Attach to most recent commitment
      if (features.commitments.length > 0) {
        const lastCommitment = features.commitments[features.commitments.length - 1];
        if (!lastCommitment.byWhen) {
          lastCommitment.byWhen = m[1];
          lastCommitment.dueType = 'implicit';
        }
      }
    }
  }

  // Urgency detection
  const urgencyPatterns: Array<{ pattern: RegExp; keyword: string; weight: number }> = [
    { pattern: /\bcritical\b/i, keyword: 'critical', weight: 4 },
    { pattern: /\bnon-?negotiable\b/i, keyword: 'non-negotiable', weight: 4 },
    { pattern: /\bMUST\b/, keyword: 'MUST', weight: 3 },       // Case-sensitive: emphatic MUST
    { pattern: /\bNEVER\b/, keyword: 'NEVER', weight: 3 },     // Case-sensitive: emphatic NEVER
    { pattern: /\bALWAYS\b/, keyword: 'ALWAYS', weight: 3 },   // Case-sensitive: emphatic ALWAYS
    { pattern: /\burgent\b/i, keyword: 'urgent', weight: 3 },
    { pattern: /\bimmediately\b/i, keyword: 'immediately', weight: 3 },
    { pattern: /\bessential\b/i, keyword: 'essential', weight: 2 },
    { pattern: /\bmandatory\b/i, keyword: 'mandatory', weight: 2 },
    { pattern: /\brequired\b/i, keyword: 'required', weight: 2 },
    { pattern: /\btop priority\b/i, keyword: 'top priority', weight: 3 },
    { pattern: /\bdo not\b/i, keyword: 'do not', weight: 1 },
    { pattern: /\bmust never\b/i, keyword: 'must never', weight: 4 },
    { pattern: /\bimportant\b/i, keyword: 'important', weight: 1 },
  ];

  let urgencyScore = 0;
  for (const { pattern, keyword, weight } of urgencyPatterns) {
    if (pattern.test(text)) {
      features.urgencyKeywords.push(keyword);
      urgencyScore += weight;
    }
  }

  if (urgencyScore >= 8) features.urgencyLevel = 'critical';
  else if (urgencyScore >= 5) features.urgencyLevel = 'high';
  else if (urgencyScore >= 3) features.urgencyLevel = 'medium';
  else if (urgencyScore >= 1) features.urgencyLevel = 'low';
  else features.urgencyLevel = 'none';

  // Directive strength detection
  const directivePatterns = [
    /\balways\b/i, /\bnever\b/i, /\bmust\b/i, /\bshall\b/i,
    /\bdo not\b/i, /\bdon'?t\b/i, /\brule\b/i, /\brequire/i,
    /\bfollow\b/i, /\bobey\b/i, /\bmandat/i, /\bensure\b/i,
  ];
  let directiveCount = 0;
  for (const pattern of directivePatterns) {
    if (pattern.test(text)) directiveCount++;
  }
  features.directiveStrength = Math.min(1.0, directiveCount * 0.15);

  // Memory category detection (heuristic)
  if (/\brule\b|always|never|must|instruction|protocol|procedure/i.test(lowerText)) {
    features.memoryCategory = 'instruction';
  } else if (/\bprefer|like|dislike|favorite|hate\b/i.test(lowerText)) {
    features.memoryCategory = 'preference';
  } else if (/\bproject\b|sprint|milestone|release|deploy/i.test(lowerText)) {
    features.memoryCategory = 'project';
  } else if (/\btask\b|todo|action item|assigned|due/i.test(lowerText)) {
    features.memoryCategory = 'task';
  } else if (/\bstrategy\b|plan|goal|objective|vision/i.test(lowerText)) {
    features.memoryCategory = 'strategy';
  } else if (/\bstartup\b|session.?init|boot|first.?thing|load.?on.?start/i.test(lowerText)) {
    features.memoryCategory = 'startup';
  } else {
    features.memoryCategory = 'uncategorized';
  }

  return features;
}

/**
 * Create a mock LLM client for testing.
 */
export function createMockLLMClient(responses?: Record<string, string>): LLMClient {
  return {
    complete: async (prompt: string) => {
      // Return a basic response or use heuristics
      const textMatch = prompt.match(/Text: "(.+?)"/s);
      const text = textMatch ? textMatch[1] : '';
      const features = extractFeaturesHeuristic(text);

      // Convert to LLM response format
      return JSON.stringify({
        emotional_keywords: features.emotionalKeywords,
        sentiment_score: features.sentimentScore,
        sentiment_intensity: features.sentimentIntensity,
        people_mentioned: features.peopleMentioned,
        relationship_events: features.relationshipEvents,
        topics: [],
        action_items: features.actionItems.map(a => ({
          description: a.description,
          assigned_to: a.assignedTo,
          due_date: a.dueDate
        })),
        decisions: [],
        money_mentioned: features.moneyMentioned,
        conflict_present: features.conflictPresent,
        intimacy_signals: features.intimacySignals,
        commitments: [],
        dates_mentioned: [],
        questions_asked: [],
        requests_made: [],
        mutual_agreements: [],
        urgency_level: features.urgencyLevel,
        urgency_keywords: features.urgencyKeywords,
        directive_strength: features.directiveStrength,
        memory_category: features.memoryCategory,
      });
    },
  };
}
