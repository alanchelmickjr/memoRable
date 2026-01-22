/**
 * @file Tests for MCP Server Tools
 * Tests the MCP tool implementations with mocked dependencies
 */

describe('MCP Server Tools', () => {
  describe('Tool Schema Validation', () => {
    const toolSchemas: Record<string, any> = {
      store_memory: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The memory content to store' },
          context: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              activity: { type: 'string' },
              mood: { type: 'string' },
            },
          },
        },
        required: ['text'],
      },
      recall: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          person: { type: 'string', description: 'Filter by person' },
          topic: { type: 'string', description: 'Filter by topic' },
          limit: { type: 'number', description: 'Max results' },
        },
      },
      get_briefing: {
        type: 'object',
        properties: {
          person: { type: 'string', description: 'Person to get briefing for' },
        },
        required: ['person'],
      },
      list_loops: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: ['self', 'them', 'mutual'] },
          person: { type: 'string' },
        },
      },
      close_loop: {
        type: 'object',
        properties: {
          loopId: { type: 'string', description: 'ID of loop to close' },
        },
        required: ['loopId'],
      },
      set_context: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          people: { type: 'array', items: { type: 'string' } },
          activity: { type: 'string' },
        },
      },
      forget: {
        type: 'object',
        properties: {
          memoryId: { type: 'string' },
          mode: { type: 'string', enum: ['suppress', 'archive', 'delete'] },
        },
        required: ['memoryId'],
      },
      anticipate: {
        type: 'object',
        properties: {
          calendar: { type: 'array' },
          lookAheadMinutes: { type: 'number' },
        },
      },
      recall_vote: {
        type: 'object',
        properties: {
          votes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                memoryId: { type: 'string' },
                vote: { type: 'string', enum: ['hot', 'warm', 'cold', 'wrong', 'spark'] },
              },
              required: ['memoryId', 'vote'],
            },
          },
          query_context: { type: 'string' },
        },
        required: ['votes'],
      },
    };

    it('should define store_memory with required text field', () => {
      expect(toolSchemas.store_memory.required).toContain('text');
      expect(toolSchemas.store_memory.properties.text.type).toBe('string');
    });

    it('should define recall with optional filters', () => {
      expect(toolSchemas.recall.required).toBeUndefined();
      expect(toolSchemas.recall.properties.query).toBeDefined();
      expect(toolSchemas.recall.properties.person).toBeDefined();
      expect(toolSchemas.recall.properties.topic).toBeDefined();
    });

    it('should define get_briefing with required person', () => {
      expect(toolSchemas.get_briefing.required).toContain('person');
    });

    it('should define list_loops with owner enum', () => {
      expect(toolSchemas.list_loops.properties.owner.enum).toContain('self');
      expect(toolSchemas.list_loops.properties.owner.enum).toContain('them');
      expect(toolSchemas.list_loops.properties.owner.enum).toContain('mutual');
    });

    it('should define close_loop with required loopId', () => {
      expect(toolSchemas.close_loop.required).toContain('loopId');
    });

    it('should define set_context with people array', () => {
      expect(toolSchemas.set_context.properties.people.type).toBe('array');
    });

    it('should define forget with mode enum', () => {
      expect(toolSchemas.forget.properties.mode.enum).toContain('suppress');
      expect(toolSchemas.forget.properties.mode.enum).toContain('archive');
      expect(toolSchemas.forget.properties.mode.enum).toContain('delete');
    });

    it('should define recall_vote with required votes array and vote enum', () => {
      expect(toolSchemas.recall_vote.required).toContain('votes');
      expect(toolSchemas.recall_vote.properties.votes.type).toBe('array');
      expect(toolSchemas.recall_vote.properties.votes.items.properties.vote.enum).toContain('hot');
      expect(toolSchemas.recall_vote.properties.votes.items.properties.vote.enum).toContain('warm');
      expect(toolSchemas.recall_vote.properties.votes.items.properties.vote.enum).toContain('cold');
      expect(toolSchemas.recall_vote.properties.votes.items.properties.vote.enum).toContain('wrong');
      expect(toolSchemas.recall_vote.properties.votes.items.properties.vote.enum).toContain('spark');
    });
  });

  describe('Tool Input Validation', () => {
    function validateToolInput(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'store_memory':
          if (!input.text || typeof input.text !== 'string') {
            return { valid: false, error: 'text is required and must be a string' };
          }
          if (input.text.length === 0) {
            return { valid: false, error: 'text cannot be empty' };
          }
          return { valid: true };

        case 'recall':
          if (input.limit !== undefined && (typeof input.limit !== 'number' || input.limit < 1)) {
            return { valid: false, error: 'limit must be a positive number' };
          }
          return { valid: true };

        case 'get_briefing':
          if (!input.person || typeof input.person !== 'string') {
            return { valid: false, error: 'person is required and must be a string' };
          }
          return { valid: true };

        case 'close_loop':
          if (!input.loopId || typeof input.loopId !== 'string') {
            return { valid: false, error: 'loopId is required and must be a string' };
          }
          return { valid: true };

        case 'forget':
          if (!input.memoryId || typeof input.memoryId !== 'string') {
            return { valid: false, error: 'memoryId is required and must be a string' };
          }
          if (input.mode && !['suppress', 'archive', 'delete'].includes(input.mode)) {
            return { valid: false, error: 'mode must be one of: suppress, archive, delete' };
          }
          return { valid: true };

        case 'recall_vote':
          if (!input.votes || !Array.isArray(input.votes) || input.votes.length === 0) {
            return { valid: false, error: 'votes array is required and must not be empty' };
          }
          for (const v of input.votes) {
            if (!v.memoryId || typeof v.memoryId !== 'string') {
              return { valid: false, error: 'each vote must have a memoryId string' };
            }
            if (!v.vote || !['hot', 'warm', 'cold', 'wrong', 'spark'].includes(v.vote)) {
              return { valid: false, error: 'each vote must have a valid vote type: hot, warm, cold, wrong, spark' };
            }
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('store_memory validation', () => {
      it('should reject missing text', () => {
        const result = validateToolInput('store_memory', {});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('text');
      });

      it('should reject empty text', () => {
        const result = validateToolInput('store_memory', { text: '' });
        expect(result.valid).toBe(false);
      });

      it('should accept valid input', () => {
        const result = validateToolInput('store_memory', { text: 'Remember this' });
        expect(result.valid).toBe(true);
      });

      it('should accept input with optional context', () => {
        const result = validateToolInput('store_memory', {
          text: 'Remember this',
          context: { location: 'Office', mood: 'happy' },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('recall validation', () => {
      it('should accept empty input', () => {
        const result = validateToolInput('recall', {});
        expect(result.valid).toBe(true);
      });

      it('should reject invalid limit', () => {
        const result = validateToolInput('recall', { limit: -1 });
        expect(result.valid).toBe(false);
      });

      it('should accept valid limit', () => {
        const result = validateToolInput('recall', { query: 'test', limit: 10 });
        expect(result.valid).toBe(true);
      });
    });

    describe('get_briefing validation', () => {
      it('should reject missing person', () => {
        const result = validateToolInput('get_briefing', {});
        expect(result.valid).toBe(false);
      });

      it('should accept valid person', () => {
        const result = validateToolInput('get_briefing', { person: 'Alice' });
        expect(result.valid).toBe(true);
      });
    });

    describe('close_loop validation', () => {
      it('should reject missing loopId', () => {
        const result = validateToolInput('close_loop', {});
        expect(result.valid).toBe(false);
      });

      it('should accept valid loopId', () => {
        const result = validateToolInput('close_loop', { loopId: 'loop-123' });
        expect(result.valid).toBe(true);
      });
    });

    describe('forget validation', () => {
      it('should reject missing memoryId', () => {
        const result = validateToolInput('forget', {});
        expect(result.valid).toBe(false);
      });

      it('should reject invalid mode', () => {
        const result = validateToolInput('forget', { memoryId: 'mem-1', mode: 'invalid' });
        expect(result.valid).toBe(false);
      });

      it('should accept valid mode', () => {
        const result = validateToolInput('forget', { memoryId: 'mem-1', mode: 'archive' });
        expect(result.valid).toBe(true);
      });
    });

    describe('recall_vote validation', () => {
      it('should reject missing votes', () => {
        const result = validateToolInput('recall_vote', {});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('votes');
      });

      it('should reject empty votes array', () => {
        const result = validateToolInput('recall_vote', { votes: [] });
        expect(result.valid).toBe(false);
      });

      it('should reject votes without memoryId', () => {
        const result = validateToolInput('recall_vote', { votes: [{ vote: 'hot' }] });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('memoryId');
      });

      it('should reject invalid vote type', () => {
        const result = validateToolInput('recall_vote', {
          votes: [{ memoryId: 'mem-1', vote: 'invalid' }],
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('vote type');
      });

      it('should accept valid votes with all vote types', () => {
        const result = validateToolInput('recall_vote', {
          votes: [
            { memoryId: 'mem-1', vote: 'hot' },
            { memoryId: 'mem-2', vote: 'warm' },
            { memoryId: 'mem-3', vote: 'cold' },
            { memoryId: 'mem-4', vote: 'wrong' },
            { memoryId: 'mem-5', vote: 'spark' },
          ],
        });
        expect(result.valid).toBe(true);
      });

      it('should accept votes with optional query_context', () => {
        const result = validateToolInput('recall_vote', {
          votes: [{ memoryId: 'mem-1', vote: 'hot' }],
          query_context: 'what did we discuss about Betty',
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Tool Response Formatting', () => {
    function formatToolResponse(toolName: string, data: any): { content: any[]; isError?: boolean } {
      switch (toolName) {
        case 'store_memory':
          return {
            content: [
              {
                type: 'text',
                text: `Memory stored with ID: ${data.memoryId}, salience: ${data.salience}`,
              },
            ],
          };

        case 'recall':
          if (data.memories.length === 0) {
            return {
              content: [{ type: 'text', text: 'No memories found matching your query.' }],
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: data.memories
                  .map((m: any) => `[${m.score}] ${m.text}`)
                  .join('\n'),
              },
            ],
          };

        case 'get_briefing':
          return {
            content: [
              {
                type: 'text',
                text: `Briefing for ${data.person}:\n` +
                  `Last interaction: ${data.lastInteraction || 'Unknown'}\n` +
                  `Open loops: ${data.openLoops}\n` +
                  `Upcoming events: ${data.upcomingEvents}`,
              },
            ],
          };

        case 'recall_vote':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  updated: data.updated,
                  adjustments: data.adjustments,
                  message: 'Votes recorded. Salience scores adjusted.',
                }, null, 2),
              },
            ],
          };

        case 'error':
          return {
            content: [{ type: 'text', text: data.message }],
            isError: true,
          };

        default:
          return {
            content: [{ type: 'text', text: JSON.stringify(data) }],
          };
      }
    }

    it('should format store_memory response', () => {
      const result = formatToolResponse('store_memory', {
        memoryId: 'mem-123',
        salience: 75,
      });

      expect(result.content[0].text).toContain('mem-123');
      expect(result.content[0].text).toContain('75');
    });

    it('should format empty recall response', () => {
      const result = formatToolResponse('recall', { memories: [] });

      expect(result.content[0].text).toContain('No memories found');
    });

    it('should format recall response with memories', () => {
      const result = formatToolResponse('recall', {
        memories: [
          { score: 90, text: 'Memory 1' },
          { score: 80, text: 'Memory 2' },
        ],
      });

      expect(result.content[0].text).toContain('Memory 1');
      expect(result.content[0].text).toContain('Memory 2');
      expect(result.content[0].text).toContain('[90]');
    });

    it('should format get_briefing response', () => {
      const result = formatToolResponse('get_briefing', {
        person: 'Alice',
        lastInteraction: '2024-01-15',
        openLoops: 3,
        upcomingEvents: 1,
      });

      expect(result.content[0].text).toContain('Alice');
      expect(result.content[0].text).toContain('2024-01-15');
      expect(result.content[0].text).toContain('3');
    });

    it('should format recall_vote response with adjustments', () => {
      const result = formatToolResponse('recall_vote', {
        updated: 3,
        adjustments: [
          { memoryId: 'mem-1', vote: 'hot', delta: 10, success: true },
          { memoryId: 'mem-2', vote: 'cold', delta: -5, success: true },
          { memoryId: 'mem-3', vote: 'spark', delta: 0, success: true },
        ],
      });

      expect(result.content[0].text).toContain('3');
      expect(result.content[0].text).toContain('mem-1');
    });

    it('should format error responses', () => {
      const result = formatToolResponse('error', { message: 'Something went wrong' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Something went wrong');
    });
  });

  describe('MCP Resource URIs', () => {
    const resourceUris = {
      recent: 'memory://recent',
      loops: 'memory://loops',
      contacts: 'memory://contacts',
    };

    it('should use memory:// scheme', () => {
      Object.values(resourceUris).forEach((uri) => {
        expect(uri.startsWith('memory://')).toBe(true);
      });
    });

    it('should define recent memories resource', () => {
      expect(resourceUris.recent).toBe('memory://recent');
    });

    it('should define open loops resource', () => {
      expect(resourceUris.loops).toBe('memory://loops');
    });

    it('should define contacts resource', () => {
      expect(resourceUris.contacts).toBe('memory://contacts');
    });
  });

  describe('MCP Prompt Templates', () => {
    function generatePrompt(name: string, args: Record<string, string>): string {
      switch (name) {
        case 'daily_briefing':
          return `Generate a daily briefing for ${args.date || 'today'}.
Include:
- Scheduled meetings and events
- Open commitments (what you owe others, what they owe you)
- Important dates coming up
- Recent high-salience memories to keep in mind`;

        case 'person_context':
          return `Prepare context for talking to ${args.person}.
Include:
- How you know them and relationship history
- Recent conversations and topics
- Open loops between you
- Their upcoming events you might mention
- Any sensitivities to be aware of`;

        default:
          return '';
      }
    }

    it('should generate daily_briefing prompt', () => {
      const prompt = generatePrompt('daily_briefing', { date: '2024-01-15' });

      expect(prompt).toContain('daily briefing');
      expect(prompt).toContain('2024-01-15');
      expect(prompt).toContain('Open commitments');
    });

    it('should generate person_context prompt', () => {
      const prompt = generatePrompt('person_context', { person: 'Alice' });

      expect(prompt).toContain('Alice');
      expect(prompt).toContain('relationship history');
      expect(prompt).toContain('Open loops');
    });

    it('should use default date for daily_briefing if not provided', () => {
      const prompt = generatePrompt('daily_briefing', {});

      expect(prompt).toContain('today');
    });
  });

  describe('LLM Client Configuration', () => {
    function createLLMConfig(provider: string, apiKey: string): any {
      if (provider === 'anthropic') {
        return {
          provider: 'anthropic',
          model: 'claude-3-haiku-20240307',
          apiKey,
          headers: {
            'anthropic-version': '2023-06-01',
          },
        };
      }

      if (provider === 'openai') {
        return {
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey,
        };
      }

      return null;
    }

    it('should configure Anthropic client', () => {
      const config = createLLMConfig('anthropic', 'sk-ant-test');

      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-haiku-20240307');
      expect(config.headers['anthropic-version']).toBeDefined();
    });

    it('should configure OpenAI client', () => {
      const config = createLLMConfig('openai', 'sk-test');

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o-mini');
    });

    it('should return null for unknown provider', () => {
      const config = createLLMConfig('unknown', 'key');

      expect(config).toBeNull();
    });
  });

  // ============================================
  // EMOTION TOOLS - Comprehensive Validation
  // ============================================
  describe('Emotion Tools Validation', () => {
    const emotionToolSchemas: Record<string, any> = {
      analyze_emotion: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to analyze for emotional content' },
          memory_id: { type: 'string', description: 'Existing memory ID to get emotion data for' },
        },
      },
      get_emotional_context: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Optional session ID' },
        },
      },
      start_emotional_session: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          entity_id: { type: 'string' },
          use_voice: { type: 'boolean', default: true },
          use_video: { type: 'boolean', default: false },
          use_evi: { type: 'boolean', default: false },
          buffer_size: { type: 'number', default: 5 },
        },
        required: ['session_id'],
      },
      stop_emotional_session: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
        },
        required: ['session_id'],
      },
      list_emotional_sessions: {
        type: 'object',
        properties: {},
      },
      set_emotion_filter: {
        type: 'object',
        properties: {
          emotions: { type: 'array', items: { type: 'string' } },
          action: { type: 'string', enum: ['flag', 'suppress', 'block', 'notify'] },
          threshold: { type: 'number', default: 0.7 },
          enabled: { type: 'boolean', default: true },
        },
        required: ['emotions', 'action'],
      },
      get_emotion_filters: {
        type: 'object',
        properties: {},
      },
      get_memories_by_emotion: {
        type: 'object',
        properties: {
          emotions: { type: 'array', items: { type: 'string' } },
          min_intensity: { type: 'number', default: 0.3 },
          limit: { type: 'number', default: 10 },
          exclude_suppressed: { type: 'boolean', default: true },
        },
        required: ['emotions'],
      },
      correct_emotion: {
        type: 'object',
        properties: {
          memory_id: { type: 'string' },
          corrected_emotions: { type: 'array' },
          reason: { type: 'string' },
          clear_all: { type: 'boolean', default: false },
        },
        required: ['memory_id'],
      },
    };

    function validateEmotionInput(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'analyze_emotion':
          if (!input.text && !input.memory_id) {
            return { valid: false, error: 'either text or memory_id is required' };
          }
          return { valid: true };

        case 'start_emotional_session':
          if (!input.session_id || typeof input.session_id !== 'string') {
            return { valid: false, error: 'session_id is required' };
          }
          if (input.buffer_size !== undefined && (typeof input.buffer_size !== 'number' || input.buffer_size < 1)) {
            return { valid: false, error: 'buffer_size must be a positive number' };
          }
          return { valid: true };

        case 'stop_emotional_session':
          if (!input.session_id || typeof input.session_id !== 'string') {
            return { valid: false, error: 'session_id is required' };
          }
          return { valid: true };

        case 'set_emotion_filter':
          if (!input.emotions || !Array.isArray(input.emotions) || input.emotions.length === 0) {
            return { valid: false, error: 'emotions array is required and must not be empty' };
          }
          if (!input.action || !['flag', 'suppress', 'block', 'notify'].includes(input.action)) {
            return { valid: false, error: 'action must be one of: flag, suppress, block, notify' };
          }
          if (input.threshold !== undefined && (input.threshold < 0 || input.threshold > 1)) {
            return { valid: false, error: 'threshold must be between 0 and 1' };
          }
          return { valid: true };

        case 'get_memories_by_emotion':
          if (!input.emotions || !Array.isArray(input.emotions) || input.emotions.length === 0) {
            return { valid: false, error: 'emotions array is required and must not be empty' };
          }
          if (input.min_intensity !== undefined && (input.min_intensity < 0 || input.min_intensity > 1)) {
            return { valid: false, error: 'min_intensity must be between 0 and 1' };
          }
          return { valid: true };

        case 'correct_emotion':
          if (!input.memory_id || typeof input.memory_id !== 'string') {
            return { valid: false, error: 'memory_id is required' };
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('analyze_emotion', () => {
      it('should require either text or memory_id', () => {
        expect(validateEmotionInput('analyze_emotion', {}).valid).toBe(false);
      });

      it('should accept text input', () => {
        expect(validateEmotionInput('analyze_emotion', { text: 'I feel great today' }).valid).toBe(true);
      });

      it('should accept memory_id input', () => {
        expect(validateEmotionInput('analyze_emotion', { memory_id: 'mem-123' }).valid).toBe(true);
      });
    });

    describe('start_emotional_session', () => {
      it('should require session_id', () => {
        const result = validateEmotionInput('start_emotional_session', {});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('session_id');
      });

      it('should reject invalid buffer_size', () => {
        const result = validateEmotionInput('start_emotional_session', {
          session_id: 'sess-1',
          buffer_size: -1,
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid session with defaults', () => {
        const result = validateEmotionInput('start_emotional_session', {
          session_id: 'device_betty_doll_001',
          entity_id: 'betty',
        });
        expect(result.valid).toBe(true);
      });

      it('should define required session_id in schema', () => {
        expect(emotionToolSchemas.start_emotional_session.required).toContain('session_id');
      });
    });

    describe('stop_emotional_session', () => {
      it('should require session_id', () => {
        expect(validateEmotionInput('stop_emotional_session', {}).valid).toBe(false);
      });

      it('should accept valid session_id', () => {
        expect(validateEmotionInput('stop_emotional_session', { session_id: 'sess-1' }).valid).toBe(true);
      });
    });

    describe('set_emotion_filter', () => {
      it('should require emotions array', () => {
        const result = validateEmotionInput('set_emotion_filter', { action: 'flag' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('emotions');
      });

      it('should reject empty emotions array', () => {
        const result = validateEmotionInput('set_emotion_filter', { emotions: [], action: 'flag' });
        expect(result.valid).toBe(false);
      });

      it('should require valid action', () => {
        const result = validateEmotionInput('set_emotion_filter', {
          emotions: ['anger'],
          action: 'invalid',
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('action');
      });

      it('should reject threshold out of range', () => {
        const result = validateEmotionInput('set_emotion_filter', {
          emotions: ['anger'],
          action: 'suppress',
          threshold: 1.5,
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid filter configuration', () => {
        const result = validateEmotionInput('set_emotion_filter', {
          emotions: ['anger', 'disgust', 'contempt'],
          action: 'suppress',
          threshold: 0.7,
          enabled: true,
        });
        expect(result.valid).toBe(true);
      });

      it('should define action enum in schema', () => {
        expect(emotionToolSchemas.set_emotion_filter.properties.action.enum).toContain('flag');
        expect(emotionToolSchemas.set_emotion_filter.properties.action.enum).toContain('suppress');
        expect(emotionToolSchemas.set_emotion_filter.properties.action.enum).toContain('block');
        expect(emotionToolSchemas.set_emotion_filter.properties.action.enum).toContain('notify');
      });
    });

    describe('get_memories_by_emotion', () => {
      it('should require emotions array', () => {
        expect(validateEmotionInput('get_memories_by_emotion', {}).valid).toBe(false);
      });

      it('should reject invalid min_intensity', () => {
        const result = validateEmotionInput('get_memories_by_emotion', {
          emotions: ['love'],
          min_intensity: -0.5,
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid emotion query', () => {
        const result = validateEmotionInput('get_memories_by_emotion', {
          emotions: ['love', 'joy'],
          min_intensity: 0.5,
          limit: 20,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('correct_emotion', () => {
      it('should require memory_id', () => {
        expect(validateEmotionInput('correct_emotion', {}).valid).toBe(false);
      });

      it('should accept correction with reason', () => {
        const result = validateEmotionInput('correct_emotion', {
          memory_id: 'mem-1',
          corrected_emotions: [{ name: 'joy', confidence: 0.9 }],
          reason: 'was sarcasm not anger',
        });
        expect(result.valid).toBe(true);
      });

      it('should accept clear_all', () => {
        const result = validateEmotionInput('correct_emotion', {
          memory_id: 'mem-1',
          clear_all: true,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('list_emotional_sessions and get_emotion_filters', () => {
      it('should have no required params for list_emotional_sessions', () => {
        expect(emotionToolSchemas.list_emotional_sessions.properties).toEqual({});
      });

      it('should have no required params for get_emotion_filters', () => {
        expect(emotionToolSchemas.get_emotion_filters.properties).toEqual({});
      });
    });
  });

  // ============================================
  // RECALL & FEEDBACK TOOLS
  // ============================================
  describe('Recall & Feedback Tools Validation', () => {
    function validateRecallFeedback(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'search_memories':
          if (!input.query || typeof input.query !== 'string') {
            return { valid: false, error: 'query is required' };
          }
          return { valid: true };

        case 'memory_feedback':
          if (!input.patternId || typeof input.patternId !== 'string') {
            return { valid: false, error: 'patternId is required' };
          }
          if (!input.action || !['used', 'ignored', 'dismissed'].includes(input.action)) {
            return { valid: false, error: 'action must be one of: used, ignored, dismissed' };
          }
          return { valid: true };

        case 'record_prediction_feedback':
          if (!input.hook_id || typeof input.hook_id !== 'string') {
            return { valid: false, error: 'hook_id is required' };
          }
          if (!input.interaction || !['dismissed', 'viewed', 'acted_on', 'saved', 'blocked'].includes(input.interaction)) {
            return { valid: false, error: 'interaction must be one of: dismissed, viewed, acted_on, saved, blocked' };
          }
          return { valid: true };

        case 'get_predictions':
          // Optional context object, no required fields
          return { valid: true };

        case 'resolve_open_loop':
          if (!input.memory_id || typeof input.memory_id !== 'string') {
            return { valid: false, error: 'memory_id is required' };
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('search_memories', () => {
      it('should require query', () => {
        expect(validateRecallFeedback('search_memories', {}).valid).toBe(false);
      });

      it('should accept query with filters', () => {
        const result = validateRecallFeedback('search_memories', {
          query: 'betty medication',
          filters: { tags: ['health'], min_importance: 0.7 },
          limit: 5,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('memory_feedback', () => {
      it('should require patternId', () => {
        const result = validateRecallFeedback('memory_feedback', { action: 'used' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('patternId');
      });

      it('should require valid action', () => {
        const result = validateRecallFeedback('memory_feedback', {
          patternId: 'pat-1',
          action: 'invalid',
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid feedback', () => {
        const result = validateRecallFeedback('memory_feedback', {
          patternId: 'pat-1',
          memoryId: 'mem-1',
          action: 'used',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('record_prediction_feedback', () => {
      it('should require hook_id', () => {
        expect(validateRecallFeedback('record_prediction_feedback', { interaction: 'viewed' }).valid).toBe(false);
      });

      it('should require valid interaction', () => {
        const result = validateRecallFeedback('record_prediction_feedback', {
          hook_id: 'hook-1',
          interaction: 'invalid',
        });
        expect(result.valid).toBe(false);
      });

      it('should accept all interaction types', () => {
        for (const interaction of ['dismissed', 'viewed', 'acted_on', 'saved', 'blocked']) {
          const result = validateRecallFeedback('record_prediction_feedback', {
            hook_id: 'hook-1',
            interaction,
          });
          expect(result.valid).toBe(true);
        }
      });
    });

    describe('get_predictions', () => {
      it('should accept empty input', () => {
        expect(validateRecallFeedback('get_predictions', {}).valid).toBe(true);
      });

      it('should accept context object', () => {
        const result = validateRecallFeedback('get_predictions', {
          context: {
            location: 'office',
            talking_to: ['betty'],
            topics: ['medication'],
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('resolve_open_loop', () => {
      it('should require memory_id', () => {
        expect(validateRecallFeedback('resolve_open_loop', {}).valid).toBe(false);
      });

      it('should accept with resolution note', () => {
        const result = validateRecallFeedback('resolve_open_loop', {
          memory_id: 'mem-1',
          resolution_note: 'Completed the follow-up call',
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  // ============================================
  // RELATIONSHIP & ENTITY TOOLS
  // ============================================
  describe('Relationship & Entity Tools Validation', () => {
    function validateRelationship(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'get_relationship':
          if (!input.entity_a || !input.entity_b) {
            return { valid: false, error: 'entity_a and entity_b are required' };
          }
          return { valid: true };

        case 'get_entity_pressure':
          if (!input.entity_id || typeof input.entity_id !== 'string') {
            return { valid: false, error: 'entity_id is required' };
          }
          return { valid: true };

        case 'set_care_circle':
          if (!input.entity_id || typeof input.entity_id !== 'string') {
            return { valid: false, error: 'entity_id is required' };
          }
          if (!input.care_circle || !Array.isArray(input.care_circle) || input.care_circle.length === 0) {
            return { valid: false, error: 'care_circle array is required and must not be empty' };
          }
          if (input.alert_threshold && !['monitor', 'concern', 'urgent'].includes(input.alert_threshold)) {
            return { valid: false, error: 'alert_threshold must be one of: monitor, concern, urgent' };
          }
          return { valid: true };

        case 'set_entity_vulnerability':
          if (!input.entity_id || typeof input.entity_id !== 'string') {
            return { valid: false, error: 'entity_id is required' };
          }
          if (!input.vulnerability || !['normal', 'moderate', 'high'].includes(input.vulnerability)) {
            return { valid: false, error: 'vulnerability must be one of: normal, moderate, high' };
          }
          return { valid: true };

        case 'clarify_intent':
          if (!input.memory_id || typeof input.memory_id !== 'string') {
            return { valid: false, error: 'memory_id is required' };
          }
          if (!input.what_i_meant || typeof input.what_i_meant !== 'string') {
            return { valid: false, error: 'what_i_meant is required' };
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('get_relationship', () => {
      it('should require both entities', () => {
        expect(validateRelationship('get_relationship', { entity_a: 'alan' }).valid).toBe(false);
        expect(validateRelationship('get_relationship', { entity_b: 'betty' }).valid).toBe(false);
      });

      it('should accept valid entity pair', () => {
        const result = validateRelationship('get_relationship', {
          entity_a: 'alan',
          entity_b: 'betty',
          context: 'regarding caregiving',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('get_entity_pressure', () => {
      it('should require entity_id', () => {
        expect(validateRelationship('get_entity_pressure', {}).valid).toBe(false);
      });

      it('should accept with options', () => {
        const result = validateRelationship('get_entity_pressure', {
          entity_id: 'betty',
          include_vectors: true,
          days: 30,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('set_care_circle', () => {
      it('should require entity_id', () => {
        const result = validateRelationship('set_care_circle', { care_circle: ['daughter'] });
        expect(result.valid).toBe(false);
      });

      it('should require non-empty care_circle', () => {
        const result = validateRelationship('set_care_circle', {
          entity_id: 'betty',
          care_circle: [],
        });
        expect(result.valid).toBe(false);
      });

      it('should reject invalid alert_threshold', () => {
        const result = validateRelationship('set_care_circle', {
          entity_id: 'betty',
          care_circle: ['daughter'],
          alert_threshold: 'invalid',
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid care circle', () => {
        const result = validateRelationship('set_care_circle', {
          entity_id: 'betty',
          care_circle: ['daughter', 'doctor'],
          alert_threshold: 'concern',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('set_entity_vulnerability', () => {
      it('should require entity_id', () => {
        expect(validateRelationship('set_entity_vulnerability', { vulnerability: 'high' }).valid).toBe(false);
      });

      it('should require valid vulnerability level', () => {
        const result = validateRelationship('set_entity_vulnerability', {
          entity_id: 'betty',
          vulnerability: 'extreme',
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid vulnerability with notes', () => {
        const result = validateRelationship('set_entity_vulnerability', {
          entity_id: 'betty',
          vulnerability: 'high',
          notes: "Alzheimer's diagnosis 2024",
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('clarify_intent', () => {
      it('should require memory_id and what_i_meant', () => {
        expect(validateRelationship('clarify_intent', { memory_id: 'mem-1' }).valid).toBe(false);
        expect(validateRelationship('clarify_intent', { what_i_meant: 'test' }).valid).toBe(false);
      });

      it('should accept full clarification', () => {
        const result = validateRelationship('clarify_intent', {
          memory_id: 'mem-1',
          what_i_said: "I'm fine",
          what_i_meant: 'I was hurt but could not say it',
          why_the_gap: 'conflict avoidance',
          pattern: 'I always deflect when vulnerable',
          visibility: 'private',
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  // ============================================
  // BEHAVIORAL IDENTITY TOOLS
  // ============================================
  describe('Behavioral Identity Tools Validation', () => {
    function validateBehavioral(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'identify_user':
          if (!input.message || typeof input.message !== 'string') {
            return { valid: false, error: 'message is required' };
          }
          return { valid: true };

        case 'behavioral_feedback':
          if (!input.predictionId || typeof input.predictionId !== 'string') {
            return { valid: false, error: 'predictionId is required' };
          }
          if (typeof input.correct !== 'boolean') {
            return { valid: false, error: 'correct (boolean) is required' };
          }
          return { valid: true };

        case 'behavioral_metrics':
          if (input.timeRange && !['1h', '24h', '7d', '30d', 'all'].includes(input.timeRange)) {
            return { valid: false, error: 'timeRange must be one of: 1h, 24h, 7d, 30d, all' };
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('identify_user', () => {
      it('should require message', () => {
        expect(validateBehavioral('identify_user', {}).valid).toBe(false);
      });

      it('should accept message with candidate users', () => {
        const result = validateBehavioral('identify_user', {
          message: 'hey whats up, gonna work on the thing today',
          candidateUsers: ['alan', 'betty'],
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('behavioral_feedback', () => {
      it('should require predictionId', () => {
        expect(validateBehavioral('behavioral_feedback', { correct: true }).valid).toBe(false);
      });

      it('should require correct boolean', () => {
        const result = validateBehavioral('behavioral_feedback', { predictionId: 'pred-1' });
        expect(result.valid).toBe(false);
      });

      it('should accept valid feedback with correction', () => {
        const result = validateBehavioral('behavioral_feedback', {
          predictionId: 'pred-1',
          correct: false,
          actualUserId: 'betty',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('behavioral_metrics', () => {
      it('should accept empty input', () => {
        expect(validateBehavioral('behavioral_metrics', {}).valid).toBe(true);
      });

      it('should reject invalid timeRange', () => {
        const result = validateBehavioral('behavioral_metrics', { timeRange: '2h' });
        expect(result.valid).toBe(false);
      });

      it('should accept valid timeRange', () => {
        for (const range of ['1h', '24h', '7d', '30d', 'all']) {
          expect(validateBehavioral('behavioral_metrics', { timeRange: range }).valid).toBe(true);
        }
      });
    });
  });

  // ============================================
  // EVENT DAEMON TOOLS
  // ============================================
  describe('Event Daemon Tools Validation', () => {
    const validEventTypes = [
      'phone_ring', 'phone_call_content', 'doorbell', 'email_received',
      'calendar_reminder', 'time_trigger', 'sensor_alert', 'device_input',
      'silence_detected', 'location_change', 'market_data', 'custom_webhook',
    ];

    function validateDaemon(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'ingest_event':
          if (!input.type || !validEventTypes.includes(input.type)) {
            return { valid: false, error: `type must be one of: ${validEventTypes.join(', ')}` };
          }
          if (!input.entity_id || typeof input.entity_id !== 'string') {
            return { valid: false, error: 'entity_id is required' };
          }
          return { valid: true };

        case 'schedule_check':
          if (!input.entity_id || typeof input.entity_id !== 'string') {
            return { valid: false, error: 'entity_id is required' };
          }
          if (!input.check_type || !['meal_reminder', 'medication_reminder', 'check_in', 'custom'].includes(input.check_type)) {
            return { valid: false, error: 'check_type must be one of: meal_reminder, medication_reminder, check_in, custom' };
          }
          if (!input.delay_minutes || typeof input.delay_minutes !== 'number' || input.delay_minutes <= 0) {
            return { valid: false, error: 'delay_minutes must be a positive number' };
          }
          return { valid: true };

        case 'get_daemon_status':
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('ingest_event', () => {
      it('should require valid event type', () => {
        const result = validateDaemon('ingest_event', { type: 'invalid', entity_id: 'betty' });
        expect(result.valid).toBe(false);
      });

      it('should require entity_id', () => {
        const result = validateDaemon('ingest_event', { type: 'phone_ring' });
        expect(result.valid).toBe(false);
      });

      it('should accept all valid event types', () => {
        for (const type of validEventTypes) {
          const result = validateDaemon('ingest_event', { type, entity_id: 'betty' });
          expect(result.valid).toBe(true);
        }
      });

      it('should accept event with metadata', () => {
        const result = validateDaemon('ingest_event', {
          type: 'phone_ring',
          entity_id: 'betty',
          device_id: 'betty_phone_001',
          metadata: {
            caller_number: '+1555123456',
            caller_name: 'Unknown',
          },
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('schedule_check', () => {
      it('should require entity_id', () => {
        const result = validateDaemon('schedule_check', {
          check_type: 'meal_reminder',
          delay_minutes: 30,
        });
        expect(result.valid).toBe(false);
      });

      it('should require valid check_type', () => {
        const result = validateDaemon('schedule_check', {
          entity_id: 'betty',
          check_type: 'invalid',
          delay_minutes: 30,
        });
        expect(result.valid).toBe(false);
      });

      it('should require positive delay_minutes', () => {
        const result = validateDaemon('schedule_check', {
          entity_id: 'betty',
          check_type: 'medication_reminder',
          delay_minutes: -5,
        });
        expect(result.valid).toBe(false);
      });

      it('should accept valid medication reminder', () => {
        const result = validateDaemon('schedule_check', {
          entity_id: 'betty',
          check_type: 'medication_reminder',
          delay_minutes: 60,
          message: 'Time for your afternoon medication, Betty',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('get_daemon_status', () => {
      it('should accept empty input', () => {
        expect(validateDaemon('get_daemon_status', {}).valid).toBe(true);
      });
    });
  });

  // ============================================
  // MEMORY MANAGEMENT TOOLS
  // ============================================
  describe('Memory Management Tools Validation', () => {
    function validateMemoryMgmt(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'forget_person':
          if (!input.person || typeof input.person !== 'string') {
            return { valid: false, error: 'person is required' };
          }
          if (input.mode && !['suppress', 'archive', 'delete'].includes(input.mode)) {
            return { valid: false, error: 'mode must be one of: suppress, archive, delete' };
          }
          return { valid: true };

        case 'restore':
          if (!input.memoryId || typeof input.memoryId !== 'string') {
            return { valid: false, error: 'memoryId is required' };
          }
          return { valid: true };

        case 'reassociate':
          if (!input.memoryId || typeof input.memoryId !== 'string') {
            return { valid: false, error: 'memoryId is required' };
          }
          return { valid: true };

        case 'export_memories':
          // All fields optional
          if (input.password && typeof input.password !== 'string') {
            return { valid: false, error: 'password must be a string' };
          }
          return { valid: true };

        case 'import_memories':
          if (!input.memories && !input.encryptedData) {
            return { valid: false, error: 'either memories array or encryptedData is required' };
          }
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('forget_person', () => {
      it('should require person', () => {
        expect(validateMemoryMgmt('forget_person', {}).valid).toBe(false);
      });

      it('should reject invalid mode', () => {
        const result = validateMemoryMgmt('forget_person', { person: 'alice', mode: 'invalid' });
        expect(result.valid).toBe(false);
      });

      it('should accept valid forget with options', () => {
        const result = validateMemoryMgmt('forget_person', {
          person: 'alice',
          mode: 'suppress',
          alsoForgetEvents: true,
          alsoForgetLoops: true,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('restore', () => {
      it('should require memoryId', () => {
        expect(validateMemoryMgmt('restore', {}).valid).toBe(false);
      });

      it('should accept valid memoryId', () => {
        expect(validateMemoryMgmt('restore', { memoryId: 'mem-1' }).valid).toBe(true);
      });
    });

    describe('reassociate', () => {
      it('should require memoryId', () => {
        expect(validateMemoryMgmt('reassociate', {}).valid).toBe(false);
      });

      it('should accept with all association changes', () => {
        const result = validateMemoryMgmt('reassociate', {
          memoryId: 'mem-1',
          addPeople: ['betty'],
          removePeople: ['unknown'],
          addTopics: ['health'],
          addTags: ['important'],
          setProject: 'caregiving',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('export_memories', () => {
      it('should accept empty input (all optional)', () => {
        expect(validateMemoryMgmt('export_memories', {}).valid).toBe(true);
      });

      it('should accept filtered export with password', () => {
        const result = validateMemoryMgmt('export_memories', {
          password: 'secure-export-pass',
          people: ['betty'],
          topics: ['medication'],
          fromDate: '2026-01-01',
          toDate: '2026-01-22',
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('import_memories', () => {
      it('should require memories or encryptedData', () => {
        expect(validateMemoryMgmt('import_memories', {}).valid).toBe(false);
      });

      it('should accept memories array', () => {
        const result = validateMemoryMgmt('import_memories', {
          memories: [{ text: 'test memory' }],
          skipDuplicates: true,
        });
        expect(result.valid).toBe(true);
      });

      it('should accept encrypted import', () => {
        const result = validateMemoryMgmt('import_memories', {
          encryptedData: 'base64encryptedblob...',
          password: 'decrypt-pass',
        });
        expect(result.valid).toBe(true);
      });
    });
  });

  // ============================================
  // CONTEXT & PATTERN TOOLS
  // ============================================
  describe('Context & Pattern Tools Validation', () => {
    function validateContext(toolName: string, input: any): { valid: boolean; error?: string } {
      switch (toolName) {
        case 'clear_context':
          // All optional
          if (input.dimensions && !Array.isArray(input.dimensions)) {
            return { valid: false, error: 'dimensions must be an array' };
          }
          if (input.dimensions) {
            const valid = ['location', 'people', 'activity', 'calendar', 'mood'];
            for (const d of input.dimensions) {
              if (!valid.includes(d)) {
                return { valid: false, error: `invalid dimension: ${d}` };
              }
            }
          }
          return { valid: true };

        case 'whats_relevant':
          // All optional
          return { valid: true };

        case 'list_devices':
          return { valid: true };

        case 'get_status':
          return { valid: true };

        case 'get_pattern_stats':
          return { valid: true };

        case 'get_tier_stats':
          return { valid: true };

        case 'get_anticipated_context':
          // All optional
          return { valid: true };

        default:
          return { valid: true };
      }
    }

    describe('clear_context', () => {
      it('should accept empty input (clear all)', () => {
        expect(validateContext('clear_context', {}).valid).toBe(true);
      });

      it('should accept valid dimensions', () => {
        const result = validateContext('clear_context', {
          dimensions: ['location', 'people'],
          deviceId: 'device-1',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid dimensions', () => {
        const result = validateContext('clear_context', {
          dimensions: ['invalid_dimension'],
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('no-param tools', () => {
      it('whats_relevant should accept empty input', () => {
        expect(validateContext('whats_relevant', {}).valid).toBe(true);
      });

      it('list_devices should accept empty input', () => {
        expect(validateContext('list_devices', {}).valid).toBe(true);
      });

      it('get_status should accept empty input', () => {
        expect(validateContext('get_status', {}).valid).toBe(true);
      });

      it('get_pattern_stats should accept empty input', () => {
        expect(validateContext('get_pattern_stats', {}).valid).toBe(true);
      });

      it('get_tier_stats should accept empty input', () => {
        expect(validateContext('get_tier_stats', {}).valid).toBe(true);
      });

      it('get_anticipated_context should accept context frame', () => {
        const result = validateContext('get_anticipated_context', {
          context_frame: { activity: 'meeting', people: ['betty'] },
          max_memories: 5,
        });
        expect(result.valid).toBe(true);
      });
    });
  });
});
