/**
 * Embedding Service - Generates vector embeddings for text data.
 * Uses Ollama with nomic-embed-text (768 dims, MongoDB Atlas compatible).
 * Falls back to deterministic hash-based embeddings when Ollama is unavailable.
 */

import express, { Application, Request, Response } from 'express';
import crypto from 'crypto';

const app: Application = express();
const PORT = process.env.EMBEDDING_SERVICE_PORT || process.env.PORT || 3003;
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_API_URL || 'http://ollama:11434';
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const DEFAULT_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);

app.use(express.json());

/**
 * Generate a deterministic embedding from text using cryptographic hashing.
 * Not as good as a real model, but consistent and useful for text similarity
 * via overlapping n-gram hashes. Used when Ollama is unavailable.
 */
function hashEmbedding(text: string, dimension: number): number[] {
  // Use overlapping character trigrams to capture local structure
  const normalized = text.toLowerCase().trim();
  const vector = new Float64Array(dimension);

  // Hash the full text for global signal
  const fullHash = crypto.createHash('sha512').update(normalized).digest();
  for (let i = 0; i < dimension; i++) {
    vector[i] = (fullHash[i % fullHash.length] / 255) * 2 - 1;
  }

  // Layer in trigram hashes for local structure (makes similar texts produce similar vectors)
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    const trigramHash = crypto.createHash('md5').update(trigram).digest();
    const idx = trigramHash.readUInt16BE(0) % dimension;
    // Accumulate rather than overwrite — more trigram hits = stronger signal
    vector[idx] += (trigramHash[2] / 255) * 0.1;
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return Array.from({ length: dimension }, () => 0);
  return Array.from(vector, val => val / magnitude);
}

/**
 * Call Ollama embedding API.
 * Returns null if Ollama is unreachable (caller should fall back).
 */
async function ollamaEmbed(text: string, model: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(parseInt(process.env.EMBEDDING_TIMEOUT_MS || '30000', 10)),
    });

    if (!response.ok) {
      console.error(`[EmbeddingService] Ollama returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const data = await response.json() as { embeddings?: number[][] };
    if (data.embeddings && data.embeddings.length > 0) {
      return data.embeddings[0];
    }

    console.error('[EmbeddingService] Ollama response missing embeddings field');
    return null;
  } catch (error) {
    console.error(`[EmbeddingService] Ollama unreachable at ${OLLAMA_HOST}:`, (error as Error).message);
    return null;
  }
}

let ollamaAvailable: boolean | null = null; // null = unknown, check on first request

// Health check endpoint
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  // Probe Ollama availability
  try {
    const probe = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    ollamaAvailable = probe.ok;
  } catch {
    ollamaAvailable = false;
  }

  res.json({
    status: 'healthy',
    service: 'embedding_service',
    ollamaAvailable,
    ollamaHost: OLLAMA_HOST,
    defaultModel: DEFAULT_MODEL,
    defaultDimension: DEFAULT_DIMENSION,
    fallback: 'hash-based deterministic embeddings',
    timestamp: new Date().toISOString(),
  });
});

// Embed text endpoint
app.post('/embed', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, model } = req.body;

    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const useModel = model || DEFAULT_MODEL;

    // Try Ollama first
    const ollamaResult = await ollamaEmbed(text, useModel);

    if (ollamaResult) {
      ollamaAvailable = true;
      res.json({
        embedding: ollamaResult,
        dimension: ollamaResult.length,
        model: useModel,
        source: 'ollama',
        text_length: text.length,
      });
      return;
    }

    // Fallback: deterministic hash-based embedding
    ollamaAvailable = false;
    console.warn('[EmbeddingService] Ollama unavailable, using hash-based fallback');
    const hashResult = hashEmbedding(text, DEFAULT_DIMENSION);

    res.json({
      embedding: hashResult,
      dimension: DEFAULT_DIMENSION,
      model: 'hash-deterministic-v1',
      source: 'hash-fallback',
      text_length: text.length,
    });
  } catch (error) {
    console.error('[EmbeddingService] Error generating embedding:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// Batch embed endpoint
app.post('/embed/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const { texts, model } = req.body;

    if (!texts || !Array.isArray(texts)) {
      res.status(400).json({ error: 'texts array is required' });
      return;
    }

    const useModel = model || DEFAULT_MODEL;
    const embeddings: number[][] = [];
    let source = 'ollama';

    // Process each text (Ollama embed API handles one at a time)
    for (const text of texts) {
      const ollamaResult = await ollamaEmbed(text, useModel);
      if (ollamaResult) {
        ollamaAvailable = true;
        embeddings.push(ollamaResult);
      } else {
        ollamaAvailable = false;
        source = 'hash-fallback';
        embeddings.push(hashEmbedding(text, DEFAULT_DIMENSION));
      }
    }

    res.json({
      embeddings,
      dimension: embeddings[0]?.length || DEFAULT_DIMENSION,
      model: source === 'ollama' ? useModel : 'hash-deterministic-v1',
      source,
      count: texts.length,
    });
  } catch (error) {
    console.error('[EmbeddingService] Error generating batch embeddings:', error);
    res.status(500).json({ error: 'Failed to generate embeddings' });
  }
});

app.listen(PORT, () => {
  console.log(`[EmbeddingService] Running on port ${PORT}`);
  console.log(`[EmbeddingService] Ollama host: ${OLLAMA_HOST}`);
  console.log(`[EmbeddingService] Default model: ${DEFAULT_MODEL}`);
  console.log(`[EmbeddingService] Health check: http://localhost:${PORT}/health`);
});

export default app;
