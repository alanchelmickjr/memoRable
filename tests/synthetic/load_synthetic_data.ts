#!/usr/bin/env npx tsx
/**
 * @file Load Synthetic Temporal Data into MemoRable
 *
 * Usage:
 *   npx tsx tests/synthetic/load_synthetic_data.ts [options]
 *
 * Options:
 *   --days=84          Number of days to generate (default: 84)
 *   --user=synthetic   User ID (default: synthetic_test_user)
 *   --dry-run          Generate and print summary without loading
 *   --api-only         Only load via API (skip direct MongoDB access records)
 *   --mongo-uri=...    MongoDB connection string (default: from MONGODB_URI env)
 *   --profile=smoke|standard|stress  Load profile (default: standard)
 *
 * The loader:
 * 1. Generates temporal dataset with realistic patterns
 * 2. Stores memories via REST API (POST /memory)
 * 3. Inserts backdated access records directly into MongoDB
 *    (because recordMemoryAccess uses new Date() - can't backdate via API)
 * 4. Prints verification summary
 */

import { MongoClient } from 'mongodb';
import {
  generateTemporalDataset,
  generateMultiUserDataset,
  printDatasetSummary,
  getExpectedDetections,
  DEFAULT_PATTERNS,
  type TemporalDataset,
  type GeneratedMemory,
  type GeneratedAccessRecord,
} from './temporal_data_generator.js';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';

interface LoaderConfig {
  days: number;
  userId: string;
  dryRun: boolean;
  apiOnly: boolean;
  mongoUri: string;
  profile: 'smoke' | 'standard' | 'stress';
}

const PROFILES = {
  smoke: { days: 21, users: 1 },
  standard: { days: 84, users: 1 },
  stress: { days: 84, users: 5 },
};

function parseArgs(): LoaderConfig {
  const args = process.argv.slice(2);
  const config: LoaderConfig = {
    days: 84,
    userId: 'synthetic_test_user',
    dryRun: false,
    apiOnly: false,
    mongoUri: MONGO_URI,
    profile: 'standard',
  };

  for (const arg of args) {
    if (arg.startsWith('--days=')) config.days = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--user=')) config.userId = arg.split('=')[1];
    else if (arg === '--dry-run') config.dryRun = true;
    else if (arg === '--api-only') config.apiOnly = true;
    else if (arg.startsWith('--mongo-uri=')) config.mongoUri = arg.split('=')[1];
    else if (arg.startsWith('--profile=')) config.profile = arg.split('=')[1] as LoaderConfig['profile'];
  }

  const profile = PROFILES[config.profile];
  if (profile && !args.some(a => a.startsWith('--days='))) {
    config.days = profile.days;
  }

  return config;
}

// ============================================================================
// API Client (Auth + Memory Storage)
// ============================================================================

async function authenticate(): Promise<string> {
  // Step 1: Knock
  const knockRes = await fetch(`${BASE_URL}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: { type: 'terminal', name: 'Synthetic Loader' } }),
  });

  if (!knockRes.ok) throw new Error(`Knock failed: ${knockRes.status}`);
  const { challenge } = await knockRes.json() as { challenge: string };

  // Step 2: Exchange
  const exchangeRes = await fetch(`${BASE_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge,
      passphrase: PASSPHRASE,
      device: { type: 'terminal', name: 'Synthetic Loader' },
    }),
  });

  if (!exchangeRes.ok) throw new Error(`Exchange failed: ${exchangeRes.status}`);
  const { api_key } = await exchangeRes.json() as { api_key: string };
  return api_key;
}

async function storeMemoryViaApi(
  apiKey: string,
  memory: GeneratedMemory
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        content: memory.content,
        entities: memory.entities,
        metadata: {
          synthetic: true,
          patternName: memory.patternName,
          originalTimestamp: memory.timestamp.toISOString(),
        },
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// MongoDB Direct Access (for backdated access records)
// ============================================================================

async function insertAccessRecords(
  mongoUri: string,
  records: GeneratedAccessRecord[]
): Promise<number> {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('accessHistory');

    // Insert in batches of 500
    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map(r => ({
        userId: r.userId,
        memoryId: r.memoryId,
        timestamp: r.timestamp,
        contextFrame: r.contextFrame,
        synthetic: true,
      }));

      const result = await collection.insertMany(batch);
      inserted += result.insertedCount;
    }

    // Create index if it doesn't exist
    await collection.createIndex({ userId: 1, timestamp: -1 });

    return inserted;
  } finally {
    await client.close();
  }
}

/**
 * Insert memories directly into MongoDB with backdated timestamps.
 * This is for cases where the API would overwrite the timestamp.
 */
async function insertMemoriesDirect(
  mongoUri: string,
  memories: GeneratedMemory[]
): Promise<number> {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('memories');

    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize).map(m => ({
        memoryId: m.memoryId,
        userId: m.userId,
        content: m.content,
        entities: m.entities,
        salience: m.salience,
        context: m.context,
        createdAt: m.timestamp,
        updatedAt: m.timestamp,
        metadata: {
          synthetic: true,
          patternName: m.patternName,
        },
        fidelity: 'standard',
        securityTier: 'Tier1_General',
      }));

      const result = await collection.insertMany(batch);
      inserted += result.insertedCount;
    }

    return inserted;
  } finally {
    await client.close();
  }
}

// ============================================================================
// Verification
// ============================================================================

async function verifyAccessRecords(mongoUri: string, userId: string): Promise<void> {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('accessHistory');

    const count = await collection.countDocuments({ userId, synthetic: true });
    const earliest = await collection.findOne(
      { userId, synthetic: true },
      { sort: { timestamp: 1 } }
    );
    const latest = await collection.findOne(
      { userId, synthetic: true },
      { sort: { timestamp: -1 } }
    );

    console.error('\n=== Verification ===');
    console.error(`Access records in DB: ${count}`);
    if (earliest) console.error(`Earliest: ${earliest.timestamp}`);
    if (latest) console.error(`Latest: ${latest.timestamp}`);
    console.error('====================\n');
  } finally {
    await client.close();
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const config = parseArgs();
  console.error(`[Synthetic Loader] Profile: ${config.profile}, Days: ${config.days}, User: ${config.userId}`);

  // Generate dataset(s)
  let datasets: TemporalDataset[];
  const profile = PROFILES[config.profile];

  if (profile.users > 1) {
    const users = Array.from({ length: profile.users }, (_, i) => ({
      userId: `${config.userId}_${i}`,
      days: config.days,
    }));
    datasets = generateMultiUserDataset({ users });
  } else {
    datasets = [generateTemporalDataset(config.userId, config.days)];
  }

  // Print summaries
  for (const ds of datasets) {
    printDatasetSummary(ds);
  }

  if (config.dryRun) {
    console.error('[Synthetic Loader] Dry run - no data loaded.');
    const detections = getExpectedDetections(datasets[0]);
    console.error('\nExpected pattern detections:');
    for (const d of detections) {
      console.error(`  ${d.patternName}: ${d.eventCount} events, detect@21=${d.shouldBeDetectedByDay21}, stable@63=${d.shouldBeStableByDay63}`);
    }
    return;
  }

  // Authenticate with API
  console.error('[Synthetic Loader] Authenticating...');
  let apiKey: string;
  try {
    apiKey = await authenticate();
    console.error('[Synthetic Loader] Authenticated.');
  } catch (err) {
    console.error(`[Synthetic Loader] Auth failed: ${err}. Continuing with direct MongoDB only.`);
    apiKey = '';
  }

  for (const dataset of datasets) {
    const { memories, accessRecords, metadata } = dataset;
    console.error(`\n[Synthetic Loader] Loading ${metadata.userId}: ${memories.length} memories, ${accessRecords.length} access records`);

    // Store memories
    if (apiKey) {
      // Via API (memories get current timestamp from server)
      let stored = 0;
      let failed = 0;
      for (let i = 0; i < memories.length; i++) {
        const ok = await storeMemoryViaApi(apiKey, memories[i]);
        if (ok) stored++;
        else failed++;

        // Rate limiting: 10 per second
        if (i > 0 && i % 10 === 0) {
          await new Promise(r => setTimeout(r, 1000));
          process.stderr.write(`\r  Stored: ${stored}/${memories.length} (${failed} failed)`);
        }
      }
      console.error(`\n  API memories stored: ${stored} (${failed} failed)`);
    }

    // Direct MongoDB: insert memories with correct timestamps
    if (!config.apiOnly) {
      console.error('  Inserting backdated memories directly into MongoDB...');
      const memInserted = await insertMemoriesDirect(config.mongoUri, memories);
      console.error(`  Direct memories inserted: ${memInserted}`);

      // Insert access records (backdated)
      console.error('  Inserting backdated access records...');
      const inserted = await insertAccessRecords(config.mongoUri, accessRecords);
      console.error(`  Access records inserted: ${inserted}`);

      // Verify
      await verifyAccessRecords(config.mongoUri, metadata.userId);
    }
  }

  console.error('[Synthetic Loader] Done. Run pattern detection to verify:');
  console.error('  MCP tool: get_pattern_stats');
  console.error('  MCP tool: get_anticipated_context');
}

main().catch(err => {
  console.error('[Synthetic Loader] Fatal:', err);
  process.exit(1);
});
