/**
 * @file 3D Viewer GUI Service for MemoRable
 *
 * Provides a web-based 3D viewer with full controls:
 * - Rotation (drag to rotate)
 * - Zoom (scroll wheel)
 * - Pan (shift+drag)
 * - Lighting controls
 * - Auto-rotate
 * - Screenshot capture
 * - Material/color options
 *
 * Uses Three.js for rendering via HTML served to browser.
 */

import { EventEmitter } from 'events';
import path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface ViewerConfig {
  port?: number;
  host?: string;
  defaultBackground?: string;
  defaultMaterial?: MaterialConfig;
  maxTextureSize?: number;
}

export interface MaterialConfig {
  color: string;
  metalness: number;
  roughness: number;
  wireframe: boolean;
  opacity: number;
  transparent: boolean;
}

export interface CameraConfig {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  near: number;
  far: number;
}

export interface LightConfig {
  ambient: { color: string; intensity: number };
  directional: { color: string; intensity: number; position: { x: number; y: number; z: number } };
  hemisphere?: { skyColor: string; groundColor: string; intensity: number };
}

export interface ViewerState {
  modelId: string;
  rotation: { x: number; y: number; z: number };
  zoom: number;
  pan: { x: number; y: number };
  camera: CameraConfig;
  lights: LightConfig;
  material: MaterialConfig;
  background: string;
  autoRotate: boolean;
  autoRotateSpeed: number;
  showGrid: boolean;
  showAxes: boolean;
}

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  transparentBackground?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  dataUrl?: string;
  buffer?: Buffer;
  error?: string;
}

// ============================================================================
// VIEWER GUI SERVICE
// ============================================================================

export class ViewerGuiService extends EventEmitter {
  private config: Required<ViewerConfig>;
  private states: Map<string, ViewerState> = new Map();

  constructor(config: ViewerConfig = {}) {
    super();
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? 'localhost',
      defaultBackground: config.defaultBackground ?? '#1a1a2e',
      defaultMaterial: config.defaultMaterial ?? {
        color: '#4a90d9',
        metalness: 0.3,
        roughness: 0.7,
        wireframe: false,
        opacity: 1.0,
        transparent: false,
      },
      maxTextureSize: config.maxTextureSize ?? 4096,
    };
  }

  /**
   * Create initial viewer state for a model
   */
  createState(modelId: string): ViewerState {
    const state: ViewerState = {
      modelId,
      rotation: { x: 0, y: 0, z: 0 },
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      camera: {
        position: { x: 0, y: 0, z: 100 },
        target: { x: 0, y: 0, z: 0 },
        fov: 45,
        near: 0.1,
        far: 10000,
      },
      lights: {
        ambient: { color: '#ffffff', intensity: 0.4 },
        directional: {
          color: '#ffffff',
          intensity: 0.8,
          position: { x: 10, y: 20, z: 15 },
        },
        hemisphere: {
          skyColor: '#87ceeb',
          groundColor: '#362e2e',
          intensity: 0.3,
        },
      },
      material: { ...this.config.defaultMaterial },
      background: this.config.defaultBackground,
      autoRotate: false,
      autoRotateSpeed: 2.0,
      showGrid: true,
      showAxes: false,
    };

    this.states.set(modelId, state);
    return state;
  }

  /**
   * Get viewer state for model
   */
  getState(modelId: string): ViewerState | undefined {
    return this.states.get(modelId);
  }

  /**
   * Update viewer state
   */
  updateState(modelId: string, updates: Partial<ViewerState>): ViewerState | undefined {
    const state = this.states.get(modelId);
    if (!state) return undefined;

    Object.assign(state, updates);
    this.emit('state:updated', { modelId, state });
    return state;
  }

  /**
   * Set rotation
   */
  setRotation(modelId: string, rotation: { x?: number; y?: number; z?: number }): void {
    const state = this.states.get(modelId);
    if (state) {
      if (rotation.x !== undefined) state.rotation.x = rotation.x;
      if (rotation.y !== undefined) state.rotation.y = rotation.y;
      if (rotation.z !== undefined) state.rotation.z = rotation.z;
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Set zoom level
   */
  setZoom(modelId: string, zoom: number): void {
    const state = this.states.get(modelId);
    if (state) {
      state.zoom = Math.max(0.1, Math.min(10, zoom));
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Set pan offset
   */
  setPan(modelId: string, pan: { x?: number; y?: number }): void {
    const state = this.states.get(modelId);
    if (state) {
      if (pan.x !== undefined) state.pan.x = pan.x;
      if (pan.y !== undefined) state.pan.y = pan.y;
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Set material properties
   */
  setMaterial(modelId: string, material: Partial<MaterialConfig>): void {
    const state = this.states.get(modelId);
    if (state) {
      Object.assign(state.material, material);
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Set lighting
   */
  setLighting(modelId: string, lights: Partial<LightConfig>): void {
    const state = this.states.get(modelId);
    if (state) {
      if (lights.ambient) Object.assign(state.lights.ambient, lights.ambient);
      if (lights.directional) Object.assign(state.lights.directional, lights.directional);
      if (lights.hemisphere) state.lights.hemisphere = lights.hemisphere;
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Toggle auto-rotate
   */
  toggleAutoRotate(modelId: string): boolean {
    const state = this.states.get(modelId);
    if (state) {
      state.autoRotate = !state.autoRotate;
      this.emit('state:updated', { modelId, state });
      return state.autoRotate;
    }
    return false;
  }

  /**
   * Reset view to default
   */
  resetView(modelId: string): void {
    const state = this.states.get(modelId);
    if (state) {
      state.rotation = { x: 0, y: 0, z: 0 };
      state.zoom = 1.0;
      state.pan = { x: 0, y: 0 };
      state.camera.position = { x: 0, y: 0, z: 100 };
      state.camera.target = { x: 0, y: 0, z: 0 };
      this.emit('state:updated', { modelId, state });
    }
  }

  /**
   * Generate HTML for the 3D viewer
   */
  generateViewerHtml(modelId: string, stlUrl: string): string {
    const state = this.getState(modelId) || this.createState(modelId);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MemoRable 3D Viewer - ${modelId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${state.background};
      overflow: hidden;
    }
    #viewer { width: 100vw; height: 100vh; }

    #controls {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 12px;
      padding: 20px;
      color: white;
      min-width: 280px;
      max-height: 90vh;
      overflow-y: auto;
    }

    #controls h3 {
      margin-bottom: 15px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
    }

    .control-group {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #333;
    }

    .control-group:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }

    .control-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .control-row label {
      font-size: 13px;
      color: #aaa;
    }

    .control-row input[type="range"] {
      width: 120px;
    }

    .control-row input[type="color"] {
      width: 40px;
      height: 30px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .control-row input[type="number"] {
      width: 60px;
      padding: 5px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #222;
      color: white;
    }

    button {
      width: 100%;
      padding: 10px 15px;
      margin-top: 5px;
      border: none;
      border-radius: 6px;
      background: #4a90d9;
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover {
      background: #357abd;
    }

    button.secondary {
      background: #444;
    }

    button.secondary:hover {
      background: #555;
    }

    #info {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px 15px;
      border-radius: 8px;
      color: #888;
      font-size: 12px;
    }

    #screenshot-preview {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      z-index: 1000;
    }

    #screenshot-preview img {
      max-width: 600px;
      max-height: 400px;
      border-radius: 8px;
    }

    #screenshot-preview .actions {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }

    #screenshot-preview button {
      flex: 1;
    }
  </style>
</head>
<body>
  <div id="viewer"></div>

  <div id="controls">
    <div class="control-group">
      <h3>Rotation</h3>
      <div class="control-row">
        <label>X</label>
        <input type="range" id="rotX" min="-180" max="180" value="${state.rotation.x}">
        <span id="rotX-val">${state.rotation.x}°</span>
      </div>
      <div class="control-row">
        <label>Y</label>
        <input type="range" id="rotY" min="-180" max="180" value="${state.rotation.y}">
        <span id="rotY-val">${state.rotation.y}°</span>
      </div>
      <div class="control-row">
        <label>Z</label>
        <input type="range" id="rotZ" min="-180" max="180" value="${state.rotation.z}">
        <span id="rotZ-val">${state.rotation.z}°</span>
      </div>
      <button id="autoRotate" class="secondary">
        ${state.autoRotate ? 'Stop' : 'Start'} Auto-Rotate
      </button>
    </div>

    <div class="control-group">
      <h3>Zoom</h3>
      <div class="control-row">
        <label>Level</label>
        <input type="range" id="zoom" min="0.1" max="5" step="0.1" value="${state.zoom}">
        <span id="zoom-val">${state.zoom}x</span>
      </div>
    </div>

    <div class="control-group">
      <h3>Material</h3>
      <div class="control-row">
        <label>Color</label>
        <input type="color" id="matColor" value="${state.material.color}">
      </div>
      <div class="control-row">
        <label>Metalness</label>
        <input type="range" id="metalness" min="0" max="1" step="0.1" value="${state.material.metalness}">
      </div>
      <div class="control-row">
        <label>Roughness</label>
        <input type="range" id="roughness" min="0" max="1" step="0.1" value="${state.material.roughness}">
      </div>
      <div class="control-row">
        <label>Wireframe</label>
        <input type="checkbox" id="wireframe" ${state.material.wireframe ? 'checked' : ''}>
      </div>
    </div>

    <div class="control-group">
      <h3>Lighting</h3>
      <div class="control-row">
        <label>Ambient</label>
        <input type="range" id="ambientInt" min="0" max="1" step="0.1" value="${state.lights.ambient.intensity}">
      </div>
      <div class="control-row">
        <label>Directional</label>
        <input type="range" id="dirInt" min="0" max="2" step="0.1" value="${state.lights.directional.intensity}">
      </div>
    </div>

    <div class="control-group">
      <h3>View</h3>
      <div class="control-row">
        <label>Grid</label>
        <input type="checkbox" id="showGrid" ${state.showGrid ? 'checked' : ''}>
      </div>
      <div class="control-row">
        <label>Axes</label>
        <input type="checkbox" id="showAxes" ${state.showAxes ? 'checked' : ''}>
      </div>
      <button id="resetView" class="secondary">Reset View</button>
    </div>

    <div class="control-group">
      <h3>Export</h3>
      <button id="screenshot">Take Screenshot</button>
      <button id="downloadSTL" class="secondary">Download STL</button>
    </div>
  </div>

  <div id="info">
    Drag to rotate • Scroll to zoom • Shift+drag to pan
  </div>

  <div id="screenshot-preview">
    <img id="preview-img" src="" alt="Screenshot">
    <div class="actions">
      <button id="download-screenshot">Download</button>
      <button id="close-preview" class="secondary">Close</button>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js"></script>

  <script>
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('${state.background}');

    const camera = new THREE.PerspectiveCamera(
      ${state.camera.fov},
      window.innerWidth / window.innerHeight,
      ${state.camera.near},
      ${state.camera.far}
    );
    camera.position.set(
      ${state.camera.position.x},
      ${state.camera.position.y},
      ${state.camera.position.z}
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.getElementById('viewer').appendChild(renderer.domElement);

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = ${state.autoRotate};
    controls.autoRotateSpeed = ${state.autoRotateSpeed};

    // Lights
    const ambientLight = new THREE.AmbientLight(
      '${state.lights.ambient.color}',
      ${state.lights.ambient.intensity}
    );
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      '${state.lights.directional.color}',
      ${state.lights.directional.intensity}
    );
    directionalLight.position.set(
      ${state.lights.directional.position.x},
      ${state.lights.directional.position.y},
      ${state.lights.directional.position.z}
    );
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(
      '${state.lights.hemisphere?.skyColor || '#87ceeb'}',
      '${state.lights.hemisphere?.groundColor || '#362e2e'}',
      ${state.lights.hemisphere?.intensity || 0.3}
    );
    scene.add(hemisphereLight);

    // Grid
    const gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x333333);
    gridHelper.visible = ${state.showGrid};
    scene.add(gridHelper);

    // Axes
    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.visible = ${state.showAxes};
    scene.add(axesHelper);

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: '${state.material.color}',
      metalness: ${state.material.metalness},
      roughness: ${state.material.roughness},
      wireframe: ${state.material.wireframe},
      opacity: ${state.material.opacity},
      transparent: ${state.material.transparent},
    });

    // Load STL
    let mesh = null;
    const loader = new THREE.STLLoader();
    loader.load('${stlUrl}', function(geometry) {
      geometry.center();
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Auto-scale to fit view
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 50 / maxDim;
      mesh.scale.set(scale, scale, scale);

      scene.add(mesh);

      // Position camera to see object
      camera.position.z = maxDim * 2;
      controls.update();
    });

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Control bindings
    document.getElementById('rotX').addEventListener('input', (e) => {
      if (mesh) mesh.rotation.x = THREE.MathUtils.degToRad(e.target.value);
      document.getElementById('rotX-val').textContent = e.target.value + '°';
    });

    document.getElementById('rotY').addEventListener('input', (e) => {
      if (mesh) mesh.rotation.y = THREE.MathUtils.degToRad(e.target.value);
      document.getElementById('rotY-val').textContent = e.target.value + '°';
    });

    document.getElementById('rotZ').addEventListener('input', (e) => {
      if (mesh) mesh.rotation.z = THREE.MathUtils.degToRad(e.target.value);
      document.getElementById('rotZ-val').textContent = e.target.value + '°';
    });

    document.getElementById('zoom').addEventListener('input', (e) => {
      const zoom = parseFloat(e.target.value);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      document.getElementById('zoom-val').textContent = zoom + 'x';
    });

    document.getElementById('autoRotate').addEventListener('click', () => {
      controls.autoRotate = !controls.autoRotate;
      document.getElementById('autoRotate').textContent =
        (controls.autoRotate ? 'Stop' : 'Start') + ' Auto-Rotate';
    });

    document.getElementById('matColor').addEventListener('input', (e) => {
      material.color.set(e.target.value);
    });

    document.getElementById('metalness').addEventListener('input', (e) => {
      material.metalness = parseFloat(e.target.value);
    });

    document.getElementById('roughness').addEventListener('input', (e) => {
      material.roughness = parseFloat(e.target.value);
    });

    document.getElementById('wireframe').addEventListener('change', (e) => {
      material.wireframe = e.target.checked;
    });

    document.getElementById('ambientInt').addEventListener('input', (e) => {
      ambientLight.intensity = parseFloat(e.target.value);
    });

    document.getElementById('dirInt').addEventListener('input', (e) => {
      directionalLight.intensity = parseFloat(e.target.value);
    });

    document.getElementById('showGrid').addEventListener('change', (e) => {
      gridHelper.visible = e.target.checked;
    });

    document.getElementById('showAxes').addEventListener('change', (e) => {
      axesHelper.visible = e.target.checked;
    });

    document.getElementById('resetView').addEventListener('click', () => {
      if (mesh) {
        mesh.rotation.set(0, 0, 0);
        document.getElementById('rotX').value = 0;
        document.getElementById('rotY').value = 0;
        document.getElementById('rotZ').value = 0;
        document.getElementById('rotX-val').textContent = '0°';
        document.getElementById('rotY-val').textContent = '0°';
        document.getElementById('rotZ-val').textContent = '0°';
      }
      camera.position.set(0, 0, 100);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      document.getElementById('zoom').value = 1;
      document.getElementById('zoom-val').textContent = '1x';
      controls.reset();
    });

    // Screenshot
    document.getElementById('screenshot').addEventListener('click', () => {
      const dataUrl = renderer.domElement.toDataURL('image/png');
      document.getElementById('preview-img').src = dataUrl;
      document.getElementById('screenshot-preview').style.display = 'block';

      // Send to server
      fetch('/api/viewer/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: '${modelId}', dataUrl })
      });
    });

    document.getElementById('download-screenshot').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = '${modelId}-screenshot.png';
      link.href = document.getElementById('preview-img').src;
      link.click();
    });

    document.getElementById('close-preview').addEventListener('click', () => {
      document.getElementById('screenshot-preview').style.display = 'none';
    });

    document.getElementById('downloadSTL').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = '${modelId}.stl';
      link.href = '${stlUrl}';
      link.click();
    });
  </script>
</body>
</html>`;
  }

  /**
   * Get URL for viewer page
   */
  getViewerUrl(modelId: string): string {
    return `http://${this.config.host}:${this.config.port}/viewer/${modelId}`;
  }

  /**
   * Parse screenshot data URL to buffer
   */
  parseScreenshotDataUrl(dataUrl: string): Buffer {
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }
    return Buffer.from(matches[2], 'base64');
  }

  /**
   * Delete state for model
   */
  deleteState(modelId: string): void {
    this.states.delete(modelId);
  }

  /**
   * Get all active states
   */
  getAllStates(): Map<string, ViewerState> {
    return this.states;
  }
}

// Export singleton factory
export function createViewerGuiService(config?: ViewerConfig): ViewerGuiService {
  return new ViewerGuiService(config);
}

export default ViewerGuiService;
