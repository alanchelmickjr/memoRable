import { PreprocessingPrism } from '../../../src/services/ingestion_service/preprocessing_prism';
import { RawInputData, ProcessedInputData, ContentType, Source, DataType, TemporalContext } from '../../../src/services/ingestion_service/models';
// Mock client dependencies
import { EntityExtractorClient } from '../../../src/services/ingestion_service/clients/entity_extractor_client';
import { EmotionAnalyzerClient } from '../../../src/services/ingestion_service/clients/emotion_analyzer_client';
import { ContextAggregatorClient } from '../../../src/services/ingestion_service/clients/context_aggregator_client';
import { ContentSummarizerClient } from '../../../src/services/ingestion_service/clients/content_summarizer_client'; // Import the actual class
import { DataNormalizer } from '../../../src/services/ingestion_service/preprocessing_prism';


jest.mock('../../../src/services/ingestion_service/clients/entity_extractor_client');
jest.mock('../../../src/services/ingestion_service/clients/emotion_analyzer_client');
jest.mock('../../../src/services/ingestion_service/clients/context_aggregator_client');
jest.mock('../../../src/services/ingestion_service/clients/content_summarizer_client'); // Mock the summarizer

describe('PreprocessingPrism', () => {
  let preprocessingPrism: PreprocessingPrism;
  let consistentTimestamp: string; // Declare here
  let mockEntityExtractorClient: jest.Mocked<EntityExtractorClient>;
  let mockEmotionAnalyzerClient: jest.Mocked<EmotionAnalyzerClient>;
  let mockContextAggregatorClient: jest.Mocked<ContextAggregatorClient>;
  let mockContentSummarizerClient: jest.Mocked<ContentSummarizerClient>;
  let mockDataNormalizer: jest.Mocked<DataNormalizer>;
  let mockLogger: jest.Mocked<Console>;

  beforeEach(() => {
    consistentTimestamp = new Date().toISOString(); // Assign in beforeEach
    mockEntityExtractorClient = new EntityExtractorClient() as jest.Mocked<EntityExtractorClient>;
    mockEmotionAnalyzerClient = new EmotionAnalyzerClient() as jest.Mocked<EmotionAnalyzerClient>;
    mockContextAggregatorClient = new ContextAggregatorClient() as jest.Mocked<ContextAggregatorClient>;
    mockContentSummarizerClient = new ContentSummarizerClient() as jest.Mocked<ContentSummarizerClient>;
    mockDataNormalizer = new DataNormalizer() as jest.Mocked<DataNormalizer>;
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any; // Cast to any to satisfy Console type if it's complex

    // Assign mock functions to the methods of the mocked instances
    // consistentTimestamp is now assigned above
    (mockEntityExtractorClient as any).extract = jest.fn().mockResolvedValue([]);
    (mockEmotionAnalyzerClient as any).analyze = jest.fn().mockResolvedValue({});
    (mockContextAggregatorClient as any).aggregateContext = jest.fn().mockResolvedValue({
      temporalContext: { eventTimestamp: consistentTimestamp }, // Use consistent timestamp
    });
    (mockContentSummarizerClient as any).summarize = jest.fn().mockResolvedValue('Default summary.');
    (mockDataNormalizer as any).normalize = jest.fn().mockImplementation((content: any, contentType: ContentType) => {
      if (typeof content === 'string') {
        return content.trim().toLowerCase();
      }
      return content;
    });

    preprocessingPrism = new PreprocessingPrism(
      mockDataNormalizer,
      mockEntityExtractorClient,
      mockEmotionAnalyzerClient,
      mockContextAggregatorClient,
      mockContentSummarizerClient,
      mockLogger // Pass the logger mock
    );
  });

  describe('process', () => {
    it('should process a simple text input and return ProcessedInputData (TDD_ANCHOR:PreprocessingPrism_process_textInput_returnsProcessedData)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-123',
        sourceSystem: Source.MANUAL_INPUT, // Using Source enum as per models
        sourceIdentifier: 'manual-text-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'This is a simple test sentence.',
        eventTimestamp: consistentTimestamp, // Use consistent timestamp
        metadata: { customField: 'customValue' },
      };

      // Expected structure, some fields will be populated by mocked services later
      const expectedProcessedDataPartial: Partial<ProcessedInputData> = {
        agentId: 'agent-123',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-001',
        originalContentType: 'Text' as ContentType,
        originalContentRaw: 'This is a simple test sentence.',
        determinedContentTypeForMemento: 'Text' as ContentType,
        // normalizedContent and processedContentSummary will depend on internal logic/mocks
        // detectedEntities, derivedEmotionalContext will depend on client mocks
      };

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(true);

      // Type guard to ensure outcome is PreprocessingSuccess
      if (!outcome.success) {
        throw new Error('Preprocessing was expected to succeed, but failed.');
      }
      const result = outcome.data; // Now result is ProcessedInputData

      expect(result.agentId).toEqual(expectedProcessedDataPartial.agentId);
      expect(result.sourceSystem).toEqual(expectedProcessedDataPartial.sourceSystem);
      expect(result.sourceIdentifier).toEqual(expectedProcessedDataPartial.sourceIdentifier);
      expect(result.originalContentType).toEqual(expectedProcessedDataPartial.originalContentType);
      expect(result.originalContentRaw).toEqual(expectedProcessedDataPartial.originalContentRaw);
      expect(result.determinedContentTypeForMemento).toEqual(expectedProcessedDataPartial.determinedContentTypeForMemento);
      
      // Check for presence of aggregated contexts (even if empty initially)
      expect(result.aggregatedTemporalContext).toBeDefined();
      expect(result.aggregatedTemporalContext.eventTimestamp).toEqual(rawData.eventTimestamp);
      // For optional contexts, check they are at least defined (can be empty objects or undefined based on implementation)
      expect(result).toHaveProperty('aggregatedSpatialContext');
      expect(result).toHaveProperty('aggregatedReasoningContext');
      expect(result).toHaveProperty('derivedEmotionalContext');
      expect(result.derivedTags).toBeDefined(); // Tags should be initialized (e.g. as empty array)
      expect(result.normalizedContent).toBeDefined(); // Should be populated
      // processedContentSummary is optional and might not be defined if summarizer is not used/active
      expect(result).toHaveProperty('processedContentSummary');
    });

    // Add more tests here for:
    // - Different content types (AudioTranscript, ImageDescriptor, etc.)
    // - Cases where client services (entity, emotion) return data
    // - Error handling (e.g., if a client call fails)
    // - Normalization logic (TDD_ANCHOR:PreprocessingPrism_process_normalizeText_calledForText)
    // - Summarization logic (TDD_ANCHOR:PreprocessingPrism_process_summarizeText_calledForText)
    // - Tag generation (TDD_ANCHOR:PreprocessingPrism_process_generateTags_called)
    // - Context aggregation (TDD_ANCHOR:PreprocessingPrism_process_aggregateContexts_combinesResults)

    it('should normalize text input by trimming and lowercasing (TDD_ANCHOR:PreprocessingPrism_process_normalizeText_calledForText)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-normalize-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-normalize-001',
        contentType: 'Text' as ContentType,
        contentRaw: '  This Is Mixed CASE with Spaces.  ',
        eventTimestamp: consistentTimestamp, // Use consistent timestamp for this test too, or a new one if it needs to be distinct
        metadata: {}, // Added missing metadata
      };

      const outcome = await preprocessingPrism.process(rawData);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error('Preprocessing failed');

      const result = outcome.data;
      expect(result.normalizedContent).toEqual('this is mixed case with spaces.');
      // Ensure other essential fields are still present
      expect(result.agentId).toEqual(rawData.agentId);
      expect(result.originalContentRaw).toEqual(rawData.contentRaw);
    });

    it('should call summarizer for text input and store its result (TDD_ANCHOR:PreprocessingPrism_process_summarizeText_calledForText)', async () => {
      const longTextContent = 'This is a very long text that definitely needs summarization. It has multiple sentences and discusses various topics to ensure the summarizer has enough material to work with effectively and produce a meaningful, concise summary.';
      const normalizedLongText = longTextContent.trim().toLowerCase();
      const expectedSummary = 'Long text summarized.';

      const rawData: RawInputData = {
        agentId: 'agent-summarize-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-summarize-001',
        contentType: 'Text' as ContentType,
        contentRaw: longTextContent,
        eventTimestamp: consistentTimestamp,
        metadata: {}, // Added missing metadata
      };

      // Override the default mock for this specific test
      (mockContentSummarizerClient.summarize as jest.Mock).mockResolvedValue(expectedSummary);

      const outcome = await preprocessingPrism.process(rawData);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error('Preprocessing failed');

      const result = outcome.data;

      expect(mockContentSummarizerClient.summarize).toHaveBeenCalledTimes(1);
      expect(mockContentSummarizerClient.summarize).toHaveBeenCalledWith(normalizedLongText, rawData.contentType);
      expect(result.processedContentSummary).toEqual(expectedSummary);
      // Ensure other essential fields are still present
      expect(result.agentId).toEqual(rawData.agentId);
      expect(result.normalizedContent).toEqual(normalizedLongText);
    });

    it('should generate tags from extracted entities (TDD_ANCHOR:PreprocessingPrism_process_generateTags_called)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-tags-001',
        sourceSystem: Source.API_UPLOAD,
        sourceIdentifier: 'api-tags-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Apple is a company. Paris is in France.',
        eventTimestamp: consistentTimestamp,
        metadata: {}, // Added missing metadata
      };
      const mockEntities = [
        { name: 'Apple', type: 'ORGANIZATION', relevance: 0.9 },
        { name: 'Paris', type: 'LOCATION', relevance: 0.8 },
        { name: 'France', type: 'LOCATION', relevance: 0.7 },
      ];
      const expectedTags = ['ORGANIZATION:Apple', 'LOCATION:Paris', 'LOCATION:France'];

      (mockEntityExtractorClient.extract as jest.Mock).mockResolvedValue(mockEntities);

      const outcome = await preprocessingPrism.process(rawData);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error('Preprocessing failed');

      const result = outcome.data;

      expect(mockEntityExtractorClient.extract).toHaveBeenCalledTimes(1);
      expect(result.detectedEntities).toEqual(mockEntities);
      expect(result.derivedTags!).toEqual(expect.arrayContaining(expectedTags)); // Added non-null assertion
      expect(result.derivedTags!.length).toEqual(expectedTags.length); // Added non-null assertion
    });

    it('should aggregate contexts from ContextAggregatorClient (TDD_ANCHOR:PreprocessingPrism_process_aggregateContexts_combinesResults)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-context-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-context-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Some content for context aggregation.',
        eventTimestamp: consistentTimestamp, // Re-use from beforeEach for simplicity
        metadata: {}, // Added missing metadata
      };

      const mockAggregatedContexts = {
        temporalContext: {
          eventTimestamp: consistentTimestamp,
          previousInteractionTimestamp: new Date(Date.now() - 10000).toISOString(),
          recentInteractionsCount: 5,
        },
        spatialContext: {
          currentLocation: 'Office',
          nearbyObjects: ['Desk', 'Computer'],
        },
        reasoningContext: {
          currentGoal: 'Test context aggregation',
          activeProcesses: ['jest'],
        },
      };

      (mockContextAggregatorClient.aggregateContext as jest.Mock).mockResolvedValue(mockAggregatedContexts);

      const outcome = await preprocessingPrism.process(rawData);
      expect(outcome.success).toBe(true);
      if (!outcome.success) throw new Error('Preprocessing failed');

      const result = outcome.data;

      expect(mockContextAggregatorClient.aggregateContext).toHaveBeenCalledTimes(1);
      expect(mockContextAggregatorClient.aggregateContext).toHaveBeenCalledWith(rawData.agentId, rawData.eventTimestamp);
      
      expect(result.aggregatedTemporalContext).toEqual(mockAggregatedContexts.temporalContext);
      expect(result.aggregatedSpatialContext).toEqual(mockAggregatedContexts.spatialContext);
      expect(result.aggregatedReasoningContext).toEqual(mockAggregatedContexts.reasoningContext);
    });

    it('should return a PreprocessingFailure for unsupported content types (TDD_ANCHOR:PreprocessingPrism_process_unsupportedContentType_returnsErrorOrSpecificHandling)', async () => {
      const rawData: RawInputData = {
        agentId: 'test-agent-id',
        sourceSystem: Source.API_UPLOAD,
        sourceIdentifier: 'test-source-id-unsupported',
        contentType: 'UnsupportedContentType' as ContentType, // This type won't be in our ContentType union
        contentRaw: { data: 'some unsupported data' },
        eventTimestamp: consistentTimestamp,
        metadata: {},
      };

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(false);
      
      // Type guard to satisfy TypeScript
      if (!outcome.success) {
        const failureOutcome = outcome as import('../../../src/services/ingestion_service/preprocessing_prism').PreprocessingFailure;
        // Now TypeScript knows 'failureOutcome' is PreprocessingFailure within this block
        expect(failureOutcome.error).toBeDefined();
        expect(failureOutcome.error.message).toMatch(/Unsupported content type/i);
        expect(failureOutcome.error.originalContentType).toEqual('UnsupportedContentType');
      } else {
        // This path should ideally not be hit if the above expect(outcome.success).toBe(false) is correct.
        // Forcing a test failure here if outcome.success is unexpectedly true.
        throw new Error('Test assertion failed: outcome.success was true for an unsupported content type.');
      }
    });

    it('should handle ContentSummarizerClient failure gracefully (TDD_ANCHOR:PreprocessingPrism_process_clientFailure_summarizer_handlesGracefully)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-summarizer-fail-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-summarizer-fail-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Some text that would normally be summarized.',
        eventTimestamp: consistentTimestamp,
        metadata: {},
      };

      const summarizerError = new Error('Summarizer failed unexpectedly');
      (mockContentSummarizerClient.summarize as jest.Mock).mockRejectedValue(summarizerError);

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(true); // Expect overall success despite summarizer failure
      if (!outcome.success) throw new Error("Preprocessing should succeed even if summarizer fails");

      const result = outcome.data;
      expect(result.processedContentSummary).toBeUndefined(); // Or null, depending on implementation
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during content summarization'),
        expect.objectContaining({ error: summarizerError })
      );
      // Ensure other parts of processing still happened
      expect(result.normalizedContent).toEqual('some text that would normally be summarized.');
      expect(mockEntityExtractorClient.extract).toHaveBeenCalled();
      expect(mockContextAggregatorClient.aggregateContext).toHaveBeenCalled();
    });

    it('should handle EntityExtractorClient failure gracefully (TDD_ANCHOR:PreprocessingPrism_process_clientFailure_entityExtractor_handlesGracefully)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-entity-fail-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-entity-fail-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Some text for entity extraction.',
        eventTimestamp: consistentTimestamp,
        metadata: {},
      };

      const entityError = new Error('Entity extractor failed');
      (mockEntityExtractorClient.extract as jest.Mock).mockRejectedValue(entityError);

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(true); // Expect overall success
      if (!outcome.success) throw new Error("Preprocessing should succeed even if entity extractor fails");
      
      const result = outcome.data;
      expect(result.detectedEntities).toEqual([]); // Should be empty or undefined
      expect(result.derivedTags).toEqual([]);   // Should be empty
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during entity extraction'),
        expect.objectContaining({ error: entityError })
      );
      // Ensure other parts of processing still happened
      expect(result.normalizedContent).toEqual('some text for entity extraction.');
      expect(mockContentSummarizerClient.summarize).toHaveBeenCalled(); // Assuming it's called for text
      expect(mockContextAggregatorClient.aggregateContext).toHaveBeenCalled();
    });

    it('should handle EmotionAnalyzerClient failure gracefully (TDD_ANCHOR:PreprocessingPrism_process_clientFailure_emotionAnalyzer_handlesGracefully)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-emotion-fail-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-emotion-fail-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Some text for emotion analysis.',
        eventTimestamp: consistentTimestamp,
        metadata: {},
      };

      const emotionError = new Error('Emotion analyzer failed');
      (mockEmotionAnalyzerClient.analyze as jest.Mock).mockRejectedValue(emotionError);

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(true); // Expect overall success
      if (!outcome.success) throw new Error("Preprocessing should succeed even if emotion analyzer fails");
      
      const result = outcome.data;
      expect(result.derivedEmotionalContext).toEqual({}); // Should be an empty object
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during emotional analysis'),
        expect.objectContaining({ error: emotionError })
      );
      // Ensure other parts of processing still happened
      expect(result.normalizedContent).toEqual('some text for emotion analysis.');
      expect(mockEntityExtractorClient.extract).toHaveBeenCalled();
      expect(mockContentSummarizerClient.summarize).toHaveBeenCalled();
      expect(mockContextAggregatorClient.aggregateContext).toHaveBeenCalled();
    });

    it('should handle ContextAggregatorClient failure gracefully (TDD_ANCHOR:PreprocessingPrism_process_clientFailure_contextAggregator_handlesGracefully)', async () => {
      const rawData: RawInputData = {
        agentId: 'agent-context-fail-001',
        sourceSystem: Source.MANUAL_INPUT,
        sourceIdentifier: 'manual-text-context-fail-001',
        contentType: 'Text' as ContentType,
        contentRaw: 'Some text for context aggregation.',
        eventTimestamp: consistentTimestamp,
        metadata: {},
      };

      const contextError = new Error('Context aggregator failed');
      (mockContextAggregatorClient.aggregateContext as jest.Mock).mockRejectedValue(contextError);

      const outcome = await preprocessingPrism.process(rawData);

      expect(outcome.success).toBe(true); // Expect overall success
      if (!outcome.success) throw new Error("Preprocessing should succeed even if context aggregator fails");
      
      const result = outcome.data;
      // Temporal context should have a fallback
      expect(result.aggregatedTemporalContext).toBeDefined();
      expect(result.aggregatedTemporalContext.eventTimestamp).toEqual(rawData.eventTimestamp);
      // Other contexts might be empty
      expect(result.aggregatedSpatialContext).toEqual({});
      expect(result.aggregatedReasoningContext).toEqual({});

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during context aggregation'),
        expect.objectContaining({ error: contextError })
      );
      // Ensure other parts of processing still happened
      expect(result.normalizedContent).toEqual('some text for context aggregation.');
      expect(mockEntityExtractorClient.extract).toHaveBeenCalled();
      expect(mockContentSummarizerClient.summarize).toHaveBeenCalled();
      expect(mockEmotionAnalyzerClient.analyze).toHaveBeenCalled();
    });
  });
});