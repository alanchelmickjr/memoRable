/**
 * Weaviate Sink - Stores embedded chunks in Weaviate
 *
 * Uses server-side batching with backpressure for optimal throughput.
 * Deterministic UUIDs prevent duplicates on re-index.
 */

import weaviate, { WeaviateClient, ApiKey } from 'weaviate-client';
import * as crypto from 'crypto';
import { Chunk, EmbeddingResult, ChunkMetadata } from './index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WeaviateSinkConfig {
  url: string;
  apiKey?: string;
  className: string;
  batchSize: number;
  retries: number;
}

export interface StoredChunk {
  id: string;
  weaviateId: string;
  success: boolean;
  error?: string;
}

// ============================================================================
// SCHEMA
// ============================================================================

const DOCUMENT_SCHEMA = {
  class: 'Document',
  description: 'Indexed document chunks for semantic search',
  vectorizer: 'none', // We provide our own vectors
  properties: [
    {
      name: 'content',
      dataType: ['text'],
      description: 'Chunk content',
      tokenization: 'word'
    },
    {
      name: 'sourceFile',
      dataType: ['string'],
      description: 'Source file path',
      indexFilterable: true,
      indexSearchable: true
    },
    {
      name: 'sourceType',
      dataType: ['string'],
      description: 'Content type: markdown, code, prose, config',
      indexFilterable: true
    },
    {
      name: 'language',
      dataType: ['string'],
      description: 'Programming language (for code)',
      indexFilterable: true
    },
    {
      name: 'section',
      dataType: ['string'],
      description: 'Section header or function name',
      indexSearchable: true
    },
    {
      name: 'lineStart',
      dataType: ['int'],
      description: 'Starting line number'
    },
    {
      name: 'lineEnd',
      dataType: ['int'],
      description: 'Ending line number'
    },
    {
      name: 'chunkIndex',
      dataType: ['int'],
      description: 'Chunk index within file'
    },
    {
      name: 'totalChunks',
      dataType: ['int'],
      description: 'Total chunks in file'
    },
    {
      name: 'embeddingModel',
      dataType: ['string'],
      description: 'Model used for embedding',
      indexFilterable: true
    },
    {
      name: 'indexedAt',
      dataType: ['date'],
      description: 'When this chunk was indexed'
    },
    {
      name: 'project',
      dataType: ['string'],
      description: 'Project identifier',
      indexFilterable: true
    }
  ],
  vectorIndexConfig: {
    distance: 'cosine',
    ef: 256,
    efConstruction: 128,
    maxConnections: 64
  }
};

// ============================================================================
// WEAVIATE SINK
// ============================================================================

export class WeaviateSink {
  private client: WeaviateClient | null = null;
  private config: WeaviateSinkConfig;
  private project: string;

  constructor(config: Partial<WeaviateSinkConfig> = {}, project: string = 'default') {
    this.config = {
      url: config.url || process.env.WEAVIATE_URL || 'http://localhost:8080',
      apiKey: config.apiKey || process.env.WEAVIATE_API_KEY,
      className: config.className || 'Document',
      batchSize: config.batchSize || 100,
      retries: config.retries || 3
    };
    this.project = project;
  }

  /**
   * Connect to Weaviate
   */
  async connect(): Promise<void> {
    const urlObj = new URL(this.config.url);

    this.client = await weaviate.connectToCustom({
      httpHost: urlObj.hostname,
      httpPort: parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80),
      httpSecure: urlObj.protocol === 'https:',
      grpcHost: urlObj.hostname,
      grpcPort: 50051,
      grpcSecure: urlObj.protocol === 'https:',
      authCredentials: this.config.apiKey ? new ApiKey(this.config.apiKey) : undefined
    });

    // Ensure schema exists
    await this.ensureSchema();

    console.log(`[WeaviateSink] Connected to ${this.config.url}`);
  }

  /**
   * Ensure document schema exists
   */
  private async ensureSchema(): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    try {
      const exists = await this.client.collections.exists(this.config.className);
      if (!exists) {
        await this.client.collections.create(DOCUMENT_SCHEMA as any);
        console.log(`[WeaviateSink] Created collection: ${this.config.className}`);
      }
    } catch (error: any) {
      // Collection might already exist
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Generate deterministic UUID for chunk (prevents duplicates)
   */
  private generateUUID(chunk: Chunk): string {
    const input = `${this.project}:${chunk.metadata.sourceFile}:${chunk.metadata.chunkIndex}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    // Format as UUID v5 style
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '5' + hash.substring(13, 16), // Version 5
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
      hash.substring(20, 32)
    ].join('-');
  }

  /**
   * Store batch of embedded chunks
   */
  async storeBatch(
    chunks: Chunk[],
    embeddings: EmbeddingResult[]
  ): Promise<StoredChunk[]> {
    if (!this.client) throw new Error('Not connected');

    const collection = this.client.collections.get(this.config.className);
    const results: StoredChunk[] = [];

    // Build objects for batch insert
    const objects = chunks.map((chunk, i) => {
      const embedding = embeddings.find(e => e.chunkId === chunk.id);
      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${chunk.id}`);
      }

      return {
        uuid: this.generateUUID(chunk),
        properties: {
          content: chunk.content,
          sourceFile: chunk.metadata.sourceFile,
          sourceType: chunk.metadata.sourceType,
          language: chunk.metadata.language || '',
          section: chunk.metadata.section || '',
          lineStart: chunk.metadata.lineStart || 0,
          lineEnd: chunk.metadata.lineEnd || 0,
          chunkIndex: chunk.metadata.chunkIndex,
          totalChunks: chunk.metadata.totalChunks || 1,
          embeddingModel: embedding.model,
          indexedAt: new Date().toISOString(),
          project: this.project
        },
        vector: embedding.vector
      };
    });

    // Batch insert with error handling
    try {
      const response = await collection.data.insertMany(objects as any);

      // Map results
      for (let i = 0; i < chunks.length; i++) {
        const hasError = response.hasErrors && response.errors?.[i];
        results.push({
          id: chunks[i].id,
          weaviateId: objects[i].uuid,
          success: !hasError,
          error: hasError ? String(response.errors?.[i]) : undefined
        });
      }
    } catch (error: any) {
      // All failed
      for (const chunk of chunks) {
        results.push({
          id: chunk.id,
          weaviateId: '',
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Search for similar chunks
   */
  async search(
    query: string | number[],
    limit: number = 10,
    filters?: { sourceType?: string; project?: string; sourceFile?: string }
  ): Promise<{ chunk: Partial<Chunk>; score: number }[]> {
    if (!this.client) throw new Error('Not connected');

    const collection = this.client.collections.get(this.config.className);

    // Build filter
    let filter: any = undefined;
    if (filters) {
      const conditions: any[] = [];
      if (filters.sourceType) {
        conditions.push({ path: ['sourceType'], operator: 'Equal', valueText: filters.sourceType });
      }
      if (filters.project) {
        conditions.push({ path: ['project'], operator: 'Equal', valueText: filters.project });
      }
      if (filters.sourceFile) {
        conditions.push({ path: ['sourceFile'], operator: 'Like', valueText: `*${filters.sourceFile}*` });
      }
      if (conditions.length > 0) {
        filter = conditions.length === 1 ? conditions[0] : { operator: 'And', operands: conditions };
      }
    }

    // Query
    let results: any;
    if (typeof query === 'string') {
      // Text search (requires vectorizer or hybrid)
      results = await collection.query.hybrid(query, {
        limit,
        filters: filter,
        returnMetadata: ['score']
      });
    } else {
      // Vector search
      results = await collection.query.nearVector(query, {
        limit,
        filters: filter,
        returnMetadata: ['distance']
      });
    }

    return results.objects.map((obj: any) => ({
      chunk: {
        id: obj.uuid,
        content: obj.properties.content,
        metadata: {
          sourceFile: obj.properties.sourceFile,
          sourceType: obj.properties.sourceType,
          language: obj.properties.language,
          section: obj.properties.section,
          lineStart: obj.properties.lineStart,
          lineEnd: obj.properties.lineEnd,
          chunkIndex: obj.properties.chunkIndex,
          totalChunks: obj.properties.totalChunks
        }
      },
      score: obj.metadata?.score || (1 - (obj.metadata?.distance || 0))
    }));
  }

  /**
   * Delete all chunks for a project
   */
  async deleteProject(project: string): Promise<number> {
    if (!this.client) throw new Error('Not connected');

    const collection = this.client.collections.get(this.config.className);

    const result = await collection.data.deleteMany({
      where: {
        path: ['project'],
        operator: 'Equal',
        valueText: project
      }
    });

    return result.successful || 0;
  }

  /**
   * Get stats for a project
   */
  async getProjectStats(project: string): Promise<{ count: number; files: string[] }> {
    if (!this.client) throw new Error('Not connected');

    const collection = this.client.collections.get(this.config.className);

    // Count
    const countResult = await collection.aggregate.overAll({
      filters: {
        path: ['project'],
        operator: 'Equal',
        valueText: project
      }
    });

    // Unique files (aggregate)
    const filesResult = await collection.aggregate.overAll({
      filters: {
        path: ['project'],
        operator: 'Equal',
        valueText: project
      },
      groupBy: {
        property: 'sourceFile'
      }
    });

    return {
      count: countResult.totalCount || 0,
      files: (filesResult as any).groups?.map((g: any) => g.groupedBy.value) || []
    };
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log('[WeaviateSink] Disconnected');
    }
  }
}

export default WeaviateSink;
