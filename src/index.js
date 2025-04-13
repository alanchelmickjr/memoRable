import dotenv from 'dotenv';
import express from 'express';
import { setupDatabase } from './config/database.js';
import { setupRedis } from './config/redis.js';
import { setupWeaviate } from './config/weaviate.js';
import { setupLogger } from './utils/logger.js';
import { MemoryManager } from './core/memoryManager.js';
import { EmotionProcessor } from './core/emotionProcessor.js';
import { InputProcessor } from './core/inputProcessor.js';
import { AttentionSystem } from './core/attentionSystem.js';
import { PredictiveBehavior } from './core/predictiveBehavior.js';

// Load environment variables
dotenv.config();

const app = express();
const logger = setupLogger();

// Initialize core systems
async function initializeSystems() {
  try {
    // Setup databases
    await setupDatabase();
    await setupRedis();
    await setupWeaviate();

    // Initialize core components
    const memoryManager = new MemoryManager();
    const emotionProcessor = new EmotionProcessor();
    const inputProcessor = new InputProcessor();
    const attentionSystem = new AttentionSystem();
    const predictiveBehavior = new PredictiveBehavior();

    // Connect components
    await memoryManager.initialize();
    await emotionProcessor.initialize();
    await inputProcessor.initialize();
    await attentionSystem.initialize();
    await predictiveBehavior.initialize();

    logger.info('All systems initialized successfully');
    return {
      memoryManager,
      emotionProcessor,
      inputProcessor,
      attentionSystem,
      predictiveBehavior
    };
  } catch (error) {
    logger.error('Failed to initialize systems:', error);
    throw error;
  }
}

// Start server
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the application
async function startApplication() {
  try {
    const systems = await initializeSystems();
    
    // Add error handling middleware
    app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    // Start listening
    app.listen(PORT, () => {
      logger.info(`MemoRable AI system listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

startApplication();