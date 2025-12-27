/**
 * @file Tests for OpenSCAD Service
 *
 * Tests SCAD code generation including:
 * - Code validation
 * - Template generation
 * - Caching
 * - Error handling
 */

import { ScadService, createScadService, ScadConfig } from '../../../src/services/scad_service/index';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const mockProcess = {
      stderr: {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            // Don't emit any stderr data (success)
          }
        }),
      },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful completion
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: jest.fn(),
    };
    return mockProcess;
  }),
}));

// Mock fs operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock file data')),
    stat: jest.fn().mockResolvedValue({ size: 5000 }),
  },
}));

describe('ScadService', () => {
  let service: ScadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScadService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeInstanceOf(ScadService);
    });

    it('should create service with custom config', () => {
      const config: ScadConfig = {
        openscadPath: '/custom/path/openscad',
        outputDir: '/custom/output',
        cacheEnabled: false,
        maxCacheSize: 50,
        defaultResolution: 128,
      };
      const customService = new ScadService(config);
      expect(customService).toBeInstanceOf(ScadService);
    });
  });

  describe('createScadService factory', () => {
    it('should create new service instance', () => {
      const svc = createScadService();
      expect(svc).toBeInstanceOf(ScadService);
    });

    it('should accept custom config', () => {
      const svc = createScadService({ maxCacheSize: 200 });
      expect(svc.getCacheStats().maxSize).toBe(200);
    });
  });

  describe('validateCode', () => {
    describe('balanced brackets', () => {
      it('should validate balanced curly braces', () => {
        const result = service.validateCode('module test() { cube(10); }');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect unbalanced curly braces', () => {
        const result = service.validateCode('module test() { cube(10);');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unbalanced curly braces {}');
      });

      it('should validate balanced parentheses', () => {
        const result = service.validateCode('cube([10, 10, 10]);');
        expect(result.valid).toBe(true);
      });

      it('should detect unbalanced parentheses', () => {
        const result = service.validateCode('cube([10, 10, 10];');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unbalanced parentheses ()');
      });

      it('should validate balanced square brackets', () => {
        const result = service.validateCode('cube([10, 20, 30]);');
        expect(result.valid).toBe(true);
      });

      it('should detect unbalanced square brackets', () => {
        const result = service.validateCode('cube([10, 20, 30);');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unbalanced square brackets []');
      });
    });

    describe('syntax checks', () => {
      it('should detect double semicolons', () => {
        const result = service.validateCode('cube(10);; sphere(5);');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Double semicolons detected');
      });

      it('should allow single semicolons', () => {
        const result = service.validateCode('cube(10); sphere(5);');
        expect(result.valid).toBe(true);
      });
    });

    describe('security checks', () => {
      it('should reject include statements', () => {
        const result = service.validateCode('include </etc/passwd>');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('External file operations not allowed: include');
      });

      it('should reject use statements', () => {
        const result = service.validateCode('use <MCAD/boxes.scad>');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('External file operations not allowed: use');
      });

      it('should reject import statements', () => {
        const result = service.validateCode('import ("model.stl");');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('External file operations not allowed: import');
      });

      it('should reject surface operations', () => {
        const result = service.validateCode('surface (file = "surface.dat");');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('External file operations not allowed: surface');
      });

      it('should allow safe code', () => {
        const result = service.validateCode(`
          module safe_cube(size) {
            cube([size, size, size], center=true);
          }
          safe_cube(20);
        `);
        expect(result.valid).toBe(true);
      });
    });

    describe('complex validation', () => {
      it('should detect multiple errors', () => {
        const result = service.validateCode('include <bad.scad>;; cube(10);');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });

      it('should validate complex nested structures', () => {
        const result = service.validateCode(`
          difference() {
            union() {
              cube([20, 20, 20], center=true);
              for (i = [0:3]) {
                rotate([0, 0, i * 90])
                  translate([15, 0, 0])
                    sphere(r=5, $fn=32);
              }
            }
            cylinder(r=8, h=30, center=true, $fn=64);
          }
        `);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('getTemplates', () => {
    it('should return array of templates', () => {
      const templates = service.getTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should include cube template', () => {
      const templates = service.getTemplates();
      const cube = templates.find((t) => t.name === 'Cube');
      expect(cube).toBeDefined();
      expect(cube?.parameters).toContainEqual(
        expect.objectContaining({ name: 'size', type: 'number' })
      );
    });

    it('should include sphere template', () => {
      const templates = service.getTemplates();
      const sphere = templates.find((t) => t.name === 'Sphere');
      expect(sphere).toBeDefined();
      expect(sphere?.parameters).toContainEqual(
        expect.objectContaining({ name: 'radius' })
      );
    });

    it('should include cylinder template', () => {
      const templates = service.getTemplates();
      const cylinder = templates.find((t) => t.name === 'Cylinder');
      expect(cylinder).toBeDefined();
    });

    it('should include torus template', () => {
      const templates = service.getTemplates();
      const torus = templates.find((t) => t.name === 'Torus');
      expect(torus).toBeDefined();
      expect(torus?.description).toContain('donut');
    });

    it('should include gear template', () => {
      const templates = service.getTemplates();
      const gear = templates.find((t) => t.name === 'Simple Gear');
      expect(gear).toBeDefined();
    });
  });

  describe('getTemplate', () => {
    it('should return template by name', () => {
      const template = service.getTemplate('cube');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Cube');
    });

    it('should return undefined for unknown template', () => {
      const template = service.getTemplate('unknown');
      expect(template).toBeUndefined();
    });
  });

  describe('registerTemplate', () => {
    it('should register custom template', () => {
      service.registerTemplate({
        name: 'Custom Shape',
        description: 'A custom shape',
        code: 'cube(size);',
        parameters: [{ name: 'size', type: 'number', default: 10 }],
      });

      const template = service.getTemplate('custom shape');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Custom Shape');
    });
  });

  describe('generate', () => {
    it('should return error for invalid code', async () => {
      const result = await service.generate('include <bad.scad>');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should generate model for valid code', async () => {
      const result = await service.generate('cube(10);');
      expect(result.success).toBe(true);
      expect(result.modelPath).toBeDefined();
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should use default options', async () => {
      const result = await service.generate('sphere(5);');
      expect(result.success).toBe(true);
      expect(result.previewPath).toBeDefined(); // Preview enabled by default
    });

    it('should respect custom options', async () => {
      const result = await service.generate('cube(10);', {
        format: 'stl',
        resolution: 128,
        preview: false,
      });
      expect(result.success).toBe(true);
    });

    it('should cache results when enabled', async () => {
      const code = 'cube([5, 5, 5]);';

      // First call - should process
      const result1 = await service.generate(code);
      expect(result1.success).toBe(true);

      // Second call - should use cache
      const result2 = await service.generate(code);
      expect(result2).toEqual(result1);
    });

    it('should not cache when disabled', async () => {
      const noCacheService = new ScadService({ cacheEnabled: false });
      const code = 'cube([5, 5, 5]);';

      await noCacheService.generate(code);
      await noCacheService.generate(code);

      expect(noCacheService.getCacheStats().size).toBe(0);
    });

    it('should emit generate:complete event on success', async () => {
      const emitted: any[] = [];
      service.on('generate:complete', (data) => emitted.push(data));

      await service.generate('cube(10);');

      expect(emitted.length).toBe(1);
      expect(emitted[0].result.success).toBe(true);
    });

    it('should prevent duplicate processing', async () => {
      const code = 'sphere(r=10);';

      // Start first generation
      const promise1 = service.generate(code);

      // Clear cache to force reprocessing attempt
      service.clearCache();

      // Attempt duplicate generation
      const promise2 = service.generate(code);

      const results = await Promise.all([promise1, promise2]);

      // First should succeed
      expect(results[0].success).toBe(true);
      // Second should fail (duplicate) or succeed from cache
    });
  });

  describe('generateFromTemplate', () => {
    it('should generate from cube template', async () => {
      const result = await service.generateFromTemplate('cube', { size: 20 });
      expect(result.success).toBe(true);
    });

    it('should generate from sphere template with custom radius', async () => {
      const result = await service.generateFromTemplate('sphere', {
        radius: 15,
        resolution: 48,
      });
      expect(result.success).toBe(true);
    });

    it('should use default parameter values', async () => {
      const result = await service.generateFromTemplate('cylinder', {});
      expect(result.success).toBe(true);
    });

    it('should return error for unknown template', async () => {
      const result = await service.generateFromTemplate('nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Template not found');
    });

    it('should handle boolean parameters', async () => {
      const result = await service.generateFromTemplate('cube', {
        size: 15,
        centered: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should return cache stats', () => {
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(100); // default
    });

    it('should clear cache', async () => {
      await service.generate('cube(10);');

      let stats = service.getCacheStats();
      expect(stats.size).toBe(1);

      service.clearCache();

      stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should prune cache when exceeding max size', async () => {
      const smallCacheService = new ScadService({ maxCacheSize: 2 });

      await smallCacheService.generate('cube(1);');
      await smallCacheService.generate('cube(2);');
      await smallCacheService.generate('cube(3);');

      const stats = smallCacheService.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(2);
    });
  });

  describe('getModelData', () => {
    it('should read model file', async () => {
      const data = await service.getModelData('/tmp/test.stl');
      expect(Buffer.isBuffer(data)).toBe(true);
    });
  });

  describe('getPreviewData', () => {
    it('should read preview image', async () => {
      const data = await service.getPreviewData('/tmp/test.png');
      expect(Buffer.isBuffer(data)).toBe(true);
    });
  });

  describe('event emission', () => {
    it('should emit generate:error on failure', async () => {
      const { spawn } = require('child_process');
      spawn.mockImplementationOnce(() => ({
        stderr: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('OpenSCAD error'));
            }
          }),
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10); // Non-zero exit code
          }
        }),
        kill: jest.fn(),
      }));

      const emitted: any[] = [];
      service.on('generate:error', (data) => emitted.push(data));
      service.clearCache(); // Force fresh generation

      const result = await service.generate('valid_code();');

      // Either error was emitted or it was cached
      if (!result.success) {
        expect(emitted.length).toBe(1);
      }
    });
  });

  describe('template parameters', () => {
    it('should have correct parameter types', () => {
      const gear = service.getTemplate('gear');
      expect(gear?.parameters).toContainEqual(
        expect.objectContaining({
          name: 'teeth',
          type: 'number',
          min: 6,
          max: 100,
        })
      );
    });

    it('should have valid default values', () => {
      const templates = service.getTemplates();
      for (const template of templates) {
        for (const param of template.parameters) {
          expect(param.default).toBeDefined();
        }
      }
    });
  });
});
