import { MementoConstructor, MementoConstructionOutcome, MementoConstructionSuccess } from '../../../src/services/ingestion_service/memento_constructor';
import {
  ProcessedInputData,
  MemoryMemento,
  ContentType,
  Source,
  TemporalContext,
  EmotionalContext,
  SpatialContext,
  ReasoningContext,
  DetectedEntity,
  SchemaVersionDefinition // Added for mocking SchemaManager
} from '../../../src/services/ingestion_service/models';
import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';
// Import NNNAServiceClient from its actual location for type correctness
import { NNNAServiceClient } from '../../../src/services/ingestion_service/clients/nnna_service_client';


jest.mock('../../../src/services/ingestion_service/schema_manager');
jest.mock('../../../src/services/ingestion_service/clients/nnna_service_client'); // Mock the actual client
// We might need to mock NnnaServiceClient if SchemaManager tries to use it deeply
// For now, the type import and passing null might be enough if methods aren't called.
// jest.mock('../../../src/services/ingestion_service/clients/nnna_service_client'); // Assuming actual client path

describe('MementoConstructor', () => {
  let mementoConstructor: MementoConstructor;
  let mockSchemaManager: jest.Mocked<SchemaManager>;
  let mockLogger: jest.Mocked<Console>;
  let consistentTimestamp: string;
  let mockCurrentSchema: SchemaVersionDefinition;

  beforeEach(() => {
    consistentTimestamp = new Date().toISOString();
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockCurrentSchema = {
      version: '1.0.0',
      mementoVersion: '1.0', // This will be used for memento.version
      description: 'Test schema',
      definition: {}, // Placeholder, actual schema definition for validation
      fields: [],
      effectiveDate: new Date().toISOString(),
      isActive: true,
    };

    // Correctly instantiate SchemaManager mock with placeholder NnnaServiceClient
    mockSchemaManager = new SchemaManager(
      undefined, // schemaStore can be undefined to use InMemorySchemaStore
      undefined, // nnnaClient can be undefined to use placeholder NnnaServiceClient
      mockLogger
    ) as jest.Mocked<SchemaManager>;
    
    // Mock specific methods used by MementoConstructor
    mockSchemaManager.getCurrentSchema = jest.fn().mockResolvedValue(mockCurrentSchema);
    mockSchemaManager.validateMementoAgainstSchema = jest.fn().mockReturnValue(true); // Assume valid for this test

    mementoConstructor = new MementoConstructor(mockSchemaManager, mockLogger);
  });

  describe('constructMemento', () => {
    it('should construct a valid MemoryMemento from ProcessedInputData for text input (TDD_ANCHOR:MementoConstructor_constructMemento_textInput_createsValidMemento)', async () => {
      const processedInput: ProcessedInputData = {
        agentId: 'agent-memento-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-memento-001',
        originalContentType: "Text" as ContentType,
        originalContentRaw: 'This is the original raw text content.',
        normalizedContent: 'this is the original raw text content.',
        determinedContentTypeForMemento: "Text" as ContentType,
        // dataTypeForMemento removed as it's not on ProcessedInputData
        processedContentSummary: 'Original raw text.',
        detectedEntities: [{ name: 'TestEntity', type: 'PERSON', relevance: 0.9, metadata: {} } as DetectedEntity],
        derivedTags: ['PERSON:TestEntity'],
        derivedEmotionalContext: { dominantEmotion: 'neutral', emotionalValence: 0.1 } as Partial<EmotionalContext>,
        aggregatedTemporalContext: {
          eventTimestamp: consistentTimestamp,
        } as TemporalContext, // Ensure it matches TemporalContext
        aggregatedSpatialContext: { locationName: 'Office' } as Partial<SpatialContext>,
        aggregatedReasoningContext: { currentGoal: 'Testing MementoConstructor' } as Partial<ReasoningContext>,
        eventTimestamp: consistentTimestamp, // Added as it's required on ProcessedInputData
        metadata: { customField: 'customValue', anotherField: 123 },
      };

      const outcome: MementoConstructionOutcome = await mementoConstructor.constructMemento(processedInput);

      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error("Memento construction failed");

      const memento = (outcome as MementoConstructionSuccess).data;

      // Basic MemoryMemento structure checks
      expect(memento).toBeDefined();
      expect(memento.mementoId).toBeDefined();
      expect(memento.version).toEqual(mockCurrentSchema.mementoVersion);

      // Field mapping checks based on MemoryMemento interface
      expect(memento.agentId).toEqual(processedInput.agentId);
      expect(memento.contentType).toEqual(processedInput.determinedContentTypeForMemento);
      expect(memento.content).toEqual(processedInput.normalizedContent);
      expect(memento.originalContentRaw).toEqual(processedInput.originalContentRaw);
      expect(memento.eventTimestamp).toEqual(processedInput.eventTimestamp); // Directly from processedInput

      expect(memento.summary).toEqual(processedInput.processedContentSummary);
      expect(memento.entities).toEqual(processedInput.detectedEntities);
      expect(memento.tags).toEqual(processedInput.derivedTags);
      expect(memento.emotionalContext).toEqual(processedInput.derivedEmotionalContext);
      
      expect(memento.temporalContext).toEqual(processedInput.aggregatedTemporalContext);
      expect(memento.spatialContext).toEqual(processedInput.aggregatedSpatialContext);
      expect(memento.reasoningContext).toEqual(processedInput.aggregatedReasoningContext);
      
      expect(memento.sourceSystem).toEqual(processedInput.sourceSystem);
      expect(memento.sourceIdentifier).toEqual(processedInput.sourceIdentifier);

      expect(memento.createdAt).toBeDefined();
      expect(memento.updatedAt).toBeDefined();
      expect(memento.createdAt).toEqual(memento.updatedAt); // Initially they should be the same
      expect(memento.metadata).toEqual(processedInput.metadata);
    });

    it('should correctly map AudioTranscript content type (TDD_ANCHOR:MementoConstructor_constructMemento_audioTranscript_mapsCorrectly)', async () => {
      const processedInputAudio: ProcessedInputData = {
        agentId: 'agent-audio-001',
        sourceSystem: Source.API_UPLOAD,
        sourceIdentifier: 'audio-transcript-001',
        originalContentType: "AudioTranscript" as ContentType,
        originalContentRaw: { duration: 120, language: 'en-US', transcript: 'This is an audio transcript.' },
        normalizedContent: 'this is an audio transcript.', // Assuming normalization produces text
        determinedContentTypeForMemento: "AudioTranscript" as ContentType,
        processedContentSummary: 'Audio transcript summary.',
        detectedEntities: [],
        derivedTags: [],
        derivedEmotionalContext: {},
        aggregatedTemporalContext: { eventTimestamp: consistentTimestamp },
        aggregatedSpatialContext: {},
        aggregatedReasoningContext: {},
        eventTimestamp: consistentTimestamp,
        metadata: { device: 'RecorderX' },
      };

      const outcome = await mementoConstructor.constructMemento(processedInputAudio);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error("Memento construction failed for audio");

      const memento = (outcome as MementoConstructionSuccess).data;
      expect(memento.contentType).toEqual("AudioTranscript");
      expect(memento.content).toEqual(processedInputAudio.normalizedContent);
      // Check if originalContentRaw is preserved correctly for structured audio data
      expect(memento.originalContentRaw).toEqual(processedInputAudio.originalContentRaw);
      expect(memento.agentId).toEqual(processedInputAudio.agentId);
    });

    it('should handle missing optional fields in ProcessedInputData gracefully (TDD_ANCHOR:MementoConstructor_constructMemento_missingOptionalFields_handlesGracefully)', async () => {
      const minimalProcessedInput: ProcessedInputData = {
        agentId: 'agent-minimal-001',
        sourceSystem: Source.AUTOMATED_SYSTEM,
        sourceIdentifier: 'minimal-input-001',
        originalContentType: "Text" as ContentType,
        originalContentRaw: 'Minimal content.',
        normalizedContent: 'minimal content.',
        determinedContentTypeForMemento: "Text" as ContentType,
        // Optional fields are omitted:
        // processedContentSummary: undefined,
        // detectedEntities: undefined,
        // derivedTags: undefined,
        // derivedEmotionalContext: undefined,
        // aggregatedSpatialContext: undefined,
        // aggregatedReasoningContext: undefined,
        aggregatedTemporalContext: { eventTimestamp: consistentTimestamp }, // Required
        eventTimestamp: consistentTimestamp, // Required
        metadata: {}, // Required
      };

      const outcome = await mementoConstructor.constructMemento(minimalProcessedInput);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error("Memento construction failed for minimal input");

      const memento = (outcome as MementoConstructionSuccess).data;

      expect(memento).toBeDefined();
      expect(memento.mementoId).toBeDefined();
      expect(memento.agentId).toEqual(minimalProcessedInput.agentId);
      expect(memento.content).toEqual(minimalProcessedInput.normalizedContent);

      // Check that optional fields are handled with defaults or are undefined/null as per MemoryMemento
      expect(memento.summary).toBeUndefined();
      expect(memento.entities).toBeUndefined();
      expect(memento.tags).toEqual([]);
      expect(memento.emotionalContext).toBeUndefined();
      expect(memento.spatialContext).toBeUndefined();
      expect(memento.reasoningContext).toBeUndefined();
      
      expect(memento.temporalContext).toEqual(minimalProcessedInput.aggregatedTemporalContext);
    });

    it('should generate unique mementoIds for different inputs (TDD_ANCHOR:MementoConstructor_constructMemento_idGeneration_isUnique)', async () => {
      const processedInput1: ProcessedInputData = {
        agentId: 'agent-unique-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'unique-input-001',
        originalContentType: "Text" as ContentType,
        originalContentRaw: 'First unique content.',
        normalizedContent: 'first unique content.',
        determinedContentTypeForMemento: "Text" as ContentType,
        aggregatedTemporalContext: { eventTimestamp: new Date(consistentTimestamp).toISOString() },
        eventTimestamp: new Date(consistentTimestamp).toISOString(),
        metadata: {},
      };

      const processedInput2: ProcessedInputData = {
        ...processedInput1, // Spread to copy, then override
        sourceIdentifier: 'unique-input-002',
        originalContentRaw: 'Second unique content.',
        normalizedContent: 'second unique content.',
        eventTimestamp: new Date(new Date(consistentTimestamp).getTime() + 1000).toISOString(), // Slightly different timestamp
        aggregatedTemporalContext: { eventTimestamp: new Date(new Date(consistentTimestamp).getTime() + 1000).toISOString() },
      };

      const outcome1 = await mementoConstructor.constructMemento(processedInput1);
      const outcome2 = await mementoConstructor.constructMemento(processedInput2);

      expect(outcome1.success).toBe(true);
      expect(outcome2.success).toBe(true);

      if (!outcome1.success || !outcome2.success) {
        throw new Error("Memento construction failed for one or both inputs");
      }

      const memento1 = (outcome1 as MementoConstructionSuccess).data;
      const memento2 = (outcome2 as MementoConstructionSuccess).data;

      expect(memento1.mementoId).toBeDefined();
      expect(memento2.mementoId).toBeDefined();
      expect(memento1.mementoId).not.toEqual(memento2.mementoId);
    });
  });
});