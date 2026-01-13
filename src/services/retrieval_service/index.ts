/**
 * Retrieval Service - Retrieves and ranks memories from the vector database.
 * Provides a simple HTTP API for memory retrieval.
 */

import express, { Application, Request, Response } from 'express';

const app: Application = express();
const PORT = process.env.RETRIEVAL_SERVICE_PORT || process.env.PORT || 3004;

app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    service: 'retrieval_service',
    timestamp: new Date().toISOString(),
  });
});

// Retrieve memories endpoint
app.post('/retrieve', (req: Request, res: Response): void => {
  try {
    const { query, userId, limit = 10, minSalience = 0 } = req.body;

    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Placeholder: Return mock retrieval results
    // In production, this would query Weaviate and apply salience ranking
    const mockResults = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `memory_${Date.now()}_${i}`,
      text: `Mock memory result ${i + 1} for query: "${query.substring(0, 50)}..."`,
      salience: Math.round((100 - i * 15) * (1 - minSalience / 100)),
      similarity: 0.95 - i * 0.1,
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      userId: userId || 'default',
    }));

    res.json({
      results: mockResults,
      query,
      count: mockResults.length,
      limit,
    });
  } catch (error) {
    console.error('[RetrievalService] Error retrieving memories:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
});

// Retrieve by ID endpoint
app.get('/retrieve/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;

    // Placeholder: Return mock memory
    res.json({
      id,
      text: `Mock memory content for ID: ${id}`,
      salience: 75,
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  } catch (error) {
    console.error('[RetrievalService] Error retrieving memory by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

// Similar memories endpoint
app.post('/similar', (req: Request, res: Response): void => {
  try {
    const { memoryId, limit = 5 } = req.body;

    if (!memoryId) {
      res.status(400).json({ error: 'memoryId is required' });
      return;
    }

    // Placeholder: Return mock similar memories
    const mockSimilar = Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      id: `similar_${Date.now()}_${i}`,
      text: `Similar memory ${i + 1} to ${memoryId}`,
      similarity: 0.9 - i * 0.15,
      salience: 70 - i * 10,
    }));

    res.json({
      sourceId: memoryId,
      similar: mockSimilar,
      count: mockSimilar.length,
    });
  } catch (error) {
    console.error('[RetrievalService] Error finding similar memories:', error);
    res.status(500).json({ error: 'Failed to find similar memories' });
  }
});

app.listen(PORT, () => {
  console.log(`[RetrievalService] Running on port ${PORT}`);
  console.log(`[RetrievalService] Health check: http://localhost:${PORT}/health`);
});

export default app;
