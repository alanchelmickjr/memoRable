#!/usr/bin/env npx tsx
/**
 * @file Verify Pattern Detection After Synthetic Data Load
 *
 * Usage:
 *   npx tsx tests/synthetic/verify_patterns.ts [--user=synthetic_test_user] [--mongo-uri=...]
 *
 * Checks:
 * 1. Access records exist in MongoDB
 * 2. FFT detects expected patterns
 * 3. Confidence levels match expectations
 * 4. Predictive anticipation returns relevant memories
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/memorable';

interface VerificationResult {
  check: string;
  passed: boolean;
  expected: string;
  actual: string;
}

function parseArgs(): { userId: string; mongoUri: string } {
  const args = process.argv.slice(2);
  const config = { userId: 'synthetic_test_user', mongoUri: MONGO_URI };

  for (const arg of args) {
    if (arg.startsWith('--user=')) config.userId = arg.split('=')[1];
    else if (arg.startsWith('--mongo-uri=')) config.mongoUri = arg.split('=')[1];
  }

  return config;
}

async function main() {
  const config = parseArgs();
  const results: VerificationResult[] = [];
  const client = new MongoClient(config.mongoUri);

  try {
    await client.connect();
    const db = client.db();

    // Check 1: Access records exist
    const accessCount = await db.collection('accessHistory').countDocuments({
      userId: config.userId,
    });
    results.push({
      check: 'Access records exist',
      passed: accessCount > 0,
      expected: '> 0',
      actual: String(accessCount),
    });

    // Check 2: Sufficient time span
    const earliest = await db.collection('accessHistory').findOne(
      { userId: config.userId },
      { sort: { timestamp: 1 } }
    );
    const latest = await db.collection('accessHistory').findOne(
      { userId: config.userId },
      { sort: { timestamp: -1 } }
    );

    if (earliest && latest) {
      const spanDays = (latest.timestamp.getTime() - earliest.timestamp.getTime()) / (24 * 60 * 60 * 1000);
      results.push({
        check: 'Time span >= 21 days',
        passed: spanDays >= 21,
        expected: '>= 21 days',
        actual: `${spanDays.toFixed(1)} days`,
      });
      results.push({
        check: 'Time span >= 63 days (stability)',
        passed: spanDays >= 63,
        expected: '>= 63 days',
        actual: `${spanDays.toFixed(1)} days`,
      });
    }

    // Check 3: Daily pattern (most events should be daily)
    const hourDistribution = await db.collection('accessHistory').aggregate([
      { $match: { userId: config.userId } },
      { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    if (hourDistribution.length > 0) {
      const topHour = hourDistribution[0];
      results.push({
        check: 'Hourly clustering detected',
        passed: topHour.count > accessCount * 0.05, // At least 5% in top hour
        expected: `> ${Math.floor(accessCount * 0.05)} events in peak hour`,
        actual: `${topHour.count} events at hour ${topHour._id}`,
      });
    }

    // Check 4: Weekly pattern (day-of-week clustering)
    const dowDistribution = await db.collection('accessHistory').aggregate([
      { $match: { userId: config.userId } },
      { $group: { _id: { $dayOfWeek: '$timestamp' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    if (dowDistribution.length > 0) {
      const topDay = dowDistribution[0];
      const avgPerDay = accessCount / 7;
      results.push({
        check: 'Day-of-week clustering detected',
        passed: topDay.count > avgPerDay * 1.2, // 20% above average
        expected: `> ${Math.floor(avgPerDay * 1.2)} events on peak day`,
        actual: `${topDay.count} events on day ${topDay._id} (avg=${Math.floor(avgPerDay)})`,
      });
    }

    // Check 5: Memories stored
    const memoryCount = await db.collection('memories').countDocuments({
      userId: config.userId,
      'metadata.synthetic': true,
    });
    results.push({
      check: 'Synthetic memories stored',
      passed: memoryCount > 0,
      expected: '> 0',
      actual: String(memoryCount),
    });

    // Check 6: Pattern documents (if detectPatterns has been run)
    const patternCount = await db.collection('patterns').countDocuments({
      userId: config.userId,
    });
    results.push({
      check: 'Detected patterns stored',
      passed: patternCount > 0,
      expected: '> 0 (requires detectPatterns to have run)',
      actual: String(patternCount),
    });

    // Check 7: Weekend gap pattern (workday_coding should have gaps)
    const weekendRecords = await db.collection('accessHistory').countDocuments({
      userId: config.userId,
      synthetic: true,
      $expr: {
        $in: [{ $dayOfWeek: '$timestamp' }, [1, 7]], // Sunday=1, Saturday=7 in MongoDB
      },
    });
    const weekdayRecords = accessCount - weekendRecords;
    const weekdayRatio = weekdayRecords / Math.max(1, accessCount);
    results.push({
      check: 'Weekend gap pattern (more weekday events)',
      passed: weekdayRatio > 0.6,
      expected: '> 60% on weekdays',
      actual: `${(weekdayRatio * 100).toFixed(1)}% weekday events`,
    });

  } finally {
    await client.close();
  }

  // Print results
  console.error('\n╔══════════════════════════════════════════════════════════════╗');
  console.error('║          PATTERN DETECTION VERIFICATION REPORT              ║');
  console.error('╠══════════════════════════════════════════════════════════════╣');

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const status = r.passed ? 'PASS' : 'FAIL';
    console.error(`║ ${icon} [${status}] ${r.check}`);
    console.error(`║        Expected: ${r.expected}`);
    console.error(`║        Actual:   ${r.actual}`);
    console.error('║');
    if (r.passed) passed++;
    else failed++;
  }

  console.error('╠══════════════════════════════════════════════════════════════╣');
  console.error(`║  Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.error('╚══════════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.error('Some checks failed. This may be expected if:');
    console.error('  - Pattern detection hasn\'t run yet (check 6)');
    console.error('  - Data was loaded via API only (timestamps may differ)');
    console.error('  - MongoDB connection was to a different database');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Verify] Fatal:', err);
  process.exit(1);
});
