#!/usr/bin/env npx ts-node
/**
 * Encrypt personal profile before storage/commit
 * Usage: npx ts-node scripts/encrypt-profile.ts <input.json> <output.enc>
 */

import { readFileSync, writeFileSync } from 'fs';
import { encryptProfile, decryptProfile } from '../src/utils/crypto';

const SECRET = process.env.MEMORABLE_SECRET || 'CHANGE_ME_IN_PRODUCTION';

const [,, inputFile, outputFile, mode] = process.argv;

if (!inputFile) {
  console.log('Usage:');
  console.log('  Encrypt: npx ts-node scripts/encrypt-profile.ts profile.json profile.enc');
  console.log('  Decrypt: npx ts-node scripts/encrypt-profile.ts profile.enc profile.json --decrypt');
  console.log('');
  console.log('Set MEMORABLE_SECRET env var for encryption key');
  process.exit(1);
}

if (mode === '--decrypt') {
  const encrypted = readFileSync(inputFile, 'utf8');
  const decrypted = decryptProfile(encrypted, SECRET);
  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify(decrypted, null, 2));
    console.log(`Decrypted to ${outputFile}`);
  } else {
    console.log(JSON.stringify(decrypted, null, 2));
  }
} else {
  const profile = JSON.parse(readFileSync(inputFile, 'utf8'));
  const encrypted = encryptProfile(profile, SECRET);
  const output = outputFile || inputFile.replace('.json', '.enc');
  writeFileSync(output, encrypted);
  console.log(`Encrypted to ${output}`);
}
