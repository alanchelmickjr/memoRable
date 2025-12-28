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
import { randomUUID } from 'crypto';

// Import salience service functions
import {
  enrichMemoryWithSalience,
  enrichMemoryWithSalienceHeuristic,
  retrieveWithSalience,
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
  type LLMClient,
  type CalendarEvent,
  type FeedbackSignal,
} from '../salience_service/index.js';

// Device types for multi-device support
import type { DeviceType } from '../salience_service/device_context.js';

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

// OAuth token store (in-memory for development, use Redis in production)
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

const tokenStore = new Map<string, OAuthToken>();
const authCodeStore = new Map<string, AuthorizationCode>();

// Database connection
let db: Db | null = null;
let mongoClient: MongoClient | null = null;

// ============================================
// BEHAVIORAL IDENTITY HELPER FUNCTIONS
// ============================================

interface BehavioralSignals {
  vocabulary: {
    avgWordLength: number;
    abbreviationRatio: number;
    uniqueWordRatio: number;
    jargonScore: number;
  };
  syntax: {
    avgSentenceLength: number;
    punctuationStyle: string;
    capitalizationRatio: number;
    questionRatio: number;
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
  };
}

/**
 * Analyze behavioral signals from a message
 */
function analyzeBehavioralSignals(message: string): BehavioralSignals {
  const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const now = new Date();

  // Vocabulary analysis
  const avgWordLength = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 0;
  const abbreviations = ['u', 'ur', 'thx', 'pls', 'btw', 'idk', 'imo', 'tbh', 'lol', 'omg'];
  const abbrevCount = words.filter(w => abbreviations.includes(w)).length;
  const abbreviationRatio = words.length > 0 ? abbrevCount / words.length : 0;
  const uniqueWords = new Set(words);
  const uniqueWordRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Syntax analysis
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const punctuation = message.match(/[.,!?;:]/g) || [];
  const punctuationStyle = punctuation.length > 5 ? 'heavy' : punctuation.length > 2 ? 'moderate' : 'light';
  const upperCase = (message.match(/[A-Z]/g) || []).length;
  const lowerCase = (message.match(/[a-z]/g) || []).length;
  const capitalizationRatio = (upperCase + lowerCase) > 0 ? upperCase / (upperCase + lowerCase) : 0;
  const questions = (message.match(/\?/g) || []).length;
  const questionRatio = sentences.length > 0 ? questions / sentences.length : 0;

  // Style analysis
  const formalWords = ['please', 'thank', 'appreciate', 'kindly', 'would', 'could', 'shall'];
  const formalCount = words.filter(w => formalWords.some(f => w.includes(f))).length;
  const formalityScore = words.length > 0 ? Math.min(1, formalCount / words.length * 10) : 0.5;
  const emojis = (message.match(/[\u{1F600}-\u{1F6FF}]/gu) || []).length;
  const emojiUsage = emojis / Math.max(1, words.length);
  const politeWords = ['please', 'thanks', 'thank you', 'appreciate', 'sorry'];
  const politeCount = politeWords.filter(p => message.toLowerCase().includes(p)).length;

  // Topic extraction (simple keyword extraction)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'whenever', 'where', 'wherever', 'whether', 'which', 'while', 'who', 'whoever', 'whom', 'whose', 'that', 'this', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what']);
  const topics = words
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);

  return {
    vocabulary: {
      avgWordLength,
      abbreviationRatio,
      uniqueWordRatio,
      jargonScore: abbreviationRatio * 0.5 + (1 - capitalizationRatio) * 0.5,
    },
    syntax: {
      avgSentenceLength,
      punctuationStyle,
      capitalizationRatio,
      questionRatio,
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
    },
  };
}

/**
 * Calculate behavioral match score between signals and a fingerprint
 */
function calculateBehavioralMatch(
  signals: BehavioralSignals,
  fingerprint: any
): { confidence: number; signals: Record<string, number> } {
  const fp = fingerprint.signals || {};
  const scores: Record<string, number> = {};

  // Vocabulary match (weight: 0.25)
  if (fp.vocabulary) {
    const wordLengthDiff = Math.abs((signals.vocabulary.avgWordLength || 0) - (fp.vocabulary.avgWordLength || 0));
    const abbrevDiff = Math.abs((signals.vocabulary.abbreviationRatio || 0) - (fp.vocabulary.abbreviationRatio || 0));
    scores.vocabulary = Math.max(0, 1 - (wordLengthDiff / 5 + abbrevDiff));
  } else {
    scores.vocabulary = 0.5;
  }

  // Syntax match (weight: 0.25)
  if (fp.syntax) {
    const sentLengthDiff = Math.abs((signals.syntax.avgSentenceLength || 0) - (fp.syntax.avgSentenceLength || 0));
    const capDiff = Math.abs((signals.syntax.capitalizationRatio || 0) - (fp.syntax.capitalizationRatio || 0));
    scores.syntax = Math.max(0, 1 - (sentLengthDiff / 20 + capDiff));
  } else {
    scores.syntax = 0.5;
  }

  // Timing match (weight: 0.15)
  if (fp.timing && fp.timing.activeHours) {
    const hourMatch = fp.timing.activeHours.includes(signals.timing.hourOfDay) ? 1 : 0.3;
    const dayMatch = fp.timing.activeDays?.includes(signals.timing.dayOfWeek) ? 1 : 0.5;
    scores.timing = (hourMatch + dayMatch) / 2;
  } else {
    scores.timing = 0.5;
  }

  // Topics match (weight: 0.20)
  if (fp.topics && fp.topics.length > 0) {
    const fpTopics = new Set(fp.topics);
    const matchingTopics = signals.topics.filter(t => fpTopics.has(t)).length;
    scores.topics = signals.topics.length > 0 ? matchingTopics / signals.topics.length : 0.5;
  } else {
    scores.topics = 0.5;
  }

  // Style match (weight: 0.15)
  if (fp.style) {
    const formalityDiff = Math.abs((signals.style.formalityScore || 0.5) - (fp.style.formalityScore || 0.5));
    const emojiMatch = (signals.style.emojiUsage > 0) === (fp.style.emojiUsage > 0) ? 1 : 0.5;
    scores.style = Math.max(0, 1 - formalityDiff) * 0.7 + emojiMatch * 0.3;
  } else {
    scores.style = 0.5;
  }

  // Weighted average
  const weights = { vocabulary: 0.25, syntax: 0.25, timing: 0.15, topics: 0.20, style: 0.15 };
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
    console.error('[MCP] LLM provider initialization failed:', error);
    return null;
  }
}

let llmClient: LLMClient | null = null;

/**
 * Initialize database connection.
 */
async function initializeDb(): Promise<void> {
  if (db) return;

  mongoClient = new MongoClient(CONFIG.mongoUri);
  await mongoClient.connect();
  db = mongoClient.db();

  await initializeSalienceService(db, { verbose: false });
  initAnticipationService(db);
  console.error('[MCP] Database initialized');
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
          'Store a memory with automatic salience scoring. Use this to remember important information, conversations, decisions, or commitments.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The memory content to store',
            },
            context: {
              type: 'object',
              description: 'Optional context (location, activity, mood)',
              properties: {
                location: { type: 'string' },
                activity: { type: 'string' },
                mood: { type: 'string' },
              },
            },
            useLLM: {
              type: 'boolean',
              description: 'Use LLM for richer feature extraction (default: true if available)',
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
        description: 'Export memories for backup or portability.',
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await initializeDb();
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'store_memory': {
          const { text, context, useLLM = true } = args as {
            text: string;
            context?: { location?: string; activity?: string; mood?: string };
            useLLM?: boolean;
          };

          const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const input = {
            memoryId,
            text,
            userId: CONFIG.defaultUserId,
            context,
          };

          let result;
          if (useLLM && llmClient) {
            result = await enrichMemoryWithSalience(input, llmClient);
          } else {
            result = await enrichMemoryWithSalienceHeuristic(input);
          }

          if (!result.success) {
            throw new McpError(ErrorCode.InternalError, result.error || 'Failed to store memory');
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    stored: true,
                    memoryId,
                    salience: result.salience?.score,
                    factors: result.salience?.factors,
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

          // For now, use a simple implementation
          // In production, this would use vector search + salience ranking
          const memories = await retrieveWithSalience(
            CONFIG.defaultUserId,
            query,
            { limit, minSalience }
          );

          // Filter by person if specified
          const filtered = person
            ? memories.filter((m) =>
                m.memory.extractedFeatures?.peopleMentioned?.some(
                  (p: string) => p.toLowerCase().includes(person.toLowerCase())
                )
              )
            : memories;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  filtered.map((m) => ({
                    id: m.memory.memoryId,
                    text: m.memory.text?.slice(0, 500),
                    salience: m.memory.salienceScore,
                    relevance: m.retrievalScore,
                    people: m.memory.extractedFeatures?.peopleMentioned,
                    createdAt: m.memory.createdAt,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'get_briefing': {
          const { person, quick = false } = args as { person: string; quick?: boolean };

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
                  loops.map((loop) => ({
                    id: loop._id?.toString(),
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

          const memories = await setContext(
            CONFIG.defaultUserId,
            { location, people, activity },
            { deviceId: effectiveDeviceId, deviceType: effectiveDeviceType }
          );

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
                    currentContext: {
                      location: unifiedContext.location,
                      people: unifiedContext.people,
                      activity: unifiedContext.activity,
                    },
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

        // Memory Management Tools
        case 'forget': {
          const { memoryId, mode = 'suppress', reason } = args as {
            memoryId: string;
            mode?: 'suppress' | 'archive' | 'delete';
            reason?: string;
          };

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
          } = args as {
            people?: string[];
            topics?: string[];
            project?: string;
            fromDate?: string;
            toDate?: string;
            includeLoops?: boolean;
            includeTimeline?: boolean;
          };

          const memories = await exportMemories(CONFIG.defaultUserId, {
            people,
            topics,
            project,
            fromDate,
            toDate,
            includeLoops,
            includeTimeline,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: memories.length,
                  memories,
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
          const signalStrength: Record<string, number> = {
            vocabulary: 0,
            syntax: 0,
            timing: 0,
            topics: 0,
            style: 0,
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
╔══════════════════════════════════════════════════════════════════╗
║                 BEHAVIORAL IDENTITY METRICS                       ║
║                 Time Range: ${timeRange.padEnd(37)}║
╠══════════════════════════════════════════════════════════════════╣
║  LEARNING PROGRESS                                                ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ Users with fingerprints: ${String(allFingerprints.length).padStart(4)}                              │  ║
║  │ Ready for identification: ${String(readyUsers).padStart(4)} (≥50 samples)               │  ║
║  │ Avg samples per user:    ${String(Math.round(avgSamples)).padStart(4)}                              │  ║
║  │                                                            │  ║
║  │ Progress: ${generateProgressBar(avgSamples, 50, 30)}  ${Math.min(100, Math.round(avgSamples / 50 * 100))}%  │  ║
║  └────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════╣
║  IDENTIFICATION ACCURACY                                          ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ Total predictions: ${String(totalPredictions).padStart(6)}                                  │  ║
║  │ With feedback:     ${String(feedbackCount).padStart(6)}                                  │  ║
║  │                                                            │  ║
║  │ Hit Rate:  ${generateProgressBar(hitRate, 100, 20)} ${hitRate.toFixed(1).padStart(5)}%        │  ║
║  │ Miss Rate: ${generateProgressBar(missRate, 100, 20)} ${missRate.toFixed(1).padStart(5)}%        │  ║
║  └────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════╣
║  CONFIDENCE DISTRIBUTION                                          ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │  0-20%  ${generateHistogramBar(confBuckets[0], Math.max(...confBuckets), 25)} ${String(confBuckets[0]).padStart(4)} │  ║
║  │ 20-40%  ${generateHistogramBar(confBuckets[1], Math.max(...confBuckets), 25)} ${String(confBuckets[1]).padStart(4)} │  ║
║  │ 40-60%  ${generateHistogramBar(confBuckets[2], Math.max(...confBuckets), 25)} ${String(confBuckets[2]).padStart(4)} │  ║
║  │ 60-80%  ${generateHistogramBar(confBuckets[3], Math.max(...confBuckets), 25)} ${String(confBuckets[3]).padStart(4)} │  ║
║  │ 80-100% ${generateHistogramBar(confBuckets[4], Math.max(...confBuckets), 25)} ${String(confBuckets[4]).padStart(4)} │  ║
║  └────────────────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════╣
║  SIGNAL STRENGTH (contribution to identification)                 ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │ Vocabulary ${generateProgressBar(signalStrength.vocabulary * 100, 100, 25)} ${(signalStrength.vocabulary * 100).toFixed(0).padStart(3)}%   │  ║
║  │ Syntax     ${generateProgressBar(signalStrength.syntax * 100, 100, 25)} ${(signalStrength.syntax * 100).toFixed(0).padStart(3)}%   │  ║
║  │ Timing     ${generateProgressBar(signalStrength.timing * 100, 100, 25)} ${(signalStrength.timing * 100).toFixed(0).padStart(3)}%   │  ║
║  │ Topics     ${generateProgressBar(signalStrength.topics * 100, 100, 25)} ${(signalStrength.topics * 100).toFixed(0).padStart(3)}%   │  ║
║  │ Style      ${generateProgressBar(signalStrength.style * 100, 100, 25)} ${(signalStrength.style * 100).toFixed(0).padStart(3)}%   │  ║
║  └────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════╝
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

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
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
        const memories = await retrieveWithSalience(
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
                memories.map((m) => ({
                  id: m.memory.memoryId,
                  text: m.memory.text?.slice(0, 300),
                  salience: m.memory.salienceScore,
                  people: m.memory.extractedFeatures?.peopleMentioned,
                  createdAt: m.memory.createdAt,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'memory://loops': {
        const loops = await getOpenLoops(CONFIG.defaultUserId, { includeOverdue: true });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                loops.map((loop) => ({
                  id: loop._id?.toString(),
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
                  active: active.map((r) => ({
                    name: r.contactName,
                    lastInteraction: r.lastInteractionAt,
                    interactionCount: r.totalInteractions,
                    trend: r.engagementTrend,
                  })),
                  cold: cold.map((r) => ({
                    name: r.contactName,
                    lastInteraction: r.lastInteractionAt,
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

        const briefing = await generateBriefing(CONFIG.defaultUserId, person);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Here's what you should know before talking to ${person}:

## What You Owe Them
${briefing.youOweThem?.length ? briefing.youOweThem.map((l: any) => `- ${l.description}`).join('\n') : 'Nothing pending'}

## What They Owe You
${briefing.theyOweYou?.length ? briefing.theyOweYou.map((l: any) => `- ${l.description}`).join('\n') : 'Nothing pending'}

## Their Upcoming Events
${briefing.upcomingEvents?.length ? briefing.upcomingEvents.map((e: any) => `- ${e.description} (${e.eventDate})`).join('\n') : 'None known'}

## Recent Context
${briefing.recentContext || 'No recent interactions'}

## Sensitivities
${briefing.sensitivities?.length ? briefing.sensitivities.join('\n') : 'None flagged'}

## Relationship Status
- Last interaction: ${briefing.lastInteraction || 'Unknown'}
- Engagement trend: ${briefing.engagementTrend || 'Unknown'}`,
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

  // CORS configuration for Claude.ai
  app.use(cors({
    origin: CONFIG.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: '2.0.0',
      transport: 'http',
      oauth: CONFIG.oauth.enabled,
    });
  });

  // OAuth 2.0 Authorization endpoint
  app.get('/oauth/authorize', (req: Request, res: Response) => {
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
    authCodeStore.set(code, authCode);

    // Redirect back to client with code
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state as string);
    }

    res.redirect(redirectUrl.toString());
  });

  // OAuth 2.0 Token endpoint
  app.post('/oauth/token', (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) {
      return res.status(501).json({ error: 'OAuth not enabled' });
    }

    const { grant_type, code, client_id, client_secret, refresh_token } = req.body;

    // Validate client credentials
    if (client_id !== CONFIG.oauth.clientId || client_secret !== CONFIG.oauth.clientSecret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for tokens
      const authCode = authCodeStore.get(code);
      if (!authCode || authCode.expiresAt < new Date()) {
        authCodeStore.delete(code);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      authCodeStore.delete(code);

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: authCode.userId, scope: authCode.scope },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry }
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
      tokenStore.set(newRefreshToken, token);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
        scope: authCode.scope.join(' '),
      });
    } else if (grant_type === 'refresh_token') {
      // Refresh access token
      const token = tokenStore.get(refresh_token);
      if (!token || token.expiresAt < new Date()) {
        tokenStore.delete(refresh_token);
        return res.status(400).json({ error: 'invalid_grant' });
      }

      const accessToken = jwt.sign(
        { userId: token.userId, scope: token.scope },
        CONFIG.oauth.jwtSecret,
        { expiresIn: CONFIG.oauth.tokenExpiry }
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
  app.post('/oauth/revoke', (req: Request, res: Response) => {
    if (!CONFIG.oauth.enabled) {
      return res.status(501).json({ error: 'OAuth not enabled' });
    }

    const { token, token_type_hint } = req.body;

    if (token_type_hint === 'refresh_token' || !token_type_hint) {
      tokenStore.delete(token);
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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, CONFIG.oauth.jwtSecret);
      (req as any).user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'invalid_token' });
    }
  };

  return { app, validateToken };
}

/**
 * Main entry point.
 */
async function main() {
  // Initialize LLM client
  llmClient = createLLMClient();
  if (llmClient) {
    console.error('[MCP] LLM client initialized');
  } else {
    console.error('[MCP] No LLM API key found, using heuristic mode');
  }

  const server = createServer();
  console.error('[MCP] MemoRable Memory Server starting...');

  if (CONFIG.transportType === 'http') {
    // HTTP transport for remote deployment (Claude.ai web integration)
    const { app, validateToken } = createExpressApp();

    // Create HTTP transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Mount MCP endpoint with OAuth validation
    app.all('/mcp', validateToken, async (req: Request, res: Response) => {
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('[MCP] HTTP transport error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Connect server to transport
    await server.connect(transport);

    // Start HTTP server
    app.listen(CONFIG.httpPort, () => {
      console.error(`[MCP] Server listening on http://0.0.0.0:${CONFIG.httpPort}`);
      console.error(`[MCP] MCP endpoint: http://0.0.0.0:${CONFIG.httpPort}/mcp`);
      if (CONFIG.oauth.enabled) {
        console.error(`[MCP] OAuth enabled - authorize at /oauth/authorize`);
      } else {
        console.error(`[MCP] OAuth disabled - set OAUTH_ENABLED=true for production`);
      }
    });
  } else {
    // stdio transport for Claude Code / local development
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP] Server connected via stdio');
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.error('[MCP] Shutting down...');
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
