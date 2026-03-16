/**
 * Client for interacting with the Embedding Service.
 * Calls the real embedding service over HTTP.
 */

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://embedding_service:3003';

export class EmbeddingServiceClient {
  private baseUrl: string;
  private logger: Console;

  constructor(baseUrl?: string, loggerInstance?: Console) {
    this.baseUrl = baseUrl || EMBEDDING_SERVICE_URL;
    this.logger = loggerInstance || console;
    this.logger.info(`EmbeddingServiceClient initialized for URL: ${this.baseUrl}`);
  }

  /**
   * Generate an embedding vector for narrative text.
   * Returns null if the embedding service is unreachable.
   */
  async generateEmbedding(narrativeText: string): Promise<number[] | null> {
    if (!narrativeText || narrativeText.trim() === '') {
      this.logger.warn('EmbeddingServiceClient: empty text, skipping embedding');
      return null;
    }

    this.logger.info(`EmbeddingServiceClient: requesting embedding for ${narrativeText.length} chars`);

    try {
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: narrativeText }),
        signal: AbortSignal.timeout(parseInt(process.env.EMBEDDING_TIMEOUT_MS || '30000', 10)),
      });

      if (!response.ok) {
        this.logger.error(`EmbeddingServiceClient: service returned ${response.status}: ${await response.text()}`);
        return null;
      }

      const data = await response.json() as { embedding?: number[]; source?: string };

      if (data.embedding && Array.isArray(data.embedding)) {
        this.logger.info(`EmbeddingServiceClient: received ${data.embedding.length}-dim vector (source: ${data.source || 'unknown'})`);
        return data.embedding;
      }

      this.logger.error('EmbeddingServiceClient: response missing embedding field');
      return null;
    } catch (error) {
      this.logger.error(`EmbeddingServiceClient: error calling embedding service at ${this.baseUrl}:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async generateBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!texts || texts.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/embed/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(parseInt(process.env.EMBEDDING_TIMEOUT_MS || '30000', 10) * texts.length),
      });

      if (!response.ok) {
        this.logger.error(`EmbeddingServiceClient: batch request returned ${response.status}`);
        return texts.map(() => null);
      }

      const data = await response.json() as { embeddings?: number[][] };
      if (data.embeddings && Array.isArray(data.embeddings)) {
        return data.embeddings;
      }

      return texts.map(() => null);
    } catch (error) {
      this.logger.error('EmbeddingServiceClient: batch embedding failed:', (error as Error).message);
      return texts.map(() => null);
    }
  }
}
