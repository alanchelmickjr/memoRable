const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// Import required services
const ModelSelectionService = require('../src/services/modelSelectionService');
const CustomModelService = require('../src/services/customModelService');

async function preloadModels() {
  console.log('Starting model preloading...');

  try {
    // Initialize services
    const modelSelection = new ModelSelectionService();
    const customModel = new CustomModelService();

    // Preload base models
    console.log('Preloading base models...');
    await modelSelection.warmupCache();
    
    // Preload custom models
    console.log('Preloading custom models...');
    await customModel.preloadModels();

    // Verify Ollama models
    console.log('Verifying Ollama models...');
    await exec('curl -X GET http://ollama:11434/api/tags');

    // Create model status endpoint
    const healthCheck = `
    const http = require('http');
    const server = http.createServer((req, res) => {
      if (req.url === '/models/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', timestamp: new Date() }));
      }
    });
    server.listen(3001);
    `;

    fs.writeFileSync(path.join(__dirname, 'model-health.js'), healthCheck);

    console.log('Model preloading completed successfully');
  } catch (error) {
    console.error('Error during model preloading:', error);
    process.exit(1);
  }
}

preloadModels();