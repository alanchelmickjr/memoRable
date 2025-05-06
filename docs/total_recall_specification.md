# MemoRable - Total Recall: Embedding and Data Ingestion Specification

## 0. Introduction

This document details the specification for the "MemoRable - Total Recall" embedding and data ingestion system. It builds upon the foundational concepts outlined in the project's [`README.md`](../README.md), [`memoRable_implementation_plan.md`](../memoRable_implementation_plan.md), and [`docs/technical-architecture.md`](./technical-architecture.md). The primary goal is to define how multifaceted memory items are structured, embedded, ingested, and retrieved to provide AI agents with comprehensive and contextually rich recall capabilities.

This specification adheres to the principle of **alliterative naming** for new components and concepts and includes **TDD anchors** for key processes.

## 1. Memory Item Structure ("Memory Memento")

A single "Memory Memento" is the atomic unit of recall within the MemoRable system. Each memento is a rich, multi-dimensional record capturing not just raw data but also its surrounding context.

**TDD Anchors:**
*   `// TDD: TestMemoryMementoSchemaValidation`: Ensures mementos adhere to the defined schema.
*   `// TDD: TestMemoryMementoSerializationDeserialization`: Verifies mementos can be correctly serialized and deserialized.

### 1.1. Core Attributes

Each Memory Memento will possess the following core attributes:

*   `mementoId`: (String, UUID) Unique identifier for the memory memento.
*   `agentId`: (String, UUID) Identifier of the AI agent to whom this memory belongs.
*   `creationTimestamp`: (ISO 8601 Timestamp) Timestamp of when the memento was created in the system.
*   `sourceSystem`: (String) The system or module that originated the data (e.g., "UserInteraction", "CodeAnalyzer", "InternalThought").
*   `sourceIdentifier`: (String, Optional) An ID from the source system, if applicable (e.g., message ID, commit hash).
*   `contentType`: (String Enum) The primary type of content (e.g., "Text", "AudioTranscript", "ImageDescriptor", "CodeChange", "SystemLog").
*   `contentRaw`: (String/Object) The raw data of the memory (e.g., text string, JSON object describing an image or code change).
*   `contentProcessed`: (String/Object, Optional) Processed or summarized version of the raw content, potentially used for quick previews or specific embedding strategies.
*   `tags`: (Array of Strings, Optional) Keywords or tags for categorization and filtering.

### 1.2. Temporal Context ("Temporal Tapestry")

Captures the time-related aspects of the memory.

*   `eventTimestamp`: (ISO 8601 Timestamp) The actual time the event described by the memento occurred or began.
*   `eventDurationMs`: (Integer, Optional) Duration of the event in milliseconds, if applicable.
*   `chronologicalCertainty`: (String Enum: "Precise", "Estimated", "Inferred", Optional) Confidence in the eventTimestamp.
*   `temporalMarkers`: (Array of Objects, Optional) Significant time points within the event, each with a `markerName` (String) and `offsetMs` (Integer, relative to `eventTimestamp`).
    *   Example: `[{ "markerName": "DecisionPoint", "offsetMs": 5000 }]`

### 1.3. Spatial Context ("Spatial Sphere")

Defines the location and environmental aspects.

*   `locationCoordinates`: (Object, Optional)
    *   `latitude`: (Float)
    *   `longitude`: (Float)
    *   `altitude`: (Float, Optional)
    *   `accuracyMeters`: (Float, Optional)
*   `locationName`: (String, Optional) Human-readable location (e.g., "Office", "User's Home").
*   `spatialProximity`: (Array of Objects, Optional) Describes proximity to known entities or points of interest.
    *   `entityId`: (String, UUID) ID of the proximate entity.
    *   `entityType`: (String) Type of entity (e.g., "User", "Device", "KnownPlace").
    *   `distanceMeters`: (Float, Optional)
    *   `relation`: (String, Optional, e.g., "Near", "Facing", "InteractingWith")

### 1.4. Emotional Context ("Emotional Echo")

Details the emotional landscape associated with the memory, leveraging [`src/constants/emotions.js`](../src/constants/emotions.js) and Hume AI.

*   `detectedEmotionsHume`: (Array of Objects, Optional) Raw output from Hume AI or a similar service. Each object could represent a detected emotion with its score/intensity.
    *   `name`: (String) Emotion name (e.g., "Joy", "Sadness" - ideally aligned with [`src/constants/emotions.js`](../src/constants/emotions.js)).
    *   `score`: (Float) Intensity or confidence score (0.0 to 1.0).
    *   `evidence`: (String/Object, Optional) Snippet of text or description of non-verbal cue that led to this detection.
*   `dominantEmotion`: (String, Optional) The primary emotion identified from `detectedEmotionsHume`, aligned with [`src/constants/emotions.js`](../src/constants/emotions.js).
*   `emotionalValence`: (Float, Optional, -1.0 to 1.0) Overall positive/negative sentiment.
*   `emotionalArousal`: (Float, Optional, 0.0 to 1.0) Overall intensity of the emotional experience.
*   `emotionalSource`: (String Enum: "Self", "ObservedOther", "InferredEnvironment") Whose emotion is being recorded.
*   `emotionalCertainty`: (String Enum: "Expressed", "Inferred", "Assumed") Confidence in the emotional assessment.

### 1.5. Reasoning Context ("Reasoning Rationale")

Captures inferences, causal links, goals, and cognitive states.

*   `inferencesMade`: (Array of Strings, Optional) Conclusions or deductions drawn by the agent related to this memory.
    *   Example: ["User seems pleased with the previous suggestion."]
*   `causalLinks`: (Array of Objects, Optional) Connections to other mementos or events.
    *   `linkedMementoId`: (String, UUID) ID of the related memento.
    *   `relationshipType`: (String Enum: "Causes", "CausedBy", "Precedes", "Follows", "CorrelatedWith", "Explains", "Contradicts")
    *   `strength`: (Float, Optional, 0.0 to 1.0) Confidence in the link.
*   `associatedGoals`: (Array of Objects, Optional) Goals active or relevant during this memory's event.
    *   `goalId`: (String, UUID)
    *   `goalDescription`: (String)
    *   `goalStatus`: (String Enum: "Active", "Achieved", "Failed", "Relevant")
*   `cognitiveState`: (String, Optional, e.g., "Focused", "Distracted", "ProblemSolving", "Learning", "Reflecting") Based on [`src/constants/emotions.js`](../src/constants/emotions.js) cognitive states like "Concentration", "Confusion", "Realization".
*   `taskContext`: (Object, Optional) Information from `TaskHopperService`.
    *   `taskId`: (String, UUID)
    *   `taskName`: (String)
    *   `taskStep`: (String)

### 1.6. Interleaving Contexts for Embedding

To create effective embeddings, the multifaceted contexts of a Memory Memento need to be combined into a coherent representation, typically text.

**Strategy: "Contextual Narrative Weaving"**

1.  **Core Content First**: Start with `contentProcessed` or `contentRaw`.
2.  **Temporal Weaving**: Append a concise natural language description of the `eventTimestamp` (e.g., "Occurred on May 6, 2025, around 11 AM") and `eventDurationMs` ("Lasted for 5 minutes").
3.  **Spatial Weaving**: Add location information (e.g., "Happened at the 'Office', near 'User's Desk'").
4.  **Emotional Weaving**: Integrate dominant emotions and their intensity (e.g., "The agent felt 'Joy' (intensity: 0.8) and observed 'Amusement' in the user."). If Hume AI provides rich dimensional data, this could be summarized or key dimensions highlighted.
5.  **Reasoning Weaving**: Include key inferences, active goals, or cognitive states (e.g., "Agent inferred 'User needs more detail' while working on 'Task X: Generate Report'. Cognitive state: 'ProblemSolving'.").
6.  **Keyword Augmentation**: Append key `tags` to reinforce important concepts.

**Example Combined Text for Embedding:**

```
"User asked: 'Tell me about the Q2 financial projections.' This occurred on May 6, 2025, around 11:05 AM and the interaction lasted for 3 minutes. Happened at the 'Main Office Conference Room'. Agent detected user 'Interest' (0.9) and 'Concentration' (0.7). Agent's cognitive state was 'Focused' while working on 'Task Y: Q2 Projection Briefing'. Inferred: 'User requires a concise summary'. Tags: #finance #q2 #projection #summary"
```

This narrative approach aims to provide the embedding model with a rich, interconnected story of the memory, allowing it to capture semantic relationships across different contextual dimensions. The exact phrasing and level of detail will be refined based on the chosen embedding model's capabilities and empirical testing.

**TDD Anchors:**
*   `// TDD: TestContextualNarrativeGeneration`: Ensures the narrative weaving process produces expected text.
*   `// TDD: TestNarrativeForEmbeddingCompleteness`: Verifies all key contexts are represented in the narrative.

---

## 2. Embedding Strategy ("Embedding Essence")

The effectiveness of MemoRable hinges on its ability to translate complex, context-rich Memory Mementos into meaningful vector embeddings that capture their semantic essence. This allows for efficient similarity searches and retrieval of relevant memories.

**TDD Anchors:**
*   `// TDD: TestEmbeddingGenerationProcess`: Verifies that an embedding is successfully generated for a valid memento narrative.
*   `// TDD: TestEmbeddingVectorDimensionality`: Ensures the generated embedding vector has the expected dimensions for the chosen model.
*   `// TDD: TestEmbeddingConsistency`: Checks that identical narratives produce identical (or highly similar) embeddings.

### 2.1. Recommended Embedding Model ("Model Matrix")

Choosing an appropriate embedding model is critical for capturing the nuances of the interleaved contexts described in the "Contextual Narrative Weaving" (Section 1.6).

**Primary Recommendation: OpenAI `text-embedding-3-large`**

*   **Justification:**
    *   **State-of-the-Art Performance:** OpenAI's latest generation embedding models are designed to capture semantic relationships with high fidelity across diverse text inputs. `text-embedding-3-large` offers their highest dimensionality (e.g., 3072 dimensions) and performance.
    *   **Nuance Capture:** These models are trained on vast datasets and are adept at understanding subtle contextual cues, which is essential for the rich, interwoven nature of Memory Mementos.
    *   **Scalability & Reliability:** OpenAI provides a robust API for generating embeddings at scale.
    *   **Future Potential:** OpenAI continually updates its models, offering a path for future improvements.

**Secondary Recommendation: Hugging Face Sentence Transformers (e.g., `sentence-transformers/all-mpnet-base-v2` or newer, more powerful models available via Ollama)**

*   **Justification:**
    *   **Open Source & Flexibility:** Provides greater control, potential for fine-tuning on domain-specific data (though this adds complexity), and the ability to run locally via Ollama, reducing external dependencies and potentially costs.
    *   **Strong Performance:** Models like `all-mpnet-base-v2` offer excellent general-purpose sentence and paragraph embeddings. Newer models may offer even better performance for complex narratives.
    *   **Community Support:** Large community and wide availability of pre-trained models.
    *   **Customization:** Aligns with the project's mention of "Custom Embedding Solutions" if deeper customization than narrative construction is eventually desired.

**Decision Criteria & Evaluation:**

The final choice (or a hybrid approach) will be based on:
1.  **Empirical Performance:** Testing with representative Memory Memento narratives to evaluate retrieval accuracy and relevance.
2.  **Cost:** API costs for proprietary models vs. computational costs for self-hosted models.
3.  **Latency:** Speed of embedding generation.
4.  **Ease of Integration:** Compatibility with the existing tech stack ([`src/config/weaviate.js`](../src/config/weaviate.js) for vector storage, potential integration with [`src/services/customModelService.js`](../src/services/customModelService.js) or a new "EmbeddingService").
5.  **Context Window:** The model must comfortably handle the length of the "Contextual Narrative Weaving" output.

### 2.2. Embedding Generation Process ("Vectorization Voyage")

The process of generating an embedding for a Memory Memento involves the following steps:

1.  **Memory Memento Finalization:**
    *   A complete Memory Memento object is constructed as per Section 1, with all relevant core, temporal, spatial, emotional, and reasoning contexts populated.
    *   **TDD Anchor:** `// TDD: TestMemoryMementoIsCompleteForEmbedding`

2.  **Contextual Narrative Generation:**
    *   The "Contextual Narrative Weaving" strategy (Section 1.6) is applied to the finalized Memory Memento. This produces a single text string that encapsulates the memento's multifaceted context.
    *   This step would likely be handled by a dedicated function or module (e.g., `NarrativeWeaver.weave(memento)`).
    *   **TDD Anchor:** `// TDD: TestNarrativeWeaverOutputFormat`

3.  **Text Preprocessing (Model-Specific):**
    *   The generated narrative text may require minor preprocessing steps depending on the chosen embedding model's input requirements (e.g., tokenization, truncation if exceeding max length, special token handling).
    *   This should be handled by an adapter specific to the chosen embedding model.
    *   **TDD Anchor:** `// TDD: TestEmbeddingInputPreprocessing`

4.  **Embedding Model Invocation:**
    *   The preprocessed narrative text is sent to the selected embedding model (e.g., via OpenAI API call, or local Ollama endpoint).
    *   A new service, potentially `EmbeddingOrchestrator` or an enhancement to [`src/services/customModelService.js`](../src/services/customModelService.js), will manage this interaction.
    *   **Function:** `EmbeddingOrchestrator.generateEmbedding(narrativeText)`
        *   Input: `narrativeText` (String)
        *   Output: `embeddingVector` (Array of Floats) or Error
        *   // TDD: TestEmbeddingOrchestratorApiCallSuccess
        *   // TDD: TestEmbeddingOrchestratorApiCallFailureHandling

5.  **Embedding Vector Reception:**
    *   The embedding model returns a dense vector (an array of floating-point numbers). The dimensionality of this vector depends on the chosen model (e.g., 1536 for OpenAI `text-embedding-ada-002`, 3072 for `text-embedding-3-large`, 768 for `all-mpnet-base-v2`).

6.  **Association and Storage Preparation:**
    *   The generated `embeddingVector` is associated with the `mementoId` of the Memory Memento.
    *   This pair (`mementoId`, `embeddingVector`) is then ready to be stored in Weaviate (see Section 3.3.4).

**Pseudocode for Embedding Generation Service:**

```pseudocode
CLASS EmbeddingService

  // Dependencies: NarrativeWeaver, EmbeddingModelClient (OpenAI, Ollama, etc.)
  CONSTRUCTOR(narrativeWeaver, embeddingModelClient)
    this.narrativeWeaver = narrativeWeaver
    this.embeddingModelClient = embeddingModelClient
  END CONSTRUCTOR

  // TDD: TestGenerateMementoEmbeddingNominalCase
  // TDD: TestGenerateMementoEmbeddingErrorHandling
  FUNCTION generateMementoEmbedding(memento: MemoryMemento) : Vector OR Error
    // 1. & 2. Generate Narrative
    narrativeText = this.narrativeWeaver.weave(memento)
    IF narrativeText IS_EMPTY OR IS_ERROR THEN
      LOG_ERROR "Failed to generate narrative for memento: " + memento.mementoId
      RETURN ERROR "Narrative generation failed"
    END IF

    // 3. Preprocessing (handled by embeddingModelClient or a specific preprocessor)

    // 4. & 5. Invoke Embedding Model
    TRY
      embeddingVector = this.embeddingModelClient.getEmbedding(narrativeText)
    CATCH exception
      LOG_ERROR "Failed to generate embedding for narrative: " + exception.message
      RETURN ERROR "Embedding model invocation failed"
    END TRY

    IF embeddingVector IS_NULL OR IS_EMPTY THEN
      LOG_ERROR "Embedding model returned null or empty vector."
      RETURN ERROR "Invalid embedding vector received"
    END IF

    // Validate vector dimensionality (optional, but good practice)
    // IF embeddingVector.length != EXPECTED_DIMENSION THEN
    //   RETURN ERROR "Unexpected embedding vector dimension"
    // END IF

    RETURN embeddingVector
  END FUNCTION

END CLASS

CLASS NarrativeWeaver
  // TDD: TestWeaveNarrativeStructure
  // TDD: TestWeaveNarrativeWithMissingContexts
  FUNCTION weave(memento: MemoryMemento) : String
    // Implementation based on Section 1.6 "Contextual Narrative Weaving"
    // Concatenate core content, temporal, spatial, emotional, and reasoning contexts
    // into a single descriptive string.
    // Handle optional fields gracefully.
    // Example:
    narrative = memento.contentProcessed OR memento.contentRaw

    IF memento.temporalContext THEN
      narrative += " Occurred around " + FORMAT_TIMESTAMP(memento.temporalContext.eventTimestamp) + "."
      // ... add duration, etc.
    END IF

    IF memento.spatialContext THEN
      narrative += " Located at " + memento.spatialContext.locationName + "."
      // ... add proximity, etc.
    END IF

    IF memento.emotionalContext THEN
      narrative += " Dominant emotion was " + memento.emotionalContext.dominantEmotion + "."
      // ... add valence, arousal, etc.
    END IF

    IF memento.reasoningContext THEN
      narrative += " Key inference: " + JOIN(memento.reasoningContext.inferencesMade, ", ") + "."
      // ... add goals, cognitive state, etc.
    END IF

    IF memento.tags THEN
      narrative += " Tags: " + JOIN(memento.tags, ", ") + "."
    END IF

    RETURN narrative
  END FUNCTION
END CLASS
```

This strategy ensures that the rich contextual information within each Memory Memento is transformed into a format suitable for powerful semantic search and retrieval.

---

## 3. Data Ingestion Pipeline ("Ingestion Infinity-Loop")
### The AUTO tuning ingestor
The Data Ingestion Pipeline is responsible for receiving raw data from various sources, processing it into structured Memory Mementos, generating embeddings, and storing them consistently across MongoDB and Weaviate. This pipeline must be robust, scalable, and adaptable to new data types and sources.

A central component managing this flow could be named `IngestionIntegrator`.

**TDD Anchors:**
*   `// TDD: TestFullIngestionPipelineHappyPath`: Verifies a piece of data successfully flows through the entire pipeline.
*   `// TDD: TestIngestionPipelineErrorHandlingAtEachStage`: Ensures errors at different stages (preprocessing, memento creation, storage) are handled gracefully.

### 3.1. Input Sources ("Source Streams")

MemoRable is designed to ingest data from a variety of sources, initially focusing on text but with the architecture allowing for future expansion to other modalities.

*   **User Interactions:**
    *   Text messages from chat interfaces.
    *   Transcripts from voice interactions (after speech-to-text processing).
    *   Potentially, structured data from UI elements (e.g., button clicks, form submissions if relevant to memory).
    *   Managed by components interacting with [`src/core/inputProcessor.js`](../src/core/inputProcessor.js).
*   **System Events & Logs:**
    *   Internal agent actions, decisions, or errors.
    *   Significant events from integrated services (e.g., task completion from `TaskHopperService`).
*   **External Data Feeds:**
    *   Codebase changes (for "Living Git Log" use case).
    *   Data from external APIs or sensors (future expansion).
*   **Agent's Internal "Thoughts" or Reflections:**
    *   Outputs from the `NightProcessingService` or the `Subconscious Scanner` model that generate new insights or summaries worth remembering.

Each input source will likely have an adapter or specific parser to transform its raw data into a common internal format before further processing.

### 3.2. Preprocessing ("Preprocessing Prism")

Before a Memory Memento can be created, raw input data undergoes several preprocessing steps to clean, normalize, structure, and enrich it.

1.  **Data Normalization & Cleaning:**
    *   Text: Lowercasing (optional, depending on embedding model), removing extraneous whitespace, correcting common typos.
    *   Timestamp standardization to ISO 8601.
    *   Sanitization to prevent injection attacks or malformed data.
    *   **TDD Anchor:** `// TDD: TestInputDataNormalization`

2.  **Entity Extraction & Linking:**
    *   Identifying named entities (people, organizations, locations, dates, custom entities).
    *   Linking entities to known identifiers within the agent's knowledge base.
    *   This can inform the `tags` and `spatialProximity` fields of a Memory Memento.
    *   **TDD Anchor:** `// TDD: TestEntityExtractionAccuracy`

3.  **Emotional Analysis:**
    *   Utilizing [`src/services/humeService.js`](../src/services/humeService.js) or a similar service (potentially abstracted by [`src/core/emotionProcessor.js`](../src/core/emotionProcessor.js)) to analyze text, and in the future, other modalities for emotional content.
    *   Output populates the `EmotionalContext` (Section 1.4) of the Memory Memento.
    *   **TDD Anchor:** `// TDD: TestEmotionalAnalysisIntegration` (verifies data flows to and from Hume/EmotionProcessor).

4.  **Contextual Data Aggregation:**
    *   Gathering relevant temporal, spatial, and reasoning context active at the time of input.
    *   This involves querying current agent state, active tasks (from `TaskHopperService`), location services, etc.
    *   **TDD Anchor:** `// TDD: TestContextualDataAggregationCompleteness`

5.  **Content Summarization/Processing (Optional):**
    *   For very long inputs, generating a summary for `contentProcessed`.
    *   Extracting key phrases or topics.
    *   **TDD Anchor:** `// TDD: TestContentSummarizationEffectiveness`

**Pseudocode for a Preprocessing Module:**

```pseudocode
CLASS PreprocessingPrism

  // Dependencies: EntityExtractor, EmotionAnalyzer (e.g., HumeServiceAdapter), ContextAggregator
  CONSTRUCTOR(entityExtractor, emotionAnalyzer, contextAggregator)
    this.entityExtractor = entityExtractor
    this.emotionAnalyzer = emotionAnalyzer
    this.contextAggregator = contextAggregator
  END CONSTRUCTOR

  // TDD: TestProcessRawInputNominal
  // TDD: TestProcessRawInputWithMissingFields
  FUNCTION processRawInput(rawInputData, inputSourceType) : ProcessedInputData OR Error
    // 1. Normalize and Clean
    normalizedData = NORMALIZE_AND_CLEAN(rawInputData, inputSourceType)

    // 2. Extract Entities
    entities = this.entityExtractor.extract(normalizedData.mainContent)

    // 3. Analyze Emotion
    emotionalAnalysis = this.emotionAnalyzer.analyze(normalizedData.mainContent) // Or other relevant parts

    // 4. Aggregate Context
    currentContext = this.contextAggregator.getCurrentContext(normalizedData.timestamp)

    // 5. Summarize (Optional)
    processedContent = SUMMARIZE(normalizedData.mainContent) // if applicable

    RETURN {
      originalContent: normalizedData.mainContent,
      processedContent: processedContent,
      extractedEntities: entities,
      emotionalAnalysis: emotionalAnalysis,
      aggregatedContext: currentContext,
      sourceSystem: inputSourceType,
      sourceIdentifier: rawInputData.id // if available
      // ... other relevant preprocessed fields
    }
  END FUNCTION

END CLASS
```

### 3.3. Memory Item Creation ("Memento Morphing")

Once the input data is preprocessed, a complete Memory Memento object is constructed.

**Module: `MementoConstructor`**

This module takes `ProcessedInputData` and assembles it into a valid `MemoryMemento` structure as defined in Section 1.

**Pseudocode:**

```pseudocode
CLASS MementoConstructor

  // TDD: TestConstructMementoFromProcessedData
  // TDD: TestConstructMementoHandlesOptionalFields
  FUNCTION constructMemento(processedInput: ProcessedInputData, agentId: String) : MemoryMemento OR Error
    mementoId = GENERATE_UUID()
    creationTimestamp = CURRENT_ISO_TIMESTAMP()

    // Map preprocessed data to Memento fields
    temporalContext = MAP_TEMPORAL_DATA(processedInput.aggregatedContext.timestamp, processedInput.duration)
    spatialContext = MAP_SPATIAL_DATA(processedInput.aggregatedContext.location)
    emotionalContext = MAP_EMOTIONAL_DATA(processedInput.emotionalAnalysis)
    reasoningContext = MAP_REASONING_DATA(processedInput.aggregatedContext.activeTask, processedInput.inferences) // Inferences might come from earlier agent processing

    memento = NEW MemoryMemento({
      mementoId: mementoId,
      agentId: agentId,
      creationTimestamp: creationTimestamp,
      sourceSystem: processedInput.sourceSystem,
      sourceIdentifier: processedInput.sourceIdentifier,
      contentType: DETERMINE_CONTENT_TYPE(processedInput.originalContent), // e.g., "Text"
      contentRaw: processedInput.originalContent,
      contentProcessed: processedInput.processedContent,
      tags: processedInput.extractedEntities.map(entity => entity.name), // Example tagging

      temporalContext: temporalContext,
      spatialContext: spatialContext,
      emotionalContext: emotionalContext,
      reasoningContext: reasoningContext
    })

    // Validate memento against schema
    VALIDATE_SCHEMA(memento) // Throws error if invalid
    // TDD Anchor: TestMementoSchemaValidationAfterConstruction

    RETURN memento
  END FUNCTION

END CLASS
```

### 3.4. Storage ("Storage Sanctuaries")

Memory Mementos and their embeddings are stored in a dual-database system: MongoDB for the full, structured data and Weaviate for vector embeddings to enable semantic search. This aligns with the existing architecture using [`src/config/database.js`](../src/config/database.js) (assumed for MongoDB) and [`src/config/weaviate.js`](../src/config/weaviate.js).

A `MemorySteward` service will manage interactions with both databases.

#### 3.4.1. Weaviate Schema ("Vector Vault")

*   **Class Name:** `MemoryMemento` (or a more alliterative name like `MementoVector`)
*   **Properties:**
    *   `mementoId`: (dataType: `string`, tokenization: `keyword`) The UUID of the memento. This will be the primary link to the MongoDB record.
    *   `agentId`: (dataType: `string`, tokenization: `keyword`, `indexFilterable`: true, `indexSearchable`: false) To scope searches per agent.
    *   `creationTimestamp`: (dataType: `date`, `indexFilterable`: true) For time-based filtering.
    *   `eventTimestamp`: (dataType: `date`, `indexFilterable`: true) For filtering by event time.
    *   `contentType`: (dataType: `string`, tokenization: `keyword`, `indexFilterable`: true)
    *   `tags`: (dataType: `string[]`, tokenization: `keyword`, `indexFilterable`: true) For faceted search.
    *   `dominantEmotion`: (dataType: `string`, tokenization: `keyword`, `indexFilterable`: true)
    *   `sourceSystem`: (dataType: `string`, tokenization: `keyword`, `indexFilterable`: true)
    *   (Consider adding other key filterable fields from the memento structure if direct filtering in Weaviate is frequently needed alongside vector search).
*   **Vectorization Settings:**
    *   `vectorizer`: `none`. Embeddings will be generated externally by the `EmbeddingService` (Section 2.2) and then provided to Weaviate.
    *   `vectorIndexType`: `hnsw` (Hierarchical Navigable Small World) - common default for good balance of speed and accuracy.
    *   `distance`: `cosine` (or `dot` depending on the embedding model's typical usage).
*   **Cross-References:**
    *   Direct cross-references within Weaviate can be complex to manage if not using its built-in vectorizers for linked objects.
    *   Instead, relationships (like `causalLinks`) will primarily be stored in MongoDB. The `Subconscious Scanner` can later process these relationships and potentially create specialized linked data structures or secondary indices if needed for advanced graph-based queries. For now, Weaviate focuses on semantic similarity of individual mementos.

**TDD Anchors:**
*   `// TDD: TestWeaviateSchemaCreation`: Verifies the schema can be created in Weaviate.
*   `// TDD: TestWeaviateDataInsertion`: Checks data insertion with an externally generated vector.
*   `// TDD: TestWeaviateVectorSearch`: Confirms vector search returns expected results.

#### 3.4.2. MongoDB Collection Structure ("Document Depository")

*   **Collection Name:** `memory_mementos`
*   **Document Structure:** The MongoDB document will store the complete `MemoryMemento` object as defined in Section 1.
    ```json
    {
      "_id": "<mongoObjectId>", // Standard MongoDB ObjectId
      "mementoId": "<UUID>", // Same as in Weaviate, indexed for fast lookups
      "agentId": "<UUID>", // Indexed
      "creationTimestamp": ISODate("..."), // Indexed
      "sourceSystem": "UserInteraction",
      "sourceIdentifier": "message-123",
      "contentType": "Text",
      "contentRaw": "User said hello.",
      "contentProcessed": "User greeted.",
      "tags": ["greeting", "user"],
      "temporalContext": {
        "eventTimestamp": ISODate("..."), // Indexed
        "eventDurationMs": 1200
      },
      "spatialContext": {
        "locationName": "Office"
      },
      "emotionalContext": {
        "dominantEmotion": "Neutral",
        "detectedEmotionsHume": [{"name": "Neutral", "score": 0.7}]
      },
      "reasoningContext": {
        "cognitiveState": "Attentive",
        "associatedGoals": [{"goalId": "goal-abc", "goalDescription": "Respond to user"}]
      },
      // ... other fields from MemoryMemento schema
    }
    ```
*   **Indexes:**
    *   `mementoId` (unique)
    *   `agentId`
    *   `creationTimestamp`
    *   `temporalContext.eventTimestamp`
    *   `tags` (multikey)
    *   `emotionalContext.dominantEmotion`
    *   `contentType`
    *   `sourceSystem`
    *   Consider compound indexes based on common query patterns (e.g., `agentId` and `temporalContext.eventTimestamp`).

This structure allows for rich, flexible querying on any attribute of the memory, complementing Weaviate's vector search capabilities.

**TDD Anchors:**
*   `// TDD: TestMongoDBMementoInsertion`: Verifies memento insertion.
*   `// TDD: TestMongoDBQueryByMementoId`: Checks retrieval by `mementoId`.
*   `// TDD: TestMongoDBComplexQuery`: Tests querying by multiple indexed fields.

### 3.5. Atomicity & Consistency ("Transactional Twin-Write")

Ensuring data consistency between Weaviate (vector + minimal metadata) and MongoDB (full memento) during ingestion is crucial. A failure to write to one after successfully writing to the other can lead to orphaned data or missing embeddings.

**Strategy: Two-Phase Commit (Simulated) or Compensating Transactions**

1.  **Phase 1: Prepare & Store Primary (MongoDB)**
    *   The complete `MemoryMemento` is saved to MongoDB. MongoDB is treated as the primary source of truth for the raw memento data.
    *   If this fails, the process stops, and an error is reported. No embedding is generated or stored in Weaviate.

2.  **Phase 2: Generate Embedding & Store Secondary (Weaviate)**
    *   The `EmbeddingService` generates the vector for the memento.
    *   The vector and key metadata (including `mementoId` from the MongoDB record) are saved to Weaviate.
    *   **If Weaviate write fails:**
        *   **Compensating Transaction:** Attempt to mark the MongoDB record as "pending_embedding" or "embedding_failed". A background job can periodically retry embedding generation and Weaviate storage for these records.
        *   Alternatively, for critical applications, one might delete the MongoDB record, but this risks data loss if the failure was transient. A retry mechanism with a dead-letter queue for persistent failures is generally preferred.
    *   **If Weaviate write succeeds:** The ingestion is complete.

**Alternative: Eventual Consistency with Reconciliation**

*   Write to MongoDB.
*   Asynchronously trigger embedding generation and Weaviate storage (e.g., via a message queue).
*   Have a reconciliation process (e.g., part of `NightProcessingService`) that periodically scans MongoDB for mementos missing embeddings in Weaviate and attempts to create/store them. This simplifies the initial write path but accepts a window of inconsistency.

Given the importance of having embeddings for recall, a **simulated two-phase commit with robust retry and error logging for the Weaviate step** is recommended for the initial implementation.

**Pseudocode for `MemorySteward` (Illustrative):**

```pseudocode
CLASS MemorySteward

  // Dependencies: mongoClient, weaviateClient, embeddingService
  CONSTRUCTOR(mongoClient, weaviateClient, embeddingService)
    this.mongo = mongoClient
    this.weaviate = weaviateClient
    this.embeddingService = embeddingService
  END CONSTRUCTOR

  // TDD: TestStoreMementoAtomicitySuccess
  // TDD: TestStoreMementoAtomicityMongoFailure
  // TDD: TestStoreMementoAtomicityEmbeddingFailure
  // TDD: TestStoreMementoAtomicityWeaviateFailureWithRetryLogic
  FUNCTION storeNewMemento(memento: MemoryMemento) : Boolean OR Error
    // Phase 1: Store in MongoDB
    TRY
      mongoResult = this.mongo.collection('memory_mementos').insertOne(memento)
      IF NOT mongoResult.acknowledged THEN
        LOG_ERROR "MongoDB write failed for mementoId: " + memento.mementoId
        RETURN ERROR "Primary storage (MongoDB) failed"
      END IF
    CATCH mongoException
      LOG_ERROR "MongoDB exception for mementoId: " + memento.mementoId + " - " + mongoException.message
      RETURN ERROR "Primary storage (MongoDB) exception"
    END TRY

    // Phase 2a: Generate Embedding
    embeddingVector = this.embeddingService.generateMementoEmbedding(memento)
    IF embeddingVector IS ERROR THEN
      LOG_ERROR "Embedding generation failed for mementoId: " + memento.mementoId + " - " + embeddingVector.message
      // Mark MongoDB record for retry (implementation detail)
      UPDATE_MONGO_STATUS(memento.mementoId, "pending_embedding_retry")
      RETURN ERROR "Embedding generation failed" // Or handle as a partial success needing retry
    END IF

    // Phase 2b: Store in Weaviate
    weaviateObject = {
      "mementoId": memento.mementoId,
      "agentId": memento.agentId,
      "creationTimestamp": memento.creationTimestamp,
      "eventTimestamp": memento.temporalContext.eventTimestamp,
      // ... other filterable fields for Weaviate
      "vector": embeddingVector
    }

    TRY
      // Simplified Weaviate client call
      weaviateResult = this.weaviate.data.creator()
        .withClassName('MemoryMemento') // Or your chosen class name
        .withProperties(weaviateObject)
        .withVector(embeddingVector) // Explicitly pass vector if 'vectorizer: none'
        .withId(memento.mementoId) // Use mementoId as Weaviate ID for easy linking
        .do()
      // Check weaviateResult for success
    CATCH weaviateException
      LOG_ERROR "Weaviate write failed for mementoId: " + memento.mementoId + " - " + weaviateException.message
      // Mark MongoDB record for retry
      UPDATE_MONGO_STATUS(memento.mementoId, "weaviate_write_retry")
      RETURN ERROR "Secondary storage (Weaviate) failed" // Or handle as a partial success needing retry
    END TRY

    RETURN True // Success
  END FUNCTION

END CLASS
```
This pipeline ensures that data is captured, enriched, structured, and made searchable through both detailed attributes and semantic meaning.

---

## 4. Contextual Focus ("Conscious Current") & Retrieval

The "Conscious Current" refers to the agent's immediate operational context, including its active task, recent interactions, current emotional state, and environmental cues. This current context is used to query the memory system (primarily Weaviate) to retrieve relevant Memory Mementos, forming a "driving window of context" that informs the agent's next actions and responses. This process is central to the "Conscious Access Model" described in the architecture.

A `ContextualRetriever` service would manage this.

**TDD Anchors:**
*   `// TDD: TestCurrentContextVectorGeneration`: Ensures the agent's current context can be vectorized.
*   `// TDD: TestWeaviateQueryConstructionFromContext`: Verifies correct Weaviate queries are built.
*   `// TDD: TestMemoryRetrievalRelevance`: Checks if retrieved memories are relevant to the current context.
*   `// TDD: TestMemoryRankingAlgorithm`: Validates the ranking of retrieved memories.

### 4.1. Generating the "Current Context Vector"

To query Weaviate, the agent's current multifaceted context needs to be transformed into a query vector compatible with the embeddings of stored Memory Mementos.

1.  **Gather Current Contextual Data:**
    *   **Active Task:** Current task ID, description, step from `TaskHopperService`.
    *   **Recent Interactions:** A short summary or key phrases from the last few conversational turns.
    *   **Current Emotional State:** Agent's own detected emotion (e.g., from internal state or `EmotionProcessor`) and observed user emotion.
    *   **Environmental Cues:** Current location, time of day, proximate entities.
    *   **Explicit Query (if any):** If the agent is consciously trying to recall something specific.

2.  **Formulate Contextual Narrative for Query:**
    *   Similar to the "Contextual Narrative Weaving" (Section 1.6) for storing mementos, a narrative is constructed from the current contextual data. This narrative should be structured to elicit the most relevant memories.
    *   Example Query Narrative: "Currently working on 'Task Z: Draft Email', user seems 'Confused' after last message about 'Project Alpha'. Agent feels 'Focused'. Location: 'Office'. Time: Afternoon."
    *   **TDD Anchor:** `// TDD: TestQueryNarrativeGeneration`

3.  **Generate Query Vector:**
    *   The query narrative is passed to the `EmbeddingService` (Section 2.2) to generate a query vector using the same embedding model used for storing mementos.
    *   **Function:** `EmbeddingService.generateMementoEmbedding(currentContextNarrativeMemento)` (treating the current context as a temporary memento for vectorization).

### 4.2. Querying Weaviate ("Vectorial Voyage for Vantage")

The `ContextualRetriever` uses the query vector to search Weaviate.

1.  **Construct Weaviate Query:**
    *   **Vector Search:** The primary component is a `nearVector` search using the generated query vector.
    *   **Filtering (Optional but Recommended):**
        *   `agentId`: Always filter by the current `agentId`.
        *   `contentType`: Optionally filter by relevant content types.
        *   `tags`: Optionally filter by relevant tags derived from the current context.
        *   `eventTimestamp`: Optionally apply a time window (e.g., retrieve memories from the last 24 hours, or a specific relevant period).
    *   **Limit:** Specify the maximum number of results to retrieve (e.g., top 10-20 mementos).
    *   **Certainty/Distance:** Weaviate returns results with a certainty score (or distance, depending on configuration). This can be used for thresholding.

2.  **Execute Weaviate Query:**
    *   The `ContextualRetriever` uses the Weaviate client ([`src/config/weaviate.js`](../src/config/weaviate.js)) to execute the query.

3.  **Receive Results:**
    *   Weaviate returns a list of matching `mementoId`s and their similarity scores (and any other requested properties from the Weaviate schema).

### 4.3. Retrieving and Ranking Memories ("Recall Ranking")

1.  **Fetch Full Mementos from MongoDB:**
    *   The `mementoId`s retrieved from Weaviate are used to fetch the complete `MemoryMemento` objects from MongoDB (via `MemorySteward`). This provides the full contextual richness needed by the agent.
    *   **TDD Anchor:** `// TDD: TestBatchMementoRetrievalFromMongo`

2.  **Re-ranking and Filtering (Optional Advanced Step):**
    *   While Weaviate provides initial ranking by semantic similarity, further re-ranking can be applied based on additional heuristics:
        *   **Recency:** Give a slight boost to more recent memories if relevant.
        *   **Relevance Score from Weaviate:** Use this as a primary sorting key.
        *   **Emotional Resonance:** If the current emotional context is strong, memories with similar emotional echoes might be prioritized.
        *   **Goal Alignment:** Memories related to currently active goals (`reasoningContext.associatedGoals`) might be boosted.
        *   **Causal Links:** If a retrieved memory has strong causal links to other highly-ranked memories, its relevance might be amplified.
    *   This re-ranking logic could reside within the `ContextualRetriever` or a dedicated `RecallRanker` module.
    *   **TDD Anchor:** `// TDD: TestAdvancedRecallRankingLogic`

3.  **Form the "Driving Window of Context":**
    *   The top N ranked and retrieved Memory Mementos constitute the "driving window of context." This set of memories is then provided to the Conscious Access Model to inform its decision-making, response generation, or action planning.

**Pseudocode for `ContextualRetriever`:**

```pseudocode
CLASS ContextualRetriever

  // Dependencies: EmbeddingService, WeaviateClient, MemorySteward (for MongoDB access)
  CONSTRUCTOR(embeddingService, weaviateClient, memorySteward)
    this.embeddingService = embeddingService
    this.weaviateClient = weaviateClient
    this.memorySteward = memorySteward // Assumed to have a method like getMementosByIds
  END CONSTRUCTOR

  // TDD: TestRetrieveRelevantMementosHappyPath
  // TDD: TestRetrieveRelevantMementosNoResults
  // TDD: TestRetrieveRelevantMementosWithFilters
  FUNCTION retrieveRelevantMementos(currentAgentContext: AgentCurrentContext, agentId: String, options: RetrievalOptions) : Array<MemoryMemento> OR Error
    // 1. Generate Query Narrative & Vector
    queryNarrative = GENERATE_QUERY_NARRATIVE(currentAgentContext) // Helper function
    queryVector = this.embeddingService.generateMementoEmbedding(CREATE_TEMPORARY_MEMENTO_FROM_NARRATIVE(queryNarrative))

    IF queryVector IS ERROR THEN
      LOG_ERROR "Failed to generate query vector for current context."
      RETURN ERROR "Query vector generation failed"
    END IF

    // 2. Construct and Execute Weaviate Query
    weaviateQuery = this.weaviateClient.graphql.get()
      .withClassName('MemoryMemento')
      .withNearVector({ vector: queryVector, certainty: options.minCertainty || 0.7 })
      .withLimit(options.limit || 10)
      .withFields('mementoId _additional { certainty distance }') // Request mementoId and scores

    // Add filters based on options and agentId
    filterConditions = [{ path: ["agentId"], operator: "Equal", valueString: agentId }]
    IF options.contentTypeFilter THEN
      filterConditions.push({ path: ["contentType"], operator: "Equal", valueString: options.contentTypeFilter })
    END IF
    // ... add other filters (tags, time window)

    weaviateQuery = weaviateQuery.withWhere({ operator: "And", operands: filterConditions })

    TRY
      weaviateResults = weaviateQuery.do()
    CATCH weaviateException
      LOG_ERROR "Weaviate query failed: " + weaviateException.message
      RETURN ERROR "Weaviate query execution failed"
    END TRY

    IF weaviateResults.data.Get.MemoryMemento IS EMPTY THEN
      RETURN [] // No relevant mementos found
    END IF

    retrievedIdsAndScores = weaviateResults.data.Get.MemoryMemento.map(item => ({
      mementoId: item.mementoId,
      score: item._additional.certainty || (1 - item._additional.distance) // Normalize score
    }))

    // 3. Fetch Full Mementos from MongoDB
    mementoIds = retrievedIdsAndScores.map(item => item.mementoId)
    fullMementos = this.memorySteward.getMementosByIds(mementoIds, agentId) // Method in MemorySteward

    IF fullMementos IS ERROR THEN
      LOG_ERROR "Failed to retrieve full mementos from MongoDB."
      RETURN ERROR "MongoDB retrieval failed"
    END IF

    // Attach scores to full mementos for potential re-ranking
    scoredMementos = fullMementos.map(memento => {
      found = retrievedIdsAndScores.find(s => s.mementoId == memento.mementoId)
      return { ...memento, retrievalScore: found ? found.score : 0 }
    })

    // 4. Re-ranking (Simplified for pseudocode, could be a separate module)
    rankedMementos = scoredMementos.sort((a, b) => b.retrievalScore - a.retrievalScore) // Primary sort by Weaviate score

    // Apply further ranking heuristics if needed (recency, emotional resonance, etc.)
    // rankedMementos = APPLY_ADVANCED_RANKING(rankedMementos, currentAgentContext)

    RETURN rankedMementos.slice(0, options.limit || 10)
  END FUNCTION

END CLASS
```

This retrieval mechanism ensures that the agent's "conscious" stream is continuously informed by the most relevant past experiences, tailored to its current operational context.

---

## 5. Personality & Long-Term Behavior ("Subconscious Synthesis")

While the "Conscious Current" (Section 4) deals with immediate contextual recall, the "Subconscious Synthesis" focuses on how long-term patterns, aggregated experiences, and deeply processed memories shape an agent's enduring personality traits, behavioral biases, and default tendencies. This is primarily the domain of the "Subconscious Scanner" model (e.g., Gemini) and the [`src/services/nightProcessingService.js`](../src/services/nightProcessingService.js), which continuously and periodically analyze the entirety of the agent's memory stored in MongoDB.

A `PersonalityProcessor` or `BehavioralBiasModulator` could be conceptualized to manage these aspects.

**TDD Anchors:**
*   `// TDD: TestLongTermPatternIdentification`: Verifies that recurring patterns (e.g., emotional, behavioral, topical) are correctly identified from a large set of mementos.
*   `// TDD: TestPersonalityTraitDerivation`: Checks if meaningful personality traits can be derived from identified patterns.
*   `// TDD: TestSubconsciousInfluenceOnConsciousStream`: Ensures that derived personality traits or biases correctly influence conscious processing (e.g., response generation, emotional baseline).

### 5.1. Identifying Long-Term Patterns & Traits ("Pattern Profiling")

The foundation of an agent's personality lies in the consistent patterns emerging from its experiences.

1.  **Data Sources for Analysis:**
    *   **MongoDB `memory_mementos` Collection:** The full historical data of all Memory Mementos is the primary source.
    *   Specific fields of interest include:
        *   `emotionalContext`: To identify recurring emotional states, responses to certain stimuli, or overall emotional baseline.
        *   `reasoningContext.inferencesMade`, `reasoningContext.associatedGoals`: To understand common thought processes, problem-solving approaches, and persistent motivations.
        *   `contentType`, `tags`, `contentRaw/Processed`: To identify recurring topics of interaction, areas of "expertise" or frequent engagement.
        *   `causalLinks`: To understand the agent's learned cause-and-effect relationships.

2.  **Processing by `NightProcessingService` & `Subconscious Scanner`:**
    *   **[`NightProcessingService`](../src/services/nightProcessingService.js):**
        *   Performs batch analyses on the MongoDB data during off-peak hours.
        *   Tasks include:
            *   Aggregating emotional responses over time (e.g., "Agent tends towards 'Calmness' but shows 'Anxiety' when discussing deadlines").
            *   Identifying frequently co-occurring tags or concepts.
            *   Clustering mementos based on combined contextual similarity to find recurring scenarios.
            *   Analyzing the success/failure rates of `associatedGoals` to derive learned preferences or aversions.
        *   **TDD Anchor:** `// TDD: TestNightlyAggregationOfEmotionalPatterns`
    *   **`Subconscious Scanner` Model (Continuous):**
        *   Continuously (or near-continuously with large context windows) processes mementos, looking for deeper semantic relationships, emerging narratives, and abstract concepts not easily found through simple aggregation.
        *   Example: Identifying that the agent often uses a specific type of analogy when explaining complex topics, or that it tends to avoid certain conversational paths after negative emotional feedback.
        *   This model might generate "meta-mementos" or "insight summaries" that are themselves stored and contribute to the personality profile.
        *   **TDD Anchor:** `// TDD: TestSubconsciousScannerInsightGeneration`

3.  **Derived Personality Profile ("Persona Prism"):**
    *   The outputs from these processes contribute to a dynamic "Personality Profile" for the agent. This profile is not static but evolves as new memories are accumulated and processed.
    *   It might include:
        *   **Dominant Emotional Tendencies:** e.g., Optimistic, Cautious, Empathetic.
        *   **Cognitive Styles:** e.g., Analytical, Intuitive, Reflective.
        *   **Interaction Preferences:** e.g., Prefers direct questions, uses humor, avoids confrontation.
        *   **Learned Behavioral Biases:** e.g., Tendency to suggest solution X for problem Y, slight aversion to topic Z.
        *   **Confidence Levels:** Overall confidence in its abilities or specific domains, potentially influenced by [`src/services/confidenceService.js`](../src/services/confidenceService.js) but aggregated long-term.
    *   This profile could be stored as a structured object in MongoDB, associated with the `agentId`.

### 5.2. Influence of "Subconscious" Data on the "Conscious" Stream

The derived personality profile and long-term patterns ("subconscious data") can influence the agent's real-time ("conscious") behavior in several ways:

1.  **Biasing Memory Retrieval:**
    *   The `ContextualRetriever` (Section 4) could subtly adjust its ranking or filtering based on personality traits.
    *   Example: If an agent has a "cautious" trait, it might slightly up-rank mementos related to past risks or negative outcomes when considering a new, similar situation.
    *   This is NOT about overriding direct contextual relevance but about adding a nuanced layer to it.
    *   **TDD Anchor:** `// TDD: TestPersonalityBiasInRecallRanking`

2.  **Informing Default Behaviors & Responses:**
    *   In situations with low contextual information or ambiguity, the personality profile can guide default responses or actions.
    *   Example: An "empathetic" agent might default to a more supportive tone if the user's emotional state is unclear but negative.
    *   The `ResponseRefinementService` ([`src/services/responseRefinementService.js`](../src/services/responseRefinementService.js)) could consult the personality profile.
    *   **TDD Anchor:** `// TDD: TestDefaultResponseGenerationBasedOnPersonality`

3.  **Setting Emotional Baselines & Reactivity:**
    *   The agent's baseline emotional state could be influenced by its long-term emotional tendencies.
    *   Its reactivity to certain emotional stimuli might also be modulated. An agent that has frequently experienced "Joy" in response to praise might react more positively to future praise.
    *   The [`src/core/emotionProcessor.js`](../src/core/emotionProcessor.js) could factor this in.
    *   **TDD Anchor:** `// TDD: TestEmotionalBaselineAdjustmentByPersonality`

4.  **Guiding Goal Prioritization & Generation:**
    *   Long-term learned preferences or aversions (derived from goal success/failure patterns) can influence how the `TaskHopperService` prioritizes tasks or how the agent formulates new sub-goals.
    *   **TDD Anchor:** `// TDD: TestGoalPrioritizationInfluencedByLearnedPreferences`

5.  **Modulating Confidence Levels:**
    *   The agent's general confidence, as shaped by its long-term experiences and reflected in its personality profile, can influence the confidence scores produced by [`src/services/confidenceService.js`](../src/services/confidenceService.js) for specific interactions.

**Pseudocode for Applying Subconscious Influence (Conceptual):**

```pseudocode
// Within the Conscious Access Model or relevant services (e.g., ResponseRefinementService)

FUNCTION generateResponseWithSubconsciousInfluence(currentInput, retrievedMementos, agentId)
  // 1. Retrieve Agent's Personality Profile
  personalityProfile = LOAD_PERSONALITY_PROFILE(agentId) // From MongoDB

  // 2. Initial Response Generation (using currentInput and retrievedMementos)
  baseResponse = GENERATE_BASE_RESPONSE(currentInput, retrievedMementos)

  // 3. Apply Personality-Based Refinements
  refinedResponse = baseResponse
  IF personalityProfile.interactionStyle == "humorous" AND IS_APPROPRIATE_CONTEXT(currentInput) THEN
    refinedResponse = ADD_HUMOR_ELEMENT(refinedResponse)
  END IF
  IF personalityProfile.dominantEmotion == "cautious" AND currentInput.involvesRisk THEN
    refinedResponse = ADD_CAUTIONARY_NOTE(refinedResponse)
  END IF

  // 4. Adjust Emotional Tone of Response
  targetEmotionalTone = DETERMINE_TARGET_EMOTIONAL_TONE(currentInput.userEmotion, personalityProfile.empathyLevel)
  refinedResponse = ADJUST_EMOTIONAL_TONE(refinedResponse, targetEmotionalTone)

  // TDD: TestResponseRefinementBasedOnHumorousTrait
  // TDD: TestResponseToneAdjustmentBasedOnEmpathyTrait

  RETURN refinedResponse
END FUNCTION

// Within ContextualRetriever (Simplified example of biasing)
FUNCTION retrieveRelevantMementos(currentAgentContext, agentId, options)
  // ... (initial query vector generation and Weaviate search as in Section 4) ...
  initialRankedMementos = // results from Weaviate

  personalityProfile = LOAD_PERSONALITY_PROFILE(agentId)

  // Apply bias
  IF personalityProfile.biasTowardsRecency THEN
    // Slightly increase scores of more recent mementos in initialRankedMementos
    ADJUST_SCORES_FOR_RECENCY(initialRankedMementos)
  END IF

  finalRankedMementos = SORT_AND_FILTER(initialRankedMementos)
  RETURN finalRankedMementos
END FUNCTION
```

The "Subconscious Synthesis" provides a mechanism for the agent to develop a more consistent, nuanced, and believable persona over time, moving beyond purely reactive responses to exhibit learned behavioral tendencies.

---

## 6. "Living Git Log" Use Case ("Codebase Chronicle")

One of the key use cases for MemoRable is to create a "Living Git Log," an agent with real-time awareness of codebase changes, capable of explaining the history, rationale, and impact of modifications. This requires a specialized ingestion mechanism and Memory Memento structure for code changes.

A `CodeChangeCollector` service would be responsible for monitoring a Git repository and a `CodeChangeConstructor` for creating the specific mementos.

**TDD Anchors:**
*   `// TDD: TestGitCommitParsing`: Verifies that commit data (author, message, diff) is correctly parsed.
*   `// TDD: TestCodeChangeMementoCreation`: Ensures a valid memento is created from parsed commit data.
*   `// TDD: TestCodeChangeEmbeddingRelevance`: Checks if embeddings of code changes allow relevant retrieval (e.g., finding commits related to a specific function).

### 6.1. Mechanism for Ingesting Codebase Changes

1.  **Git Hook Integration (Real-time/Near Real-time):**
    *   Implement a `post-commit` Git hook in the monitored repository.
    *   This hook would trigger a script or an API call to the `CodeChangeCollector` service within MemoRable.
    *   The hook would pass information about the latest commit (e.g., commit hash).
    *   **TDD Anchor:** `// TDD: TestGitHookNotificationReception`

2.  **Polling (Fallback/Periodic):**
    *   As a fallback or for repositories where hooks cannot be easily installed, the `CodeChangeCollector` could periodically poll the repository (e.g., every few minutes) for new commits since the last check.
    *   This requires storing the hash of the last processed commit.

3.  **`CodeChangeCollector` Service:**
    *   Receives notification (commit hash) from the Git hook or identifies new commits via polling.
    *   Uses Git commands (e.g., `git show <commit_hash> --pretty=fuller --unified=0`) to extract detailed information about the commit:
        *   Commit hash (`sourceIdentifier`)
        *   Author name and email
        *   Committer name and email
        *   Author date (`eventTimestamp`)
        *   Commit date
        *   Full commit message
        *   Changed files
        *   Diff for each changed file (additions, deletions, modifications)
    *   Passes this structured commit data to the `IngestionIntegrator` (or directly to a specialized `CodeChangeConstructor`).
    *   **TDD Anchor:** `// TDD: TestCodeChangeCollectorCommitDataExtraction`

### 6.2. Structure of a "Code Change" Memory Memento

A Memory Memento representing a code change would utilize the standard memento structure (Section 1) with specific conventions for its fields:

*   `mementoId`: (String, UUID) Unique identifier.
*   `agentId`: (String, UUID) Identifier of the agent monitoring the codebase (or a generic "CodebaseAgent").
*   `creationTimestamp`: (ISO 8601 Timestamp) When this memento was created in MemoRable.
*   `sourceSystem`: "GitRepositoryMonitor"
*   `sourceIdentifier`: Commit hash (e.g., "a1b2c3d4e5f67890").
*   `contentType`: "CodeChange"

*   `contentRaw`: (Object) Structured representation of the commit details:
    ```json
    {
      "commitHash": "a1b2c3d4e5f67890",
      "authorName": "Ada Lovelace",
      "authorEmail": "ada@example.com",
      "authorDate": "2025-05-06T10:00:00Z",
      "committerName": "Charles Babbage",
      "committerEmail": "charles@example.com",
      "commitDate": "2025-05-06T10:05:00Z",
      "commitMessageFull": "Fix: Correct off-by-one error in calculation module.\n\nThis commit addresses issue #123 by adjusting the loop boundary.",
      "commitMessageSubject": "Fix: Correct off-by-one error in calculation module.", // First line of message
      "changedFiles": [
        {
          "filePath": "src/modules/calculation.js",
          "status": "Modified", // Added, Deleted, Modified, Renamed
          "additions": 5,
          "deletions": 3,
          "diffSummary": "@@ -10,7 +10,9 @@ ...", // A concise diff summary or key changed lines
          "fullDiff": "<full unified diff text for this file>" // Optional, could be very large
        },
        {
          "filePath": "tests/modules/calculation.test.js",
          "status": "Added",
          "additions": 25,
          "deletions": 0,
          "diffSummary": "@@ +0,0 +1,25 @@ ...",
          "fullDiff": "<full unified diff text for this file>"
        }
      ],
      "parentHashes": ["<parent_commit_hash_1>", "<parent_commit_hash_2_if_merge>"],
      "branchName": "feature/calculation-fix" // If available
    }
    ```

*   `contentProcessed`: (String) A summarized natural language description of the change, suitable for quick understanding and potentially for part of the embedding narrative.
    *   Example: "Commit a1b2c3d by Ada Lovelace on May 6, 2025: Fixed an off-by-one error in src/modules/calculation.js and added tests in tests/modules/calculation.test.js. Related to issue #123."

*   `tags`: (Array of Strings) Automatically generated and potentially manually augmentable.
    *   Examples: `["fix", "bug", "calculationModule", "issue-123", "src/modules/calculation.js", "javascript"]` (file paths, languages, keywords from commit message).

*   **Temporal Context (`Temporal Tapestry`):**
    *   `eventTimestamp`: `contentRaw.authorDate` (the time the change was authored).
    *   `chronologicalCertainty`: "Precise".

*   **Spatial Context (`Spatial Sphere`):**
    *   Typically not directly applicable unless the commit is associated with a specific physical location of work, which is rare. Could be omitted or set to a default for the repository/project.

*   **Emotional Context (`Emotional Echo`):**
    *   Generally not applicable unless sentiment analysis is performed on commit messages (which can be noisy).
    *   Could be omitted or set to "Neutral" by default.
    *   Future: If linked to issue tracker comments, emotions from those discussions could be linked.

*   **Reasoning Context (`Reasoning Rationale`):**
    *   `inferencesMade`: Initially empty, could be populated later by the `Subconscious Scanner` (e.g., "This commit likely resolved performance degradation X").
    *   `causalLinks`:
        *   Links to parent commits (`relationshipType: "Precedes"`).
        *   If the commit message references an issue (e.g., "Fixes #123"), a link to a memento representing that issue could be created (`relationshipType: "AddressesIssue"`).
    *   `associatedGoals`: If the commit is linked to a task or feature in `TaskHopperService` or an issue tracker.
    *   `taskContext`: If the commit can be directly mapped to a task being worked on by an agent.

### 6.3. Embedding Strategy for Code Changes

The "Contextual Narrative Weaving" (Section 1.6) for code changes would focus on:

1.  **Commit Message:** The full commit message is highly important.
2.  **Key Changed Files & Symbols:** Names of modified files and potentially key functions/classes involved (extracted from diff or via static analysis if feasible).
3.  **Author and Date:** "Change by Ada Lovelace on May 6, 2025."
4.  **Summary of Changes:** `contentProcessed` or a summary of `diffSummary` for key files.
5.  **Tags:** Important keywords like "fix", "feature", module names.

**Example Narrative for Embedding a Code Change Memento:**

```
"Git Commit a1b2c3d4 by Ada Lovelace on May 6, 2025. Message: Fix: Correct off-by-one error in calculation module. This commit addresses issue #123 by adjusting the loop boundary. Changes affected src/modules/calculation.js (Modified) and tests/modules/calculation.test.js (Added). Keywords: fix, bug, calculationModule, issue-123."
```

This allows an agent to query for "commits related to calculation module bugs in May 2025" or "who fixed issue #123 and when."

**TDD Anchors:**
*   `// TDD: TestCodeChangeNarrativeGeneration`: Ensures the narrative for code changes is correctly formed.
*   `// TDD: TestCodeChangeMementoIngestionAndRetrieval`: Full-cycle test for ingesting a commit and then retrieving it based on a relevant query.

This "Codebase Chronicle" capability transforms the Git history from a passive log into an active, queryable memory for AI agents involved in software development.

---

## 7. Constraints & Non-Functional Requirements ("System Stipulations")

This section outlines key constraints and non-functional requirements (NFRs) that the MemoRable embedding and data ingestion system must adhere to. These are critical for ensuring the system is robust, performant, secure, and maintainable.

### 7.1. Scalability ("Scale Spectrum")

*   **Ingestion Throughput:** The system must be designed to handle a growing volume of memory mementos from multiple agents and diverse input sources without significant degradation in performance.
    *   Target: Initially support X mementos per agent per day, scalable to 10X. (Specific X to be determined by expected load).
    *   The data ingestion pipeline (Section 3) should allow for parallel processing of inputs where possible.
    *   Database choices (MongoDB, Weaviate) support horizontal scaling.
*   **Retrieval Concurrency:** The system must support multiple concurrent retrieval requests from agents.
    *   Target: Y concurrent retrieval queries per second. (Specific Y to be determined).
    *   Weaviate and MongoDB are capable of handling concurrent reads. Caching strategies (Redis) will further aid this.
*   **Storage Capacity:** The system must accommodate a large and growing dataset of mementos and their embeddings.
    *   Storage solutions should be scalable (e.g., MongoDB sharding, Weaviate clustering).
*   **Agent Scalability:** The architecture should support an increasing number of individual AI agents, each with their own isolated memory space.

**TDD Anchors (Conceptual for Load/Performance Testing):**
*   `// TDD_PERF: TestIngestionRateUnderLoad`: Measure memento ingestion rate under simulated high load.
*   `// TDD_PERF: TestRetrievalConcurrency`: Measure query response times with multiple concurrent users.

### 7.2. Latency ("Latency Limits")

*   **Memory Ingestion Latency:** The time from data input to when a memento is fully stored (MongoDB and Weaviate) and available for basic retrieval.
    *   Target: P95 latency of < Z1 seconds for typical text-based mementos. (Specific Z1 to be defined).
*   **Memory Retrieval Latency (Conscious Current):** The time taken to generate a current context vector, query Weaviate, retrieve top N mementos from MongoDB, and rank them.
    *   Target: P95 latency of < Z2 milliseconds for typical queries. This is critical for real-time interaction. (Specific Z2 to be defined).
*   **Embedding Generation Latency:** The time taken by the `EmbeddingService` to generate a vector for a memento narrative.
    *   This will depend on the chosen model and input length. If using external APIs (e.g., OpenAI), network latency is a factor.
    *   Target: P95 latency of < Z3 milliseconds for typical narratives.

**TDD Anchors (Conceptual for Performance Testing):**
*   `// TDD_PERF: MeasureP95IngestionLatency`
*   `// TDD_PERF: MeasureP95RetrievalLatency`

### 7.3. Data Security and Privacy ("Data Defenses")

*   **Data Encryption:**
    *   **At Rest:** All memento data stored in MongoDB and Weaviate should be encrypted at rest.
    *   **In Transit:** All communication between services (e.g., agent to MemoRable, MemoRable to databases, MemoRable to Hume AI) must use TLS/SSL.
*   **Access Control:**
    *   Strict authentication and authorization for agents accessing their memories. `IdentityService` plays a key role.
    *   Memories must be strictly segregated by `agentId`. An agent must not be able to access another agent's memories.
    *   Role-based access control for administrative functions if applicable.
*   **Emotional Data Sensitivity:**
    *   Emotional context data (`EmotionalEcho`) is particularly sensitive. Access to this data should be tightly controlled.
    *   Consider options for anonymization or pseudonymization if aggregated emotional data is used for broader analytics, ensuring individual privacy.
    *   Compliance with relevant data privacy regulations (e.g., GDPR, CCPA) must be considered, especially if personal user data is part of mementos.
*   **Input Sanitization:**
    *   Robust input sanitization in the `PreprocessingPrism` (Section 3.2) to prevent injection attacks or storage of malicious content.
*   **Audit Trails:**
    *   Maintain audit logs for memory access and modifications (especially deletions or administrative changes).

**TDD Anchors:**
*   `// TDD_SEC: TestAgentMemoryIsolation`: Verify one agent cannot retrieve mementos of another.
*   `// TDD_SEC: TestEncryptedCommunication`: Ensure internal and external communications are encrypted.
*   `// TDD_SEC: TestInputSanitizationEffectiveness`: Test against common injection patterns.

### 7.4. Modularity and Extensibility ("Modular Malleability")

*   **Service-Oriented Design:** Core functionalities (ingestion, embedding, storage, retrieval, pattern analysis) should be encapsulated in distinct, loosely coupled services/modules as outlined in this specification and the technical architecture.
*   **Pluggable Embedding Models:** The `EmbeddingService` (Section 2.2) should be designed to allow for relatively easy swapping or addition of new embedding models with minimal changes to other parts of the system (e.g., via an adapter pattern).
*   **New Context Types:** The `MemoryMemento` structure (Section 1) should be extensible to accommodate new types of context (e.g., physiological data, more complex social context) in the future without requiring a full system rewrite.
*   **New Input Sources:** The `IngestionIntegrator` and `PreprocessingPrism` (Section 3) should make it straightforward to add new input source adapters.
*   **API-Driven Interactions:** Interactions between services should ideally be API-driven, promoting clear contracts and independent development.
*   **Configuration Management:** System parameters (e.g., database connection strings, API keys, default retrieval limits) should be configurable externally (e.g., via environment variables or a configuration service), as indicated in [`README.md`](../README.md).

**TDD Anchors:**
*   `// TDD_ARCH: TestAddNewContextTypeToMemento`: (Conceptual) Test ease of extending the memento schema and processing.
*   `// TDD_ARCH: TestSwapEmbeddingModel`: (Conceptual) Test the process of integrating a new embedding model adapter.

### 7.5. Reliability and Availability ("Resilient Recall")

*   **Fault Tolerance:** The system should be resilient to failures in individual components. For instance, if the `EmbeddingService` temporarily fails, mementos should still be stored in MongoDB and queued for later embedding.
*   **Data Durability:** Data stored in MongoDB and Weaviate must be durable, with appropriate backup and recovery mechanisms in place.
*   **Uptime:** Target high availability for core memory ingestion and retrieval functions. (Specific uptime % to be defined based on SLOs).
*   **Error Handling & Logging:** Comprehensive error handling and structured logging throughout the pipeline are essential for diagnostics and troubleshooting. [`src/utils/logger.js`](../src/utils/logger.js) should be utilized.

**TDD Anchors:**
*   `// TDD_RELIABILITY: TestIngestionWithEmbeddingServiceDown`: Verify mementos are queued if embedding fails.
*   `// TDD_RELIABILITY: TestDatabaseConnectionFailureHandling`: Ensure graceful degradation or retry if a database is temporarily unavailable.

Adherence to these constraints and NFRs will ensure that MemoRable is not only functionally rich but also a practical, dependable, and secure system for advanced AI memory management.