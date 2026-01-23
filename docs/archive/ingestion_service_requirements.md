# Memory Ingestion Microservice - Functional Requirements

## 1. Introduction

This document outlines the functional requirements for the Memory Ingestion Microservice (internally referred to as "Ingestion Infinity-Loop"). This service is a core component of the MemoRable - Total Recall system, responsible for receiving, processing, and preparing multi-modal memory data for storage and embedding. It plays a crucial role in the system's ability to learn and adapt through its "auto-tuning schema" mechanism.

These requirements are derived from the [`docs/total_recall_specification.md`](./total_recall_specification.md), [`memoRable_implementation_plan.md`](../memoRable_implementation_plan.md), and [`docs/technical-architecture.md`](./technical-architecture.md).

## 2. Core Responsibilities

The Ingestion Microservice shall:
    - Receive data from diverse input sources.
    - Preprocess raw data to clean, normalize, and enrich it.
    - Construct "Memory Memento" objects according to a dynamically adaptive schema.
    - Coordinate with the Embedding Service to generate vector embeddings for mementos.
    - Ensure consistent storage of mementos in MongoDB (full data) and Weaviate (vector and key metadata).
    - Adapt its processing logic based on schema update notifications from the Nocturnal Nurturing & Network Attunement (NNNA) service.

## 3. Functional Requirements

### 3.1. Data Reception

*   **FR3.1.1**: The service MUST expose an API endpoint (e.g., `POST /ingest`) to accept incoming data.
    *   `// TEST: TestIngestEndpointAcceptsValidData`
*   **FR3.1.2**: The ingestion API MUST support various content types as specified in the `MemoryMemento` structure (e.g., "Text", "AudioTranscript", "ImageDescriptor", "CodeChange", "SystemLog").
    *   `// TEST: TestIngestEndpointHandlesMultipleContentTypes`
*   **FR3.1.3**: The ingestion API payload MUST allow for core memento attributes like `sourceSystem`, `sourceIdentifier`, `contentType`, `contentRaw`, and `eventTimestamp`.
    *   `// TEST: TestIngestEndpointValidatesPayloadStructure`
*   **FR3.1.4**: The service MUST acknowledge receipt of data for asynchronous processing (e.g., HTTP 202 Accepted).
    *   `// TEST: TestIngestEndpointReturns202Accepted`

### 3.2. Data Preprocessing ("Preprocessing Prism")

*   **FR3.2.1**: The service MUST normalize and clean incoming raw data.
    *   This includes text normalization (e.g., whitespace, optional lowercasing), timestamp standardization (ISO 8601), and data sanitization.
    *   `// TEST: TestDataNormalizationAndCleaning`
*   **FR3.2.2**: The service MUST perform entity extraction on textual content to identify named entities.
    *   These entities can inform tags or other memento fields.
    *   `// TEST: TestEntityExtractionFromText`
*   **FR3.2.3**: The service MUST integrate with an emotional analysis service (e.g., `HumeService` via `EmotionProcessor`) to derive emotional context from relevant inputs.
    *   `// TEST: TestEmotionalAnalysisIntegrationAndDataMapping`
*   **FR3.2.4**: The service MUST aggregate other relevant contextual data active at the time of input (e.g., from `TaskHopperService`, agent's internal state).
    *   `// TEST: TestContextualDataAggregation`
*   **FR3.2.5**: The service MAY perform content summarization or key phrase extraction for `contentProcessed` for lengthy inputs.
    *   `// TEST: TestOptionalContentSummarization`

### 3.3. Memory Memento Creation ("Memento Morphing")

*   **FR3.3.1**: The service MUST construct a complete `MemoryMemento` object from preprocessed data, adhering to the structure defined in [`docs/total_recall_specification.md#1-memory-item-structure-memory-memento`](./total_recall_specification.md#1-memory-item-structure-memory-memento).
    *   `// TEST: TestMementoConstructionFromProcessedData`
*   **FR3.3.2**: The `MemoryMemento` construction MUST be guided by the current active schema version.
    *   `// TEST: TestMementoConstructionUsesCurrentSchemaVersion`
*   **FR3.3.3**: The service MUST assign a unique `mementoId` (UUID) and `creationTimestamp` to each memento.
    *   `// TEST: TestMementoIdAndCreationTimestampAssignment`
*   **FR3.3.4**: The service MUST validate the constructed memento against the current schema before proceeding.
    *   `// TEST: TestMementoSchemaValidationAfterConstruction`

### 3.4. Embedding Coordination

*   **FR3.4.1**: The service MUST prepare a "Contextual Narrative" from the `MemoryMemento` as per the "Contextual Narrative Weaving" strategy (Section 1.6 of [`docs/total_recall_specification.md`](./total_recall_specification.md)).
    *   `// TEST: TestContextualNarrativeGenerationForEmbedding`
*   **FR3.4.2**: The service MUST call the Embedding Service (e.g., `POST /embed` on "Embedding Essence") with the generated narrative to obtain a vector embedding.
    *   `// TEST: TestEmbeddingServiceCoordination`
*   **FR3.4.3**: The service MUST handle errors gracefully if embedding generation fails (e.g., log error, mark memento for retry).
    *   `// TEST: TestEmbeddingFailureHandling`

### 3.5. Data Storage ("Storage Sanctuaries" & "Transactional Twin-Write")

*   **FR3.5.1**: The service MUST store the complete `MemoryMemento` object in the MongoDB `memory_mementos` collection.
    *   `// TEST: TestMementoStorageInMongoDB`
*   **FR3.5.2**: The service MUST store the generated embedding vector along with `mementoId` and other key filterable metadata (as defined in Weaviate schema in [`docs/total_recall_specification.md#351-weaviate-schema-vector-vault`](./total_recall_specification.md#351-weaviate-schema-vector-vault)) in the Weaviate `MemoryMemento` class.
    *   `// TEST: TestEmbeddingStorageInWeaviate`
*   **FR3.5.3**: The service MUST implement a strategy to ensure atomicity or handle consistency between MongoDB and Weaviate writes (e.g., simulated two-phase commit with compensating transactions/retries for Weaviate write failures).
    *   MongoDB write is primary; if it fails, the process stops.
    *   If Weaviate write fails after successful MongoDB write, the memento in MongoDB should be marked for retry by a background process.
    *   `// TEST: TestTransactionalTwinWriteSuccess`
    *   `// TEST: TestTransactionalTwinWriteMongoFailure`
    *   `// TEST: TestTransactionalTwinWriteWeaviateFailureAndRetryMarking`

### 3.6. Adaptive Ingestion Schema ("Schema Synapse")

*   **FR3.6.1**: The service MUST be capable of receiving schema update notifications from the NNNA service.
    *   This could be via an internal API endpoint or a message queue.
    *   `// TEST: TestSchemaUpdateNotificationReception`
*   **FR3.6.2**: Upon receiving a schema update, the service MUST load and utilize the new schema version for subsequent `MemoryMemento` construction and validation.
    *   `// TEST: TestIngestionAdaptsToNewSchemaVersion`
*   **FR3.6.3**: The service MUST store the `schemaVersion` with each `MemoryMemento` in MongoDB and Weaviate.
    *   `// TEST: TestSchemaVersionStorageWithMemento`
*   **FR3.6.4**: The service's preprocessing and memento construction logic MUST be flexible enough to adapt to defined schema changes (e.g., new optional/required fields, changes in field granularity).
    *   `// TEST: TestProcessingLogicAdaptsToSchemaChanges`

### 3.7. Multi-Modal Input Handling (Initial Focus: Text and Code)

*   **FR3.7.1**: The service MUST correctly process textual inputs (`contentType: "Text"`).
    *   `// TEST: TestTextualInputProcessing`
*   **FR3.7.2**: The service MUST correctly process code change inputs (`contentType: "CodeChange"`) as per the "Living Git Log" use case.
    *   This includes parsing relevant data from commit information (message, diff summary, author, timestamp).
    *   `// TEST: TestCodeChangeInputProcessing`
*   **FR3.7.3**: The architecture SHOULD allow for future extension to other modalities (e.g., "AudioTranscript", "ImageDescriptor") by adding new specific preprocessing and mapping logic.
    *   `// TEST: (Placeholder) TestExtensibilityForNewModalities`

## 4. Non-Functional Requirements (Key Considerations)

*   **NFR4.1 (Modularity)**: The service MUST be designed as a modular microservice with clear API boundaries, as outlined in [`docs/technical-architecture.md`](./technical-architecture.md).
*   **NFR4.2 (Testability)**: All core functionalities MUST be unit and integration testable. TDD anchors are specified for key behaviors.
*   **NFR4.3 (Scalability)**: The service SHOULD be designed to be horizontally scalable to handle varying ingestion loads. (Refer to scaling strategies in [`docs/technical-architecture.md#72-scaling-strategies`](./technical-architecture.md#72-scaling-strategies)).
*   **NFR4.4 (Reliability)**: The service MUST implement robust error handling, logging, and retry mechanisms, especially for interactions with external services (Embedding Service, databases).
*   **NFR4.5 (Security)**: Input sanitization MUST be performed. Communication with other services MUST be secure (e.g., HTTPS). Configuration and secrets management MUST follow best practices.
*   **NFR4.6 (Performance)**: While comprehensive, preprocessing and memento creation should be optimized to minimize latency in the ingestion pipeline. Asynchronous processing is key.

## 5. Constraints and Edge Cases

*   **C5.1**: Maximum input size for `contentRaw` (to be defined, impacts preprocessing and embedding).
*   **C5.2**: Rate limits of external services (e.g., Embedding Service, Hume AI).
*   **C5.3**: Handling of malformed or incomplete input data (rejection with clear error vs. partial processing).
*   **C5.4**: Behavior during database unavailability (retry queues, circuit breakers).
*   **C5.5**: Schema version conflicts or rollback strategies (NNNA's responsibility primarily, but ingestion service needs to handle notifications gracefully).
*   **C5.6**: Large backlogs of data requiring ingestion (e.g., initial import of historical Git data).

## 6. Dependencies

*   Embedding Service ("Embedding Essence")
*   MongoDB
*   Weaviate
*   Nocturnal Nurturing & Network Attunement (NNNA) Service (for schema updates)
*   Emotional Analysis Service (e.g., HumeService or abstraction)
*   Context Aggregation sources (e.g., TaskHopperService)