/**
 * Embedding Service - Generates vector embeddings for text data.
 * Provides a simple HTTP API for embedding generation.
 */

import express, { Application, Request, Response } from 'express';

const app: Application = express();
const PORT = process.env.EMBEDDING_SERVICE_PORT || process.env.PORT || 3003;

app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    service: 'embedding_service',
    timestamp: new Date().toISOString(),
  });
});

// Embed text endpoint
app.post('/embed', (req: Request, res: Response): void => {
  try {
    const { text, model } = req.body;

    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    // Placeholder: Generate mock embedding vector
    // In production, this would call an actual embedding model (e.g., sentence-transformers, OpenAI)
    const dimension = 1024;
    const embedding = Array.from({ length: dimension }, () => Math.random() * 2 - 1);

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = embedding.map(val => val / magnitude);

    res.json({
      embedding: normalizedEmbedding,
      dimension,
      model: model || 'placeholder-v1',
      text_length: text.length,
    });
  } catch (error) {
    console.error('[EmbeddingService] Error generating embedding:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// Batch embed endpoint
app.post('/embed/batch', (req: Request, res: Response): void => {
  try {
    const { texts, model } = req.body;

    if (!texts || !Array.isArray(texts)) {
      res.status(400).json({ error: 'texts array is required' });
      return;
    }

    const dimension = 1024;
    const embeddings = texts.map((text: string) => {
      const embedding = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
    });

    res.json({
      embeddings,
      dimension,
      model: model || 'placeholder-v1',
      count: texts.length,
    });
  } catch (error) {
    console.error('[EmbeddingService] Error generating batch embeddings:', error);
    res.status(500).json({ error: 'Failed to generate embeddings' });
  }
});

app.listen(PORT, () => {
  console.log(`[EmbeddingService] Running on port ${PORT}`);
  console.log(`[EmbeddingService] Health check: http://localhost:${PORT}/health`);
});

export default app;
