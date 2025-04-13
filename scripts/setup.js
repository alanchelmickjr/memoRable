#!/usr/bin/env node

import { promises as fs } from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function generateSecurePassword() {
  return crypto.randomBytes(24).toString('base64');
}

async function copyEnvFile() {
  try {
    const envExample = await fs.readFile('.env.example', 'utf8');
    const mongoPassword = await generateSecurePassword();
    const redisPassword = await generateSecurePassword();
    const jwtSecret = await generateSecurePassword();
    
    let envContent = envExample
      .replace('your_secure_mongo_password', mongoPassword)
      .replace('your_secure_redis_password', redisPassword)
      .replace('your_jwt_secret', jwtSecret);

    await fs.writeFile('.env', envContent);
    console.log('✅ Created .env file with secure passwords');
  } catch (error) {
    console.error('❌ Failed to create .env file:', error);
    process.exit(1);
  }
}

async function checkDockerInstallation() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker-compose --version', { stdio: 'ignore' });
    console.log('✅ Docker and Docker Compose are installed');
    return true;
  } catch (error) {
    console.error('❌ Docker or Docker Compose is not installed');
    console.log('Please install Docker and Docker Compose first:');
    console.log('https://docs.docker.com/get-docker/');
    console.log('https://docs.docker.com/compose/install/');
    return false;
  }
}

async function checkGPUSupport() {
  try {
    execSync('nvidia-smi', { stdio: 'ignore' });
    console.log('✅ NVIDIA GPU detected');
    return true;
  } catch (error) {
    console.log('⚠️  No NVIDIA GPU detected, will use CPU mode');
    return false;
  }
}

async function createDirectories() {
  const dirs = [
    'logs',
    'data/mongodb',
    'data/redis',
    'data/weaviate',
    'data/ollama'
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`❌ Failed to create directory ${dir}:`, error);
        process.exit(1);
      }
    }
  }
}

async function pullDockerImages() {
  try {
    console.log('📥 Pulling Docker images...');
    execSync('docker-compose pull', { stdio: 'inherit' });
    console.log('✅ Docker images pulled successfully');
  } catch (error) {
    console.error('❌ Failed to pull Docker images:', error);
    process.exit(1);
  }
}

async function setupHumeAI() {
  const humeKey = await question('Enter your Hume.ai API key (or press enter to skip): ');
  if (humeKey.trim()) {
    try {
      const envContent = await fs.readFile('.env', 'utf8');
      const updatedContent = envContent.replace('your_hume_api_key', humeKey.trim());
      await fs.writeFile('.env', updatedContent);
      console.log('✅ Added Hume.ai API key to .env');
    } catch (error) {
      console.error('❌ Failed to update Hume.ai API key:', error);
    }
  }
}

async function main() {
  console.log('🚀 Setting up MemoRable...\n');

  // Check Docker installation
  if (!await checkDockerInstallation()) {
    process.exit(1);
  }

  // Check GPU support
  const hasGPU = await checkGPUSupport();

  // Create necessary directories
  await createDirectories();

  // Copy and configure .env file
  await copyEnvFile();

  // Setup Hume.ai
  await setupHumeAI();

  // Update GPU settings in .env if no GPU
  if (!hasGPU) {
    try {
      const envContent = await fs.readFile('.env', 'utf8');
      const updatedContent = envContent
        .replace('ENABLE_CUDA=1', 'ENABLE_CUDA=0')
        .replace('CUDA_VISIBLE_DEVICES=0', 'CUDA_VISIBLE_DEVICES=');
      await fs.writeFile('.env', updatedContent);
    } catch (error) {
      console.error('❌ Failed to update GPU settings:', error);
    }
  }

  // Pull Docker images
  await pullDockerImages();

  console.log('\n🎉 Setup completed successfully!');
  console.log('\nTo start the services, run:');
  console.log('npm run docker:up');
  console.log('\nTo stop the services, run:');
  console.log('npm run docker:down');

  rl.close();
}

main().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});