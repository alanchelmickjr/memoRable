/**
 * Retrieval Service - Retrieves and ranks memories from MongoDB.
 * Uses MongoDB text search + salience scoring for ranked retrieval.
 * Supports MongoDB Atlas $vectorSearch when vector index is available.
 */

import express, { Application, Request, Response } from 'express';
import { MongoClient, Db } from 'mongodb';

const app: Application = express();
const PORT = process.env.RETRIEVAL_SERVICE_PORT || process.env.PORT || 3004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable';
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3003';

let db: Db | null = null;

async function getDb(): Promise<Db> {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log('[RetrievalService] Connected to MongoDB');
  return db;
}

/**
 * Get embedding vector for a query from the embedding service.
 */
async function getQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(parseInt(process.env.EMBEDDING_TIMEOUT_MS || '30000', 10)),
    });

    if (!response.ok) return null;
    const data = await response.json() as { embedding?: number[] };
    return data.embedding || null;
  } catch (error) {
    console.warn('[RetrievalService] Embedding service unavailable:', (error as Error).message);
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

app.use(express.json());

// Health check endpoint
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  let dbStatus = 'disconnected';
  try {
    const database = await getDb();
    await database.command({ ping: 1 });
    dbStatus = 'connected';
  } catch { /* db not ready */ }

  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    service: 'retrieval_service',
    database: dbStatus,
    embeddingService: EMBEDDING_SERVICE_URL,
    timestamp: new Date().toISOString(),
  });
});

// Retrieve memories endpoint
app.post('/retrieve', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, userId, limit = 10, minSalience = 0 } = req.body;

    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const database = await getDb();
    const collection = database.collection('memories');

    // Build base filter
    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (minSalience > 0) filter.salienceScore = { $gte: minSalience };

    // Strategy 1: Try MongoDB Atlas $vectorSearch if we can get embeddings
    const queryVector = await getQueryEmbedding(query);
    if (queryVector) {
      try {
        const pipeline = [
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector,
              numCandidates: limit * 10,
              limit: limit * 3,
              filter: Object.keys(filter).length > 0 ? filter : undefined,
            },
          },
          {
            $addFields: {
              vectorScore: { $meta: 'vectorSearchScore' },
            },
          },
        ];

        const vectorResults = await collection.aggregate(pipeline).toArray();

        if (vectorResults.length > 0) {
          // Combine vector similarity with salience for final ranking
          const scored = vectorResults.map((m: Record<string, unknown>) => {
            const salience = ((m.salienceScore as number) || 50) / 100;
            const vectorSim = (m.vectorScore as number) || 0;
            const retrievalScore = vectorSim * 0.6 + salience * 0.4;

            return {
              id: (m.memoryId || m._id?.toString() || m.mementoId) as string,
              content: m.text || m.content,
              salience: (m.salienceScore as number) || 50,
              similarity: vectorSim,
              retrievalScore,
              timestamp: m.createdAt || m.eventTimestamp,
              userId: (m.userId as string) || 'default',
              source: 'vector_search',
            };
          });

          scored.sort((a, b) => b.retrievalScore - a.retrievalScore);

          res.json({
            results: scored.slice(0, limit),
            query,
            count: Math.min(scored.length, limit),
            limit,
            searchMethod: 'vector',
          });
          return;
        }
      } catch (vectorErr) {
        // Vector index may not exist — fall through to text search
        console.warn('[RetrievalService] Vector search unavailable, falling back to text search:', (vectorErr as Error).message);
      }
    }

    // Strategy 2: MongoDB text search with regex
    const searchTerms = query.split(/\s+/).filter(Boolean);
    const searchRegex = new RegExp(searchTerms.join('|'), 'i');

    const textFilter = {
      ...filter,
      $or: [
        { text: { $regex: searchRegex } },
        { content: { $regex: searchRegex } },
        { 'extractedFeatures.topics': { $regex: searchRegex } },
        { 'extractedFeatures.peopleMentioned': { $regex: searchRegex } },
      ],
    };

    const memories = await collection
      .find(textFilter)
      .sort({ salienceScore: -1, createdAt: -1 })
      .limit(limit * 3)
      .toArray();

    // Score results: compute text match quality + salience
    const scored = memories.map((m: Record<string, unknown>) => {
      const text = ((m.text || m.content || '') as string).toLowerCase();
      const matchedTerms = searchTerms.filter(t => text.includes(t.toLowerCase()));
      const textMatchRatio = searchTerms.length > 0 ? matchedTerms.length / searchTerms.length : 0;
      const salience = ((m.salienceScore as number) || 50) / 100;
      const retrievalScore = textMatchRatio * 0.6 + salience * 0.4;

      // If we have both query and doc embeddings, compute real similarity
      let similarity = textMatchRatio;
      if (queryVector && Array.isArray(m.embedding)) {
        similarity = cosineSimilarity(queryVector, m.embedding as number[]);
      }

      return {
        id: (m.memoryId || m._id?.toString() || m.mementoId) as string,
        content: m.text || m.content,
        salience: (m.salienceScore as number) || 50,
        similarity,
        retrievalScore,
        timestamp: m.createdAt || m.eventTimestamp,
        userId: (m.userId as string) || 'default',
        source: queryVector && Array.isArray(m.embedding) ? 'cosine_similarity' : 'text_match',
      };
    });

    scored.sort((a, b) => b.retrievalScore - a.retrievalScore);

    res.json({
      results: scored.slice(0, limit),
      query,
      count: Math.min(scored.length, limit),
      limit,
      searchMethod: queryVector ? 'text_with_cosine' : 'text_match',
    });
  } catch (error) {
    console.error('[RetrievalService] Error retrieving memories:', error);
    res.status(500).json({ error: 'Failed to retrieve memories' });
  }
});

// Retrieve by ID endpoint
app.get('/retrieve/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const database = await getDb();
    const collection = database.collection('memories');

    const memory = await collection.findOne({
      $or: [{ memoryId: id }, { mementoId: id }],
    });

    if (!memory) {
      res.status(404).json({ error: `Memory not found: ${id}` });
      return;
    }

    res.json({
      id: memory.memoryId || memory._id?.toString() || memory.mementoId,
      content: memory.text || memory.content,
      salience: memory.salienceScore || 0,
      timestamp: memory.createdAt || memory.eventTimestamp,
      metadata: {
        topics: memory.extractedFeatures?.topics,
        peopleMentioned: memory.extractedFeatures?.peopleMentioned,
        hasOpenLoops: memory.hasOpenLoops,
        securityTier: memory.securityTier,
      },
    });
  } catch (error) {
    console.error('[RetrievalService] Error retrieving memory by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve memory' });
  }
});

// Similar memories endpoint
app.post('/similar', async (req: Request, res: Response): Promise<void> => {
  try {
    const { memoryId, limit = 5, userId } = req.body;

    if (!memoryId) {
      res.status(400).json({ error: 'memoryId is required' });
      return;
    }

    const database = await getDb();
    const collection = database.collection('memories');

    // Find the source memory
    const sourceMemory = await collection.findOne({
      $or: [{ memoryId }, { mementoId: memoryId }],
    });

    if (!sourceMemory) {
      res.status(404).json({ error: `Source memory not found: ${memoryId}` });
      return;
    }

    // If source has embedding, find similar by vector
    if (Array.isArray(sourceMemory.embedding) && sourceMemory.embedding.length > 0) {
      try {
        const pipeline = [
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: sourceMemory.embedding,
              numCandidates: limit * 10,
              limit: limit + 1, // +1 because source will match itself
              filter: userId ? { userId } : undefined,
            },
          },
          {
            $addFields: {
              vectorScore: { $meta: 'vectorSearchScore' },
            },
          },
        ];

        const results = await collection.aggregate(pipeline).toArray();
        const filtered = results
          .filter(m => (m.memoryId || m._id?.toString()) !== (sourceMemory.memoryId || sourceMemory._id?.toString()))
          .slice(0, limit)
          .map(m => ({
            id: m.memoryId || m._id?.toString() || m.mementoId,
            content: m.text || m.content,
            similarity: m.vectorScore,
            salience: m.salienceScore || 0,
          }));

        res.json({ sourceId: memoryId, similar: filtered, count: filtered.length, method: 'vector' });
        return;
      } catch {
        // Fall through to topic-based similarity
      }
    }

    // Fallback: find similar by shared topics/entities
    const topics = sourceMemory.extractedFeatures?.topics || [];
    const people = sourceMemory.extractedFeatures?.peopleMentioned || [];
    const searchTerms = [...topics, ...people].filter(Boolean);

    if (searchTerms.length === 0) {
      res.json({ sourceId: memoryId, similar: [], count: 0, method: 'no_features' });
      return;
    }

    const searchRegex = new RegExp(searchTerms.join('|'), 'i');
    const similarFilter: Record<string, unknown> = {
      $or: [
        { 'extractedFeatures.topics': { $regex: searchRegex } },
        { 'extractedFeatures.peopleMentioned': { $regex: searchRegex } },
      ],
      memoryId: { $ne: sourceMemory.memoryId },
      mementoId: { $ne: sourceMemory.mementoId },
    };
    if (userId) similarFilter.userId = userId;

    const similar = await collection
      .find(similarFilter)
      .sort({ salienceScore: -1 })
      .limit(limit)
      .toArray();

    const mapped = similar.map(m => {
      // Compute Jaccard similarity on shared topics
      const mTopics = m.extractedFeatures?.topics || [];
      const intersection = topics.filter((t: string) => mTopics.includes(t));
      const union = new Set([...topics, ...mTopics]);
      const similarity = union.size > 0 ? intersection.length / union.size : 0;

      return {
        id: m.memoryId || m._id?.toString() || m.mementoId,
        content: m.text || m.content,
        similarity,
        salience: m.salienceScore || 0,
      };
    });

    res.json({ sourceId: memoryId, similar: mapped, count: mapped.length, method: 'topic_jaccard' });
  } catch (error) {
    console.error('[RetrievalService] Error finding similar memories:', error);
    res.status(500).json({ error: 'Failed to find similar memories' });
  }
});

app.listen(PORT, () => {
  console.log(`[RetrievalService] Running on port ${PORT}`);
  console.log(`[RetrievalService] MongoDB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`[RetrievalService] Health check: http://localhost:${PORT}/health`);
});

export default app;
