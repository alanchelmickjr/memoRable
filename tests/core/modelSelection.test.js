import { ModelSelectionService } from '../../src/services/modelSelectionService.js';
import os from 'os';

describe('ModelSelectionService', () => {
  let modelService;
  let originalEnv;
  let originalSetInterval;
  let originalProcessMemoryUsage;
  let originalOsTotalmem;

  beforeEach(() => {
    originalEnv = process.env;
    originalSetInterval = global.setInterval;
    originalProcessMemoryUsage = process.memoryUsage;
    originalOsTotalmem = os.totalmem;

    process.env = { ...originalEnv };
    global.setInterval = jest.fn();
    process.memoryUsage = jest.fn(() => ({
      heapUsed: 100 * 1024 * 1024,
      heapTotal: 200 * 1024 * 1024,
      rss: 300 * 1024 * 1024
    }));
    os.totalmem = jest.fn(() => 1024 * 1024 * 1024); // 1GB

    modelService = new ModelSelectionService();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.setInterval = originalSetInterval;
    process.memoryUsage = originalProcessMemoryUsage;
    os.totalmem = originalOsTotalmem;
    jest.clearAllMocks();
  });

  describe('getModelConfig', () => {
    it('should return local config in development environment', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_CUDA = '0';
      
      const config = modelService.getModelConfig();
      expect(config).toBe('ollama/mistral:3.2-small');
    });

    it('should return server config in production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const config = modelService.getModelConfig();
      expect(config).toBe('ollama/mistral:7b-instruct');
    });

    it('should return server config when GPU is available locally', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_CUDA = '1';
      
      const config = modelService.getModelConfig();
      expect(config).toBe('ollama/mistral:7b-instruct');
    });
  });

  describe('validateModel', () => {
    it('should return true when model is available', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          json: () => Promise.resolve({
            models: [{ name: 'ollama/mistral:3.2-small' }]
          })
        })
      );

      const isValid = await modelService.validateModel('ollama/mistral:3.2-small');
      expect(isValid).toBe(true);
    });

    it('should return false when model is not available', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          json: () => Promise.resolve({
            models: []
          })
        })
      );

      const isValid = await modelService.validateModel('nonexistent-model');
      expect(isValid).toBe(false);
      expect(modelService.metrics.errors).toBe(1);
    });
  });

  describe('ensureModel', () => {
    it('should return fallback model when requested model is not available', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          json: () => Promise.resolve({
            models: []
          })
        })
      );

      const model = await modelService.ensureModel();
      expect(model).toBe('ollama/tinyllama');
    });
  });

  describe('getResourceLimits', () => {
    it('should return development resource limits', () => {
      process.env.NODE_ENV = 'development';
      
      const limits = modelService.getResourceLimits();
      expect(limits).toEqual({
        maxMemory: '4gb',
        maxThreads: 4,
        batchSize: 8
      });
    });

    it('should return production resource limits', () => {
      process.env.NODE_ENV = 'production';
      
      const limits = modelService.getResourceLimits();
      expect(limits).toEqual({
        maxMemory: '16gb',
        maxThreads: 8,
        batchSize: 32
      });
    });
  });
  
    describe('Memoization', () => {
      it('should cache and retrieve responses', async () => {
        const prompt = 'test prompt';
        const response = { text: 'test response' };
        const modelName = 'test-model';
        const taskType = 'test-task';
        const criticality = 0.9;
  
        // Initially should return null as no cache exists
        const initialResult = await modelService.getMemoizedResponse(prompt, modelName, taskType);
        expect(initialResult).toBeNull();
  
        // Memoize the response
        await modelService.memoizeResponse(prompt, response, modelName, taskType, criticality);
  
        // Should retrieve the cached response
        const cachedResult = await modelService.getMemoizedResponse(prompt, modelName, taskType);
        expect(cachedResult).toEqual(response);
      });
  
      it('should not cache responses below criticality threshold', async () => {
        const prompt = 'test prompt';
        const response = { text: 'test response' };
        const modelName = 'test-model';
        const taskType = 'test-task';
        const criticality = 0.5; // Below threshold
  
        await modelService.memoizeResponse(prompt, response, modelName, taskType, criticality);
        const result = await modelService.getMemoizedResponse(prompt, modelName, taskType);
        expect(result).toBeNull();
      });
  
      it('should maintain cache size limit', async () => {
        const maxSize = modelService.cacheConfig.maxSize;
        const criticality = 0.9;
  
        // Fill cache beyond limit
        for (let i = 0; i <= maxSize + 10; i++) {
          await modelService.memoizeResponse(
            `prompt${i}`,
            { text: `response${i}` },
            'test-model',
            'test-task',
            criticality
          );
        }
  
        expect(modelService.responseCache.size).toBeLessThanOrEqual(maxSize);
      });
  
      it('should track task patterns', async () => {
        const taskType = 'test-task';
        const prompt = 'test prompt';
        const criticality = 0.9;
  
        await modelService.memoizeResponse(prompt, { text: 'response' }, 'test-model', taskType, criticality);
        
        const patterns = modelService.taskPatternCache.get(taskType);
        expect(patterns).toBeDefined();
        expect(patterns.length).toBe(1);
        expect(patterns[0].prompt).toBe(prompt);
      });
  
      it('should handle cache expiration', async () => {
        const prompt = 'test prompt';
        const response = { text: 'test response' };
        const modelName = 'test-model';
        const taskType = 'test-task';
        const criticality = 0.9;
  
        // Mock Date.now to simulate time passing
        const realDateNow = Date.now;
        const currentTime = Date.now();
        Date.now = jest.fn(() => currentTime);
  
        await modelService.memoizeResponse(prompt, response, modelName, taskType, criticality);
  
        // Move time forward beyond TTL
        Date.now = jest.fn(() => currentTime + modelService.cacheConfig.ttl + 1000);
  
        const result = await modelService.getMemoizedResponse(prompt, modelName, taskType);
        expect(result).toBeNull();
  
        // Restore Date.now
        Date.now = realDateNow;
      });
    });
  
    describe('Model State Management', () => {
      it('should track and update model state', async () => {
        const modelName = 'test-model';
        const metrics = {
          latency: 100,
          success: true
        };
  
        // Initial state should have default values
        const initialState = await modelService.getModelState(modelName);
        expect(initialState).toEqual({
          lastUsed: 0,
          performance: {},
          errors: 0
        });
  
        // Update state
        await modelService.updateModelState(modelName, metrics);
  
        // Check updated state
        const updatedState = await modelService.getModelState(modelName);
        expect(updatedState).toEqual({
          ...metrics,
          lastUsed: expect.any(Number)
        });
      });
    });
  
    describe('Performance Monitoring', () => {
      it('should include cache statistics in metrics', async () => {
        // Add some test data
        await modelService.memoizeResponse('prompt', { text: 'response' }, 'test-model', 'test-task', 0.9);
  
        const metrics = modelService.getMetrics();
        expect(metrics.cacheStats).toBeDefined();
        expect(metrics.cacheStats.size).toBe(1);
        expect(metrics.cacheStats.taskPatterns).toBeDefined();
      });
    });

  describe('getOptimalConfig', () => {
    it('should return complete configuration and update metrics', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_CUDA = '1';
      
      global.fetch = jest.fn(() => 
        Promise.resolve({
          json: () => Promise.resolve({
            models: [{ name: 'ollama/mistral:7b-instruct' }]
          })
        })
      );

      const config = await modelService.getOptimalConfig();
      expect(config).toEqual({
        model: 'ollama/mistral:7b-instruct',
        maxMemory: '4gb',
        maxThreads: 4,
        batchSize: 8,
        environment: 'local',
        gpu: true
      });

      expect(modelService.metrics.requestCount).toBe(1);
      expect(modelService.metrics.totalLatency).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should start performance monitoring on initialization', () => {
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        30000
      );
    });

    it('should track memory usage correctly', () => {
      const memoryUsage = modelService.getMemoryUsage();
      expect(memoryUsage).toEqual({
        heapUsed: '95.37MB',
        heapTotal: '190.73MB',
        rss: '286.10MB',
        percentage: '9.77%'
      });
    });

    it('should determine model switch need based on memory usage', () => {
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 900 * 1024 * 1024, // 90% of 1GB
        heapTotal: 1024 * 1024 * 1024,
        rss: 950 * 1024 * 1024
      }));

      const memoryUsage = modelService.getMemoryUsage();
      expect(modelService.shouldSwitchModel(memoryUsage)).toBe(true);
    });
  });

  describe('Model Warm-up', () => {
    it('should warm up model successfully', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      );

      const result = await modelService.warmupModel('ollama/mistral:3.2-small');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.any(Object)
      );
    });

    it('should handle warm-up failures', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          ok: false,
          statusText: 'Internal Server Error'
        })
      );

      const result = await modelService.warmupModel('ollama/mistral:3.2-small');
      expect(result).toBe(false);
      expect(modelService.metrics.errors).toBe(1);
    });
  });

  describe('Metrics', () => {
    it('should provide accurate metrics', async () => {
      // Simulate some activity
      await modelService.getOptimalConfig();
      await modelService.getOptimalConfig();
      
      const metrics = modelService.getMetrics();
      expect(metrics).toEqual(expect.objectContaining({
        requestCount: 2,
        totalLatency: expect.any(Number),
        errors: 0,
        avgLatency: expect.any(Number),
        modelUsage: expect.any(Object)
      }));
    });
  });
});