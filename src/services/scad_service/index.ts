/**
 * @file OpenSCAD Service for MemoRable
 *
 * Generates 3D models from OpenSCAD code.
 * Converts SCAD to STL for viewing and export.
 *
 * Features:
 * - SCAD code validation
 * - STL generation via openscad CLI
 * - Preview image generation
 * - Model caching
 * - Template library for common shapes
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface ScadConfig {
  openscadPath?: string;
  outputDir?: string;
  cacheEnabled?: boolean;
  maxCacheSize?: number;
  defaultResolution?: number;
}

export interface GenerateOptions {
  resolution?: number;
  format?: 'stl' | 'off' | 'amf' | '3mf';
  preview?: boolean;
  previewSize?: { width: number; height: number };
  previewRotation?: { x: number; y: number; z: number };
}

export interface GenerateResult {
  success: boolean;
  modelPath?: string;
  previewPath?: string;
  error?: string;
  renderTime?: number;
  polyCount?: number;
}

export interface ScadTemplate {
  name: string;
  description: string;
  code: string;
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'vector';
  default: any;
  min?: number;
  max?: number;
  description?: string;
}

// ============================================================================
// SCAD SERVICE
// ============================================================================

export class ScadService extends EventEmitter {
  private config: Required<ScadConfig>;
  private cache: Map<string, GenerateResult> = new Map();
  private templates: Map<string, ScadTemplate> = new Map();
  private processing: Set<string> = new Set();

  constructor(config: ScadConfig = {}) {
    super();
    this.config = {
      openscadPath: config.openscadPath || 'openscad',
      outputDir: config.outputDir || '/tmp/memorable-scad',
      cacheEnabled: config.cacheEnabled ?? true,
      maxCacheSize: config.maxCacheSize || 100,
      defaultResolution: config.defaultResolution || 64,
    };
    this.registerDefaultTemplates();
    this.initOutputDir();
  }

  /**
   * Initialize output directory
   */
  private async initOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }

  /**
   * Register default shape templates
   */
  private registerDefaultTemplates(): void {
    this.templates.set('cube', {
      name: 'Cube',
      description: 'A simple cube',
      code: 'cube([size, size, size], center=centered);',
      parameters: [
        { name: 'size', type: 'number', default: 10, min: 0.1, max: 1000 },
        { name: 'centered', type: 'boolean', default: true },
      ],
    });

    this.templates.set('sphere', {
      name: 'Sphere',
      description: 'A sphere',
      code: 'sphere(r=radius, $fn=resolution);',
      parameters: [
        { name: 'radius', type: 'number', default: 10, min: 0.1, max: 500 },
        { name: 'resolution', type: 'number', default: 64, min: 8, max: 256 },
      ],
    });

    this.templates.set('cylinder', {
      name: 'Cylinder',
      description: 'A cylinder',
      code: 'cylinder(r=radius, h=height, center=centered, $fn=resolution);',
      parameters: [
        { name: 'radius', type: 'number', default: 5, min: 0.1, max: 500 },
        { name: 'height', type: 'number', default: 20, min: 0.1, max: 1000 },
        { name: 'centered', type: 'boolean', default: true },
        { name: 'resolution', type: 'number', default: 64, min: 8, max: 256 },
      ],
    });

    this.templates.set('cone', {
      name: 'Cone',
      description: 'A cone',
      code: 'cylinder(r1=bottomRadius, r2=topRadius, h=height, center=centered, $fn=resolution);',
      parameters: [
        { name: 'bottomRadius', type: 'number', default: 10, min: 0, max: 500 },
        { name: 'topRadius', type: 'number', default: 0, min: 0, max: 500 },
        { name: 'height', type: 'number', default: 20, min: 0.1, max: 1000 },
        { name: 'centered', type: 'boolean', default: true },
        { name: 'resolution', type: 'number', default: 64, min: 8, max: 256 },
      ],
    });

    this.templates.set('torus', {
      name: 'Torus',
      description: 'A donut shape',
      code: `rotate_extrude($fn=resolution)
  translate([majorRadius, 0, 0])
    circle(r=minorRadius, $fn=resolution);`,
      parameters: [
        { name: 'majorRadius', type: 'number', default: 15, min: 1, max: 500 },
        { name: 'minorRadius', type: 'number', default: 5, min: 0.1, max: 200 },
        { name: 'resolution', type: 'number', default: 64, min: 16, max: 256 },
      ],
    });

    this.templates.set('box', {
      name: 'Box',
      description: 'A rectangular box',
      code: 'cube([width, depth, height], center=centered);',
      parameters: [
        { name: 'width', type: 'number', default: 20, min: 0.1, max: 1000 },
        { name: 'depth', type: 'number', default: 15, min: 0.1, max: 1000 },
        { name: 'height', type: 'number', default: 10, min: 0.1, max: 1000 },
        { name: 'centered', type: 'boolean', default: true },
      ],
    });

    this.templates.set('hollowCube', {
      name: 'Hollow Cube',
      description: 'A hollow cube (box with walls)',
      code: `difference() {
  cube([size, size, size], center=true);
  cube([size-wallThickness*2, size-wallThickness*2, size-wallThickness*2], center=true);
}`,
      parameters: [
        { name: 'size', type: 'number', default: 20, min: 1, max: 500 },
        { name: 'wallThickness', type: 'number', default: 2, min: 0.1, max: 50 },
      ],
    });

    this.templates.set('gear', {
      name: 'Simple Gear',
      description: 'A basic gear shape',
      code: `module gear(teeth, module_val, thickness) {
  pitch_radius = teeth * module_val / 2;
  outer_radius = pitch_radius + module_val;

  linear_extrude(height=thickness) {
    difference() {
      circle(r=outer_radius, $fn=teeth*4);
      for (i = [0:teeth-1]) {
        rotate([0, 0, i * 360/teeth])
          translate([pitch_radius, 0])
            circle(r=module_val*0.8, $fn=16);
      }
    }
  }
}
gear(teeth, moduleVal, thickness);`,
      parameters: [
        { name: 'teeth', type: 'number', default: 20, min: 6, max: 100 },
        { name: 'moduleVal', type: 'number', default: 2, min: 0.5, max: 10 },
        { name: 'thickness', type: 'number', default: 5, min: 1, max: 50 },
      ],
    });
  }

  /**
   * Generate hash for cache key
   */
  private hashCode(code: string, options: GenerateOptions): string {
    const content = JSON.stringify({ code, options });
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Validate OpenSCAD code (basic syntax check)
   */
  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for balanced braces
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;

    for (const char of code) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
    }

    if (braceCount !== 0) errors.push('Unbalanced curly braces {}');
    if (parenCount !== 0) errors.push('Unbalanced parentheses ()');
    if (bracketCount !== 0) errors.push('Unbalanced square brackets []');

    // Check for common syntax patterns
    if (code.includes(';;')) errors.push('Double semicolons detected');

    // Check for dangerous operations (security)
    const dangerousPatterns = ['include', 'use', 'import', 'surface'];
    for (const pattern of dangerousPatterns) {
      if (code.toLowerCase().includes(pattern + ' ') ||
          code.toLowerCase().includes(pattern + '<') ||
          code.toLowerCase().includes(pattern + '(')) {
        errors.push(`External file operations not allowed: ${pattern}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate 3D model from OpenSCAD code
   */
  async generate(code: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const opts: Required<GenerateOptions> = {
      resolution: options.resolution ?? this.config.defaultResolution,
      format: options.format ?? 'stl',
      preview: options.preview ?? true,
      previewSize: options.previewSize ?? { width: 800, height: 600 },
      previewRotation: options.previewRotation ?? { x: 35, y: 45, z: 0 },
    };

    // Validate code
    const validation = this.validateCode(code);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Check cache
    const cacheKey = this.hashCode(code, opts);
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Prevent duplicate processing
    if (this.processing.has(cacheKey)) {
      return {
        success: false,
        error: 'Model is already being generated',
      };
    }

    this.processing.add(cacheKey);
    const startTime = Date.now();

    try {
      // Add resolution to code if not specified
      const fullCode = `$fn = ${opts.resolution};\n${code}`;

      // Write temp SCAD file
      const scadPath = path.join(this.config.outputDir, `${cacheKey}.scad`);
      await fs.writeFile(scadPath, fullCode);

      // Generate STL
      const modelPath = path.join(this.config.outputDir, `${cacheKey}.${opts.format}`);
      await this.runOpenScad(scadPath, modelPath, opts);

      // Generate preview image if requested
      let previewPath: string | undefined;
      if (opts.preview) {
        previewPath = path.join(this.config.outputDir, `${cacheKey}.png`);
        await this.generatePreview(scadPath, previewPath, opts);
      }

      // Get polygon count (approximate from file size)
      const stats = await fs.stat(modelPath);
      const polyCount = Math.floor(stats.size / 50); // Rough estimate

      const result: GenerateResult = {
        success: true,
        modelPath,
        previewPath,
        renderTime: Date.now() - startTime,
        polyCount,
      };

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, result);
        this.pruneCache();
      }

      this.emit('generate:complete', { cacheKey, result });
      return result;
    } catch (error) {
      const result: GenerateResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        renderTime: Date.now() - startTime,
      };
      this.emit('generate:error', { cacheKey, error });
      return result;
    } finally {
      this.processing.delete(cacheKey);
    }
  }

  /**
   * Run OpenSCAD CLI to generate output
   */
  private runOpenScad(inputPath: string, outputPath: string, options: Required<GenerateOptions>): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-o', outputPath,
        inputPath,
      ];

      const process = spawn(this.config.openscadPath, args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`OpenSCAD failed (code ${code}): ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to run OpenSCAD: ${error.message}`));
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error('OpenSCAD timed out after 60 seconds'));
      }, 60000);
    });
  }

  /**
   * Generate preview PNG image
   */
  private generatePreview(
    inputPath: string,
    outputPath: string,
    options: Required<GenerateOptions>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const { width, height } = options.previewSize;
      const { x, y, z } = options.previewRotation;

      const args = [
        '-o', outputPath,
        `--imgsize=${width},${height}`,
        `--camera=0,0,0,${x},${y},${z},100`,
        '--colorscheme=Tomorrow',
        '--render',
        inputPath,
      ];

      const process = spawn(this.config.openscadPath, args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Preview failure is not critical
          console.warn(`Preview generation failed: ${stderr}`);
          resolve();
        }
      });

      process.on('error', (error) => {
        console.warn(`Failed to generate preview: ${error.message}`);
        resolve();
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        resolve();
      }, 30000);
    });
  }

  /**
   * Prune cache if it exceeds max size
   */
  private pruneCache(): void {
    if (this.cache.size > this.config.maxCacheSize) {
      const entriesToRemove = this.cache.size - this.config.maxCacheSize;
      const iterator = this.cache.keys();
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value;
        if (key) this.cache.delete(key);
      }
    }
  }

  /**
   * Generate from template
   */
  async generateFromTemplate(
    templateName: string,
    params: Record<string, any>,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const template = this.templates.get(templateName);
    if (!template) {
      return {
        success: false,
        error: `Template not found: ${templateName}`,
      };
    }

    // Build parameter declarations
    let code = '';
    for (const param of template.parameters) {
      const value = params[param.name] ?? param.default;
      if (param.type === 'string') {
        code += `${param.name} = "${value}";\n`;
      } else if (param.type === 'boolean') {
        code += `${param.name} = ${value ? 'true' : 'false'};\n`;
      } else if (param.type === 'vector') {
        code += `${param.name} = [${value.join(', ')}];\n`;
      } else {
        code += `${param.name} = ${value};\n`;
      }
    }

    code += '\n' + template.code;

    return this.generate(code, options);
  }

  /**
   * Get available templates
   */
  getTemplates(): ScadTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by name
   */
  getTemplate(name: string): ScadTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * Register custom template
   */
  registerTemplate(template: ScadTemplate): void {
    this.templates.set(template.name.toLowerCase(), template);
  }

  /**
   * Read STL file contents
   */
  async getModelData(modelPath: string): Promise<Buffer> {
    return fs.readFile(modelPath);
  }

  /**
   * Read preview image
   */
  async getPreviewData(previewPath: string): Promise<Buffer> {
    return fs.readFile(previewPath);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
    };
  }
}

// Export singleton factory
export function createScadService(config?: ScadConfig): ScadService {
  return new ScadService(config);
}

export default ScadService;
