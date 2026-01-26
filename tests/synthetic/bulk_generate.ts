#!/usr/bin/env npx tsx
/**
 * Bulk Synthetic Generator - 180k memories via parallel REST API
 */

const API_URL = 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = 'I remember what I have learned from you.';
const TOTAL = 180_000;
const DAYS = 66;
const CONCURRENCY = 20;

const ACTIVITIES = ['standup', 'coding', 'review', 'meeting', 'planning', 'debugging', 'testing', 'deployment', 'research', 'design'];
const LOCATIONS = ['office', 'home', 'conference_room', 'coffee_shop', 'remote'];
const PEOPLE = ['Sarah', 'Mike', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Riley', 'Quinn'];
const TOPICS = ['API design', 'database', 'user feedback', 'sprint', 'bug fix', 'feature', 'performance', 'security', 'testing', 'deployment'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

async function auth(): Promise<string> {
  const k = await fetch(`${API_URL}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: { type: 'bulk', name: 'Generator' } })
  }).then(r => r.json());

  const e = await fetch(`${API_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: k.challenge, passphrase: PASSPHRASE, device: { type: 'bulk', name: 'Generator' } })
  }).then(r => r.json());

  return e.api_key;
}

function genMemory(day: number): any {
  const now = new Date();
  const ts = new Date(now.getTime() - (DAYS - day) * 24 * 60 * 60 * 1000);
  ts.setHours(6 + Math.floor(Math.random() * 16), Math.floor(Math.random() * 60));

  return {
    content: `${pick(ACTIVITIES)} with ${pick(PEOPLE)} about ${pick(TOPICS)} at ${pick(LOCATIONS)}.`,
    entities: ['synthetic_test_user', pick(ACTIVITIES)],
    context: { location: pick(LOCATIONS), activity: pick(ACTIVITIES), people: [pick(PEOPLE)] },
    metadata: { synthetic: true },
    createdAt: ts.toISOString()
  };
}

async function post(key: string, mem: any): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify(mem)
    });
    return r.ok;
  } catch { return false; }
}

async function main() {
  console.log(`\n=== BULK GENERATOR: ${TOTAL.toLocaleString()} memories ===\n`);

  let key = await auth();
  console.log('Authenticated\n');

  let done = 0, fail = 0, reauths = 0;
  const start = Date.now();
  const perDay = Math.ceil(TOTAL / DAYS);

  for (let day = 0; day < DAYS; day++) {
    const batch: Promise<boolean>[] = [];

    for (let i = 0; i < perDay && done + fail < TOTAL; i++) {
      batch.push(post(key, genMemory(day)));

      if (batch.length >= CONCURRENCY) {
        const results = await Promise.all(batch);
        results.forEach(r => r ? done++ : fail++);
        batch.length = 0;

        // Re-auth on failures
        if (fail > done * 0.1 && reauths < 50) {
          key = await auth();
          reauths++;
        }
      }
    }

    if (batch.length) {
      const results = await Promise.all(batch);
      results.forEach(r => r ? done++ : fail++);
    }

    const rate = done / ((Date.now() - start) / 1000);
    const eta = (TOTAL - done - fail) / rate;
    process.stdout.write(`\rDay ${day + 1}/${DAYS} | ${done.toLocaleString()} done | ${fail} fail | ${rate.toFixed(0)}/s | ETA: ${Math.ceil(eta / 60)}m    `);
  }

  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Done: ${done.toLocaleString()}`);
  console.log(`Failed: ${fail}`);
  console.log(`Time: ${((Date.now() - start) / 1000 / 60).toFixed(1)}m`);
}

main().catch(e => { console.error(e); process.exit(1); });
