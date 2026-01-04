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

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type LLMProvider = 'anthropic' | 'openai' | 'bedrock';

export interface LLMProviderConfig {
  provider: LLMProvider;

  // Direct API (Anthropic/OpenAI)
  anthropicApiKey?: string;
  openaiApiKey?: string;

  // Bedrock config (uses IAM, no API key needed)
  bedrockRegion?: string;
  bedrockModelId?: string;

  // Common settings
  defaultModel?: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

// ============================================================================
// BEDROCK CLIENT
// ============================================================================

/**
 * AWS Bedrock client for Claude models.
 * Uses IAM authentication - no API keys required.
 */
export class BedrockLLMClient implements LLMClient {
  private region: string;
  private modelId: string;

  constructor(config: {
    region?: string;
    modelId?: string;
  } = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.modelId = config.modelId || 'anthropic.claude-3-haiku-20240307-v1:0';
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    // Dynamic import to avoid requiring SDK if not using Bedrock
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    const client = new BedrockRuntimeClient({ region: this.region });

    const modelId = options?.model ? this.mapModelId(options.model) : this.modelId;

    // Bedrock uses different payload format for Claude
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    try {
      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.content[0].text;
    } catch (error) {
      console.error('[Bedrock] Error invoking model:', error);
      throw error;
    }
  }

  /**
   * Map friendly model names to Bedrock model IDs.
   */
  private mapModelId(model: string): string {
    const modelMap: Record<string, string> = {
      'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
      'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
      'claude-3.5-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'claude-3.5-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
      // Haiku is best for feature extraction (fast + cheap)
      'haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
      'sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    };

    return modelMap[model] || model;
  }
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

/**
 * Direct Anthropic API client.
 */
export class AnthropicLLMClient implements LLMClient {
  private apiKey: string;
  private defaultModel: string;

  constructor(config: { apiKey?: string; defaultModel?: string } = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.defaultModel = config.defaultModel || 'claude-3-haiku-20240307';

    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0].text;
  }
}

// ============================================================================
// OPENAI CLIENT
// ============================================================================

/**
 * OpenAI API client.
 */
export class OpenAILLMClient implements LLMClient {
  private apiKey: string;
  private defaultModel: string;

  constructor(config: { apiKey?: string; defaultModel?: string } = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.defaultModel = config.defaultModel || 'gpt-4o-mini';

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an LLM client based on configuration.
 */
export function createLLMClient(config?: Partial<LLMProviderConfig>): LLMClient {
  const provider = config?.provider || detectProvider(config);

  switch (provider) {
    case 'bedrock':
      console.log('[LLM] Using AWS Bedrock provider');
      return new BedrockLLMClient({
        region: config?.bedrockRegion,
        modelId: config?.bedrockModelId,
      });

    case 'openai':
      console.log('[LLM] Using OpenAI provider');
      return new OpenAILLMClient({
        apiKey: config?.openaiApiKey,
        defaultModel: config?.defaultModel,
      });

    case 'anthropic':
    default:
      console.log('[LLM] Using Anthropic provider');
      return new AnthropicLLMClient({
        apiKey: config?.anthropicApiKey,
        defaultModel: config?.defaultModel,
      });
  }
}

/**
 * Auto-detect provider based on available credentials.
 */
function detectProvider(config?: Partial<LLMProviderConfig>): LLMProvider {
  // Explicit provider from env
  const envProvider = process.env.LLM_PROVIDER?.toLowerCase() as LLMProvider;
  if (envProvider && ['anthropic', 'openai', 'bedrock'].includes(envProvider)) {
    return envProvider;
  }

  // Check for Bedrock (running in AWS with IAM)
  if (
    process.env.USE_BEDROCK === 'true' ||
    process.env.AWS_EXECUTION_ENV || // Running in Lambda/ECS
    config?.bedrockModelId
  ) {
    return 'bedrock';
  }

  // Check for API keys
  if (config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }

  if (config?.openaiApiKey || process.env.OPENAI_API_KEY) {
    return 'openai';
  }

  // Default to Anthropic (will fail if no key, but that's the right error)
  return 'anthropic';
}

// ============================================================================
// EXPORTS
// ============================================================================

export { LLMClient, LLMOptions } from './feature_extractor';
