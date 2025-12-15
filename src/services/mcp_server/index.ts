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
  // Context frame
  setContext,
  whatMattersNow,
  clearContextFrame,
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
  type LLMClient,
  type CalendarEvent,
  type FeedbackSignal,
} from '../salience_service/index.js';

// Configuration
const CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable',
  defaultUserId: process.env.MCP_USER_ID || 'default',
  llmProvider: process.env.LLM_PROVIDER || 'anthropic',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
};

// Database connection
let db: Db | null = null;
let mongoClient: MongoClient | null = null;

/**
 * Create an LLM client based on configuration.
 */
function createLLMClient(): LLMClient | null {
  if (CONFIG.llmProvider === 'anthropic' && CONFIG.anthropicApiKey) {
    return {
      async complete(prompt: string, options?: { temperature?: number; maxTokens?: number }) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CONFIG.anthropicApiKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: options?.maxTokens || 500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json();
        return data.content?.[0]?.text || '';
      },
    };
  }

  if (CONFIG.llmProvider === 'openai' && CONFIG.openaiApiKey) {
    return {
      async complete(prompt: string, options?: { temperature?: number; maxTokens?: number }) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: options?.maxTokens || 500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      },
    };
  }

  return null;
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
      },
      {
        name: 'get_status',
        description: 'Get memory system status including open loops, relationships, and learned patterns.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // Context Frame Tools
      {
        name: 'set_context',
        description:
          'Set your current context (where you are, who you\'re with). Automatically surfaces relevant memories. Example: "I\'m at the park meeting Judy"',
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
          },
        },
      },
      {
        name: 'whats_relevant',
        description: 'Get what\'s relevant right now based on your current context.',
        inputSchema: {
          type: 'object',
          properties: {},
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
          },
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
      },
      {
        name: 'pattern_stats',
        description:
          'Get statistics about learned patterns. Shows how much data has been collected and whether predictions are ready.',
        inputSchema: {
          type: 'object',
          properties: {},
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

        // Context Frame Tools
        case 'set_context': {
          const { location, people, activity } = args as {
            location?: string;
            people?: string[];
            activity?: string;
          };

          const memories = await setContext(CONFIG.defaultUserId, {
            location,
            people,
            activity,
          });

          // Format the response nicely
          const response: any = {
            contextSet: true,
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
          const { frame, memories } = await whatMattersNow(CONFIG.defaultUserId);

          if (!frame || !memories) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: 'No context set. Use set_context first.',
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
          const { dimensions } = args as {
            dimensions?: ('location' | 'people' | 'activity' | 'calendar' | 'mood')[];
          };

          const frame = await clearContextFrame(CONFIG.defaultUserId, dimensions);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  cleared: dimensions || 'all',
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
  const transport = new StdioServerTransport();

  console.error('[MCP] MemoRable Memory Server starting...');

  await server.connect(transport);

  console.error('[MCP] Server connected via stdio');
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
