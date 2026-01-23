# Memory Ingestion Microservice - Pseudocode Design

## 1. Introduction

This document provides the pseudocode design for the Memory Ingestion Microservice ("Ingestion Infinity-Loop"). It translates the functional requirements from [`docs/ingestion_service_requirements.md`](./ingestion_service_requirements.md) and the domain model from [`docs/ingestion_service_domain_model.md`](./ingestion_service_domain_model.md) into a high-level, modular design with TDD anchors.

The design emphasizes asynchronous processing, clear separation of concerns, and adaptability to schema changes.

## 2. Core Service: IngestionIntegrator

This is the main orchestrator for the ingestion pipeline.

```pseudocode
// File: ingestion_integrator.js

CLASS IngestionIntegrator

  // Dependencies
  PROPERTY requestValidator: RequestValidator
  PROPERTY preprocessingPrism: PreprocessingPrism
  PROPERTY mementoConstructor: MementoConstructor
  PROPERTY narrativeWeaver: NarrativeWeaver // From Total Recall Spec (Section 2.2)
  PROPERTY embeddingServiceClient: EmbeddingServiceClient
  PROPERTY memorySteward: MemorySteward
  PROPERTY schemaManager: SchemaManager
  PROPERTY logger: Logger

  CONSTRUCTOR(validator, preprocessor, constructor, weaver, embedder, steward, schemaMgr, logger)
    this.requestValidator = validator
    this.preprocessingPrism = preprocessor
    this.mementoConstructor = constructor
    this.narrativeWeaver = weaver
    this.embeddingServiceClient = embedder
    this.memorySteward = steward
    this.schemaManager = schemaMgr
    this.logger = logger
  END CONSTRUCTOR

  // API Endpoint Handler for POST /ingest
  // FR3.1.1, FR3.1.4
  ASYNC FUNCTION handleIngestRequest(ingestionRequest: IngestionRequest) : IngestionResponse
    // TEST: TestHandleIngestRequestValidPayloadReturnsAccepted
    // TEST: TestHandleIngestRequestInvalidPayloadReturnsError
    this.logger.info("Received ingestion request for agent: " + ingestionRequest.agentId)

    // 1. Validate IngestionRequest
    validationResult = this.requestValidator.validate(ingestionRequest)
    IF validationResult.isNotValid THEN
      this.logger.error("Invalid ingestion request: " + validationResult.errors)
      RETURN CREATE_ERROR_RESPONSE(400, validationResult.errors) // Bad Request
    END IF

    // 2. Asynchronously process the validated request
    // This prevents blocking the API call. A job ID could be returned for tracking.
    this.processIngestionJob(ingestionRequest) // No await, fire and forget for the API response

    RETURN CREATE_SUCCESS_RESPONSE(202, { "message": "Request accepted for processing." }) // Accepted
  END FUNCTION

  // Internal asynchronous processing logic
  ASYNC FUNCTION processIngestionJob(ingestionRequest: IngestionRequest)
    // TEST: TestProcessIngestionJobHappyPath
    // TEST: TestProcessIngestionJobPreprocessingFailure
    // TEST: TestProcessIngestionJobMementoConstructionFailure
    // TEST: TestProcessIngestionJobEmbeddingFailure
    // TEST: TestProcessIngestionJobStorageFailure
    TRY
      // 3. Preprocess Raw Data (FR3.2)
      // Convert IngestionRequest to internal RawInputData if needed, or pass directly
      rawInput = MAP_INGESTION_REQUEST_TO_RAW_INPUT(ingestionRequest)
      processedInput = await this.preprocessingPrism.process(rawInput)
      // TEST: TestProcessIngestionJobPreprocessingPrismCalledCorrectly

      IF processedInput IS ERROR THEN
        this.logger.error("Preprocessing failed for source: " + ingestionRequest.sourceIdentifier + " - " + processedInput.message)
        // Potentially send to a dead-letter queue or log for manual review
        RETURN
      END IF

      // 4. Get Current Active Schema (FR3.6.2)
      currentSchema = await this.schemaManager.getActiveSchema()
      IF currentSchema IS NULL THEN
        this.logger.error("No active schema found. Cannot process memento.")
        RETURN
      END IF
      // TEST: TestProcessIngestionJobSchemaManagerCalled

      // 5. Construct Memory Memento (FR3.3)
      memento = await this.mementoConstructor.construct(processedInput, ingestionRequest.agentId, currentSchema)
      // TEST: TestProcessIngestionJobMementoConstructorCalledCorrectly

      IF memento IS ERROR THEN
        this.logger.error("Memento construction failed for source: " + ingestionRequest.sourceIdentifier + " - " + memento.message)
        RETURN
      END IF

      // 6. Generate Contextual Narrative for Embedding (FR3.4.1)
      narrativeText = this.narrativeWeaver.weave(memento)
      IF narrativeText IS_EMPTY_OR_ERROR THEN
        this.logger.error("Narrative weaving failed for memento: " + memento.mementoId)
        // Mark memento for retry or handle error
        await this.memorySteward.updateMementoStatus(memento.mementoId, "narrative_failure")
        RETURN
      END IF
      // TEST: TestProcessIngestionJobNarrativeWeaverCalled

      // 7. Coordinate Embedding Generation (FR3.4.2)
      embeddingVector = await this.embeddingServiceClient.generateEmbedding(narrativeText)
      // TEST: TestProcessIngestionJobEmbeddingServiceClientCalled

      IF embeddingVector IS ERROR THEN
        this.logger.error("Embedding generation failed for memento: " + memento.mementoId + " - " + embeddingVector.message)
        // Mark memento for retry (FR3.4.3)
        // This assumes memento was stored first or has a temporary ID
        // The MemorySteward's storeNewMementoAndEmbeddings handles this atomicity.
        // For now, let's assume we proceed to storage and let MemorySteward handle it.
        // If embedding fails catastrophically here, MemorySteward won't get a vector.
      END IF

      // 8. Store Memento and Embedding (FR3.5)
      // MemorySteward handles the "Transactional Twin-Write" logic
      storageResult = await this.memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector)
      // TEST: TestProcessIngestionJobMemoryStewardCalled

      IF storageResult IS ERROR THEN
        this.logger.error("Storage failed for memento: " + memento.mementoId + " - " + storageResult.message)
        // Error already logged by MemorySteward, further action might involve alerts
      ELSE
        this.logger.info("Successfully ingested and stored memento: " + memento.mementoId)
      END IF

    CATCH exception
      this.logger.critical("Unhandled exception in processIngestionJob for source: " + ingestionRequest.sourceIdentifier + " - " + exception.message, exception.stack)
      // Critical error, needs alerting
    END TRY
  END FUNCTION

  // Handler for schema update notifications (FR3.6.1)
  ASYNC FUNCTION handleSchemaUpdateNotification(newSchemaVersion: String)
    // TEST: TestHandleSchemaUpdateNotificationUpdatesSchemaManager
    this.logger.info("Received schema update notification for version: " + newSchemaVersion)
    await this.schemaManager.setActiveSchemaVersion(newSchemaVersion)
    this.logger.info("Ingestion service now using schema version: " + newSchemaVersion)
  END FUNCTION

END CLASS
```

## 3. Module: RequestValidator

Validates the incoming `IngestionRequest`.

```pseudocode
// File: request_validator.js

CLASS RequestValidator
  // TEST: TestRequestValidatorWithValidData
  // TEST: TestRequestValidatorMissingRequiredFields
  // TEST: TestRequestValidatorInvalidContentType
  // TEST: TestRequestValidatorInvalidTimestampFormat
  FUNCTION validate(request: IngestionRequest) : ValidationResult
    errors = []
    IF IS_NULL_OR_EMPTY(request.sourceSystem) THEN ADD_ERROR(errors, "sourceSystem is required")
    IF IS_NULL_OR_EMPTY(request.contentType) THEN ADD_ERROR(errors, "contentType is required")
    // ELSE IF NOT IS_VALID_CONTENT_TYPE(request.contentType) THEN ADD_ERROR(errors, "Invalid contentType") // FR3.1.2
    IF IS_NULL_OR_EMPTY(request.contentRaw) THEN ADD_ERROR(errors, "contentRaw is required")
    IF IS_NULL_OR_EMPTY(request.agentId) THEN ADD_ERROR(errors, "agentId is required") // Or check auth context
    IF request.eventTimestamp AND NOT IS_VALID_ISO8601(request.eventTimestamp) THEN ADD_ERROR(errors, "Invalid eventTimestamp format")

    // Add more specific validations based on contentType if needed
    // E.g., for "CodeChange", check for commit specific metadata if expected

    RETURN { isValid: errors.length == 0, errors: errors }
  END FUNCTION
END CLASS
```

## 4. Module: PreprocessingPrism

Handles data normalization, enrichment, and transformation.

```pseudocode
// File: preprocessing_prism.js

CLASS PreprocessingPrism

  // Dependencies
  PROPERTY normalizer: DataNormalizer
  PROPERTY entityExtractor: EntityExtractorClient
  PROPERTY emotionAnalyzer: EmotionAnalyzerClient // e.g., HumeService adapter
  PROPERTY contextAggregator: ContextAggregatorClient // For TaskHopper, etc.
  PROPERTY contentSummarizer: ContentSummarizerClient (Optional)
  PROPERTY logger: Logger

  CONSTRUCTOR(normalizer, entityExtractor, emotionAnalyzer, contextAggregator, contentSummarizer, logger)
    // ... assign dependencies
  END CONSTRUCTOR

  // FR3.2
  ASYNC FUNCTION process(rawInput: RawInputData) : ProcessedInputData OR Error
    // TEST: TestPreprocessingPrismProcessHappyPath
    // TEST: TestPreprocessingPrismHandlesMissingOptionalContexts
    // TEST: TestPreprocessingPrismErrorInDependency
    TRY
      processedData = NEW ProcessedInputData()
      processedData.sourceSystem = rawInput.sourceSystem
      processedData.sourceIdentifier = rawInput.sourceIdentifier
      processedData.originalContentType = rawInput.contentType
      processedData.originalContentRaw = rawInput.contentRaw
      processedData.agentId = rawInput.agentId

      // 1. Normalize and Clean (FR3.2.1)
      processedData.normalizedContent = this.normalizer.normalize(rawInput.contentRaw, rawInput.contentType)
      // TEST: TestPreprocessingPrismNormalizationCalled

      // 2. Entity Extraction (FR3.2.2) - if applicable for content type
      IF CAN_EXTRACT_ENTITIES(rawInput.contentType) THEN
        processedData.detectedEntities = await this.entityExtractor.extract(processedData.normalizedContent)
        processedData.derivedTags = MAP_ENTITIES_TO_TAGS(processedData.detectedEntities)
        // TEST: TestPreprocessingPrismEntityExtractionCalled
      END IF

      // 3. Emotional Analysis (FR3.2.3) - if applicable
      IF CAN_ANALYZE_EMOTION(rawInput.contentType) THEN
        processedData.derivedEmotionalContext = await this.emotionAnalyzer.analyze(processedData.normalizedContent)
        // TEST: TestPreprocessingPrismEmotionAnalysisCalled
      END IF

      // 4. Aggregate Context (FR3.2.4)
      // This might involve fetching current task, location, etc. based on agentId and eventTimestamp
      aggregatedContext = await this.contextAggregator.getContext(rawInput.agentId, rawInput.eventTimestamp)
      processedData.aggregatedTemporalContext = MAP_AGGREGATED_TO_TEMPORAL(aggregatedContext, rawInput.eventTimestamp)
      processedData.aggregatedSpatialContext = MAP_AGGREGATED_TO_SPATIAL(aggregatedContext)
      processedData.aggregatedReasoningContext = MAP_AGGREGATED_TO_REASONING(aggregatedContext)
      // TEST: TestPreprocessingPrismContextAggregationCalled

      // 5. Content Summarization (Optional) (FR3.2.5)
      IF this.contentSummarizer AND SHOULD_SUMMARIZE(rawInput.contentType, processedData.normalizedContent) THEN
        processedData.processedContentSummary = await this.contentSummarizer.summarize(processedData.normalizedContent)
        // TEST: TestPreprocessingPrismSummarizationCalled
      END IF

      processedData.determinedContentTypeForMemento = rawInput.contentType // Or could be refined

      RETURN processedData
    CATCH exception
      this.logger.error("Error in PreprocessingPrism: " + exception.message, exception.stack)
      RETURN CREATE_ERROR("Preprocessing failed: " + exception.message)
    END TRY
  END FUNCTION

END CLASS
```

## 5. Module: MementoConstructor

Constructs `MemoryMemento` objects.

```pseudocode
// File: memento_constructor.js

CLASS MementoConstructor
  PROPERTY logger: Logger

  CONSTRUCTOR(logger)
    this.logger = logger
  END CONSTRUCTOR

  // FR3.3
  ASYNC FUNCTION construct(processedInput: ProcessedInputData, agentId: String, schema: SchemaVersionDefinition) : MemoryMemento OR Error
    // TEST: TestMementoConstructorHappyPath
    // TEST: TestMementoConstructorValidatesAgainstSchema
    // TEST: TestMementoConstructorHandlesMissingProcessedDataFields
    // TEST: TestMementoConstructorMapsAllContextsCorrectly
    TRY
      memento = NEW MemoryMemento()
      memento.mementoId = GENERATE_UUID() // FR3.3.3
      memento.agentId = agentId
      memento.creationTimestamp = CURRENT_ISO_TIMESTAMP() // FR3.3.3
      memento.schemaVersion = schema.version // FR3.6.3

      memento.sourceSystem = processedInput.sourceSystem
      memento.sourceIdentifier = processedInput.sourceIdentifier
      memento.contentType = processedInput.determinedContentTypeForMemento
      memento.contentRaw = processedInput.originalContentRaw
      memento.contentProcessed = processedInput.processedContentSummary // May be null

      memento.tags = processedInput.derivedTags

      // Map contexts
      memento.temporalContext = processedInput.aggregatedTemporalContext
      memento.spatialContext = processedInput.aggregatedSpatialContext
      memento.emotionalContext = processedInput.derivedEmotionalContext
      memento.reasoningContext = processedInput.aggregatedReasoningContext

      // Validate against the provided schema definition (FR3.3.4)
      validationResult = VALIDATE_AGAINST_JSON_SCHEMA(memento, schema.definition)
      // TEST: TestMementoConstructorSchemaValidationLogic
      IF validationResult.isNotValid THEN
        this.logger.error("Constructed memento failed schema validation for version " + schema.version + ": " + validationResult.errors)
        RETURN CREATE_ERROR("Memento schema validation failed: " + validationResult.errors)
      END IF

      RETURN memento
    CATCH exception
      this.logger.error("Error in MementoConstructor: " + exception.message, exception.stack)
      RETURN CREATE_ERROR("Memento construction error: " + exception.message)
    END TRY
  END FUNCTION
END CLASS
```

## 6. Module: SchemaManager

Manages access to and updates of `MemoryMemento` schema versions.

```pseudocode
// File: schema_manager.js

CLASS SchemaManager
  // Dependencies
  PROPERTY schemaStoreClient: DatabaseClient // Client to fetch schema definitions (e.g., from MongoDB)
  PROPERTY logger: Logger
  PROPERTY activeSchemaVersion: String
  PROPERTY schemaCache: Map<String, SchemaVersionDefinition>


  CONSTRUCTOR(schemaStoreClient, logger)
    this.schemaStoreClient = schemaStoreClient
    this.logger = logger
    this.activeSchemaVersion = null // Load default on init
    this.schemaCache = NEW Map()
    // Initialize: Load active schema version from store
    // ASYNC this.initializeActiveSchema()
  END CONSTRUCTOR

  ASYNC FUNCTION initializeActiveSchema()
    // Load the currently marked 'active' schema from the database
    // Or a default version if none is marked active
    // TEST: TestSchemaManagerInitializationLoadsActiveSchema
    defaultSchema = await this.schemaStoreClient.find({ "isActive": true }) // Simplified
    IF defaultSchema THEN
      this.activeSchemaVersion = defaultSchema.version
      this.schemaCache.set(defaultSchema.version, defaultSchema)
      this.logger.info("Initialized active schema version: " + this.activeSchemaVersion)
    ELSE
      this.logger.warn("No active schema found during initialization. Using fallback or awaiting update.")
      // Potentially load a hardcoded default or throw error if critical
    END IF
  END FUNCTION

  // FR3.6.2
  ASYNC FUNCTION getActiveSchema() : SchemaVersionDefinition OR Null
    // TEST: TestGetActiveSchemaReturnsCorrectVersion
    // TEST: TestGetActiveSchemaHandlesCacheMiss
    IF IS_NULL(this.activeSchemaVersion) THEN
      await this.initializeActiveSchema() // Attempt to load if not already
      IF IS_NULL(this.activeSchemaVersion) THEN
         this.logger.error("Cannot get active schema: No version is set to active.")
         RETURN Null
      END IF
    END IF

    IF this.schemaCache.has(this.activeSchemaVersion) THEN
      RETURN this.schemaCache.get(this.activeSchemaVersion)
    END IF

    // Fetch from store if not in cache (should be rare if initialized and updated properly)
    schemaDef = await this.schemaStoreClient.findOne({ "version": this.activeSchemaVersion })
    IF schemaDef THEN
      this.schemaCache.set(this.activeSchemaVersion, schemaDef)
      RETURN schemaDef
    ELSE
      this.logger.error("Active schema version " + this.activeSchemaVersion + " not found in store.")
      RETURN Null
    END IF
  END FUNCTION

  // Called by IngestionIntegrator upon notification from NNNA (FR3.6.1)
  ASYNC FUNCTION setActiveSchemaVersion(newVersion: String) : Boolean
    // TEST: TestSetActiveSchemaVersionUpdatesActiveVersion
    // TEST: TestSetActiveSchemaVersionFetchesAndCachesNewSchema
    // TEST: TestSetActiveSchemaVersionInvalidVersion
    schemaDef = await this.schemaStoreClient.findOne({ "version": newVersion })
    IF schemaDef THEN
      this.activeSchemaVersion = newVersion
      this.schemaCache.set(newVersion, schemaDef) // Ensure it's cached
      this.logger.info("Active schema version updated to: " + newVersion)
      RETURN True
    ELSE
      this.logger.error("Attempted to set active schema to non-existent version: " + newVersion)
      RETURN False
    END IF
  END FUNCTION

END CLASS
```

## 7. Module: MemorySteward (Client/Adapter)

Handles interaction with MongoDB and Weaviate for storage. This pseudocode focuses on the ingestion part.
(Full `MemorySteward` as per Total Recall Spec Section 3.6 is more comprehensive).

```pseudocode
// File: memory_steward.js (Ingestion-focused part)

CLASS MemorySteward
  // Dependencies
  PROPERTY mongoClient: MongoClientWrapper
  PROPERTY weaviateClient: WeaviateClientWrapper
  PROPERTY logger: Logger

  CONSTRUCTOR(mongoClient, weaviateClient, logger)
    // ... assign dependencies
  END CONSTRUCTOR

  // FR3.5, FR3.5.3 (Transactional Twin-Write)
  ASYNC FUNCTION storeNewMementoAndEmbeddings(memento: MemoryMemento, embeddingVector: Vector OR Null) : StorageResult OR Error
    // TEST: TestStoreNewMementoAndEmbeddingsSuccess
    // TEST: TestStoreNewMementoAndEmbeddingsMongoFailureNoWeaviateWrite
    // TEST: TestStoreNewMementoAndEmbeddingsEmbeddingVectorMissingMarksForRetry
    // TEST: TestStoreNewMementoAndEmbeddingsWeaviateFailureMarksForRetry

    // Phase 1: Store in MongoDB (Primary)
    TRY
      await this.mongoClient.collection("memory_mementos").insertOne(memento)
      this.logger.info("Memento stored in MongoDB: " + memento.mementoId)
      // TEST: TestStoreNewMementoAndEmbeddingsMongoWriteSuccessful
    CATCH mongoException
      this.logger.error("MongoDB write failed for memento " + memento.mementoId + ": " + mongoException.message, mongoException.stack)
      RETURN CREATE_ERROR("Primary storage (MongoDB) failed.")
    END TRY

    // If embeddingVector is null/error, it means embedding generation failed earlier.
    // Mark for retry and exit.
    IF IS_NULL(embeddingVector) OR embeddingVector IS ERROR THEN
      this.logger.warn("Embedding vector not available for memento " + memento.mementoId + ". Marking for embedding retry.")
      await this.updateMementoStatusInMongo(memento.mementoId, "pending_embedding_retry")
      // TEST: TestStoreNewMementoAndEmbeddingsNullVectorTriggersRetryStatus
      RETURN CREATE_PARTIAL_SUCCESS("Memento stored, pending embedding.") // Or an Error if strictness is required
    END IF

    // Phase 2: Store in Weaviate (Secondary)
    weaviateObject = {
      "mementoId": memento.mementoId,
      "agentId": memento.agentId,
      "creationTimestamp": memento.creationTimestamp,
      "eventTimestamp": memento.temporalContext.eventTimestamp,
      "contentType": memento.contentType,
      "tags": memento.tags,
      "dominantEmotion": memento.emotionalContext ? memento.emotionalContext.dominantEmotion : null,
      "sourceSystem": memento.sourceSystem,
      "schemaVersion": memento.schemaVersion
      // Other filterable fields from memento for Weaviate schema
    }

    TRY
      await this.weaviateClient.data.creator()
        .withClassName("MemoryMemento") // As per Weaviate schema
        .withId(memento.mementoId)
        .withProperties(weaviateObject)
        .withVector(embeddingVector)
        .do()
      this.logger.info("Embedding stored in Weaviate for memento: " + memento.mementoId)
      // TEST: TestStoreNewMementoAndEmbeddingsWeaviateWriteSuccessful
    CATCH weaviateException
      this.logger.error("Weaviate write failed for memento " + memento.mementoId + ": " + weaviateException.message, weaviateException.stack)
      // Compensating action: Mark MongoDB record for retry (FR3.5.3)
      await this.updateMementoStatusInMongo(memento.mementoId, "weaviate_write_retry")
      // TEST: TestStoreNewMementoAndEmbeddingsWeaviateFailureTriggersRetryStatus
      RETURN CREATE_ERROR("Secondary storage (Weaviate) failed. Marked for retry.")
    END TRY

    RETURN CREATE_SUCCESS_RESULT("Memento and embedding stored successfully.")
  END FUNCTION

  ASYNC FUNCTION updateMementoStatusInMongo(mementoId: String, status: String)
    // TEST: TestUpdateMementoStatusInMongoCorrectlyUpdatesDocument
    // Logic to update a status field in the MongoDB memento document
    // e.g., this.mongoClient.collection("memory_mementos").updateOne({ mementoId: mementoId }, { $set: { ingestionStatus: status } })
    this.logger.info("Updated status for memento " + mementoId + " to: " + status)
  END FUNCTION

END CLASS
```

## 8. Client Adapters (Conceptual)

These represent clients for external services.

```pseudocode
// File: embedding_service_client.js
CLASS EmbeddingServiceClient
  // PROPERTY baseUrl: String
  // PROPERTY httpClient: HttpClient
  ASYNC FUNCTION generateEmbedding(narrativeText: String) : Vector OR Error
    // Makes HTTP POST request to Embedding Service /embed endpoint
    // Handles API responses and errors
    // TEST: TestEmbeddingServiceClientSuccess
    // TEST: TestEmbeddingServiceClientApiError
  END FUNCTION
END CLASS

// Other clients like EntityExtractorClient, EmotionAnalyzerClient, ContextAggregatorClient
// would follow a similar pattern, interacting with their respective services.
```

This pseudocode provides a high-level structure. Implementation details (specific error handling, retry logic, exact API client implementations) would be refined during coding.