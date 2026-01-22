/**
 * Storage Sinks - Pluggable storage adapters
 *
 * Design: Each sink implements a simple interface.
 * Start small, compose as needed.
 */

import { Chunk } from './index.js';

// ============================================================================
// SINK INTERFACE
// ============================================================================

export interface StorageResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface Sink {
  name: string;
  store(chunk: Chunk, embedding?: number[]): Promise<StorageResult>;
  storeBatch(chunks: Chunk[], embeddings?: number[][]): Promise<StorageResult[]>;
  close(): Promise<void>;
}

// ============================================================================
// MEMORABLE API SINK
// ============================================================================

export interface MemorableConfig {
  baseUrl: string;
  passphrase: string;
  device?: { type: string; name: string };
}

export class MemorableSink implements Sink {
  readonly name = 'memorable';
  private config: MemorableConfig;
  private apiKey: string | null = null;

  constructor(config: Partial<MemorableConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com',
      passphrase: config.passphrase || process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.',
      device: config.device || { type: 'terminal', name: 'Indexer' }
    };
  }

  /**
   * Authenticate with knock/exchange flow
   */
  async authenticate(): Promise<boolean> {
    try {
      // Step 1: Knock
      const knockResp = await fetch(`${this.config.baseUrl}/auth/knock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: this.config.device })
      });

      if (!knockResp.ok) return false;
      const knockData = await knockResp.json();

      // Step 2: Exchange
      const exchangeResp = await fetch(`${this.config.baseUrl}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: knockData.challenge,
          passphrase: this.config.passphrase,
          device: this.config.device
        })
      });

      if (!exchangeResp.ok) return false;
      const exchangeData = await exchangeResp.json();
      this.apiKey = exchangeData.api_key;

      return !!this.apiKey;
    } catch {
      return false;
    }
  }

  /**
   * Ensure authenticated
   */
  private async ensureAuth(): Promise<void> {
    if (!this.apiKey) {
      const success = await this.authenticate();
      if (!success) throw new Error('Authentication failed');
    }
  }

  /**
   * Store a single chunk
   */
  async store(chunk: Chunk): Promise<StorageResult> {
    await this.ensureAuth();

    const entity = chunk.metadata.sourceType === 'code' ? 'claude_code' : 'claude_docs';

    const body = {
      content: `[${chunk.metadata.sourceFile}]${chunk.metadata.section ? ` ${chunk.metadata.section}` : ''}\n\n${chunk.content}`,
      entities: [entity, 'memorable_project'],
      metadata: {
        source_file: chunk.metadata.sourceFile,
        source_type: chunk.metadata.sourceType,
        section: chunk.metadata.section,
        chunk_index: chunk.metadata.chunkIndex,
        line_start: chunk.metadata.lineStart,
        line_end: chunk.metadata.lineEnd,
        indexed_at: new Date().toISOString()
      }
    };

    try {
      const resp = await fetch(`${this.config.baseUrl}/memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey!
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        return { id: chunk.id, success: false, error: `HTTP ${resp.status}` };
      }

      const data = await resp.json();
      return { id: chunk.id, success: data.success || !!data.memory };
    } catch (e) {
      return { id: chunk.id, success: false, error: (e as Error).message };
    }
  }

  /**
   * Store batch of chunks with adaptive rate limiting
   */
  async storeBatch(chunks: Chunk[]): Promise<StorageResult[]> {
    const results: StorageResult[] = [];
    let consecutiveFailures = 0;
    let delayMs = 100; // Start with 100ms delay (slower for 100% success)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await this.store(chunk);
      results.push(result);

      if (result.success) {
        consecutiveFailures = 0;
        delayMs = Math.max(50, delayMs - 10); // Speed up on success
      } else {
        consecutiveFailures++;
        delayMs = Math.min(2000, delayMs * 2); // Exponential backoff on failure

        // Re-authenticate if too many failures
        if (consecutiveFailures >= 5) {
          console.log('\n[Re-authenticating...]');
          this.apiKey = null;
          await this.ensureAuth();
          consecutiveFailures = 0;
        }
      }

      // Always delay between requests
      await new Promise(r => setTimeout(r, delayMs));
    }

    return results;
  }

  async close(): Promise<void> {
    this.apiKey = null;
  }
}

// ============================================================================
// CONSOLE SINK (for testing/debugging)
// ============================================================================

export class ConsoleSink implements Sink {
  readonly name = 'console';
  private count = 0;

  async store(chunk: Chunk): Promise<StorageResult> {
    this.count++;
    console.log(`[${this.count}] ${chunk.metadata.sourceFile}:${chunk.metadata.chunkIndex} (${chunk.content.length} chars)`);
    return { id: chunk.id, success: true };
  }

  async storeBatch(chunks: Chunk[]): Promise<StorageResult[]> {
    return Promise.all(chunks.map(c => this.store(c)));
  }

  async close(): Promise<void> {
    console.log(`Total chunks: ${this.count}`);
  }
}

// ============================================================================
// MULTI-SINK (fan-out to multiple sinks)
// ============================================================================

export class MultiSink implements Sink {
  readonly name = 'multi';
  private sinks: Sink[];

  constructor(sinks: Sink[]) {
    this.sinks = sinks;
  }

  async store(chunk: Chunk, embedding?: number[]): Promise<StorageResult> {
    const results = await Promise.all(
      this.sinks.map(s => s.store(chunk, embedding))
    );
    const failed = results.filter(r => !r.success);
    return {
      id: chunk.id,
      success: failed.length === 0,
      error: failed.map(f => f.error).join('; ')
    };
  }

  async storeBatch(chunks: Chunk[], embeddings?: number[][]): Promise<StorageResult[]> {
    const allResults = await Promise.all(
      this.sinks.map(s => s.storeBatch(chunks, embeddings))
    );

    // Merge results by chunk
    return chunks.map((chunk, i) => {
      const results = allResults.map(r => r[i]);
      const failed = results.filter(r => !r.success);
      return {
        id: chunk.id,
        success: failed.length === 0,
        error: failed.map(f => f.error).join('; ')
      };
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.sinks.map(s => s.close()));
  }
}
