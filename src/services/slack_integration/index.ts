/**
 * @file Slack Integration Service for MemoRable
 *
 * Provides Slack bot functionality for:
 * - 3D object generation via OpenSCAD commands
 * - Memory storage/retrieval through Slack
 * - Project-based 3D model management
 *
 * Commands:
 * - /scad <code> - Generate 3D object from OpenSCAD code
 * - /scad cube [size] - Quick cube generation
 * - /scad sphere [radius] - Quick sphere generation
 * - /scad cylinder [r, h] - Quick cylinder generation
 * - /scad view - Open 3D viewer for current model
 * - /scad screenshot - Capture current view
 * - /scad list - List project models
 * - /remember <text> - Store a memory
 * - /recall <query> - Search memories
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string;
  socketMode?: boolean;
}

export interface SlackMessage {
  type: 'message' | 'command' | 'interaction';
  channel: string;
  user: string;
  text: string;
  ts: string;
  threadTs?: string;
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url: string;
  size: number;
}

export interface SlackCommand {
  command: string;
  text: string;
  userId: string;
  channelId: string;
  responseUrl: string;
  triggerId: string;
}

export interface ScadProject {
  id: string;
  channelId: string;
  userId: string;
  name: string;
  models: ScadModel[];
  createdAt: string;
  updatedAt: string;
}

export interface ScadModel {
  id: string;
  name: string;
  code: string;
  stlPath?: string;
  previewPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ViewerState {
  modelId: string;
  rotation: { x: number; y: number; z: number };
  zoom: number;
  pan: { x: number; y: number };
  lighting: LightingConfig;
  autoRotate: boolean;
}

export interface LightingConfig {
  ambient: number;
  directional: number;
  position: { x: number; y: number; z: number };
}

// ============================================================================
// SLACK SERVICE
// ============================================================================

export class SlackIntegrationService extends EventEmitter {
  private config: SlackConfig;
  private projects: Map<string, ScadProject> = new Map();
  private viewerStates: Map<string, ViewerState> = new Map();
  private commandHandlers: Map<string, (cmd: SlackCommand) => Promise<any>> = new Map();

  constructor(config: SlackConfig) {
    super();
    this.config = config;
    this.registerDefaultCommands();
  }

  /**
   * Verify Slack request signature
   */
  verifySignature(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', this.config.signingSecret);
    const computedSignature = `v0=${hmac.update(baseString).digest('hex')}`;
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }

  /**
   * Register default command handlers
   */
  private registerDefaultCommands(): void {
    // /scad command - 3D object generation
    this.commandHandlers.set('/scad', async (cmd) => {
      return this.handleScadCommand(cmd);
    });

    // /remember command - store memory
    this.commandHandlers.set('/remember', async (cmd) => {
      return this.handleRememberCommand(cmd);
    });

    // /recall command - search memories
    this.commandHandlers.set('/recall', async (cmd) => {
      return this.handleRecallCommand(cmd);
    });

    // /view3d command - open viewer
    this.commandHandlers.set('/view3d', async (cmd) => {
      return this.handleViewerCommand(cmd);
    });
  }

  /**
   * Handle incoming Slack command
   */
  async handleCommand(cmd: SlackCommand): Promise<any> {
    const handler = this.commandHandlers.get(cmd.command);
    if (!handler) {
      return {
        response_type: 'ephemeral',
        text: `Unknown command: ${cmd.command}`,
      };
    }

    try {
      return await handler(cmd);
    } catch (error) {
      console.error(`Error handling command ${cmd.command}:`, error);
      return {
        response_type: 'ephemeral',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle /scad command
   */
  private async handleScadCommand(cmd: SlackCommand): Promise<any> {
    const args = cmd.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'cube':
        return this.generateQuickShape('cube', args.slice(1), cmd);

      case 'sphere':
        return this.generateQuickShape('sphere', args.slice(1), cmd);

      case 'cylinder':
        return this.generateQuickShape('cylinder', args.slice(1), cmd);

      case 'view':
        return this.openViewer(cmd);

      case 'screenshot':
        return this.captureScreenshot(cmd);

      case 'list':
        return this.listModels(cmd);

      case 'rotate':
        return this.setRotation(args.slice(1), cmd);

      case 'zoom':
        return this.setZoom(args[1], cmd);

      case 'light':
        return this.setLighting(args.slice(1), cmd);

      case 'help':
        return this.showHelp();

      default:
        // Treat as raw OpenSCAD code
        if (cmd.text.trim()) {
          return this.generateFromCode(cmd.text, cmd);
        }
        return this.showHelp();
    }
  }

  /**
   * Generate quick shape
   */
  private async generateQuickShape(
    shape: 'cube' | 'sphere' | 'cylinder',
    params: string[],
    cmd: SlackCommand
  ): Promise<any> {
    let code: string;

    switch (shape) {
      case 'cube': {
        const size = parseFloat(params[0]) || 10;
        code = `cube([${size}, ${size}, ${size}], center=true);`;
        break;
      }
      case 'sphere': {
        const radius = parseFloat(params[0]) || 10;
        code = `sphere(r=${radius}, $fn=64);`;
        break;
      }
      case 'cylinder': {
        const r = parseFloat(params[0]) || 5;
        const h = parseFloat(params[1]) || 20;
        code = `cylinder(r=${r}, h=${h}, center=true, $fn=64);`;
        break;
      }
    }

    return this.generateFromCode(code, cmd);
  }

  /**
   * Generate 3D model from OpenSCAD code
   */
  private async generateFromCode(code: string, cmd: SlackCommand): Promise<any> {
    const modelId = `model_${Date.now()}`;
    const model: ScadModel = {
      id: modelId,
      name: `Model ${modelId}`,
      code,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Get or create project for channel
    let project = this.projects.get(cmd.channelId);
    if (!project) {
      project = {
        id: `proj_${cmd.channelId}`,
        channelId: cmd.channelId,
        userId: cmd.userId,
        name: `Channel Project`,
        models: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.projects.set(cmd.channelId, project);
    }

    project.models.push(model);
    project.updatedAt = new Date().toISOString();

    // Initialize viewer state
    this.viewerStates.set(modelId, {
      modelId,
      rotation: { x: -35, y: 45, z: 0 },
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      lighting: {
        ambient: 0.4,
        directional: 0.8,
        position: { x: 10, y: 10, z: 10 },
      },
      autoRotate: false,
    });

    // Emit event for SCAD service to process
    this.emit('scad:generate', { model, code, channelId: cmd.channelId });

    return {
      response_type: 'in_channel',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*3D Model Generated* :package:\nModel ID: \`${modelId}\``,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\`\`\`${code}\`\`\``,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View 3D' },
              action_id: 'view_model',
              value: modelId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Screenshot' },
              action_id: 'screenshot_model',
              value: modelId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Download STL' },
              action_id: 'download_stl',
              value: modelId,
            },
          ],
        },
      ],
    };
  }

  /**
   * Open 3D viewer
   */
  private async openViewer(cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return {
        response_type: 'ephemeral',
        text: 'No models in this channel. Use `/scad cube 10` to create one.',
      };
    }

    const latestModel = project.models[project.models.length - 1];
    const viewerUrl = this.getViewerUrl(latestModel.id);

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*3D Viewer* :eyes:\nOpening viewer for: \`${latestModel.name}\``,
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Viewer' },
            url: viewerUrl,
            action_id: 'open_viewer',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Controls: Drag to rotate | Scroll to zoom | Shift+drag to pan',
            },
          ],
        },
      ],
    };
  }

  /**
   * Capture screenshot of current view
   */
  private async captureScreenshot(cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return {
        response_type: 'ephemeral',
        text: 'No models to screenshot. Create one first with `/scad`.',
      };
    }

    const latestModel = project.models[project.models.length - 1];
    const state = this.viewerStates.get(latestModel.id);

    // Emit event for screenshot capture
    this.emit('viewer:screenshot', {
      modelId: latestModel.id,
      state,
      channelId: cmd.channelId,
      userId: cmd.userId,
    });

    return {
      response_type: 'ephemeral',
      text: ':camera: Capturing screenshot... It will be posted shortly.',
    };
  }

  /**
   * List models in project
   */
  private async listModels(cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return {
        response_type: 'ephemeral',
        text: 'No models in this channel yet.',
      };
    }

    const modelList = project.models
      .map((m, i) => `${i + 1}. \`${m.id}\` - ${m.name} (${new Date(m.createdAt).toLocaleDateString()})`)
      .join('\n');

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Models in this channel* (${project.models.length}):\n${modelList}`,
          },
        },
      ],
    };
  }

  /**
   * Set rotation
   */
  private async setRotation(args: string[], cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return { response_type: 'ephemeral', text: 'No model to rotate.' };
    }

    const latestModel = project.models[project.models.length - 1];
    const state = this.viewerStates.get(latestModel.id);
    if (!state) {
      return { response_type: 'ephemeral', text: 'Viewer state not found.' };
    }

    const x = parseFloat(args[0]) || state.rotation.x;
    const y = parseFloat(args[1]) || state.rotation.y;
    const z = parseFloat(args[2]) || state.rotation.z;

    state.rotation = { x, y, z };

    this.emit('viewer:update', { modelId: latestModel.id, state });

    return {
      response_type: 'ephemeral',
      text: `:arrows_counterclockwise: Rotation set to X:${x}° Y:${y}° Z:${z}°`,
    };
  }

  /**
   * Set zoom level
   */
  private async setZoom(level: string, cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return { response_type: 'ephemeral', text: 'No model to zoom.' };
    }

    const latestModel = project.models[project.models.length - 1];
    const state = this.viewerStates.get(latestModel.id);
    if (!state) {
      return { response_type: 'ephemeral', text: 'Viewer state not found.' };
    }

    const zoom = Math.max(0.1, Math.min(10, parseFloat(level) || 1.0));
    state.zoom = zoom;

    this.emit('viewer:update', { modelId: latestModel.id, state });

    return {
      response_type: 'ephemeral',
      text: `:mag: Zoom set to ${zoom}x`,
    };
  }

  /**
   * Set lighting
   */
  private async setLighting(args: string[], cmd: SlackCommand): Promise<any> {
    const project = this.projects.get(cmd.channelId);
    if (!project || project.models.length === 0) {
      return { response_type: 'ephemeral', text: 'No model to light.' };
    }

    const latestModel = project.models[project.models.length - 1];
    const state = this.viewerStates.get(latestModel.id);
    if (!state) {
      return { response_type: 'ephemeral', text: 'Viewer state not found.' };
    }

    const ambient = parseFloat(args[0]) || state.lighting.ambient;
    const directional = parseFloat(args[1]) || state.lighting.directional;

    state.lighting.ambient = Math.max(0, Math.min(1, ambient));
    state.lighting.directional = Math.max(0, Math.min(1, directional));

    this.emit('viewer:update', { modelId: latestModel.id, state });

    return {
      response_type: 'ephemeral',
      text: `:bulb: Lighting set - Ambient: ${state.lighting.ambient}, Directional: ${state.lighting.directional}`,
    };
  }

  /**
   * Handle /remember command
   */
  private async handleRememberCommand(cmd: SlackCommand): Promise<any> {
    if (!cmd.text.trim()) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: `/remember <text to remember>`',
      };
    }

    this.emit('memory:store', {
      text: cmd.text,
      userId: cmd.userId,
      channelId: cmd.channelId,
      context: { source: 'slack' },
    });

    return {
      response_type: 'ephemeral',
      text: ':brain: Got it! Memory stored.',
    };
  }

  /**
   * Handle /recall command
   */
  private async handleRecallCommand(cmd: SlackCommand): Promise<any> {
    if (!cmd.text.trim()) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: `/recall <search query>`',
      };
    }

    this.emit('memory:recall', {
      query: cmd.text,
      userId: cmd.userId,
      channelId: cmd.channelId,
    });

    return {
      response_type: 'ephemeral',
      text: ':mag: Searching memories...',
    };
  }

  /**
   * Handle /view3d command
   */
  private async handleViewerCommand(cmd: SlackCommand): Promise<any> {
    return this.openViewer(cmd);
  }

  /**
   * Show help
   */
  private showHelp(): any {
    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*MemoRable 3D Commands* :package:',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Quick Shapes:*
• \`/scad cube [size]\` - Generate a cube
• \`/scad sphere [radius]\` - Generate a sphere
• \`/scad cylinder [r] [h]\` - Generate a cylinder

*Viewer Controls:*
• \`/scad view\` - Open 3D viewer
• \`/scad screenshot\` - Capture current view
• \`/scad rotate [x] [y] [z]\` - Set rotation angles
• \`/scad zoom [level]\` - Set zoom (0.1-10)
• \`/scad light [ambient] [directional]\` - Set lighting (0-1)

*Project:*
• \`/scad list\` - List all models
• \`/scad <openscad code>\` - Custom OpenSCAD code

*Memory:*
• \`/remember <text>\` - Store a memory
• \`/recall <query>\` - Search memories`,
          },
        },
      ],
    };
  }

  /**
   * Get viewer URL for a model
   */
  getViewerUrl(modelId: string): string {
    const baseUrl = process.env.MEMORABLE_VIEWER_URL || 'http://localhost:3000';
    return `${baseUrl}/viewer/${modelId}`;
  }

  /**
   * Get project for channel
   */
  getProject(channelId: string): ScadProject | undefined {
    return this.projects.get(channelId);
  }

  /**
   * Get viewer state for model
   */
  getViewerState(modelId: string): ViewerState | undefined {
    return this.viewerStates.get(modelId);
  }

  /**
   * Update viewer state
   */
  updateViewerState(modelId: string, updates: Partial<ViewerState>): void {
    const state = this.viewerStates.get(modelId);
    if (state) {
      Object.assign(state, updates);
      this.emit('viewer:update', { modelId, state });
    }
  }
}

// Export singleton factory
export function createSlackService(config: SlackConfig): SlackIntegrationService {
  return new SlackIntegrationService(config);
}

export default SlackIntegrationService;
