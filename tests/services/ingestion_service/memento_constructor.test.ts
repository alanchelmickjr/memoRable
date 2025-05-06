import { MementoConstructor } from '../../../src/services/ingestion_service/memento_constructor';
import { ProcessedInputData, MemoryMemento, ContentType, Source, TemporalContext, SchemaVersionDefinition } from '../../../src/services/ingestion_service/models';
import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';

// Mock SchemaManager
jest.mock('../../../src/services/ingestion_service/schema_manager');

describe('MementoConstructor', () => {
  let mementoConstructor: MementoConstructor;
  let mockSchemaManager: jest.Mocked<SchemaManager>;
  const mockCurrentSchema: SchemaVersionDefinition = {
    version: '1.0.0',
    definition: { type: 'object', properties: { /* ... schema ... */ } },
    description: 'Test Schema',
    effectiveDate: new Date().toISOString(),
    isActive: true,
  };

  beforeEach(() => {
    // Create a mock instance of SchemaManager
    // We need to mock the methods that MementoConstructor will call, e.g., getCurrentSchema()
    // Instantiate the mock SchemaManager
    mockSchemaManager = new SchemaManager(undefined, undefined, console) as jest.Mocked<SchemaManager>;
    mockSchemaManager.getCurrentSchema = jest.fn().mockResolvedValue(mockCurrentSchema);
    
    // Cast to any to bypass private member type checking for the constructor argument
    mementoConstructor = new MementoConstructor(mockSchemaManager as any);
  });

  describe('constructMemento', () => {
    it('should construct a MemoryMemento from ProcessedInputData (TDD_ANCHOR:MementoConstructor_constructMemento_validInput_returnsMemento)', async () => {
      const processedData: ProcessedInputData = {
        agentId: 'agent-test-001',
        sourceSystem: Source.API_UPLOAD,
        sourceIdentifier: 'api-upload-001',
        originalContentType: 'Text' as ContentType,
        originalContentRaw: 'This is the original raw text.',
        normalizedContent: 'this is the original raw text.',
        processedContentSummary: 'Original raw text summary.',
        determinedContentTypeForMemento: 'Text' as ContentType,
        detectedEntities: [{ name: 'Test Entity', type: 'Organization', originalText: 'Test Entity' }],
        derivedEmotionalContext: { dominantEmotion: 'neutral', emotionalValence: 0.0 },
        aggregatedTemporalContext: { eventTimestamp: new Date().toISOString(), chronologicalCertainty: 'Precise' },
        aggregatedSpatialContext: { locationName: 'Office' },
        aggregatedReasoningContext: { cognitiveState: 'focused' },
        derivedTags: ['text', 'test-entity'],
      };

      const memento = await mementoConstructor.constructMemento(processedData);

      expect(memento).toBeDefined();
      expect(memento.mementoId).toBeDefined(); // Should be generated
      expect(memento.agentId).toEqual(processedData.agentId);
      expect(memento.creationTimestamp).toBeDefined(); // Should be set
      expect(memento.sourceSystem).toEqual(processedData.sourceSystem);
      expect(memento.sourceIdentifier).toEqual(processedData.sourceIdentifier);
      expect(memento.contentType).toEqual(processedData.determinedContentTypeForMemento);
      expect(memento.contentRaw).toEqual(processedData.originalContentRaw); // As per domain model, memento stores original raw
      expect(memento.contentProcessed).toEqual(processedData.processedContentSummary);
      expect(memento.tags).toEqual(expect.arrayContaining(processedData.derivedTags || []));
      expect(memento.schemaVersion).toEqual(mockCurrentSchema.version); // Should use current schema version

      // Contextual Dimensions
      expect(memento.temporalContext).toEqual(processedData.aggregatedTemporalContext);
      expect(memento.spatialContext).toEqual(processedData.aggregatedSpatialContext);
      expect(memento.emotionalContext).toEqual(processedData.derivedEmotionalContext);
      expect(memento.reasoningContext).toEqual(processedData.aggregatedReasoningContext);
    });

    it('should throw an error if schema version cannot be retrieved (TDD_ANCHOR:MementoConstructor_constructMemento_noSchema_throwsError)', async () => {
      mockSchemaManager.getCurrentSchema = jest.fn().mockRejectedValue(new Error('Schema not available'));
      
      const processedData: ProcessedInputData = { /* ... minimal valid ProcessedInputData ... */ } as ProcessedInputData;
       // Fill with minimal data to satisfy ProcessedInputData requirements for the test's purpose
      processedData.agentId = 'agent-error-case';
      processedData.sourceSystem = Source.MANUAL_INPUT;
      processedData.originalContentType = 'Text';
      processedData.originalContentRaw = 'error content';
      processedData.normalizedContent = 'error content';
      processedData.determinedContentTypeForMemento = 'Text';
      processedData.aggregatedTemporalContext = { eventTimestamp: new Date().toISOString() };


      await expect(mementoConstructor.constructMemento(processedData)).rejects.toThrow('Failed to construct memento: Failed to retrieve current schema: Schema not available');
    });

    // Add more tests for:
    // - Different content types and how they map to memento fields
    // - Missing optional fields in ProcessedInputData
    // - Logic for combining/deriving tags if any
  });
});