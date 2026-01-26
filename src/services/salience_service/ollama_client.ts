/**
 * @file Ollama LLM Client
 *
 * Local GPU-powered LLM inference via Ollama.
 * Used for Tier2_Personal data that can't go to external APIs.
 *
 * Start small, be elegant.
 */

import type { LLMClient, LLMOptions } from './feature_extractor';

// Config from environment
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2'; // Fast, good at JSON
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10);

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/**
 * Ollama response format
 */
interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama LLM Client
 *
 * Implements LLMClient interface for feature extraction.
 * Uses local Ollama instance with GPU acceleration.
 */
export class OllamaClient implements LLMClient {
  private config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || OLLAMA_BASE_URL,
      model: config.model || OLLAMA_MODEL,
      timeoutMs: config.timeoutMs || OLLAMA_TIMEOUT_MS,
    };
  }

  /**
   * Complete a prompt using local Ollama
   */
  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const model = options?.model || this.config.model;
    const temperature = options?.temperature ?? 0.1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false, // Get complete response at once
          options: {
            temperature,
            num_predict: options?.maxTokens || 2000,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error ${response.status}: ${errorText}`);
      }

      const data: OllamaGenerateResponse = await response.json();

      if (!data.response) {
        throw new Error('Empty response from Ollama');
      }

      // Log timing for debugging
      if (data.total_duration) {
        const durationSec = data.total_duration / 1e9;
        console.log(`[OllamaClient] Generated in ${durationSec.toFixed(2)}s (${data.eval_count || 0} tokens)`);
      }

      return data.response;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Ollama timeout after ${this.config.timeoutMs}ms`);
      }

      throw error;
    }
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Ensure model is pulled/available
   */
  async ensureModel(model?: string): Promise<boolean> {
    const targetModel = model || this.config.model;
    const models = await this.listModels();

    if (models.some(m => m.startsWith(targetModel))) {
      return true;
    }

    // Model not found - attempt to pull
    console.log(`[OllamaClient] Pulling model ${targetModel}...`);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetModel, stream: false }),
      });

      return response.ok;
    } catch (error) {
      console.error(`[OllamaClient] Failed to pull model:`, error);
      return false;
    }
  }

  /**
   * Get current config
   */
  getConfig(): OllamaConfig {
    return { ...this.config };
  }
}

/**
 * Factory function
 */
export function createOllamaClient(config?: Partial<OllamaConfig>): OllamaClient {
  return new OllamaClient(config);
}

/**
 * Singleton instance for shared use
 */
let _sharedClient: OllamaClient | null = null;

export function getSharedOllamaClient(): OllamaClient {
  if (!_sharedClient) {
    _sharedClient = createOllamaClient();
  }
  return _sharedClient;
}

/**
 * Quick check if local LLM is ready
 */
export async function isLocalLLMReady(): Promise<boolean> {
  const client = getSharedOllamaClient();
  const available = await client.isAvailable();

  if (!available) {
    console.log('[OllamaClient] Ollama not running');
    return false;
  }

  const hasModel = await client.ensureModel();
  if (!hasModel) {
    console.log(`[OllamaClient] Model ${client.getConfig().model} not available`);
    return false;
  }

  return true;
}

export default OllamaClient;
