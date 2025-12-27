/**
 * @file Tests for Viewer GUI Service
 *
 * Tests 3D viewer functionality including:
 * - State management
 * - Rotation, zoom, pan controls
 * - Material and lighting settings
 * - Auto-rotate toggle
 * - HTML generation
 * - Screenshot parsing
 */

import {
  ViewerGuiService,
  createViewerGuiService,
  ViewerConfig,
  ViewerState,
  MaterialConfig,
} from '../../../src/services/viewer_gui/index';

describe('ViewerGuiService', () => {
  let service: ViewerGuiService;

  beforeEach(() => {
    service = new ViewerGuiService();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeInstanceOf(ViewerGuiService);
    });

    it('should create service with custom config', () => {
      const config: ViewerConfig = {
        port: 8080,
        host: '0.0.0.0',
        defaultBackground: '#ffffff',
        defaultMaterial: {
          color: '#ff0000',
          metalness: 0.5,
          roughness: 0.5,
          wireframe: true,
          opacity: 0.8,
          transparent: true,
        },
        maxTextureSize: 2048,
      };
      const customService = new ViewerGuiService(config);
      expect(customService).toBeInstanceOf(ViewerGuiService);
    });
  });

  describe('createViewerGuiService factory', () => {
    it('should create new service instance', () => {
      const svc = createViewerGuiService();
      expect(svc).toBeInstanceOf(ViewerGuiService);
    });

    it('should accept custom config', () => {
      const svc = createViewerGuiService({ port: 9000 });
      expect(svc.getViewerUrl('test')).toContain(':9000');
    });
  });

  describe('createState', () => {
    it('should create initial state for model', () => {
      const state = service.createState('model_123');

      expect(state.modelId).toBe('model_123');
      expect(state.rotation).toEqual({ x: 0, y: 0, z: 0 });
      expect(state.zoom).toBe(1.0);
      expect(state.pan).toEqual({ x: 0, y: 0 });
    });

    it('should set default camera config', () => {
      const state = service.createState('model_456');

      expect(state.camera.position).toEqual({ x: 0, y: 0, z: 100 });
      expect(state.camera.target).toEqual({ x: 0, y: 0, z: 0 });
      expect(state.camera.fov).toBe(45);
      expect(state.camera.near).toBe(0.1);
      expect(state.camera.far).toBe(10000);
    });

    it('should set default lighting config', () => {
      const state = service.createState('model_789');

      expect(state.lights.ambient.intensity).toBe(0.4);
      expect(state.lights.directional.intensity).toBe(0.8);
      expect(state.lights.hemisphere).toBeDefined();
    });

    it('should set default material config', () => {
      const state = service.createState('model_abc');

      expect(state.material.color).toBe('#4a90d9');
      expect(state.material.metalness).toBe(0.3);
      expect(state.material.roughness).toBe(0.7);
      expect(state.material.wireframe).toBe(false);
    });

    it('should use custom default material from config', () => {
      const customService = new ViewerGuiService({
        defaultMaterial: {
          color: '#00ff00',
          metalness: 0.8,
          roughness: 0.2,
          wireframe: true,
          opacity: 1,
          transparent: false,
        },
      });

      const state = customService.createState('model_custom');
      expect(state.material.color).toBe('#00ff00');
      expect(state.material.metalness).toBe(0.8);
      expect(state.material.wireframe).toBe(true);
    });

    it('should set view options', () => {
      const state = service.createState('model_view');

      expect(state.autoRotate).toBe(false);
      expect(state.autoRotateSpeed).toBe(2.0);
      expect(state.showGrid).toBe(true);
      expect(state.showAxes).toBe(false);
    });

    it('should store state in internal map', () => {
      service.createState('model_store');
      const retrieved = service.getState('model_store');
      expect(retrieved).toBeDefined();
    });
  });

  describe('getState', () => {
    it('should return state for existing model', () => {
      service.createState('model_exists');
      const state = service.getState('model_exists');
      expect(state).toBeDefined();
      expect(state?.modelId).toBe('model_exists');
    });

    it('should return undefined for non-existent model', () => {
      const state = service.getState('model_nonexistent');
      expect(state).toBeUndefined();
    });
  });

  describe('updateState', () => {
    it('should update partial state', () => {
      service.createState('model_update');

      const updated = service.updateState('model_update', {
        zoom: 2.5,
        autoRotate: true,
      });

      expect(updated?.zoom).toBe(2.5);
      expect(updated?.autoRotate).toBe(true);
      expect(updated?.rotation).toEqual({ x: 0, y: 0, z: 0 }); // Unchanged
    });

    it('should emit state:updated event', () => {
      service.createState('model_event');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.updateState('model_event', { zoom: 3 });

      expect(emitted.length).toBe(1);
      expect(emitted[0].modelId).toBe('model_event');
      expect(emitted[0].state.zoom).toBe(3);
    });

    it('should return undefined for non-existent model', () => {
      const result = service.updateState('nonexistent', { zoom: 2 });
      expect(result).toBeUndefined();
    });
  });

  describe('setRotation', () => {
    it('should set all rotation axes', () => {
      service.createState('model_rot');
      service.setRotation('model_rot', { x: 45, y: 90, z: 180 });

      const state = service.getState('model_rot');
      expect(state?.rotation).toEqual({ x: 45, y: 90, z: 180 });
    });

    it('should set partial rotation', () => {
      service.createState('model_rot2');
      service.setRotation('model_rot2', { y: 45 });

      const state = service.getState('model_rot2');
      expect(state?.rotation.y).toBe(45);
      expect(state?.rotation.x).toBe(0);
      expect(state?.rotation.z).toBe(0);
    });

    it('should emit event on rotation change', () => {
      service.createState('model_rot3');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setRotation('model_rot3', { x: 30 });

      expect(emitted.length).toBe(1);
    });

    it('should do nothing for non-existent model', () => {
      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setRotation('nonexistent', { x: 45 });

      expect(emitted.length).toBe(0);
    });
  });

  describe('setZoom', () => {
    it('should set zoom level', () => {
      service.createState('model_zoom');
      service.setZoom('model_zoom', 2.5);

      const state = service.getState('model_zoom');
      expect(state?.zoom).toBe(2.5);
    });

    it('should clamp zoom to minimum 0.1', () => {
      service.createState('model_zoom_min');
      service.setZoom('model_zoom_min', 0.01);

      const state = service.getState('model_zoom_min');
      expect(state?.zoom).toBe(0.1);
    });

    it('should clamp zoom to maximum 10', () => {
      service.createState('model_zoom_max');
      service.setZoom('model_zoom_max', 15);

      const state = service.getState('model_zoom_max');
      expect(state?.zoom).toBe(10);
    });

    it('should emit event on zoom change', () => {
      service.createState('model_zoom_event');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setZoom('model_zoom_event', 1.5);

      expect(emitted.length).toBe(1);
    });
  });

  describe('setPan', () => {
    it('should set pan offset', () => {
      service.createState('model_pan');
      service.setPan('model_pan', { x: 10, y: -20 });

      const state = service.getState('model_pan');
      expect(state?.pan).toEqual({ x: 10, y: -20 });
    });

    it('should set partial pan', () => {
      service.createState('model_pan2');
      service.setPan('model_pan2', { x: 50 });

      const state = service.getState('model_pan2');
      expect(state?.pan.x).toBe(50);
      expect(state?.pan.y).toBe(0);
    });

    it('should emit event on pan change', () => {
      service.createState('model_pan3');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setPan('model_pan3', { y: 15 });

      expect(emitted.length).toBe(1);
    });
  });

  describe('setMaterial', () => {
    it('should update material properties', () => {
      service.createState('model_mat');
      service.setMaterial('model_mat', {
        color: '#ff0000',
        metalness: 0.9,
      });

      const state = service.getState('model_mat');
      expect(state?.material.color).toBe('#ff0000');
      expect(state?.material.metalness).toBe(0.9);
      expect(state?.material.roughness).toBe(0.7); // Unchanged
    });

    it('should toggle wireframe', () => {
      service.createState('model_wire');
      service.setMaterial('model_wire', { wireframe: true });

      const state = service.getState('model_wire');
      expect(state?.material.wireframe).toBe(true);
    });

    it('should set transparency', () => {
      service.createState('model_trans');
      service.setMaterial('model_trans', {
        transparent: true,
        opacity: 0.5,
      });

      const state = service.getState('model_trans');
      expect(state?.material.transparent).toBe(true);
      expect(state?.material.opacity).toBe(0.5);
    });

    it('should emit event on material change', () => {
      service.createState('model_mat_event');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setMaterial('model_mat_event', { color: '#00ff00' });

      expect(emitted.length).toBe(1);
    });
  });

  describe('setLighting', () => {
    it('should update ambient light', () => {
      service.createState('model_light');
      service.setLighting('model_light', {
        ambient: { color: '#ffff00', intensity: 0.6 },
      });

      const state = service.getState('model_light');
      expect(state?.lights.ambient.color).toBe('#ffff00');
      expect(state?.lights.ambient.intensity).toBe(0.6);
    });

    it('should update directional light', () => {
      service.createState('model_light2');
      service.setLighting('model_light2', {
        directional: {
          color: '#ffffff',
          intensity: 1.2,
          position: { x: 20, y: 30, z: 40 },
        },
      });

      const state = service.getState('model_light2');
      expect(state?.lights.directional.intensity).toBe(1.2);
      expect(state?.lights.directional.position).toEqual({ x: 20, y: 30, z: 40 });
    });

    it('should update hemisphere light', () => {
      service.createState('model_light3');
      service.setLighting('model_light3', {
        hemisphere: {
          skyColor: '#00aaff',
          groundColor: '#553300',
          intensity: 0.5,
        },
      });

      const state = service.getState('model_light3');
      expect(state?.lights.hemisphere?.skyColor).toBe('#00aaff');
    });

    it('should emit event on lighting change', () => {
      service.createState('model_light_event');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.setLighting('model_light_event', {
        ambient: { color: '#ffffff', intensity: 0.5 },
      });

      expect(emitted.length).toBe(1);
    });
  });

  describe('toggleAutoRotate', () => {
    it('should toggle auto-rotate on', () => {
      service.createState('model_auto');

      const result = service.toggleAutoRotate('model_auto');

      expect(result).toBe(true);
      expect(service.getState('model_auto')?.autoRotate).toBe(true);
    });

    it('should toggle auto-rotate off', () => {
      service.createState('model_auto2');
      service.toggleAutoRotate('model_auto2'); // Turn on

      const result = service.toggleAutoRotate('model_auto2'); // Turn off

      expect(result).toBe(false);
      expect(service.getState('model_auto2')?.autoRotate).toBe(false);
    });

    it('should return false for non-existent model', () => {
      const result = service.toggleAutoRotate('nonexistent');
      expect(result).toBe(false);
    });

    it('should emit event on toggle', () => {
      service.createState('model_auto3');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.toggleAutoRotate('model_auto3');

      expect(emitted.length).toBe(1);
    });
  });

  describe('resetView', () => {
    it('should reset rotation, zoom, and pan', () => {
      service.createState('model_reset');
      service.setRotation('model_reset', { x: 45, y: 90, z: 180 });
      service.setZoom('model_reset', 3);
      service.setPan('model_reset', { x: 50, y: -30 });

      service.resetView('model_reset');

      const state = service.getState('model_reset');
      expect(state?.rotation).toEqual({ x: 0, y: 0, z: 0 });
      expect(state?.zoom).toBe(1.0);
      expect(state?.pan).toEqual({ x: 0, y: 0 });
    });

    it('should reset camera position', () => {
      service.createState('model_reset2');
      service.updateState('model_reset2', {
        camera: {
          position: { x: 50, y: 50, z: 50 },
          target: { x: 10, y: 10, z: 10 },
          fov: 60,
          near: 1,
          far: 5000,
        },
      });

      service.resetView('model_reset2');

      const state = service.getState('model_reset2');
      expect(state?.camera.position).toEqual({ x: 0, y: 0, z: 100 });
      expect(state?.camera.target).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should emit event on reset', () => {
      service.createState('model_reset3');

      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.resetView('model_reset3');

      expect(emitted.length).toBe(1);
    });

    it('should do nothing for non-existent model', () => {
      const emitted: any[] = [];
      service.on('state:updated', (data) => emitted.push(data));

      service.resetView('nonexistent');

      expect(emitted.length).toBe(0);
    });
  });

  describe('generateViewerHtml', () => {
    it('should generate HTML for model', () => {
      const html = service.generateViewerHtml('model_html', 'http://example.com/model.stl');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('model_html');
      expect(html).toContain('http://example.com/model.stl');
    });

    it('should include Three.js library', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('three.js');
      expect(html).toContain('STLLoader');
      expect(html).toContain('OrbitControls');
    });

    it('should include rotation controls', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="rotX"');
      expect(html).toContain('id="rotY"');
      expect(html).toContain('id="rotZ"');
    });

    it('should include zoom control', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="zoom"');
    });

    it('should include material controls', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="matColor"');
      expect(html).toContain('id="metalness"');
      expect(html).toContain('id="roughness"');
      expect(html).toContain('id="wireframe"');
    });

    it('should include lighting controls', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="ambientInt"');
      expect(html).toContain('id="dirInt"');
    });

    it('should include view controls', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="showGrid"');
      expect(html).toContain('id="showAxes"');
      expect(html).toContain('id="resetView"');
    });

    it('should include screenshot functionality', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="screenshot"');
      expect(html).toContain('screenshot-preview');
      expect(html).toContain('toDataURL');
    });

    it('should include download functionality', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="downloadSTL"');
      expect(html).toContain('Download STL');
    });

    it('should include auto-rotate button', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('id="autoRotate"');
      expect(html).toContain('Auto-Rotate');
    });

    it('should create state if not exists', () => {
      service.generateViewerHtml('new_model', '/new.stl');

      const state = service.getState('new_model');
      expect(state).toBeDefined();
    });

    it('should use existing state', () => {
      service.createState('existing_model');
      service.setZoom('existing_model', 2.5);

      const html = service.generateViewerHtml('existing_model', '/existing.stl');

      expect(html).toContain('value="2.5"');
    });

    it('should include background color from state', () => {
      const customService = new ViewerGuiService({
        defaultBackground: '#2a2a3a',
      });

      const html = customService.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('#2a2a3a');
    });

    it('should include control instructions', () => {
      const html = service.generateViewerHtml('model', '/model.stl');

      expect(html).toContain('Drag to rotate');
      expect(html).toContain('Scroll to zoom');
      expect(html).toContain('Shift+drag to pan');
    });
  });

  describe('getViewerUrl', () => {
    it('should return viewer URL with default config', () => {
      const url = service.getViewerUrl('model_123');
      expect(url).toBe('http://localhost:3000/viewer/model_123');
    });

    it('should use custom host and port', () => {
      const customService = new ViewerGuiService({
        host: 'myhost.com',
        port: 8080,
      });

      const url = customService.getViewerUrl('model_456');
      expect(url).toBe('http://myhost.com:8080/viewer/model_456');
    });
  });

  describe('parseScreenshotDataUrl', () => {
    it('should parse valid PNG data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const buffer = service.parseScreenshotDataUrl(dataUrl);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should parse valid JPEG data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

      const buffer = service.parseScreenshotDataUrl(dataUrl);

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should throw for invalid data URL', () => {
      expect(() => {
        service.parseScreenshotDataUrl('not-a-data-url');
      }).toThrow('Invalid data URL format');
    });

    it('should throw for malformed data URL', () => {
      expect(() => {
        service.parseScreenshotDataUrl('data:text/plain,Hello');
      }).toThrow('Invalid data URL format');
    });
  });

  describe('deleteState', () => {
    it('should delete state for model', () => {
      service.createState('model_delete');
      expect(service.getState('model_delete')).toBeDefined();

      service.deleteState('model_delete');

      expect(service.getState('model_delete')).toBeUndefined();
    });

    it('should handle deleting non-existent state', () => {
      expect(() => {
        service.deleteState('nonexistent');
      }).not.toThrow();
    });
  });

  describe('getAllStates', () => {
    it('should return all states', () => {
      service.createState('model_1');
      service.createState('model_2');
      service.createState('model_3');

      const states = service.getAllStates();

      expect(states.size).toBe(3);
      expect(states.has('model_1')).toBe(true);
      expect(states.has('model_2')).toBe(true);
      expect(states.has('model_3')).toBe(true);
    });

    it('should return empty map when no states', () => {
      const states = service.getAllStates();
      expect(states.size).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full workflow: create, modify, generate, reset', () => {
      // Create state
      const state = service.createState('workflow_test');
      expect(state.modelId).toBe('workflow_test');

      // Modify state
      service.setRotation('workflow_test', { x: 45, y: 90, z: 0 });
      service.setZoom('workflow_test', 2.0);
      service.setMaterial('workflow_test', { color: '#ff0000', wireframe: true });
      service.setLighting('workflow_test', {
        directional: { color: '#ffffff', intensity: 1.5, position: { x: 10, y: 10, z: 10 } },
      });
      service.toggleAutoRotate('workflow_test');

      // Generate HTML
      const html = service.generateViewerHtml('workflow_test', '/workflow.stl');
      expect(html).toContain('value="45"'); // rotation X
      expect(html).toContain('#ff0000'); // material color
      expect(html).toContain('Stop Auto-Rotate'); // auto-rotate on

      // Reset view
      service.resetView('workflow_test');
      const resetState = service.getState('workflow_test');
      expect(resetState?.rotation).toEqual({ x: 0, y: 0, z: 0 });
      expect(resetState?.zoom).toBe(1.0);
    });

    it('should handle multiple models independently', () => {
      service.createState('model_a');
      service.createState('model_b');

      service.setZoom('model_a', 3.0);
      service.setZoom('model_b', 0.5);

      expect(service.getState('model_a')?.zoom).toBe(3.0);
      expect(service.getState('model_b')?.zoom).toBe(0.5);

      service.deleteState('model_a');

      expect(service.getState('model_a')).toBeUndefined();
      expect(service.getState('model_b')?.zoom).toBe(0.5);
    });
  });
});
