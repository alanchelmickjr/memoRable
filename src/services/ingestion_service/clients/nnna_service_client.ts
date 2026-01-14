/**
 * @file NNNA Service Client - DEPRECATED STUB
 *
 * NNNA (Nocturnal batch processing) was deprecated.
 * All salience scoring, pattern learning, and relationship updates
 * now happen at ingest time (Real-Time Relevance Engine).
 *
 * This stub exists for backwards compatibility with SchemaManager.
 * It always returns null (no schema updates) since NNNA no longer exists.
 */

import { SchemaVersionDefinition } from '../models';

export class NNNAServiceClient {
  private logger: Console;

  constructor(logger: Console = console) {
    this.logger = logger;
  }

  /**
   * Check for schema updates from NNNA service.
   * @deprecated NNNA is deprecated - always returns null
   */
  async checkForUpdates(_currentVersion: string): Promise<SchemaVersionDefinition | null> {
    this.logger.info('NNNAServiceClient.checkForUpdates: NNNA is deprecated, returning null');
    return null;
  }
}
