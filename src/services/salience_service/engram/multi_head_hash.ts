/**
 * Multi-Head Hashing for O(1) Pattern Lookup
 *
 * Based on Engram paper (arXiv:2601.07372, January 2026):
 * - K=8 hash heads with distinct prime moduli
 * - Multiplicative-XOR hash for each head
 * - Vocabulary compression (23% reduction) before hashing
 * - Redis for hot pattern storage, MongoDB for warm
 */

import type { Redis } from 'ioredis';
import type { Collection } from 'mongodb';
import {
  ENGRAM_PRIMES,
  ENGRAM_CONFIG,
  type EngramPattern,
  type EngramPatternKey,
  type MultiHeadHashResult,
} from './types';

// ============================================================================
// Vocabulary Compression
// ============================================================================

/**
 * Normalize tokens before N-gram construction (per Engram paper)
 * NFKC → NFD → strip accents → lowercase → collapse whitespace
 * Results in 23% vocabulary compression
 */
export function normalizeToken(tokenStr: string): string {
  // NFKC normalization (compatibility decomposition + canonical composition)
  let normalized = tokenStr.normalize('NFKC');

  // NFD decomposition (canonical decomposition)
  const decomposed = normalized.normalize('NFD');

  // Strip combining marks (accents)
  // Unicode category Mn = Mark, Nonspacing
  const stripped = decomposed.replace(/[\u0300-\u036f]/g, '');

  // Lowercase and collapse whitespace
  return stripped.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Token compressor for vocabulary reduction
 */
export class TokenCompressor {
  private lookupTable: Map<number, number> = new Map();
  private reverseLookup: Map<number, number> = new Map();
  private nextCompressedId = 0;

  constructor(private originalVocabSize: number = ENGRAM_CONFIG.originalVocabSize) {}

  /**
   * Compress a token ID, creating new mapping if needed
   */
  compress(tokenId: number): number {
    if (this.lookupTable.has(tokenId)) {
      return this.lookupTable.get(tokenId)!;
    }

    const compressedId = this.nextCompressedId++;
    this.lookupTable.set(tokenId, compressedId);
    this.reverseLookup.set(compressedId, tokenId);
    return compressedId;
  }

  /**
   * Compress a sequence of token IDs
   */
  compressSequence(tokenIds: number[]): number[] {
    return tokenIds.map((t) => this.compress(t));
  }

  /**
   * Decompress back to original token ID
   */
  decompress(compressedId: number): number | undefined {
    return this.reverseLookup.get(compressedId);
  }

  /**
   * Get compression ratio
   */
  getCompressionRatio(): number {
    if (this.nextCompressedId === 0) return 1;
    return this.nextCompressedId / this.originalVocabSize;
  }

  /**
   * Serialize for persistence
   */
  toJSON(): { lookupTable: [number, number][]; nextId: number } {
    return {
      lookupTable: Array.from(this.lookupTable.entries()),
      nextId: this.nextCompressedId,
    };
  }

  /**
   * Restore from persistence
   */
  static fromJSON(data: { lookupTable: [number, number][]; nextId: number }): TokenCompressor {
    const compressor = new TokenCompressor();
    compressor.nextCompressedId = data.nextId;
    for (const [original, compressed] of data.lookupTable) {
      compressor.lookupTable.set(original, compressed);
      compressor.reverseLookup.set(compressed, original);
    }
    return compressor;
  }
}

// ============================================================================
// Multi-Head Hash Implementation
// ============================================================================

/**
 * Compute multiplicative-XOR hash for a single head
 * Uses odd multipliers (2i + 1) for non-zero contribution
 */
export function computeNgramHash(tokens: number[], headIndex: number): number {
  let hashVal = 0;

  for (let i = 0; i < tokens.length; i++) {
    const multiplier = 2 * i + 1; // Odd integers
    hashVal ^= tokens[i] * multiplier;
  }

  // Apply prime modulus for this head
  return Math.abs(hashVal) % ENGRAM_PRIMES[headIndex];
}

/**
 * Generate Redis key for pattern embedding
 */
export function getPatternKey(ngramType: 2 | 3, headIndex: number, hashValue: number): string {
  return `engram:${ngramType}gram:h${headIndex}:${hashValue}`;
}

/**
 * Parse pattern key back to components
 */
export function parsePatternKey(key: string): EngramPatternKey | null {
  const match = key.match(/^engram:(\d)gram:h(\d):(\d+)$/);
  if (!match) return null;

  return {
    ngramType: parseInt(match[1], 10) as 2 | 3,
    headIndex: parseInt(match[2], 10),
    hashValue: parseInt(match[3], 10),
  };
}

/**
 * Multi-Head Engram Hash for O(1) pattern lookup
 */
export class EngramMultiHeadHash {
  private redis: Redis;
  private mongoCollection?: Collection<EngramPattern>;
  private compressor: TokenCompressor;

  constructor(
    redisClient: Redis,
    mongoCollection?: Collection<EngramPattern>,
    compressor?: TokenCompressor
  ) {
    this.redis = redisClient;
    this.mongoCollection = mongoCollection;
    this.compressor = compressor || new TokenCompressor();
  }

  /**
   * Compute all K=8 hashes for an N-gram
   */
  computeAllHashes(tokens: number[], ngramType: 2 | 3): Array<{ headIndex: number; hashValue: number; key: string }> {
    const compressed = this.compressor.compressSequence(tokens);
    const results: Array<{ headIndex: number; hashValue: number; key: string }> = [];

    for (let headIndex = 0; headIndex < ENGRAM_CONFIG.K; headIndex++) {
      const hashValue = computeNgramHash(compressed, headIndex);
      const key = getPatternKey(ngramType, headIndex, hashValue);
      results.push({ headIndex, hashValue, key });
    }

    return results;
  }

  /**
   * O(1) lookup across all heads - returns concatenated embeddings
   * Uses Redis pipeline for efficiency
   */
  async lookupPattern(tokens: number[]): Promise<MultiHeadHashResult> {
    const embeddings: Float32Array[] = [];
    const keys: string[] = [];
    let collisionDetected = false;

    const pipeline = this.redis.pipeline();

    // 2-grams and 3-grams with K=8 heads each = 16 lookups
    const lookupKeys: string[] = [];

    for (const ngramSize of [2, 3] as const) {
      if (tokens.length >= ngramSize) {
        const ngram = tokens.slice(-ngramSize);
        const hashes = this.computeAllHashes(ngram, ngramSize);

        for (const { key } of hashes) {
          lookupKeys.push(key);
          pipeline.get(key);
        }
      }
    }

    const results = await pipeline.exec();

    if (results) {
      for (let i = 0; i < results.length; i++) {
        const [err, data] = results[i];
        if (!err && data) {
          keys.push(lookupKeys[i]);

          // Decode embedding from buffer
          if (typeof data === 'string' || Buffer.isBuffer(data)) {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
            const embedding = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
            embeddings.push(embedding);
          }
        }
      }
    }

    // Collision detection: if multiple heads return very different embeddings
    if (embeddings.length > 1) {
      const variance = this.computeEmbeddingVariance(embeddings);
      collisionDetected = variance > 0.5; // Threshold for collision detection
    }

    return { embeddings, keys, collisionDetected };
  }

  /**
   * Store pattern embedding in Redis (hot) and MongoDB (warm)
   */
  async storePattern(
    tokens: number[],
    ngramType: 2 | 3,
    embedding: Float32Array,
    layerId: number = 1
  ): Promise<void> {
    const hashes = this.computeAllHashes(tokens, ngramType);
    const embeddingBuffer = Buffer.from(embedding.buffer);
    const now = new Date();

    const pipeline = this.redis.pipeline();

    for (const { key, hashValue, headIndex } of hashes) {
      // Store in Redis with 1-hour TTL (hot tier)
      pipeline.set(key, embeddingBuffer, 'EX', 3600);
    }

    await pipeline.exec();

    // Store in MongoDB for warm tier persistence
    if (this.mongoCollection) {
      const pattern: EngramPattern = {
        patternKey: hashes[0].key, // Primary key
        ngramTokens: this.compressor.compressSequence(tokens),
        embedding,
        accessCount: 1,
        lastAccessed: now,
        layerId,
      };

      await this.mongoCollection.updateOne(
        { patternKey: pattern.patternKey },
        { $set: pattern, $inc: { accessCount: 1 } },
        { upsert: true }
      );
    }
  }

  /**
   * Fallback to MongoDB (warm tier) when Redis miss
   */
  async lookupWarm(tokens: number[], ngramType: 2 | 3): Promise<EngramPattern | null> {
    if (!this.mongoCollection) return null;

    const hashes = this.computeAllHashes(tokens, ngramType);
    const keys = hashes.map((h) => h.key);

    const pattern = await this.mongoCollection.findOne({
      patternKey: { $in: keys },
    });

    if (pattern) {
      // Promote to hot tier on access
      await this.promoteToHot(pattern);
    }

    return pattern;
  }

  /**
   * Promote pattern from warm (MongoDB) to hot (Redis)
   */
  private async promoteToHot(pattern: EngramPattern): Promise<void> {
    const embeddingBuffer = Buffer.from(pattern.embedding.buffer);
    await this.redis.set(pattern.patternKey, embeddingBuffer, 'EX', 3600);

    // Update access count in MongoDB
    if (this.mongoCollection) {
      await this.mongoCollection.updateOne(
        { patternKey: pattern.patternKey },
        { $set: { lastAccessed: new Date() }, $inc: { accessCount: 1 } }
      );
    }
  }

  /**
   * Compute variance across embeddings for collision detection
   */
  private computeEmbeddingVariance(embeddings: Float32Array[]): number {
    if (embeddings.length < 2) return 0;

    const dim = embeddings[0].length;
    const mean = new Float32Array(dim);

    // Compute mean
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        mean[i] += emb[i] / embeddings.length;
      }
    }

    // Compute variance
    let variance = 0;
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        variance += (emb[i] - mean[i]) ** 2;
      }
    }

    return variance / (embeddings.length * dim);
  }

  /**
   * Get compressor for serialization
   */
  getCompressor(): TokenCompressor {
    return this.compressor;
  }
}

// ============================================================================
// N-gram Extraction
// ============================================================================

/**
 * Extract bigrams and trigrams from token sequence
 */
export function extractNgrams(tokens: number[]): { bigrams: number[][]; trigrams: number[][] } {
  const bigrams: number[][] = [];
  const trigrams: number[][] = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push([tokens[i], tokens[i + 1]]);
  }

  for (let i = 0; i < tokens.length - 2; i++) {
    trigrams.push([tokens[i], tokens[i + 1], tokens[i + 2]]);
  }

  return { bigrams, trigrams };
}

/**
 * Simple tokenizer for demonstration (production would use proper tokenizer)
 */
export function simpleTokenize(text: string): number[] {
  const normalized = normalizeToken(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);

  // Simple hash-based token IDs
  return words.map((word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
  });
}
