/**
 * @file Main entry point for the Ingestion Microservice.
 * Sets up an Express server to handle ingestion requests.
 * Designed to be deployable as a Vercel serverless function.
 */

import express, { Request, Response, NextFunction } from 'express';
import { IngestionIntegrator } from './ingestion_integrator';
import { IngestionRequest, IngestionApiResponse } from './models';
// import { Logger } from '../../utils/logger'; // Assuming a shared logger utility

// Initialize logger (placeholder if not using a shared utility)
const logger = console;

const app = express();
const PORT = process.env.INGESTION_SERVICE_PORT || process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Instantiate the core ingestion logic orchestrator
// Dependencies for IngestionIntegrator will use their default constructors for now.
// In a more complex setup, these might be injected.
const ingestionIntegrator = new IngestionIntegrator(
  undefined, // requestValidator
  undefined, // preprocessingPrism
  undefined, // mementoConstructor
  undefined, // narrativeWeaver
  undefined, // embeddingServiceClient
  undefined, // memorySteward
  undefined, // schemaManager
  logger
);

/**
 * Initializes the IngestionIntegrator.
 * This is crucial as SchemaManager needs async initialization.
 */
async function initializeService(): Promise<void> {
  try {
    await ingestionIntegrator.initialize();
    logger.info('Ingestion Service initialized successfully.');
  } catch (error) {
    logger.error('Failed to initialize Ingestion Service:', error);
    // Depending on the severity, you might want to prevent the service from starting
    // or implement a retry mechanism. For now, we log and continue.
    // process.exit(1); // Example: exit if critical initialization fails
  }
}

// API Endpoints

/**
 * @route POST /api/ingest
 * @description Endpoint to receive data for ingestion.
 * Expects a JSON body conforming to the IngestionRequest interface.
 * Responds with 202 Accepted if the request is valid and queued for processing,
 * or an error code (e.g., 400, 500) otherwise.
 */
app.post('/api/ingest', async (req: Request, res: Response) => {
  logger.info(`Received POST request on /api/ingest`);
  try {
    const ingestionRequest = req.body as IngestionRequest; // Basic type assertion

    // Delegate to the IngestionIntegrator
    const apiResponse: IngestionApiResponse = await ingestionIntegrator.handleIngestRequest(ingestionRequest);

    res.status(apiResponse.statusCode).json(apiResponse.body);
  } catch (error) {
    logger.error('Error in /api/ingest endpoint:', error);
    // Ensure a generic error response if something unexpected happens
    // before or after handleIngestRequest.
    if (error instanceof Error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    } else {
        res.status(500).json({ error: 'Internal Server Error', details: 'An unknown error occurred' });
    }
  }
});

/**
 * @route GET /api/ingest/health
 * @description Health check endpoint for the ingestion service.
 */
app.get('/api/ingest/health', (req: Request, res: Response) => {
  logger.info('Received GET request on /api/ingest/health');
  res.status(200).json({ status: 'UP', message: 'Ingestion service is healthy.' });
});

// Global error handler (optional, Express has a default one)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal Server Error - Unhandled' });
});


// Start server only if not in a serverless environment (e.g. Vercel)
// Vercel handles the server lifecycle for serverless functions.
// The `initializeService` call is critical and should complete before listening.
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  initializeService().then(() => {
    app.listen(PORT, () => {
      logger.info(`Ingestion Service listening on port ${PORT}`);
    });
  }).catch(error => {
    logger.error('Failed to start Ingestion Service after initialization error:', error);
    process.exit(1); // Exit if initialization fails before starting server
  });
}


// Export the app for Vercel or other serverless environments
export default app;