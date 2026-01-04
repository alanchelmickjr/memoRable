/**
 * @file LLM Provider Abstraction
 *
 * Unified interface for multiple LLM providers:
 * - Anthropic (direct API)
 * - OpenAI (direct API)
 * - AWS Bedrock (for SaaS deployment - no API keys needed)
 *
 * Bedrock Benefits for SaaS:
 * - No per-customer API key management
 * - Volume pricing through AWS
 * - Enterprise compliance (data stays in AWS)
 * - Bill customers through AWS Marketplace
 */
import type { LLMClient, LLMOptions } from './feature_extractor';
export type LLMProvider = 'anthropic' | 'openai' | 'bedrock';
export interface LLMProviderConfig {
    provider: LLMProvider;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    bedrockRegion?: string;
    bedrockModelId?: string;
    defaultModel?: string;
    defaultMaxTokens?: number;
    defaultTemperature?: number;
}
/**
 * AWS Bedrock client for Claude models.
 * Uses IAM authentication - no API keys required.
 */
export declare class BedrockLLMClient implements LLMClient {
    private region;
    private modelId;
    constructor(config?: {
        region?: string;
        modelId?: string;
    });
    complete(prompt: string, options?: LLMOptions): Promise<string>;
    /**
     * Map friendly model names to Bedrock model IDs.
     */
    private mapModelId;
}
/**
 * Direct Anthropic API client.
 */
export declare class AnthropicLLMClient implements LLMClient {
    private apiKey;
    private defaultModel;
    constructor(config?: {
        apiKey?: string;
        defaultModel?: string;
    });
    complete(prompt: string, options?: LLMOptions): Promise<string>;
}
/**
 * OpenAI API client.
 */
export declare class OpenAILLMClient implements LLMClient {
    private apiKey;
    private defaultModel;
    constructor(config?: {
        apiKey?: string;
        defaultModel?: string;
    });
    complete(prompt: string, options?: LLMOptions): Promise<string>;
}
/**
 * Create an LLM client based on configuration.
 */
export declare function createLLMClient(config?: Partial<LLMProviderConfig>): LLMClient;
export { LLMClient, LLMOptions } from './feature_extractor';
