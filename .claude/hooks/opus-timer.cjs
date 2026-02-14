#!/usr/bin/env node
/**
 * Opus Timer - "Be back in N minutes"
 *
 * Usage: node opus-timer.cjs <minutes> [message]
 *
 * Shows countdown, stores wake time in Redis via MemoRable.
 * Hit Ctrl+C to cancel early.
 */

const { execSync } = require('child_process');

const BASE_URL = process.env.MEMORABLE_API_URL;
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';

function curl(method, url, apiKey, data) {
  try {
    let cmd = `curl -s -X ${method} "${url}" -H "Content-Type: application/json"`;
    if (apiKey) cmd += ` -H "X-API-Key: ${apiKey}"`;
    if (data) cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\\''")}'`;
    return JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 10000 }));
  } catch { return null; }
}

function authenticate() {
  const knock = curl('POST', `${BASE_URL}/auth/knock`, null, {
    device: { type: 'terminal', name: 'OpusTimer' }
  });
  if (!knock?.challenge) return null;
  const exchange = curl('POST', `${BASE_URL}/auth/exchange`, null, {
    challenge: knock.challenge,
    passphrase: PASSPHRASE,
    device: { type: 'terminal', name: 'OpusTimer' }
  });
  return exchange?.api_key || null;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function main() {
  const minutes = parseInt(process.argv[2]) || 10;
  const message = process.argv[3] || 'Opus will be back';
  const wakeTime = new Date(Date.now() + minutes * 60 * 1000);

  console.log(`\n⏰ ${message} in ${minutes} minutes (${wakeTime.toLocaleTimeString()})`);
  console.log(`   Press Ctrl+C to wake early\n`);

  // Store wake time in MemoRable
  const apiKey = authenticate();
  if (apiKey) {
    curl('POST', `${BASE_URL}/memory`, apiKey, {
      content: `[TIMER SET] ${message} - wake at ${wakeTime.toISOString()}. Duration: ${minutes} minutes.`,
      entities: ['opus_timer', 'alan'],
      metadata: { type: 'timer', wake_time: wakeTime.toISOString(), minutes }
    });
  }

  let remaining = minutes * 60;

  process.on('SIGINT', () => {
    console.log('\n\n👋 Waking early! Timer cancelled.\n');
    process.exit(0);
  });

  const interval = setInterval(() => {
    remaining--;
    process.stdout.write(`\r   ⏳ ${formatTime(remaining)} remaining...   `);

    if (remaining <= 0) {
      clearInterval(interval);
      console.log('\n\n🔔 TIME! Opus is back.\n');

      // Store completion
      if (apiKey) {
        curl('POST', `${BASE_URL}/memory`, apiKey, {
          content: `[TIMER COMPLETE] ${message} - timer finished at ${new Date().toISOString()}`,
          entities: ['opus_timer', 'alan'],
          metadata: { type: 'timer_complete' }
        });
      }
      process.exit(0);
    }
  }, 1000);
}

main();
