/**
 * @file Feature Extractor Service
 * Extracts salience-relevant features from memory content using a single LLM call.
 *
 * Cost: ~$0.002-0.003 per memory (Claude Haiku)
 *
 * This is where the "observable signals" get extracted:
 * - Emotional keywords and sentiment
 * - People mentioned and relationship events
 * - Topics, action items, decisions
 * - Commitments, dates, open loops
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
} from './models';

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
  "mutual_agreements": []
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
- mutual_agreements: [{what, parties: [], timeframe, specificity: "specific"|"vague"|"none"}]`;

/**
 * Extract features from memory text using LLM.
 */
export async function extractFeatures(
  text: string,
  llmClient: LLMClient,
  currentDate: Date = new Date()
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
      });
    },
  };
}
