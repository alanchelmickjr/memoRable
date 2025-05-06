# Memory Ingestion Microservice - Domain Model

## 1. Introduction

This document defines the core data structures (domain model) for the Memory Ingestion Microservice. These structures are based on the [`docs/total_recall_specification.md`](./total_recall_specification.md) and the functional requirements outlined in [`docs/ingestion_service_requirements.md`](./ingestion_service_requirements.md).

The primary entity is the `MemoryMemento`, but intermediate structures for processing raw input and managing schema versions are also considered.

## 2. Core Entity: MemoryMemento

The `MemoryMemento` is the atomic unit of recall. Its detailed structure is defined in Section 1 of the [`docs/total_recall_specification.md`](./total_recall_specification.md). For the ingestion service, the key aspects are its construction and the data it encapsulates.

```
MemoryMemento {
  // Core Attributes
  mementoId: String (UUID)           // TEST: TestMementoIdIsUUID
  agentId: String (UUID)             // TEST: TestAgentIdIsUUID
  creationTimestamp: ISO8601Timestamp // TEST: TestCreationTimestampFormat
  sourceSystem: String               // TEST: TestSourceSystemIsValidEnumOrString
  sourceIdentifier: String (Optional)
  contentType: String (Enum: "Text", "AudioTranscript", "ImageDescriptor", "CodeChange", "SystemLog", etc.) // TEST: TestContentTypeIsValidEnum
  contentRaw: String/Object          // TEST: TestContentRawTypeMatchesContentType
  contentProcessed: String/Object (Optional)
  tags: Array<String> (Optional)
  schemaVersion: String              // TEST: TestSchemaVersionIsPresent

  // Temporal Context ("Temporal Tapestry")
  temporalContext: {
    eventTimestamp: ISO8601Timestamp    // TEST: TestEventTimestampFormat
    eventDurationMs: Integer (Optional)
    chronologicalCertainty: String (Enum: "Precise", "Estimated", "Inferred", Optional)
    temporalMarkers: Array<{ markerName: String, offsetMs: Integer }> (Optional)
  } (Optional)

  // Spatial Context ("Spatial Sphere")
  spatialContext: {
    locationCoordinates: { latitude: Float, longitude: Float, altitude: Float (Optional), accuracyMeters: Float (Optional) } (Optional)
    locationName: String (Optional)
    spatialProximity: Array<{ entityId: String, entityType: String, distanceMeters: Float (Optional), relation: String (Optional) }> (Optional)
  } (Optional)

  // Emotional Context ("Emotional Echo")
  emotionalContext: {
    detectedEmotionsHume: Array<{ name: String, score: Float, evidence: String/Object (Optional) }> (Optional) // TEST: TestDetectedEmotionsHumeStructure
    dominantEmotion: String (Optional)
    emotionalValence: Float (Optional, -1.0 to 1.0)
    emotionalArousal: Float (Optional, 0.0 to 1.0)
    emotionalSource: String (Enum: "Self", "ObservedOther", "InferredEnvironment", Optional)
    emotionalCertainty: String (Enum: "Expressed", "Inferred", "Assumed", Optional)
  } (Optional)

  // Reasoning Context ("Reasoning Rationale")
  reasoningContext: {
    inferencesMade: Array<String> (Optional)
    causalLinks: Array<{ linkedMementoId: String, relationshipType: String (Enum), strength: Float (Optional) }> (Optional)
    associatedGoals: Array<{ goalId: String, goalDescription: String, goalStatus: String (Enum) }> (Optional)
    cognitiveState: String (Optional) // e.g., "Focused", "ProblemSolving"
    taskContext: { taskId: String, taskName: String, taskStep: String } (Optional)
  } (Optional)
}
```

*   **TDD Anchors**:
    *   `// TDD: TestMemoryMementoAdheresToFullSchema`: Validates an instance against the complete structure.
    *   `// TDD: TestMemoryMementoOptionalFieldsHandled`: Ensures optional fields/contexts can be null or absent.

## 3. Intermediate Data Structures

### 3.1. RawInputData

This structure represents data as it arrives at the `POST /ingest` endpoint before any significant processing.

```
RawInputData {
  sourceSystem: String
  sourceIdentifier: String (Optional)
  contentType: String // As per MemoryMemento.contentType
  contentRaw: Any // The raw payload, type depends on contentType
  eventTimestamp: ISO8601Timestamp (Optional) // If provided by the source
  agentId: String (UUID) // Provided in request or derived from authenticated context
  metadata: Object (Optional) // Any other source-specific metadata
}
```
*   **TDD Anchors**:
    *   `// TDD: TestRawInputDataValidation`: Ensures required fields are present.

### 3.2. ProcessedInputData

This structure represents data after the "Preprocessing Prism" stage, ready for "Memento Morphing".

```
ProcessedInputData {
  // From RawInputData, potentially normalized
  sourceSystem: String
  sourceIdentifier: String (Optional)
  originalContentType: String
  originalContentRaw: Any
  agentId: String (UUID)

  // Derived/Enriched Fields
  normalizedContent: String/Object // Cleaned and normalized version of contentRaw
  processedContentSummary: String/Object (Optional) // For MemoryMemento.contentProcessed
  detectedEntities: Array<{ name: String, type: String, originalText: String }> (Optional)
  derivedEmotionalContext: { // Structure similar to MemoryMemento.emotionalContext
    detectedEmotionsHume: Array<{ name: String, score: Float, evidence: String/Object (Optional) }> (Optional)
    dominantEmotion: String (Optional)
    // ... other emotional fields
  } (Optional)
  aggregatedTemporalContext: { // Structure similar to MemoryMemento.temporalContext
    eventTimestamp: ISO8601Timestamp
    eventDurationMs: Integer (Optional)
    // ... other temporal fields
  }
  aggregatedSpatialContext: { // Structure similar to MemoryMemento.spatialContext
    locationName: String (Optional)
    // ... other spatial fields
  } (Optional)
  aggregatedReasoningContext: { // Structure similar to MemoryMemento.reasoningContext
    activeTask: { taskId: String, taskName: String, taskStep: String } (Optional)
    // ... other reasoning fields
  } (Optional)
  determinedContentTypeForMemento: String // Final content type for the memento
  derivedTags: Array<String> (Optional)
}
```
*   **TDD Anchors**:
    *   `// TDD: TestProcessedInputDataContainsAllNecessaryFieldsForMementoCreation`
    *   `// TDD: TestProcessedInputDataEmotionalContextMapping`
    *   `// TDD: TestProcessedInputDataTemporalContextMapping`

### 3.3. SchemaVersionDefinition

Represents the definition of a specific version of the `MemoryMemento` schema. This would be managed by NNNA and consumed by the Ingestion Service.

```
SchemaVersionDefinition {
  version: String // e.g., "1.0.0", "1.1.0"
  description: String (Optional)
  definition: Object // JSON Schema definition for this version of MemoryMemento
  effectiveDate: ISO8601Timestamp
  isActive: Boolean
}
```
*   **TDD Anchors**:
    *   `// TDD: TestSchemaVersionDefinitionStructure`
    *   `// TDD: TestSchemaVersionDefinitionValidationAgainstJsonSchemaStandard`

### 3.4. IngestionRequest (API Payload for `POST /ingest`)

```
IngestionRequest {
  sourceSystem: String            // REQUIRED
  sourceIdentifier: String (Optional)
  contentType: String             // REQUIRED (e.g., "Text", "CodeChange")
  contentRaw: Any                 // REQUIRED (actual data)
  eventTimestamp: ISO8601Timestamp (Optional) // If known by source
  agentId: String (UUID)          // REQUIRED (or derived from auth context)
  tags: Array<String> (Optional)  // Initial tags from source
  // Other optional contextual hints from the source system
  metadata: {
    // e.g., for CodeChange: commitAuthor, commitMessage (if not in contentRaw)
    // e.g., for Text: clientApplication, userInterfaceElement
  } (Optional)
}
```
*   **TDD Anchors**:
    *   `// TDD: TestIngestionRequestPayloadValidationRequiredFields`
    *   `// TDD: TestIngestionRequestPayloadHandlesOptionalFields`

## 4. Relationships

*   A `RawInputData` instance is transformed into one `ProcessedInputData` instance.
*   A `ProcessedInputData` instance is used to construct one `MemoryMemento` instance.
*   Each `MemoryMemento` instance is constructed according to a specific `SchemaVersionDefinition`.
*   The `IngestionRequest` is the external representation of data that becomes `RawInputData` internally.

This domain model provides the necessary structures for the ingestion pipeline to process and transform incoming data into rich, contextualized `MemoryMemento` objects.