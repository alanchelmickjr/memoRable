#!/usr/bin/env node
/**
 * Slack XML Ingestion Script for MemoRable Beta Testing
 *
 * "stop using Slack and start letting Slack use you" - Alan
 *
 * Parses Slack XML exports and ingests to MemoRable API for:
 * - Salience scoring
 * - Relationship tracking
 * - Pattern learning (21-day baseline)
 * - Predictive intelligence
 */

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const API_BASE = process.env.MEMORABLE_API || 'http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

async function ingestMessage(message, channel, team) {
  const memory = {
    content: message.text,
    entities: [message.user, `channel:${channel}`, `team:${team}`],
    entityType: 'conversation',
    context: {
      source: 'slack',
      channel,
      team,
      conversation_id: message['@_conversation_id'],
      timestamp: message.ts
    },
    metadata: {
      imported: true,
      import_date: new Date().toISOString()
    }
  };

  try {
    const response = await fetch(`${API_BASE}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memory)
    });

    if (!response.ok) {
      console.error(`Failed to ingest: ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Network error: ${error.message}`);
    return false;
  }
}

async function parseSlackXML(filePath) {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const data = parser.parse(xml);

  const slack = data.slack;
  const team = slack.team_domain;
  const channel = slack.channel_name;

  let messages = slack.message || [];
  if (!Array.isArray(messages)) {
    messages = [messages];
  }

  return { team, channel, messages };
}

async function ingestFile(filePath, options = {}) {
  const { dryRun = false, limit = 0, delay = 100 } = options;

  console.log(`\n📁 Processing: ${filePath}`);

  const { team, channel, messages } = await parseSlackXML(filePath);
  console.log(`   Team: ${team}, Channel: ${channel}`);
  console.log(`   Messages: ${messages.length}`);

  const toProcess = limit > 0 ? messages.slice(0, limit) : messages;
  let success = 0;
  let failed = 0;

  for (const msg of toProcess) {
    if (!msg.text || msg.text.trim() === '') continue;

    if (dryRun) {
      console.log(`   [DRY] ${msg.user}: ${msg.text.slice(0, 50)}...`);
      success++;
    } else {
      const ok = await ingestMessage(msg, channel, team);
      if (ok) success++;
      else failed++;

      // Rate limiting
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`   ✓ Ingested: ${success}, Failed: ${failed}`);
  return { success, failed };
}

async function ingestDirectory(dirPath, options = {}) {
  const files = [];

  function walkDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (item.endsWith('.xml')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(dirPath);
  console.log(`\n🔍 Found ${files.length} XML files in ${dirPath}`);

  let totalSuccess = 0;
  let totalFailed = 0;

  for (const file of files) {
    const { success, failed } = await ingestFile(file, options);
    totalSuccess += success;
    totalFailed += failed;
  }

  console.log(`\n📊 Total: ${totalSuccess} ingested, ${totalFailed} failed`);
  return { totalSuccess, totalFailed };
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

const target = args.find(a => !a.startsWith('--') && !parseInt(a));

if (!target) {
  console.log(`
MemoRable Slack Ingestion

Usage:
  node scripts/ingest-slack.js <path-to-xml-or-directory> [options]

Options:
  --dry-run    Preview without ingesting
  --limit N    Only ingest N messages per file

Examples:
  node scripts/ingest-slack.js test-data/slack-chats/data/pythondev --dry-run --limit 5
  node scripts/ingest-slack.js test-data/slack-chats/data/ --limit 100
  `);
  process.exit(1);
}

const stat = fs.statSync(target);
if (stat.isDirectory()) {
  ingestDirectory(target, { dryRun, limit });
} else {
  ingestFile(target, { dryRun, limit });
}
