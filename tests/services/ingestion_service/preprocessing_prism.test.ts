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
  });
});