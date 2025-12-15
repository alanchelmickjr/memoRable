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
  type LLMClient,
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
