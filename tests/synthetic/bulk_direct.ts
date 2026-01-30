#!/usr/bin/env npx tsx
/**
 * Direct Bulk Generator - 180k memories directly to MongoDB Atlas
 * No rate limits, no REST overhead. Runs on the stack.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || '';
const TOTAL = 180_000;
const DAYS = 66;
const BATCH_SIZE = 1000;  // Insert 1000 at a time

const ACTIVITIES = ['standup', 'coding', 'review', 'meeting', 'planning', 'debugging', 'testing', 'deployment', 'research', 'design'];
const LOCATIONS = ['office', 'home', 'conference_room', 'coffee_shop', 'remote'];
const PEOPLE = ['Sarah', 'Mike', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Riley', 'Quinn'];
const TOPICS = ['API design', 'database', 'user feedback', 'sprint', 'bug fix', 'feature', 'performance', 'security', 'testing', 'deployment'];
const EMOTIONS = ['focused', 'stressed', 'excited', 'calm', 'frustrated', 'satisfied', 'curious', 'tired'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const pickN = <T>(a: T[], n: number): T[] => {
  const shuffled = [...a].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};

function genMemory(day: number, index: number): any {
  const now = new Date();
  const ts = new Date(now.getTime() - (DAYS - day) * 24 * 60 * 60 * 1000);
  ts.setHours(6 + Math.floor(Math.random() * 16), Math.floor(Math.random() * 60));

  const activity = pick(ACTIVITIES);
  const person = pick(PEOPLE);
  const topic = pick(TOPICS);
  const location = pick(LOCATIONS);

  return {
    memoryId: `synthetic_${day}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 'synthetic_test_user',
    text: `${activity} with ${person} about ${topic} at ${location}.`,
    createdAt: ts.toISOString(),
    salienceScore: 30 + Math.floor(Math.random() * 50),  // 30-80
    extractedFeatures: {
      peopleMentioned: [person],
      topics: [topic],
      activities: [activity],
      locations: [location],
      emotionalKeywords: [pick(EMOTIONS)],
      sentiment: Math.random() > 0.3 ? 'positive' : 'neutral',
    },
    tags: ['synthetic', activity],
    state: 'active',
    metadata: {
      synthetic: true,
      generatedAt: new Date().toISOString(),
      dayIndex: day,
    },
    context: {
      location,
      activity,
      people: [person],
    },
  };
}

async function main() {
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set');
    console.log('Set it in .env or export MONGODB_URI=...');
    process.exit(1);
  }

  console.log(`\n=== DIRECT BULK GENERATOR: ${TOTAL.toLocaleString()} memories ===\n`);
  console.log(`Connecting to MongoDB...`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('memorable');
  const memories = db.collection('memories');

  console.log('Connected');
  console.log('Starting generation...\n');

  const start = Date.now();
  let done = 0;
  const perDay = Math.ceil(TOTAL / DAYS);

  for (let day = 0; day < DAYS; day++) {
    const dayMemories: any[] = [];

    for (let i = 0; i < perDay && done + dayMemories.length < TOTAL; i++) {
      dayMemories.push(genMemory(day, i));
    }

    // Insert in batches
    for (let i = 0; i < dayMemories.length; i += BATCH_SIZE) {
      const batch = dayMemories.slice(i, i + BATCH_SIZE);
      await memories.insertMany(batch);
      done += batch.length;
    }

    const elapsed = (Date.now() - start) / 1000;
    const rate = done / elapsed;
    const eta = rate > 0 ? (TOTAL - done) / rate : 0;
    console.log(`Day ${day + 1}/${DAYS} | ${done.toLocaleString()} done | ${rate.toFixed(0)}/s | ETA: ${Math.ceil(eta / 60)}m`);
  }

  await client.close();

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total: ${done.toLocaleString()}`);
  console.log(`Time: ${((Date.now() - start) / 1000 / 60).toFixed(1)}m`);
}

main().catch(e => { console.error(e); process.exit(1); });
