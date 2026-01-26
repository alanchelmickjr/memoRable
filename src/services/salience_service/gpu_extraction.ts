/**
 * @file GPU-Powered Feature Extraction
 *
 * Elegant wrapper that automatically uses local GPU (Ollama)
 * when available, falling back gracefully.
 *
 * Small, simple, works.
 */

import { extractFeatures, extractFeaturesHeuristic, type LLMClient } from './feature_extractor';
import { getSharedOllamaClient, isLocalLLMReady } from './ollama_client';
import type { ExtractedFeatures } from './models';
import type { SecurityTier } from '../ingestion_service/models';

// State
let _gpuReady: boolean | null = null;
let _lastCheck = 0;
const CHECK_INTERVAL_MS = 60000; // Re-check every minute

/**
 * Check if GPU extraction is available
 */
async function checkGpuReady(): Promise<boolean> {
  const now = Date.now();

  // Use cached result if recent
  if (_gpuReady !== null && now - _lastCheck < CHECK_INTERVAL_MS) {
    return _gpuReady;
  }

  _gpuReady = await isLocalLLMReady();
  _lastCheck = now;

  console.log(`[GpuExtraction] Local LLM ready: ${_gpuReady}`);
  return _gpuReady;
}

/**
 * Extract features using GPU when available
 *
 * Auto-routes based on:
 * 1. Security tier (Tier3 = never LLM)
 * 2. GPU availability
 * 3. External LLM fallback
 *
 * @param text - Text to extract features from
 * @param options - Extraction options
 */
export async function extractWithGpu(
  text: string,
  options: {
    securityTier?: SecurityTier;
    externalLlm?: LLMClient;
    preferGpu?: boolean;
  } = {}
): Promise<ExtractedFeatures> {
  const tier = options.securityTier || 'Tier2_Personal';

  // Tier3: NEVER use any LLM
  if (tier === 'Tier3_Vault') {
    console.log('[GpuExtraction] Tier3_Vault: Heuristic only');
    return extractFeaturesHeuristic(text);
  }

  // Check if GPU is available
  const gpuReady = await checkGpuReady();

  // Tier2: Must use local LLM only
  if (tier === 'Tier2_Personal') {
    if (gpuReady) {
      console.log('[GpuExtraction] Tier2_Personal: Using local GPU');
      return extractFeatures(
        text,
        getSharedOllamaClient(),
        new Date(),
        tier,
        getSharedOllamaClient()
      );
    } else {
      console.log('[GpuExtraction] Tier2_Personal: No GPU, using heuristic');
      return extractFeaturesHeuristic(text);
    }
  }

  // Tier1: Can use external, but prefer GPU if available and requested
  if (gpuReady && options.preferGpu) {
    console.log('[GpuExtraction] Tier1_General: Using local GPU (preferred)');
    return extractFeatures(
      text,
      getSharedOllamaClient(),
      new Date(),
      tier,
      getSharedOllamaClient()
    );
  }

  // Tier1 with external LLM
  if (options.externalLlm) {
    console.log('[GpuExtraction] Tier1_General: Using external LLM');
    return extractFeatures(text, options.externalLlm, new Date(), tier);
  }

  // No external LLM provided, try GPU
  if (gpuReady) {
    console.log('[GpuExtraction] Tier1_General: Using local GPU (fallback)');
    return extractFeatures(
      text,
      getSharedOllamaClient(),
      new Date(),
      tier,
      getSharedOllamaClient()
    );
  }

  // Final fallback: heuristic
  console.log('[GpuExtraction] No LLM available: Using heuristic');
  return extractFeaturesHeuristic(text);
}

/**
 * Batch extract features using GPU
 *
 * Processes multiple texts efficiently with rate limiting
 */
export async function batchExtractWithGpu(
  texts: string[],
  options: {
    securityTier?: SecurityTier;
    externalLlm?: LLMClient;
    preferGpu?: boolean;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<ExtractedFeatures[]> {
  const concurrency = options.concurrency || 3;
  const results: ExtractedFeatures[] = [];
  let completed = 0;

  // Process in batches
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map((text) => extractWithGpu(text, options))
    );

    results.push(...batchResults);
    completed += batch.length;
    options.onProgress?.(completed, texts.length);
  }

  return results;
}

/**
 * Get GPU extraction status
 */
export async function getGpuStatus(): Promise<{
  gpuAvailable: boolean;
  ollamaUrl: string;
  model: string;
  lastCheck: Date | null;
}> {
  const client = getSharedOllamaClient();
  const config = client.getConfig();

  return {
    gpuAvailable: await checkGpuReady(),
    ollamaUrl: config.baseUrl,
    model: config.model,
    lastCheck: _lastCheck ? new Date(_lastCheck) : null,
  };
}

/**
 * Force GPU readiness recheck
 */
export async function recheckGpu(): Promise<boolean> {
  _gpuReady = null;
  _lastCheck = 0;
  return checkGpuReady();
}

export default extractWithGpu;
