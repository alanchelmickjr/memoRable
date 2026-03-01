#!/usr/bin/env node
/**
 * @file MemoRable MCP Server
 *
 * Model Context Protocol server for the Memory Salience System.
 * Enables Claude Code, VS Code extensions, and other MCP clients
 * to access persistent, salient memory.
 *
 * Tools:
 * - store_memory: Save a memory with automatic salience enrichment
 * - recall: Search and retrieve relevant memories
 * - get_briefing: Pre-conversation briefing for a person
 * - list_loops: List open commitments/follow-ups
 * - close_loop: Mark a commitment as completed
 * - get_status: Get system status and metrics
 *
 * Resources:
 * - memory://recent - Recent high-salience memories
 * - memory://loops - Open commitments awaiting action
 * - memory://contacts - Known contacts with relationship data
 *
 * Usage:
 *   npx memorable-mcp                    # stdio transport (for Claude Code)
 *   npx memorable-mcp --sse --port 3100  # SSE transport (for web clients)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { MongoClient, Db } from 'mongodb';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { randomUUID, createCipheriv, createDecipheriv, scryptSync, randomBytes, createHash } from 'crypto';
import { createClient, RedisClientType } from 'redis';
import morgan from 'morgan';

// Logging — the nervous system
import { logger, setupLogger, setLogLevel, getLogLevel } from '../../utils/logger.js';

// Import API client for remote mode (HTTP instead of direct MongoDB)
import { ApiClient, getApiClient, useRemoteApi } from './api_client.js';

// Import salience service functions
import {
  enrichMemoryWithSalience,
  enrichMemoryWithSalienceHeuristic,
  retrieveMemoriesByQuery,
  generateBriefing,
  generateQuickBriefing,
  getOpenLoops,
  closeLoop,
  getSalienceStatus,
  getActiveRelationships,
  getColdRelationships,
  initializeSalienceService,
  getMetricsSummary,
  // Context frame (now device-aware)
  setContext,
  whatMattersNow,
  clearContextFrame,
  getAllDeviceContexts,
  getUnifiedUserContext,
  clearDeviceContext,
  // Memory operations
  forgetMemory,
  forgetPerson,
  restoreMemory,
  reassociateMemory,
  exportMemories,
  importMemories,
  // Anticipation service (predictive memory)
  initAnticipationService,
  observeContext,
  recordPatternFeedback,
  getAnticipatedContext,
  getPatternStats,
  generateDayAnticipation,
  // LLM provider abstraction (supports Bedrock, Anthropic, OpenAI)
  createLLMClient as createLLMProvider,
  // Database access for memory storage
  collections,
  type LLMClient,
  type CalendarEvent,
  type FeedbackSignal,
  type ScoredMemory,
  type SecurityTier,
  type MemoryDocument,
} from '../salience_service/index.js';

// Device types for multi-device support
import type { DeviceType } from '../salience_service/device_context.js';

// Context frame for prompt enrichment
import { getContextFrame, surfaceMemoriesForFrame } from '../salience_service/context_frame.js';
import { getAnticipatedForUser, getPredictiveAnticipationService } from '../salience_service/predictive_anticipation.js';

// Session continuity for seamless cross-device context transfer
import {
  initiateHandoff,
  getSessionContinuity,
  getCrossDeviceState,
  updateDeviceSession,
} from '../salience_service/session_continuity.js';

// Notification service for care circle alerts
import { notificationService } from '../notification_service/index.js';

// Emotion analyzer for distress detection
import { EmotionAnalyzerClient } from '../ingestion_service/clients/emotion_analyzer_client.js';

// Multi-modal emotional context service (video, voice, EVI fusion)
import emotionalContextService from '../emotionalContextService.js';

// Prediction hooks for proactive memory surfacing
import { createHook, generateHookPrompt, type HookCondition, type HookPriority } from '../salience_service/prediction_hooks.js';

// Entity pressure tracking for butterfly → hurricane early warning
import { addPressureVector, createEntityPressure, type EntityPressure, type PressureVector, type PressureCategory } from '../salience_service/entity.js';

// Multi-signal distress scoring - predict BEFORE crisis
import { calculateDistressScore, buildDistressSignals } from '../salience_service/distress_scorer.js';

// FFT pattern detection - records memory access for periodicity detection
import { recordMemoryAccess } from '../salience_service/pattern_detector.js';

// Context gate - filters memories by current context relevance
import { getContextGate, getAppropriatenessFilter, type ContextFrame } from '../salience_service/context_gate.js';

// Event daemon - real-time external event processor (the guardian)
import { eventDaemon, type ExternalEvent, type EventType } from '../event_daemon/index.js';

// Tier manager - Zipfian cache hierarchy (Hot/Warm/Cold)
import { getTierManager, createMemoryDocument, type TierManager } from '../salience_service/tier_manager.js';
import type { PredictiveMemoryDocument, StorageTier, NormalizedSalience } from '../salience_service/models.js';

// Configuration
const CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable',
  defaultUserId: process.env.MCP_USER_ID || 'default',
  // LLM provider is auto-detected from environment:
  // - USE_BEDROCK=true or AWS_EXECUTION_ENV set → Bedrock (IAM auth)
  // - ANTHROPIC_API_KEY set → Anthropic direct
  // - OPENAI_API_KEY set → OpenAI direct
  llmProvider: process.env.LLM_PROVIDER || 'auto',
  // Transport configuration: 'stdio' (default) or 'http'
  transportType: process.env.TRANSPORT_TYPE || 'stdio',
  httpPort: parseInt(process.env.MCP_HTTP_PORT || '8080', 10),
  // OAuth 2.0 configuration (required for remote deployment)
  oauth: {
    enabled: process.env.OAUTH_ENABLED === 'true',
    clientId: process.env.OAUTH_CLIENT_ID || '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    jwtSecret: process.env.JWT_SECRET || randomUUID(),
    tokenExpiry: process.env.OAUTH_TOKEN_EXPIRY || '1h',
    refreshExpiry: process.env.OAUTH_REFRESH_EXPIRY || '7d',
  },
  // CORS configuration for Claude.ai web integration
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://claude.ai,https://claude.com').split(','),
};

// OAuth token interfaces
interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  userId: string;
  clientId: string;
  expiresAt: Date;
  scope: string[];
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scope: string[];
  expiresAt: Date;
}

// SECURITY FIX: Redis-based encrypted token store (not in-memory)
let redisClient: RedisClientType | null = null;

function getRedisClient(): RedisClientType | null {
  return redisClient;
}

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'changeme_token_key';
const TOKEN_PREFIX = 'oauth:token:';
const AUTH_CODE_PREFIX = 'oauth:code:';

// Encrypt token data before storing in Redis
function encryptTokenData(data: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(TOKEN_ENCRYPTION_KEY, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Decrypt token data from Redis
function decryptTokenData(encryptedData: string): string {
  const [saltHex, ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const key = scryptSync(TOKEN_ENCRYPTION_KEY, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// Secure token store functions
async function storeToken(tokenId: string, token: OAuthToken): Promise<void> {
  if (!redisClient) {
    logger.warn('[MCP] Redis not connected, token storage unavailable');
    return;
  }
  const encrypted = encryptTokenData(JSON.stringify(token));
  const ttl = Math.max(0, Math.floor((new Date(token.expiresAt).getTime() - Date.now()) / 1000));
  await redisClient.setEx(`${TOKEN_PREFIX}${tokenId}`, ttl > 0 ? ttl : 3600, encrypted);
}

async function getToken(tokenId: string): Promise<OAuthToken | null> {
  if (!redisClient) return null;
  const encrypted = await redisClient.get(`${TOKEN_PREFIX}${tokenId}`);
  if (!encrypted) return null;
  try {
    return JSON.parse(decryptTokenData(encrypted));
  } catch {
    return null;
  }
}

async function deleteToken(tokenId: string): Promise<void> {
  if (!redisClient) return;
  await redisClient.del(`${TOKEN_PREFIX}${tokenId}`);
}

async function storeAuthCode(code: string, authCode: AuthorizationCode): Promise<void> {
  if (!redisClient) return;
  const encrypted = encryptTokenData(JSON.stringify(authCode));
  const ttl = Math.max(0, Math.floor((new Date(authCode.expiresAt).getTime() - Date.now()) / 1000));
  await redisClient.setEx(`${AUTH_CODE_PREFIX}${code}`, ttl > 0 ? ttl : 600, encrypted);
}

async function getAuthCode(code: string): Promise<AuthorizationCode | null> {
  if (!redisClient) return null;
  const encrypted = await redisClient.get(`${AUTH_CODE_PREFIX}${code}`);
  if (!encrypted) return null;
  try {
    return JSON.parse(decryptTokenData(encrypted));
  } catch {
    return null;
  }
}

async function deleteAuthCode(code: string): Promise<void> {
  if (!redisClient) return;
  await redisClient.del(`${AUTH_CODE_PREFIX}${code}`);
}

// ============================================================================
// PROMPT ENRICHMENT SYSTEM
// ============================================================================
// The rolling Redis window - polled on EVERY prompt to surface relevant context
// This is the core of MemoRable's value: automatic context injection
// ============================================================================

/**
 * Context enrichment result - injected into every tool response
 */
interface PromptEnrichment {
  // Current context frame from Redis
  contextFrame?: {
    location?: string;
    people: string[];
    activity?: string;
    timeOfDay: string;
    dayType: string;
  };
  // Anticipated memories based on patterns
  anticipated: Array<{
    memoryId: string;
    content: string;
    score: number;
    reasons: string[];
  }>;
  // Urgent open loops
  urgentLoops: Array<{
    id: string;
    description: string;
    dueIn?: string;
    isOverdue: boolean;
  }>;
  // Suggested topics to explore
  suggestedTopics: string[];
  // Pattern stats
  patternStats?: {
    totalPatterns: number;
    formedPatterns: number;
    readyForPrediction: boolean;
  };
}

/**
 * PRE-PROMPT HOOK: Enrich context before tool execution
 * Polls Redis rolling window and predictive engine
 */
async function enrichPromptContext(userId: string): Promise<PromptEnrichment> {
  const enrichment: PromptEnrichment = {
    anticipated: [],
    urgentLoops: [],
    suggestedTopics: [],
  };

  try {
    // 1. Get current context frame from Redis
    const frame = await getContextFrame(userId);
    if (frame) {
      enrichment.contextFrame = {
        location: frame.location?.value,
        people: frame.people.map(p => p.value),
        activity: frame.activity?.value,
        timeOfDay: frame.timeOfDay,
        dayType: frame.dayType,
      };

      // Surface memories for current context
      const surfaced = await surfaceMemoriesForFrame(frame);
      if (surfaced.suggestedTopics) {
        enrichment.suggestedTopics = surfaced.suggestedTopics;
      }
    }

    // 2. Get anticipated memories from predictive engine
    const anticipated = await getAnticipatedForUser(userId, undefined, 5);
    if (anticipated.memories) {
      enrichment.anticipated = anticipated.memories.map(m => ({
        memoryId: m.memoryId,
        content: m.content.slice(0, 150) + (m.content.length > 150 ? '...' : ''),
        score: m.anticipationScore,
        reasons: m.anticipationReasons,
      }));
    }

    // 3. Get urgent open loops (due within 7 days)
    const loops = await getOpenLoops(userId, { limit: 5 });
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    enrichment.urgentLoops = loops
      .filter((l: any) => {
        if (!l.dueDate) return l.isOverdue;
        const dueTime = new Date(l.dueDate).getTime();
        return (dueTime - now) < weekMs || dueTime < now;
      })
      .map((l: any) => {
        const dueDate = l.dueDate ? new Date(l.dueDate) : null;
        const daysUntil = dueDate
          ? Math.ceil((dueDate.getTime() - now) / (24 * 60 * 60 * 1000))
          : null;
        return {
          id: l.id || l._id?.toString(),
          description: l.description,
          dueIn: daysUntil !== null
            ? (daysUntil <= 0 ? 'overdue' : `${daysUntil}d`)
            : undefined,
          isOverdue: l.isOverdue || (daysUntil !== null && daysUntil <= 0),
        };
      });

    // 4. Get pattern stats
    const stats = await getPatternStats(userId);
    enrichment.patternStats = {
      totalPatterns: stats.totalPatterns,
      formedPatterns: stats.formedPatterns,
      readyForPrediction: stats.readyForPrediction,
    };

  } catch (error) {
    logger.warn('[MCP] Enrichment error (non-fatal):', error);
    // Continue with partial enrichment - don't fail the request
  }

  return enrichment;
}

/**
 * POST-TOOL HOOK: Record observation for pattern learning
 * Feeds the 21-day pattern formation system
 */
async function recordToolObservation(
  userId: string,
  toolName: string,
  memoriesAccessed: string[],
  topicsDiscussed: string[],
  peopleInvolved: string[]
): Promise<void> {
  try {
    // Get current time features for pattern learning
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    // Record context observation for pattern detection
    await observeContext(
      userId,
      {
        timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
        dayOfWeek: now.getDay(),
        activity: toolName,
        people: peopleInvolved,
      },
      memoriesAccessed,
      peopleInvolved,
      topicsDiscussed
    );
  } catch (error) {
    logger.warn('[MCP] Observation recording error (non-fatal):', error);
  }
}

/**
 * Wrap tool response with enrichment context
 * This is what Claude sees - the enriched response
 */
function wrapWithEnrichment(
  toolResponse: { content: Array<{ type: string; text: string }> },
  enrichment: PromptEnrichment,
  toolName: string
): { content: Array<{ type: string; text: string }> } {
  // Don't enrich certain tools that already have context
  const skipEnrichment = [
    'whats_relevant',
    'anticipate',
    'get_briefing',
    'day_outlook',
    'get_predictions',
  ];

  if (skipEnrichment.includes(toolName)) {
    return toolResponse;
  }

  // Only add enrichment if there's something useful
  const hasEnrichment =
    enrichment.anticipated.length > 0 ||
    enrichment.urgentLoops.length > 0 ||
    enrichment.suggestedTopics.length > 0;

  if (!hasEnrichment) {
    return toolResponse;
  }

  // Build enrichment block
  const enrichmentParts: string[] = [];

  if (enrichment.anticipated.length > 0) {
    enrichmentParts.push(`📍 Anticipated (pattern-matched):`);
    enrichment.anticipated.slice(0, 3).forEach(a => {
      enrichmentParts.push(`  • ${a.content} [${a.reasons.join(', ')}]`);
    });
  }

  if (enrichment.urgentLoops.length > 0) {
    enrichmentParts.push(`⚡ Open commitments:`);
    enrichment.urgentLoops.slice(0, 3).forEach(l => {
      const urgency = l.isOverdue ? '🔴 OVERDUE' : `⏰ ${l.dueIn}`;
      enrichmentParts.push(`  • ${l.description} ${urgency}`);
    });
  }

  if (enrichment.suggestedTopics.length > 0) {
    enrichmentParts.push(`💡 Suggested: ${enrichment.suggestedTopics.slice(0, 3).join(', ')}`);
  }

  // Append enrichment to response
  const enrichmentText = `\n\n---\n_MemoRable Context:_\n${enrichmentParts.join('\n')}`;

  // Clone and modify the response
  const enrichedContent = toolResponse.content.map((item, index) => {
    if (index === toolResponse.content.length - 1 && item.type === 'text') {
      return { ...item, text: item.text + enrichmentText };
    }
    return item;
  });

  return { content: enrichedContent };
}

// Track tool execution context for observation recording
interface ToolExecutionContext {
  memoriesAccessed: string[];
  topicsDiscussed: string[];
  peopleInvolved: string[];
}

// ============================================
// MEMORY ENCRYPTION (Tier2/Tier3 Security)
// ============================================
// Grandma's credit card NEVER stored in plaintext.
// Tier2_Personal and Tier3_Vault content is always encrypted.

const MEMORY_ENCRYPTION_KEY = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || 'changeme_memory_key';
const MEMORY_ENCRYPTION_VERSION = '1.0';

/**
 * Encrypt memory content for Tier2/Tier3 storage.
 * Uses AES-256-GCM with per-memory salt.
 */
function encryptMemoryContent(plaintext: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(MEMORY_ENCRYPTION_KEY, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: v1:salt:iv:authTag:encrypted (all hex)
  return `v1:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt memory content from Tier2/Tier3 storage.
 */
function decryptMemoryContent(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts[0] !== 'v1') {
    throw new Error(`Unsupported encryption version: ${parts[0]}`);
  }
  const [, saltHex, ivHex, authTagHex, encryptedHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const key = scryptSync(MEMORY_ENCRYPTION_KEY, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Check if memory content needs encryption based on security tier.
 */
function shouldEncryptMemory(tier: SecurityTier): boolean {
  return tier === 'Tier2_Personal' || tier === 'Tier3_Vault';
}

/**
 * Check if memory should skip vector storage (Weaviate) based on tier.
 * Tier3_Vault memories NEVER get vectorized - vectors reveal semantic meaning.
 */
function shouldSkipVectorStorage(tier: SecurityTier): boolean {
  return tier === 'Tier3_Vault';
}

// Database connection
let db: Db | null = null;
let mongoClient: MongoClient | null = null;

/**
 * Get the database instance. Throws if not initialized.
 * Used by direct-mode tool implementations that need MongoDB access.
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Are you in REST mode? This code path requires direct MongoDB.');
  }
  return db;
}

// ============================================
// BEHAVIORAL IDENTITY HELPER FUNCTIONS
// ============================================

interface BehavioralSignals {
  vocabulary: {
    avgWordLength: number;
    abbreviationRatio: number;
    uniqueWordRatio: number;
    jargonScore: number;
    // NEW: Proven stylometry features
    hapaxRatio: number;           // Words used only once (lexical uniqueness)
    typeTokenRatio: number;       // Vocabulary richness
    avgSyllables: number;         // Reading complexity
  };
  syntax: {
    avgSentenceLength: number;
    punctuationStyle: string;
    capitalizationRatio: number;
    questionRatio: number;
    // NEW: Enhanced syntactic features
    commaFrequency: number;       // Comma usage per sentence
    semicolonUsage: boolean;      // Uses semicolons
    ellipsisUsage: boolean;       // Uses ...
    exclamationRatio: number;     // Exclamation marks
    parentheticalRatio: number;   // (parentheses) usage
    clauseComplexity: number;     // Subordinate clause markers
  };
  timing: {
    hourOfDay: number;
    dayOfWeek: number;
  };
  topics: string[];
  style: {
    formalityScore: number;
    emojiUsage: number;
    politenessMarkers: number;
    // NEW: Enhanced style features
    contractionRatio: number;     // don't, can't, etc.
    numberStyle: string;          // 'numeric' vs 'written'
    listUsage: boolean;           // Uses bullet points or numbered lists
  };
  // NEW: Character n-grams (proven most effective for authorship)
  charNgrams: {
    top3grams: string[];          // Top 10 character trigrams
    ngramSignature: string;       // Hash of n-gram distribution
  };
  // NEW: Function words (classical stylometry)
  functionWords: {
    frequencies: Record<string, number>; // Frequency of each function word
    signature: string;            // Hash of function word distribution
  };
}

// ============================================
// PROVEN STYLOMETRY: Function Words List
// Based on authorship attribution research
// ============================================
const FUNCTION_WORDS = [
  // Articles
  'a', 'an', 'the',
  // Pronouns
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  'who', 'whom', 'whose', 'which', 'that',
  // Prepositions
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'also', 'as', 'than', 'when', 'while', 'although', 'because',
  'if', 'unless', 'until', 'whether',
  // Auxiliary verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did',
  'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must',
  // Determiners
  'this', 'that', 'these', 'those',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'any',
  // Adverbs (common)
  'very', 'really', 'just', 'still', 'already', 'even', 'also', 'too', 'quite', 'rather',
  'here', 'there', 'where', 'when', 'how', 'why',
  'now', 'then', 'always', 'never', 'often', 'sometimes',
];

/**
 * Count syllables in a word (approximate)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g) || [];
  let count = vowelGroups.length;

  // Subtract silent e
  if (word.endsWith('e') && count > 1) count--;
  // Subtract silent ed
  if (word.endsWith('ed') && count > 1) count--;

  return Math.max(1, count);
}

/**
 * Generate character n-grams from text
 */
function generateCharNgrams(text: string, n: number): Map<string, number> {
  const ngrams = new Map<string, number>();
  const cleaned = text.toLowerCase().replace(/[^a-z ]/g, '');

  for (let i = 0; i <= cleaned.length - n; i++) {
    const ngram = cleaned.slice(i, i + n);
    ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
  }

  return ngrams;
}

/**
 * Create a hash signature from a frequency distribution
 */
function createDistributionSignature(freqs: Record<string, number>): string {
  // Sort by frequency and take top 20
  const sorted = Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Create a simple hash from the sorted keys
  const sigString = sorted.map(([k, v]) => `${k}:${v.toFixed(2)}`).join('|');
  let hash = 0;
  for (let i = 0; i < sigString.length; i++) {
    const char = sigString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sig_${Math.abs(hash).toString(36)}`;
}

/**
 * Analyze behavioral signals from a message
 * Uses proven stylometry methods from authorship attribution research:
 * - Character n-grams (most effective per CNN research)
 * - Function word frequencies (classical stylometry)
 * - Lexical richness measures
 * - Syntactic complexity indicators
 */
function analyzeBehavioralSignals(message: string): BehavioralSignals {
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const now = new Date();

  // ============================================
  // VOCABULARY ANALYSIS (Enhanced with proven metrics)
  // ============================================
  const avgWordLength = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 0;

  const abbreviations = ['u', 'ur', 'thx', 'pls', 'btw', 'idk', 'imo', 'tbh', 'lol', 'omg', 'brb', 'afk', 'gg', 'np', 'ty', 'yw'];
  const abbrevCount = words.filter(w => abbreviations.includes(w)).length;
  const abbreviationRatio = words.length > 0 ? abbrevCount / words.length : 0;

  // Type-Token Ratio (vocabulary richness)
  const uniqueWords = new Set(words);
  const uniqueWordRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Hapax Legomena: words used exactly once (lexical uniqueness indicator)
  const wordCounts = new Map<string, number>();
  for (const w of words) {
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }
  const hapaxCount = Array.from(wordCounts.values()).filter(c => c === 1).length;
  const hapaxRatio = words.length > 0 ? hapaxCount / words.length : 0;

  // Average syllables per word (reading complexity)
  const avgSyllables = words.length > 0
    ? words.reduce((sum, w) => sum + countSyllables(w), 0) / words.length
    : 0;

  // ============================================
  // SYNTAX ANALYSIS (Enhanced with deeper features)
  // ============================================
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;

  const allPunctuation = message.match(/[.,!?;:'"()\-—]/g) || [];
  const punctuationStyle = allPunctuation.length > 10 ? 'heavy' :
                           allPunctuation.length > 4 ? 'moderate' : 'light';

  const upperCase = (message.match(/[A-Z]/g) || []).length;
  const lowerCase = (message.match(/[a-z]/g) || []).length;
  const capitalizationRatio = (upperCase + lowerCase) > 0 ? upperCase / (upperCase + lowerCase) : 0;

  const questions = (message.match(/\?/g) || []).length;
  const questionRatio = sentences.length > 0 ? questions / sentences.length : 0;

  // NEW: Enhanced punctuation analysis
  const commas = (message.match(/,/g) || []).length;
  const commaFrequency = sentences.length > 0 ? commas / sentences.length : 0;

  const semicolonUsage = message.includes(';');
  const ellipsisUsage = message.includes('...') || message.includes('…');

  const exclamations = (message.match(/!/g) || []).length;
  const exclamationRatio = sentences.length > 0 ? exclamations / sentences.length : 0;

  const parentheses = (message.match(/[()]/g) || []).length;
  const parentheticalRatio = words.length > 0 ? parentheses / words.length : 0;

  // Clause complexity: count subordinate clause markers
  const clauseMarkers = ['although', 'because', 'since', 'while', 'whereas', 'if', 'unless', 'until', 'when', 'whenever', 'where', 'wherever', 'whether', 'which', 'who', 'whom', 'whose', 'that'];
  const clauseCount = words.filter(w => clauseMarkers.includes(w)).length;
  const clauseComplexity = sentences.length > 0 ? clauseCount / sentences.length : 0;

  // ============================================
  // STYLE ANALYSIS (Enhanced)
  // ============================================
  const formalWords = ['please', 'thank', 'appreciate', 'kindly', 'would', 'could', 'shall', 'regarding', 'concerning', 'furthermore', 'however', 'therefore', 'consequently'];
  const formalCount = words.filter(w => formalWords.some(f => w.includes(f))).length;
  const formalityScore = words.length > 0 ? Math.min(1, formalCount / words.length * 10) : 0.5;

  const emojis = (message.match(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  const emojiUsage = emojis / Math.max(1, words.length);

  const politeWords = ['please', 'thanks', 'thank you', 'appreciate', 'sorry', 'excuse me', 'pardon'];
  const politeCount = politeWords.filter(p => message.toLowerCase().includes(p)).length;

  // NEW: Contraction usage (informal indicator)
  const contractions = ["n't", "'re", "'ve", "'ll", "'m", "'d", "'s"];
  const contractionCount = contractions.filter(c => message.toLowerCase().includes(c)).length;
  const contractionRatio = words.length > 0 ? contractionCount / words.length : 0;

  // NEW: Number style preference
  const writtenNumbers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const hasWrittenNumbers = words.some(w => writtenNumbers.includes(w));
  const hasNumericNumbers = /\d+/.test(message);
  const numberStyle = hasWrittenNumbers && !hasNumericNumbers ? 'written' :
                      hasNumericNumbers && !hasWrittenNumbers ? 'numeric' : 'mixed';

  // NEW: List usage
  const listUsage = /^[\-\*•]\s|^\d+[.)]\s/m.test(message);

  // ============================================
  // CHARACTER N-GRAMS (Most effective for authorship)
  // Research shows character 3-grams are highly discriminative
  // ============================================
  const charNgrams3 = generateCharNgrams(message, 3);
  const sortedNgrams = Array.from(charNgrams3.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ngram]) => ngram);

  // Create signature from full n-gram distribution
  const ngramFreqs: Record<string, number> = {};
  const totalNgrams = Array.from(charNgrams3.values()).reduce((a, b) => a + b, 0);
  for (const [ngram, count] of charNgrams3) {
    ngramFreqs[ngram] = count / totalNgrams;
  }
  const ngramSignature = createDistributionSignature(ngramFreqs);

  // ============================================
  // FUNCTION WORDS (Classical authorship attribution)
  // ============================================
  const functionWordFreqs: Record<string, number> = {};
  let functionWordTotal = 0;

  for (const fw of FUNCTION_WORDS) {
    const count = words.filter(w => w === fw).length;
    if (count > 0) {
      functionWordFreqs[fw] = count;
      functionWordTotal += count;
    }
  }

  // Normalize frequencies
  for (const fw of Object.keys(functionWordFreqs)) {
    functionWordFreqs[fw] = functionWordFreqs[fw] / (functionWordTotal || 1);
  }

  const functionWordSignature = createDistributionSignature(functionWordFreqs);

  // ============================================
  // TOPIC EXTRACTION
  // ============================================
  const stopWords = new Set(FUNCTION_WORDS);
  const topics = words
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);

  return {
    vocabulary: {
      avgWordLength,
      abbreviationRatio,
      uniqueWordRatio,
      jargonScore: abbreviationRatio * 0.5 + (1 - capitalizationRatio) * 0.5,
      hapaxRatio,
      typeTokenRatio: uniqueWordRatio,
      avgSyllables,
    },
    syntax: {
      avgSentenceLength,
      punctuationStyle,
      capitalizationRatio,
      questionRatio,
      commaFrequency,
      semicolonUsage,
      ellipsisUsage,
      exclamationRatio,
      parentheticalRatio,
      clauseComplexity,
    },
    timing: {
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    },
    topics,
    style: {
      formalityScore,
      emojiUsage,
      politenessMarkers: politeCount,
      contractionRatio,
      numberStyle,
      listUsage,
    },
    charNgrams: {
      top3grams: sortedNgrams,
      ngramSignature,
    },
    functionWords: {
      frequencies: functionWordFreqs,
      signature: functionWordSignature,
    },
  };
}

/**
 * Calculate cosine similarity between two frequency distributions
 */
function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of allKeys) {
    const valA = a[key] || 0;
    const valB = b[key] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Calculate Jaccard similarity between two string arrays
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate behavioral match score between signals and a fingerprint
 * Uses proven stylometry matching:
 * - Character n-gram cosine similarity (highest weight - most discriminative)
 * - Function word frequency matching
 * - Enhanced syntactic and lexical features
 */
function calculateBehavioralMatch(
  signals: BehavioralSignals,
  fingerprint: any
): { confidence: number; signals: Record<string, number> } {
  const fp = fingerprint.signals || {};
  const scores: Record<string, number> = {};

  // ============================================
  // CHARACTER N-GRAMS (Weight: 0.25 - Most discriminative)
  // Research shows this is the most effective single feature
  // ============================================
  if (fp.charNgrams?.top3grams && signals.charNgrams.top3grams.length > 0) {
    // Compare top n-grams using Jaccard similarity
    const ngramOverlap = jaccardSimilarity(
      signals.charNgrams.top3grams,
      fp.charNgrams.top3grams
    );
    // Signature match is a strong indicator
    const signatureMatch = signals.charNgrams.ngramSignature === fp.charNgrams.ngramSignature ? 1 : 0;
    scores.charNgrams = ngramOverlap * 0.7 + signatureMatch * 0.3;
  } else {
    scores.charNgrams = 0.5;
  }

  // ============================================
  // FUNCTION WORDS (Weight: 0.20 - Classical authorship)
  // ============================================
  if (fp.functionWords?.frequencies && Object.keys(signals.functionWords.frequencies).length > 0) {
    // Use cosine similarity for function word distributions
    const funcWordSim = cosineSimilarity(
      signals.functionWords.frequencies,
      fp.functionWords.frequencies
    );
    // Signature match boost
    const signatureMatch = signals.functionWords.signature === fp.functionWords.signature ? 0.2 : 0;
    scores.functionWords = Math.min(1, funcWordSim + signatureMatch);
  } else {
    scores.functionWords = 0.5;
  }

  // ============================================
  // VOCABULARY (Weight: 0.15)
  // Enhanced with hapax ratio and syllable count
  // ============================================
  if (fp.vocabulary) {
    const wordLengthDiff = Math.abs((signals.vocabulary.avgWordLength || 0) - (fp.vocabulary.avgWordLength || 0));
    const abbrevDiff = Math.abs((signals.vocabulary.abbreviationRatio || 0) - (fp.vocabulary.abbreviationRatio || 0));
    const hapaxDiff = Math.abs((signals.vocabulary.hapaxRatio || 0) - (fp.vocabulary.hapaxRatio || 0));
    const syllableDiff = Math.abs((signals.vocabulary.avgSyllables || 0) - (fp.vocabulary.avgSyllables || 0));
    const ttrDiff = Math.abs((signals.vocabulary.typeTokenRatio || 0) - (fp.vocabulary.typeTokenRatio || 0));

    // Normalize each difference and weight
    const vocabScore = 1 - (
      (wordLengthDiff / 5) * 0.2 +
      abbrevDiff * 0.2 +
      hapaxDiff * 0.2 +
      (syllableDiff / 2) * 0.2 +
      ttrDiff * 0.2
    );
    scores.vocabulary = Math.max(0, vocabScore);
  } else {
    scores.vocabulary = 0.5;
  }

  // ============================================
  // SYNTAX (Weight: 0.15)
  // Enhanced with detailed punctuation analysis
  // ============================================
  if (fp.syntax) {
    const sentLengthDiff = Math.abs((signals.syntax.avgSentenceLength || 0) - (fp.syntax.avgSentenceLength || 0));
    const capDiff = Math.abs((signals.syntax.capitalizationRatio || 0) - (fp.syntax.capitalizationRatio || 0));
    const commaDiff = Math.abs((signals.syntax.commaFrequency || 0) - (fp.syntax.commaFrequency || 0));
    const clauseDiff = Math.abs((signals.syntax.clauseComplexity || 0) - (fp.syntax.clauseComplexity || 0));

    // Boolean feature matches
    const semicolonMatch = signals.syntax.semicolonUsage === fp.syntax.semicolonUsage ? 1 : 0.5;
    const ellipsisMatch = signals.syntax.ellipsisUsage === fp.syntax.ellipsisUsage ? 1 : 0.5;
    const punctStyleMatch = signals.syntax.punctuationStyle === fp.syntax.punctuationStyle ? 1 : 0.5;

    const syntaxScore = (
      (1 - sentLengthDiff / 30) * 0.2 +
      (1 - capDiff) * 0.15 +
      (1 - commaDiff / 3) * 0.15 +
      (1 - clauseDiff) * 0.15 +
      semicolonMatch * 0.1 +
      ellipsisMatch * 0.1 +
      punctStyleMatch * 0.15
    );
    scores.syntax = Math.max(0, Math.min(1, syntaxScore));
  } else {
    scores.syntax = 0.5;
  }

  // ============================================
  // STYLE (Weight: 0.10)
  // ============================================
  if (fp.style) {
    const formalityDiff = Math.abs((signals.style.formalityScore || 0.5) - (fp.style.formalityScore || 0.5));
    const emojiMatch = (signals.style.emojiUsage > 0) === ((fp.style.emojiUsage || 0) > 0) ? 1 : 0.5;
    const contractionDiff = Math.abs((signals.style.contractionRatio || 0) - (fp.style.contractionRatio || 0));
    const numberStyleMatch = signals.style.numberStyle === fp.style.numberStyle ? 1 : 0.5;
    const listMatch = signals.style.listUsage === fp.style.listUsage ? 1 : 0.5;

    scores.style = (
      (1 - formalityDiff) * 0.3 +
      emojiMatch * 0.2 +
      (1 - contractionDiff) * 0.2 +
      numberStyleMatch * 0.15 +
      listMatch * 0.15
    );
  } else {
    scores.style = 0.5;
  }

  // ============================================
  // TIMING (Weight: 0.10)
  // ============================================
  if (fp.timing && fp.timing.activeHours) {
    const hourMatch = fp.timing.activeHours.includes(signals.timing.hourOfDay) ? 1 : 0.3;
    const dayMatch = fp.timing.activeDays?.includes(signals.timing.dayOfWeek) ? 1 : 0.5;
    scores.timing = (hourMatch + dayMatch) / 2;
  } else {
    scores.timing = 0.5;
  }

  // ============================================
  // TOPICS (Weight: 0.05)
  // Lower weight - topics can vary by conversation
  // ============================================
  if (fp.topics && fp.topics.length > 0) {
    scores.topics = jaccardSimilarity(signals.topics, fp.topics);
  } else {
    scores.topics = 0.5;
  }

  // ============================================
  // WEIGHTED AVERAGE
  // Weights based on authorship attribution research:
  // Character n-grams and function words are most discriminative
  // ============================================
  const weights = {
    charNgrams: 0.25,      // Most discriminative (proven by research)
    functionWords: 0.20,   // Classical stylometry gold standard
    vocabulary: 0.15,      // Lexical richness features
    syntax: 0.15,          // Syntactic complexity
    style: 0.10,           // Writing style indicators
    timing: 0.10,          // Behavioral timing patterns
    topics: 0.05,          // Topic preferences (less stable)
  };

  const confidence = Object.entries(scores).reduce(
    (sum, [key, value]) => sum + value * (weights[key as keyof typeof weights] || 0),
    0
  );

  return { confidence: Math.min(1, confidence), signals: scores };
}

/**
 * Hash a message for storage (privacy-preserving)
 */
function hashMessage(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}

/**
 * Generate ASCII progress bar
 */
function generateProgressBar(value: number, max: number, width: number): string {
  const percentage = Math.min(1, value / max);
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Generate ASCII histogram bar
 */
function generateHistogramBar(value: number, max: number, width: number): string {
  if (max === 0) return '░'.repeat(width);
  const percentage = value / max;
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Create an LLM client using the unified provider abstraction.
 * Supports Bedrock (AWS IAM), Anthropic, and OpenAI.
 * Provider is auto-detected from environment variables.
 */
function createLLMClient(): LLMClient | null {
  try {
    // The createLLMProvider function auto-detects the best provider:
    // - Bedrock if USE_BEDROCK=true or running in AWS (Lambda/ECS)
    // - Anthropic if ANTHROPIC_API_KEY is set
    // - OpenAI if OPENAI_API_KEY is set
    return createLLMProvider();
  } catch (error) {
    // No valid provider configured
    logger.error('[MCP] LLM provider initialization failed:', error);
    return null;
  }
}

let llmClient: LLMClient | null = null;

// Track which mode we're in: 'rest' (HTTP API) or 'direct' (MongoDB)
let connectionMode: 'rest' | 'direct' | null = null;
let apiClient: ApiClient | null = null;

/**
 * Initialize database connection.
 *
 * Two modes:
 * - REST MODE (API_BASE_URL set): Uses HTTP calls to remote API
 *   Simple, works anywhere, no VPN needed. The barebones approach.
 * - DIRECT MODE: Connects directly to MongoDB
 *   Used when running with local docker-compose or inside AWS VPC.
 */
async function initializeDb(): Promise<void> {
  if (connectionMode) return; // Already initialized

  // Check for REST mode (remote HTTP API)
  if (useRemoteApi()) {
    connectionMode = 'rest';
    apiClient = getApiClient();

    if (!apiClient) {
      throw new Error('API_BASE_URL set but failed to create API client');
    }

    // Non-blocking health check + auth: don't delay MCP server startup.
    // Auth will retry lazily on first tool use via ApiClient.request().
    apiClient.healthCheck().then(healthy => {
      if (!healthy) {
        logger.warn('[MCP] API health check failed - endpoint may be unreachable');
        logger.info('[MCP] Auth will be attempted on first tool use');
      } else {
        // Health OK — pre-auth in background (no await, non-blocking)
        apiClient!.authenticate().then(() => {
          logger.info('[MCP] REST mode: Authenticated successfully');
        }).catch((authErr: Error) => {
          logger.warn('[MCP] Pre-auth failed (will retry on first tool use):', authErr.message);
        });
      }
    }).catch(() => {
      logger.warn('[MCP] Health check failed - auth deferred to first tool use');
    });

    logger.info(`[MCP] REST mode: Using HTTP API at ${process.env.API_BASE_URL || process.env.MEMORABLE_API_URL}`);
    logger.info('[MCP] Skipping direct MongoDB/Redis connections');
    return;
  }

  // Direct mode: Connect to MongoDB
  connectionMode = 'direct';
  // Check if using DocumentDB (requires specific options)
  const isDocumentDB = CONFIG.mongoUri.includes('docdb.amazonaws.com') || CONFIG.mongoUri.includes('tls=true');
  mongoClient = new MongoClient(CONFIG.mongoUri, {
    ...(isDocumentDB ? {
      tlsAllowInvalidCertificates: true,
      authMechanism: 'SCRAM-SHA-1', // DocumentDB doesn't support SCRAM-SHA-256
      directConnection: true,
    } : {}),
    serverSelectionTimeoutMS: 5000, // Don't hang forever if MongoDB is down
    connectTimeoutMS: 5000,
  });

  try {
    await mongoClient.connect();
    db = mongoClient.db();
    logger.info('[MCP] MongoDB connected');
  } catch (mongoErr) {
    logger.error('[MCP] MongoDB connection failed — server will start but tools requiring DB will return errors');
    logger.info(`[MCP] MongoDB URI: ${CONFIG.mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    mongoClient = null;
    db = null as unknown as Db;
  }

  // SECURITY FIX: Initialize Redis for secure token storage
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisPassword = process.env.REDIS_PASSWORD;
  try {
    // Check if TLS is required (rediss:// or explicit env var)
    const useTls = redisUrl.startsWith('rediss://') || process.env.REDIS_TLS === 'true';
    redisClient = createClient({
      url: redisUrl,
      password: redisPassword,
      socket: {
        connectTimeout: 5000, // Don't hang forever if Redis is down
        reconnectStrategy: false, // Don't retry — fail fast, start degraded
        ...(useTls ? {
          tls: true,
          rejectUnauthorized: false, // AWS ElastiCache uses self-signed certs
        } : {}),
      },
    });
    redisClient.on('error', () => { /* Suppressed — handled by catch below */ });
    await redisClient.connect();
    logger.info('[MCP] Redis connected for secure token storage');
  } catch (err) {
    logger.error('[MCP] Redis connection failed, OAuth tokens will not persist');
    redisClient = null;
  }

  if (db) {
    try {
      await initializeSalienceService(db, { verbose: false });
      initAnticipationService(db);
      logger.info('[MCP] Direct mode: Database initialized');
    } catch (salienceErr) {
      logger.error('[MCP] Salience service initialization failed — continuing in degraded mode');
    }
  } else {
    logger.info('[MCP] Direct mode: No database — running in degraded mode (tools will return errors)');
  }
}

/**
 * Create the MCP server.
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'memorable',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // ============================================
  // TOOLS
  // ============================================

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'store_memory',
        description:
          'Store a memory with automatic salience scoring. Use this to remember important information, conversations, decisions, or commitments. Supports security tiers for sensitive data protection.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The memory content to store',
            },
            context: {
              type: 'object',
              description: 'Capture context for this memory. Auto-captures time/day, but location/activity/mood enhance recall.',
              properties: {
                location: { type: 'string', description: 'Where this happened (e.g., "office", "home", "coffee shop")' },
                activity: { type: 'string', description: 'What you were doing (e.g., "meeting", "coding", "dinner")' },
                mood: { type: 'string', description: 'How you felt (e.g., "stressed", "happy", "focused")' },
                people: { type: 'array', items: { type: 'string' }, description: 'Who was present' },
              },
            },
            deviceId: {
              type: 'string',
              description: 'Device ID that captured this memory (e.g., "betty_doll_001", "omi_glasses_alan")',
            },
            deviceType: {
              type: 'string',
              enum: ['mobile', 'desktop', 'web', 'api', 'mcp', 'wearable', 'smartglasses', 'smarthome', 'companion', 'pendant', 'robot', 'toy', 'vehicle', 'unknown'],
              description: 'Type of device. companion=dolls/robots, pendant=Buddi, smartglasses=Omi, toy=Omni corp gadgets',
            },
            deviceName: {
              type: 'string',
              description: 'Human-readable device name (e.g., "Betty\'s Companion", "Alan\'s Omi Glasses")',
            },
            useLLM: {
              type: 'boolean',
              description: 'Use LLM for richer feature extraction (default: true if available)',
            },
            securityTier: {
              type: 'string',
              enum: ['Tier1_General', 'Tier2_Personal', 'Tier3_Vault'],
              description: 'Security classification. Tier1=external LLM OK, Tier2=local LLM only (default), Tier3=no LLM, encrypted, no vectors. Use Tier3 for sensitive data like financial info, medical records, passwords.',
              default: 'Tier2_Personal',
            },
          },
          required: ['text'],
        },
        annotations: {
          title: 'Store Memory',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'recall',
        description:
          'Search and retrieve relevant memories. Returns memories ranked by salience and relevance to your query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'What to search for in memories',
            },
            limit: {
              type: 'number',
              description: 'Maximum memories to return (default: 10)',
            },
            person: {
              type: 'string',
              description: 'Filter to memories involving this person',
            },
            minSalience: {
              type: 'number',
              description: 'Minimum salience score 0-100 (default: 0)',
            },
          },
          required: ['query'],
        },
        annotations: {
          title: 'Recall Memories',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_briefing',
        description:
          'Get a pre-conversation briefing about a person. Includes what you owe them, what they owe you, upcoming events, and sensitivities.',
        inputSchema: {
          type: 'object',
          properties: {
            person: {
              type: 'string',
              description: 'Name of the person to get briefing for',
            },
            quick: {
              type: 'boolean',
              description: 'Quick briefing (just key points) vs full briefing',
            },
          },
          required: ['person'],
        },
        annotations: {
          title: 'Get Briefing',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'list_loops',
        description:
          'List open commitments, follow-ups, and things you owe people (or they owe you).',
        inputSchema: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              enum: ['self', 'them', 'mutual'],
              description: 'Filter by who owns the action (self=you owe, them=they owe, mutual=shared)',
            },
            person: {
              type: 'string',
              description: 'Filter to loops involving this person',
            },
            includeOverdue: {
              type: 'boolean',
              description: 'Include overdue items (default: true)',
            },
          },
        },
        annotations: {
          title: 'List Open Loops',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'close_loop',
        description: 'Mark a commitment or follow-up as completed.',
        inputSchema: {
          type: 'object',
          properties: {
            loopId: {
              type: 'string',
              description: 'ID of the loop to close',
            },
            note: {
              type: 'string',
              description: 'Optional completion note',
            },
          },
          required: ['loopId'],
        },
        annotations: {
          title: 'Close Loop',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_status',
        description: 'Get memory system status including open loops, relationships, and learned patterns.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Get Status',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // Context Frame Tools (Multi-Device Aware)
      {
        name: 'set_context',
        description:
          'Set your current context (where you are, who you\'re with). Automatically surfaces relevant memories. Example: "I\'m at the park meeting Judy". Supports multi-device: each device maintains its own context stream.',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'Where you are (park, office, coffee shop)',
            },
            people: {
              type: 'array',
              items: { type: 'string' },
              description: 'Who you\'re with or about to meet',
            },
            activity: {
              type: 'string',
              description: 'What you\'re doing (meeting, working, relaxing)',
            },
            deviceId: {
              type: 'string',
              description: 'Unique device identifier (auto-generated if not provided). Use the same ID for consistent device tracking.',
            },
            deviceType: {
              type: 'string',
              enum: ['mobile', 'desktop', 'web', 'api', 'mcp'],
              description: 'Type of device setting context (helps with context resolution - mobile wins for location)',
            },
          },
        },
        annotations: {
          title: 'Set Context',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'whats_relevant',
        description: 'Get what\'s relevant right now based on your current context. Can query device-specific or unified context.',
        inputSchema: {
          type: 'object',
          properties: {
            deviceId: {
              type: 'string',
              description: 'Query context for a specific device. Omit to get unified context across all devices.',
            },
            unified: {
              type: 'boolean',
              description: 'If true, returns context fused from all active devices (brain-inspired integration).',
            },
          },
        },
        annotations: {
          title: "What's Relevant",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'clear_context',
        description: 'Clear your current context (e.g., when leaving a location or ending a meeting).',
        inputSchema: {
          type: 'object',
          properties: {
            dimensions: {
              type: 'array',
              items: { type: 'string', enum: ['location', 'people', 'activity', 'calendar', 'mood'] },
              description: 'Which dimensions to clear (default: all)',
            },
            deviceId: {
              type: 'string',
              description: 'Clear context for a specific device. Omit to clear user-level context.',
            },
          },
        },
        annotations: {
          title: 'Clear Context',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'list_devices',
        description: 'List all active devices and their context status for the current user.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'List Devices',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // Cross-Device Continuity Tools
      {
        name: 'handoff_device',
        description: 'Seamlessly transfer context from one device to another. Use when switching devices - context, conversation topics, and active memories follow the user. "AI that knows you like a friend, every time you talk to it."',
        inputSchema: {
          type: 'object',
          properties: {
            sourceDeviceId: {
              type: 'string',
              description: 'Device ID to transfer context FROM. Use list_devices to see active devices.',
            },
            targetDeviceId: {
              type: 'string',
              description: 'Device ID to transfer context TO. Omit to create a pending handoff that the next connecting device can claim.',
            },
            targetDeviceType: {
              type: 'string',
              enum: ['mobile', 'desktop', 'web', 'api', 'mcp', 'wearable', 'smartglasses', 'smarthome', 'companion', 'pendant', 'robot', 'toy', 'vehicle'],
              description: 'Type of the target device (helps with context adaptation)',
            },
            reason: {
              type: 'string',
              enum: ['user_initiated', 'device_switch', 'timeout', 'predicted'],
              description: 'Why the handoff is happening (default: user_initiated)',
            },
          },
          required: ['sourceDeviceId'],
        },
        annotations: {
          title: 'Handoff Device',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'get_session_continuity',
        description: 'Get cross-device session state. Shows what\'s happening on all devices, pending handoffs, and generates a continuity briefing. Call this when connecting to get caught up on context from other devices.',
        inputSchema: {
          type: 'object',
          properties: {
            deviceId: {
              type: 'string',
              description: 'This device\'s ID. If provided, claims any pending handoff and generates a personalized briefing.',
            },
            deviceType: {
              type: 'string',
              enum: ['mobile', 'desktop', 'web', 'api', 'mcp', 'wearable', 'smartglasses', 'smarthome', 'companion', 'pendant', 'robot', 'toy', 'vehicle'],
              description: 'This device\'s type',
            },
          },
        },
        annotations: {
          title: 'Session Continuity',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // Memory Management Tools
      {
        name: 'forget',
        description: 'Forget a memory. Modes: suppress (hide but keep), archive (hide from default), delete (remove after 30 days).',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: {
              type: 'string',
              description: 'ID of memory to forget',
            },
            mode: {
              type: 'string',
              enum: ['suppress', 'archive', 'delete'],
              description: 'How to forget (default: suppress)',
            },
            reason: {
              type: 'string',
              description: 'Why you want to forget this',
            },
          },
          required: ['memoryId'],
        },
        annotations: {
          title: 'Forget Memory',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'forget_person',
        description: 'Forget all memories involving a specific person.',
        inputSchema: {
          type: 'object',
          properties: {
            person: {
              type: 'string',
              description: 'Name of person to forget',
            },
            mode: {
              type: 'string',
              enum: ['suppress', 'archive', 'delete'],
              description: 'How to forget (default: suppress)',
            },
            alsoForgetLoops: {
              type: 'boolean',
              description: 'Also forget open commitments with this person',
            },
            alsoForgetEvents: {
              type: 'boolean',
              description: 'Also forget timeline events for this person',
            },
          },
          required: ['person'],
        },
        annotations: {
          title: 'Forget Person',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'restore',
        description: 'Restore a forgotten memory.',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: {
              type: 'string',
              description: 'ID of memory to restore',
            },
          },
          required: ['memoryId'],
        },
        annotations: {
          title: 'Restore Memory',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'reassociate',
        description: 'Change how a memory is linked - add/remove people, topics, or tags.',
        inputSchema: {
          type: 'object',
          properties: {
            memoryId: {
              type: 'string',
              description: 'ID of memory to reassociate',
            },
            addPeople: {
              type: 'array',
              items: { type: 'string' },
              description: 'People to add to this memory',
            },
            removePeople: {
              type: 'array',
              items: { type: 'string' },
              description: 'People to remove from this memory',
            },
            addTopics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topics to add',
            },
            removeTopics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topics to remove',
            },
            addTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to add',
            },
            removeTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to remove',
            },
            setProject: {
              type: 'string',
              description: 'Project to assign this memory to',
            },
          },
          required: ['memoryId'],
        },
        annotations: {
          title: 'Reassociate Memory',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'export_memories',
        description: 'Export memories for backup or portability. SECURITY: Use password for encrypted export.',
        inputSchema: {
          type: 'object',
          properties: {
            people: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter to memories involving these people',
            },
            topics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter to memories about these topics',
            },
            project: {
              type: 'string',
              description: 'Filter to memories in this project',
            },
            fromDate: {
              type: 'string',
              description: 'Start date (ISO8601)',
            },
            toDate: {
              type: 'string',
              description: 'End date (ISO8601)',
            },
            includeLoops: {
              type: 'boolean',
              description: 'Include related open loops',
            },
            includeTimeline: {
              type: 'boolean',
              description: 'Include related timeline events',
            },
            password: {
              type: 'string',
              description: 'SECURITY: Password to encrypt export (strongly recommended)',
            },
          },
        },
        annotations: {
          title: 'Export Memories',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'import_memories',
        description: 'Import memories from an export file or mem0. Supports encrypted imports. Tracks imports for undo capability.',
        inputSchema: {
          type: 'object',
          properties: {
            memories: {
              type: 'array',
              description: 'Array of memory objects to import',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Original memory ID' },
                  text: { type: 'string', description: 'Memory content' },
                  createdAt: { type: 'string', description: 'Original creation date (ISO8601)' },
                  salienceScore: { type: 'number', description: 'Original salience score' },
                  people: { type: 'array', items: { type: 'string' }, description: 'People mentioned' },
                  topics: { type: 'array', items: { type: 'string' }, description: 'Topics' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
                  project: { type: 'string', description: 'Project name' },
                  loops: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: { type: 'string' },
                        owner: { type: 'string' },
                        status: { type: 'string' },
                        dueDate: { type: 'string' },
                      },
                    },
                  },
                },
                required: ['text'],
              },
            },
            encryptedData: {
              type: 'string',
              description: 'Encrypted export data (from export_memories with password)',
            },
            password: {
              type: 'string',
              description: 'Password to decrypt encrypted export',
            },
            idPrefix: {
              type: 'string',
              description: 'Prefix to add to imported memory IDs',
            },
            targetProject: {
              type: 'string',
              description: 'Project to assign imported memories to',
            },
            skipDuplicates: {
              type: 'boolean',
              description: 'Skip duplicates based on text similarity (default: true)',
            },
            source: {
              type: 'string',
              enum: ['mem0', 'file', 'api'],
              description: 'Source of import (default: api)',
            },
          },
        },
        annotations: {
          title: 'Import Memories',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      // Anticipation Tools (Predictive Memory)
      {
        name: 'anticipate',
        description:
          'Get predicted context and pre-surfaced memories based on calendar and learned patterns. The magic: surfaces what you need BEFORE you ask. Requires 21 days of usage to form reliable patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            calendar: {
              type: 'array',
              description: 'Upcoming calendar events (optional - enhances predictions)',
              items: {
                type: 'object',
                properties: {
                  eventId: { type: 'string' },
                  title: { type: 'string' },
                  startTime: { type: 'string', description: 'ISO8601 datetime' },
                  endTime: { type: 'string', description: 'ISO8601 datetime' },
                  attendees: { type: 'array', items: { type: 'string' } },
                  location: { type: 'string' },
                  recurring: { type: 'boolean' },
                },
                required: ['title', 'startTime'],
              },
            },
            lookAheadMinutes: {
              type: 'number',
              description: 'How far ahead to look (default: 60 minutes)',
            },
          },
        },
        annotations: {
          title: 'Anticipate',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'day_outlook',
        description:
          'Get a predictive outlook for the day based on calendar and learned behavior patterns. Best used in the morning.',
        inputSchema: {
          type: 'object',
          properties: {
            calendar: {
              type: 'array',
              description: 'Today\'s calendar events',
              items: {
                type: 'object',
                properties: {
                  eventId: { type: 'string' },
                  title: { type: 'string' },
                  startTime: { type: 'string' },
                  endTime: { type: 'string' },
                  attendees: { type: 'array', items: { type: 'string' } },
                  location: { type: 'string' },
                  recurring: { type: 'boolean' },
                },
                required: ['title', 'startTime'],
              },
            },
          },
        },
        annotations: {
          title: 'Day Outlook',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'pattern_stats',
        description:
          'Get statistics about learned patterns. Shows how much data has been collected and whether predictions are ready.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Pattern Stats',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'memory_feedback',
        description:
          'Tell the system whether a surfaced memory was useful. Improves future predictions via reinforcement learning.',
        inputSchema: {
          type: 'object',
          properties: {
            patternId: {
              type: 'string',
              description: 'ID of the pattern that surfaced the memory',
            },
            memoryId: {
              type: 'string',
              description: 'ID of the memory (optional)',
            },
            action: {
              type: 'string',
              enum: ['used', 'ignored', 'dismissed'],
              description: 'What you did with the surfaced memory',
            },
          },
          required: ['patternId', 'action'],
        },
        annotations: {
          title: 'Memory Feedback',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      // Behavioral Identity Tools
      {
        name: 'identify_user',
        description:
          'Analyze a message to identify the user by behavioral patterns. Returns confidence score and matching signals.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to analyze for behavioral fingerprinting',
            },
            candidateUsers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of user IDs to match against (faster than full scan)',
            },
          },
          required: ['message'],
        },
        annotations: {
          title: 'Identify User',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'behavioral_metrics',
        description:
          'Get behavioral identity metrics dashboard. Shows learning progress, hit/miss rates, signal strengths, and confidence distributions with ASCII visualizations.',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'Get metrics for a specific user (optional, defaults to all users)',
            },
            timeRange: {
              type: 'string',
              enum: ['1h', '24h', '7d', '30d', 'all'],
              description: 'Time range for metrics (default: 24h)',
            },
            includeGraph: {
              type: 'boolean',
              description: 'Include ASCII graphs in output (default: true)',
            },
          },
        },
        annotations: {
          title: 'Behavioral Metrics',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'behavioral_feedback',
        description:
          'Provide feedback on behavioral identification. Improves future recognition accuracy.',
        inputSchema: {
          type: 'object',
          properties: {
            predictionId: {
              type: 'string',
              description: 'ID of the prediction to provide feedback on',
            },
            correct: {
              type: 'boolean',
              description: 'Was the identification correct?',
            },
            actualUserId: {
              type: 'string',
              description: 'The actual user ID (if identification was wrong)',
            },
          },
          required: ['predictionId', 'correct'],
        },
        annotations: {
          title: 'Behavioral Feedback',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      // ============================================
      // PREDICTIVE MEMORY SYSTEM TOOLS (3×7 Model)
      // ============================================
      {
        name: 'get_anticipated_context',
        description:
          'Get predictively relevant memories for the current context. Call at conversation start for proactive memory surfacing. Uses 63-day pattern learning.',
        inputSchema: {
          type: 'object',
          properties: {
            context_frame: {
              type: 'object',
              description: 'Current context to match against memory patterns',
              properties: {
                location: { type: 'string', description: 'Current location' },
                people: { type: 'array', items: { type: 'string' }, description: 'People involved' },
                activity: { type: 'string', description: 'Current activity' },
                project: { type: 'string', description: 'Current project or workspace' },
              },
            },
            max_memories: {
              type: 'integer',
              description: 'Maximum memories to return (default: 5)',
              default: 5,
            },
          },
        },
        annotations: {
          title: 'Get Anticipated Context',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'search_memories',
        description:
          'Semantic search across memories with filtering by tags, importance, and temporal patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'integer', description: 'Maximum results (default: 10)', default: 10 },
            filters: {
              type: 'object',
              properties: {
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
                min_importance: { type: 'number', description: 'Minimum importance score (0.0-1.0)' },
                pattern_type: {
                  type: 'string',
                  enum: ['daily', 'weekly', 'tri_weekly', 'monthly'],
                  description: 'Filter by detected temporal pattern',
                },
              },
            },
          },
          required: ['query'],
        },
        annotations: {
          title: 'Search Memories',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'resolve_open_loop',
        description:
          'Mark a commitment, question, or follow-up as resolved.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'string', description: 'Memory ID containing the open loop' },
            resolution_note: { type: 'string', description: 'Note about how it was resolved' },
          },
          required: ['memory_id'],
        },
        annotations: {
          title: 'Resolve Open Loop',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_pattern_stats',
        description:
          'Get statistics about learned temporal patterns. Shows pattern formation progress (21-day learning, 63-day stability).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Get Pattern Stats',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_tier_stats',
        description:
          'Get memory tier statistics (hot/warm/cold distribution). Shows how memories are cached across the Zipfian hierarchy.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Get Tier Stats',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // ============================================
      // PROSODY & EMOTION TOOLS
      // ============================================
      {
        name: 'analyze_emotion',
        description:
          'Analyze emotional content of text or retrieve emotional context for a memory. Returns detected emotions with confidence scores.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to analyze for emotional content',
            },
            memory_id: {
              type: 'string',
              description: 'Existing memory ID to get emotion data for',
            },
          },
        },
        annotations: {
          title: 'Analyze Emotion',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_emotional_context',
        description:
          'Get the current emotional context from all active input streams (voice prosody, video, EVI). Returns fused multi-modal emotion state.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Optional session ID to get context for (defaults to current)',
            },
          },
        },
        annotations: {
          title: 'Get Emotional Context',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'start_emotional_session',
        description:
          'Start a multi-modal emotional tracking session for a device or person. Enables real-time emotion detection from video, voice prosody, and/or EVI. Two-way gauge: tracks both device state and human emotional state.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Unique session ID (e.g., "device_betty_doll_001" or "person_adriana")',
            },
            entity_id: {
              type: 'string',
              description: 'Entity ID being tracked (device or person)',
            },
            use_video: {
              type: 'boolean',
              description: 'Enable video/facial emotion detection',
              default: false,
            },
            use_voice: {
              type: 'boolean',
              description: 'Enable voice prosody analysis',
              default: true,
            },
            use_evi: {
              type: 'boolean',
              description: 'Enable Hume EVI integration',
              default: false,
            },
            buffer_size: {
              type: 'number',
              description: 'Number of emotion samples to buffer before fusion (default: 5)',
              default: 5,
            },
          },
          required: ['session_id'],
        },
        annotations: {
          title: 'Start Emotional Session',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      {
        name: 'stop_emotional_session',
        description:
          'Stop a multi-modal emotional tracking session. Processes any remaining buffered emotions and cleans up resources.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Session ID to stop',
            },
          },
          required: ['session_id'],
        },
        annotations: {
          title: 'Stop Emotional Session',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'list_emotional_sessions',
        description:
          'List all active emotional tracking sessions. Shows devices and people being tracked.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'List Emotional Sessions',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'set_emotion_filter',
        description:
          'Configure emotion-based content filtering. Memories matching filter criteria will be flagged, suppressed, or blocked at ingest time.',
        inputSchema: {
          type: 'object',
          properties: {
            emotions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Emotions to filter (e.g., ["anger", "disgust", "contempt"])',
            },
            threshold: {
              type: 'number',
              description: 'Confidence threshold (0.0-1.0) to trigger filter (default: 0.7)',
              default: 0.7,
            },
            action: {
              type: 'string',
              enum: ['flag', 'suppress', 'block', 'notify'],
              description: 'Action to take when filter triggers',
            },
            enabled: {
              type: 'boolean',
              description: 'Enable or disable this filter',
              default: true,
            },
          },
          required: ['emotions', 'action'],
        },
        annotations: {
          title: 'Set Emotion Filter',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_emotion_filters',
        description:
          'Get currently configured emotion filters for this user.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Get Emotion Filters',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_memories_by_emotion',
        description:
          'Search memories by emotional content. Queries extractedFeatures.emotionalKeywords from salience pipeline.',
        inputSchema: {
          type: 'object',
          properties: {
            emotions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Emotion keywords to search for (e.g., ["love", "angry", "worried", "excited"])',
            },
            min_intensity: {
              type: 'number',
              description: 'Minimum sentiment intensity (0.0-1.0)',
              default: 0.3,
            },
            limit: {
              type: 'integer',
              description: 'Maximum results (default: 10)',
              default: 10,
            },
            exclude_suppressed: {
              type: 'boolean',
              description: 'Exclude suppressed memories',
              default: true,
            },
          },
          required: ['emotions'],
        },
        annotations: {
          title: 'Get Memories by Emotion',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'correct_emotion',
        description:
          'Correct or override the emotional tagging on a memory. Use when automated detection got it wrong - sarcasm tagged as anger, playful banter as contempt, etc. Preserves original for audit trail.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID to correct',
            },
            corrected_emotions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Emotion name' },
                  confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
                },
              },
              description: 'Corrected emotion tags',
            },
            reason: {
              type: 'string',
              description: 'Why the correction was made (e.g., "was sarcasm not anger")',
            },
            clear_all: {
              type: 'boolean',
              description: 'Clear all emotion tags (set to neutral)',
              default: false,
            },
          },
          required: ['memory_id'],
        },
        annotations: {
          title: 'Correct Emotion Tags',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'clarify_intent',
        description:
          'Annotate a memory with what was actually meant vs what was said. Humans often can\'t say what they mean - "I\'m fine" when hurt, deflecting with jokes, stumbling over big feelings. This creates a layer of truth beneath the words.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: {
              type: 'string',
              description: 'Memory ID to annotate',
            },
            what_i_said: {
              type: 'string',
              description: 'What was actually said/recorded (optional, for context)',
            },
            what_i_meant: {
              type: 'string',
              description: 'The truth beneath the words - what was actually meant',
            },
            why_the_gap: {
              type: 'string',
              description: 'Why couldn\'t you say it? (e.g., "conflict avoidance", "protecting feelings", "couldn\'t find words")',
            },
            pattern: {
              type: 'string',
              description: 'Is this a recurring pattern? (e.g., "I always deflect when vulnerable")',
            },
            visibility: {
              type: 'string',
              enum: ['private', 'therapist', 'trusted', 'open'],
              description: 'Who can see this clarification? Default: private (only you)',
              default: 'private',
            },
          },
          required: ['memory_id', 'what_i_meant'],
        },
        annotations: {
          title: 'Clarify Intent',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // ========================================================================
      // RELATIONSHIP INTELLIGENCE TOOLS
      // Computed relationships, pressure tracking, prediction hooks
      // ========================================================================
      {
        name: 'get_relationship',
        description:
          'Synthesize the relationship between two entities based on their shared memories. Does NOT use stored graph edges - computes relationship on-demand from evidence. Relationships evolve as memories accumulate.',
        inputSchema: {
          type: 'object',
          properties: {
            entity_a: {
              type: 'string',
              description: 'First entity ID or name',
            },
            entity_b: {
              type: 'string',
              description: 'Second entity ID or name',
            },
            context: {
              type: 'string',
              description: 'Optional context to focus synthesis (e.g., "regarding work", "regarding trust")',
            },
            force_refresh: {
              type: 'boolean',
              description: 'Ignore cached synthesis and recompute',
              default: false,
            },
          },
          required: ['entity_a', 'entity_b'],
        },
        annotations: {
          title: 'Get Relationship Synthesis',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_entity_pressure',
        description:
          'Get pressure tracking for an entity. Tracks emotional pressure received and transmitted - the butterfly effect. High pressure + transmission = potential cascade. Surfaces to care circle when concerning.',
        inputSchema: {
          type: 'object',
          properties: {
            entity_id: {
              type: 'string',
              description: 'Entity ID to check pressure for',
            },
            include_vectors: {
              type: 'boolean',
              description: 'Include detailed pressure vectors (incoming/outgoing)',
              default: false,
            },
            days: {
              type: 'integer',
              description: 'Only include vectors from last N days',
              default: 30,
            },
          },
          required: ['entity_id'],
        },
        annotations: {
          title: 'Get Entity Pressure',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_predictions',
        description:
          'Get memories that should be surfaced NOW based on current context. This is the north star - memories appear before you know you need them. Pass current context, get relevant memories proactively.',
        inputSchema: {
          type: 'object',
          properties: {
            context: {
              type: 'object',
              description: 'Current context frame',
              properties: {
                talking_to: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Entity IDs currently interacting with',
                },
                location: { type: 'string', description: 'Current location' },
                location_type: { type: 'string', description: 'Type: home, work, transit, etc.' },
                activity: { type: 'string', description: 'What you are doing' },
                activity_type: { type: 'string', description: 'Type: meeting, coding, cooking, etc.' },
                topics: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Current conversation topics',
                },
                emotional_state: { type: 'string', description: 'Detected emotion' },
                device_type: { type: 'string', description: 'Device providing context' },
              },
            },
            max_results: {
              type: 'integer',
              description: 'Maximum memories to surface (default: 3)',
              default: 3,
            },
          },
          required: ['context'],
        },
        annotations: {
          title: 'Get Predicted Memories',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'record_prediction_feedback',
        description:
          'Record feedback on a surfaced memory prediction. Was it useful? Did you act on it? This teaches the system what predictions are valuable.',
        inputSchema: {
          type: 'object',
          properties: {
            hook_id: {
              type: 'string',
              description: 'The prediction hook ID that fired',
            },
            interaction: {
              type: 'string',
              enum: ['dismissed', 'viewed', 'acted_on', 'saved', 'blocked'],
              description: 'How you interacted with the prediction',
            },
            context: {
              type: 'string',
              description: 'Optional context about why (helpful for learning)',
            },
          },
          required: ['hook_id', 'interaction'],
        },
        annotations: {
          title: 'Record Prediction Feedback',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'recall_vote',
        description:
          'Vote on recalled memories to refine future recall. Temperature-based: hot (exactly right), warm (getting closer), cold (not what I meant), wrong (actively misleading), spark (triggered a new thought). Adjusts salience scores for context-aware learning.',
        inputSchema: {
          type: 'object',
          properties: {
            votes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  memoryId: {
                    type: 'string',
                    description: 'ID of the memory being voted on',
                  },
                  vote: {
                    type: 'string',
                    enum: ['hot', 'warm', 'cold', 'wrong', 'spark'],
                    description: 'Temperature vote: hot=exact match, warm=close, cold=off, wrong=misleading, spark=lateral trigger',
                  },
                },
                required: ['memoryId', 'vote'],
              },
              description: 'Array of votes on recalled memories',
            },
            query_context: {
              type: 'string',
              description: 'The original query that produced these results (for association learning)',
            },
          },
          required: ['votes'],
        },
        annotations: {
          title: 'Recall Vote',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'set_care_circle',
        description:
          'Set the care circle for an entity - people who should be alerted if pressure becomes concerning. For Betty, this might be her daughter and doctor.',
        inputSchema: {
          type: 'object',
          properties: {
            entity_id: {
              type: 'string',
              description: 'Entity to set care circle for',
            },
            care_circle: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entity IDs of caregivers/trusted people',
            },
            alert_threshold: {
              type: 'string',
              enum: ['monitor', 'concern', 'urgent'],
              description: 'When to alert care circle (default: concern)',
              default: 'concern',
            },
          },
          required: ['entity_id', 'care_circle'],
        },
        annotations: {
          title: 'Set Care Circle',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // ============================================
      // EVENT DAEMON TOOLS - Real-time Guardian
      // ============================================
      {
        name: 'ingest_event',
        description:
          'Submit an external event to the daemon for real-time processing. Events trigger predictions, scam detection, and guardian actions. Phone rings, doorbells, emails, sensors - the daemon evaluates and acts.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['phone_ring', 'phone_call_content', 'doorbell', 'email_received', 'calendar_reminder', 'time_trigger', 'sensor_alert', 'device_input', 'silence_detected', 'location_change', 'market_data', 'custom_webhook'],
              description: 'Type of external event',
            },
            entity_id: {
              type: 'string',
              description: 'Who this event is about (e.g., "betty")',
            },
            device_id: {
              type: 'string',
              description: 'Which device detected the event',
            },
            payload: {
              type: 'object',
              description: 'Event-specific data',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata (caller_id, transcript, keywords, etc.)',
              properties: {
                caller_id: { type: 'string' },
                caller_name: { type: 'string' },
                caller_number: { type: 'string' },
                transcript: { type: 'string', description: 'For phone_call_content - real-time transcript' },
                keywords: { type: 'array', items: { type: 'string' } },
                location: { type: 'string' },
              },
            },
          },
          required: ['type', 'entity_id'],
        },
        annotations: {
          title: 'Ingest External Event',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      {
        name: 'schedule_check',
        description:
          'Schedule a future check for an entity. Use for meal reminders, medication schedules, check-ins. The daemon will fire a time_trigger event when due.',
        inputSchema: {
          type: 'object',
          properties: {
            entity_id: {
              type: 'string',
              description: 'Entity to check on',
            },
            check_type: {
              type: 'string',
              enum: ['meal_reminder', 'medication_reminder', 'check_in', 'custom'],
              description: 'Type of scheduled check',
            },
            delay_minutes: {
              type: 'number',
              description: 'Minutes from now to trigger the check',
            },
            message: {
              type: 'string',
              description: 'Message to deliver when check fires',
            },
          },
          required: ['entity_id', 'check_type', 'delay_minutes'],
        },
        annotations: {
          title: 'Schedule Check',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'get_daemon_status',
        description:
          'Get event daemon status including queue length, scheduled checks, and running state.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          title: 'Get Daemon Status',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'set_entity_vulnerability',
        description:
          'Set vulnerability level for an entity. High vulnerability entities get extra protection (scam interception, silence monitoring, care circle alerts).',
        inputSchema: {
          type: 'object',
          properties: {
            entity_id: {
              type: 'string',
              description: 'Entity to configure',
            },
            vulnerability: {
              type: 'string',
              enum: ['normal', 'moderate', 'high'],
              description: 'Vulnerability level. High = Alzheimer\'s, elderly, at-risk',
            },
            notes: {
              type: 'string',
              description: 'Context about why this level (e.g., "Alzheimer\'s diagnosis 2024")',
            },
          },
          required: ['entity_id', 'vulnerability'],
        },
        annotations: {
          title: 'Set Entity Vulnerability',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // ============================================
      // DEV ONLY - Remove before production
      // ============================================
      {
        name: 'dev_clear_collection',
        description:
          'DEV ONLY: Clear a collection for testing. Allowed: open_loops, patterns, context_frames. REMOVE BEFORE PRODUCTION.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: {
              type: 'string',
              enum: ['open_loops', 'patterns', 'context_frames'],
              description: 'Collection to clear',
            },
            confirm: {
              type: 'boolean',
              description: 'Must be true to confirm destructive action',
            },
          },
          required: ['collection', 'confirm'],
        },
        annotations: {
          title: 'DEV: Clear Collection',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await initializeDb();
    const { name, arguments: args } = request.params;

    // ================================================================
    // PRE-PROMPT HOOK: Enrich context from Redis rolling window
    // ================================================================
    const enrichment = await enrichPromptContext(CONFIG.defaultUserId);

    // Track what this tool execution accesses (for pattern learning)
    const execContext: ToolExecutionContext = {
      memoriesAccessed: [],
      topicsDiscussed: [],
      peopleInvolved: [],
    };

    // Helper to execute tool and capture result
    async function executeToolCall(): Promise<{ content: Array<{ type: string; text: string }> }> {
      switch (name) {
        case 'store_memory': {
          const {
            text,
            context,
            deviceId,
            deviceType,
            deviceName,
            useLLM = true,
            securityTier = 'Tier2_Personal'
          } = args as {
            text: string;
            context?: { location?: string; activity?: string; mood?: string; people?: string[] };
            deviceId?: string;
            deviceType?: string;
            deviceName?: string;
            useLLM?: boolean;
            securityTier?: SecurityTier;
          };

          // FOUNDATION MODE: Route to HTTP API instead of direct DB
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.storeMemory(text, {
                entities: context?.people,
                context,
                securityTier,
                deviceId,
                deviceName,
                deviceType,
                useLLM,
              });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    stored: true,
                    memoryId: result.id,
                    mode: 'rest',
                    ...result,
                  }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode store failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // DIRECT MODE: Continue with local MongoDB operations
          // Validate security tier
          const validTiers: SecurityTier[] = ['Tier1_General', 'Tier2_Personal', 'Tier3_Vault'];
          const tier = validTiers.includes(securityTier) ? securityTier : 'Tier2_Personal';

          const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = new Date().toISOString();

          const input = {
            memoryId,
            text,
            userId: CONFIG.defaultUserId,
            context,
          };

          // SECURITY: Route extraction based on tier
          // Tier3_Vault: NEVER use LLM (heuristic only) - grandma's credit card
          // Tier2_Personal: Local LLM only (Ollama) - fallback to heuristic if unavailable
          // Tier1_General: External LLM OK
          let result;
          if (tier === 'Tier3_Vault') {
            // Tier3: Heuristic only - NO LLM processing ever
            logger.info(`[MCP] Tier3_Vault: Using heuristic extraction only for memory ${memoryId}`);
            result = await enrichMemoryWithSalienceHeuristic(input);
          } else if (tier === 'Tier2_Personal') {
            // Tier2: Local LLM only - for now, use heuristic if no local LLM configured
            // TODO: Add local LLM client (Ollama) support
            if (useLLM && llmClient) {
              // Check if this is a local LLM (Ollama) or external
              // For now, fallback to heuristic for safety
              logger.info(`[MCP] Tier2_Personal: Using heuristic extraction (local LLM not yet configured)`);
              result = await enrichMemoryWithSalienceHeuristic(input);
            } else {
              result = await enrichMemoryWithSalienceHeuristic(input);
            }
          } else {
            // Tier1: External LLM OK
            if (useLLM && llmClient) {
              result = await enrichMemoryWithSalience(input, llmClient);
            } else {
              result = await enrichMemoryWithSalienceHeuristic(input);
            }
          }

          if (!result.success) {
            throw new McpError(ErrorCode.InternalError, result.error || 'Failed to enrich memory');
          }

          // SECURITY: Encrypt content for Tier2/Tier3 before storage
          const textToStore = shouldEncryptMemory(tier) ? encryptMemoryContent(text) : text;
          const isEncrypted = shouldEncryptMemory(tier);

          // Store the memory document in MongoDB
          // IMPORTANT: Capture ALL factors - time, emotion, location, context, device
          const memoryDoc: MemoryDocument = {
            memoryId,
            userId: CONFIG.defaultUserId,
            text: textToStore,
            createdAt: now,
            updatedAt: now,
            state: 'active',
            // Salience scoring
            salienceScore: result.salience?.score,
            salienceComponents: result.salience?.components,  // Fixed: was .factors
            weightsUsed: result.salience?.weightsUsed,
            // Feature extraction (emotion, people, topics, etc.)
            extractedFeatures: result.extractedFeatures,
            // Capture context (time, location, activity)
            captureContext: result.salience?.captureContext,
            // User-provided context (location, activity, mood)
            userContext: context,
            // DEVICE SOURCE - which sensor captured this memory
            // Essential for multi-device sensor net (dolls, glasses, pendants, toys)
            device: deviceId || deviceType ? {
              deviceId: deviceId || `${deviceType || 'mcp'}_${Date.now().toString(36)}`,
              deviceType: deviceType || 'mcp',
              deviceName: deviceName,
            } : undefined,
            // Open loops tracking
            hasOpenLoops: (result.openLoopsCreated?.length || 0) > 0,
            openLoopIds: result.openLoopsCreated?.map(l => l.id),
            // Timeline events
            timelineEventIds: result.timelineEventsCreated?.map(e => e.id),
            // Security classification
            securityTier: tier,
            encrypted: isEncrypted,
            encryptionVersion: isEncrypted ? MEMORY_ENCRYPTION_VERSION : undefined,
            // Vector storage flag
            vectorStored: !shouldSkipVectorStorage(tier),
          };

          try {
            await collections.memories().insertOne(memoryDoc as any);
            logger.info(`[MCP] Memory ${memoryId} stored (tier=${tier}, encrypted=${isEncrypted}, vectors=${!shouldSkipVectorStorage(tier)})`);
          } catch (storageError) {
            logger.error(`[MCP] Failed to store memory ${memoryId}:`, storageError);
            throw new McpError(ErrorCode.InternalError, 'Failed to store memory in database');
          }

          // =================================================================
          // TIER MANAGER - Zipfian cache hierarchy (Hot/Warm/Cold)
          // Stores memory in appropriate tier with vector embedding
          // =================================================================
          try {
            const tierManager = getTierManager();

            // Map salience components to NormalizedSalience format
            const salienceNormalized: NormalizedSalience = {
              emotional: result.salience?.components?.emotion || 0.5,
              novelty: result.salience?.components?.novelty || 0.5,
              relevance: result.salience?.components?.relevance || 0.5,
              social: result.salience?.components?.social || 0.5,
              consequential: result.salience?.components?.consequential || 0.5,
            };

            // Create predictive memory document for tier storage
            const predictiveDoc: PredictiveMemoryDocument = createMemoryDocument(
              CONFIG.defaultUserId,
              memoryId,
              textToStore,
              {
                summary: result.extractedFeatures?.summary,
                importance: result.salience?.score || 0.5,
                salience: salienceNormalized,
                tags: result.extractedFeatures?.topics || [],
                contextFrame: context ? {
                  location: context.location,
                  activity: context.activity,
                  people: context.people,
                } : undefined,
                openLoop: result.openLoopsCreated?.[0] ? {
                  id: result.openLoopsCreated[0].id,
                  description: result.openLoopsCreated[0].description,
                  status: 'open',
                } : undefined,
                securityTier: tier,
              }
            );

            // Determine initial storage tier based on salience
            // High salience memories start in hot tier for fast access
            const storageTier: StorageTier = (result.salience?.score || 0) > 0.7 ? 'hot' : 'warm';

            await tierManager.store(predictiveDoc, storageTier);
            logger.info(`[MCP] Memory ${memoryId} stored in ${storageTier} tier via TierManager`);
          } catch (tierError) {
            // Don't fail the overall store if tier management fails
            logger.warn('[MCP] TierManager storage failed (continuing):', tierError);
          }

          // =================================================================
          // MULTI-SIGNAL DISTRESS DETECTION & CARE CIRCLE NOTIFICATION
          // Adriana's safety net - predict distress BEFORE crisis
          // =================================================================
          try {
            // Analyze text for emotional content (uses Hume.ai or fallback)
            const emotionAnalyzer = new EmotionAnalyzerClient();
            const emotionalContext = await emotionAnalyzer.analyze(text);

            // For each person mentioned, calculate multi-signal distress score
            if (context?.people && context.people.length > 0) {
              const db = getDb();

              for (const personId of context.people) {
                // Get existing pressure record for this person
                const pressureRecord = await db.collection('entity_pressure').findOne({ entityId: personId }) as EntityPressure | null;

                // Build signals from all available sources
                const signals = buildDistressSignals(
                  emotionalContext.detectedEmotionsHume,
                  pressureRecord,
                  text,
                  emotionalContext.emotionalValence !== undefined
                    ? (emotionalContext.emotionalValence + 1) / 2 - 0.5  // Convert 0-1 to -0.5 to 0.5
                    : undefined
                );

                // Calculate multi-signal distress score
                const distressScore = calculateDistressScore(signals);

                logger.info(`[MCP] Distress score for ${personId}: ${distressScore.score} (${distressScore.level})`);
                if (distressScore.triggeringSignals.length > 0) {
                  logger.info(`[MCP] Triggering signals: ${distressScore.triggeringSignals.join(', ')}`);
                }

                // Store distress score in memory record for analysis
                await db.collection('memories').updateOne(
                  { memoryId },
                  {
                    $set: {
                      [`distressScores.${personId}`]: {
                        score: distressScore.score,
                        level: distressScore.level,
                        confidence: distressScore.confidence,
                        triggeringSignals: distressScore.triggeringSignals,
                        timestamp: new Date().toISOString(),
                      },
                    },
                  }
                );

                // Alert care circle based on distress level
                if (distressScore.level !== 'none' && pressureRecord?.careCircle?.length) {
                  const urgencyMap: Record<string, 'monitor' | 'concern' | 'urgent'> = {
                    low: 'monitor',
                    moderate: 'concern',
                    high: 'concern',
                    critical: 'urgent',
                  };

                  await notificationService.checkAndNotify(personId, {
                    pressureScore: pressureRecord.pressureScore || 0,
                    interventionUrgency: urgencyMap[distressScore.level] || 'monitor',
                    patterns: pressureRecord.patterns || {
                      receivingFromMultipleSources: false,
                      transmittingToOthers: false,
                      isolating: false,
                      escalating: false,
                    },
                    careCircle: pressureRecord.careCircle,
                  });

                  logger.info(`[MCP] Care circle notified for ${personId} - distress level: ${distressScore.level}`);
                }

                // CRITICAL: For critical distress, log recommendation
                if (distressScore.level === 'critical') {
                  logger.info(`[MCP] CRITICAL DISTRESS for ${personId}: ${distressScore.recommendation}`);
                }
              }
            }
          } catch (emotionError) {
            // Don't fail memory storage if emotion analysis fails
            logger.warn('[MCP] Emotion analysis/notification failed:', emotionError);
          }

          // =================================================================
          // PREDICTION HOOKS - Generate hooks at ingest for proactive surfacing
          // "Betty's doll knows to remind her about salt before the daughter calls"
          // =================================================================
          try {
            const db = getDb();
            const entities = context?.people || [];

            // Generate hooks based on content patterns (heuristic for now)
            // TODO: Use LLM for Tier1 to generate smarter hooks
            const hooks: Array<{ conditions: HookCondition[]; priority: HookPriority; surfaceText?: string }> = [];

            // Hook 1: Surface when talking to mentioned people
            if (entities.length > 0) {
              hooks.push({
                conditions: [{ type: 'talking_to', operator: 'contains', value: entities[0] }],
                priority: 'medium',
              });
            }

            // Hook 2: Surface based on emotional keywords (distress → high priority)
            const emotionalKeywords = result.extractedFeatures?.emotionalKeywords || [];
            const distressKeywords = ['worried', 'scared', 'anxious', 'stressed', 'hurt', 'sad', 'angry', 'frustrated'];
            const hasDistress = emotionalKeywords.some((k: string) =>
              distressKeywords.some(d => k.toLowerCase().includes(d))
            );
            if (hasDistress) {
              hooks.push({
                conditions: [{ type: 'emotional_state', operator: 'equals', value: 'stressed' }],
                priority: 'high',
                surfaceText: `Remember: ${text.slice(0, 100)}...`,
              });
            }

            // Hook 3: Surface based on location mentions
            const locationKeywords = ['home', 'office', 'work', 'school', 'hospital', 'doctor', 'store', 'gym'];
            const mentionedLocation = locationKeywords.find(loc => text.toLowerCase().includes(loc));
            if (mentionedLocation) {
              hooks.push({
                conditions: [{ type: 'location_type', operator: 'equals', value: mentionedLocation }],
                priority: 'low',
              });
            }

            // Hook 4: Surface for open loops (commitments)
            if (result.openLoopsCreated && result.openLoopsCreated.length > 0) {
              const loop = result.openLoopsCreated[0];
              if (loop.otherParty) {
                hooks.push({
                  conditions: [{ type: 'talking_to', operator: 'contains', value: loop.otherParty }],
                  priority: 'high',
                  surfaceText: `Open commitment: ${loop.description}`,
                });
              }
            }

            // Store generated hooks
            for (const hookData of hooks) {
              const hook = createHook(memoryId, CONFIG.defaultUserId, hookData.conditions, {
                priority: hookData.priority,
                surfaceText: hookData.surfaceText,
                cooldownMs: 60 * 60 * 1000, // 1 hour cooldown
              });
              await db.collection('prediction_hooks').insertOne(hook);
            }

            if (hooks.length > 0) {
              logger.info(`[MCP] Generated ${hooks.length} prediction hooks for memory ${memoryId}`);
            }
          } catch (hookError) {
            logger.warn('[MCP] Hook generation failed:', hookError);
          }

          // =================================================================
          // PRESSURE VECTOR UPDATES - Track emotional pressure for early warning
          // Butterfly → Hurricane: wounded person wounds another
          // =================================================================
          try {
            const db = getDb();
            const entities = context?.people || [];
            const emotionalKeywords = result.extractedFeatures?.emotionalKeywords || [];
            const sentimentScore = result.extractedFeatures?.sentimentScore || 0;

            // Determine pressure category from emotional keywords
            let category: PressureCategory = 'neutral';
            const categoryMap: Record<string, PressureCategory> = {
              angry: 'conflict', frustrated: 'conflict', annoyed: 'conflict',
              sad: 'loss', grief: 'loss', mourning: 'loss',
              worried: 'stress', anxious: 'stress', stressed: 'stress', overwhelmed: 'stress',
              rejected: 'rejection', alone: 'rejection', excluded: 'rejection',
              criticized: 'criticism', blamed: 'criticism',
              disappointed: 'disappointment',
              happy: 'encouragement', excited: 'encouragement', grateful: 'encouragement',
              supported: 'support', helped: 'support', loved: 'support',
              connected: 'connection', together: 'connection',
              accomplished: 'achievement', proud: 'achievement', succeeded: 'achievement',
            };

            for (const keyword of emotionalKeywords) {
              const lower = keyword.toLowerCase();
              for (const [key, cat] of Object.entries(categoryMap)) {
                if (lower.includes(key)) {
                  category = cat;
                  break;
                }
              }
            }

            // Calculate intensity from sentiment score
            const intensity = Math.min(1, Math.abs(sentimentScore));
            const valence = sentimentScore; // -1 to +1

            // Only create vectors for significant emotional content
            if (intensity > 0.3 && entities.length > 0) {
              const now = new Date().toISOString();

              for (const entityId of entities) {
                // Get or create entity pressure record
                let pressureRecord = await db.collection('entity_pressure').findOne({ entityId }) as EntityPressure | null;

                if (!pressureRecord) {
                  pressureRecord = createEntityPressure(entityId);
                }

                // Create pressure vector
                const vector: PressureVector = {
                  sourceEntityId: CONFIG.defaultUserId, // The user/device that captured this
                  targetEntityId: entityId,
                  memoryId,
                  timestamp: now,
                  intensity,
                  valence,
                  category,
                  isRepeated: false, // TODO: detect repeated patterns
                  cascadeDepth: 0,
                };

                // Update pressure with new vector
                const updatedPressure = addPressureVector(pressureRecord, vector);

                // Store updated pressure
                await db.collection('entity_pressure').updateOne(
                  { entityId },
                  { $set: updatedPressure },
                  { upsert: true }
                );

                // If intervention urgency changed, notify care circle
                if (updatedPressure.interventionUrgency !== 'none' && updatedPressure.careCircle?.length) {
                  await notificationService.checkAndNotify(entityId, {
                    pressureScore: updatedPressure.pressureScore,
                    interventionUrgency: updatedPressure.interventionUrgency,
                    patterns: updatedPressure.patterns,
                    careCircle: updatedPressure.careCircle,
                  });
                }

                logger.info(`[MCP] Pressure vector added for ${entityId}: intensity=${intensity.toFixed(2)}, valence=${valence.toFixed(2)}, category=${category}`);
              }
            }
          } catch (pressureError) {
            logger.warn('[MCP] Pressure vector update failed:', pressureError);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    stored: true,
                    memoryId,
                    securityTier: tier,
                    encrypted: isEncrypted,
                    vectorStored: !shouldSkipVectorStorage(tier),
                    // Device source
                    device: memoryDoc.device,
                    // Salience
                    salience: result.salience?.score,
                    components: result.salience?.components,  // Fixed: was .factors
                    // Context captured
                    captureContext: result.salience?.captureContext ? {
                      location: result.salience.captureContext.location,
                      timeOfDay: result.salience.captureContext.timeOfDay,
                      dayOfWeek: result.salience.captureContext.dayOfWeek,
                      timeBucket: result.salience.captureContext.timeBucket,
                    } : undefined,
                    // Emotion extracted
                    emotionalKeywords: result.extractedFeatures?.emotionalKeywords,
                    sentimentScore: result.extractedFeatures?.sentimentScore,
                    // Tracking
                    openLoopsCreated: result.openLoopsCreated?.length || 0,
                    timelineEventsCreated: result.timelineEventsCreated?.length || 0,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'recall': {
          const { query, limit = 10, person, minSalience = 0 } = args as {
            query: string;
            limit?: number;
            person?: string;
            minSalience?: number;
          };

          // FOUNDATION MODE: Route to HTTP API
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.recall(query, {
                limit,
                entity: person,
                minSalience,
              });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    mode: 'rest',
                    query,
                    count: result.memories.length,
                    memories: result.memories.map(m => ({
                      id: m.id,
                      content: m.content,
                      salience: m.salience,
                      createdAt: m.createdAt,
                    })),
                  }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode recall failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // DIRECT MODE: Use local MongoDB
          // For now, use a simple implementation
          // In production, this would use vector search + salience ranking
          const memories = await retrieveMemoriesByQuery(
            CONFIG.defaultUserId,
            query,
            { limit: limit * 2, minSalience } // Fetch extra for post-filtering
          );

          // Filter by person if specified
          let filtered = person
            ? memories.filter((m: ScoredMemory) =>
                m.peopleMentioned?.some(
                  (p: string) => p.toLowerCase().includes(person.toLowerCase())
                )
              )
            : memories;

          // CONTEXT GATE: Filter by current context relevance
          // The right memory at the wrong time is the wrong memory
          try {
            const userContext = await getContextFrame(CONFIG.defaultUserId);
            if (userContext && (userContext.location || userContext.activity || userContext.people?.length)) {
              const contextGate = getContextGate();
              const memoriesWithContext = filtered.map((m: ScoredMemory) => ({
                ...m,
                contextFrame: {
                  location: (m as any).context?.location,
                  activity: (m as any).context?.activity,
                  people: m.peopleMentioned,
                  project: (m as any).context?.project,
                },
              }));

              const gated = contextGate.gate(
                { frame: userContext as ContextFrame },
                memoriesWithContext as any,
                0.2 // Low threshold - we still want relevant results
              );

              // If gating returns results, use them; otherwise keep original
              if (gated.length > 0) {
                filtered = gated.slice(0, limit) as any;
              } else {
                filtered = filtered.slice(0, limit);
              }
            } else {
              filtered = filtered.slice(0, limit);
            }
          } catch (gateError) {
            logger.warn('[MCP] Context gate failed (non-fatal), using unfiltered results:', gateError);
            filtered = filtered.slice(0, limit);
          }

          // =================================================================
          // APPROPRIATENESS FILTER - The Judgment Layer
          // "The correct answer is NOT always the right answer"
          // Filters based on location, device, participants, emotional state
          // =================================================================
          try {
            const appropriatenessFilter = getAppropriatenessFilter();
            const userContext = await getContextFrame(CONFIG.defaultUserId);

            // Build appropriateness context from available information
            const appropriatenessContext: {
              location?: 'home' | 'office' | 'public' | 'medical' | 'unknown';
              device?: { type: 'personal_phone' | 'work_laptop' | 'shared_tablet' | 'ar_glasses' | 'terminal'; isShared?: boolean };
              participants?: string[];
              filterLevel?: 'strict' | 'moderate' | 'relaxed';
            } = {
              filterLevel: 'moderate', // Default to moderate filtering
            };

            // Map location if available
            if (userContext?.location) {
              const locLower = userContext.location.toLowerCase();
              if (locLower.includes('home')) appropriatenessContext.location = 'home';
              else if (locLower.includes('office') || locLower.includes('work')) appropriatenessContext.location = 'office';
              else if (locLower.includes('hospital') || locLower.includes('doctor') || locLower.includes('clinic')) appropriatenessContext.location = 'medical';
              else if (locLower.includes('public') || locLower.includes('cafe') || locLower.includes('restaurant')) appropriatenessContext.location = 'public';
              else appropriatenessContext.location = 'unknown';
            }

            // Add participants from context
            if (userContext?.people && userContext.people.length > 0) {
              appropriatenessContext.participants = userContext.people;
            }

            // Map memories to MemoryForFiltering format
            const memoriesForFiltering = filtered.map((m: ScoredMemory & { extractedFeatures?: any; securityTier?: SecurityTier }) => {
              const features = m.extractedFeatures || {};
              const textLower = (m.text || '').toLowerCase();

              // Detect content categories from text and features
              const isIntimate = textLower.includes('love') || textLower.includes('crush') ||
                textLower.includes('dating') || textLower.includes('relationship') ||
                features.emotionalKeywords?.some((k: string) =>
                  ['love', 'romantic', 'crush', 'intimate'].includes(k.toLowerCase())
                );

              const isMedical = textLower.includes('doctor') || textLower.includes('hospital') ||
                textLower.includes('medication') || textLower.includes('diagnosis') ||
                textLower.includes('symptom') || textLower.includes('health');

              const isFinancial = textLower.includes('salary') || textLower.includes('bank') ||
                textLower.includes('credit card') || textLower.includes('investment') ||
                textLower.includes('debt') || textLower.includes('payment');

              const isCareerSensitive = textLower.includes('job search') || textLower.includes('interview') ||
                textLower.includes('quit') || textLower.includes('fired') ||
                textLower.includes('resign') || textLower.includes('hate my job');

              return {
                memoryId: m.memoryId,
                content: m.text || '',
                securityTier: m.securityTier as SecurityTier | undefined,
                mentionedPeople: m.peopleMentioned,
                isIntimate,
                isMedical,
                isFinancial,
                isCareerSensitive,
              };
            });

            // Check if this was an explicit request (person filter = explicit)
            const wasExplicitlyRequested = !!person;

            // Apply appropriateness filter
            const appropriate = appropriatenessFilter.filterMemories(
              memoriesForFiltering,
              appropriatenessContext,
              wasExplicitlyRequested
            );

            // Map back to original memories (keeping only appropriate ones)
            const appropriateIds = new Set(appropriate.map(m => m.memoryId));
            const beforeCount = filtered.length;
            filtered = filtered.filter((m: ScoredMemory) => appropriateIds.has(m.memoryId));

            if (beforeCount !== filtered.length) {
              logger.info(`[MCP] AppropriatenessFilter: ${beforeCount} → ${filtered.length} memories`);
            }
          } catch (appropriatenessError) {
            logger.warn('[MCP] AppropriatenessFilter failed (non-fatal), using unfiltered results:', appropriatenessError);
          }

          // SECURITY: Decrypt encrypted memories on retrieval
          const decrypted = filtered.map((m: ScoredMemory & { encrypted?: boolean }) => {
            let displayText = m.text;
            if (m.encrypted && displayText) {
              try {
                displayText = decryptMemoryContent(displayText);
              } catch (decryptError) {
                logger.info(`[MCP] Failed to decrypt memory ${m.memoryId}:`, decryptError);
                displayText = '[ENCRYPTED - Decryption failed]';
              }
            }
            return {
              id: m.memoryId,
              text: displayText?.slice(0, 500),
              salience: m.salienceScore,
              relevance: m.retrievalScore,
              people: m.peopleMentioned,
              createdAt: m.createdAt,
              securityTier: (m as any).securityTier,
              encrypted: m.encrypted,
            };
          });

          // Record memory accesses for FFT pattern detection
          // This feeds the 21/63 day pattern learning system
          try {
            for (const memory of decrypted) {
              await recordMemoryAccess(CONFIG.defaultUserId, memory.id, {
                activity: 'recall',
                people: memory.people,
              });
            }
          } catch (patternError) {
            logger.warn('[MCP] Pattern recording failed (non-fatal):', patternError);
          }

          // =================================================================
          // TIER MANAGER - Track accesses for tier promotion
          // Frequently accessed memories get promoted to hot tier (Redis)
          // =================================================================
          try {
            const tierManager = getTierManager();
            for (const memory of decrypted) {
              // Get the memory through TierManager which:
              // 1. Tracks access for frequency analysis
              // 2. Automatically promotes hot memories to Redis
              // 3. Promotes cold memories back to warm
              await tierManager.get(CONFIG.defaultUserId, memory.id);
            }
          } catch (tierError) {
            logger.warn('[MCP] TierManager access tracking failed (non-fatal):', tierError);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(decrypted, null, 2),
              },
            ],
          };
        }

        case 'get_briefing': {
          const { person, quick = false } = args as { person: string; quick?: boolean };

          // FOUNDATION MODE: Route to HTTP API
          if (connectionMode === 'rest' && apiClient) {
            try {
              const briefing = await apiClient.getBriefing(person, quick);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ mode: 'rest', ...briefing }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode briefing failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // DIRECT MODE
          const briefing = quick
            ? await generateQuickBriefing(CONFIG.defaultUserId, person)
            : await generateBriefing(CONFIG.defaultUserId, person);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(briefing, null, 2),
              },
            ],
          };
        }

        case 'list_loops': {
          const { owner, person, includeOverdue = true } = args as {
            owner?: 'self' | 'them' | 'mutual';
            person?: string;
            includeOverdue?: boolean;
          };

          // FOUNDATION MODE: Route to HTTP API
          if (connectionMode === 'rest' && apiClient) {
            try {
              const loops = await apiClient.listLoops({ owner, person, includeOverdue });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ mode: 'rest', loops }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode list_loops failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // DIRECT MODE
          const loops = await getOpenLoops(CONFIG.defaultUserId, {
            owner,
            contactName: person,
            includeOverdue,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  loops.map((loop: any) => ({
                    id: loop.id || loop._id?.toString(),
                    description: loop.description,
                    owner: loop.owner,
                    otherParty: loop.otherParty,
                    dueDate: loop.dueDate,
                    isOverdue: loop.isOverdue,
                    loopType: loop.loopType,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'close_loop': {
          const { loopId, note } = args as { loopId: string; note?: string };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.closeLoop(loopId, note);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode close_loop failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          await closeLoop(loopId, note);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ closed: true, loopId }),
              },
            ],
          };
        }

        case 'get_status': {
          // REST MODE: Get status from remote API
          if (connectionMode === 'rest' && apiClient) {
            try {
              const healthy = await apiClient.healthCheck();
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    mode: 'rest',
                    connected: healthy,
                    apiUrl: process.env.API_BASE_URL || process.env.MEMORABLE_API_URL,
                    message: healthy
                      ? 'MemoRable API connected and healthy'
                      : 'MemoRable API unreachable',
                  }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode status check failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          const status = await getSalienceStatus(CONFIG.defaultUserId);
          const metrics = getMetricsSummary();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ...status, metrics }, null, 2),
              },
            ],
          };
        }

        // Context Frame Tools (Multi-Device Aware)
        case 'set_context': {
          const { location, people, activity, deviceId, deviceType } = args as {
            location?: string;
            people?: string[];
            activity?: string;
            deviceId?: string;
            deviceType?: DeviceType;
          };

          // Generate device ID if not provided (for consistent tracking)
          const effectiveDeviceId = deviceId || `mcp_${Date.now().toString(36)}`;
          const effectiveDeviceType = deviceType || 'mcp';

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.setContext({ location, people, activity, deviceId: effectiveDeviceId, deviceType: effectiveDeviceType });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode set_context failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const memories = await setContext(
            CONFIG.defaultUserId,
            { location, people, activity },
            { deviceId: effectiveDeviceId, deviceType: effectiveDeviceType }
          );

          // Update session continuity with context change (async, don't block)
          updateDeviceSession(
            CONFIG.defaultUserId,
            effectiveDeviceId,
            effectiveDeviceType,
            {
              context: { location, activity, people },
              conversationTopics: [
                location ? `at ${location}` : '',
                activity ? `doing ${activity}` : '',
                ...(people || []).map(p => `with ${p}`),
              ].filter(Boolean),
            }
          ).catch(() => { /* non-critical */ });

          // Format the response nicely
          const response: any = {
            contextSet: true,
            deviceId: effectiveDeviceId,
            deviceType: effectiveDeviceType,
            location,
            people,
            activity,
          };

          if (memories.aboutPeople.length > 0) {
            response.peopleContext = memories.aboutPeople.map(p => ({
              person: p.person,
              memoriesFound: p.memories.length,
              openLoops: p.openLoops.length,
              upcomingEvents: p.upcomingEvents.length,
            }));
          }

          if (memories.suggestedTopics.length > 0) {
            response.suggestedTopics = memories.suggestedTopics;
          }

          if (memories.sensitivities.length > 0) {
            response.sensitivities = memories.sensitivities;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        case 'whats_relevant': {
          const { deviceId, unified } = args as {
            deviceId?: string;
            unified?: boolean;
          };

          // FOUNDATION MODE: Route to HTTP API
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getRelevant({ deviceId, unified });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ mode: 'rest', ...result }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `REST mode whats_relevant failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // DIRECT MODE
          // If unified requested, get fused context from all devices
          if (unified) {
            const unifiedContext = await getUnifiedUserContext(CONFIG.defaultUserId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    type: 'unified',
                    activeDevices: unifiedContext.activeDeviceCount,
                    primaryDevice: unifiedContext.primaryDevice,
                    isMultitasking: unifiedContext.isMultitasking,
                    currentContext: {
                      location: unifiedContext.location,
                      people: unifiedContext.people,
                      activity: unifiedContext.activity,
                    },
                    deviceBreakdown: unifiedContext.deviceBreakdown,
                    note: 'Context fused from all active devices using brain-inspired integration (mobile wins for location, people merged, activity from most recent)',
                  }, null, 2),
                },
              ],
            };
          }

          const { frame, memories } = await whatMattersNow(CONFIG.defaultUserId, deviceId);

          if (!frame || !memories) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: 'No context set. Use set_context first.',
                    hint: 'Pass unified: true to see context from all devices',
                  }),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  deviceId: frame.deviceId,
                  deviceType: frame.deviceType,
                  currentContext: {
                    location: frame.location?.value,
                    people: frame.people.map(p => p.value),
                    activity: frame.activity?.value,
                    timeOfDay: frame.timeOfDay,
                  },
                  relevantMemories: memories.recentRelevant.slice(0, 5).map(m => ({
                    text: m.text,
                    matchedOn: m.matchedOn,
                    salience: m.salienceScore,
                  })),
                  suggestedTopics: memories.suggestedTopics,
                  sensitivities: memories.sensitivities,
                }, null, 2),
              },
            ],
          };
        }

        case 'clear_context': {
          const { dimensions, deviceId } = args as {
            dimensions?: ('location' | 'people' | 'activity' | 'calendar' | 'mood')[];
            deviceId?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.clearContext(deviceId, dimensions);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode clear_context failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const frame = await clearContextFrame(CONFIG.defaultUserId, dimensions, deviceId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  cleared: dimensions || 'all',
                  deviceId: frame.deviceId,
                  remainingContext: {
                    location: frame.location?.value,
                    people: frame.people.map(p => p.value),
                    activity: frame.activity?.value,
                  },
                }),
              },
            ],
          };
        }

        case 'list_devices': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.listDevices();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', devices: result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode list_devices failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const contexts = await getAllDeviceContexts(CONFIG.defaultUserId);

          if (contexts.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    activeDevices: 0,
                    message: 'No active devices. Use set_context to register a device.',
                  }),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  activeDevices: contexts.length,
                  devices: contexts.map(ctx => ({
                    deviceId: ctx.deviceId,
                    deviceType: ctx.deviceType,
                    lastUpdated: ctx.lastUpdated,
                    location: ctx.location?.value,
                    activity: ctx.activity?.value,
                    peopleCount: ctx.people.length,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        // Cross-Device Continuity Tools
        case 'handoff_device': {
          const {
            sourceDeviceId,
            targetDeviceId,
            targetDeviceType,
            reason = 'user_initiated',
          } = args as {
            sourceDeviceId: string;
            targetDeviceId?: string;
            targetDeviceType?: DeviceType;
            reason?: 'user_initiated' | 'device_switch' | 'timeout' | 'predicted';
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.request('POST', '/devices/handoff', {
                sourceDeviceId,
                targetDeviceId,
                targetDeviceType,
                reason,
                transferContext: true,
                transferTopics: true,
              });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode handoff_device failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const result = await initiateHandoff({
            userId: CONFIG.defaultUserId,
            sourceDeviceId,
            targetDeviceId,
            targetDeviceType,
            reason,
            transferContext: true,
            transferTopics: true,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  handoffId: result.handoffId,
                  success: result.success,
                  from: result.sourceDevice,
                  to: result.targetDevice || 'Pending - next device to connect will claim this handoff',
                  transferred: result.transferredContext,
                  briefing: result.continuityBriefing,
                }, null, 2),
              },
            ],
          };
        }

        case 'get_session_continuity': {
          const {
            deviceId: contDeviceId,
            deviceType: contDeviceType,
          } = args as {
            deviceId?: string;
            deviceType?: DeviceType;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const params: Record<string, string> = {};
              if (contDeviceId) params.deviceId = contDeviceId;
              if (contDeviceType) params.deviceType = contDeviceType;
              const result = await apiClient.request('GET', '/session/continuity', undefined, params);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_session_continuity failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (contDeviceId) {
            // Get full continuity with handoff claim
            const continuity = await getSessionContinuity(
              CONFIG.defaultUserId,
              contDeviceId,
              contDeviceType || 'mcp'
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    thisDevice: continuity.thisDevice ? {
                      sessionId: continuity.thisDevice.sessionId,
                      startedAt: continuity.thisDevice.startedAt,
                      context: continuity.thisDevice.context,
                      topics: continuity.thisDevice.conversationTopics,
                    } : null,
                    otherDevices: continuity.otherDevices.map(d => ({
                      deviceId: d.deviceId,
                      deviceType: d.deviceType,
                      context: d.context,
                      topics: d.conversationTopics.slice(-3),
                      lastActive: d.lastActiveAt,
                    })),
                    pendingHandoff: continuity.pendingHandoff ? {
                      handoffId: continuity.pendingHandoff.handoffId,
                      from: continuity.pendingHandoff.sourceDevice,
                      briefing: continuity.pendingHandoff.continuityBriefing,
                    } : null,
                    briefing: continuity.continuityBriefing,
                    crossDevice: {
                      totalTopics: continuity.crossDeviceState.allTopics.length,
                      totalMemories: continuity.crossDeviceState.allActiveMemoryIds.length,
                      totalLoops: continuity.crossDeviceState.allActiveLoopIds.length,
                      activeSessions: continuity.crossDeviceState.activeSessions.length,
                    },
                  }, null, 2),
                },
              ],
            };
          }

          // No device ID - just show cross-device state
          const state = await getCrossDeviceState(CONFIG.defaultUserId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  activeSessions: state.activeSessions.map(s => ({
                    deviceId: s.deviceId,
                    deviceType: s.deviceType,
                    context: s.context,
                    topics: s.conversationTopics.slice(-3),
                    lastActive: s.lastActiveAt,
                  })),
                  pendingHandoff: state.pendingHandoff || null,
                  crossDevice: {
                    allTopics: state.allTopics,
                    activeMemoryCount: state.allActiveMemoryIds.length,
                    activeLoopCount: state.allActiveLoopIds.length,
                  },
                }, null, 2),
              },
            ],
          };
        }

        // Memory Management Tools
        case 'forget': {
          const { memoryId, mode = 'suppress', reason } = args as {
            memoryId: string;
            mode?: 'suppress' | 'archive' | 'delete';
            reason?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.forgetMemory(memoryId, mode, reason);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode forget failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const result = await forgetMemory(CONFIG.defaultUserId, memoryId, {
            mode,
            reason,
            cascadeLoops: true,
            cascadeTimeline: true,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'forget_person': {
          const { person, mode = 'suppress', alsoForgetLoops, alsoForgetEvents } = args as {
            person: string;
            mode?: 'suppress' | 'archive' | 'delete';
            alsoForgetLoops?: boolean;
            alsoForgetEvents?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.forgetPerson(person, { mode, alsoForgetEvents, alsoForgetLoops });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode forget_person failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const result = await forgetPerson(CONFIG.defaultUserId, person, {
            mode,
            alsoForgetLoops,
            alsoForgetEvents,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  person,
                  ...result,
                }, null, 2),
              },
            ],
          };
        }

        case 'restore': {
          const { memoryId } = args as { memoryId: string };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.restoreMemory(memoryId);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const result = await restoreMemory(CONFIG.defaultUserId, memoryId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'reassociate': {
          const {
            memoryId,
            addPeople,
            removePeople,
            addTopics,
            removeTopics,
            addTags,
            removeTags,
            setProject,
          } = args as {
            memoryId: string;
            addPeople?: string[];
            removePeople?: string[];
            addTopics?: string[];
            removeTopics?: string[];
            addTags?: string[];
            removeTags?: string[];
            setProject?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.reassociateMemory(memoryId, { addPeople, removePeople, addTags, removeTags, addTopics, removeTopics, setProject });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode reassociate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const result = await reassociateMemory(CONFIG.defaultUserId, memoryId, {
            addPeople,
            removePeople,
            addTopics,
            removeTopics,
            addTags,
            removeTags,
            setProject,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'export_memories': {
          const {
            people,
            topics,
            project,
            fromDate,
            toDate,
            includeLoops,
            includeTimeline,
            password,
          } = args as {
            people?: string[];
            topics?: string[];
            project?: string;
            fromDate?: string;
            toDate?: string;
            includeLoops?: boolean;
            includeTimeline?: boolean;
            password?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.exportMemories({ password, fromDate, toDate, people, topics, project, includeLoops, includeTimeline });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode export_memories failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const memories = await exportMemories(CONFIG.defaultUserId, {
            people,
            topics,
            project,
            fromDate,
            toDate,
            includeLoops,
            includeTimeline,
          });

          // SECURITY FIX: Encrypt export if password provided
          const exportData = JSON.stringify({
            count: memories.length,
            memories,
            exportedAt: new Date().toISOString(),
            version: '1.0',
          });

          if (password) {
            // Encrypt with user password
            const encrypted = encryptTokenData(exportData); // Reuse encryption function
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    encrypted: true,
                    data: encrypted,
                    count: memories.length,
                    note: 'Decrypt with same password using import_memories',
                  }, null, 2),
                },
              ],
            };
          }

          // Unencrypted export - warn user
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  WARNING: 'UNENCRYPTED EXPORT - Add password parameter for security',
                  count: memories.length,
                  memories,
                }, null, 2),
              },
            ],
          };
        }

        case 'import_memories': {
          const {
            memories: memoriesInput,
            encryptedData,
            password,
            idPrefix,
            targetProject,
            skipDuplicates = true,
            source = 'api',
          } = args as {
            memories?: Array<{
              id?: string;
              text: string;
              createdAt?: string;
              salienceScore?: number;
              people?: string[];
              topics?: string[];
              tags?: string[];
              project?: string;
              loops?: Array<{
                description: string;
                owner?: string;
                status?: string;
                dueDate?: string;
              }>;
            }>;
            encryptedData?: string;
            password?: string;
            idPrefix?: string;
            targetProject?: string;
            skipDuplicates?: boolean;
            source?: 'mem0' | 'file' | 'api';
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.importMemories({ memories: memoriesInput, encryptedData, password, source, skipDuplicates, targetProject, idPrefix });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode import_memories failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          let memoriesToImport = memoriesInput;

          // Handle encrypted import
          if (encryptedData && password) {
            try {
              const decryptedData = decryptTokenData(encryptedData);
              const parsed = JSON.parse(decryptedData);
              memoriesToImport = parsed.memories;
              logger.info(`[MCP] Decrypted import: ${memoriesToImport?.length || 0} memories`);
            } catch (decryptError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Failed to decrypt import data - check password'
              );
            }
          }

          if (!memoriesToImport || memoriesToImport.length === 0) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'No memories to import. Provide memories array or encryptedData with password.'
            );
          }

          // Convert to ExportedMemory format expected by importMemories
          const formattedMemories = memoriesToImport.map(m => ({
            id: m.id || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text: m.text,
            createdAt: m.createdAt || new Date().toISOString(),
            salienceScore: m.salienceScore,
            people: m.people,
            topics: m.topics,
            tags: m.tags,
            project: m.project,
            loops: m.loops,
          }));

          const result = await importMemories(CONFIG.defaultUserId, formattedMemories as any, {
            idPrefix,
            targetProject,
            skipDuplicates,
            source,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  imported: result.imported,
                  skipped: result.skipped,
                  errors: result.errors,
                  importId: result.importId,
                  note: result.errors.length > 0
                    ? `${result.errors.length} errors occurred during import`
                    : 'Import completed successfully',
                }, null, 2),
              },
            ],
          };
        }

        // Anticipation Tools (Predictive Memory - the "voodoo")
        case 'anticipate': {
          const { calendar = [], lookAheadMinutes = 60 } = args as {
            calendar?: CalendarEvent[];
            lookAheadMinutes?: number;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.anticipate(calendar, lookAheadMinutes);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode anticipate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const anticipated = await getAnticipatedContext(
            CONFIG.defaultUserId,
            calendar,
            lookAheadMinutes
          );

          const stats = await getPatternStats(CONFIG.defaultUserId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  readyForPrediction: stats.readyForPrediction,
                  dataCollectionDays: stats.dataCollectionDays,
                  daysUntilReady: stats.readyForPrediction ? 0 : Math.max(0, 21 - stats.dataCollectionDays),
                  anticipatedContexts: anticipated.map(a => ({
                    triggerTime: a.triggerTime,
                    confidence: Math.round(a.confidence * 100) + '%',
                    context: {
                      timeOfDay: a.features.timeOfDay,
                      activity: a.features.activity,
                      people: a.features.people,
                    },
                    suggestedBriefings: a.suggestedBriefings,
                    suggestedTopics: a.suggestedTopics,
                    suggestedMemories: a.suggestedMemories.slice(0, 3),
                    basedOn: a.basedOn.calendarEvent?.title || a.basedOn.recurringBehavior || 'learned pattern',
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'day_outlook': {
          const { calendar = [] } = args as { calendar?: CalendarEvent[] };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.dayOutlook(calendar);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode day_outlook failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const outlook = await generateDayAnticipation(CONFIG.defaultUserId, calendar);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  greeting: outlook.greeting,
                  outlook: outlook.dayOutlook,
                  insights: outlook.patternInsights,
                  upcomingContextSwitches: outlook.anticipatedContexts.slice(0, 5).map(a => ({
                    time: new Date(a.triggerTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    confidence: Math.round(a.confidence * 100) + '%',
                    briefingsNeeded: a.suggestedBriefings,
                    topicsLikely: a.suggestedTopics.slice(0, 3),
                    trigger: a.basedOn.calendarEvent?.title || a.basedOn.recurringBehavior,
                  })),
                }, null, 2),
              },
            ],
          };
        }

        case 'pattern_stats': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.patternStats();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode pattern_stats failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const stats = await getPatternStats(CONFIG.defaultUserId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...stats,
                  message: stats.readyForPrediction
                    ? `Ready! ${stats.formedPatterns} patterns learned with ${Math.round(stats.averageConfidence * 100)}% average confidence.`
                    : `Still learning (${stats.dataCollectionDays}/21 days). ${21 - stats.dataCollectionDays} days until predictions unlock.`,
                }, null, 2),
              },
            ],
          };
        }

        case 'memory_feedback': {
          const { patternId, memoryId, action } = args as {
            patternId: string;
            memoryId?: string;
            action: 'used' | 'ignored' | 'dismissed';
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.memoryFeedback(patternId, action, memoryId);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode memory_feedback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const now = new Date();
          const feedback: FeedbackSignal = {
            patternId,
            memoryId,
            action,
            context: {
              timeOfDay: now.getHours() >= 5 && now.getHours() < 12 ? 'morning'
                : now.getHours() >= 12 && now.getHours() < 17 ? 'afternoon'
                : now.getHours() >= 17 && now.getHours() < 21 ? 'evening'
                : 'night',
              dayOfWeek: now.getDay(),
            },
            timestamp: now.toISOString(),
          };

          await recordPatternFeedback(CONFIG.defaultUserId, feedback);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  recorded: true,
                  action,
                  message: action === 'used'
                    ? 'Great! This pattern will be reinforced.'
                    : action === 'dismissed'
                    ? 'Got it. This pattern will be down-weighted.'
                    : 'Noted. Neutral feedback recorded.',
                }),
              },
            ],
          };
        }

        case 'identify_user': {
          const { message, candidateUsers } = args as {
            message: string;
            candidateUsers?: string[];
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.identifyUser(message, candidateUsers);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode identify_user failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          // Analyze behavioral signals from message
          const signals = analyzeBehavioralSignals(message);

          // Get behavioral fingerprints to match against
          const fingerprintsCollection = db!.collection('behavioral_fingerprints');
          const query = candidateUsers?.length
            ? { userId: { $in: candidateUsers } }
            : {};
          const fingerprints = await fingerprintsCollection.find(query).toArray();

          // Find best match
          let bestMatch = { userId: 'unknown', confidence: 0, signals: {} as Record<string, number> };
          for (const fp of fingerprints) {
            const score = calculateBehavioralMatch(signals, fp);
            if (score.confidence > bestMatch.confidence) {
              bestMatch = { userId: fp.userId, ...score };
            }
          }

          // Record this prediction for feedback loop
          const predictionId = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db!.collection('behavioral_predictions').insertOne({
            predictionId,
            predictedUser: bestMatch.userId,
            confidence: bestMatch.confidence,
            signals: bestMatch.signals,
            messageHash: hashMessage(message),
            timestamp: new Date(),
            feedbackReceived: false,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                predictionId,
                userId: bestMatch.userId,
                confidence: bestMatch.confidence,
                signals: bestMatch.signals,
                threshold: 0.75,
                identified: bestMatch.confidence >= 0.75,
              }, null, 2),
            }],
          };
        }

        case 'behavioral_metrics': {
          const { userId, timeRange = '24h', includeGraph = true } = args as {
            userId?: string;
            timeRange?: '1h' | '24h' | '7d' | '30d' | 'all';
            includeGraph?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.behavioralMetrics(timeRange, userId);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode behavioral_metrics failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          // Calculate time filter
          const timeMs = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': 0,
          }[timeRange];
          const timeFilter = timeMs > 0
            ? { timestamp: { $gte: new Date(Date.now() - timeMs) } }
            : {};

          const predictions = db!.collection('behavioral_predictions');
          const fingerprints = db!.collection('behavioral_fingerprints');

          // Get predictions with feedback
          const userFilter = userId ? { predictedUser: userId } : {};
          const allPredictions = await predictions.find({ ...timeFilter, ...userFilter }).toArray();
          const withFeedback = allPredictions.filter(p => p.feedbackReceived);
          const correct = withFeedback.filter(p => p.wasCorrect);

          // Calculate metrics
          const totalPredictions = allPredictions.length;
          const feedbackCount = withFeedback.length;
          const hitRate = feedbackCount > 0 ? (correct.length / feedbackCount) * 100 : 0;
          const missRate = feedbackCount > 0 ? ((feedbackCount - correct.length) / feedbackCount) * 100 : 0;

          // Get fingerprint stats
          const fpQuery = userId ? { userId } : {};
          const allFingerprints = await fingerprints.find(fpQuery).toArray();
          const avgSamples = allFingerprints.length > 0
            ? allFingerprints.reduce((sum, fp) => sum + (fp.sampleCount || 0), 0) / allFingerprints.length
            : 0;
          const readyUsers = allFingerprints.filter(fp => (fp.sampleCount || 0) >= 50).length;

          // Confidence distribution
          const confBuckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
          for (const p of allPredictions) {
            const bucket = Math.min(4, Math.floor(p.confidence * 5));
            confBuckets[bucket]++;
          }

          // Signal strength breakdown (from recent predictions)
          // Includes proven stylometry signals: charNgrams, functionWords
          const signalStrength: Record<string, number> = {
            charNgrams: 0,      // Character 3-grams (most discriminative)
            functionWords: 0,   // Function word frequencies
            vocabulary: 0,      // Lexical richness
            syntax: 0,          // Syntactic patterns
            style: 0,           // Writing style
            timing: 0,          // Behavioral timing
            topics: 0,          // Topic preferences
          };
          let signalCount = 0;
          for (const p of allPredictions.slice(-100)) {
            if (p.signals) {
              for (const [key, value] of Object.entries(p.signals)) {
                if (key in signalStrength) {
                  signalStrength[key] += value as number;
                  signalCount++;
                }
              }
            }
          }
          if (signalCount > 0) {
            for (const key of Object.keys(signalStrength)) {
              signalStrength[key] = signalStrength[key] / (allPredictions.slice(-100).length || 1);
            }
          }

          // Build ASCII dashboard
          let dashboard = '';
          if (includeGraph) {
            dashboard = `
╔══════════════════════════════════════════════════════════════════════╗
║           BEHAVIORAL IDENTITY METRICS (Stylometry Engine)            ║
║                     Time Range: ${timeRange.padEnd(33)}║
╠══════════════════════════════════════════════════════════════════════╣
║  LEARNING PROGRESS                                                    ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Users with fingerprints: ${String(allFingerprints.length).padStart(4)}                                  │  ║
║  │ Ready for identification: ${String(readyUsers).padStart(4)} (≥50 samples)                   │  ║
║  │ Avg samples per user:    ${String(Math.round(avgSamples)).padStart(4)}                                  │  ║
║  │                                                                │  ║
║  │ Progress: ${generateProgressBar(avgSamples, 50, 30)}  ${String(Math.min(100, Math.round(avgSamples / 50 * 100))).padStart(3)}%  │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  IDENTIFICATION ACCURACY                                              ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Total predictions: ${String(totalPredictions).padStart(6)}                                      │  ║
║  │ With feedback:     ${String(feedbackCount).padStart(6)}                                      │  ║
║  │                                                                │  ║
║  │ Hit Rate:  ${generateProgressBar(hitRate, 100, 22)} ${hitRate.toFixed(1).padStart(5)}%        │  ║
║  │ Miss Rate: ${generateProgressBar(missRate, 100, 22)} ${missRate.toFixed(1).padStart(5)}%        │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  CONFIDENCE DISTRIBUTION                                              ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │  0-20%  ${generateHistogramBar(confBuckets[0], Math.max(...confBuckets), 27)} ${String(confBuckets[0]).padStart(4)} │  ║
║  │ 20-40%  ${generateHistogramBar(confBuckets[1], Math.max(...confBuckets), 27)} ${String(confBuckets[1]).padStart(4)} │  ║
║  │ 40-60%  ${generateHistogramBar(confBuckets[2], Math.max(...confBuckets), 27)} ${String(confBuckets[2]).padStart(4)} │  ║
║  │ 60-80%  ${generateHistogramBar(confBuckets[3], Math.max(...confBuckets), 27)} ${String(confBuckets[3]).padStart(4)} │  ║
║  │ 80-100% ${generateHistogramBar(confBuckets[4], Math.max(...confBuckets), 27)} ${String(confBuckets[4]).padStart(4)} │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════════╣
║  STYLOMETRY SIGNAL STRENGTH (proven authorship attribution)          ║
║  ┌────────────────────────────────────────────────────────────────┐  ║
║  │ Char N-grams   ${generateProgressBar(signalStrength.charNgrams * 100, 100, 22)} ${(signalStrength.charNgrams * 100).toFixed(0).padStart(3)}% ★  │  ║
║  │ Function Words ${generateProgressBar(signalStrength.functionWords * 100, 100, 22)} ${(signalStrength.functionWords * 100).toFixed(0).padStart(3)}% ★  │  ║
║  │ Vocabulary     ${generateProgressBar(signalStrength.vocabulary * 100, 100, 22)} ${(signalStrength.vocabulary * 100).toFixed(0).padStart(3)}%    │  ║
║  │ Syntax         ${generateProgressBar(signalStrength.syntax * 100, 100, 22)} ${(signalStrength.syntax * 100).toFixed(0).padStart(3)}%    │  ║
║  │ Style          ${generateProgressBar(signalStrength.style * 100, 100, 22)} ${(signalStrength.style * 100).toFixed(0).padStart(3)}%    │  ║
║  │ Timing         ${generateProgressBar(signalStrength.timing * 100, 100, 22)} ${(signalStrength.timing * 100).toFixed(0).padStart(3)}%    │  ║
║  │ Topics         ${generateProgressBar(signalStrength.topics * 100, 100, 22)} ${(signalStrength.topics * 100).toFixed(0).padStart(3)}%    │  ║
║  └────────────────────────────────────────────────────────────────┘  ║
║  ★ = Research-proven most discriminative features                     ║
╚══════════════════════════════════════════════════════════════════════╝
`;
          }

          return {
            content: [{
              type: 'text',
              text: dashboard + JSON.stringify({
                timeRange,
                learningProgress: {
                  totalUsers: allFingerprints.length,
                  readyForIdentification: readyUsers,
                  avgSamplesPerUser: Math.round(avgSamples),
                  targetSamples: 50,
                },
                accuracy: {
                  totalPredictions,
                  withFeedback: feedbackCount,
                  correct: correct.length,
                  hitRate: hitRate.toFixed(1) + '%',
                  missRate: missRate.toFixed(1) + '%',
                },
                confidenceDistribution: {
                  '0-20%': confBuckets[0],
                  '20-40%': confBuckets[1],
                  '40-60%': confBuckets[2],
                  '60-80%': confBuckets[3],
                  '80-100%': confBuckets[4],
                },
                signalStrength,
              }, null, 2),
            }],
          };
        }

        case 'behavioral_feedback': {
          const { predictionId, correct, actualUserId } = args as {
            predictionId: string;
            correct: boolean;
            actualUserId?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.behavioralFeedback(predictionId, correct, actualUserId);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode behavioral_feedback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const predictions = db!.collection('behavioral_predictions');
          const fingerprints = db!.collection('behavioral_fingerprints');

          // Find the prediction
          const prediction = await predictions.findOne({ predictionId });
          if (!prediction) {
            throw new McpError(ErrorCode.InvalidParams, `Prediction not found: ${predictionId}`);
          }

          // Update prediction with feedback
          await predictions.updateOne(
            { predictionId },
            {
              $set: {
                feedbackReceived: true,
                wasCorrect: correct,
                actualUserId: correct ? prediction.predictedUser : actualUserId,
                feedbackTimestamp: new Date(),
              }
            }
          );

          // If wrong, strengthen the actual user's fingerprint
          if (!correct && actualUserId) {
            await fingerprints.updateOne(
              { userId: actualUserId },
              {
                $inc: { sampleCount: 1, correctionCount: 1 },
                $set: { lastUpdated: new Date() },
              },
              { upsert: true }
            );
          }

          // Update accuracy tracking
          const accuracyCollection = db!.collection('behavioral_accuracy');
          await accuracyCollection.insertOne({
            predictionId,
            correct,
            predictedUser: prediction.predictedUser,
            actualUser: correct ? prediction.predictedUser : actualUserId,
            confidence: prediction.confidence,
            timestamp: new Date(),
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                recorded: true,
                correct,
                message: correct
                  ? '✓ Correct identification! Fingerprint reinforced.'
                  : `✗ Incorrect. Learning from mistake. Actual user: ${actualUserId}`,
                impactOnAccuracy: correct ? '+' : 'adjusted',
              }),
            }],
          };
        }

        // ============================================
        // PREDICTIVE MEMORY SYSTEM HANDLERS
        // ============================================

        case 'get_anticipated_context': {
          const { context_frame, max_memories = 5 } = args as {
            context_frame?: {
              location?: string;
              people?: string[];
              activity?: string;
              project?: string;
            };
            max_memories?: number;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getAnticipatedContext(context_frame, max_memories);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_anticipated_context failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          // Import predictive anticipation service
          const { getAnticipatedForUser } = await import('../salience_service/predictive_anticipation.js');

          const result = await getAnticipatedForUser(
            CONFIG.defaultUserId,
            context_frame,
            max_memories
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                anticipated: result.memories.map(m => ({
                  memoryId: m.memoryId,
                  content: m.content,
                  score: Math.round(m.anticipationScore * 100),
                  reasons: m.anticipationReasons,
                  pattern: m.temporal?.patternType,
                  hasOpenLoop: m.openLoop && !m.openLoop.resolved,
                })),
                contextMatched: result.contextMatched,
                patternsUsed: result.patternsUsed,
                timestamp: result.timestamp,
              }, null, 2),
            }],
          };
        }

        case 'search_memories': {
          const { query, limit = 10, filters } = args as {
            query: string;
            limit?: number;
            filters?: {
              tags?: string[];
              min_importance?: number;
              pattern_type?: string;
            };
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.searchMemories(query, filters, limit);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode search_memories failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          // Use existing retrieval with predictive memory collection
          const predictiveMemories = collections.predictiveMemories();

          const filter: Record<string, unknown> = {
            userId: CONFIG.defaultUserId,
          };

          if (filters?.tags && filters.tags.length > 0) {
            filter.tags = { $in: filters.tags };
          }

          if (filters?.min_importance !== undefined) {
            filter.importance = { $gte: filters.min_importance };
          }

          if (filters?.pattern_type) {
            filter['temporal.patternType'] = filters.pattern_type;
          }

          const memories = await predictiveMemories
            .find(filter)
            .sort({ importance: -1, lastAccessed: -1 })
            .limit(limit)
            .toArray();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                results: memories.map(m => ({
                  memoryId: m.memoryId,
                  content: m.content,
                  importance: m.importance,
                  tier: m.tier,
                  tags: m.tags,
                  pattern: m.temporal?.patternType,
                  lastAccessed: m.lastAccessed,
                })),
                total: memories.length,
              }, null, 2),
            }],
          };
        }

        case 'resolve_open_loop': {
          const { memory_id, resolution_note } = args as {
            memory_id: string;
            resolution_note?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.resolveOpenLoop(memory_id, resolution_note);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode resolve_open_loop failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const predictiveMemories = collections.predictiveMemories();

          // Update the open loop in the memory
          const result = await predictiveMemories.updateOne(
            {
              userId: CONFIG.defaultUserId,
              memoryId: memory_id,
              'openLoop.resolved': false,
            },
            {
              $set: {
                'openLoop.resolved': true,
                'openLoop.resolvedAt': new Date().toISOString(),
                'openLoop.resolutionNote': resolution_note,
              },
            }
          );

          if (result.modifiedCount === 0) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: 'No unresolved open loop found for this memory',
                }),
              }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                memoryId: memory_id,
                message: 'Open loop resolved',
                resolutionNote: resolution_note,
              }),
            }],
          };
        }

        case 'get_pattern_stats': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getPatternStats();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_pattern_stats failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const { getPatternDetector } = await import('../salience_service/pattern_detector.js');
          const detector = getPatternDetector();

          const stablePatterns = await detector.getStablePatterns(CONFIG.defaultUserId, 21);
          const veryStablePatterns = await detector.getStablePatterns(CONFIG.defaultUserId, 63);

          // Get access history stats
          const accessHistory = collections.accessHistory();
          const historyCount = await accessHistory.countDocuments({
            userId: CONFIG.defaultUserId,
          });

          // Calculate data collection period
          const oldestAccess = await accessHistory
            .find({ userId: CONFIG.defaultUserId })
            .sort({ timestamp: 1 })
            .limit(1)
            .toArray();

          const dataCollectionDays = oldestAccess.length > 0
            ? Math.floor((Date.now() - new Date(oldestAccess[0].timestamp).getTime()) / (24 * 60 * 60 * 1000))
            : 0;

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                totalPatterns: stablePatterns.length,
                formedPatterns: stablePatterns.filter(p => p.pattern.stabilityDays >= 21).length,
                stablePatterns: veryStablePatterns.length,
                dataCollectionDays,
                accessHistoryCount: historyCount,
                readyForPrediction: dataCollectionDays >= 21 && stablePatterns.length > 0,
                patternBreakdown: {
                  daily: stablePatterns.filter(p => p.pattern.patternType === 'daily').length,
                  weekly: stablePatterns.filter(p => p.pattern.patternType === 'weekly').length,
                  triWeekly: stablePatterns.filter(p => p.pattern.patternType === 'tri_weekly').length,
                  monthly: stablePatterns.filter(p => p.pattern.patternType === 'monthly').length,
                },
                message: dataCollectionDays < 21
                  ? `Still learning patterns (${dataCollectionDays}/21 days). Keep using the system!`
                  : `${stablePatterns.length} patterns detected with ${veryStablePatterns.length} fully stable.`,
              }, null, 2),
            }],
          };
        }

        case 'get_tier_stats': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getTierStats();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_tier_stats failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const { getTierManager } = await import('../salience_service/tier_manager.js');
          const tierManager = getTierManager();

          const stats = await tierManager.getStats(CONFIG.defaultUserId);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                hot: stats.hot,
                warm: stats.warm,
                cold: stats.cold,
                total: stats.total,
                avgAccessCount: Math.round(stats.avgAccessCount * 100) / 100,
                distribution: {
                  hotPercent: stats.total > 0 ? Math.round((stats.hot / stats.total) * 100) : 0,
                  warmPercent: stats.total > 0 ? Math.round((stats.warm / stats.total) * 100) : 0,
                  coldPercent: stats.total > 0 ? Math.round((stats.cold / stats.total) * 100) : 0,
                },
                message: stats.total === 0
                  ? 'No memories stored yet.'
                  : `${stats.hot} hot, ${stats.warm} warm, ${stats.cold} cold memories.`,
              }, null, 2),
            }],
          };
        }

        // ============================================
        // PROSODY & EMOTION TOOL HANDLERS
        // ============================================

        case 'analyze_emotion': {
          const { text, memory_id } = args as {
            text?: string;
            memory_id?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.analyzeEmotion(text, memory_id);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode analyze_emotion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!text && !memory_id) {
            throw new McpError(ErrorCode.InvalidParams, 'Either text or memory_id is required');
          }

          // Use the existing feature extractor - no duplicate logic
          const { extractFeaturesHeuristic } = await import('../salience_service/feature_extractor.js');

          let result: {
            emotionalKeywords: string[];
            sentimentScore: number;
            sentimentIntensity: number;
            conflictPresent: boolean;
            intimacySignals: boolean;
            source: string;
          };

          if (memory_id) {
            // Look up existing extractedFeatures for this memory (already computed at ingest)
            const db = getDb();
            const memory = await db.collection('memories').findOne({ id: memory_id });

            if (memory?.extractedFeatures) {
              // Use already-extracted features from salience pipeline
              const ef = memory.extractedFeatures;
              result = {
                emotionalKeywords: ef.emotionalKeywords || [],
                sentimentScore: ef.sentimentScore || 0,
                sentimentIntensity: ef.sentimentIntensity || 0,
                conflictPresent: ef.conflictPresent || false,
                intimacySignals: ef.intimacySignals || false,
                source: 'stored_features',
              };
            } else {
              // Fallback: extract from memory text if features missing
              const memoryText = memory?.text || '';
              const features = extractFeaturesHeuristic(memoryText);
              result = {
                emotionalKeywords: features.emotionalKeywords,
                sentimentScore: features.sentimentScore,
                sentimentIntensity: features.sentimentIntensity,
                conflictPresent: features.conflictPresent,
                intimacySignals: features.intimacySignals,
                source: 'extracted_now',
              };
            }
          } else {
            // Analyze provided text using the SAME heuristic as salience pipeline
            const features = extractFeaturesHeuristic(text!);
            result = {
              emotionalKeywords: features.emotionalKeywords,
              sentimentScore: features.sentimentScore,
              sentimentIntensity: features.sentimentIntensity,
              conflictPresent: features.conflictPresent,
              intimacySignals: features.intimacySignals,
              source: 'analyzed',
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                emotionalKeywords: result.emotionalKeywords,
                sentiment: {
                  score: result.sentimentScore,
                  intensity: result.sentimentIntensity,
                  label: result.sentimentScore > 0.3 ? 'positive' :
                         result.sentimentScore < -0.3 ? 'negative' : 'neutral',
                },
                signals: {
                  conflict: result.conflictPresent,
                  intimacy: result.intimacySignals,
                },
                source: result.source,
                note: 'Uses same extraction as salience pipeline. Full prosody requires Hume audio/video.',
              }, null, 2),
            }],
          };
        }

        case 'get_emotional_context': {
          const { session_id } = args as { session_id?: string };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getEmotionalContext(session_id);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_emotional_context failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const redis = getRedisClient();
          const contextId = session_id || CONFIG.defaultUserId;

          // Try to get emotional context from Redis
          const storedContext = redis ? await redis.hGetAll(`emotional_context:${contextId}`) : {};

          if (storedContext?.state) {
            const state = JSON.parse(storedContext.state);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  current: state.current || 'neutral',
                  confidence: state.confidence || 0,
                  sources: state.sources || {},
                  historyLength: state.history?.length || 0,
                  lastUpdate: storedContext.lastUpdate,
                  note: 'Real-time emotional context from active input streams.',
                }, null, 2),
              }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                current: 'neutral',
                confidence: 1.0,
                sources: {},
                historyLength: 0,
                note: 'No active emotional context. Start a session with video/voice to enable real-time emotion tracking.',
              }, null, 2),
            }],
          };
        }

        case 'start_emotional_session': {
          const {
            session_id,
            entity_id,
            use_video = false,
            use_voice = true,
            use_evi = false,
            buffer_size = 5,
          } = args as {
            session_id: string;
            entity_id?: string;
            use_video?: boolean;
            use_voice?: boolean;
            use_evi?: boolean;
            buffer_size?: number;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.startEmotionalSession(session_id, { entityId: entity_id, useVoice: use_voice, useVideo: use_video, useEvi: use_evi, bufferSize: buffer_size });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode start_emotional_session failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!session_id) {
            throw new McpError(ErrorCode.InvalidParams, 'session_id is required');
          }

          try {
            // Initialize the service if not already done
            if (!emotionalContextService.redis) {
              await emotionalContextService.initialize();
            }

            // Start the emotional context session
            const context = await emotionalContextService.startContext(session_id, {
              useVideo: use_video,
              useVoice: use_voice,
              useEVI: use_evi,
              bufferSize: buffer_size,
            });

            // Store session metadata in MongoDB for tracking
            const db = getDb();
            await db.collection('emotional_sessions').updateOne(
              { sessionId: session_id },
              {
                $set: {
                  sessionId: session_id,
                  entityId: entity_id || session_id,
                  userId: CONFIG.defaultUserId,
                  options: {
                    useVideo: use_video,
                    useVoice: use_voice,
                    useEVI: use_evi,
                    bufferSize: buffer_size,
                  },
                  startedAt: new Date().toISOString(),
                  status: 'active',
                },
              },
              { upsert: true }
            );

            logger.info(`[MCP] Started emotional session ${session_id} for entity ${entity_id || session_id}`);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  started: true,
                  sessionId: session_id,
                  entityId: entity_id || session_id,
                  options: {
                    useVideo: use_video,
                    useVoice: use_voice,
                    useEVI: use_evi,
                    bufferSize: buffer_size,
                  },
                  note: 'Emotional session started. Use get_emotional_context to retrieve fused emotional state.',
                }, null, 2),
              }],
            };
          } catch (error) {
            logger.info('[MCP] Failed to start emotional session:', error);
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to start emotional session: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        case 'stop_emotional_session': {
          const { session_id } = args as { session_id: string };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.stopEmotionalSession(session_id);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode stop_emotional_session failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!session_id) {
            throw new McpError(ErrorCode.InvalidParams, 'session_id is required');
          }

          try {
            // Stop the emotional context session
            await emotionalContextService.stopContext(session_id);

            // Update session metadata in MongoDB
            const db = getDb();
            await db.collection('emotional_sessions').updateOne(
              { sessionId: session_id },
              {
                $set: {
                  status: 'stopped',
                  stoppedAt: new Date().toISOString(),
                },
              }
            );

            logger.info(`[MCP] Stopped emotional session ${session_id}`);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  stopped: true,
                  sessionId: session_id,
                  note: 'Emotional session stopped. Buffered emotions processed and resources cleaned up.',
                }, null, 2),
              }],
            };
          } catch (error) {
            logger.info('[MCP] Failed to stop emotional session:', error);
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to stop emotional session: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        case 'list_emotional_sessions': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.listEmotionalSessions();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode list_emotional_sessions failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const db = getDb();

          // Get active sessions from MongoDB
          const sessions = await db.collection('emotional_sessions')
            .find({
              userId: CONFIG.defaultUserId,
              status: 'active',
            })
            .toArray();

          // Also check in-memory sessions from the service
          const activeSessions = Array.from(emotionalContextService.activeContexts?.keys() || []);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: sessions.length,
                sessions: sessions.map(s => ({
                  sessionId: s.sessionId,
                  entityId: s.entityId,
                  options: s.options,
                  startedAt: s.startedAt,
                  inMemory: activeSessions.includes(s.sessionId),
                })),
                note: sessions.length === 0
                  ? 'No active emotional sessions. Use start_emotional_session to begin tracking.'
                  : 'Active sessions tracking emotional state for devices/people.',
              }, null, 2),
            }],
          };
        }

        case 'set_emotion_filter': {
          const { emotions, threshold = 0.7, action, enabled = true } = args as {
            emotions: string[];
            threshold?: number;
            action: 'flag' | 'suppress' | 'block' | 'notify';
            enabled?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.setEmotionFilter(emotions, action, { threshold, enabled });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode set_emotion_filter failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!emotions || !Array.isArray(emotions) || emotions.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'emotions array is required');
          }

          if (!action) {
            throw new McpError(ErrorCode.InvalidParams, 'action is required (flag, suppress, block, or notify)');
          }

          const redis = getRedisClient();
          const filterId = `filter_${Date.now()}`;
          const filter = {
            id: filterId,
            emotions,
            threshold,
            action,
            enabled,
            createdAt: new Date().toISOString(),
            userId: CONFIG.defaultUserId,
          };

          // Store filter in Redis (if available)
          if (redis) {
            await redis.hSet(`emotion_filters:${CONFIG.defaultUserId}`, filterId, JSON.stringify(filter));
          }

          // Also store in MongoDB for persistence
          const db = getDb();
          await db.collection('emotion_filters').insertOne(filter);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                filterId,
                filter,
                message: `Emotion filter created: ${action} memories with ${emotions.join(', ')} emotions above ${threshold * 100}% confidence.`,
              }, null, 2),
            }],
          };
        }

        case 'get_emotion_filters': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getEmotionFilters();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_emotion_filters failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const redis = getRedisClient();
          const db = getDb();

          // Get filters from Redis (active) and MongoDB (persistent)
          const redisFilters = redis ? await redis.hGetAll(`emotion_filters:${CONFIG.defaultUserId}`) : {};
          const mongoFilters = await db.collection('emotion_filters')
            .find({ userId: CONFIG.defaultUserId })
            .toArray();

          const filters = Object.values(redisFilters).map((f: string) => JSON.parse(f));

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                active: filters.filter((f: { enabled: boolean }) => f.enabled),
                inactive: filters.filter((f: { enabled: boolean }) => !f.enabled),
                total: filters.length,
                persistedCount: mongoFilters.length,
              }, null, 2),
            }],
          };
        }

        case 'get_memories_by_emotion': {
          const { emotions, min_intensity = 0.3, limit = 10, exclude_suppressed = true } = args as {
            emotions: string[];
            min_intensity?: number;
            limit?: number;
            exclude_suppressed?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getMemoriesByEmotion(emotions, { minIntensity: min_intensity, limit, excludeSuppressed: exclude_suppressed });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_memories_by_emotion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!emotions || !Array.isArray(emotions) || emotions.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'emotions array is required (e.g., ["love", "angry", "worried"])');
          }

          const db = getDb();

          // Query extractedFeatures.emotionalKeywords (where salience pipeline stores emotions)
          // emotionalKeywords is an array of strings like ["love", "excited", "worried"]
          const query: Record<string, unknown> = {
            userId: CONFIG.defaultUserId,
            'extractedFeatures.emotionalKeywords': { $in: emotions },
            'extractedFeatures.sentimentIntensity': { $gte: min_intensity },
          };

          if (exclude_suppressed) {
            query['state'] = { $ne: 'suppressed' };
          }

          const memories = await db.collection('memories')
            .find(query)
            .sort({ 'extractedFeatures.sentimentIntensity': -1, createdAt: -1 })
            .limit(limit)
            .toArray();

          const formattedMemories = memories.map((m: Record<string, unknown>) => {
            const ef = m.extractedFeatures as {
              emotionalKeywords?: string[];
              sentimentScore?: number;
              sentimentIntensity?: number;
              conflictPresent?: boolean;
              intimacySignals?: boolean;
            } | undefined;

            return {
              id: m.memoryId || m.id,
              text: typeof m.text === 'string' ? m.text.slice(0, 200) : '',
              emotionalKeywords: ef?.emotionalKeywords?.filter(k => emotions.includes(k)) || [],
              sentiment: {
                score: ef?.sentimentScore || 0,
                intensity: ef?.sentimentIntensity || 0,
              },
              signals: {
                conflict: ef?.conflictPresent || false,
                intimacy: ef?.intimacySignals || false,
              },
              createdAt: m.createdAt,
              state: m.state || 'active',
            };
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query: { emotions, min_intensity },
                count: formattedMemories.length,
                memories: formattedMemories,
                note: 'Queries extractedFeatures from salience pipeline (computed at ingest).',
              }, null, 2),
            }],
          };
        }

        case 'correct_emotion': {
          const { memory_id, corrected_emotions, reason, clear_all = false } = args as {
            memory_id: string;
            corrected_emotions?: Array<{ name: string; confidence: number }>;
            reason?: string;
            clear_all?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.correctEmotion(memory_id, { correctedEmotions: corrected_emotions, clearAll: clear_all, reason });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode correct_emotion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!memory_id) {
            throw new McpError(ErrorCode.InvalidParams, 'memory_id is required');
          }

          const db = getDb();
          const redis = getRedisClient();

          // Get the existing memory
          const memory = await db.collection('memories').findOne({ id: memory_id });
          if (!memory) {
            throw new McpError(ErrorCode.InvalidParams, `Memory ${memory_id} not found`);
          }

          // Preserve original emotions for audit trail
          const originalEmotions = memory.metadata?.emotions || [];
          const correctionRecord = {
            timestamp: new Date().toISOString(),
            originalEmotions,
            correctedEmotions: clear_all ? [{ name: 'neutral', confidence: 1.0 }] : corrected_emotions,
            reason: reason || 'User correction',
            correctedBy: CONFIG.defaultUserId,
          };

          // Build the new emotions
          const newEmotions = clear_all
            ? [{ name: 'neutral', confidence: 1.0 }]
            : corrected_emotions || originalEmotions;

          // Update the memory with corrected emotions
          await db.collection('memories').updateOne(
            { id: memory_id },
            {
              $set: {
                'metadata.emotions': newEmotions,
                'metadata.emotionsCorrected': true,
                'metadata.lastEmotionCorrection': correctionRecord.timestamp,
              },
              $push: {
                'metadata.emotionCorrectionHistory': correctionRecord,
              },
            }
          );

          // Update Redis cache if exists
          const cachedEmotions = redis ? await redis.hGet(`memory:${memory_id}`, 'emotions') : null;
          if (cachedEmotions && redis) {
            await redis.hSet(`memory:${memory_id}`, 'emotions', JSON.stringify(newEmotions));
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                memory_id,
                original: originalEmotions,
                corrected: newEmotions,
                reason: correctionRecord.reason,
                message: clear_all
                  ? 'Emotion tags cleared. Memory marked as neutral.'
                  : `Emotion tags corrected. Original preserved in audit trail.`,
                note: '"Don\'t think about it, it wasn\'t meant that way" - context corrected.',
              }, null, 2),
            }],
          };
        }

        case 'clarify_intent': {
          const {
            memory_id,
            what_i_said,
            what_i_meant,
            why_the_gap,
            pattern,
            visibility = 'private',
          } = args as {
            memory_id: string;
            what_i_said?: string;
            what_i_meant: string;
            why_the_gap?: string;
            pattern?: string;
            visibility?: 'private' | 'therapist' | 'trusted' | 'open';
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.clarifyIntent(memory_id, what_i_meant, { whatISaid: what_i_said, whyTheGap: why_the_gap, pattern, visibility });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode clarify_intent failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!memory_id) {
            throw new McpError(ErrorCode.InvalidParams, 'memory_id is required');
          }
          if (!what_i_meant) {
            throw new McpError(ErrorCode.InvalidParams, 'what_i_meant is required - the truth beneath the words');
          }

          const db = getDb();

          // Get the existing memory
          const memory = await db.collection('memories').findOne({ id: memory_id });
          if (!memory) {
            throw new McpError(ErrorCode.InvalidParams, `Memory ${memory_id} not found`);
          }

          // Create the intent clarification record
          const clarification = {
            timestamp: new Date().toISOString(),
            whatISaid: what_i_said || memory.text?.slice(0, 500),
            whatIMeant: what_i_meant,
            whyTheGap: why_the_gap,
            pattern: pattern,
            visibility: visibility,
            clarifiedBy: CONFIG.defaultUserId,
          };

          // SECURITY: Encrypt the clarification if it's personal (it almost always is)
          // This is the most vulnerable data - the truth someone couldn't speak
          const encryptedClarification = shouldEncryptMemory('Tier3_Vault')
            ? {
                ...clarification,
                whatIMeant: encryptMemoryContent(what_i_meant),
                whyTheGap: why_the_gap ? encryptMemoryContent(why_the_gap) : undefined,
                pattern: pattern ? encryptMemoryContent(pattern) : undefined,
                encrypted: true,
              }
            : clarification;

          // Update the memory with the intent clarification
          await db.collection('memories').updateOne(
            { id: memory_id },
            {
              $set: {
                'metadata.hasIntentClarification': true,
                'metadata.lastIntentClarification': clarification.timestamp,
              },
              $push: {
                'metadata.intentClarifications': encryptedClarification,
              },
            }
          );

          // Also store in a separate collection for pattern analysis
          // (e.g., finding all times user deflected when vulnerable)
          if (pattern) {
            await db.collection('intent_patterns').insertOne({
              memoryId: memory_id,
              userId: CONFIG.defaultUserId,
              pattern: pattern,
              timestamp: clarification.timestamp,
              visibility: visibility,
            });
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                memory_id,
                clarification: {
                  whatISaid: what_i_said ? what_i_said.slice(0, 100) + '...' : '[from memory]',
                  whatIMeant: what_i_meant.slice(0, 100) + (what_i_meant.length > 100 ? '...' : ''),
                  whyTheGap: why_the_gap,
                  pattern: pattern,
                  visibility: visibility,
                },
                message: 'Intent clarified. The truth beneath the words is now preserved.',
                note: 'This clarification is encrypted at Tier3_Vault level - your deepest truths are protected.',
              }, null, 2),
            }],
          };
        }

        // ========================================================================
        // RELATIONSHIP INTELLIGENCE HANDLERS
        // ========================================================================

        case 'get_relationship': {
          const {
            entity_a,
            entity_b,
            context: relationshipContext,
            force_refresh = false,
          } = args as {
            entity_a: string;
            entity_b: string;
            context?: string;
            force_refresh?: boolean;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getRelationship(entity_a, entity_b, { context: relationshipContext, forceRefresh: force_refresh });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_relationship failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!entity_a || !entity_b) {
            throw new McpError(ErrorCode.InvalidParams, 'Both entity_a and entity_b are required');
          }

          const db = getDb();

          // Get shared memories between the two entities
          const memories = await db.collection('memories')
            .find({
              userId: CONFIG.defaultUserId,
              state: { $ne: 'suppressed' },
              $or: [
                { 'extractedFeatures.entities.people': { $all: [entity_a, entity_b] } },
                { text: { $regex: entity_a, $options: 'i' }, 'text': { $regex: entity_b, $options: 'i' } },
              ],
            })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();

          if (memories.length === 0) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  entity_a,
                  entity_b,
                  synthesis: `No shared memories found between ${entity_a} and ${entity_b}. Relationship unknown.`,
                  strength: 0,
                  sentiment: 0,
                  evidence_count: 0,
                }, null, 2),
              }],
            };
          }

          // For now, synthesize without LLM (can add LLM synthesis later)
          const recentMemories = memories.slice(0, 5).map((m: Record<string, unknown>) => ({
            date: typeof m.createdAt === 'string' ? m.createdAt.split('T')[0] : 'unknown',
            text: typeof m.text === 'string' ? m.text.slice(0, 100) : '',
          }));

          const strength = Math.min(1, memories.length / 10);
          const sentiment = 0; // Would need emotion analysis

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                entity_a,
                entity_b,
                context: relationshipContext,
                synthesis: `${entity_a} and ${entity_b} have ${memories.length} shared memories. Relationship computed from evidence, not stored edges.`,
                strength,
                sentiment,
                recent_trend: 'stable',
                evidence_count: memories.length,
                recent_evidence: recentMemories,
                note: 'Full LLM synthesis available when LLM provider configured.',
              }, null, 2),
            }],
          };
        }

        case 'get_entity_pressure': {
          const {
            entity_id,
            include_vectors = false,
            days = 30,
          } = args as {
            entity_id: string;
            include_vectors?: boolean;
            days?: number;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getEntityPressure(entity_id, { includeVectors: include_vectors, days });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_entity_pressure failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!entity_id) {
            throw new McpError(ErrorCode.InvalidParams, 'entity_id is required');
          }

          const db = getDb();

          // Get pressure record for entity
          const pressureRecord = await db.collection('entity_pressure').findOne({
            entityId: entity_id,
          });

          if (!pressureRecord) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  entity_id,
                  pressureScore: 0,
                  pressureTrend: 'stable',
                  patterns: {
                    receivingFromMultipleSources: false,
                    transmittingToOthers: false,
                    escalating: false,
                  },
                  interventionUrgency: 'none',
                  message: 'No pressure data recorded for this entity yet.',
                }, null, 2),
              }],
            };
          }

          // Filter vectors by time window if requested
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

          const response: Record<string, unknown> = {
            entity_id,
            pressureScore: pressureRecord.pressureScore,
            pressureTrend: pressureRecord.pressureTrend,
            patterns: pressureRecord.patterns,
            interventionUrgency: pressureRecord.interventionUrgency,
            careCircle: pressureRecord.careCircle,
            lastUpdated: pressureRecord.lastUpdated,
          };

          if (include_vectors) {
            response.negativeInputs = (pressureRecord.negativeInputs || [])
              .filter((v: { timestamp: string }) => v.timestamp >= cutoff);
            response.positiveInputs = (pressureRecord.positiveInputs || [])
              .filter((v: { timestamp: string }) => v.timestamp >= cutoff);
            response.negativeOutputs = (pressureRecord.negativeOutputs || [])
              .filter((v: { timestamp: string }) => v.timestamp >= cutoff);
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(response, null, 2),
            }],
          };
        }

        case 'get_predictions': {
          const {
            context: predictionContext,
            max_results = 3,
          } = args as {
            context: {
              talking_to?: string[];
              location?: string;
              location_type?: string;
              activity?: string;
              activity_type?: string;
              topics?: string[];
              emotional_state?: string;
              device_type?: string;
            };
            max_results?: number;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getPredictions(predictionContext, max_results);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_predictions failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!predictionContext) {
            throw new McpError(ErrorCode.InvalidParams, 'context is required');
          }

          const db = getDb();

          // Get active prediction hooks for this user
          const hooks = await db.collection('prediction_hooks')
            .find({
              entityId: CONFIG.defaultUserId,
              disabled: { $ne: true },
              $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: { $gt: new Date().toISOString() } },
              ],
            })
            .toArray();

          // Evaluate hooks against context (simplified matching)
          const surfaced: Array<{ hookId: string; memoryId: string; priority: string; matchedConditions: string[] }> = [];

          for (const hook of hooks) {
            const matchedConditions: string[] = [];
            let allMatch = true;

            for (const condition of (hook.conditions || [])) {
              let matches = false;

              switch (condition.type) {
                case 'talking_to':
                  matches = predictionContext.talking_to?.some(
                    (t: string) => t.toLowerCase().includes(String(condition.value).toLowerCase())
                  ) || false;
                  break;
                case 'location':
                  matches = predictionContext.location?.toLowerCase().includes(String(condition.value).toLowerCase()) || false;
                  break;
                case 'location_type':
                  matches = predictionContext.location_type === condition.value;
                  break;
                case 'activity':
                case 'activity_type':
                  matches = predictionContext.activity_type === condition.value ||
                           predictionContext.activity?.toLowerCase().includes(String(condition.value).toLowerCase()) || false;
                  break;
                case 'topic':
                  matches = predictionContext.topics?.some(
                    (t: string) => t.toLowerCase().includes(String(condition.value).toLowerCase())
                  ) || false;
                  break;
              }

              if (matches) {
                matchedConditions.push(`${condition.type}:${condition.value}`);
              } else {
                allMatch = false;
                break;
              }
            }

            if (allMatch && matchedConditions.length > 0) {
              surfaced.push({
                hookId: hook.hookId,
                memoryId: hook.memoryId,
                priority: hook.priority || 'medium',
                matchedConditions,
              });
            }
          }

          // Get memory text for surfaced hooks
          const memoryIds = surfaced.map(s => s.memoryId);
          const memories = memoryIds.length > 0
            ? await db.collection('memories')
                .find({ memoryId: { $in: memoryIds } })
                .toArray()
            : [];

          const memoryMap = new Map(memories.map((m: Record<string, unknown>) => [m.memoryId, m.text]));

          const results = surfaced.slice(0, max_results).map(s => ({
            ...s,
            surfaceText: memoryMap.get(s.memoryId) || '[Memory not found]',
          }));

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                context: predictionContext,
                surfaced_count: results.length,
                total_hooks_evaluated: hooks.length,
                predictions: results,
                note: results.length === 0
                  ? 'No predictions match current context. Hooks are generated when memories are stored.'
                  : 'These memories matched your current context and surfaced proactively.',
              }, null, 2),
            }],
          };
        }

        case 'record_prediction_feedback': {
          const {
            hook_id,
            interaction,
            context: feedbackContext,
          } = args as {
            hook_id: string;
            interaction: 'dismissed' | 'viewed' | 'acted_on' | 'saved' | 'blocked';
            context?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.recordPredictionFeedback(hook_id, interaction, feedbackContext);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode record_prediction_feedback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!hook_id || !interaction) {
            throw new McpError(ErrorCode.InvalidParams, 'hook_id and interaction are required');
          }

          const db = getDb();

          // Calculate confidence adjustment
          const confidenceDeltas: Record<string, number> = {
            acted_on: 0.1,
            saved: 0.1,
            viewed: 0.02,
            dismissed: -0.05,
            blocked: -0.3,
          };

          const delta = confidenceDeltas[interaction] || 0;

          // Update hook with feedback
          const result = await db.collection('prediction_hooks').updateOne(
            { hookId: hook_id },
            {
              $push: {
                feedbackHistory: {
                  timestamp: new Date().toISOString(),
                  interactionType: interaction,
                  context: feedbackContext,
                },
              },
              $inc: { confidence: delta },
              $set: {
                disabled: interaction === 'blocked',
              },
            }
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: result.modifiedCount > 0,
                hook_id,
                interaction,
                confidence_delta: delta,
                disabled: interaction === 'blocked',
                message: interaction === 'blocked'
                  ? 'Hook disabled - will not surface again.'
                  : 'Feedback recorded. System is learning your preferences.',
              }, null, 2),
            }],
          };
        }

        case 'recall_vote': {
          const { votes, query_context } = args as {
            votes: Array<{ memoryId: string; vote: 'hot' | 'warm' | 'cold' | 'wrong' | 'spark' }>;
            query_context?: string;
          };

          if (!votes || !Array.isArray(votes) || votes.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'votes array is required and must not be empty');
          }

          // Salience deltas per vote type (context-specific, not global)
          const salienceDeltas: Record<string, number> = {
            hot: 10,
            warm: 5,
            cold: -5,
            wrong: -10,
            spark: 0, // No salience change, but stores association
          };

          // REST mode: route through ALB
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.voteOnMemories(votes, query_context);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    mode: 'rest',
                    ...result,
                    message: 'Votes recorded. Salience scores adjusted.',
                  }, null, 2),
                }],
              };
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `recall_vote failed: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
            }
          }

          // Direct mode: MongoDB
          const db = getDb();
          if (!db) {
            throw new McpError(ErrorCode.InternalError, 'No database connection available');
          }

          const adjustments: Array<{ memoryId: string; vote: string; delta: number; success: boolean }> = [];

          for (const { memoryId, vote } of votes) {
            const delta = salienceDeltas[vote] ?? 0;

            if (delta !== 0) {
              // Adjust salience, clamping to 0-100
              const result = await db.collection('memories').updateOne(
                { id: memoryId },
                [
                  {
                    $set: {
                      salience: {
                        $min: [100, { $max: [0, { $add: [{ $ifNull: ['$salience', 50] }, delta] }] }],
                      },
                      lastVotedAt: new Date().toISOString(),
                    },
                  },
                ]
              );
              adjustments.push({ memoryId, vote, delta, success: result.modifiedCount > 0 });
            } else {
              // Spark: store as association, no salience change
              if (vote === 'spark' && query_context) {
                await db.collection('memory_associations').insertOne({
                  sourceQuery: query_context,
                  sparkMemoryId: memoryId,
                  createdAt: new Date().toISOString(),
                });
              }
              adjustments.push({ memoryId, vote, delta: 0, success: true });
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                updated: adjustments.filter(a => a.success).length,
                adjustments,
                query_context: query_context || null,
                message: 'Votes recorded locally. Salience scores adjusted.',
              }, null, 2),
            }],
          };
        }

        case 'set_care_circle': {
          const {
            entity_id,
            care_circle,
            alert_threshold = 'concern',
          } = args as {
            entity_id: string;
            care_circle: string[];
            alert_threshold?: 'monitor' | 'concern' | 'urgent';
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.setCareCircle(entity_id, care_circle, alert_threshold);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode set_care_circle failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!entity_id || !care_circle || !Array.isArray(care_circle)) {
            throw new McpError(ErrorCode.InvalidParams, 'entity_id and care_circle array are required');
          }

          const db = getDb();

          // Update or create entity pressure record with care circle
          await db.collection('entity_pressure').updateOne(
            { entityId: entity_id },
            {
              $set: {
                careCircle: care_circle,
                alertThreshold: alert_threshold,
                updatedAt: new Date().toISOString(),
              },
              $setOnInsert: {
                entityId: entity_id,
                pressureScore: 0,
                pressureTrend: 'stable',
                patterns: {
                  receivingFromMultipleSources: false,
                  transmittingToOthers: false,
                  behaviorChangeDetected: false,
                  isolating: false,
                  escalating: false,
                },
                interventionUrgency: 'none',
                negativeInputs: [],
                positiveInputs: [],
                negativeOutputs: [],
                positiveOutputs: [],
                createdAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                entity_id,
                care_circle,
                alert_threshold,
                message: `Care circle set. ${care_circle.join(', ')} will be notified when pressure reaches "${alert_threshold}" level.`,
              }, null, 2),
            }],
          };
        }

        // ============================================
        // EVENT DAEMON HANDLERS - Real-time Guardian
        // ============================================
        case 'ingest_event': {
          const {
            type,
            entity_id,
            device_id,
            payload = {},
            metadata = {},
          } = args as {
            type: EventType;
            entity_id: string;
            device_id?: string;
            payload?: Record<string, unknown>;
            metadata?: {
              caller_id?: string;
              caller_name?: string;
              caller_number?: string;
              transcript?: string;
              keywords?: string[];
              location?: string;
            };
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.ingestEvent({ type, entity_id, device_id, payload, metadata });
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode ingest_event failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!type || !entity_id) {
            throw new McpError(ErrorCode.InvalidParams, 'type and entity_id are required');
          }

          // Start daemon if not running
          if (!eventDaemon.getStatus().running) {
            eventDaemon.start();
          }

          // Create event
          const event: ExternalEvent = {
            eventId: `event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            type,
            timestamp: new Date().toISOString(),
            entityId: entity_id,
            deviceId: device_id,
            payload,
            metadata: {
              callerId: metadata.caller_id,
              callerName: metadata.caller_name,
              callerNumber: metadata.caller_number,
              transcript: metadata.transcript,
              keywords: metadata.keywords,
              location: metadata.location,
            },
          };

          // Ingest and process
          await eventDaemon.ingestEvent(event);

          // Wait a moment for processing (for critical events)
          await new Promise(resolve => setTimeout(resolve, 200));

          // Check if action was taken
          const db = getDb();
          const action = await db.collection('guardian_actions').findOne(
            { eventId: event.eventId },
            { sort: { executedAt: -1 } }
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                event_id: event.eventId,
                type,
                entity_id,
                processed: true,
                action_taken: action ? {
                  type: action.actionType,
                  result: action.result,
                  notified_care_circle: action.notifiedCareCircle,
                } : null,
                message: action
                  ? `Event processed. Action: ${action.actionType}. ${action.result}`
                  : `Event logged for ${entity_id}. No immediate action needed.`,
              }, null, 2),
            }],
          };
        }

        case 'schedule_check': {
          const {
            entity_id,
            check_type,
            delay_minutes,
            message,
          } = args as {
            entity_id: string;
            check_type: 'meal_reminder' | 'medication_reminder' | 'check_in' | 'custom';
            delay_minutes: number;
            message?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.scheduleCheck(entity_id, check_type, delay_minutes, message);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode schedule_check failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!entity_id || !check_type || !delay_minutes) {
            throw new McpError(ErrorCode.InvalidParams, 'entity_id, check_type, and delay_minutes are required');
          }

          // Start daemon if not running
          if (!eventDaemon.getStatus().running) {
            eventDaemon.start();
          }

          const checkId = eventDaemon.scheduleCheck(
            entity_id,
            check_type,
            delay_minutes * 60 * 1000, // Convert to ms
            { message }
          );

          const triggerTime = new Date(Date.now() + delay_minutes * 60 * 1000);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                check_id: checkId,
                entity_id,
                check_type,
                scheduled_for: triggerTime.toISOString(),
                delay_minutes,
                message: message || `${check_type} check scheduled`,
              }, null, 2),
            }],
          };
        }

        case 'get_daemon_status': {
          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.getDaemonStatus();
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode get_daemon_status failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          const status = eventDaemon.getStatus();

          // Get recent actions
          const db = getDb();
          const recentActions = await db.collection('guardian_actions')
            .find({})
            .sort({ executedAt: -1 })
            .limit(5)
            .toArray();

          const recentScamAttempts = await db.collection('scam_attempts')
            .find({})
            .sort({ timestamp: -1 })
            .limit(5)
            .toArray();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                daemon: status,
                recent_actions: recentActions.map(a => ({
                  action_id: a.actionId,
                  entity_id: a.entityId,
                  type: a.actionType,
                  result: a.result,
                  executed_at: a.executedAt,
                })),
                recent_scam_attempts: recentScamAttempts.map(s => ({
                  entity_id: s.entityId,
                  pattern: s.pattern,
                  intercepted: s.intercepted,
                  timestamp: s.timestamp,
                })),
              }, null, 2),
            }],
          };
        }

        case 'set_entity_vulnerability': {
          const {
            entity_id,
            vulnerability,
            notes,
          } = args as {
            entity_id: string;
            vulnerability: 'normal' | 'moderate' | 'high';
            notes?: string;
          };

          if (connectionMode === 'rest' && apiClient) {
            try {
              const result = await apiClient.setEntityVulnerability(entity_id, vulnerability, notes);
              return { content: [{ type: 'text', text: JSON.stringify({ mode: 'rest', ...result }, null, 2) }] };
            } catch (err) {
              throw new McpError(ErrorCode.InternalError, `REST mode set_entity_vulnerability failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }

          if (!entity_id || !vulnerability) {
            throw new McpError(ErrorCode.InvalidParams, 'entity_id and vulnerability are required');
          }

          const db = getDb();

          await db.collection('entities').updateOne(
            { entityId: entity_id },
            {
              $set: {
                vulnerability,
                vulnerabilityNotes: notes,
                vulnerabilitySetAt: new Date().toISOString(),
              },
              $setOnInsert: {
                entityId: entity_id,
                createdAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );

          const protectionLevel = {
            normal: 'Standard monitoring',
            moderate: 'Enhanced monitoring, scam warnings enabled',
            high: 'Maximum protection: scam interception, silence monitoring, care circle alerts',
          }[vulnerability];

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                entity_id,
                vulnerability,
                notes,
                protection_level: protectionLevel,
                message: `${entity_id} vulnerability set to "${vulnerability}". ${protectionLevel}.`,
              }, null, 2),
            }],
          };
        }

        // ============================================
        // DEV ONLY - Remove before production
        // ============================================
        case 'dev_clear_collection': {
          const { collection, confirm } = args as { collection: string; confirm: boolean };

          if (!confirm) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'Must set confirm: true to clear collection',
                  collection,
                }, null, 2),
              }],
            };
          }

          const allowedCollections = ['open_loops', 'patterns', 'context_frames'];
          if (!allowedCollections.includes(collection)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'Collection not allowed',
                  allowed: allowedCollections,
                }, null, 2),
              }],
            };
          }

          // Route through API (server has MongoDB access)
          if (connectionMode === 'rest' && apiClient) {
            const result = await apiClient.devClearCollection(collection);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  mode: 'rest',
                  ...result,
                  warning: 'DEV ONLY - Remove before production',
                }, null, 2),
              }],
            };
          }

          // Direct mode fallback (local dev with MongoDB)
          const db = await initializeDb();
          const result = await db.collection(collection).deleteMany({});

          console.error(`[DEV] Cleared ${collection}: ${result.deletedCount} documents`);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                mode: 'direct',
                cleared: true,
                collection,
                deletedCount: result.deletedCount,
                warning: 'DEV ONLY - Remove before production',
              }, null, 2),
            }],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    }

    // ================================================================
    // EXECUTE TOOL WITH PRE/POST HOOKS AND ENRICHMENT
    // ================================================================
    try {
      const toolResult = await executeToolCall();

      // POST-TOOL HOOK: Record observation for pattern learning
      await recordToolObservation(
        CONFIG.defaultUserId,
        name,
        execContext.memoriesAccessed,
        execContext.topicsDiscussed,
        execContext.peopleInvolved
      ).catch(e => logger.info('[MCP] Post-hook error:', e));

      // RESPONSE ENRICHMENT: Wrap result with context
      return wrapWithEnrichment(toolResult, enrichment, name);

    } catch (error) {
      // Record observation even on error
      await recordToolObservation(
        CONFIG.defaultUserId,
        name,
        execContext.memoriesAccessed,
        execContext.topicsDiscussed,
        execContext.peopleInvolved
      ).catch(e => logger.info('[MCP] Post-hook error:', e));

      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // ============================================
  // RESOURCES
  // ============================================

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'memory://recent',
        name: 'Recent Memories',
        description: 'Recent high-salience memories from the past week',
        mimeType: 'application/json',
      },
      {
        uri: 'memory://loops',
        name: 'Open Loops',
        description: 'Commitments and follow-ups awaiting action',
        mimeType: 'application/json',
      },
      {
        uri: 'memory://contacts',
        name: 'Contacts',
        description: 'Known contacts with relationship data',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    await initializeDb();
    const { uri } = request.params;

    switch (uri) {
      case 'memory://recent': {
        // REST MODE: Use API recall
        if (connectionMode === 'rest' && apiClient) {
          const result = await apiClient.recall('recent', { limit: 20 });
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result.memories.map(m => ({
                id: m.id,
                text: m.content?.slice(0, 300),
                salience: m.salience,
                createdAt: m.createdAt,
              })), null, 2),
            }],
          };
        }

        const memories = await retrieveMemoriesByQuery(
          CONFIG.defaultUserId,
          '', // Empty query = recent
          { limit: 20, minSalience: 30 }
        );

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                memories.map((m: ScoredMemory) => ({
                  id: m.memoryId,
                  text: m.text?.slice(0, 300),
                  salience: m.salienceScore,
                  people: m.peopleMentioned,
                  createdAt: m.createdAt,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'memory://loops': {
        // REST MODE: Use API for loops
        if (connectionMode === 'rest' && apiClient) {
          const loops = await apiClient.listLoops();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(loops, null, 2),
            }],
          };
        }

        const loops = await getOpenLoops(CONFIG.defaultUserId, { includeOverdue: true });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                loops.map((loop: any) => ({
                  id: loop.id || loop._id?.toString(),
                  description: loop.description,
                  owner: loop.owner,
                  otherParty: loop.otherParty,
                  dueDate: loop.dueDate,
                  isOverdue: loop.isOverdue,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'memory://contacts': {
        // REST MODE: Not available without direct DB
        if (connectionMode === 'rest') {
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ mode: 'rest', message: 'Contacts resource not available in REST mode' }),
            }],
          };
        }

        const [active, cold] = await Promise.all([
          getActiveRelationships(CONFIG.defaultUserId),
          getColdRelationships(CONFIG.defaultUserId),
        ]);

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  active: active.map((r: any) => ({
                    name: r.contactName,
                    lastInteraction: r.lastInteraction || r.lastInteractionAt,
                    interactionCount: r.totalInteractions,
                    trend: r.interactionTrend || r.engagementTrend,
                  })),
                  cold: cold.map((r: any) => ({
                    name: r.contactName,
                    lastInteraction: r.lastInteraction || r.lastInteractionAt,
                    daysSinceContact: r.daysSinceLastInteraction,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
  });

  // ============================================
  // PROMPTS
  // ============================================

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'daily_briefing',
        description: 'Get a summary of what needs attention today',
      },
      {
        name: 'person_context',
        description: 'Get full context about a person before a conversation',
        arguments: [
          {
            name: 'person',
            description: 'Name of the person',
            required: true,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    await initializeDb();
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'daily_briefing': {
        // REST MODE: Simplified briefing
        if (connectionMode === 'rest' && apiClient) {
          const healthy = await apiClient.healthCheck();
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `Daily briefing (REST mode):\n\nAPI Status: ${healthy ? 'Connected' : 'Unreachable'}\nMode: Cloud API\n\nUse recall and store_memory tools to interact with memories.`,
              },
            }],
          };
        }

        const [status, loops] = await Promise.all([
          getSalienceStatus(CONFIG.defaultUserId),
          getOpenLoops(CONFIG.defaultUserId, { includeOverdue: true }),
        ]);

        const overdueLoops = loops.filter((l) => l.isOverdue);
        const upcomingLoops = loops.filter((l) => !l.isOverdue).slice(0, 5);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Here's your daily memory briefing:

## Open Commitments
- You owe: ${status.openLoopsCount.youOwe} items
- They owe you: ${status.openLoopsCount.theyOwe} items
- Overdue: ${status.openLoopsCount.overdue} items

${overdueLoops.length > 0 ? `### Overdue Items\n${overdueLoops.map((l) => `- ${l.description} (${l.otherParty})`).join('\n')}` : ''}

${upcomingLoops.length > 0 ? `### Upcoming\n${upcomingLoops.map((l) => `- ${l.description} (${l.otherParty}) - due ${l.dueDate || 'no date'}`).join('\n')}` : ''}

## Relationships
- Active: ${status.activeRelationshipsCount}
- Going cold: ${status.coldRelationshipsCount}

## Upcoming Events
${status.upcomingEventsCount} events in the next 2 weeks

What would you like to focus on?`,
              },
            },
          ],
        };
      }

      case 'person_context': {
        const person = args?.person as string;
        if (!person) {
          throw new McpError(ErrorCode.InvalidParams, 'person argument is required');
        }

        // REST MODE: Use API recall for person context
        if (connectionMode === 'rest' && apiClient) {
          const result = await apiClient.recall(`context ${person}`, { entity: person, limit: 10 });
          return {
            messages: [{
              role: 'user',
              content: {
                type: 'text',
                text: `Context for ${person} (REST mode):\n\n${result.memories.length ? result.memories.map(m => `- ${m.content.slice(0, 150)}`).join('\n') : 'No memories found for ' + person}`,
              },
            }],
          };
        }

        const briefing = await generateBriefing(CONFIG.defaultUserId, person) as any;

        // Extract loops from openLoops property
        const youOweThem = briefing.openLoops?.youOweThem || [];
        const theyOweYou = briefing.openLoops?.theyOweYou || [];

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Here's what you should know before talking to ${person}:

## What You Owe Them
${youOweThem.length ? youOweThem.map((l: any) => `- ${l.description}`).join('\n') : 'Nothing pending'}

## What They Owe You
${theyOweYou.length ? theyOweYou.map((l: any) => `- ${l.description}`).join('\n') : 'Nothing pending'}

## Their Upcoming Events
${briefing.theirTimeline?.length ? briefing.theirTimeline.map((e: any) => `- ${e.description} (${e.eventDate || 'TBD'})`).join('\n') : 'None known'}

## Recent Context
${briefing.recentMemories?.length ? briefing.recentMemories.map((m: any) => m.text?.slice(0, 100)).join('\n') : 'No recent interactions'}

## Sensitivities
${briefing.sensitivities?.length ? briefing.sensitivities.join('\n') : 'None flagged'}

## Relationship Status
- Last interaction: ${briefing.relationship?.lastInteraction || 'Unknown'}
- Engagement trend: ${briefing.relationship?.trend || 'Unknown'}`,
              },
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
    }
  });

  return server;
}

/**
 * Create Express app with OAuth endpoints for remote MCP server.
 */
function createExpressApp() {
  const app = express();

  // Trust nginx reverse proxy for correct protocol (https) in URLs
  app.set('trust proxy', 1);

  // CORS configuration for Claude.ai and MCP spec
  app.use(cors({
    origin: CONFIG.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Accept'],
    exposedHeaders: ['Mcp-Session-Id'],
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // HTTP request logging — the nervous system's breath
  app.use(morgan(':method :url :status :response-time ms', {
    stream: logger.stream as any,
    skip: (_req: Request, res: Response) => res.statusCode < 400 && (logger as any).level === 'error',
  }));

  // Runtime log level control — tickle or calm the nerves
  app.post('/admin/log-level', (req: Request, res: Response) => {
    const { level } = req.body;
    if (setLogLevel(level)) {
      logger.info(`[MCP] Log level changed to: ${level}`);
      return res.json({ level, previous: getLogLevel() });
    }
    return res.status(400).json({ error: 'Invalid level. Use: error, warn, info, debug' });
  });
  app.get('/admin/log-level', (_req: Request, res: Response) => {
    res.json({ level: getLogLevel() });
  });

  // Landing page
  app.get('/', (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MemoRable — AI Memory System</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=block" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e0e0e0;font-family:'Share Tech Mono',monospace;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.container{max-width:800px;padding:2rem;text-align:center}
h1{font-family:'Orbitron',sans-serif;font-size:3rem;background:linear-gradient(135deg,#00f0ff,#bf00ff,#ff006e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:0.5rem}
.tagline{color:#888;font-size:1.1rem;margin-bottom:3rem}
.links{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;margin-top:2rem}
.links a{display:inline-block;padding:0.75rem 1.5rem;border:1px solid #333;border-radius:8px;color:#00f0ff;text-decoration:none;transition:all 0.3s}
.links a:hover{border-color:#00f0ff;background:rgba(0,240,255,0.05);box-shadow:0 0 20px rgba(0,240,255,0.1)}
.status{margin-top:3rem;padding:1rem;border:1px solid #1a1a2e;border-radius:8px;font-size:0.85rem;color:#666}
.status .live{color:#00ff88}
.version{color:#444;margin-top:1rem;font-size:0.75rem}
</style></head><body>
<div class="container">
<h1>MemoRable</h1>
<p class="tagline">AI that knows you like a friend, every time you talk to it.</p>
<div class="links">
<a href="${baseUrl}/health">Health</a>
<a href="${baseUrl}/.well-known/oauth-authorization-server">OAuth Discovery</a>
<a href="${baseUrl}/mcp">MCP Endpoint</a>
<a href="https://github.com/alanchelmickjr/memoRable">GitHub</a>
<a href="https://memorable.chat">Home</a>
</div>
<div class="status"><span class="live">●</span> System Online — MCP v2.0.0 — OAuth Enabled</div>
<div class="version">Perfect memory is about knowing what to forget.</div>
</div></body></html>`);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: '2.0.0',
      transport: 'http',
      oauth: CONFIG.oauth.enabled,
    });
  });

  // ─── MCP-spec OAuth 2.1 discovery endpoints (standalone mode) ─────
  // Dynamic client registration store
  const registeredClientsStandalone = new Map<string, { clientId: string; clientSecret: string; redirectUris: string[]; clientName: string; createdAt: Date }>();

  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      revocation_endpoint: `${baseUrl}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'write', 'mcp'],
    });
  });

  app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['read', 'write', 'mcp'],
    });
  });

  app.post('/register', async (req: Request, res: Response) => {
    const { redirect_uris, client_name, grant_types, response_types, token_endpoint_auth_method } = req.body;
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'At least one redirect_uri is required' });
    }
    const clientId = randomUUID();
    const clientSecret = randomUUID();
    registeredClientsStandalone.set(clientId, { clientId, clientSecret, redirectUris: redirect_uris, clientName: client_name || 'MCP Client', createdAt: new Date() });
    logger.info(`[MCP] Dynamic client registered: ${clientId} (${client_name || 'unnamed'})`);
    return res.status(201).json({
      client_id: clientId, client_secret: clientSecret, client_name: client_name || 'MCP Client',
      redirect_uris, grant_types: grant_types || ['authorization_code', 'refresh_token'],
      response_types: response_types || ['code'], token_endpoint_auth_method: token_endpoint_auth_method || 'client_secret_post',
    });
  });

  app.get('/authorize', async (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) return res.status(501).json({ error: 'OAuth not enabled' });
    const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.query;
    if (response_type !== 'code') return res.status(400).json({ error: 'unsupported_response_type' });
    const dynamicClient = registeredClientsStandalone.get(client_id as string);
    const isStaticClient = client_id === CONFIG.oauth.clientId;
    const isPublicPKCE = !dynamicClient && !isStaticClient && code_challenge;
    if (!dynamicClient && !isStaticClient && !isPublicPKCE) return res.status(400).json({ error: 'invalid_client' });
    if (dynamicClient && !dynamicClient.redirectUris.includes(redirect_uri as string)) return res.status(400).json({ error: 'invalid_redirect_uri' });
    const code = randomUUID();
    const authCode: AuthorizationCode = { code, clientId: client_id as string, redirectUri: redirect_uri as string, userId: CONFIG.defaultUserId, scope: (scope as string || 'read write mcp').split(' '), expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    if (code_challenge) { (authCode as any).codeChallenge = code_challenge; (authCode as any).codeChallengeMethod = code_challenge_method || 'S256'; }
    await storeAuthCode(code, authCode);
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state as string);
    res.redirect(redirectUrl.toString());
  });

  app.post('/token', async (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) return res.status(501).json({ error: 'OAuth not enabled' });
    const { grant_type, code, refresh_token, code_verifier } = req.body;

    // Extract client credentials from body OR Basic auth header (RFC 6749 §2.3)
    let client_id = req.body.client_id;
    let client_secret = req.body.client_secret;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [basicId, basicSecret] = decoded.split(':');
      client_id = client_id || decodeURIComponent(basicId);
      client_secret = client_secret || decodeURIComponent(basicSecret);
    }

    logger.info(`[MCP] Token request: grant_type=${grant_type}, client_id=${client_id ? client_id.slice(0, 8) + '...' : 'MISSING'}, has_secret=${!!client_secret}, has_code=${!!code}`);

    const dynamicClient = registeredClientsStandalone.get(client_id);
    const isStaticClient = client_id === CONFIG.oauth.clientId && client_secret === CONFIG.oauth.clientSecret;
    const isDynamicValid = dynamicClient && dynamicClient.clientSecret === client_secret;
    const isPublicClient = !client_secret && code_verifier;
    if (!isStaticClient && !isDynamicValid && !isPublicClient) {
      logger.warn(`[MCP] Token rejected: client_id=${client_id ? client_id.slice(0, 8) + '...' : 'MISSING'}, dynamic=${!!dynamicClient}, static=${isStaticClient}, public=${!!isPublicClient}`);
      return res.status(401).json({ error: 'invalid_client' });
    }
    if (grant_type === 'authorization_code') {
      const authCode = await getAuthCode(code);
      if (!authCode || new Date(authCode.expiresAt) < new Date()) { await deleteAuthCode(code); return res.status(400).json({ error: 'invalid_grant' }); }
      if ((authCode as any).codeChallenge && code_verifier) {
        const hash = createHash('sha256').update(code_verifier).digest('base64url');
        if (hash !== (authCode as any).codeChallenge) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }
      await deleteAuthCode(code);
      const accessToken = jwt.sign({ userId: authCode.userId, scope: authCode.scope, clientId: client_id }, CONFIG.oauth.jwtSecret, { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions);
      const newRefreshToken = randomUUID();
      await storeToken(newRefreshToken, { accessToken, refreshToken: newRefreshToken, userId: authCode.userId, clientId: client_id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), scope: authCode.scope });
      return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: newRefreshToken, scope: authCode.scope.join(' ') });
    } else if (grant_type === 'refresh_token') {
      const token = await getToken(refresh_token);
      if (!token || new Date(token.expiresAt) < new Date()) { await deleteToken(refresh_token); return res.status(400).json({ error: 'invalid_grant' }); }
      const accessToken = jwt.sign({ userId: token.userId, scope: token.scope, clientId: client_id }, CONFIG.oauth.jwtSecret, { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions);
      return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, scope: token.scope.join(' ') });
    }
    return res.status(400).json({ error: 'unsupported_grant_type' });
  });

  app.post('/revoke', async (req: Request, res: Response) => {
    const { token } = req.body;
    if (token) await deleteToken(token);
    res.status(200).json({ revoked: true });
  });

  // Legacy OAuth 2.0 Authorization endpoint (kept for backwards compatibility)
  // SECURITY FIX: OAuth handlers now use encrypted Redis storage
  app.get('/oauth/authorize', async (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) {
      return res.status(501).json({ error: 'OAuth not enabled' });
    }

    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (response_type !== 'code') {
      return res.status(400).json({ error: 'unsupported_response_type' });
    }

    if (client_id !== CONFIG.oauth.clientId) {
      return res.status(400).json({ error: 'invalid_client' });
    }

    // Generate authorization code
    const code = randomUUID();
    const authCode: AuthorizationCode = {
      code,
      clientId: client_id as string,
      redirectUri: redirect_uri as string,
      userId: CONFIG.defaultUserId, // In production, this would come from user session
      scope: (scope as string || 'read write').split(' '),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };
    await storeAuthCode(code, authCode);

    // Redirect back to client with code
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state as string);
    }

    res.redirect(redirectUrl.toString());
  });

  // OAuth 2.0 Token endpoint
  app.post('/oauth/token', async (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) {
      return res.status(501).json({ error: 'OAuth not enabled' });
    }

    const { grant_type, code, client_id, client_secret, refresh_token } = req.body;

    // Validate client credentials
    if (client_id !== CONFIG.oauth.clientId || client_secret !== CONFIG.oauth.clientSecret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for tokens (encrypted Redis)
      const authCode = await getAuthCode(code);
      if (!authCode || new Date(authCode.expiresAt) < new Date()) {
        await deleteAuthCode(code);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      await deleteAuthCode(code);

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: authCode.userId, scope: authCode.scope },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions
      );

      const newRefreshToken = randomUUID();
      const token: OAuthToken = {
        accessToken,
        refreshToken: newRefreshToken,
        userId: authCode.userId,
        clientId: authCode.clientId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        scope: authCode.scope,
      };
      await storeToken(newRefreshToken, token);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
        scope: authCode.scope.join(' '),
      });
    } else if (grant_type === 'refresh_token') {
      // Refresh access token (encrypted Redis)
      const token = await getToken(refresh_token);
      if (!token || new Date(token.expiresAt) < new Date()) {
        await deleteToken(refresh_token);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      const accessToken = jwt.sign(
        { userId: token.userId, scope: token.scope },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions
      );

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: token.scope.join(' '),
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // OAuth 2.0 Token revocation endpoint
  app.post('/oauth/revoke', async (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) {
      return res.status(501).json({ error: 'OAuth not enabled' });
    }

    const { token, token_type_hint } = req.body;

    if (token_type_hint === 'refresh_token' || !token_type_hint) {
      await deleteToken(token);
    }

    // Always return 200 for revocation per RFC 7009
    res.status(200).json({ revoked: true });
  });

  // OAuth token validation middleware
  const validateToken = (req: Request, res: Response, next: NextFunction) => {
    if (!CONFIG.oauth.enabled) {
      // If OAuth is disabled, allow all requests (for development)
      return next();
    }

    const wwwAuth = `Bearer resource_metadata="${CONFIG.oauth.issuer || 'https://api.memorable.chat'}/.well-known/oauth-protected-resource"`;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.setHeader('WWW-Authenticate', wwwAuth);
      return res.status(401).json({ error: 'missing_token' });
    }

    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, CONFIG.oauth.jwtSecret);
      (req as any).user = decoded;
      next();
    } catch (error) {
      res.setHeader('WWW-Authenticate', wwwAuth);
      return res.status(401).json({ error: 'invalid_token' });
    }
  };

  return { app, validateToken };
}

/**
 * Main entry point.
 *
 * CRITICAL: For stdio transport, connect the transport FIRST, then initialize
 * the database in the background. If we block on DB connection before the
 * transport is up, the MCP client's initialize message arrives while we're
 * still waiting for MongoDB/Redis timeouts and gets lost.
 */
async function main() {
  await setupLogger();
  logger.info('[MCP] MemoRable Memory Server starting...');

  if (CONFIG.transportType === 'http') {
    // HTTP transport — safe to await DB init before starting
    await initializeDb();
    if (connectionMode !== 'rest') {
      llmClient = createLLMClient();
      if (llmClient) {
        logger.info('[MCP] LLM client initialized');
      } else {
        logger.info('[MCP] No LLM API key found, using heuristic mode');
      }
    }

    // HTTP transport for remote deployment (Claude.ai web integration)
    const { app, validateToken } = createExpressApp();

    // Per-session transport+server management
    // Each MCP client gets its own isolated session - no shared state
    const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

    // Cleanup stale sessions every 5 minutes
    const SESSION_TTL_MS = parseInt(process.env.MCP_SESSION_TTL_MS || '1800000', 10); // 30 min default
    const sessionLastSeen = new Map<string, number>();
    setInterval(() => {
      const now = Date.now();
      for (const [id, lastSeen] of sessionLastSeen) {
        if (now - lastSeen > SESSION_TTL_MS) {
          const session = sessions.get(id);
          if (session) {
            session.transport.close?.();
            sessions.delete(id);
            sessionLastSeen.delete(id);
            logger.info(`[MCP] Cleaned up stale session ${id}`);
          }
        }
      }
    }, 300000);

    // Mount MCP endpoint with OAuth validation
    app.all('/mcp', validateToken, async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // DELETE = explicit session teardown (MCP spec)
        if (req.method === 'DELETE') {
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            await session.transport.close();
            sessions.delete(sessionId);
            sessionLastSeen.delete(sessionId);
            logger.info(`[MCP] Session ${sessionId} closed by client (active: ${sessions.size})`);
            res.status(200).json({ ok: true });
          } else {
            res.status(404).json({ error: 'Session not found' });
          }
          return;
        }

        if (sessionId && sessions.has(sessionId)) {
          // Existing session - route to its transport
          sessionLastSeen.set(sessionId, Date.now());
          const { transport } = sessions.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
        } else if (!sessionId || req.method === 'POST') {
          // New session - create fresh transport+server pair
          const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          const newServer = createServer();
          await newServer.connect(newTransport);

          // Handle the request (initialize) - this sets the session ID on the transport
          await newTransport.handleRequest(req, res, req.body);

          // Store session by the ID the transport generated
          const newSessionId = newTransport.sessionId;
          if (newSessionId) {
            sessions.set(newSessionId, { transport: newTransport, server: newServer });
            sessionLastSeen.set(newSessionId, Date.now());
            logger.info(`[MCP] New session created: ${newSessionId} (active: ${sessions.size})`);
          }
        } else {
          // Session ID provided but not found (expired/invalid)
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session expired or invalid. Send initialize to start a new session.' },
          });
        }
      } catch (error) {
        logger.error('[MCP] HTTP transport error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // Start HTTP server
    app.listen(CONFIG.httpPort, () => {
      logger.info(`[MCP] Server listening on http://0.0.0.0:${CONFIG.httpPort}`);
      logger.info(`[MCP] MCP endpoint: http://0.0.0.0:${CONFIG.httpPort}/mcp`);
      if (CONFIG.oauth.enabled) {
        logger.info(`[MCP] OAuth enabled - authorize at /oauth/authorize`);
      } else {
        logger.info(`[MCP] OAuth disabled - set OAUTH_ENABLED=true for production`);
      }
    });
  } else {
    // stdio transport for Claude Code / local development
    // Connect transport FIRST so we can receive the initialize message
    // while database connects in the background
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('[MCP] Server connected via stdio');

    // Initialize database AFTER transport is connected
    // Tools that need DB will get errors until this completes
    initializeDb().then(() => {
      if (connectionMode !== 'rest') {
        llmClient = createLLMClient();
        if (llmClient) {
          logger.info('[MCP] LLM client initialized');
        } else {
          logger.info('[MCP] No LLM API key found, using heuristic mode');
        }
      }
      logger.info('[MCP] Database initialization complete');
    }).catch((err) => {
      logger.error('[MCP] Database initialization failed — running in degraded mode:', err);
    });
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info('[MCP] Shutting down...');
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

/**
 * Mount MCP endpoint on an existing Express app.
 * This allows integrating MCP into server.js for unified deployment.
 *
 * @param app - Express application to mount on
 * @param options - Configuration options
 * @returns Promise that resolves when MCP is ready
 */
export async function mountMcpEndpoint(
  app: express.Application,
  options: {
    mongoClient?: MongoClient;
    apiKey?: string;
  } = {}
): Promise<void> {
  await setupLogger();
  logger.info('[MCP] Mounting MCP endpoint on existing Express app...');

  // Use provided mongo client or connect
  if (options.mongoClient) {
    mongoClient = options.mongoClient;
    db = mongoClient.db();
    logger.info('[MCP] Using provided MongoDB connection');
  } else if (!mongoClient) {
    // Only connect if we don't already have a connection
    // Check if using DocumentDB (requires specific options)
    const isDocumentDB = CONFIG.mongoUri.includes('docdb.amazonaws.com') || CONFIG.mongoUri.includes('tls=true');
    mongoClient = new MongoClient(CONFIG.mongoUri, {
      ...(isDocumentDB ? {
        tlsAllowInvalidCertificates: true,
        authMechanism: 'SCRAM-SHA-1', // DocumentDB doesn't support SCRAM-SHA-256
        directConnection: true,
      } : {}),
    });
    await mongoClient.connect();
    db = mongoClient.db();
    logger.info('[MCP] Connected to MongoDB');
  }

  // Initialize services and set connection mode
  const remoteMode = useRemoteApi();
  logger.info(`[MCP] useRemoteApi() = ${remoteMode}, API_BASE_URL=${process.env.API_BASE_URL || 'not set'}, MEMORABLE_API_URL=${process.env.MEMORABLE_API_URL || 'not set'}`);

  if (!remoteMode) {
    connectionMode = 'direct';
    logger.info('[MCP] Direct mode: initializing salience service...');

    const salienceResult = await initializeSalienceService(db);
    if (!salienceResult.success) {
      logger.warn('[MCP] Salience service initialization failed:', salienceResult.error);
    } else {
      logger.info('[MCP] Salience service initialized successfully');
    }

    initAnticipationService(db);
    logger.info('[MCP] Anticipation service initialized');
  } else {
    connectionMode = 'rest';
    apiClient = getApiClient();
    logger.info('[MCP] REST mode configured');
  }

  // Initialize LLM client
  if (!llmClient) {
    llmClient = createLLMClient();
    if (llmClient) {
      logger.info('[MCP] LLM client initialized');
    } else {
      logger.info('[MCP] No LLM API key found, using heuristic mode');
    }
  }

  // Per-session transport+server management for mounted endpoint
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();
  const sessionLastSeen = new Map<string, number>();
  const SESSION_TTL_MS = parseInt(process.env.MCP_SESSION_TTL_MS || '1800000', 10);

  // Cleanup stale sessions every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, lastSeen] of sessionLastSeen) {
      if (now - lastSeen > SESSION_TTL_MS) {
        const session = sessions.get(id);
        if (session) {
          session.transport.close?.();
          sessions.delete(id);
          sessionLastSeen.delete(id);
          logger.info(`[MCP] Cleaned up stale session ${id}`);
        }
      }
    }
  }, 300000);

  // Create auth middleware that supports both API key and OAuth
  const mcpAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Check X-API-Key header first (simple auth for Claude Code)
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && options.apiKey && apiKeyHeader === options.apiKey) {
      return next();
    }

    const wwwAuth = `Bearer resource_metadata="${CONFIG.oauth.issuer || 'https://api.memorable.chat'}/.well-known/oauth-protected-resource"`;

    // Fall back to OAuth if enabled
    if (CONFIG.oauth.enabled) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.setHeader('WWW-Authenticate', wwwAuth);
        return res.status(401).json({ error: 'missing_token' });
      }
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, CONFIG.oauth.jwtSecret);
        (req as any).user = decoded;
        return next();
      } catch (error) {
        res.setHeader('WWW-Authenticate', wwwAuth);
        return res.status(401).json({ error: 'invalid_token' });
      }
    }

    // If OAuth disabled and no API key match, allow in dev mode
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    res.setHeader('WWW-Authenticate', wwwAuth);
    return res.status(401).json({ error: 'unauthorized' });
  };

  // ─── MCP-spec OAuth 2.1 endpoints ──────────────────────────────────
  // Claude.ai follows the MCP authorization spec which requires these
  // discovery and auth endpoints at the server root (not /oauth/*).
  // See: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/authorization/

  // Dynamic client registration (MCP spec §5.3)
  // Stores registered clients in-memory (persists in Redis when available)
  const registeredClients = new Map<string, { clientId: string; clientSecret: string; redirectUris: string[]; clientName: string; createdAt: Date }>();

  app.post('/register', async (req: Request, res: Response) => {
    const { redirect_uris, client_name, grant_types, response_types, token_endpoint_auth_method } = req.body;

    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'At least one redirect_uri is required' });
    }

    const clientId = randomUUID();
    const clientSecret = randomUUID();

    registeredClients.set(clientId, {
      clientId,
      clientSecret,
      redirectUris: redirect_uris,
      clientName: client_name || 'MCP Client',
      createdAt: new Date(),
    });

    // Also accept as valid OAuth client for the existing token flow
    logger.info(`[MCP] Dynamic client registered: ${clientId} (${client_name || 'unnamed'})`);

    return res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: client_name || 'MCP Client',
      redirect_uris,
      grant_types: grant_types || ['authorization_code', 'refresh_token'],
      response_types: response_types || ['code'],
      token_endpoint_auth_method: token_endpoint_auth_method || 'client_secret_post',
    });
  });

  // OAuth Authorization Server Metadata (RFC 8414 / MCP spec)
  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      revocation_endpoint: `${baseUrl}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'write', 'mcp'],
    });
  });

  // OAuth Protected Resource Metadata (RFC 9728)
  app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['read', 'write', 'mcp'],
    });
  });

  // Authorization endpoint (MCP spec — at /authorize, not /oauth/authorize)
  app.get('/authorize', async (req: Request, res: Response) => {
    const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.query;

    if (response_type !== 'code') {
      return res.status(400).json({ error: 'unsupported_response_type' });
    }

    // Validate client — accept static, dynamic, or public PKCE clients
    const dynamicClient = registeredClients.get(client_id as string);
    const isStaticClient = client_id === CONFIG.oauth.clientId;
    const isPublicPKCE = !dynamicClient && !isStaticClient && code_challenge;

    if (!dynamicClient && !isStaticClient && !isPublicPKCE) {
      return res.status(400).json({ error: 'invalid_client' });
    }

    // Validate redirect_uri for dynamic clients
    if (dynamicClient && !dynamicClient.redirectUris.includes(redirect_uri as string)) {
      return res.status(400).json({ error: 'invalid_redirect_uri' });
    }

    // Generate authorization code
    const code = randomUUID();
    const authCode: AuthorizationCode = {
      code,
      clientId: client_id as string,
      redirectUri: redirect_uri as string,
      userId: CONFIG.defaultUserId,
      scope: (scope as string || 'read write mcp').split(' '),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    // Store PKCE challenge alongside the auth code
    if (code_challenge) {
      (authCode as any).codeChallenge = code_challenge;
      (authCode as any).codeChallengeMethod = code_challenge_method || 'S256';
    }

    await storeAuthCode(code, authCode);
    logger.info(`[MCP] Auth code issued for client ${client_id}, redirect to ${redirect_uri}`);

    // Redirect back with code
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state as string);

    res.redirect(redirectUrl.toString());
  });

  // Token endpoint (MCP spec — at /token, not /oauth/token)
  app.post('/token', async (req: Request, res: Response) => {
    const { grant_type, code, client_id, client_secret, refresh_token, code_verifier } = req.body;

    // Validate client — accept dynamic, static, or public (PKCE) clients
    const dynamicClient = registeredClients.get(client_id);
    const isStaticClient = client_id === CONFIG.oauth.clientId && client_secret === CONFIG.oauth.clientSecret;
    const isDynamicValid = dynamicClient && dynamicClient.clientSecret === client_secret;
    const isPublicClient = !client_secret && code_verifier;

    if (!isStaticClient && !isDynamicValid && !isPublicClient) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    if (grant_type === 'authorization_code') {
      const authCode = await getAuthCode(code);
      if (!authCode || new Date(authCode.expiresAt) < new Date()) {
        await deleteAuthCode(code);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // Verify PKCE if challenge was set
      if ((authCode as any).codeChallenge && code_verifier) {
        const hash = createHash('sha256').update(code_verifier).digest('base64url');
        if (hash !== (authCode as any).codeChallenge) {
          return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        }
      }

      await deleteAuthCode(code);

      const accessToken = jwt.sign(
        { userId: authCode.userId, scope: authCode.scope, clientId: client_id },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions
      );

      const newRefreshToken = randomUUID();
      const token: OAuthToken = {
        accessToken,
        refreshToken: newRefreshToken,
        userId: authCode.userId,
        clientId: client_id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scope: authCode.scope,
      };
      await storeToken(newRefreshToken, token);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
        scope: authCode.scope.join(' '),
      });
    } else if (grant_type === 'refresh_token') {
      const token = await getToken(refresh_token);
      if (!token || new Date(token.expiresAt) < new Date()) {
        await deleteToken(refresh_token);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      const accessToken = jwt.sign(
        { userId: token.userId, scope: token.scope, clientId: client_id },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry } as jwt.SignOptions
      );

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: token.scope.join(' '),
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // Revocation endpoint
  app.post('/revoke', async (req: Request, res: Response) => {
    const { token } = req.body;
    if (token) await deleteToken(token);
    res.status(200).json({ revoked: true });
  });

  // Mount MCP endpoint with per-session isolation
  app.all('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // DELETE = explicit session teardown (MCP spec)
      if (req.method === 'DELETE') {
        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          await session.transport.close();
          sessions.delete(sessionId);
          sessionLastSeen.delete(sessionId);
          logger.info(`[MCP] Session ${sessionId} closed by client (active: ${sessions.size})`);
          res.status(200).json({ ok: true });
        } else {
          res.status(404).json({ error: 'Session not found' });
        }
        return;
      }

      if (sessionId && sessions.has(sessionId)) {
        sessionLastSeen.set(sessionId, Date.now());
        const { transport } = sessions.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
      } else if (!sessionId || req.method === 'POST') {
        // New session
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        const newServer = createServer();
        await newServer.connect(newTransport);
        await newTransport.handleRequest(req, res, req.body);

        const newSessionId = newTransport.sessionId;
        if (newSessionId) {
          sessions.set(newSessionId, { transport: newTransport, server: newServer });
          sessionLastSeen.set(newSessionId, Date.now());
          logger.info(`[MCP] New session created: ${newSessionId} (active: ${sessions.size})`);
        }
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session expired or invalid. Send initialize to start a new session.' },
        });
      }
    } catch (error) {
      logger.error('[MCP] HTTP transport error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  logger.info('[MCP] MCP endpoint mounted at /mcp (per-session isolation)');
}

// Only run main() when executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    logger.error('[MCP] Fatal error:', error);
    process.exit(1);
  });
}
