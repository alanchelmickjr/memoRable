import { ModelSelectionService } from '../../src/services/modelSelectionService.js';

describe('ModelSelectionService', () => {
  let modelService;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    modelService = new ModelSelectionService();
  });

  afterEach(() => {
    process.env = originalEnv;
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

  describe('getOptimalConfig', () => {
    it('should return complete configuration', async () => {
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
    });
  });
});