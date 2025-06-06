/**
 * @file Defines the core data structures and types for the Ingestion Microservice.
 * These are based on the domain model specified in docs/ingestion_service_domain_model.md.
 */

/**
 * Represents the type of content being ingested.
 */
export type ContentType =
  | "Text"
  | "AudioTranscript"
  | "ImageDescriptor"
  | "CodeChange"
  | "SystemLog"
  | "UserInteraction" // Added based on potential future needs
  | "Video" // Added for video input
  | "VideoFrame" // Added for individual video frames
  | "GenericData"     // Fallback for other types
  | string; // Allows for future extension

/**
 * Represents the certainty level of temporal information.
 */
export type ChronologicalCertainty = "Precise" | "Estimated" | "Inferred";

/**
 * Represents the source of emotional context.
 */
export type EmotionalSource = "Self" | "ObservedOther" | "InferredEnvironment";

/**
 * Represents the certainty level of emotional information.
 */
export type EmotionalCertainty = "Expressed" | "Inferred" | "Assumed";

/**
 * Represents the type of relationship in causal links.
 */
export type CausalRelationshipType =
  | "Causes"
  | "CausedBy"
  | "CorrelatedWith"
  | "Precedes"
  | "Follows"
  | "AssociatedWith";

/**
 * Represents the status of an associated goal.
 */
export type GoalStatus = "Active" | "Completed" | "Paused" | "Abandoned";

/**
 * Represents a temporal marker.
 */
export interface TemporalMarker {
  markerName: string;
  offsetMs: number;
}

/**
 * Represents location coordinates.
 */
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracyMeters?: number;
}

/**
 * Represents spatial proximity to an entity.
 */
export interface SpatialProximity {
  entityId: string;
  entityType: string;
  distanceMeters?: number;
  relation?: string;
}

/**
 * Represents a detected emotion from Hume AI.
 */
export interface HumeDetectedEmotion {
  name: string;
  score: number;
  evidence?: string | object;
}

/**
 * Represents a causal link between mementos.
 */
export interface CausalLink {
  linkedMementoId: string;
  relationshipType: CausalRelationshipType;
  strength?: number;
}

/**
 * Represents an associated goal.
 */
export interface AssociatedGoal {
  goalId: string;
  goalDescription: string;
  goalStatus: GoalStatus;
}

/**
 * Represents task context.
 */
export interface TaskContext {
  taskId: string;
  taskName: string;
  taskStep: string;
}

/**
 * Represents the temporal context of a memento.
 * "Temporal Tapestry"
 */
export interface TemporalContext {
  eventTimestamp: string; // ISO8601Timestamp
  eventDurationMs?: number;
  chronologicalCertainty?: ChronologicalCertainty;
  temporalMarkers?: TemporalMarker[];
}

/**
 * Represents the spatial context of a memento.
 * "Spatial Sphere"
 */
export interface SpatialContext {
  locationCoordinates?: LocationCoordinates;
  locationName?: string;
  spatialProximity?: SpatialProximity[];
}

/**
 * Represents the emotional context of a memento.
 * "Emotional Echo"
 */
export interface EmotionalContext {
  detectedEmotionsHume?: HumeDetectedEmotion[];
  dominantEmotion?: string;
  emotionalValence?: number; // -1.0 to 1.0
  emotionalArousal?: number; // 0.0 to 1.0
  emotionalSource?: EmotionalSource;
  emotionalCertainty?: EmotionalCertainty;
}

/**
 * Represents the reasoning context of a memento.
 * "Reasoning Rationale"
 */
export interface ReasoningContext {
  inferencesMade?: string[];
  causalLinks?: CausalLink[];
  associatedGoals?: AssociatedGoal[];
  cognitiveState?: string; // e.g., "Focused", "ProblemSolving"
  taskContext?: TaskContext;
}

/**
 * Core entity: MemoryMemento.
 * The atomic unit of recall.
 */
export interface MemoryMemento {
  // Core Attributes
  mementoId: string; // UUID
  agentId: string; // UUID
  version: string; // Version of this memento's structure, from SchemaVersionDefinition.mementoVersion
  createdAt: string; // ISO8601Timestamp - When the memento was created in our system
  updatedAt: string; // ISO8601Timestamp - When the memento was last updated
  eventTimestamp: string; // ISO8601Timestamp - When the original event occurred

  sourceSystem: string;
  sourceIdentifier?: string;
  contentType: ContentType;
  content: string | object; // Normalized/primary content for the memento
  originalContentRaw?: string | object; // Optional: store the absolute raw input
  summary?: string | object; // Optional: summary of the content
  
  tags?: string[];
  entities?: DetectedEntity[]; // Using a more detailed DetectedEntity type
  emotionalContext?: Partial<EmotionalContext>; // Using Partial as it's built incrementally
  temporalContext?: TemporalContext; // This is the aggregated one
  spatialContext?: Partial<SpatialContext>;
  reasoningContext?: Partial<ReasoningContext>;
  metadata?: Record<string, any>; // Other arbitrary metadata associated with the memento
  // schemaVersion: string; // Replaced by 'version' to align with mementoVersion
}

/**
 * Represents a detected entity with more detail.
 */
export interface DetectedEntity {
  name: string;
  type: string;
  originalText?: string; // The text span from which the entity was extracted
  relevance?: number;    // Confidence score or relevance
  metadata?: Record<string, any>; // Additional metadata about the entity
}


/**
 * Represents data as it arrives at the POST /ingest endpoint.
 */
export interface RawInputData {
  sourceSystem: string;
  sourceIdentifier?: string;
  contentType: ContentType;
  contentRaw: any; // The raw payload, type depends on contentType
  eventTimestamp: string; // ISO8601Timestamp, if provided by the source - making this required for ProcessedInputData
  agentId: string; // UUID, provided in request or derived from authenticated context
  metadata: Record<string, any>; // Any other source-specific metadata - making this required for ProcessedInputData
}

/**
 * Represents data after the "Preprocessing Prism" stage.
 */
export interface ProcessedInputData {
  // From RawInputData, potentially normalized
  sourceSystem: string;
  sourceIdentifier?: string;
  originalContentType: ContentType;
  originalContentRaw: any;
  agentId: string; // UUID

  // Derived/Enriched Fields
  normalizedContent: string | object; // Cleaned and normalized version of contentRaw
  processedContentSummary?: string | object; // For MemoryMemento.summary
  detectedEntities?: DetectedEntity[]; // Using the new DetectedEntity interface
  derivedEmotionalContext?: Partial<EmotionalContext>;
  aggregatedTemporalContext: TemporalContext;
  aggregatedSpatialContext?: Partial<SpatialContext>;
  aggregatedReasoningContext?: Partial<ReasoningContext>;
  determinedContentTypeForMemento: ContentType;
  derivedTags?: string[];
  eventTimestamp: string; // Ensure this is carried through from RawInputData
  metadata: Record<string, any>; // Ensure this is carried through
}

/**
 * Represents the definition of a specific version of the MemoryMemento schema.
 * Managed by NNNA and consumed by the Ingestion Service.
 */
export interface SchemaFieldDefinition {
  name: string;
  type: DataType | string; // Allow for custom string types if necessary
  required?: boolean;
  description?: string;
  // Allow other properties for more complex schema definitions (e.g., nested fields, enums)
  [key: string]: any;
}

export interface SchemaVersionDefinition {
  version: string; // Overall version of this schema document, e.g., "1.0.0", "1.1.0"
  mementoVersion: string; // Version of the MemoryMemento structure this schema defines, e.g., "1.0", "1.1"
  description?: string;
  definition: object; // Full JSON Schema definition for this version of MemoryMemento
  fields: SchemaFieldDefinition[]; // Simplified field list for quick validation/mapping
  effectiveDate: string; // ISO8601Timestamp
  isActive: boolean;
}

/**
 * Represents the API payload for POST /ingest.
 */
export interface IngestionRequest {
  sourceSystem: string;
  sourceIdentifier?: string;
  contentType: ContentType;
  contentRaw: any; // actual data
  eventTimestamp?: string; // ISO8601Timestamp, if known by source
  agentId: string; // UUID (or derived from auth context)
  tags?: string[]; // Initial tags from source
  metadata?: Record<string, any>; // Other optional contextual hints
}

/**
 * Represents the general structure for a successful API response body.
 */
export interface ApiSuccessResponseBody<T = any> {
  message: string;
  data?: T;
  mementoId?: string; // Specifically for ingestion success
  status?: 'error' | 'stored' | 'pending_embedding_retry' | 'storage_failed' | 'stored_without_embedding';
}

/**
 * Represents the general structure for an error API response body.
 */
export interface ApiErrorResponseBody {
  error: string;
  details?: any;
}

/**
 * Represents a generic API response structure for the Ingestion Service.
 * This will be used by endpoint handlers.
 */
export interface IngestionApiResponse {
  statusCode: number;
  body: ApiSuccessResponseBody | ApiErrorResponseBody;
}

/**
 * Represents the specific data returned in the body of a successful ingestion request (202 Accepted).
 * This aligns with the previous IngestionResponse but is now part of a more generic structure.
 */
export interface IngestionAcceptedResponseData {
  message: string;
  // Potentially a trackingId could be added here in the future
}

/**
 * Represents the specific data returned in the body of a successful synchronous ingestion (if ever implemented)
 * or when providing details about an accepted memento.
 */
export interface MementoAcceptedDetail {
    mementoId: string;
    status: string;
    message?: string;
}
// The old IngestionResponse is effectively replaced by ApiSuccessResponseBody<MementoAcceptedDetail>
// or ApiSuccessResponseBody<IngestionAcceptedResponseData> depending on the context.
// For the 202 response, IngestionAcceptedResponseData is more appropriate.

/**
 * Represents the type of data being ingested, for validation purposes.
 */
export enum DataType {
  TEXT = "TEXT",
  AUDIO = "AUDIO",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
  CODE = "CODE",
  SYSTEM_LOG = "SYSTEM_LOG",
  USER_INTERACTION = "USER_INTERACTION",
  GENERIC = "GENERIC",
}

/**
 * Represents the source of the ingestion request, for validation purposes.
 */
export enum Source {
  MANUAL_INPUT = "MANUAL_INPUT",
  API_UPLOAD = "API_UPLOAD",
  AUTOMATED_SYSTEM = "AUTOMATED_SYSTEM",
  WEB_SCRAPER = "WEB_SCRAPER",
  EMAIL_INGESTION = "EMAIL_INGESTION",
}

/**
 * Represents the result of a validation operation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Represents the structure of an ingestion request specifically for the validator function.
 */
export interface ValidatorIngestionRequest {
  userId: string;
  source: Source;
  timestamp: string; // ISO8601 Timestamp
  dataType: DataType;
  data: any; // Structure depends on dataType
  metadata?: Record<string, any>;
}

/**
 * Represents data after initial validation.
 */
export interface ValidatedInputData extends RawInputData {
  validationResult: ValidationResult;
}

/**
 * Represents the outcome of the internal ingestion processing job.
 * This is not directly returned by the API, but used internally.
 */
export interface IngestionResult {
  success: boolean;
  mementoId?: string; // Present if memento creation was attempted
  status: 'VALIDATION_FAILED' | 'PREPROCESSING_FAILED' | 'MEMENTO_CONSTRUCTION_FAILED' | 'EMBEDDING_FAILED' | 'STORAGE_FAILED' | 'PROCESSED_AND_STORED' | 'PROCESSED_PENDING_EMBEDDING' | 'UNKNOWN_ERROR';
  message: string;
  errors?: Array<{ field?: string; message: string }>; // Optional detailed errors
}