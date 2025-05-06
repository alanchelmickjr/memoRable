/**
 * @file Implements the IngestionIntegrator class for the Ingestion Microservice.
 * This class orchestrates the entire data ingestion workflow.
 */

import {
  IngestionRequest,
  IngestionApiResponse,
  RawInputData,
  ProcessedInputData,
  MemoryMemento,
  SchemaVersionDefinition,
  IngestionAcceptedResponseData,
  ValidatorIngestionRequest, // Added import
  // Assuming these types are defined in models.ts or imported appropriately
  // ErrorResponse, SuccessResponse,
} from './models';
import { RequestValidator, ValidationResult } from './request_validator';
import { PreprocessingPrism, PreprocessingOutcome, PreprocessingFailure } from './preprocessing_prism'; // Added PreprocessingFailure
import { MementoConstructor } from './memento_constructor'; // Removed MementoConstructionResult
import { SchemaManager } from './schema_manager'; // Corrected import
import { MemorySteward, StorageResult } from './memory_steward';
// import { EmbeddingServiceClient } from './clients/embedding_service_client'; // Placeholder
// import { Logger } from '../../utils/logger'; // Assuming a shared logger utility

// --- Placeholder Implementations for Dependencies ---

// Placeholder for NarrativeWeaver
class NarrativeWeaver {
  weave(memento: MemoryMemento): string | null {
    this.logger.info(`NarrativeWeaver.weave called for memento ${memento.mementoId} (placeholder)`);
    // Simulate narrative generation. In a real scenario, this would involve complex logic.
    // For example, concatenate key text fields from the memento.
    if (typeof memento.contentProcessed === 'string') {
      return memento.contentProcessed.substring(0, 512); // Truncate for embedding
    }
    if (typeof memento.contentRaw === 'string') {
      return memento.contentRaw.substring(0, 512);
    }
    return `Narrative for memento ${memento.mementoId}`;
  }
  private logger = console;
}

// Placeholder for EmbeddingServiceClient
class EmbeddingServiceClient {
  async generateEmbedding(text: string): Promise<number[] | null> {
    this.logger.info(`EmbeddingServiceClient.generateEmbedding called for text (first 50 chars): "${text.substring(0,50)}..." (placeholder)`);
    // Simulate embedding generation
    // In a real scenario, this would make an HTTP request to the Embedding Service
    if (!text || text.trim() === "") return null;
    return Array.from({ length: 768 }, () => Math.random() * 2 - 1); // Example 768-dim vector
  }
  private logger = console;
}

// Helper to create a simplified error response structure
// Not used directly if IngestionApiResponse from models.ts is comprehensive
// interface ErrorResponse {
//   statusCode: number;
//   body: {
//     error: string;
//     details?: any;
//   };
// }

// Helper to create a simplified success response structure
// Not used directly if IngestionApiResponse from models.ts is comprehensive
// interface SuccessResponse {
//   statusCode: number;
//   body: any;
// }


/**
 * Orchestrates the ingestion process, coordinating validation, preprocessing,
 * memento construction, embedding generation, and storage.
 */
export class IngestionIntegrator {
  private requestValidator: RequestValidator;
  private preprocessingPrism: PreprocessingPrism;
  private mementoConstructor: MementoConstructor;
  private narrativeWeaver: NarrativeWeaver; // Placeholder
  private embeddingServiceClient: EmbeddingServiceClient; // Placeholder
  private memorySteward: MemorySteward;
  private schemaManager: SchemaManager;
  private logger: Console;

  /**
   * Initializes a new instance of the IngestionIntegrator class.
   * @param {RequestValidator} validator - Service for validating ingestion requests.
   * @param {PreprocessingPrism} preprocessor - Service for preprocessing raw data.
   * @param {MementoConstructor} constructorSvc - Service for constructing mementos.
   * @param {NarrativeWeaver} weaver - Service for generating narrative text for embeddings.
   * @param {EmbeddingServiceClient} embedderClient - Client for the Embedding Service.
   * @param {MemorySteward} steward - Service for persisting mementos and embeddings.
   * @param {SchemaManager} schemaMgr - Service for managing memento schemas.
   * @param {Console} [logger=console] - Optional logger instance.
   */
  constructor(
    validator?: RequestValidator,
    preprocessor?: PreprocessingPrism,
    constructorSvc?: MementoConstructor,
    weaver?: NarrativeWeaver,
    embedderClient?: EmbeddingServiceClient,
    steward?: MemorySteward,
    schemaMgr?: SchemaManager,
    logger?: Console
  ) {
    this.logger = logger || console;
    // SchemaManager requires async initialization, handle it carefully.
    // It's better to pass an initialized instance or ensure it's initialized before use.
    this.schemaManager = schemaMgr || new SchemaManager(undefined, undefined, this.logger); // Pass logger
    this.requestValidator = validator || new RequestValidator();
    this.preprocessingPrism = preprocessor || new PreprocessingPrism(undefined, undefined, undefined, undefined, this.logger); // Pass logger
    // MementoConstructor now requires SchemaManager
    this.mementoConstructor = constructorSvc || new MementoConstructor(this.schemaManager, this.logger); // Pass schemaManager and logger
    this.narrativeWeaver = weaver || new NarrativeWeaver();
    this.embeddingServiceClient = embedderClient || new EmbeddingServiceClient();
    // Correctly instantiate MemorySteward, passing undefined for clients and logger for the last param
    this.memorySteward = steward || new MemorySteward(undefined, undefined, undefined, this.logger);
    this.logger = logger || console;
  }

  /**
   * Ensures SchemaManager is initialized. Call this before any operations requiring schema.
   */
  public async initialize(): Promise<void> {
    // A more robust check might involve a specific property or method on SchemaManager
    // For now, checking 'currentActiveSchema' which is internal but indicative.
    if (!(this.schemaManager as any).currentActiveSchema) {
        this.logger.info('IngestionIntegrator: Initializing SchemaManager...');
        await this.schemaManager.initialize();
    }
  }


  /**
   * Handles an incoming ingestion request. Validates the request and then
   * asynchronously processes it.
   * FR3.1.1, FR3.1.4
   * @param {IngestionRequest} ingestionRequest - The raw request data.
   * @returns {Promise<IngestionApiResponse>} A response indicating acceptance or an error.
   */
  public async handleIngestRequest(ingestionRequest: IngestionRequest): Promise<IngestionApiResponse> {
    this.logger.info(`IngestionIntegrator: Received ingestion request for agent: ${ingestionRequest.agentId}, source: ${ingestionRequest.sourceIdentifier}`);

    await this.initialize(); // Ensure schema manager is ready

    // 1. Validate IngestionRequest
    // Map IngestionRequest to ValidatorIngestionRequest
    const validatorRequest: ValidatorIngestionRequest = {
      userId: ingestionRequest.agentId, // Assuming agentId maps to userId for validation purposes
      source: ingestionRequest.sourceSystem as any, // May need a mapping if Source enum differs from sourceSystem strings
      timestamp: ingestionRequest.eventTimestamp || new Date().toISOString(),
      dataType: ingestionRequest.contentType as any, // May need a mapping if DataType enum differs
      data: ingestionRequest.contentRaw,
      metadata: ingestionRequest.metadata,
    };
    const validationResult: ValidationResult = this.requestValidator.validate(validatorRequest);
    if (!validationResult.isValid) {
      this.logger.error(`IngestionIntegrator: Invalid ingestion request for agent ${ingestionRequest.agentId}. Errors: ${JSON.stringify(validationResult.errors)}`);
      return {
        statusCode: 400, // Bad Request
        body: {
          error: 'Invalid ingestion request.',
          details: validationResult.errors,
        },
      };
    }

    // 2. Asynchronously process the validated request (fire and forget for the API response)
    //    Using setImmediate to ensure the current event loop tick finishes, returning the 202 quickly.
    setImmediate(() => {
      this.processIngestionJob(ingestionRequest)
        .catch(err => {
          this.logger.error(`IngestionIntegrator: Unhandled error in background job for agent ${ingestionRequest.agentId}, source ${ingestionRequest.sourceIdentifier}.`, err);
          // TODO: Implement robust error handling for background jobs (e.g., dead-letter queue, retry mechanisms)
        });
    });

    this.logger.info(`IngestionIntegrator: Request for agent ${ingestionRequest.agentId}, source ${ingestionRequest.sourceIdentifier} accepted for processing.`);
    const responseBody: IngestionAcceptedResponseData = { message: 'Request accepted for processing.' };
    return {
      statusCode: 202, // Accepted
      body: responseBody,
    };
  }

  /**
   * Internal method to process the ingestion job asynchronously after initial validation.
   * @param {IngestionRequest} ingestionRequest - The validated ingestion request.
   */
  private async processIngestionJob(ingestionRequest: IngestionRequest): Promise<void> {
    this.logger.info(`IngestionIntegrator: Starting background processing for agent ${ingestionRequest.agentId}, source ${ingestionRequest.sourceIdentifier}`);
    try {
      // Map IngestionRequest to RawInputData
      const rawInput: RawInputData = {
        sourceSystem: ingestionRequest.sourceSystem,
        sourceIdentifier: ingestionRequest.sourceIdentifier,
        agentId: ingestionRequest.agentId,
        contentType: ingestionRequest.contentType,
        contentRaw: ingestionRequest.contentRaw, // Corrected mapping
        metadata: ingestionRequest.metadata || {},
        eventTimestamp: ingestionRequest.eventTimestamp || new Date().toISOString(), // Corrected mapping
      };

      // 3. Preprocess Raw Data (FR3.2)
      const preprocessingOutcome: PreprocessingOutcome = await this.preprocessingPrism.process(rawInput);

      if (!preprocessingOutcome.success) { // Type guard for failure
        const failureOutcome = preprocessingOutcome as PreprocessingFailure; // Explicit cast
        this.logger.error(`IngestionIntegrator: Preprocessing failed for agent ${ingestionRequest.agentId}, source ${rawInput.sourceIdentifier}. Error: ${failureOutcome.error}`);
        // TODO: Handle preprocessing failure (e.g., dead-letter queue)
        return;
      }
      const processedInput: ProcessedInputData = preprocessingOutcome.data;
      this.logger.info(`IngestionIntegrator: Preprocessing successful for agent ${ingestionRequest.agentId}, source ${rawInput.sourceIdentifier}`);


      // 4. Get Current Active Schema (FR3.6.2)
      const currentSchema: SchemaVersionDefinition = await this.schemaManager.getCurrentSchema();
      // getCurrentSchema now throws if no schema is available after trying to initialize.

      this.logger.info(`IngestionIntegrator: Using schema version ${currentSchema.version} for agent ${ingestionRequest.agentId}`);

      // 5. Construct Memory Memento (FR3.3)
      // MementoConstructor.constructMemento now directly returns MemoryMemento or throws an error.
      let memento: MemoryMemento;
      try {
        memento = await this.mementoConstructor.constructMemento(processedInput);
        this.logger.info(`IngestionIntegrator: Memento ${memento.mementoId} constructed for agent ${ingestionRequest.agentId}`);
      } catch (constructionError) {
        const errorMessage = constructionError instanceof Error ? constructionError.message : String(constructionError);
        this.logger.error(`IngestionIntegrator: Memento construction failed for agent ${ingestionRequest.agentId}, source ${rawInput.sourceIdentifier}. Error: ${errorMessage}`);
        // TODO: Handle memento construction failure (e.g., dead-letter queue)
        return;
      }

      // 6. Generate Contextual Narrative for Embedding (FR3.4.1)
      const narrativeText: string | null = this.narrativeWeaver.weave(memento);
      let embeddingVector: number[] | null = null;

      if (narrativeText) {
        this.logger.info(`IngestionIntegrator: Narrative woven for memento ${memento.mementoId}. Generating embedding.`);
        // 7. Generate Embedding Vector (FR3.4.2)
        embeddingVector = await this.embeddingServiceClient.generateEmbedding(narrativeText);
        if (!embeddingVector) {
          this.logger.warn(`IngestionIntegrator: Embedding generation failed or returned null for memento ${memento.mementoId}. Proceeding without vector.`);
        } else {
          this.logger.info(`IngestionIntegrator: Embedding generated for memento ${memento.mementoId}.`);
        }
      } else {
        this.logger.warn(`IngestionIntegrator: Narrative weaving failed or produced no text for memento ${memento.mementoId}. Skipping embedding.`);
      }

      // 8. Store Memento and Embedding (FR3.5)
      const storageResult: StorageResult = await this.memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      if (storageResult.success) {
        this.logger.info(`IngestionIntegrator: Memento ${memento.mementoId} storage process completed with status: ${storageResult.status}. Message: ${storageResult.message}`);
      } else {
        this.logger.error(`IngestionIntegrator: Memento ${memento.mementoId} storage failed. Message: ${storageResult.message}`);
        // TODO: Handle storage failure (e.g., retry logic, dead-letter queue)
      }

    } catch (error) {
      this.logger.error(`IngestionIntegrator: Critical error during background processing for agent ${ingestionRequest.agentId}, source ${ingestionRequest.sourceIdentifier}.`, error);
      // TODO: Implement robust error handling for background jobs
    }
  }
}