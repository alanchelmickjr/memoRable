import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import { expressionColors, emotionToVector } from '../constants/emotions.js';

export class HumeService {
  constructor() {
    this.ws = null;
    this.apiKey = process.env.HUME_API_KEY;
    this.endpoint = process.env.HUME_ENDPOINT;
    this.isConnected = false;
    this.activeStreams = new Map();
    this.messageQueue = [];
    this.processingQueue = false;
    this.lastActivityTime = Date.now();
    this.inactivityTimeout = 60000; // 1 minute inactivity timeout
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
  }

  async connect(config = {}) {
    if (!this.apiKey) {
      throw new Error('Hume API key not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        const params = new URLSearchParams({
          apiKey: this.apiKey,
          ...config
        });

        const wsUrl = `${this.endpoint}?${params.toString()}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          logger.info('Connected to Hume.ai websocket');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.setupInactivityCheck();
          resolve();
        });

        this.ws.on('message', (data) => {
          this.lastActivityTime = Date.now();
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          logger.error('Hume websocket error:', error);
          this.handleError(error);
        });

        this.ws.on('close', () => {
          logger.info('Hume websocket closed');
          this.isConnected = false;
          this.handleDisconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  setupInactivityCheck() {
    setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      if (inactiveTime >= this.inactivityTimeout) {
        logger.warn('WebSocket inactive, reconnecting...');
        this.reconnect();
      }
    }, 10000); // Check every 10 seconds
  }

  async reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.reconnectDelay *= 2; // Exponential backoff
      logger.info(`Attempting to reconnect in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(async () => {
        try {
          await this.connect();
          // Resubscribe active streams
          for (const [streamId, config] of this.activeStreams) {
            await this.startStream(streamId, config);
          }
        } catch (error) {
          logger.error('Reconnection attempt failed:', error);
        }
      }, this.reconnectDelay);
    } else {
      logger.error('Max reconnection attempts reached');
    }
  }

  async startStream(streamId, config) {
    if (!this.isConnected) {
      await this.connect();
    }

    const streamConfig = {
      models: config.models || { language: {}, face: {}, prosody: {} },
      raw_text: config.rawText || true,
      reset_stream: config.resetStream || false
    };

    this.activeStreams.set(streamId, {
      config: streamConfig,
      callbacks: new Map(),
      buffer: []
    });

    await this.sendMessage({
      type: 'stream_start',
      stream_id: streamId,
      config: streamConfig
    });

    logger.info(`Started stream ${streamId}`);
  }

  async stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    await this.sendMessage({
      type: 'stream_end',
      stream_id: streamId
    });

    this.activeStreams.delete(streamId);
    logger.info(`Stopped stream ${streamId}`);
  }

  async processText(text, streamId = null) {
    const id = streamId || `text_${Date.now()}`;
    if (!streamId) {
      await this.startStream(id, { models: { language: {} } });
    }

    return this.sendData(id, {
      type: 'text',
      data: text
    });
  }

  async processVoice(audioData, streamId = null) {
    const id = streamId || `voice_${Date.now()}`;
    if (!streamId) {
      await this.startStream(id, { models: { prosody: {} } });
    }

    // Split audio into 5-second chunks
    const chunks = this.splitAudioIntoChunks(audioData);
    const results = [];

    for (const chunk of chunks) {
      const result = await this.sendData(id, {
        type: 'prosody',
        data: chunk.toString('base64')
      });
      results.push(result);
    }

    if (!streamId) {
      await this.stopStream(id);
    }

    return this.mergeResults(results);
  }

  async processFacial(imageData, streamId = null) {
    const id = streamId || `face_${Date.now()}`;
    if (!streamId) {
      await this.startStream(id, { models: { face: {} } });
    }

    const result = await this.sendData(id, {
      type: 'face',
      data: imageData.toString('base64')
    });

    if (!streamId) {
      await this.stopStream(id);
    }

    return result;
  }

  splitAudioIntoChunks(audioData, chunkSize = 5000) {
    // Split audio data into 5-second chunks
    const chunks = [];
    let offset = 0;
    while (offset < audioData.length) {
      chunks.push(audioData.slice(offset, offset + chunkSize));
      offset += chunkSize;
    }
    return chunks;
  }

  mergeResults(results) {
    // Merge multiple chunk results into a single result
    const merged = {
      emotions: new Map()
    };

    results.forEach(result => {
      result.emotions.forEach(emotion => {
        const existing = merged.emotions.get(emotion.name) || { score: 0, count: 0 };
        existing.score += emotion.score;
        existing.count += 1;
        merged.emotions.set(emotion.name, existing);
      });
    });

    // Average the scores
    return Array.from(merged.emotions.entries()).map(([name, data]) => ({
      name,
      score: data.score / data.count
    }));
  }

  async sendData(streamId, data) {
    return new Promise((resolve, reject) => {
      const messageId = Date.now().toString();
      const stream = this.activeStreams.get(streamId);
      
      if (!stream) {
        reject(new Error(`Stream ${streamId} not found`));
        return;
      }

      stream.callbacks.set(messageId, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(this.processEmotions(response.emotions));
        }
      });

      this.sendMessage({
        id: messageId,
        stream_id: streamId,
        ...data
      });
    });
  }

  async sendMessage(message) {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.messageQueue.push(message);
    if (!this.processingQueue) {
      await this.processMessageQueue();
    }
  }

  async processMessageQueue() {
    this.processingQueue = true;
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      try {
        this.ws.send(JSON.stringify(message));
        this.lastActivityTime = Date.now();
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 20));
      } catch (error) {
        logger.error('Failed to send message:', error);
        this.messageQueue.unshift(message);
        break;
      }
    }
    this.processingQueue = false;
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const stream = this.activeStreams.get(message.stream_id);
      
      if (stream && message.id && stream.callbacks.has(message.id)) {
        const callback = stream.callbacks.get(message.id);
        callback(message);
        stream.callbacks.delete(message.id);
      }
    } catch (error) {
      logger.error('Error handling Hume message:', error);
    }
  }

  processEmotions(emotions) {
    return emotions.map(emotion => ({
      name: emotion.name,
      score: emotion.score,
      vector: emotionToVector(emotion.name),
      color: expressionColors[emotion.name],
      confidence: emotion.confidence || emotion.score
    }))
    .filter(emotion => emotion.confidence >= 0.1)
    .sort((a, b) => b.score - a.score);
  }

  async close() {
    // Stop all active streams
    for (const streamId of this.activeStreams.keys()) {
      await this.stopStream(streamId);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      logger.info('Hume websocket connection closed');
    }
  }
}

// Create singleton instance
const humeService = new HumeService();

export default humeService;