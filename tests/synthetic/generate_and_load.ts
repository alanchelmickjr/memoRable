#!/usr/bin/env npx tsx
/**
 * Synthetic Data Generator & Loader
 *
 * Generates realistic temporal patterns and loads via REST API.
 *
 * Usage:
 *   npx tsx tests/synthetic/generate_and_load.ts              # Smoke test (100 events)
 *   npx tsx tests/synthetic/generate_and_load.ts --standard   # Standard (500 events)
 *   npx tsx tests/synthetic/generate_and_load.ts --stress     # Stress test (5000 events)
 */

// =============================================================================
// CONFIG
// =============================================================================

const API_URL = process.env.MEMORABLE_API_URL || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';
const PASSPHRASE = process.env.MEMORABLE_PASSPHRASE || 'I remember what I have learned from you.';
const USER_ID = 'synthetic_test_user';

// Profiles
const PROFILES = {
  smoke: { events: 100, days: 21 },
  standard: { events: 500, days: 63 },
  stress: { events: 5000, days: 84 }
};

// Pattern templates with realistic content
const PATTERNS = {
  daily_morning: {
    frequency: 'daily',
    timeOfDay: 9, // 9am
    jitterHours: 2,
    skipRate: 0.1,
    contents: [
      'Morning standup with the team. Discussed sprint progress.',
      'Daily sync completed. Key blockers identified.',
      'Started the day with team alignment call.',
      'Morning check-in done. All systems green.',
      'Daily planning session. Prioritized today\'s tasks.'
    ],
    activity: 'standup',
    location: 'office'
  },
  daily_evening: {
    frequency: 'daily',
    timeOfDay: 18, // 6pm
    jitterHours: 1,
    skipRate: 0.15,
    contents: [
      'End of day reflection. Good progress on the API.',
      'Wrapped up coding for the day. Tests passing.',
      'Evening wind-down. Documented today\'s decisions.',
      'Daily log: completed 3 tickets, reviewed 2 PRs.',
      'Finished work. Ready to disconnect.'
    ],
    activity: 'reflection',
    location: 'home'
  },
  weekly_wednesday: {
    frequency: 'weekly',
    dayOfWeek: 3, // Wednesday
    timeOfDay: 14, // 2pm
    jitterHours: 1,
    skipRate: 0.05,
    contents: [
      'Weekly product review with stakeholders. Demo went well.',
      'Wednesday all-hands. New features announced.',
      'Team retrospective. Identified 3 improvements.',
      'Weekly sync with leadership. Roadmap on track.',
      'Product planning session. Q2 goals finalized.'
    ],
    activity: 'meeting',
    location: 'conference_room',
    people: ['Sarah', 'Mike', 'Product Team']
  },
  weekly_friday: {
    frequency: 'weekly',
    dayOfWeek: 5, // Friday
    timeOfDay: 16, // 4pm
    jitterHours: 1,
    skipRate: 0.1,
    contents: [
      'Friday demo day. Showed new pipeline dashboard.',
      'Week wrap-up. Sprint goals achieved.',
      'End of week review. 80% of planned work done.',
      'Friday retrospective. Team morale high.',
      'Weekly metrics review. Usage up 20%.'
    ],
    activity: 'demo',
    location: 'office'
  },
  monthly_review: {
    frequency: 'monthly',
    dayOfMonth: 15,
    timeOfDay: 10,
    jitterHours: 24, // Can vary by a day
    skipRate: 0.0,
    contents: [
      'Monthly business review. Revenue targets hit.',
      'Monthly planning complete. Next month\'s OKRs set.',
      'Monthly investor update prepared.',
      'Monthly metrics deep-dive. Retention improving.'
    ],
    activity: 'review',
    location: 'boardroom',
    people: ['CEO', 'CFO', 'Leadership']
  }
};

// People for relationship testing
const PEOPLE = ['Sarah', 'Mike', 'Alex', 'Jordan', 'Casey'];

// =============================================================================
// GENERATOR
// =============================================================================

interface SyntheticMemory {
  content: string;
  timestamp: Date;
  salience: number;
  entities: string[];
  context: {
    location?: string;
    activity?: string;
    people?: string[];
  };
  metadata: {
    synthetic: boolean;
    pattern: string;
  };
}

function generateMemories(profile: { events: number; days: number }): SyntheticMemory[] {
  const memories: SyntheticMemory[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - profile.days * 24 * 60 * 60 * 1000);

  // Distribute events across patterns
  const patternsArray = Object.entries(PATTERNS);
  const eventsPerPattern = Math.ceil(profile.events / patternsArray.length);

  for (const [patternName, pattern] of patternsArray) {
    let eventCount = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= now && eventCount < eventsPerPattern) {
      // Check if this day matches the pattern
      let shouldGenerate = false;

      if (pattern.frequency === 'daily') {
        shouldGenerate = true;
      } else if (pattern.frequency === 'weekly' && pattern.dayOfWeek !== undefined) {
        shouldGenerate = currentDate.getDay() === pattern.dayOfWeek;
      } else if (pattern.frequency === 'monthly' && pattern.dayOfMonth !== undefined) {
        shouldGenerate = currentDate.getDate() === pattern.dayOfMonth;
      }

      // Apply skip rate
      if (shouldGenerate && Math.random() > pattern.skipRate) {
        // Apply time jitter
        const jitter = (Math.random() - 0.5) * 2 * pattern.jitterHours;
        const eventTime = new Date(currentDate);
        eventTime.setHours(pattern.timeOfDay + jitter, Math.floor(Math.random() * 60), 0, 0);

        // Pick random content
        const content = pattern.contents[Math.floor(Math.random() * pattern.contents.length)];

        // Generate salience (0.4 - 0.9)
        const salience = 0.4 + Math.random() * 0.5;

        // Build entities
        const entities = [USER_ID, patternName];
        if (pattern.people) {
          entities.push(...pattern.people.slice(0, Math.floor(Math.random() * pattern.people.length) + 1));
        }

        memories.push({
          content,
          timestamp: eventTime,
          salience,
          entities,
          context: {
            location: pattern.location,
            activity: pattern.activity,
            people: pattern.people
          },
          metadata: {
            synthetic: true,
            pattern: patternName
          }
        });

        eventCount++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Sort by timestamp
  memories.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return memories;
}

// =============================================================================
// LOADER
// =============================================================================

async function authenticate(): Promise<string> {
  console.log('Authenticating...');

  // Step 1: Knock
  const knockRes = await fetch(`${API_URL}/auth/knock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: { type: 'synthetic', name: 'Generator' } })
  });
  const knockData = await knockRes.json();
  if (!knockData.challenge) throw new Error('Failed to get challenge');

  // Step 2: Exchange
  const exchangeRes = await fetch(`${API_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: knockData.challenge,
      passphrase: PASSPHRASE,
      device: { type: 'synthetic', name: 'Generator' }
    })
  });
  const exchangeData = await exchangeRes.json();
  if (!exchangeData.api_key) throw new Error('Failed to get API key');

  console.log('Authenticated.');
  return exchangeData.api_key;
}

async function loadMemory(apiKey: string, memory: SyntheticMemory): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        text: memory.content,
        entities: memory.entities,
        context: memory.context,
        metadata: memory.metadata,
        // Backdate the memory
        createdAt: memory.timestamp.toISOString()
      })
    });

    return res.ok;
  } catch (err) {
    return false;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  let profileName: keyof typeof PROFILES = 'smoke';

  if (args.includes('--standard')) profileName = 'standard';
  if (args.includes('--stress')) profileName = 'stress';

  const profile = PROFILES[profileName];

  console.log(`\n=== SYNTHETIC DATA GENERATOR ===`);
  console.log(`Profile: ${profileName}`);
  console.log(`Events: ${profile.events}`);
  console.log(`Days: ${profile.days}`);
  console.log(`API: ${API_URL}\n`);

  // Generate
  console.log('Generating synthetic memories...');
  const memories = generateMemories(profile);
  console.log(`Generated ${memories.length} memories\n`);

  // Authenticate
  const apiKey = await authenticate();

  // Load
  console.log('\nLoading memories...');
  let loaded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < memories.length; i++) {
    const success = await loadMemory(apiKey, memories[i]);
    if (success) {
      loaded++;
      process.stdout.write('.');
    } else {
      failed++;
      process.stdout.write('x');
    }

    // Rate limit: 10 per second
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(` [${i + 1}/${memories.length}]`);
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Loaded:  ${loaded}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Rate:    ${(loaded / duration).toFixed(1)} memories/sec`);
  console.log(`Duration: ${duration.toFixed(1)}s`);
  console.log(`\nCheck dashboard: ${API_URL}/dashboard/synthetic`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
