/**
 * @file Data Loader - Load Synthetic Data via MemoRable API
 *
 * Loads generated synthetic memories into MemoRable via the REST API.
 * Uses api.memorable.chat with passphrase authentication.
 *
 * Usage:
 *   npx tsx src/tools/synthetic_data/data_loader.ts [--persona alan|betty|both] [--weeks 4]
 */

import generateSyntheticData, { type GeneratedMemory } from './memory_generator.js';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE = process.env.MEMORABLE_API_URL || 'https://api.memorable.chat';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';

// ============================================================================
// API Client
// ============================================================================

interface AuthResponse {
  success: boolean;
  api_key: string;
  device_id: string;
  user: string;
}

interface StoreResponse {
  success: boolean;
  memory: {
    id: string;
    content: string;
    salience: number;
  };
}

async function authenticate(): Promise<string> {
  // Step 1: Knock to get challenge
  const knockResponse = await fetch(`${API_BASE}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: { type: 'terminal', name: 'Synthetic Data Loader' },
    }),
  });

  const knockData = await knockResponse.json() as { challenge: string };
  console.log('[Auth] Got challenge, expires in 5 min');

  // Step 2: Exchange passphrase for API key
  const exchangeResponse = await fetch(`${API_BASE}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: knockData.challenge,
      passphrase: PASSPHRASE,
      device: { type: 'terminal', name: 'Synthetic Data Loader' },
    }),
  });

  const authData = await exchangeResponse.json() as AuthResponse;

  if (!authData.success || !authData.api_key) {
    throw new Error('Authentication failed');
  }

  console.log(`[Auth] Authenticated as ${authData.user}`);
  return authData.api_key;
}

async function storeMemory(
  apiKey: string,
  memory: GeneratedMemory
): Promise<StoreResponse> {
  // 5 W's: WHO, WHAT, WHERE, WHEN, WHY
  const entities = [memory.persona, ...(memory.people || [])].filter(Boolean);

  const response = await fetch(`${API_BASE}/memory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      content: memory.text,
      entities: entities,             // WHO: persona + people mentioned
      context: {
        location: memory.location,    // WHERE
        activity: memory.activity,    // WHAT (context)
        project: memory.project,
        timestamp: memory.createdAt,  // WHEN
      },
      // Pass through metadata
      metadata: {
        generatedId: memory.id,
        persona: memory.persona,
        emotionalValence: memory.emotionalValence,
        hasLoop: memory.hasLoop,
        loop: memory.loop,
        securityTier: memory.securityTier,
        originalCreatedAt: memory.createdAt,
      },
    }),
  });

  return response.json() as Promise<StoreResponse>;
}

// ============================================================================
// Batch Loader
// ============================================================================

interface LoaderOptions {
  persona: 'alan' | 'betty' | 'both';
  numWeeks: number;
  batchSize: number;
  delayMs: number;
  dryRun: boolean;
}

async function loadSyntheticData(options: LoaderOptions): Promise<void> {
  const {
    persona,
    numWeeks,
    batchSize,
    delayMs,
    dryRun,
  } = options;

  console.log(`\n=== MemoRable Synthetic Data Loader ===`);
  console.log(`Persona: ${persona}`);
  console.log(`Weeks: ${numWeeks}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`API: ${API_BASE}`);
  console.log('');

  // Generate data
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (numWeeks * 7)); // Start N weeks ago

  console.log(`[Generate] Generating ${numWeeks} weeks of data starting ${startDate.toISOString().split('T')[0]}...`);

  const memories = generateSyntheticData({
    persona,
    startDate,
    numWeeks,
  });

  console.log(`[Generate] Created ${memories.length} memories`);
  console.log(`  - Alan: ${memories.filter(m => m.persona === 'alan').length}`);
  console.log(`  - Betty: ${memories.filter(m => m.persona === 'betty').length}`);
  console.log(`  - With loops: ${memories.filter(m => m.hasLoop).length}`);
  console.log('');

  if (dryRun) {
    console.log('[DryRun] Would load these memories:');
    for (const mem of memories.slice(0, 10)) {
      console.log(`  ${mem.createdAt.split('T')[0]} [${mem.persona}] ${mem.text.slice(0, 60)}...`);
    }
    console.log(`  ... and ${memories.length - 10} more`);
    return;
  }

  // Authenticate (re-auth every 4 min before 5 min TTL expires)
  console.log('[Auth] Authenticating...');
  let apiKey = await authenticate();
  let lastAuthTime = Date.now();
  const AUTH_REFRESH_MS = 4 * 60 * 1000; // 4 minutes

  // Load in batches
  let loaded = 0;
  let errors = 0;

  for (let i = 0; i < memories.length; i += batchSize) {
    // Re-authenticate if approaching TTL
    if (Date.now() - lastAuthTime > AUTH_REFRESH_MS) {
      console.log('[Auth] Refreshing API key...');
      apiKey = await authenticate();
      lastAuthTime = Date.now();
    }

    const batch = memories.slice(i, i + batchSize);

    console.log(`[Load] Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(memories.length / batchSize)} (${batch.length} memories)...`);

    const results = await Promise.all(
      batch.map(async (memory) => {
        try {
          const result = await storeMemory(apiKey, memory);
          if (result.success) {
            return { success: true, id: result.memory.id };
          } else {
            return { success: false, error: 'API returned success: false' };
          }
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })
    );

    const batchLoaded = results.filter(r => r.success).length;
    const batchErrors = results.filter(r => !r.success).length;

    loaded += batchLoaded;
    errors += batchErrors;

    if (batchErrors > 0) {
      console.log(`  [!] ${batchErrors} errors in batch`);

      // Rate limit hit - wait and re-auth
      if (batchErrors === batch.length) {
        console.log('[RateLimit] Waiting 60s and re-authenticating...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        apiKey = await authenticate();
        lastAuthTime = Date.now();
      }
    }

    // Rate limiting delay between batches
    if (i + batchSize < memories.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('');
  console.log(`=== Load Complete ===`);
  console.log(`Loaded: ${loaded}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${memories.length}`);
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: LoaderOptions = {
    persona: 'both',
    numWeeks: 4,
    batchSize: 10,
    delayMs: 100,
    dryRun: false,
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--persona':
        options.persona = args[++i] as 'alan' | 'betty' | 'both';
        break;
      case '--weeks':
        options.numWeeks = parseInt(args[++i], 10);
        break;
      case '--batch':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--delay':
        options.delayMs = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx src/tools/synthetic_data/data_loader.ts [options]

Options:
  --persona <alan|betty|both>   Persona to generate (default: both)
  --weeks <n>                   Number of weeks of data (default: 4)
  --batch <n>                   Batch size for API calls (default: 10)
  --delay <ms>                  Delay between batches (default: 100)
  --dry-run                     Generate but don't load
  --help                        Show this help

Environment:
  MEMORABLE_API_URL             API base URL (default: https://api.memorable.chat)
  MEMORABLE_PASSPHRASE          Auth passphrase
`);
        return;
    }
  }

  await loadSyntheticData(options);
}

main().catch(console.error);
