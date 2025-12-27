/**
 * @file Tests for Slack Integration Service
 *
 * Tests Slack bot functionality including:
 * - Signature verification
 * - Command handling (/scad, /remember, /recall, /view3d)
 * - Quick shape generation
 * - Viewer controls
 * - Project management
 */

import crypto from 'crypto';
import {
  SlackIntegrationService,
  createSlackService,
  SlackConfig,
  SlackCommand,
} from '../../../src/services/slack_integration/index';

describe('SlackIntegrationService', () => {
  const mockConfig: SlackConfig = {
    botToken: 'xoxb-test-token',
    signingSecret: 'test-signing-secret-12345',
    appToken: 'xapp-test-token',
    socketMode: true,
  };

  let service: SlackIntegrationService;

  beforeEach(() => {
    service = new SlackIntegrationService(mockConfig);
  });

  describe('constructor', () => {
    it('should create service with config', () => {
      expect(service).toBeInstanceOf(SlackIntegrationService);
    });

    it('should register default command handlers', async () => {
      const unknownCmd: SlackCommand = {
        command: '/unknown',
        text: '',
        userId: 'U123',
        channelId: 'C123',
        responseUrl: 'https://hooks.slack.com/test',
        triggerId: 'T123',
      };

      const response = await service.handleCommand(unknownCmd);
      expect(response.response_type).toBe('ephemeral');
      expect(response.text).toContain('Unknown command');
    });
  });

  describe('createSlackService factory', () => {
    it('should create new service instance', () => {
      const svc = createSlackService(mockConfig);
      expect(svc).toBeInstanceOf(SlackIntegrationService);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const timestamp = '1234567890';
      const body = 'test-body-content';
      const baseString = `v0:${timestamp}:${body}`;
      const hmac = crypto.createHmac('sha256', mockConfig.signingSecret);
      const signature = `v0=${hmac.update(baseString).digest('hex')}`;

      const isValid = service.verifySignature(signature, timestamp, body);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      // Create a valid-length but incorrect signature (SHA256 = 64 hex chars)
      const timestamp = '1234567890';
      const body = 'test-body';
      // Wrong signature - same length as valid but different content
      const wrongSignature = 'v0=0000000000000000000000000000000000000000000000000000000000000000';

      const isValid = service.verifySignature(wrongSignature, timestamp, body);
      expect(isValid).toBe(false);
    });
  });

  describe('/scad command', () => {
    const baseCmd: SlackCommand = {
      command: '/scad',
      text: '',
      userId: 'U123',
      channelId: 'C456',
      responseUrl: 'https://hooks.slack.com/test',
      triggerId: 'T789',
    };

    describe('help subcommand', () => {
      it('should show help with no arguments', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: '' });
        expect(response.blocks).toBeDefined();
        expect(response.blocks[0].text.text).toContain('MemoRable 3D Commands');
      });

      it('should show help with help argument', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'help' });
        expect(response.blocks).toBeDefined();
        expect(response.blocks[1].text.text).toContain('/scad cube');
      });
    });

    describe('cube subcommand', () => {
      it('should generate cube with default size', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        const response = await service.handleCommand({ ...baseCmd, text: 'cube' });

        expect(response.response_type).toBe('in_channel');
        expect(response.blocks[0].text.text).toContain('3D Model Generated');
        expect(emitted.length).toBe(1);
        expect(emitted[0].code).toContain('cube([10, 10, 10]');
      });

      it('should generate cube with custom size', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        await service.handleCommand({ ...baseCmd, text: 'cube 25' });

        expect(emitted[0].code).toContain('cube([25, 25, 25]');
      });
    });

    describe('sphere subcommand', () => {
      it('should generate sphere with default radius', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        await service.handleCommand({ ...baseCmd, text: 'sphere' });

        expect(emitted[0].code).toContain('sphere(r=10');
      });

      it('should generate sphere with custom radius', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        await service.handleCommand({ ...baseCmd, text: 'sphere 15' });

        expect(emitted[0].code).toContain('sphere(r=15');
      });
    });

    describe('cylinder subcommand', () => {
      it('should generate cylinder with default dimensions', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        await service.handleCommand({ ...baseCmd, text: 'cylinder' });

        expect(emitted[0].code).toContain('cylinder(r=5, h=20');
      });

      it('should generate cylinder with custom dimensions', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        await service.handleCommand({ ...baseCmd, text: 'cylinder 8 30' });

        expect(emitted[0].code).toContain('cylinder(r=8, h=30');
      });
    });

    describe('view subcommand', () => {
      it('should return error when no models exist', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'view' });
        expect(response.response_type).toBe('ephemeral');
        expect(response.text).toContain('No models');
      });

      it('should open viewer when model exists', async () => {
        // First create a model
        await service.handleCommand({ ...baseCmd, text: 'cube 10' });

        const response = await service.handleCommand({ ...baseCmd, text: 'view' });
        expect(response.blocks[0].text.text).toContain('3D Viewer');
        expect(response.blocks[0].accessory.url).toContain('/viewer/');
      });
    });

    describe('screenshot subcommand', () => {
      it('should return error when no models exist', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'screenshot' });
        expect(response.response_type).toBe('ephemeral');
        expect(response.text).toContain('No models to screenshot');
      });

      it('should emit screenshot event when model exists', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        const emitted: any[] = [];
        service.on('viewer:screenshot', (data) => emitted.push(data));

        const response = await service.handleCommand({ ...baseCmd, text: 'screenshot' });

        expect(response.text).toContain('Capturing screenshot');
        expect(emitted.length).toBe(1);
        expect(emitted[0].channelId).toBe('C456');
      });
    });

    describe('list subcommand', () => {
      it('should return empty message when no models', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'list' });
        expect(response.text).toContain('No models in this channel');
      });

      it('should list models when they exist', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube 10' });
        await service.handleCommand({ ...baseCmd, text: 'sphere 5' });

        const response = await service.handleCommand({ ...baseCmd, text: 'list' });
        expect(response.blocks[0].text.text).toContain('Models in this channel');
        expect(response.blocks[0].text.text).toContain('(2)');
      });
    });

    describe('rotate subcommand', () => {
      it('should return error when no model exists', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'rotate 45 90 0' });
        expect(response.text).toContain('No model to rotate');
      });

      it('should set rotation when model exists', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        const emitted: any[] = [];
        service.on('viewer:update', (data) => emitted.push(data));

        const response = await service.handleCommand({ ...baseCmd, text: 'rotate 45 90 30' });

        expect(response.text).toContain('X:45');
        expect(response.text).toContain('Y:90');
        expect(response.text).toContain('Z:30');
      });
    });

    describe('zoom subcommand', () => {
      it('should return error when no model exists', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'zoom 2' });
        expect(response.text).toContain('No model to zoom');
      });

      it('should set zoom level', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        const response = await service.handleCommand({ ...baseCmd, text: 'zoom 2.5' });
        expect(response.text).toContain('2.5x');
      });

      it('should clamp zoom to valid range', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        let response = await service.handleCommand({ ...baseCmd, text: 'zoom 0.05' });
        expect(response.text).toContain('0.1x');

        response = await service.handleCommand({ ...baseCmd, text: 'zoom 15' });
        expect(response.text).toContain('10x');
      });
    });

    describe('light subcommand', () => {
      it('should return error when no model exists', async () => {
        const response = await service.handleCommand({ ...baseCmd, text: 'light 0.5 0.8' });
        expect(response.text).toContain('No model to light');
      });

      it('should set lighting levels', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        const response = await service.handleCommand({ ...baseCmd, text: 'light 0.5 0.8' });
        expect(response.text).toContain('Ambient: 0.5');
        expect(response.text).toContain('Directional: 0.8');
      });

      it('should clamp lighting to valid range', async () => {
        await service.handleCommand({ ...baseCmd, text: 'cube' });

        const response = await service.handleCommand({ ...baseCmd, text: 'light 1.5 -0.5' });
        expect(response.text).toContain('Ambient: 1');
        expect(response.text).toContain('Directional: 0');
      });
    });

    describe('raw OpenSCAD code', () => {
      it('should generate model from raw code', async () => {
        const emitted: any[] = [];
        service.on('scad:generate', (data) => emitted.push(data));

        const code = 'difference() { cube(20); sphere(12); }';
        await service.handleCommand({ ...baseCmd, text: code });

        expect(emitted[0].code).toBe(code);
      });
    });
  });

  describe('/remember command', () => {
    const baseCmd: SlackCommand = {
      command: '/remember',
      text: '',
      userId: 'U123',
      channelId: 'C456',
      responseUrl: 'https://hooks.slack.com/test',
      triggerId: 'T789',
    };

    it('should show usage when no text provided', async () => {
      const response = await service.handleCommand({ ...baseCmd, text: '' });
      expect(response.text).toContain('Usage:');
    });

    it('should emit memory store event', async () => {
      const emitted: any[] = [];
      service.on('memory:store', (data) => emitted.push(data));

      const response = await service.handleCommand({
        ...baseCmd,
        text: 'Important meeting notes',
      });

      expect(response.text).toContain('Memory stored');
      expect(emitted[0].text).toBe('Important meeting notes');
      expect(emitted[0].context.source).toBe('slack');
    });
  });

  describe('/recall command', () => {
    const baseCmd: SlackCommand = {
      command: '/recall',
      text: '',
      userId: 'U123',
      channelId: 'C456',
      responseUrl: 'https://hooks.slack.com/test',
      triggerId: 'T789',
    };

    it('should show usage when no query provided', async () => {
      const response = await service.handleCommand({ ...baseCmd, text: '' });
      expect(response.text).toContain('Usage:');
    });

    it('should emit memory recall event', async () => {
      const emitted: any[] = [];
      service.on('memory:recall', (data) => emitted.push(data));

      const response = await service.handleCommand({
        ...baseCmd,
        text: 'meeting notes',
      });

      expect(response.text).toContain('Searching memories');
      expect(emitted[0].query).toBe('meeting notes');
    });
  });

  describe('/view3d command', () => {
    const baseCmd: SlackCommand = {
      command: '/view3d',
      text: '',
      userId: 'U123',
      channelId: 'C456',
      responseUrl: 'https://hooks.slack.com/test',
      triggerId: 'T789',
    };

    it('should open viewer (alias for /scad view)', async () => {
      // Create a model first
      const scadCmd: SlackCommand = { ...baseCmd, command: '/scad', text: 'cube' };
      await service.handleCommand(scadCmd);

      const response = await service.handleCommand(baseCmd);
      expect(response.blocks[0].text.text).toContain('3D Viewer');
    });
  });

  describe('getViewerUrl', () => {
    it('should return viewer URL with model ID', () => {
      const url = service.getViewerUrl('model_123');
      expect(url).toContain('/viewer/model_123');
    });

    it('should use environment variable if set', () => {
      const originalEnv = process.env.MEMORABLE_VIEWER_URL;
      process.env.MEMORABLE_VIEWER_URL = 'https://custom.domain.com';

      const url = service.getViewerUrl('model_456');
      expect(url).toBe('https://custom.domain.com/viewer/model_456');

      process.env.MEMORABLE_VIEWER_URL = originalEnv;
    });
  });

  describe('getProject', () => {
    it('should return undefined for non-existent channel', () => {
      const project = service.getProject('C999');
      expect(project).toBeUndefined();
    });

    it('should return project after model creation', async () => {
      const cmd: SlackCommand = {
        command: '/scad',
        text: 'cube',
        userId: 'U123',
        channelId: 'C456',
        responseUrl: 'https://hooks.slack.com/test',
        triggerId: 'T789',
      };

      await service.handleCommand(cmd);
      const project = service.getProject('C456');

      expect(project).toBeDefined();
      expect(project?.channelId).toBe('C456');
      expect(project?.models.length).toBe(1);
    });
  });

  describe('getViewerState', () => {
    it('should return undefined for non-existent model', () => {
      const state = service.getViewerState('nonexistent');
      expect(state).toBeUndefined();
    });

    it('should return state after model creation', async () => {
      const cmd: SlackCommand = {
        command: '/scad',
        text: 'sphere 10',
        userId: 'U123',
        channelId: 'C456',
        responseUrl: 'https://hooks.slack.com/test',
        triggerId: 'T789',
      };

      await service.handleCommand(cmd);
      const project = service.getProject('C456');
      const modelId = project?.models[0].id;

      const state = service.getViewerState(modelId!);
      expect(state).toBeDefined();
      expect(state?.rotation).toEqual({ x: -35, y: 45, z: 0 });
      expect(state?.zoom).toBe(1.0);
    });
  });

  describe('updateViewerState', () => {
    it('should update viewer state and emit event', async () => {
      const cmd: SlackCommand = {
        command: '/scad',
        text: 'cube',
        userId: 'U123',
        channelId: 'C456',
        responseUrl: 'https://hooks.slack.com/test',
        triggerId: 'T789',
      };

      await service.handleCommand(cmd);
      const project = service.getProject('C456');
      const modelId = project?.models[0].id!;

      const emitted: any[] = [];
      service.on('viewer:update', (data) => emitted.push(data));

      service.updateViewerState(modelId, { zoom: 2.5, autoRotate: true });

      const state = service.getViewerState(modelId);
      expect(state?.zoom).toBe(2.5);
      expect(state?.autoRotate).toBe(true);
      expect(emitted.length).toBe(1);
    });

    it('should do nothing for non-existent model', () => {
      const emitted: any[] = [];
      service.on('viewer:update', (data) => emitted.push(data));

      service.updateViewerState('nonexistent', { zoom: 2 });

      expect(emitted.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle command errors gracefully', async () => {
      // Create a service that will throw an error
      const errorService = new SlackIntegrationService(mockConfig);

      // Mock command handler to throw error
      (errorService as any).commandHandlers.set('/test', async () => {
        throw new Error('Test error');
      });

      const response = await errorService.handleCommand({
        command: '/test',
        text: '',
        userId: 'U123',
        channelId: 'C456',
        responseUrl: 'https://hooks.slack.com/test',
        triggerId: 'T789',
      });

      expect(response.response_type).toBe('ephemeral');
      expect(response.text).toContain('Error: Test error');
    });
  });
});
