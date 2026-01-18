import weaviate from 'weaviate-client';
import { logger } from '../utils/logger.js';

let client = null;

export async function setupWeaviate() {
  try {
    const url = process.env.WEAVIATE_URL;
    const apiKey = process.env.WEAVIATE_API_KEY;

    if (!url) {
      throw new Error('WEAVIATE_URL environment variable is not set');
    }

    client = weaviate.client({
      scheme: url.startsWith('https') ? 'https' : 'http',
      host: url.replace(/(^\w+:|^)\/\//, ''), // Remove protocol
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    });

    // Initialize schema
    await initializeSchema();
    logger.info('Successfully connected to Weaviate');

    return client;
  } catch (error) {
    logger.error('Weaviate connection error:', error);
    throw error;
  }
}

async function initializeSchema() {
  try {
    // Define schema for emotional vectors
    await createSchemaClass('EmotionalVector', {
      class: 'EmotionalVector',
      description: 'Stores emotional vector embeddings',
      vectorizer: 'none', // We'll provide our own vectors
      properties: [
        {
          name: 'vector',
          dataType: ['number[]'],
          description: '83-dimensional emotional vector',
        },
        {
          name: 'timestamp',
          dataType: ['date'],
          description: 'When this emotional vector was recorded',
        },
        {
          name: 'source',
          dataType: ['string'],
          description: 'Source of the emotional data',
        }
      ],
    });

    // Define schema for memory embeddings
    await createSchemaClass('MemoryEmbedding', {
      class: 'MemoryEmbedding',
      description: 'Stores memory embeddings',
      vectorizer: 'none',
      properties: [
        {
          name: 'vector',
          dataType: ['number[]'],
          description: 'Memory embedding vector',
        },
        {
          name: 'context',
          dataType: ['string'],
          description: 'Context of the memory',
        },
        {
          name: 'timestamp',
          dataType: ['date'],
          description: 'When this memory was created',
        },
        {
          name: 'type',
          dataType: ['string'],
          description: 'Type of memory (text, vision, audio, etc.)',
        }
      ],
    });

    // Define schema for predictive memory system
    // Uses text2vec-openai for embeddings (1536 dimensions)
    await createSchemaClass('Memory', {
      class: 'Memory',
      description: 'Predictive memory system - stores memories with semantic embeddings',
      vectorizer: 'text2vec-openai',
      moduleConfig: {
        'text2vec-openai': {
          model: 'text-embedding-3-small',
          dimensions: 1536
        }
      },
      properties: [
        {
          name: 'content',
          dataType: ['text'],
          description: 'Memory content for vectorization',
          moduleConfig: {
            'text2vec-openai': {
              skip: false,
              vectorizePropertyName: false
            }
          },
          tokenization: 'word'
        },
        {
          name: 'userId',
          dataType: ['string'],
          description: 'User who owns this memory',
          indexFilterable: true,
          indexSearchable: false
        },
        {
          name: 'mongoId',
          dataType: ['string'],
          description: 'Reference to MongoDB document ID'
        },
        {
          name: 'importance',
          dataType: ['number'],
          description: 'Overall importance score (0.0-1.0)'
        },
        {
          name: 'tags',
          dataType: ['string[]'],
          description: 'Content tags for filtering',
          indexFilterable: true
        },
        {
          name: 'patternType',
          dataType: ['string'],
          description: 'Temporal pattern type (daily, weekly, tri_weekly, monthly)',
          indexFilterable: true
        },
        {
          name: 'tier',
          dataType: ['string'],
          description: 'Storage tier (hot, warm, cold)',
          indexFilterable: true
        },
        {
          name: 'createdAt',
          dataType: ['date'],
          description: 'Creation timestamp'
        },
        {
          name: 'lastAccessed',
          dataType: ['date'],
          description: 'Last access timestamp'
        }
      ],
      vectorIndexConfig: {
        distance: 'cosine',
        ef: 256,
        maxConnections: 64
      }
    });

    logger.info('Weaviate schema initialized');
  } catch (error) {
    logger.error('Failed to initialize Weaviate schema:', error);
    throw error;
  }
}

async function createSchemaClass(className, schema) {
  try {
    // Check if class exists
    const classExists = await client.schema
      .classGetter()
      .withClassName(className)
      .do();

    if (!classExists) {
      await client.schema
        .classCreator()
        .withClass(schema)
        .do();
      logger.info(`Created schema class: ${className}`);
    }
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }
}

export function getWeaviateClient() {
  if (!client) {
    throw new Error('Weaviate not initialized. Call setupWeaviate first.');
  }
  return client;
}

export async function closeWeaviate() {
  if (client) {
    client = null;
    logger.info('Weaviate connection closed');
  }
}