/**
 * Main server entry point for Docker/ECS deployment.
 * Starts Express server with health endpoints and initializes services.
 */

import express from 'express';
import cors from 'cors';
import { initialize, shutdown, isAlive, isReady, probes, getState } from './services/salience_service/startup.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoints for load balancers and Kubernetes
app.get('/health', async (_req, res) => {
  const alive = isAlive();
  const ready = await isReady();
  res.status(alive && ready ? 200 : 503).json({
    healthy: alive && ready,
    alive,
    ready,
    state: getState(),
  });
});

app.get('/health/live', probes.live);
app.get('/health/ready', probes.ready);
app.get('/health/startup', probes.startup);

// Basic info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'MemoRable',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Context-aware memory system for AI agents',
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

// Start server
async function start() {
  try {
    console.log('[Server] Initializing services...');
    await initialize();

    app.listen(PORT, () => {
      console.log(`[Server] MemoRable listening on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
