/**
 * Main server entry point for Docker/ECS deployment.
 * Simple Express server with health endpoints.
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Track startup state
let isReady = false;
const startTime = Date.now();

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoints for load balancers and Kubernetes
app.get('/health', (_req, res) => {
  res.status(isReady ? 200 : 503).json({
    healthy: isReady,
    uptime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/live', (_req, res) => {
  // Liveness: is the process running?
  res.status(200).json({ alive: true });
});

app.get('/health/ready', (_req, res) => {
  // Readiness: is the service ready for traffic?
  res.status(isReady ? 200 : 503).json({ ready: isReady });
});

app.get('/health/startup', (_req, res) => {
  // Startup: has initialization completed?
  res.status(isReady ? 200 : 503).json({ initialized: isReady });
});

// Basic info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'MemoRable',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Context-aware memory system for AI agents',
    status: isReady ? 'ready' : 'starting',
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start server
async function start() {
  try {
    console.log('[Server] Starting MemoRable...');

    app.listen(PORT, () => {
      console.log(`[Server] MemoRable listening on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);

      // Mark as ready after server starts
      isReady = true;
      console.log('[Server] Service is ready for traffic');
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
