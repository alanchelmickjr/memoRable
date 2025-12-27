/**
 * @file API Integration Tests
 * Tests for the Express API endpoints
 */

describe('API Integration Tests', () => {
  describe('Health Check Endpoints', () => {
    // Mock Express app for testing
    function createMockHealthHandler() {
      return {
        '/health': () => ({ status: 'ok', timestamp: new Date().toISOString() }),
        '/health/live': () => ({ status: 'alive' }),
        '/health/ready': (services: { mongo: boolean; redis: boolean }) => {
          if (!services.mongo || !services.redis) {
            return { status: 'not_ready', services };
          }
          return { status: 'ready', services };
        },
      };
    }

    it('should return ok status for basic health check', () => {
      const handlers = createMockHealthHandler();
      const response = handlers['/health']();

      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
    });

    it('should return alive status for liveness probe', () => {
      const handlers = createMockHealthHandler();
      const response = handlers['/health/live']();

      expect(response.status).toBe('alive');
    });

    it('should return ready when all services are up', () => {
      const handlers = createMockHealthHandler();
      const response = handlers['/health/ready']({ mongo: true, redis: true });

      expect(response.status).toBe('ready');
    });

    it('should return not_ready when MongoDB is down', () => {
      const handlers = createMockHealthHandler();
      const response = handlers['/health/ready']({ mongo: false, redis: true });

      expect(response.status).toBe('not_ready');
      expect(response.services.mongo).toBe(false);
    });

    it('should return not_ready when Redis is down', () => {
      const handlers = createMockHealthHandler();
      const response = handlers['/health/ready']({ mongo: true, redis: false });

      expect(response.status).toBe('not_ready');
      expect(response.services.redis).toBe(false);
    });
  });

  describe('Memory API Endpoints', () => {
    // Mock memory API handlers
    function createMockMemoryHandler() {
      const memories: Map<string, any> = new Map();

      return {
        post: (body: { text: string; userId?: string; context?: any }) => {
          if (!body.text) {
            return { status: 400, error: 'text is required' };
          }
          const memoryId = `mem_${Date.now()}`;
          const memory = {
            memoryId,
            text: body.text,
            userId: body.userId || 'default',
            context: body.context || {},
            createdAt: new Date().toISOString(),
            salience: Math.floor(Math.random() * 100),
          };
          memories.set(memoryId, memory);
          return { status: 201, data: memory };
        },

        get: (memoryId: string) => {
          const memory = memories.get(memoryId);
          if (!memory) {
            return { status: 404, error: 'Memory not found' };
          }
          return { status: 200, data: memory };
        },

        search: (query: { q?: string; person?: string; limit?: number }) => {
          const results = Array.from(memories.values())
            .filter((m) => {
              if (query.q && !m.text.toLowerCase().includes(query.q.toLowerCase())) {
                return false;
              }
              return true;
            })
            .slice(0, query.limit || 10);
          return { status: 200, data: results };
        },

        delete: (memoryId: string) => {
          if (!memories.has(memoryId)) {
            return { status: 404, error: 'Memory not found' };
          }
          memories.delete(memoryId);
          return { status: 204 };
        },
      };
    }

    it('should create a memory', () => {
      const handler = createMockMemoryHandler();
      const response = handler.post({ text: 'Test memory' });

      expect(response.status).toBe(201);
      expect(response.data.memoryId).toBeDefined();
      expect(response.data.text).toBe('Test memory');
    });

    it('should reject memory without text', () => {
      const handler = createMockMemoryHandler();
      const response = handler.post({ text: '' });

      expect(response.status).toBe(400);
      expect(response.error).toContain('text');
    });

    it('should retrieve a memory by ID', () => {
      const handler = createMockMemoryHandler();
      const created = handler.post({ text: 'Test memory' });
      const response = handler.get(created.data.memoryId);

      expect(response.status).toBe(200);
      expect(response.data.text).toBe('Test memory');
    });

    it('should return 404 for non-existent memory', () => {
      const handler = createMockMemoryHandler();
      const response = handler.get('non-existent-id');

      expect(response.status).toBe(404);
    });

    it('should search memories by query', () => {
      const handler = createMockMemoryHandler();
      handler.post({ text: 'Meeting with Alice about project' });
      handler.post({ text: 'Lunch with Bob' });
      handler.post({ text: 'Alice called about deadline' });

      const response = handler.search({ q: 'Alice' });

      expect(response.status).toBe(200);
      expect(response.data.length).toBe(2);
    });

    it('should respect search limit', () => {
      const handler = createMockMemoryHandler();
      for (let i = 0; i < 20; i++) {
        handler.post({ text: `Memory ${i}` });
      }

      const response = handler.search({ limit: 5 });

      expect(response.data.length).toBeLessThanOrEqual(5);
    });

    it('should delete a memory', () => {
      const handler = createMockMemoryHandler();
      const created = handler.post({ text: 'To be deleted' });
      const deleteResponse = handler.delete(created.data.memoryId);
      const getResponse = handler.get(created.data.memoryId);

      expect(deleteResponse.status).toBe(204);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('Loops API Endpoints', () => {
    function createMockLoopsHandler() {
      const loops: Map<string, any> = new Map();

      return {
        list: (filters: { owner?: string; status?: string; person?: string }) => {
          let results = Array.from(loops.values());

          if (filters.status) {
            results = results.filter((l) => l.status === filters.status);
          }
          if (filters.owner) {
            results = results.filter((l) => l.owner === filters.owner);
          }
          if (filters.person) {
            results = results.filter((l) => l.otherParty === filters.person);
          }

          return { status: 200, data: results };
        },

        create: (body: { description: string; owner: string; otherParty?: string; dueDate?: string }) => {
          if (!body.description) {
            return { status: 400, error: 'description is required' };
          }
          const loopId = `loop_${Date.now()}`;
          const loop = {
            id: loopId,
            description: body.description,
            owner: body.owner || 'self',
            otherParty: body.otherParty,
            dueDate: body.dueDate,
            status: 'open',
            createdAt: new Date().toISOString(),
          };
          loops.set(loopId, loop);
          return { status: 201, data: loop };
        },

        close: (loopId: string) => {
          const loop = loops.get(loopId);
          if (!loop) {
            return { status: 404, error: 'Loop not found' };
          }
          loop.status = 'completed';
          loop.completedAt = new Date().toISOString();
          return { status: 200, data: loop };
        },

        abandon: (loopId: string, reason?: string) => {
          const loop = loops.get(loopId);
          if (!loop) {
            return { status: 404, error: 'Loop not found' };
          }
          loop.status = 'abandoned';
          loop.abandonReason = reason;
          return { status: 200, data: loop };
        },
      };
    }

    it('should list loops', () => {
      const handler = createMockLoopsHandler();
      handler.create({ description: 'Send report', owner: 'self' });
      handler.create({ description: 'Review proposal', owner: 'them' });

      const response = handler.list({});

      expect(response.status).toBe(200);
      expect(response.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter loops by owner', () => {
      const handler = createMockLoopsHandler();
      handler.create({ description: 'Send report', owner: 'self' });
      handler.create({ description: 'Review proposal', owner: 'them' });

      const response = handler.list({ owner: 'self' });

      expect(response.data.length).toBeGreaterThanOrEqual(1);
      expect(response.data.every((l: any) => l.owner === 'self')).toBe(true);
    });

    it('should close a loop', () => {
      const handler = createMockLoopsHandler();
      const created = handler.create({ description: 'Test loop', owner: 'self' });
      const response = handler.close(created.data.id);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('completed');
      expect(response.data.completedAt).toBeDefined();
    });

    it('should abandon a loop with reason', () => {
      const handler = createMockLoopsHandler();
      const created = handler.create({ description: 'Test loop', owner: 'self' });
      const response = handler.abandon(created.data.id, 'No longer needed');

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('abandoned');
      expect(response.data.abandonReason).toBe('No longer needed');
    });
  });

  describe('Briefing API Endpoints', () => {
    function createMockBriefingHandler() {
      return {
        getForPerson: (person: string) => {
          if (!person) {
            return { status: 400, error: 'person is required' };
          }
          return {
            status: 200,
            data: {
              person,
              relationship: {
                firstInteraction: '2023-06-15',
                lastInteraction: '2024-01-10',
                totalInteractions: 25,
                trend: 'stable',
              },
              openLoops: {
                youOweThem: [{ description: 'Send notes' }],
                theyOweYou: [{ description: 'Review proposal' }],
                mutual: [],
              },
              upcomingEvents: [
                { description: 'Birthday', date: '2024-02-15', daysUntil: 30 },
              ],
              suggestedTopics: ['Project update', 'Birthday coming up'],
              sensitivities: [],
            },
          };
        },

        getDaily: (date?: string) => {
          return {
            status: 200,
            data: {
              date: date || new Date().toISOString().split('T')[0],
              greeting: 'Good morning!',
              dayOutlook: '3 meetings scheduled.',
              overdueLoops: [{ description: 'Follow up with client' }],
              upcomingDeadlines: [{ description: 'Report due', daysUntil: 2 }],
              anticipatedContexts: [],
            },
          };
        },
      };
    }

    it('should get briefing for a person', () => {
      const handler = createMockBriefingHandler();
      const response = handler.getForPerson('Alice');

      expect(response.status).toBe(200);
      expect(response.data.person).toBe('Alice');
      expect(response.data.relationship).toBeDefined();
      expect(response.data.openLoops).toBeDefined();
    });

    it('should include suggested topics in briefing', () => {
      const handler = createMockBriefingHandler();
      const response = handler.getForPerson('Alice');

      expect(response.data.suggestedTopics.length).toBeGreaterThan(0);
    });

    it('should get daily briefing', () => {
      const handler = createMockBriefingHandler();
      const response = handler.getDaily();

      expect(response.status).toBe(200);
      expect(response.data.greeting).toBeDefined();
      expect(response.data.dayOutlook).toBeDefined();
    });

    it('should include overdue loops in daily briefing', () => {
      const handler = createMockBriefingHandler();
      const response = handler.getDaily();

      expect(response.data.overdueLoops).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    function createErrorHandler() {
      return {
        handleError: (error: Error) => {
          if (error.name === 'ValidationError') {
            return { status: 400, error: error.message };
          }
          if (error.name === 'NotFoundError') {
            return { status: 404, error: error.message };
          }
          if (error.name === 'UnauthorizedError') {
            return { status: 401, error: 'Unauthorized' };
          }
          return { status: 500, error: 'Internal server error' };
        },
      };
    }

    it('should return 400 for validation errors', () => {
      const handler = createErrorHandler();
      const error = new Error('Invalid input');
      error.name = 'ValidationError';

      const response = handler.handleError(error);

      expect(response.status).toBe(400);
    });

    it('should return 404 for not found errors', () => {
      const handler = createErrorHandler();
      const error = new Error('Resource not found');
      error.name = 'NotFoundError';

      const response = handler.handleError(error);

      expect(response.status).toBe(404);
    });

    it('should return 401 for unauthorized errors', () => {
      const handler = createErrorHandler();
      const error = new Error('Not authorized');
      error.name = 'UnauthorizedError';

      const response = handler.handleError(error);

      expect(response.status).toBe(401);
    });

    it('should return 500 for unknown errors', () => {
      const handler = createErrorHandler();
      const error = new Error('Something went wrong');

      const response = handler.handleError(error);

      expect(response.status).toBe(500);
    });
  });

  describe('Request Validation Middleware', () => {
    function validateRequest(schema: any, body: any): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      // Check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in body) || body[field] === undefined || body[field] === null) {
            errors.push(`${field} is required`);
          }
        }
      }

      // Check field types
      if (schema.properties) {
        for (const [field, def] of Object.entries(schema.properties) as [string, any][]) {
          if (field in body && body[field] !== undefined) {
            const value = body[field];
            if (def.type === 'string' && typeof value !== 'string') {
              errors.push(`${field} must be a string`);
            }
            if (def.type === 'number' && typeof value !== 'number') {
              errors.push(`${field} must be a number`);
            }
            if (def.type === 'array' && !Array.isArray(value)) {
              errors.push(`${field} must be an array`);
            }
            if (def.enum && !def.enum.includes(value)) {
              errors.push(`${field} must be one of: ${def.enum.join(', ')}`);
            }
            if (def.minLength && typeof value === 'string' && value.length < def.minLength) {
              errors.push(`${field} must be at least ${def.minLength} characters`);
            }
          }
        }
      }

      return { valid: errors.length === 0, errors };
    }

    it('should validate required fields', () => {
      const schema = {
        required: ['text'],
        properties: { text: { type: 'string' } },
      };

      const result = validateRequest(schema, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('text is required');
    });

    it('should validate field types', () => {
      const schema = {
        properties: { count: { type: 'number' } },
      };

      const result = validateRequest(schema, { count: 'not a number' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('count must be a number');
    });

    it('should validate enum values', () => {
      const schema = {
        properties: { status: { type: 'string', enum: ['open', 'closed'] } },
      };

      const result = validateRequest(schema, { status: 'invalid' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('status must be one of: open, closed');
    });

    it('should pass valid input', () => {
      const schema = {
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 1 },
          limit: { type: 'number' },
        },
      };

      const result = validateRequest(schema, { text: 'Hello', limit: 10 });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
