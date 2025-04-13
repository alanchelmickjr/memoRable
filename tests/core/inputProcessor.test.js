import { InputProcessor } from '../../src/core/inputProcessor.js';
import { jest } from '@jest/globals';
import { promises as fs } from 'fs';

// Mock external dependencies
jest.mock('node-nlp', () => ({
  NLP: jest.fn().mockImplementation(() => ({
    train: jest.fn(),
    process: jest.fn().mockResolvedValue({
      tokens: [],
      sentiment: { score: 0 },
      entities: [],
      intent: null,
      language: 'en'
    })
  }))
}));

jest.mock('node-webcam', () => ({
  create: jest.fn().mockReturnValue({
    capture: jest.fn()
  })
}));

jest.mock('node-microphone', () => ({
  Microphone: jest.fn().mockImplementation(() => ({
    startRecording: jest.fn().mockReturnValue({
      on: jest.fn(),
      stopRecording: jest.fn()
    })
  }))
}));

jest.mock('@tensorflow/tfjs-node', () => ({
  node: {
    decodeImage: jest.fn().mockReturnValue({
      shape: [100, 100, 3],
      dispose: jest.fn()
    })
  }
}));

describe('InputProcessor', () => {
  let inputProcessor;

  beforeEach(() => {
    process.env.ENABLE_CAMERA = 'false';
    process.env.ENABLE_MICROPHONE = 'false';
    inputProcessor = new InputProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(inputProcessor.initialize()).resolves.not.toThrow();
    });

    it('should initialize camera when enabled', async () => {
      process.env.ENABLE_CAMERA = 'true';
      inputProcessor = new InputProcessor();
      await expect(inputProcessor.initialize()).resolves.not.toThrow();
    });

    it('should initialize microphone when enabled', async () => {
      process.env.ENABLE_MICROPHONE = 'true';
      inputProcessor = new InputProcessor();
      await expect(inputProcessor.initialize()).resolves.not.toThrow();
    });
  });

  describe('processInput', () => {
    beforeEach(async () => {
      await inputProcessor.initialize();
    });

    it('should process text input', async () => {
      const input = 'Hello, world!';
      const result = await inputProcessor.processInput(input, 'text');
      
      expect(result).toHaveProperty('type', 'text');
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');
    });

    it('should process vision input from buffer', async () => {
      const input = Buffer.from('fake-image-data');
      const result = await inputProcessor.processInput(input, 'vision');
      
      expect(result).toHaveProperty('type', 'vision');
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');
    });

    it('should process audio input from buffer', async () => {
      const input = Buffer.from('fake-audio-data');
      const result = await inputProcessor.processInput(input, 'audio');
      
      expect(result).toHaveProperty('type', 'audio');
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');
    });

    it('should process video input', async () => {
      const input = Buffer.from('fake-video-data');
      const result = await inputProcessor.processInput(input, 'video');
      
      expect(result).toHaveProperty('type', 'video');
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');
    });

    it('should process file input', async () => {
      const input = 'test.txt';
      jest.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('test content'));
      
      const result = await inputProcessor.processInput(input, 'file');
      
      expect(result).toHaveProperty('type', 'file');
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('metadata');
    });

    it('should reject unsupported input type', async () => {
      await expect(inputProcessor.processInput('test', 'unsupported'))
        .rejects
        .toThrow('Unsupported input type: unsupported');
    });
  });

  describe('text processing', () => {
    it('should generate text embeddings', async () => {
      const text = 'Hello, world!';
      const result = await inputProcessor.processText(text);
      
      expect(result).toHaveProperty('original', text);
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('embeddings');
    });
  });

  describe('vision processing', () => {
    it('should process image data', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const result = await inputProcessor.processVision(imageBuffer);
      
      expect(result).toHaveProperty('shape');
    });

    it('should handle base64 image data', async () => {
      const base64Image = 'data:image/jpeg;base64,fake-image-data';
      const result = await inputProcessor.processVision(base64Image);
      
      expect(result).toHaveProperty('shape');
    });
  });

  describe('audio processing', () => {
    it('should extract audio features', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      const result = await inputProcessor.processAudio(audioBuffer);
      
      expect(result).toHaveProperty('features');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('sampleRate');
      expect(result).toHaveProperty('embeddings');
    });
  });

  describe('metadata extraction', () => {
    it('should extract metadata from different input types', () => {
      const inputs = [
        { input: 'text', type: 'text' },
        { input: Buffer.from('data'), type: 'vision' },
        { input: Buffer.from('audio'), type: 'audio' }
      ];

      inputs.forEach(({ input, type }) => {
        const metadata = inputProcessor.extractMetadata(input, type);
        expect(metadata).toHaveProperty('timestamp');
        expect(metadata).toHaveProperty('type', type);
        expect(metadata).toHaveProperty('size');
      });
    });
  });
});