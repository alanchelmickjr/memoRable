import { logger } from '../utils/logger.js';
import humeService from './humeService.js';

export class VideoStreamService {
  constructor() {
    this.activeStreams = new Map();
    this.chunkDuration = 5000; // 5 seconds in milliseconds
    this.maxResolution = { width: 3000, height: 3000 };
    this.processingInterval = 1000; // Process every second
  }

  async startStream(streamId, onEmotionUpdate, config = {}) {
    if (this.activeStreams.has(streamId)) {
      logger.warn(`Stream ${streamId} is already active`);
      return;
    }

    const streamContext = {
      id: streamId,
      buffer: [],
      lastProcessed: Date.now(),
      onUpdate: onEmotionUpdate,
      processingInterval: null,
      config: {
        resetStream: config.resetStream || false,
        models: {
          face: config.faceConfig || {}
        },
        ...config
      }
    };

    try {
      // Start Hume stream
      await humeService.startStream(streamId, streamContext.config);

      // Start processing interval
      streamContext.processingInterval = setInterval(
        () => this.processStreamBuffer(streamContext),
        this.processingInterval
      );

      this.activeStreams.set(streamId, streamContext);
      logger.info(`Started video stream ${streamId}`);
    } catch (error) {
      logger.error(`Failed to start video stream ${streamId}:`, error);
      throw error;
    }
  }

  async stopStream(streamId) {
    const streamContext = this.activeStreams.get(streamId);
    if (!streamContext) {
      logger.warn(`Stream ${streamId} not found`);
      return;
    }

    // Clear processing interval
    if (streamContext.processingInterval) {
      clearInterval(streamContext.processingInterval);
    }

    // Process any remaining frames
    await this.processStreamBuffer(streamContext);

    // Stop Hume stream
    await humeService.stopStream(streamId);

    this.activeStreams.delete(streamId);
    logger.info(`Stopped video stream ${streamId}`);
  }

  async addFrame(streamId, frameData, timestamp = Date.now()) {
    const streamContext = this.activeStreams.get(streamId);
    if (!streamContext) {
      logger.warn(`Stream ${streamId} not found, frame discarded`);
      return;
    }

    try {
      // Validate frame dimensions
      const dimensions = await this.getFrameDimensions(frameData);
      if (!this.validateFrameDimensions(dimensions)) {
        logger.warn(`Frame dimensions exceed maximum (${dimensions.width}x${dimensions.height})`);
        return;
      }

      streamContext.buffer.push({
        data: frameData,
        timestamp
      });

      // Trim buffer if it gets too large
      this.trimBuffer(streamContext);
    } catch (error) {
      logger.error(`Error adding frame to stream ${streamId}:`, error);
    }
  }

  async processStreamBuffer(streamContext) {
    if (streamContext.buffer.length === 0) return;

    try {
      const now = Date.now();
      const chunkStartTime = now - this.chunkDuration;

      // Get frames within the current chunk
      const chunkFrames = streamContext.buffer.filter(
        frame => frame.timestamp >= chunkStartTime
      );

      if (chunkFrames.length === 0) return;

      // Select the best frame from the chunk
      const selectedFrame = this.selectBestFrame(chunkFrames);

      // Process the frame with Hume
      const emotions = await humeService.processFacial(
        selectedFrame.data,
        streamContext.id
      );

      // Update emotional state
      if (streamContext.onUpdate && emotions.length > 0) {
        streamContext.onUpdate({
          streamId: streamContext.id,
          timestamp: now,
          emotions,
          frameCount: chunkFrames.length,
          selectedFrameTime: selectedFrame.timestamp
        });
      }

      // Remove processed frames
      streamContext.buffer = streamContext.buffer.filter(
        frame => frame.timestamp > chunkStartTime
      );

      streamContext.lastProcessed = now;
    } catch (error) {
      logger.error(`Error processing stream ${streamContext.id}:`, error);
    }
  }

  selectBestFrame(frames) {
    // For now, select the middle frame
    // Could be enhanced with frame quality detection
    return frames[Math.floor(frames.length / 2)];
  }

  trimBuffer(streamContext) {
    const now = Date.now();
    // Keep only frames from the last chunk duration
    streamContext.buffer = streamContext.buffer.filter(
      frame => now - frame.timestamp <= this.chunkDuration
    );
  }

  async getFrameDimensions(frameData) {
    // Implementation would depend on how frames are provided
    // This is a placeholder that should be implemented based on
    // the actual frame format (e.g., raw pixels, base64 image, etc.)
    return {
      width: 1280,  // placeholder
      height: 720   // placeholder
    };
  }

  validateFrameDimensions(dimensions) {
    return dimensions.width <= this.maxResolution.width &&
           dimensions.height <= this.maxResolution.height;
  }

  getStreamStatus(streamId) {
    const streamContext = this.activeStreams.get(streamId);
    if (!streamContext) return null;

    return {
      id: streamContext.id,
      isActive: true,
      bufferSize: streamContext.buffer.length,
      lastProcessed: streamContext.lastProcessed,
      timeSinceLastProcess: Date.now() - streamContext.lastProcessed,
      config: streamContext.config
    };
  }

  getAllStreams() {
    return Array.from(this.activeStreams.keys()).map(id => this.getStreamStatus(id));
  }

  async cleanup() {
    // Stop all active streams
    for (const streamId of this.activeStreams.keys()) {
      await this.stopStream(streamId);
    }
  }
}

// Create singleton instance
const videoStreamService = new VideoStreamService();

export default videoStreamService;