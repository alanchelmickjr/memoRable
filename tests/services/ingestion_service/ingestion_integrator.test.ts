import { IngestionIntegrator } from '../../../src/services/ingestion_service/ingestion_integrator';
import { RequestValidator } from '../../../src/services/ingestion_service/request_validator';
import { PreprocessingPrism, PreprocessingOutcome } from '../../../src/services/ingestion_service/preprocessing_prism';
import { MementoConstructor } from '../../../src/services/ingestion_service/memento_constructor';
import { EmbeddingServiceClient } from '../../../src/services/ingestion_service/clients/embedding_service_client';
import { MemorySteward, StorageResult } from '../../../src/services/ingestion_service/memory_steward';
import {
  IngestionRequest,
  IngestionApiResponse,
  RawInputData,
  ProcessedInputData,
  MemoryMemento,
  SchemaVersionDefinition,
  Source,
  ContentType,
  ValidationResult,
  ValidatorIngestionRequest,
  DataType,
  // Add other necessary types from models.ts
} from '../../../src/services/ingestion_service/models';
import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';

// Mock dependencies
jest.mock('../../../src/services/ingestion_service/request_validator');
jest.mock('../../../src/services/ingestion_service/preprocessing_prism');
jest.mock('../../../src/services/ingestion_service/memento_constructor');
jest.mock('../../../src/services/ingestion_service/clients/embedding_service_client'); // Actual client path
jest.mock('../../../src/services/ingestion_service/memory_steward');
jest.mock('../../../src/services/ingestion_service/schema_manager');

// Placeholder for NarrativeWeaver as defined in ingestion_integrator.ts (if it's a simple class)
// If NarrativeWeaver is complex or has its own file, mock that path instead.
// For this test, we assume NarrativeWeaver is the placeholder class within IngestionIntegrator.ts
class NarrativeWeaverPlaceholder {
  weave(memento: MemoryMemento): string | null {
    console.log('Mocked NarrativeWeaverPlaceholder.weave called');
    return `Narrative for ${memento.mementoId}`;
  }
  logger = console;
}

describe('IngestionIntegrator', () => {
  let requestValidatorMock: jest.Mocked<RequestValidator>;
  let preprocessingPrismMock: jest.Mocked<PreprocessingPrism>;
  let mementoConstructorMock: jest.Mocked<MementoConstructor>;
  let narrativeWeaverMock: jest.Mocked<NarrativeWeaverPlaceholder>; // Use the placeholder type
  let embeddingServiceClientMock: jest.Mocked<EmbeddingServiceClient>;
  let memoryStewardMock: jest.Mocked<MemorySteward>;
  let schemaManagerMock: jest.Mocked<SchemaManager>;
  let ingestionIntegrator: IngestionIntegrator;

  beforeEach(() => {
    requestValidatorMock = new RequestValidator() as jest.Mocked<RequestValidator>;
    preprocessingPrismMock = new PreprocessingPrism(undefined, undefined, undefined, undefined, console) as jest.Mocked<PreprocessingPrism>;
    schemaManagerMock = new SchemaManager(undefined, undefined, console) as jest.Mocked<SchemaManager>;
    mementoConstructorMock = new MementoConstructor(schemaManagerMock, console) as jest.Mocked<MementoConstructor>;
    
    // Mocking the placeholder NarrativeWeaver
    narrativeWeaverMock = new NarrativeWeaverPlaceholder() as jest.Mocked<any>; // Use any for type compatibility
    jest.spyOn(narrativeWeaverMock, 'weave'); // Spy on the method of the instance

    embeddingServiceClientMock = new EmbeddingServiceClient() as jest.Mocked<EmbeddingServiceClient>;
    memoryStewardMock = new MemorySteward(undefined, undefined, undefined, console) as jest.Mocked<MemorySteward>;

    ingestionIntegrator = new IngestionIntegrator(
      requestValidatorMock,
      preprocessingPrismMock,
      mementoConstructorMock,
      narrativeWeaverMock as any, // Cast to any to satisfy constructor due to private logger
      embeddingServiceClientMock as any, // Cast to any to satisfy constructor
      memoryStewardMock,
      schemaManagerMock,
      console
    );

    // Mock methods on instances
    requestValidatorMock.validate = jest.fn();
    preprocessingPrismMock.process = jest.fn();
    mementoConstructorMock.constructMemento = jest.fn();
    (embeddingServiceClientMock as any).generateEmbedding = jest.fn(); // Ensure mock fn is assigned
    memoryStewardMock.storeNewMementoAndEmbeddings = jest.fn();
    schemaManagerMock.initialize = jest.fn().mockResolvedValue(undefined);
    schemaManagerMock.getCurrentSchema = jest.fn();
    
    // Spy on IngestionIntegrator's initialize to ensure it's called, but mock its implementation
    jest.spyOn(ingestionIntegrator, 'initialize').mockResolvedValue(undefined);


    jest.clearAllMocks();
  });

  describe('handleIngestRequest', () => {
    it('should accept valid input, return 202, and trigger background processing (TDD_ANCHOR:IngestionIntegrator_handleIngestRequest_validInput_accepted)', async () => {
      const ingestionRequest: IngestionRequest = {
        agentId: 'agent-test-handle-001',
        sourceSystem: Source.API_UPLOAD,
        contentType: 'Text' as ContentType, // Use string literal
        contentRaw: 'This is a valid test for handleIngestRequest.',
        eventTimestamp: new Date().toISOString(),
        sourceIdentifier: 'test-source-id-001',
        metadata: { customField: 'customValue' }
      };

      const validationResult: ValidationResult = { isValid: true, errors: [] };
      requestValidatorMock.validate.mockReturnValue(validationResult);

      // Spy on the private method processIngestionJob
      const processIngestionJobSpy = jest.spyOn(ingestionIntegrator as any, 'processIngestionJob').mockResolvedValue(undefined);

      const response: IngestionApiResponse = await ingestionIntegrator.handleIngestRequest(ingestionRequest);

      expect(ingestionIntegrator.initialize).toHaveBeenCalledTimes(1);
      expect(requestValidatorMock.validate).toHaveBeenCalledWith(expect.objectContaining({
        userId: ingestionRequest.agentId,
        source: ingestionRequest.sourceSystem,
        timestamp: ingestionRequest.eventTimestamp,
        dataType: ingestionRequest.contentType,
        data: ingestionRequest.contentRaw,
        metadata: ingestionRequest.metadata,
      }));
      expect(response.statusCode).toBe(202);
      expect(response.body).toEqual({ message: 'Request accepted for processing.' });

      // Allow `setImmediate` to run
      await new Promise(setImmediate);
      expect(processIngestionJobSpy).toHaveBeenCalledWith(ingestionRequest);

      processIngestionJobSpy.mockRestore();
    });

    it('should return 400 for an invalid ingestion request (TDD_ANCHOR:IngestionIntegrator_handleIngestRequest_invalidInput_badRequest)', async () => {
      const ingestionRequest: IngestionRequest = {
        agentId: 'agent-test-handle-002',
        sourceSystem: Source.MANUAL_INPUT, // Added missing sourceSystem
        contentType: 'Text' as ContentType, // Use string literal
        contentRaw: 'Invalid request missing sourceSystem.',
        eventTimestamp: new Date().toISOString(),
      };
      const validationResult: ValidationResult = { 
        isValid: false, 
        errors: [{ field: 'sourceSystem', message: 'sourceSystem is required' }] 
      };
      requestValidatorMock.validate.mockReturnValue(validationResult);
      
      const processIngestionJobSpy = jest.spyOn(ingestionIntegrator as any, 'processIngestionJob');

      const response: IngestionApiResponse = await ingestionIntegrator.handleIngestRequest(ingestionRequest);

      expect(ingestionIntegrator.initialize).toHaveBeenCalledTimes(1);
      expect(requestValidatorMock.validate).toHaveBeenCalled();
      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid ingestion request.',
        details: validationResult.errors,
      });
      expect(processIngestionJobSpy).not.toHaveBeenCalled();
      
      processIngestionJobSpy.mockRestore();
    });
  });

  describe('processIngestionJob (indirectly via handleIngestRequest)', () => {
    // Tests for the private processIngestionJob method are done by observing
    // the interactions with collaborators after handleIngestRequest queues the job.

    it('should fully process a valid request: preprocess, construct memento, weave, embed, and store (TDD_ANCHOR:IngestionIntegrator_processIngestionJob_fullFlow_success)', async () => {
      const ingestionRequest: IngestionRequest = {
        agentId: 'agent-job-001',
        sourceSystem: Source.MANUAL_INPUT,
        contentType: 'Text' as ContentType,
        contentRaw: 'Full processing test.',
        eventTimestamp: new Date().toISOString(),
        sourceIdentifier: 'job-source-001',
        metadata: { testFlow: 'fullProcess' },
      };
      
      const validatorRequest: ValidatorIngestionRequest = {
        userId: ingestionRequest.agentId,
        source: ingestionRequest.sourceSystem as any,
        timestamp: ingestionRequest.eventTimestamp!,
        dataType: ingestionRequest.contentType as any,
        data: ingestionRequest.contentRaw,
        metadata: ingestionRequest.metadata,
      };

      const rawInputForJob: RawInputData = {
        sourceSystem: ingestionRequest.sourceSystem,
        sourceIdentifier: ingestionRequest.sourceIdentifier,
        agentId: ingestionRequest.agentId,
        contentType: ingestionRequest.contentType,
        contentRaw: ingestionRequest.contentRaw,
        metadata: ingestionRequest.metadata || {},
        eventTimestamp: ingestionRequest.eventTimestamp!,
      };

      const preprocessingOutcome: PreprocessingOutcome = {
        success: true,
        data: {
          agentId: rawInputForJob.agentId,
          sourceSystem: rawInputForJob.sourceSystem,
          originalContentType: rawInputForJob.contentType,
          originalContentRaw: rawInputForJob.contentRaw,
          normalizedContent: "Full processing test normalized.",
          aggregatedTemporalContext: { eventTimestamp: rawInputForJob.eventTimestamp! },
          determinedContentTypeForMemento: rawInputForJob.contentType,
          detectedEntities: [],
          derivedEmotionalContext: {},
          derivedTags: [],
          // Ensure all required fields for ProcessedInputData are present
        } as ProcessedInputData,
      };
      
      const memento: MemoryMemento = {
        mementoId: 'memento-job-001',
        agentId: preprocessingOutcome.data.agentId,
        creationTimestamp: new Date().toISOString(),
        sourceSystem: preprocessingOutcome.data.sourceSystem,
        contentType: preprocessingOutcome.data.determinedContentTypeForMemento,
        contentRaw: preprocessingOutcome.data.originalContentRaw,
        contentProcessed: "Full processing test normalized.", // Assuming normalized content is used if no summary
        schemaVersion: '1.0.1',
        temporalContext: preprocessingOutcome.data.aggregatedTemporalContext,
        tags: [],
        // Fill other fields as necessary based on ProcessedInputData
      } as MemoryMemento;

      const narrative = "Narrative for memento-job-001";
      const embeddingVector: number[] = [0.1, 0.2, 0.3, 0.4, 0.5];
      const storageResult: StorageResult = { success: true, mementoId: memento.mementoId, status: 'stored', message: 'Stored successfully' };
      const schemaDef: SchemaVersionDefinition = { version: '1.0.1', definition: { type: "object" }, effectiveDate: new Date().toISOString(), isActive: true };

      // Setup mocks for the entire flow
      requestValidatorMock.validate.mockReturnValue({ isValid: true, errors: [] });
      preprocessingPrismMock.process.mockResolvedValue(preprocessingOutcome);
      schemaManagerMock.getCurrentSchema.mockResolvedValue(schemaDef);
      mementoConstructorMock.constructMemento.mockResolvedValue(memento);
      narrativeWeaverMock.weave.mockReturnValue(narrative);
      (embeddingServiceClientMock as any).generateEmbedding.mockResolvedValue(embeddingVector);
      memoryStewardMock.storeNewMementoAndEmbeddings.mockResolvedValue(storageResult);

      // Call handleIngestRequest, which will queue processIngestionJob
      await ingestionIntegrator.handleIngestRequest(ingestionRequest);

      // Allow setImmediate to run the job
      await new Promise(setImmediate);

      // Verify interactions within processIngestionJob
      expect(preprocessingPrismMock.process).toHaveBeenCalledWith(rawInputForJob);
      expect(schemaManagerMock.getCurrentSchema).toHaveBeenCalled();
      expect(mementoConstructorMock.constructMemento).toHaveBeenCalledWith(preprocessingOutcome.data);
      expect(narrativeWeaverMock.weave).toHaveBeenCalledWith(memento);
      expect((embeddingServiceClientMock as any).generateEmbedding).toHaveBeenCalledWith(narrative);
      expect(memoryStewardMock.storeNewMementoAndEmbeddings).toHaveBeenCalledWith(memento, embeddingVector);
    });

    it('should handle memento construction failure (TDD_ANCHOR:IngestionIntegrator_processIngestionJob_mementoConstructionFailure)', async () => {
      const ingestionRequest: IngestionRequest = {
        agentId: 'agent-job-003',
        sourceSystem: Source.MANUAL_INPUT, // Corrected to a valid Source enum member
        contentType: 'Text' as ContentType,
        contentRaw: 'Test memento construction failure.',
        eventTimestamp: new Date().toISOString(),
        sourceIdentifier: 'job-source-003',
      };

      const rawInputForJob: RawInputData = {
        sourceSystem: ingestionRequest.sourceSystem,
        sourceIdentifier: ingestionRequest.sourceIdentifier,
        agentId: ingestionRequest.agentId,
        contentType: ingestionRequest.contentType,
        contentRaw: ingestionRequest.contentRaw,
        metadata: ingestionRequest.metadata || {},
        eventTimestamp: ingestionRequest.eventTimestamp!,
      };

      const preprocessingOutcome: PreprocessingOutcome = {
        success: true,
        data: {
          agentId: rawInputForJob.agentId,
          sourceSystem: rawInputForJob.sourceSystem,
          originalContentType: rawInputForJob.contentType,
          originalContentRaw: rawInputForJob.contentRaw,
          normalizedContent: "Normalized content for memento failure test.",
          aggregatedTemporalContext: { eventTimestamp: rawInputForJob.eventTimestamp! },
          determinedContentTypeForMemento: rawInputForJob.contentType,
          detectedEntities: [],
          derivedEmotionalContext: {},
          derivedTags: [],
        } as ProcessedInputData,
      };
      const schemaDef: SchemaVersionDefinition = { version: '1.0.2', definition: { type: "object" }, effectiveDate: new Date().toISOString(), isActive: true };
      const constructionError = new Error('Memento construction failed badly');

      requestValidatorMock.validate.mockReturnValue({ isValid: true, errors: [] });
      preprocessingPrismMock.process.mockResolvedValue(preprocessingOutcome);
      schemaManagerMock.getCurrentSchema.mockResolvedValue(schemaDef);
      mementoConstructorMock.constructMemento.mockRejectedValue(constructionError);
      const loggerErrorSpy = jest.spyOn(console, 'error');

      await ingestionIntegrator.handleIngestRequest(ingestionRequest);
      await new Promise(setImmediate);

      expect(preprocessingPrismMock.process).toHaveBeenCalledWith(rawInputForJob);
      expect(schemaManagerMock.getCurrentSchema).toHaveBeenCalled();
      expect(mementoConstructorMock.constructMemento).toHaveBeenCalledWith(preprocessingOutcome.data);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`IngestionIntegrator: Memento construction failed for agent ${ingestionRequest.agentId}, source ${rawInputForJob.sourceIdentifier}. Error: ${constructionError.message}`)
      );
      expect(narrativeWeaverMock.weave).not.toHaveBeenCalled();
      expect((embeddingServiceClientMock as any).generateEmbedding).not.toHaveBeenCalled();
      expect(memoryStewardMock.storeNewMementoAndEmbeddings).not.toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });

    it('should handle narrative weaving failure (skip embedding, store memento) (TDD_ANCHOR:IngestionIntegrator_processIngestionJob_narrativeWeavingFailure)', async () => {
      const ingestionRequest: IngestionRequest = {
        agentId: 'agent-job-004',
        sourceSystem: Source.API_UPLOAD,
        contentType: 'Text' as ContentType,
        contentRaw: 'Test narrative weaving failure.',
        eventTimestamp: new Date().toISOString(),
        sourceIdentifier: 'job-source-004',
      };
      const rawInputForJob: RawInputData = {
        sourceSystem: ingestionRequest.sourceSystem,
        sourceIdentifier: ingestionRequest.sourceIdentifier,
        agentId: ingestionRequest.agentId,
        contentType: ingestionRequest.contentType,
        contentRaw: ingestionRequest.contentRaw,
        metadata: ingestionRequest.metadata || {},
        eventTimestamp: ingestionRequest.eventTimestamp!,
      };
      const preprocessingOutcome: PreprocessingOutcome = {
        success: true,
        data: { /* ... valid processed data ... */ } as ProcessedInputData,
      };
      // Populate preprocessingOutcome.data with necessary fields
      preprocessingOutcome.data.agentId = rawInputForJob.agentId;
      preprocessingOutcome.data.sourceSystem = rawInputForJob.sourceSystem;
      preprocessingOutcome.data.originalContentType = rawInputForJob.contentType;
      preprocessingOutcome.data.originalContentRaw = rawInputForJob.contentRaw;
      preprocessingOutcome.data.normalizedContent = "Normalized for narrative failure test.";
      preprocessingOutcome.data.aggregatedTemporalContext = { eventTimestamp: rawInputForJob.eventTimestamp! };
      preprocessingOutcome.data.determinedContentTypeForMemento = rawInputForJob.contentType;
      preprocessingOutcome.data.detectedEntities = [];
      preprocessingOutcome.data.derivedEmotionalContext = {};
      preprocessingOutcome.data.derivedTags = [];


      const schemaDef: SchemaVersionDefinition = { version: '1.0.3', definition: { type: "object" }, effectiveDate: new Date().toISOString(), isActive: true };
      const memento: MemoryMemento = {
        mementoId: 'memento-job-004',
        agentId: preprocessingOutcome.data.agentId,
        creationTimestamp: new Date().toISOString(),
        sourceSystem: preprocessingOutcome.data.sourceSystem,
        contentType: preprocessingOutcome.data.determinedContentTypeForMemento,
        contentRaw: preprocessingOutcome.data.originalContentRaw,
        contentProcessed: preprocessingOutcome.data.normalizedContent,
        schemaVersion: schemaDef.version,
        temporalContext: preprocessingOutcome.data.aggregatedTemporalContext,
        tags: [],
       } as MemoryMemento;
      const storageResult: StorageResult = { success: true, mementoId: memento.mementoId, status: 'stored_without_embedding', message: 'Stored without embedding.'};


      requestValidatorMock.validate.mockReturnValue({ isValid: true, errors: [] });
      preprocessingPrismMock.process.mockResolvedValue(preprocessingOutcome);
      schemaManagerMock.getCurrentSchema.mockResolvedValue(schemaDef);
      mementoConstructorMock.constructMemento.mockResolvedValue(memento);
      narrativeWeaverMock.weave.mockReturnValue(null); // Simulate narrative weaving failure
      (embeddingServiceClientMock as any).generateEmbedding.mockResolvedValue([0.1]); // Should not be called
      memoryStewardMock.storeNewMementoAndEmbeddings.mockResolvedValue(storageResult);
      const loggerWarnSpy = jest.spyOn(console, 'warn');

      await ingestionIntegrator.handleIngestRequest(ingestionRequest);
      await new Promise(setImmediate);

      expect(narrativeWeaverMock.weave).toHaveBeenCalledWith(memento);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`IngestionIntegrator: Narrative weaving failed or produced no text for memento ${memento.mementoId}. Skipping embedding.`)
      );
      expect((embeddingServiceClientMock as any).generateEmbedding).not.toHaveBeenCalled();
      expect(memoryStewardMock.storeNewMementoAndEmbeddings).toHaveBeenCalledWith(memento, null);

      loggerWarnSpy.mockRestore();
    });
  });
});