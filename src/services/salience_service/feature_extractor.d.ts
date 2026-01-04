/**
 * @file Feature Extractor Service
 * Extracts salience-relevant features from memory content using a single LLM call.
 *
 * Cost: ~$0.002-0.003 per memory (Claude Haiku)
 *
 * This is where the "observable signals" get extracted:
 * - Emotional keywords and sentiment
 * - People mentioned and relationship events
 * - Topics, action items, decisions
 * - Commitments, dates, open loops
 */
import type { ExtractedFeatures } from './models';
/**
 * LLM client interface - can be implemented with any LLM provider.
 */
export interface LLMClient {
    complete(prompt: string, options?: LLMOptions): Promise<string>;
}
export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    model?: string;
}
/**
 * Extract features from memory text using LLM.
 */
export declare function extractFeatures(text: string, llmClient: LLMClient, currentDate?: Date): Promise<ExtractedFeatures>;
/**
 * Simple heuristic-based feature extraction (no LLM).
 * Use as fallback when LLM is unavailable or for cost savings on low-priority content.
 */
export declare function extractFeaturesHeuristic(text: string): ExtractedFeatures;
/**
 * Create a mock LLM client for testing.
 */
export declare function createMockLLMClient(responses?: Record<string, string>): LLMClient;
