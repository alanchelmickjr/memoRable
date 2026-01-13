# MemoRable - Total Recall: Embedding and Data Ingestion Specification

> **HISTORICAL DOCUMENT (v1.0 Design)**
>
> This specification represents the original architectural vision. Key changes since this was written:
> - **NNNA (Nocturnal batch processing) has been deprecated** - replaced by Real-Time Relevance Engine
> - **Security Tiers added** - Tier1_General, Tier2_Personal, Tier3_Vault for data classification
> - **Encryption at rest** - Tier2/3 content now AES-256-GCM encrypted
>
> For current architecture, see: [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md), [DATA_FLOW_DIAGRAM.md](./DATA_FLOW_DIAGRAM.md)

---

## 0. Introduction

This document details the specification for the "MemoRable - Total Recall" embedding and data ingestion system. It builds upon the foundational concepts outlined in the project's [`README.md`](../README.md), [`memoRable_implementation_plan.md`](../memoRable_implementation_plan.md), and [`docs/technical-architecture.md`](./technical-architecture.md). The primary goal is to define how multifaceted memory items are structured, embedded, ingested, and retrieved to provide AI agents with comprehensive and contextually rich recall capabilities.

A core tenet of this system is the **Universal Vectorization Principle**: all incoming data is initially vectorized and stored comprehensively, without premature relevance filtering by the AI during initial ingestion. This ensures a complete data capture for later, more nuanced review and processing.

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
    *   This pair (`mementoId`, `embeddingVector`) is then ready to be stored in Weaviate (see Section 3.4.1).

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

### 2.3. Dynamic Embedding Refinement via Nocturnal Nurturing

The "Nocturnal Nurturing & Network Attunement" process (detailed in Section 5) plays a crucial role in the ongoing quality and relevance of embeddings. It's not a one-time generation; embeddings can be refined.

*   **Re-evaluation and Re-embedding:** Insights gained during nightly processing might reveal that certain memories or clusters of memories were initially misunderstood or that their context has shifted in importance. This can trigger a re-embedding of affected mementos.
*   **Updated Contextual Understanding:** The narrative generated for a memento (Section 1.6) might be revised based on new connections or corrections identified overnight. The memento would then be re-embedded using this updated narrative.
*   **Influence on Model Strategy:** Over time, patterns in re-embedding activities might inform the overall embedding strategy. For instance, if certain types of narratives consistently require refinement, it might suggest a need to adjust the "Contextual Narrative Weaving" process or even explore different/fine-tuned embedding models for those specific data types.
*   **Process:** When a memento is flagged for re-embedding, its existing vector in Weaviate is replaced with the newly generated one. The core memento data in MongoDB is also updated if its narrative components (e.g., `contentProcessed`, `inferencesMade`) have changed.

**TDD Anchors:**
*   `// TDD: TestReEmbeddingOfMementosPostNightlyProcessing`: Verifies mementos flagged by nightly processing are correctly re-embedded.
*   `// TDD: TestEmbeddingStrategyAdaptationBasedOnRefinementPatterns`: Ensures the system can track and potentially adapt embedding strategies based on frequent re-embeddings.

---

## 3. Data Ingestion Pipeline ("Ingestion Infinity-Loop")

The Data Ingestion Pipeline is responsible for receiving raw data from various sources, processing it into structured Memory Mementos, generating embeddings, and storing them consistently across MongoDB and Weaviate. This pipeline must be robust, scalable, and adaptable. Crucially, in line with the **Universal Vectorization Principle**, all incoming data is comprehensively captured and vectorized first; subsequent refinement and interpretation occur during processes like "Nocturnal Nurturing & Network Attunement" (Section 5).

A central component managing this flow could be named `IngestionIntegrator`.

**TDD Anchors:**
*   `// TDD: TestFullIngestionPipelineHappyPath`: Verifies a piece of data successfully flows through the entire pipeline.
*   `// TDD: TestIngestionPipelineErrorHandlingAtEachStage`: Ensures errors at different stages (preprocessing, memento creation, storage) are handled gracefully.

### 3.1. Adaptive Ingestion Schema ("Schema Synapse")

A key feature of the MemoRable system is its ability to learn and adapt. The ingestion schema, defining the structure of `MemoryMementos` and how they are stored in Weaviate and MongoDB, is not entirely static.

*   **Feedback Loop:** Insights from the "Nocturnal Nurturing & Network Attunement" process (Section 5), specifically its "Schema Adaptation" function, feed back into the ingestion pipeline.
*   **Learning What's Valuable:** The system learns over time what types of data, contextual details, or patterns are proving most valuable for recall and agent performance, or which require more nuanced capture.
*   **Schema Adjustments:** This learning can lead to adjustments in the `MemoryMemento` structure itself (e.g., adding new optional fields, refining the granularity of existing ones) or in how data is preprocessed and mapped to these fields.
*   **Impact on `IngestionIntegrator`:** The `IngestionIntegrator` and related components (like `MementoConstructor`) must be designed to be aware of the current schema version and potentially handle data conforming to slightly different schema versions during transition periods or adapt to schema update notifications.
*   **Database Implications:**
    *   MongoDB's schema-flexibility inherently supports this evolution.
    *   Weaviate's schema can be updated. Significant changes might necessitate data migration or re-indexing of affected mementos, a process that can be managed by or triggered by the "Nocturnal Nurturing & Network Attunement" cycle.

**TDD Anchors:**
*   `// TDD: TestIngestionPipelineAdaptsToSchemaChangeNotification`: Verifies the pipeline can adjust its processing based on a schema update.
*   `// TDD: TestSchemaEvolutionImpactOnStorage`: Ensures schema changes are correctly reflected in database interactions.

### 3.2. Input Sources ("Source Streams")

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
    *   Outputs from the "Nocturnal Nurturing & Network Attunement" process or the `Subconscious Scanner` model that generate new insights or summaries worth remembering.

Each input source will likely have an adapter or specific parser to transform its raw data into a common internal format before further processing.

### 3.3. Preprocessing ("Preprocessing Prism")

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

### 3.4. Memory Item Creation ("Memento Morphing")

Once the input data is preprocessed, a complete Memory Memento object is constructed.

**Module: `MementoConstructor`**

This module takes `ProcessedInputData` and assembles it into a valid `MemoryMemento` structure as defined in Section 1, considering the current state of the (potentially adaptive) schema.

**Pseudocode:**

```pseudocode
CLASS MementoConstructor

  // TDD: TestConstructMementoFromProcessedData
  // TDD: TestConstructMementoHandlesOptionalFields
  // TDD: TestConstructMementoWithEvolvedSchema
  FUNCTION constructMemento(processedInput: ProcessedInputData, agentId: String, currentSchemaVersion: String) : MemoryMemento OR Error
    mementoId = GENERATE_UUID()
    creationTimestamp = CURRENT_ISO_TIMESTAMP()

    // Map preprocessed data to Memento fields according to currentSchemaVersion
    temporalContext = MAP_TEMPORAL_DATA(processedInput.aggregatedContext.timestamp, processedInput.duration, currentSchemaVersion)
    spatialContext = MAP_SPATIAL_DATA(processedInput.aggregatedContext.location, currentSchemaVersion)
    emotionalContext = MAP_EMOTIONAL_DATA(processedInput.emotionalAnalysis, currentSchemaVersion)
    reasoningContext = MAP_REASONING_DATA(processedInput.aggregatedContext.activeTask, processedInput.inferences, currentSchemaVersion)

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
      schemaVersion: currentSchemaVersion, // Store schema version with memento

      temporalContext: temporalContext,
      spatialContext: spatialContext,
      emotionalContext: emotionalContext,
      reasoningContext: reasoningContext
      // ... other fields based on currentSchemaVersion
    })

    // Validate memento against schema
    VALIDATE_SCHEMA(memento, currentSchemaVersion) // Throws error if invalid
    // TDD Anchor: TestMementoSchemaValidationAfterConstruction

    RETURN memento
  END FUNCTION

END CLASS
```

### 3.5. Storage ("Storage Sanctuaries")

Memory Mementos and their embeddings are stored in a dual-database system: MongoDB for the full, structured data and Weaviate for vector embeddings to enable semantic search. This aligns with the existing architecture using [`src/config/database.js`](../src/config/database.js) (assumed for MongoDB) and [`src/config/weaviate.js`](../src/config/weaviate.js).

A `MemorySteward` service will manage interactions with both databases.

#### 3.5.1. Weaviate Schema ("Vector Vault")

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
    *   `schemaVersion`: (dataType: `string`, tokenization: `keyword`, `indexFilterable`: true) To track schema evolution.
    *   (Consider adding other key filterable fields from the memento structure if direct filtering in Weaviate is frequently needed alongside vector search).
*   **Vectorization Settings:**
    *   `vectorizer`: `none`. Embeddings will be generated externally by the `EmbeddingService` (Section 2.2) and then provided to Weaviate.
    *   `vectorIndexType`: `hnsw` (Hierarchical Navigable Small World) - common default for good balance of speed and accuracy.
    *   `distance`: `cosine` (or `dot` depending on the embedding model's typical usage).
*   **Schema Evolution Note:** The schema described here represents an initial state. It can evolve based on insights from the "Nocturnal Nurturing & Network Attunement" process (Section 5). Weaviate's schema update capabilities will be utilized. For significant changes impacting vectorization or indexing, data migration or re-indexing of existing objects might be coordinated by the nightly process.
*   **Cross-References:**
    *   Direct cross-references within Weaviate can be complex to manage if not using its built-in vectorizers for linked objects.
    *   Instead, relationships (like `causalLinks`) will primarily be stored in MongoDB. The "Nocturnal Nurturing & Network Attunement" process can later analyze these relationships and potentially create specialized linked data structures or secondary indices if needed for advanced graph-based queries. For now, Weaviate focuses on semantic similarity of individual mementos.

**TDD Anchors:**
*   `// TDD: TestWeaviateSchemaCreation`: Verifies the schema can be created in Weaviate.
*   `// TDD: TestWeaviateDataInsertion`: Checks data insertion with an externally generated vector.
*   `// TDD: TestWeaviateVectorSearch`: Confirms vector search returns expected results.
*   `// TDD: TestWeaviateSchemaUpdateAndDataMigration`: Verifies handling of schema evolution.

#### 3.5.2. MongoDB Collection Structure ("Document Depository")

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
      "schemaVersion": "1.0.0", // Version of the memento schema
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
*   **Schema Evolution Note:** MongoDB's schema-flexible nature readily supports the dynamic evolution of the `MemoryMemento` structure as driven by the "Nocturnal Nurturing & Network Attunement" process and its "Schema Adaptation" function. The `schemaVersion` field helps in managing and interpreting mementos created under different schema iterations.
*   **Indexes:**
    *   `mementoId` (unique)
    *   `agentId`
    *   `creationTimestamp`
    *   `temporalContext.eventTimestamp`
    *   `tags` (multikey)
    *   `emotionalContext.dominantEmotion`
    *   `contentType`
    *   `sourceSystem`
    *   `schemaVersion`
    *   Consider compound indexes based on common query patterns (e.g., `agentId` and `temporalContext.eventTimestamp`).

This structure allows for rich, flexible querying on any attribute of the memory, complementing Weaviate's vector search capabilities.

**TDD Anchors:**
*   `// TDD: TestMongoDBMementoInsertion`: Verifies memento insertion.
*   `// TDD: TestMongoDBQueryByMementoId`: Checks retrieval by `mementoId`.
*   `// TDD: TestMongoDBComplexQuery`: Tests querying by multiple indexed fields.
*   `// TDD: TestMongoDBHandlesVariedSchemaVersions`: Ensures queries can handle mementos with different schema versions.

### 3.6. Atomicity & Consistency ("Transactional Twin-Write")

Ensuring data consistency between Weaviate (vector + minimal metadata) and MongoDB (full memento) during ingestion is crucial. A failure to write to one after successfully writing to the other can lead to orphaned data or missing embeddings.

**Strategy: Two-Phase Commit (Simulated) or Compensating Transactions**

1.  **Phase 1: Prepare & Store Primary (MongoDB)**
    *   The complete `MemoryMemento` is saved to MongoDB. MongoDB is treated as the primary source of truth for the raw memento data.
    *   If this fails, the process stops, and an error is reported. No embedding is generated or stored in Weaviate.

2.  **Phase 2: Generate Embedding & Store Secondary (Weaviate)**
    *   The `EmbeddingService` generates the vector for the memento.
    *   The vector and key metadata (including `mementoId` from the MongoDB record) are saved to Weaviate.
    *   **If Weaviate write fails:**
        *   **Compensating Transaction:** Attempt to mark the MongoDB record as "pending_embedding" or "embedding_failed". A background job (potentially part of "Nocturnal Nurturing & Network Attunement") can periodically retry embedding generation and Weaviate storage for these records.
        *   Alternatively, for critical applications, one might delete the MongoDB record, but this risks data loss if the failure was transient. A retry mechanism with a dead-letter queue for persistent failures is generally preferred.
    *   **If Weaviate write succeeds:** The ingestion is complete.

**Alternative: Eventual Consistency with Reconciliation**

*   Write to MongoDB.
*   Asynchronously trigger embedding generation and Weaviate storage (e.g., via a message queue).
*   Have a reconciliation process (e.g., part of "Nocturnal Nurturing & Network Attunement") that periodically scans MongoDB for mementos missing embeddings in Weaviate and attempts to create/store them. This simplifies the initial write path but accepts a window of inconsistency.

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
      "schemaVersion": memento.schemaVersion,
      // ... other filterable fields for Weaviate
      "vector": embeddingVector
    }

    TRY
      // Simplified Weaviate client call
      weaviateResult = this.weaviate.data.creator()
        .withClassName('MemoryMemento') // Or your chosen class name
        .withProperties(weaviateObject) // Weaviate client handles mapping this to schema properties
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
        *   `schemaVersion`: Filter by compatible schema versions if necessary.
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
      .withFields('mementoId schemaVersion _additional { certainty distance }') // Request mementoId, schemaVersion and scores

    // Add filters based on options and agentId
    filterOperands = [{ path: ["agentId"], operator: "Equal", valueString: agentId }]
    IF options.contentTypeFilter THEN
      filterOperands.push({ path: ["contentType"], operator: "Equal", valueString: options.contentTypeFilter })
    END IF
    IF options.schemaVersionFilter THEN // Only retrieve mementos of a certain schema version
        filterOperands.push({ path: ["schemaVersion"], operator: "Equal", valueString: options.schemaVersionFilter })
    END IF
    // ... add other filters (tags, time window)

    weaviateQuery = weaviateQuery.withWhere({ operator: "And", operands: filterOperands })

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
      schemaVersion: item.schemaVersion,
      score: item._additional.certainty || (1 - item._additional.distance) // Normalize score
    }))

    // 3. Fetch Full Mementos from MongoDB
    mementoIds = retrievedIdsAndScores.map(item => item.mementoId)
    // Pass schemaVersions to ensure MemorySteward can handle potential variations if needed
    fullMementos = this.memorySteward.getMementosByIds(mementoIds, agentId, retrievedIdsAndScores.map(item => item.schemaVersion))

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

## 5. Subconscious Synthesis & Nocturnal Nurturing & Network Attunement

While the "Conscious Current" (Section 4) deals with immediate contextual recall, this section details the processes that shape an agent's enduring personality traits, behavioral biases, and default tendencies, and critically, how the memory system itself is auto-tuned. This is primarily the domain of the "Nocturnal Nurturing & Network Attunement" (NNNA) process, which leverages components like the `Subconscious Scanner` model (e.g., Gemini) and the existing [`src/services/nightProcessingService.js`](../src/services/nightProcessingService.js) (which will be expanded or refactored to embody NNNA). This process continuously and periodically analyzes the entirety of the agent's memory stored in MongoDB.

A `PersonalityProcessor` or `BehavioralBiasModulator` could be conceptualized to manage the personality aspects derived from NNNA.

**TDD Anchors:**
*   `// TDD: TestLongTermPatternIdentification`: Verifies that recurring patterns (e.g., emotional, behavioral, topical) are correctly identified from a large set of mementos.
*   `// TDD: TestPersonalityTraitDerivation`: Checks if meaningful personality traits can be derived from identified patterns.
*   `// TDD: TestSubconsciousInfluenceOnConsciousStream`: Ensures that derived personality traits or biases correctly influence conscious processing (e.g., response generation, emotional baseline).

### 5.1. The "Nocturnal Nurturing & Network Attunement" (NNNA) Process

This nightly process (e.g., scheduled Midnight - 3 AM local time for the agent or system) is not just for review but acts as an **auto-tuning mechanism** for the entire memory and ingestion system. It operates on the comprehensively vectorized data captured during the preceding period.

**Purpose:** To intelligently refine the agent's understanding of its memories, improve the quality of stored data, adapt the ingestion mechanisms for future learning, and manage data storage efficiently.

**Key Functions:**

1.  **Relevance Refactoring:**
    *   Re-evaluates the importance and interconnectedness of memories from the preceding period (e.g., last 24 hours).
    *   Identifies mementos or clusters of mementos whose significance might have been initially underestimated or overestimated.
    *   Updates relevance scores or internal linkage strengths.
    *   **TDD Anchor:** `// TDD: TestNightlyRelevanceRefactoring`

2.  **Correction & Enrichment:**
    *   Identifies potential inaccuracies or incompleteness in stored mementos or their interpretations (e.g., `contentProcessed`, `inferencesMade`).
    *   Makes corrections based on broader contextual understanding gained over time or from cross-referencing multiple mementos.
    *   Enriches mementos by tying in new relevance, causal links (updating `reasoningContext.causalLinks`), or connections that were missed during real-time interaction.
    *   **TDD Anchor:** `// TDD: TestNightlyMemoryCorrectionAndEnrichment`

3.  **Journaling Updates:**
    *   Updates running journals or profiles that track the agent's inferred characteristics over time.
    *   Examples: inferred likes/dislikes, emotional trends in response to certain stimuli, goal progression patterns, emerging topics of interest.
    *   This feeds into the "Derived Personality Profile" (Section 5.2).
    *   **TDD Anchor:** `// TDD: TestNightlyJournalingUpdates`

4.  **Data Re-indexing & Re-embedding:**
    *   As new insights are gained or corrections are made, relevant data points or entire clusters of memories may need to be re-indexed or re-embedded.
    *   This involves regenerating their "Contextual Narrative Weaving" (Section 1.6) and then their vector embeddings using the `EmbeddingService` (Section 2.2).
    *   This ensures that the vector space accurately reflects the most current understanding of the memories. (Cross-references Section 2.3).
    *   **TDD Anchor:** `// TDD: TestNightlyReIndexingAndReEmbedding` (overlaps with `// TDD: TestReEmbeddingOfMementosPostNightlyProcessing`)

5.  **Schema Adaptation:**
    *   Crucially, insights from the nightly review feedback into the **ingestion schema itself** (Section 3.1).
    *   The system learns what types of data, contexts, or patterns are proving most valuable or require more nuanced capture.
    *   This allows the `IngestionIntegrator` to adapt and "tune" its focus over time, improving what it pays attention to and how it structures `MemoryMementos`.
    *   This might involve suggesting or automatically applying changes to the `MemoryMemento` schema definition (e.g., adding new fields, modifying existing ones, changing data types).
    *   **TDD Anchor:** `// TDD: TestNightlySchemaAdaptationFeedback`

6.  **Data Management & Pruning:**
    *   After this intensive nightly processing, the raw, comprehensively vectorized data from the processed period can be intelligently managed.
    *   Key insights, corrections, and refined structures are now integrated into the primary mementos or derived summaries.
    *   Based on configurable policies and learned relevance, less critical raw data or older, less accessed mementos (whose essence is captured in summaries or newer structures) can be:
        *   **Archived:** Moved to slower, cheaper storage if full fidelity might be needed later.
        *   **Pruned:** Selectively deleted to manage storage costs and maintain performance, especially if their informational content is deemed redundant or superseded by newer, more refined memories or insights.
    *   This step ensures the long-term sustainability of the memory system.
    *   **TDD Anchor:** `// TDD: TestNightlyDataArchivalAndPruningPolicies`

The NNNA process leverages the `Subconscious Scanner` model for deep analysis and pattern recognition, and its outputs can include new "meta-mementos" or updates to existing ones.

### 5.2. Identifying Long-Term Patterns & Traits ("Pattern Profiling")

The foundation of an agent's personality lies in the consistent patterns emerging from its experiences, largely identified and synthesized by the NNNA process.

1.  **Data Sources for Analysis:**
    *   **MongoDB `memory_mementos` Collection:** The full historical data.
    *   Specific fields of interest include: `emotionalContext`, `reasoningContext`, `contentType`, `tags`, `contentRaw/Processed`, `causalLinks`.

2.  **Processing by NNNA & `Subconscious Scanner`:**
    *   **NNNA:** Performs batch analyses, aggregations, clustering, and goal success/failure analysis as described above.
    *   **`Subconscious Scanner` Model:** Continuously (or via NNNA batch jobs) processes mementos for deeper semantic relationships, emerging narratives, and abstract concepts. Generates "meta-mementos" or "insight summaries."
    *   **TDD Anchor:** `// TDD: TestSubconsciousScannerInsightGeneration` (as part of NNNA)

3.  **Derived Personality Profile ("Persona Prism"):**
    *   The outputs from NNNA contribute to a dynamic "Personality Profile" for the agent, stored in MongoDB.
    *   It might include:
        *   **Dominant Emotional Tendencies:** e.g., Optimistic, Cautious, Empathetic.
        *   **Cognitive Styles:** e.g., Analytical, Intuitive, Reflective.
        *   **Interaction Preferences:** e.g., Prefers direct questions, uses humor, avoids confrontation.
        *   **Learned Behavioral Biases:** e.g., Tendency to suggest solution X for problem Y.
        *   **Confidence Levels:** Aggregated long-term confidence.

### 5.3. Influence of "Subconscious" Data on the "Conscious" Stream

The derived personality profile and long-term patterns ("subconscious data") can influence the agent's real-time ("conscious") behavior:

1.  **Biasing Memory Retrieval:**
    *   `ContextualRetriever` (Section 4) might subtly adjust ranking/filtering based on personality traits.
    *   **TDD Anchor:** `// TDD: TestPersonalityBiasInRecallRanking`

2.  **Informing Default Behaviors & Responses:**
    *   Personality profile guides default responses in ambiguous situations. `ResponseRefinementService` consults this.
    *   **TDD Anchor:** `// TDD: TestDefaultResponseGenerationBasedOnPersonality`

3.  **Setting Emotional Baselines & Reactivity:**
    *   Agent's baseline emotional state and reactivity influenced by long-term tendencies. [`src/core/emotionProcessor.js`](../src/core/emotionProcessor.js) factors this in.
    *   **TDD Anchor:** `// TDD: TestEmotionalBaselineAdjustmentByPersonality`

4.  **Guiding Goal Prioritization & Generation:**
    *   Learned preferences influence `TaskHopperService` and sub-goal formulation.
    *   **TDD Anchor:** `// TDD: TestGoalPrioritizationInfluencedByLearnedPreferences`

5.  **Modulating Confidence Levels:**
    *   General confidence (from personality profile) influences specific confidence scores from [`src/services/confidenceService.js`](../src/services/confidenceService.js).

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

The "Subconscious Synthesis" driven by the "Nocturnal Nurturing & Network Attunement" process provides a mechanism for the agent to develop a more consistent, nuanced, and believable persona over time, moving beyond purely reactive responses to exhibit learned behavioral tendencies, while also ensuring the memory system itself remains optimized and relevant.

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
*   `schemaVersion`: (String) Version of the memento schema used.

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
    *   `chronologicalCertainty`: "Precise"

*   **Emotional Context (`Emotional Echo`):**
    *   Typically N/A for raw commit data, unless sentiment analysis is run on commit messages (e.g., to detect frustration or excitement). Could be populated by NNNA if patterns emerge.

*   **Reasoning Context (`Reasoning Rationale`):**
    *   `inferencesMade`: Could be populated by an LLM analyzing the commit message and diff to infer intent or impact (e.g., "This change likely improves performance by reducing loop iterations.").
    *   `causalLinks`: Links to related issues (e.g., if "Fixes #123" is in the message), or to mementos of previous commits it builds upon or reverts.
    *   `associatedGoals`: If the commit is tied to a known project task or goal.

### 6.3. Embedding Strategy for Code Changes

The "Contextual Narrative Weaving" (Section 1.6) for code changes should emphasize:

1.  **Commit Message:** The full commit message is highly important.
2.  **Key Changed Files & Modules:** Names of modified files/directories.
3.  **Author & Date:** Who made the change and when.
4.  **Summarized Diff:** A very concise summary of the nature of changes (e.g., "function X modified, class Y added"). Full diffs are too large for direct embedding but can be part of `contentRaw`.
5.  **Inferred Intent/Impact:** If available from LLM analysis.
6.  **Tags:** Keywords, file paths, programming languages.

**Example Narrative for Code Change Embedding:**
```
"Code commit a1b2c3d by Ada Lovelace on 2025-05-06. Message: 'Fix: Correct off-by-one error in calculation module. Addresses issue #123.' Changed files: src/modules/calculation.js (Modified), tests/modules/calculation.test.js (Added). Inferred impact: Corrected calculation logic. Tags: #fix #bug #calculationModule #issue-123 #javascript"
```
This allows semantic search for commits based on their purpose, affected areas, or author, beyond simple keyword search on commit messages.

---

## 7. Constraints & Non-Functional Requirements ("System Stipulations")

### 7.1. Scalability ("Scale Spectrum")

*   **Ingestion Rate:** The system must handle a configurable rate of incoming mementos, from sporadic user interactions to potentially high-volume log streams or frequent code commits.
*   **Storage Volume:** Designed to store terabytes of memento data (MongoDB) and billions of vectors (Weaviate) over time, considering the "Data Management & Pruning" functions of NNNA.
*   **Query Load:** Support concurrent queries from multiple agents or services.
*   **Horizontal Scaling:** Both MongoDB and Weaviate support horizontal scaling. The service architecture (e.g., `IngestionIntegrator`, `EmbeddingService`) should be designed with statelessness or distributed state management in mind to allow for multiple instances.
*   **NNNA Scalability:** The "Nocturnal Nurturing & Network Attunement" process must be designed to process large volumes of data efficiently, potentially using distributed processing frameworks or batching strategies.

### 7.2. Latency ("Latency Limits")

*   **Ingestion Latency:** Time from data reception to memento storage and vector availability. Target: seconds for critical path, minutes for full enrichment if asynchronous steps are involved.
*   **Embedding Generation Latency:** Dependent on the chosen model and input size. Target: sub-second to a few seconds.
*   **Retrieval Latency (P95):** Time from query initiation to receiving top N mementos. Target: <500ms for typical queries.
*   **NNNA Latency:** This is a batch process, so latency is measured in hours for a full cycle, but it must complete within its scheduled window (e.g., 3 hours).

### 7.3. Data Security and Privacy ("Data Defenses")

*   **Data Encryption:**
    *   At Rest: MongoDB and Weaviate should be configured for encryption at rest.
    *   In Transit: All internal and external communication (APIs, database connections) must use TLS/SSL.
*   **Access Control:**
    *   Role-based access control (RBAC) for services interacting with databases.
    *   Agent-specific data partitioning: Queries must be strictly scoped to the `agentId`.
*   **PII Handling:** If mementos contain Personally Identifiable Information, mechanisms for PII detection, masking, or selective redaction might be needed, potentially as part of "Preprocessing Prism" or NNNA. This depends on specific deployment requirements.
*   **Audit Trails:** Log significant events (memento creation, deletion, access, NNNA actions) for security auditing.

### 7.4. Modularity and Extensibility ("Modular Malleability")

*   **Service-Oriented:** Components like `EmbeddingService`, `MemorySteward`, `ContextualRetriever`, and the services involved in NNNA should be distinct modules with clear APIs.
*   **Pluggable Components:**
    *   Easy to swap embedding models.
    *   Support for new input source adapters.
    *   Allow different strategies for "Contextual Narrative Weaving" or "Recall Ranking."
*   **Schema Evolution:** The system must gracefully handle schema changes as described in Section 3.1 and Section 5.1.

### 7.5. Reliability and Availability ("Resilient Recall")

*   **Fault Tolerance:**
    *   Retry mechanisms for transient errors in API calls, database writes.
    *   Dead-letter queues for persistent ingestion failures.
*   **Database Redundancy:** Utilize replication and failover capabilities of MongoDB and Weaviate.
*   **Backup and Recovery:** Regular backups of both databases with tested recovery procedures.
*   **NNNA Robustness:** The nightly process should be idempotent and resumable in case of failures.