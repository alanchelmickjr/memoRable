/**
 * @fileoverview Client for interacting with the NNNA (Nocturnal Nurturing & Network Attunement) Service.
 *
 * NOTE: NNNA is deprecated per CLAUDE.md - Real-Time Relevance Engine replaced batch processing.
 * This client is kept for backward compatibility and test mocking.
 */

import { SchemaVersionDefinition } from '../models';

export interface NNNASalienceResult {
  salienceScore: number;
  emotionWeight: number;
  noveltyWeight: number;
  relevanceWeight: number;
  socialWeight: number;
  consequentialWeight: number;
}

export interface NNNAPatternResult {
  patterns: string[];
  confidence: number;
}

export class NNNAServiceClient {
  private baseUrl: string;

  /**
   * Constructor accepts either a baseUrl string or a logger for backward compatibility
   * @param baseUrlOrLogger - Either a URL string or a logger instance (ignored if logger)
   */
  constructor(baseUrlOrLogger?: string | Console | object) {
    // Handle both old (logger) and new (baseUrl) constructor signatures
    if (typeof baseUrlOrLogger === 'string') {
      this.baseUrl = baseUrlOrLogger;
    } else {
      this.baseUrl = process.env.NNNA_SERVICE_URL || 'http://localhost:3005';
    }
    console.log(`NNNAServiceClient initialized for URL: ${this.baseUrl}`);
  }

  /**
   * Calculate salience score for a memory
   * @deprecated Use real-time salience calculation in salience_service instead
   */
  public async calculateSalience(content: string, context?: object): Promise<NNNASalienceResult> {
    console.log('NNNAServiceClient.calculateSalience called - deprecated, use real-time engine');
    // Return default scores - actual calculation happens in salience_service at ingest time
    return {
      salienceScore: 50,
      emotionWeight: 0.3,
      noveltyWeight: 0.2,
      relevanceWeight: 0.2,
      socialWeight: 0.15,
      consequentialWeight: 0.15,
    };
  }

  /**
   * Detect patterns in memories
   * @deprecated Use anticipation_service for pattern learning
   */
  public async detectPatterns(memories: object[]): Promise<NNNAPatternResult> {
    console.log('NNNAServiceClient.detectPatterns called - deprecated, use anticipation_service');
    return {
      patterns: [],
      confidence: 0,
    };
  }

  /**
   * Health check for NNNA service
   */
  public async healthCheck(): Promise<{ status: string }> {
    return { status: 'healthy' };
  }

  /**
   * Check for schema updates from NNNA service
   * @deprecated Schema management should be handled locally
   */
  public async checkForUpdates(currentVersion: string): Promise<SchemaVersionDefinition | null> {
    console.log(`NNNAServiceClient.checkForUpdates called with version: ${currentVersion} - deprecated`);
    // Return null to indicate no updates available
    return null;
  }
}
