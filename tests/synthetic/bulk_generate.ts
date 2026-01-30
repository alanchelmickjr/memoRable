#!/usr/bin/env npx tsx
/**
 * Bulk Synthetic Generator - 180k memories via parallel REST API
 */

const API_URL = 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = 'I remember what I have learned from you.';
const TOTAL = 180_000;
const DAYS = 66;
// Rate limit is 100/min. With 2 concurrent and 1.3s delay = ~92/min
const CONCURRENCY = 2;
const DELAY_MS = 1300;

const ACTIVITIES = ['standup', 'coding', 'review', 'meeting', 'planning', 'debugging', 'testing', 'deployment', 'research', 'design'];
const LOCATIONS = ['office', 'home', 'conference_room', 'coffee_shop', 'remote'];
const PEOPLE = ['Sarah', 'Mike', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Riley', 'Quinn'];
const TOPICS = ['API design', 'database', 'user feedback', 'sprint', 'bug fix', 'feature', 'performance', 'security', 'testing', 'deployment'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

async function auth(): Promise<string> {
  const kRes = await fetch(`${API_URL}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: { type: 'bulk', name: 'Generator' } })
  });
  const k = await kRes.json();
  if (!k.challenge) {
    console.log('Auth knock failed:', JSON.stringify(k));
    throw new Error('No challenge from knock');
  }

  const eRes = await fetch(`${API_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: k.challenge, passphrase: PASSPHRASE, device: { type: 'bulk', name: 'Generator' } })
  });
  const e = await eRes.json();
  if (!e.api_key) {
    console.log('Auth exchange failed:', JSON.stringify(e));
    throw new Error('No api_key from exchange');
  }

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

async function post(key: string, mem: any): Promise<{ ok: boolean; status?: number; error?: string; retryAfter?: number }> {
  try {
    const r = await fetch(`${API_URL}/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
        'X-Bulk-Synthetic': 'true'
      },
      body: JSON.stringify(mem)
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const retryAfter = r.status === 429 ? parseInt(r.headers.get('retry-after') || '60') : undefined;
      return { ok: false, status: r.status, error: text.slice(0, 100), retryAfter };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\n=== BULK GENERATOR: ${TOTAL.toLocaleString()} memories ===\n`);

  let key = await auth();
  console.log('Authenticated');
  console.log('Starting generation...');

  let done = 0, fail = 0, reauths = 0, consecutiveFails = 0;
  const start = Date.now();
  const perDay = Math.ceil(TOTAL / DAYS);

  console.log(`Per day target: ${perDay}`);

  for (let day = 0; day < DAYS; day++) {
    let dayDone = 0;

    while (dayDone < perDay && done + fail < TOTAL) {
      // Create batch of promises
      const batch: Promise<{ ok: boolean; status?: number; error?: string }>[] = [];
      for (let j = 0; j < CONCURRENCY && dayDone + j < perDay; j++) {
        batch.push(post(key, genMemory(day)));
      }

      // Execute batch
      const results = await Promise.all(batch);
      let batchFails = 0;
      let batchOK = 0;
      results.forEach(r => {
        if (r.ok) {
          done++;
          batchOK++;
        } else {
          fail++;
          batchFails++;
          if (fail <= 5) {
            // Log first 5 failures
            console.log(`FAIL: status=${r.status} error=${r.error}`);
          }
        }
      });

      // Reset consecutive fails if any succeeded, otherwise accumulate
      if (batchOK > 0) {
        consecutiveFails = 0;
      } else {
        consecutiveFails += batchFails;
      }

      // Progress every 500 memories
      if (done > 0 && done % 500 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / elapsed;
        console.log(`Progress: ${done.toLocaleString()} @ ${rate.toFixed(1)}/s`);
      }
      dayDone += batch.length;

      // Check for rate limiting (429)
      const rateLimited = results.find(r => r.status === 429);
      if (rateLimited && rateLimited.retryAfter) {
        console.log(`Rate limited. Waiting ${rateLimited.retryAfter}s...`);
        await new Promise(r => setTimeout(r, rateLimited.retryAfter * 1000));
      } else {
        // Normal delay between requests
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      // Only re-auth after 50+ consecutive failures (real auth problems)
      if (consecutiveFails > 50 && reauths < 10) {
        console.log(`Re-authenticating after ${consecutiveFails} consecutive failures...`);
        key = await auth();
        reauths++;
        consecutiveFails = 0;
      }
    }

    const elapsed = (Date.now() - start) / 1000;
    const rate = elapsed > 0 ? done / elapsed : 0;
    const eta = rate > 0 ? (TOTAL - done - fail) / rate : 0;
    console.log(`Day ${day + 1}/${DAYS} | ${done.toLocaleString()} ok | ${fail} fail | ${rate.toFixed(0)}/s | ETA: ${Math.ceil(eta / 60)}m`);
  }

  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Done: ${done.toLocaleString()}`);
  console.log(`Failed: ${fail}`);
  console.log(`Time: ${((Date.now() - start) / 1000 / 60).toFixed(1)}m`);
}

main().catch(e => { console.error(e); process.exit(1); });
