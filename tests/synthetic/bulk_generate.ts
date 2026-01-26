#!/usr/bin/env npx tsx
/**
 * Bulk Synthetic Data Generator
 *
 * Generates 180,000 memories over 66 days and bulk inserts to MongoDB.
 *
 * Usage:
 *   MONGODB_URI=mongodb+srv://... npx tsx tests/synthetic/bulk_generate.ts
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

// =============================================================================
// CONFIG
// =============================================================================

const TOTAL_MEMORIES = 180_000;
const DAYS = 66;
const MEMORIES_PER_DAY = Math.ceil(TOTAL_MEMORIES / DAYS); // ~2,727
const BATCH_SIZE = 1000;
const USER_ID = 'synthetic_test_user';

// Pattern templates
const ACTIVITIES = [
  'standup', 'coding', 'review', 'meeting', 'planning', 'debugging',
  'documentation', 'testing', 'deployment', 'support', 'research',
  'design', 'interview', 'training', 'break', 'lunch', 'sync'
];

const LOCATIONS = [
  'office', 'home', 'conference_room', 'coffee_shop', 'coworking',
  'client_site', 'remote', 'boardroom', 'lab', 'studio'
];

const PEOPLE = [
  'Sarah', 'Mike', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor',
  'Jamie', 'Riley', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Emery',
  'Finley', 'Harper', 'Kennedy', 'Logan', 'Parker', 'Reese'
];

const TOPICS = [
  'API design', 'database optimization', 'user feedback', 'sprint planning',
  'bug fix', 'feature request', 'performance', 'security review', 'testing',
  'deployment', 'monitoring', 'documentation', 'onboarding', 'retrospective',
  'roadmap', 'architecture', 'refactoring', 'integration', 'migration'
];

const TEMPLATES = [
  '{activity} session with {person}. Discussed {topic}.',
  'Working on {topic} at {location}. Good progress.',
  'Met with {person} about {topic}. Action items identified.',
  '{activity} completed. {topic} is now ready for review.',
  'Quick sync with {person} on {topic}. Aligned on next steps.',
  'Deep work on {topic}. No interruptions at {location}.',
  '{person} raised concerns about {topic}. Need to follow up.',
  'Finished {activity} for {topic}. Moving to next priority.',
  'Blocked on {topic}. Reached out to {person} for help.',
  'Breakthrough on {topic}! {person} had the key insight.',
  'Reviewing {topic} changes with {person} at {location}.',
  'End of day: {topic} at 80%. Will continue tomorrow.',
  'Morning focus on {topic}. {activity} scheduled for afternoon.',
  '{person} demo of {topic}. Team impressed with progress.',
  'Pairing with {person} on {topic}. Learning new approaches.'
];

// =============================================================================
// GENERATOR
// =============================================================================

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateContent(): string {
  const template = pick(TEMPLATES);
  return template
    .replace('{activity}', pick(ACTIVITIES))
    .replace('{location}', pick(LOCATIONS))
    .replace('{person}', pick(PEOPLE))
    .replace('{topic}', pick(TOPICS));
}

function generateMemory(timestamp: Date) {
  const activity = pick(ACTIVITIES);
  const location = pick(LOCATIONS);
  const people = [pick(PEOPLE)];
  if (Math.random() > 0.7) people.push(pick(PEOPLE));

  const hour = timestamp.getHours();
  let timeOfDay = 'morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  if (hour >= 17) timeOfDay = 'evening';

  // Determine pattern type based on regularity
  const dayOfWeek = timestamp.getDay();
  const dayOfMonth = timestamp.getDate();
  let patternType = 'irregular';

  // Daily patterns (morning standup, evening reflection)
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19)) {
    patternType = 'daily';
  }
  // Weekly patterns (Wed/Fri meetings)
  if ((dayOfWeek === 3 || dayOfWeek === 5) && hour >= 13 && hour <= 16) {
    patternType = 'weekly';
  }
  // Monthly patterns (15th of month)
  if (dayOfMonth === 15) {
    patternType = 'monthly';
  }

  return {
    _id: crypto.randomUUID(),
    userId: USER_ID,
    content: generateContent(),
    createdAt: timestamp,
    updatedAt: timestamp,
    salienceScore: 40 + Math.floor(Math.random() * 50), // 40-90
    entities: [USER_ID, activity, ...people],
    contextFrame: {
      location,
      activity,
      people,
      timeOfDay,
      dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]
    },
    metadata: {
      synthetic: true,
      patternType,
      generatedAt: new Date().toISOString()
    },
    extractedFeatures: {
      topics: [pick(TOPICS)],
      emotionalKeywords: [],
      actionItems: Math.random() > 0.7 ? [`Follow up on ${pick(TOPICS)}`] : []
    },
    accessHistory: [{
      timestamp,
      contextFrame: { activity, location }
    }]
  };
}

function* generateMemories(): Generator<any[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);

  let batch: any[] = [];
  let totalGenerated = 0;

  for (let day = 0; day < DAYS; day++) {
    const dayStart = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);

    // Generate memories throughout the day (6am - 10pm)
    for (let i = 0; i < MEMORIES_PER_DAY && totalGenerated < TOTAL_MEMORIES; i++) {
      const hour = 6 + Math.floor(Math.random() * 16); // 6am - 10pm
      const minute = Math.floor(Math.random() * 60);
      const timestamp = new Date(dayStart);
      timestamp.setHours(hour, minute, Math.floor(Math.random() * 60), 0);

      batch.push(generateMemory(timestamp));
      totalGenerated++;

      if (batch.length >= BATCH_SIZE) {
        yield batch;
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable required');
    console.error('Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/memorable');
    process.exit(1);
  }

  console.log(`\n=== BULK SYNTHETIC GENERATOR ===`);
  console.log(`Target: ${TOTAL_MEMORIES.toLocaleString()} memories`);
  console.log(`Days: ${DAYS}`);
  console.log(`Per day: ~${MEMORIES_PER_DAY.toLocaleString()}`);
  console.log(`Batch size: ${BATCH_SIZE}\n`);

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('memorable');
    const collection = db.collection('memories');

    let inserted = 0;
    let batchNum = 0;
    const startTime = Date.now();

    for (const batch of generateMemories()) {
      await collection.insertMany(batch, { ordered: false });
      inserted += batch.length;
      batchNum++;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = inserted / elapsed;
      const eta = (TOTAL_MEMORIES - inserted) / rate;

      process.stdout.write(`\rBatch ${batchNum}: ${inserted.toLocaleString()} inserted (${rate.toFixed(0)}/sec, ETA: ${Math.ceil(eta)}s)    `);
    }

    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n\n=== COMPLETE ===`);
    console.log(`Inserted: ${inserted.toLocaleString()}`);
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Rate: ${(inserted / duration).toFixed(0)} memories/sec`);

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
