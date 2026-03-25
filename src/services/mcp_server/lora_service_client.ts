/**
 * LoRA Service Client — MCP server → GPU LoRA service bridge.
 *
 * Auto-wakes the GPU when needed. You just call internalize().
 * The client handles: wake GPU → wait for health → do the work → GPU auto-sleeps.
 *
 * Same client works whether the LoRA service is:
 * - Cloud GPU (g4dn/g5 on AWS)
 * - Chloe's AGX Orin 64
 * - A laptop with a GPU
 */

import { execSync } from 'child_process';
import { logger } from '../../utils/logger.js';

const LORA_SERVICE_URL = process.env.LORA_SERVICE_URL || 'http://localhost:8090';
const LORA_SERVICE_TIMEOUT_MS = parseInt(
  process.env.LORA_SERVICE_TIMEOUT_MS || '120000',
  10
);
const GPU_STACK_NAME = process.env.MEMORABLE_GPU_STACK || 'memorable-gpu';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const GPU_WAKE_TIMEOUT_MS = parseInt(
  process.env.GPU_WAKE_TIMEOUT_MS || '300000',  // 5 min for cold start
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

interface ComposeRequest {
  weights_keys: string[];
  scalers?: number[];
}

interface ComposeResponse {
  weights_key: string;
  weights_uri: string;
  num_composed: number;
  effective_rank: number;
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
 * Compose multiple LoRA weights into one, weighted by salience.
 * Uses D2L's rank concatenation — ~40 docs at rank 8 composes cleanly.
 */
export async function compose(
  weightsKeys: string[],
  scalers?: number[]
): Promise<ComposeResponse> {
  logger.info(`[LoRA] Composing ${weightsKeys.length} LoRA weights`);

  const body: ComposeRequest = { weights_keys: weightsKeys };
  if (scalers) {
    body.scalers = scalers;
  }
  const response = await loraFetch('/compose', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LoRA compose failed (${response.status}): ${detail}`);
  }

  const result = await response.json() as ComposeResponse;
  logger.info(`[LoRA] Composed → ${result.weights_key} (rank ${result.effective_rank})`);
  return result;
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
 * Wake the GPU instance via AWS CLI.
 * Returns true if the instance was started (or already running).
 */
async function wakeGpu(): Promise<boolean> {
  try {
    // Get instance ID from CloudFormation stack
    const instanceId = execSync(
      `aws cloudformation describe-stacks --stack-name ${GPU_STACK_NAME} --region ${AWS_REGION} --query 'Stacks[0].Outputs[?OutputKey==\`InstanceId\`].OutputValue' --output text`,
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();

    if (!instanceId || instanceId === 'None') {
      logger.warn('[LoRA] No GPU stack found — cannot auto-wake');
      return false;
    }

    // Check current state
    const state = execSync(
      `aws ec2 describe-instances --instance-ids ${instanceId} --region ${AWS_REGION} --query 'Reservations[0].Instances[0].State.Name' --output text`,
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();

    if (state === 'running') {
      logger.info('[LoRA] GPU already running');
      return true;
    }

    if (state === 'stopped') {
      logger.info('[LoRA] Waking GPU instance...');
      execSync(
        `aws ec2 start-instances --instance-ids ${instanceId} --region ${AWS_REGION}`,
        { encoding: 'utf-8', timeout: 15000 }
      );
      return true;
    }

    logger.warn(`[LoRA] GPU instance in state '${state}' — cannot wake`);
    return false;
  } catch (err) {
    logger.warn(`[LoRA] GPU auto-wake failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Wait for the LoRA service to become healthy after GPU wake.
 */
async function waitForService(): Promise<boolean> {
  const start = Date.now();
  const interval = 5000; // check every 5s

  while (Date.now() - start < GPU_WAKE_TIMEOUT_MS) {
    try {
      await health();
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  return false;
}

/**
 * Ensure the LoRA service is available — auto-wakes GPU if needed.
 * This is the only function callers need. It handles everything.
 */
export async function ensureAvailable(): Promise<boolean> {
  // Fast path: already up
  try {
    await health();
    return true;
  } catch {
    // Not up — try to wake it
  }

  logger.info('[LoRA] Service not available — attempting GPU auto-wake');
  const woke = await wakeGpu();
  if (!woke) {
    return false;
  }

  logger.info('[LoRA] Waiting for service to come online...');
  const ready = await waitForService();
  if (ready) {
    logger.info('[LoRA] GPU service is ready');
  } else {
    logger.error('[LoRA] GPU service failed to come online within timeout');
  }
  return ready;
}

/**
 * Check if the LoRA service is reachable (no auto-wake).
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await health();
    return true;
  } catch {
    return false;
  }
}
