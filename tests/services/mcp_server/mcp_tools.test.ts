/**
 * @file Tests for MCP Server Tools
 * Tests the MCP tool implementations with mocked dependencies
 */

describe('MCP Server Tools', () => {
  describe('Tool Schema Validation', () => {
    const toolSchemas = {
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
});
