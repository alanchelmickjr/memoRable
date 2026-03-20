/**
 * LoRA Service Client — MCP server → GPU LoRA service bridge.
 *
 * Same client works whether the LoRA service is:
 * - Cloud GPU (g4dn/g5 on AWS)
 * - Chloe's AGX Orin 64
 * - A laptop with a GPU
 *
 * Just set LORA_SERVICE_URL and go.
 */

import { logger } from '../../utils/logger.js';

const LORA_SERVICE_URL = process.env.LORA_SERVICE_URL || 'http://localhost:8090';
const LORA_SERVICE_TIMEOUT_MS = parseInt(
  process.env.LORA_SERVICE_TIMEOUT_MS || '120000',
  10
);

interface InternalizeRequest {
  document: string;
  model?: string;
}

interface InternalizeResponse {
  weights_key: string;
  weights_uri: string;
  status: string;
}

interface GenerateRequest {
  prompt: string;
  weights_key: string;
  max_new_tokens?: number;
}

interface GenerateResponse {
  response: string;
  weights_key: string;
  status: string;
}

interface ResetResponse {
  status: string;
  message: string;
}

interface HealthResponse {
  loaded: boolean;
  device: string;
  checkpoint_dir?: string;
  active_weights?: string | null;
  status?: string;
}

async function loraFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${LORA_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LORA_SERVICE_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Internalize a document — generate LoRA weights from text.
 */
export async function internalize(
  document: string,
  model: string = 'gemma-2-2b'
): Promise<InternalizeResponse> {
  logger.info(`[LoRA] Internalizing document (${document.length} chars)`);

  const body: InternalizeRequest = { document, model };
  const response = await loraFetch('/internalize', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LoRA internalize failed (${response.status}): ${detail}`);
  }

  const result: InternalizeResponse = await response.json() as InternalizeResponse;
  logger.info(`[LoRA] Internalized → ${result.weights_key}`);
  return result;
}

/**
 * Generate text with internalized knowledge.
 */
export async function generate(
  prompt: string,
  weightsKey: string,
  maxNewTokens: number = 256
): Promise<GenerateResponse> {
  logger.info(`[LoRA] Generating with weights: ${weightsKey}`);

  const body: GenerateRequest = {
    prompt,
    weights_key: weightsKey,
    max_new_tokens: maxNewTokens,
  };
  const response = await loraFetch('/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LoRA generate failed (${response.status}): ${detail}`);
  }

  return await response.json() as GenerateResponse;
}

/**
 * Reset — clear loaded weights, return to base model.
 */
export async function reset(): Promise<ResetResponse> {
  logger.info('[LoRA] Resetting to base model');

  const response = await loraFetch('/reset', { method: 'POST' });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LoRA reset failed (${response.status}): ${detail}`);
  }

  return await response.json() as ResetResponse;
}

/**
 * Health check — is the LoRA service up?
 */
export async function health(): Promise<HealthResponse> {
  const response = await loraFetch('/health');
  if (!response.ok) {
    throw new Error(`LoRA health check failed (${response.status})`);
  }
  return await response.json() as HealthResponse;
}

/**
 * Check if the LoRA service is reachable.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await health();
    return true;
  } catch {
    return false;
  }
}
