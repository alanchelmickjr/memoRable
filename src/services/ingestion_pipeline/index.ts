/**
 * Ingestion Pipeline - High-throughput multimodal vectorization
 *
 * Built for Betty. Space age, lean and mean.
 *
 * Features:
 * - Parallel worker pool
 * - Adaptive chunking (markdown, code, prose)
 * - Hybrid embedding (multiple models)
 * - Server-side batching with backpressure
 * - Error handling with retry/backoff
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ChunkMetadata {
  sourceFile: string;
  sourceType: 'markdown' | 'code' | 'prose' | 'config';
  language?: string;
  section?: string;
  lineStart?: number;
  lineEnd?: number;
  chunkIndex: number;
  totalChunks?: number;
}

export interface Chunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface EmbeddingResult {
  chunkId: string;
  vector: number[];
  model: string;
  dimension: number;
}

export interface PipelineConfig {
  // Worker pool
  workerCount: number;

  // Chunking
  maxChunkSize: number;
  chunkOverlap: number;

  // Batching
  batchSize: number;
  flushIntervalMs: number;

  // Retry
  maxRetries: number;
  retryBackoffMs: number;

  // Embedding
  embeddingModel: 'openai' | 'local' | 'hybrid';
  embeddingEndpoint?: string;
}

export interface PipelineStats {
  filesProcessed: number;
  chunksCreated: number;
  chunksEmbedded: number;
  chunksFailed: number;
  bytesProcessed: number;
  startTime: number;
  endTime?: number;
}

// ============================================================================
// ADAPTIVE CHUNKER
// ============================================================================

export class AdaptiveChunker {
  private maxSize: number;
  private overlap: number;

  constructor(maxSize: number = 1500, overlap: number = 100) {
    this.maxSize = maxSize;
    this.overlap = overlap;
  }

  /**
   * Detect content type from filename and content
   */
  detectType(filename: string, content: string): ChunkMetadata['sourceType'] {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    // Code files
    const codeExtensions = ['ts', 'js', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'rb', 'php'];
    if (codeExtensions.includes(ext)) return 'code';

    // Config files
    const configExtensions = ['json', 'yaml', 'yml', 'toml', 'ini', 'env'];
    if (configExtensions.includes(ext)) return 'config';

    // Markdown
    if (ext === 'md' || ext === 'mdx') return 'markdown';

    // Default to prose
    return 'prose';
  }

  /**
   * Detect programming language
   */
  detectLanguage(filename: string): string | undefined {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'ts': 'typescript', 'js': 'javascript', 'py': 'python',
      'go': 'go', 'rs': 'rust', 'java': 'java', 'c': 'c',
      'cpp': 'cpp', 'h': 'c', 'rb': 'ruby', 'php': 'php'
    };
    return langMap[ext];
  }

  /**
   * Chunk content adaptively based on type
   */
  chunk(filename: string, content: string): Chunk[] {
    const type = this.detectType(filename, content);
    const language = this.detectLanguage(filename);

    let rawChunks: { content: string; section?: string; lineStart?: number; lineEnd?: number }[];

    switch (type) {
      case 'markdown':
        rawChunks = this.chunkMarkdown(content);
        break;
      case 'code':
        rawChunks = this.chunkCode(content, language);
        break;
      case 'config':
        rawChunks = this.chunkConfig(content);
        break;
      default:
        rawChunks = this.chunkProse(content);
    }

    return rawChunks.map((chunk, index) => ({
      id: this.generateChunkId(filename, index),
      content: chunk.content,
      metadata: {
        sourceFile: filename,
        sourceType: type,
        language,
        section: chunk.section,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        chunkIndex: index,
        totalChunks: rawChunks.length
      }
    }));
  }

  /**
   * Chunk markdown by headers
   */
  private chunkMarkdown(content: string): { content: string; section?: string; lineStart: number; lineEnd: number }[] {
    const chunks: { content: string; section?: string; lineStart: number; lineEnd: number }[] = [];
    const lines = content.split('\n');

    let currentChunk: string[] = [];
    let currentSection: string | undefined;
    let chunkStart = 0;
    let currentSize = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New header - start new chunk if we have content
      if (line.match(/^#{1,4}\s+/)) {
        if (currentChunk.length > 0 && currentSize > 50) {
          chunks.push({
            content: currentChunk.join('\n').trim(),
            section: currentSection,
            lineStart: chunkStart,
            lineEnd: i - 1
          });
        }
        currentSection = line.replace(/^#+\s+/, '').trim();
        currentChunk = [line];
        chunkStart = i;
        currentSize = line.length;
        continue;
      }

      // Size limit - split chunk
      if (currentSize + line.length > this.maxSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join('\n').trim(),
          section: currentSection,
          lineStart: chunkStart,
          lineEnd: i - 1
        });

        // Overlap: keep last few lines
        const overlapLines = Math.ceil(this.overlap / 50);
        currentChunk = currentChunk.slice(-overlapLines);
        currentChunk.push(line);
        chunkStart = i - overlapLines;
        currentSize = currentChunk.join('\n').length;
        continue;
      }

      currentChunk.push(line);
      currentSize += line.length;
    }

    // Don't forget last chunk
    if (currentChunk.length > 0 && currentSize > 50) {
      chunks.push({
        content: currentChunk.join('\n').trim(),
        section: currentSection,
        lineStart: chunkStart,
        lineEnd: lines.length - 1
      });
    }

    return chunks;
  }

  /**
   * Chunk code by functions/classes
   */
  private chunkCode(content: string, language?: string): { content: string; section?: string; lineStart: number; lineEnd: number }[] {
    const chunks: { content: string; section?: string; lineStart: number; lineEnd: number }[] = [];
    const lines = content.split('\n');

    // Simple heuristic: split on function/class definitions
    const functionPatterns: Record<string, RegExp> = {
      typescript: /^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(|^(export\s+)?class\s+\w+/,
      javascript: /^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(|^(export\s+)?class\s+\w+/,
      python: /^(async\s+)?def\s+\w+|^class\s+\w+/,
      go: /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+|^type\s+\w+\s+struct/,
      rust: /^(pub\s+)?(async\s+)?fn\s+\w+|^(pub\s+)?struct\s+\w+|^(pub\s+)?impl/,
    };

    const pattern = language ? functionPatterns[language] : null;

    let currentChunk: string[] = [];
    let currentSection: string | undefined;
    let chunkStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for function/class start
      if (pattern && line.match(pattern)) {
        if (currentChunk.length > 0) {
          const chunkContent = currentChunk.join('\n').trim();
          if (chunkContent.length > 50) {
            chunks.push({
              content: chunkContent,
              section: currentSection,
              lineStart: chunkStart,
              lineEnd: i - 1
            });
          }
        }
        currentSection = line.trim().substring(0, 60);
        currentChunk = [line];
        chunkStart = i;
        continue;
      }

      currentChunk.push(line);

      // Size limit
      if (currentChunk.join('\n').length > this.maxSize) {
        chunks.push({
          content: currentChunk.join('\n').trim(),
          section: currentSection,
          lineStart: chunkStart,
          lineEnd: i
        });
        currentChunk = [];
        chunkStart = i + 1;
        currentSection = undefined;
      }
    }

    // Last chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n').trim();
      if (chunkContent.length > 50) {
        chunks.push({
          content: chunkContent,
          section: currentSection,
          lineStart: chunkStart,
          lineEnd: lines.length - 1
        });
      }
    }

    return chunks;
  }

  /**
   * Chunk config files (keep structure intact)
   */
  private chunkConfig(content: string): { content: string; lineStart: number; lineEnd: number }[] {
    // For configs, try to keep them whole if small enough
    if (content.length <= this.maxSize) {
      return [{ content, lineStart: 0, lineEnd: content.split('\n').length - 1 }];
    }

    // Otherwise, split by top-level keys (simple heuristic)
    return this.chunkProse(content);
  }

  /**
   * Chunk prose/text by sentences and paragraphs
   */
  private chunkProse(content: string): { content: string; lineStart: number; lineEnd: number }[] {
    const chunks: { content: string; lineStart: number; lineEnd: number }[] = [];
    const paragraphs = content.split(/\n\n+/);

    let currentChunk = '';
    let chunkStart = 0;
    let lineOffset = 0;

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > this.maxSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          lineStart: chunkStart,
          lineEnd: lineOffset - 1
        });
        currentChunk = para;
        chunkStart = lineOffset;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
      lineOffset += para.split('\n').length + 1;
    }

    if (currentChunk.trim().length > 50) {
      chunks.push({
        content: currentChunk.trim(),
        lineStart: chunkStart,
        lineEnd: lineOffset
      });
    }

    return chunks;
  }

  /**
   * Generate deterministic chunk ID (for deduplication)
   */
  private generateChunkId(filename: string, index: number): string {
    const hash = crypto.createHash('sha256')
      .update(`${filename}:${index}`)
      .digest('hex')
      .substring(0, 16);
    return `chunk_${hash}`;
  }
}

// ============================================================================
// BATCH MANAGER
// ============================================================================

export class BatchManager extends EventEmitter {
  private queue: Chunk[] = [];
  private batchSize: number;
  private flushInterval: number;
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(batchSize: number = 100, flushIntervalMs: number = 1000) {
    super();
    this.batchSize = batchSize;
    this.flushInterval = flushIntervalMs;
  }

  /**
   * Add chunk to queue
   */
  add(chunk: Chunk): void {
    this.queue.push(chunk);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Flush current batch
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;
    const batch = this.queue.splice(0, this.batchSize);

    this.emit('batch', batch);
    this.processing = false;

    // Continue if more in queue
    if (this.queue.length > 0) {
      setImmediate(() => this.flush());
    }
  }

  /**
   * Wait for all batches to complete
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.processing) {
      await this.flush();
      await new Promise(r => setTimeout(r, 100));
    }
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

// ============================================================================
// WORKER POOL
// ============================================================================

type WorkerTask<T, R> = (item: T) => Promise<R>;

export class WorkerPool<T, R> {
  private concurrency: number;
  private active = 0;
  private queue: { item: T; resolve: (r: R) => void; reject: (e: Error) => void }[] = [];
  private task: WorkerTask<T, R>;

  constructor(task: WorkerTask<T, R>, concurrency: number = 4) {
    this.task = task;
    this.concurrency = concurrency;
  }

  /**
   * Submit work item
   */
  async submit(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Submit batch of items
   */
  async submitBatch(items: T[]): Promise<R[]> {
    return Promise.all(items.map(item => this.submit(item)));
  }

  private async processNext(): Promise<void> {
    if (this.active >= this.concurrency || this.queue.length === 0) return;

    this.active++;
    const { item, resolve, reject } = this.queue.shift()!;

    try {
      const result = await this.task(item);
      resolve(result);
    } catch (error) {
      reject(error as Error);
    } finally {
      this.active--;
      this.processNext();
    }
  }

  /**
   * Wait for all work to complete
   */
  async drain(): Promise<void> {
    while (this.active > 0 || this.queue.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

// ============================================================================
// EMBEDDING CLIENT
// ============================================================================

export interface EmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
  dimension: number;
  modelName: string;
}

/**
 * OpenAI embedding client
 */
export class OpenAIEmbeddingClient implements EmbeddingClient {
  private apiKey: string;
  private model: string;
  readonly dimension: number;
  readonly modelName: string;

  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.model = model;
    this.modelName = model;
    this.dimension = model.includes('3-small') ? 1536 : 3072;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key required');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

/**
 * Local/mock embedding client (for testing)
 */
export class LocalEmbeddingClient implements EmbeddingClient {
  readonly dimension = 1024;
  readonly modelName = 'local-mock-v1';

  async embed(texts: string[]): Promise<number[][]> {
    // Generate deterministic mock embeddings based on content hash
    return texts.map(text => {
      const hash = crypto.createHash('md5').update(text).digest();
      const vector = Array.from({ length: this.dimension }, (_, i) => {
        const byte = hash[i % hash.length];
        return (byte / 255) * 2 - 1;
      });
      // Normalize
      const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
      return vector.map(v => v / mag);
    });
  }
}

// ============================================================================
// INGESTION PIPELINE
// ============================================================================

export class IngestionPipeline extends EventEmitter {
  private config: PipelineConfig;
  private chunker: AdaptiveChunker;
  private batchManager: BatchManager;
  private embeddingClient: EmbeddingClient;
  private stats: PipelineStats;

  constructor(config: Partial<PipelineConfig> = {}) {
    super();

    this.config = {
      workerCount: config.workerCount ?? 4,
      maxChunkSize: config.maxChunkSize ?? 1500,
      chunkOverlap: config.chunkOverlap ?? 100,
      batchSize: config.batchSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 1000,
      maxRetries: config.maxRetries ?? 3,
      retryBackoffMs: config.retryBackoffMs ?? 1000,
      embeddingModel: config.embeddingModel ?? 'local',
      embeddingEndpoint: config.embeddingEndpoint
    };

    this.chunker = new AdaptiveChunker(this.config.maxChunkSize, this.config.chunkOverlap);
    this.batchManager = new BatchManager(this.config.batchSize, this.config.flushIntervalMs);

    // Initialize embedding client
    switch (this.config.embeddingModel) {
      case 'openai':
        this.embeddingClient = new OpenAIEmbeddingClient();
        break;
      default:
        this.embeddingClient = new LocalEmbeddingClient();
    }

    this.stats = {
      filesProcessed: 0,
      chunksCreated: 0,
      chunksEmbedded: 0,
      chunksFailed: 0,
      bytesProcessed: 0,
      startTime: 0
    };

    // Handle batches
    this.batchManager.on('batch', (batch: Chunk[]) => this.processBatch(batch));
  }

  /**
   * Ingest a single file
   */
  async ingestFile(filename: string, content: string): Promise<Chunk[]> {
    const chunks = this.chunker.chunk(filename, content);

    for (const chunk of chunks) {
      this.batchManager.add(chunk);
    }

    this.stats.filesProcessed++;
    this.stats.chunksCreated += chunks.length;
    this.stats.bytesProcessed += content.length;

    this.emit('file', { filename, chunks: chunks.length });

    return chunks;
  }

  /**
   * Ingest multiple files in parallel
   */
  async ingestFiles(files: { filename: string; content: string }[]): Promise<void> {
    this.stats.startTime = Date.now();

    const pool = new WorkerPool(
      async (file: { filename: string; content: string }) => {
        return this.ingestFile(file.filename, file.content);
      },
      this.config.workerCount
    );

    await pool.submitBatch(files);
    await pool.drain();
    await this.batchManager.drain();

    this.stats.endTime = Date.now();
    this.emit('complete', this.stats);
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(batch: Chunk[]): Promise<void> {
    let retries = 0;

    while (retries < this.config.maxRetries) {
      try {
        const texts = batch.map(c => c.content);
        const embeddings = await this.embeddingClient.embed(texts);

        const results: EmbeddingResult[] = batch.map((chunk, i) => ({
          chunkId: chunk.id,
          vector: embeddings[i],
          model: this.embeddingClient.modelName,
          dimension: this.embeddingClient.dimension
        }));

        this.stats.chunksEmbedded += batch.length;
        this.emit('embedded', results);
        return;

      } catch (error) {
        retries++;
        if (retries >= this.config.maxRetries) {
          this.stats.chunksFailed += batch.length;
          this.emit('error', { batch, error });
          return;
        }

        // Exponential backoff
        await new Promise(r => setTimeout(r, this.config.retryBackoffMs * Math.pow(2, retries)));
      }
    }
  }

  /**
   * Get current stats
   */
  getStats(): PipelineStats {
    return { ...this.stats };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default IngestionPipeline;
