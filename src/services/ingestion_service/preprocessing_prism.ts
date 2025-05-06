/**
 * @file Implements the PreprocessingPrism class for the Ingestion Microservice.
 * This class handles data normalization, enrichment, and transformation of raw input data.
 */

import {
  RawInputData,
  ProcessedInputData,
  ContentType,
  TemporalContext,
  // Import other necessary types from models.ts as needed
} from './models';
// Placeholder for actual client implementations
import { EntityExtractorClient } from './clients/entity_extractor_client';
import { EmotionAnalyzerClient } from './clients/emotion_analyzer_client';
import { ContextAggregatorClient } from './clients/context_aggregator_client';
import { ContentSummarizerClient } from './clients/content_summarizer_client'; // Optional
// import { Logger } from '../../utils/logger'; // Assuming a shared logger utility

// Placeholder for a DataNormalizer utility/class
export class DataNormalizer {
  normalize(content: any, contentType: ContentType): string | object {
    // Basic normalization: if content is string, trim it.
    // More sophisticated normalization would depend on contentType.
    if (typeof content === 'string') {
      return content.trim().toLowerCase();
    }
    // For non-string types, return as is or implement specific normalization
    // e.g., for CodeChange, parse and reformat, or for SystemLog, structure fields.
    this.logger.warn(`Normalization for contentType '${contentType}' not fully implemented. Returning raw content.`);
    return content;
  }
  // This would ideally be a proper logger instance
  public logger = console; // Made public for easier mocking in tests if needed by DataNormalizer itself
}

// Placeholder for ContentSummarizerClient (Optional)
// class ContentSummarizerClient {
//   async summarize(content: string | object, contentType: ContentType): Promise<string | object> {
//     this.logger.info('ContentSummarizerClient.summarize called (placeholder)');
//     if (typeof content === 'string' && content.length > 100) { // Arbitrary length for summarization
//       return content.substring(0, 97) + '...';
//     }
//     return content; // Or a more structured summary object
//   }
//    private logger = console;
// }


/**
 * Handles data normalization, enrichment, and transformation.
 */
/**
 * Represents a successful preprocessing outcome.
 */
export interface PreprocessingSuccess {
  success: true;
  data: ProcessedInputData;
}

/**
 * Represents a failed preprocessing outcome.
 */
export interface PreprocessingErrorDetail {
  message: string;
  originalContentType?: ContentType;
  step?: string; // e.g., 'normalization', 'entityExtraction'
}

export interface PreprocessingFailure {
  success: false;
  error: PreprocessingErrorDetail; // Changed from string to a structured object
  details?: any; // For additional raw error info, like the original error object
}

/**
 * Union type for the result of the preprocessing operation.
 */
export type PreprocessingOutcome = PreprocessingSuccess | PreprocessingFailure;

export class PreprocessingPrism {
  private normalizer: DataNormalizer;
  private entityExtractor: EntityExtractorClient;
  private emotionAnalyzer: EmotionAnalyzerClient;
  private contextAggregator: ContextAggregatorClient;
  private contentSummarizer?: ContentSummarizerClient; // Optional
  private logger: Console; // Using Console for placeholder

  constructor(
    // In a real setup, these would be injected instances of actual client classes
    normalizer?: DataNormalizer,
    entityExtractor?: EntityExtractorClient,
    emotionAnalyzer?: EmotionAnalyzerClient,
    contextAggregator?: ContextAggregatorClient,
    contentSummarizer?: ContentSummarizerClient, // Optional
    logger?: Console
  ) {
    this.normalizer = normalizer || new DataNormalizer();
    this.entityExtractor = entityExtractor || new EntityExtractorClient();
    this.emotionAnalyzer = emotionAnalyzer || new EmotionAnalyzerClient();
    this.contextAggregator = contextAggregator || new ContextAggregatorClient();
    this.contentSummarizer = contentSummarizer; // Optional
    this.logger = logger || console;
  }

  /**
   * Processes raw input data to normalize, enrich, and transform it.
   * @param {RawInputData} rawInput - The raw data received by the ingestion endpoint.
   * @returns {Promise<PreprocessingOutcome>} - The outcome of the preprocessing.
   */
  public async process(rawInput: RawInputData): Promise<PreprocessingOutcome> {
    this.logger.info(`PreprocessingPrism: Starting processing for sourceSystem: ${rawInput.sourceSystem}, contentType: ${rawInput.contentType}`);

    try {
      // FR3.2.10: Handle unsupported content types
      if (!this.isSupportedContentType(rawInput.contentType)) {
        const errorMessage = `Unsupported content type: ${rawInput.contentType}`;
        this.logger.warn(`PreprocessingPrism: ${errorMessage}`, { rawInput });
        return {
          success: false,
          error: {
            message: errorMessage,
            originalContentType: rawInput.contentType,
            step: 'contentTypeCheck'
          }
        };
      }

      const processedData: Partial<ProcessedInputData> = {
        sourceSystem: rawInput.sourceSystem,
        sourceIdentifier: rawInput.sourceIdentifier,
        originalContentType: rawInput.contentType,
        originalContentRaw: rawInput.contentRaw,
        agentId: rawInput.agentId,
        derivedTags: [], // Initialize derivedTags
        // Initialize other optional fields that should always be present
        detectedEntities: [],
        derivedEmotionalContext: {},
        aggregatedSpatialContext: {},
        aggregatedReasoningContext: {},
        processedContentSummary: undefined, // Or an appropriate default like null or empty string
      };

      // 1. Normalize and Clean (FR3.2.1)
      processedData.normalizedContent = this.normalizer.normalize(rawInput.contentRaw, rawInput.contentType);
      this.logger.info('PreprocessingPrism: Content normalization complete.');

      // 2. Entity Extraction (FR3.2.2) - if applicable for content type
      if (this.canExtractEntities(rawInput.contentType)) {
        try {
          processedData.detectedEntities = await this.entityExtractor.extract(processedData.normalizedContent);
          if (processedData.detectedEntities && processedData.detectedEntities.length > 0) {
            processedData.derivedTags = processedData.detectedEntities.map(entity => `${entity.type}:${entity.name}`);
            this.logger.info(`PreprocessingPrism: Entity extraction complete. Found ${processedData.detectedEntities.length} entities.`);
          } else {
            this.logger.info('PreprocessingPrism: No entities extracted or applicable.');
          }
        } catch (entityError) {
          this.logger.error('PreprocessingPrism: Error during entity extraction. Continuing without entities.', { error: entityError, agentId: rawInput.agentId, sourceIdentifier: rawInput.sourceIdentifier });
          processedData.detectedEntities = []; // Default to empty array on error
          processedData.derivedTags = [];    // Default to empty array on error
        }
      }

      // 3. Emotional Analysis (FR3.2.3) - if applicable
      if (this.canAnalyzeEmotion(rawInput.contentType)) {
        try {
          processedData.derivedEmotionalContext = await this.emotionAnalyzer.analyze(processedData.normalizedContent);
          this.logger.info('PreprocessingPrism: Emotional analysis complete.');
        } catch (emotionError) {
          this.logger.error('PreprocessingPrism: Error during emotional analysis. Continuing without emotional context.', { error: emotionError, agentId: rawInput.agentId, sourceIdentifier: rawInput.sourceIdentifier });
          processedData.derivedEmotionalContext = {}; // Default to empty object
        }
      }

      // 4. Aggregate Context (FR3.2.4)
      try {
        const aggregatedContexts = await this.contextAggregator.aggregateContext(rawInput.agentId, rawInput.eventTimestamp);
        processedData.aggregatedTemporalContext = aggregatedContexts.temporalContext;
        processedData.aggregatedSpatialContext = aggregatedContexts.spatialContext;
        processedData.aggregatedReasoningContext = aggregatedContexts.reasoningContext;
        this.logger.info('PreprocessingPrism: Context aggregation complete.');
      } catch (contextError) {
         this.logger.error('PreprocessingPrism: Error during context aggregation. Continuing with minimal temporal context.', { error: contextError, agentId: rawInput.agentId, sourceIdentifier: rawInput.sourceIdentifier });
         // Provide a default temporal context as it's crucial
         processedData.aggregatedTemporalContext = { eventTimestamp: rawInput.eventTimestamp };
         processedData.aggregatedSpatialContext = {};
         processedData.aggregatedReasoningContext = {};
      }
      
      // 5. Determine final content type for Memento (FR3.2.5)
      // For now, assume it's the same as original, can be refined
      processedData.determinedContentTypeForMemento = rawInput.contentType;

      // 6. Content Summarization (FR3.2.6) - Optional
      if (this.contentSummarizer && this.canSummarizeContent(rawInput.contentType)) {
        if (typeof processedData.normalizedContent === 'string') {
          try {
            processedData.processedContentSummary = await this.contentSummarizer.summarize(
              processedData.normalizedContent,
              rawInput.contentType
            );
            this.logger.info('PreprocessingPrism: Content summarization complete.');
          } catch (summarizerError) {
            this.logger.error('PreprocessingPrism: Error during content summarization. Continuing without summary.', { error: summarizerError, agentId: rawInput.agentId, sourceIdentifier: rawInput.sourceIdentifier });
            processedData.processedContentSummary = undefined; // Explicitly set to undefined or null
          }
        } else {
          this.logger.warn('PreprocessingPrism: Skipping summarization as normalizedContent is not a string.');
        }
      }


      // Ensure all required fields for ProcessedInputData are present
      if (!processedData.aggregatedTemporalContext) {
        // This should be guaranteed by contextAggregator, but as a safeguard:
        this.logger.warn('PreprocessingPrism: AggregatedTemporalContext is missing, defaulting.');
        processedData.aggregatedTemporalContext = { eventTimestamp: new Date().toISOString() };
      }


      this.logger.info(`PreprocessingPrism: Processing complete for sourceSystem: ${rawInput.sourceSystem}`);
      return { success: true, data: processedData as ProcessedInputData };

    } catch (error) {
      const errorMessage = `Preprocessing failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('PreprocessingPrism: Error during processing.', { error: errorMessage, rawInput });
      return {
        success: false,
        error: {
          message: errorMessage,
          originalContentType: rawInput.contentType, // Include contentType if available
          step: 'unknown' // Or try to determine step if possible
        },
        details: error
      };
    }
  }

  /**
   * Determines if entities can be extracted from the given content type.
   * @param {ContentType} contentType - The content type to check.
   * @returns {boolean} True if entities can be extracted, false otherwise.
   */
  private canExtractEntities(contentType: ContentType): boolean {
    // Placeholder logic: enable for text-based content types
    return contentType === 'Text' || contentType === 'AudioTranscript' || contentType === 'CodeChange';
  }

  /**
   * Determines if emotion can be analyzed from the given content type.
   * @param {ContentType} contentType - The content type to check.
   * @returns {boolean} True if emotion can be analyzed, false otherwise.
   */
  private canAnalyzeEmotion(contentType: ContentType): boolean {
    // Placeholder logic: enable for text or audio transcripts
    return contentType === 'Text' || contentType === 'AudioTranscript';
  }

  /**
   * Determines if content can be summarized for the given content type. (Optional)
   * @param {ContentType} contentType - The content type to check.
   * @returns {boolean} True if content can be summarized, false otherwise.
   */
 private canSummarizeContent(contentType: ContentType): boolean {
   // Placeholder: enable for long text
   return contentType === 'Text';
 }

 private isSupportedContentType(contentType: ContentType): boolean {
   // Define supported content types for processing.
   // This is a simplified check; a more robust mechanism might involve a configuration.
   const supportedTypes: ContentType[] = [
     "Text",
     "AudioTranscript",
     // "ImageDescriptor", // Assuming not yet fully supported for all steps
     // "CodeChange",
     // "SystemLog",
     // "UserInteraction",
   ];
   return supportedTypes.includes(contentType);
 }
}