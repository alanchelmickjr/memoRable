/**
 * @file Implements the SchemaManager class for the Ingestion Microservice.
 * This class is responsible for managing MemoryMemento schema versions.
 */

import { SchemaVersionDefinition, DataType, SchemaFieldDefinition } from './models';
import { NNNAServiceClient } from './clients/nnna_service_client'; // Use the actual client
// import { MongoClient, Db } from 'mongodb'; // Example for a schema store
// import { Logger } from '../../utils/logger'; // Assuming a shared logger utility

// Placeholder for NnnaServiceClient - REMOVED

// Placeholder for a simple in-memory cache or a more robust DB client
export interface SchemaStoreClient {
  findActiveSchema(): Promise<SchemaVersionDefinition | null>;
  findSchemaByVersion(version: string): Promise<SchemaVersionDefinition | null>;
  saveSchema(schema: SchemaVersionDefinition): Promise<void>;
  updateSchemaStatus(version: string, isActive: boolean): Promise<void>;
}

// Basic in-memory store placeholder
class InMemorySchemaStore implements SchemaStoreClient {
  private schemas: Map<string, SchemaVersionDefinition> = new Map();
  private activeVersion: string | null = null;
  private logger = console;

  constructor() {
    // Initialize with a default schema
    const defaultSchema: SchemaVersionDefinition = {
      version: '1.0.0', // Overall schema document version
      mementoVersion: '1.0', // Version of the memento structure
      description: 'Initial default MemoryMemento schema',
      fields: [ // Add a basic fields array
        { name: 'mementoId', type: DataType.TEXT, required: true }, // Using DataType enum
        { name: 'agentId', type: DataType.TEXT, required: true },
        { name: 'creationTimestamp', type: DataType.TEXT, required: true }, // Assuming TEXT for string dates in simplified view
        { name: 'schemaVersion', type: DataType.TEXT, required: true },
        { name: 'sourceSystem', type: DataType.TEXT, required: true },
        { name: 'contentType', type: DataType.TEXT, required: true }, // Or a more specific custom type string if needed
        { name: 'contentRaw', type: DataType.GENERIC, required: true }, // Changed to DataType.GENERIC
      ] as SchemaFieldDefinition[], // Added 'as SchemaFieldDefinition[]' for stricter typing
      definition: {
        type: 'object',
        properties: {
          mementoId: { type: 'string', format: 'uuid' },
          agentId: { type: 'string', format: 'uuid' },
          creationTimestamp: { type: 'string', format: 'date-time' },
          schemaVersion: { type: 'string' },
          sourceSystem: { type: 'string' },
          contentType: { type: 'string' }, // Consider enum from models.ts
          contentRaw: { type: ['string', 'object'] },
          contentProcessed: { type: ['string', 'object', 'null'] },
          tags: { type: 'array', items: { type: 'string' } },
          temporalContext: { type: ['object', 'null'] }, // Referencing TemporalContext interface
          spatialContext: { type: ['object', 'null'] },  // Referencing SpatialContext interface
          emotionalContext: { type: ['object', 'null'] },// Referencing EmotionalContext interface
          reasoningContext: { type: ['object', 'null'] },// Referencing ReasoningContext interface
        },
        required: ['mementoId', 'agentId', 'creationTimestamp', 'schemaVersion', 'sourceSystem', 'contentType', 'contentRaw'],
      },
      effectiveDate: new Date().toISOString(),
      isActive: true,
    };
    this.schemas.set(defaultSchema.version, defaultSchema);
    this.activeVersion = defaultSchema.version;
    this.logger.info(`InMemorySchemaStore initialized with default schema ${defaultSchema.version}`);
  }

  async findActiveSchema(): Promise<SchemaVersionDefinition | null> {
    if (this.activeVersion) {
      return this.schemas.get(this.activeVersion) || null;
    }
    // Fallback if no active version is set (e.g. first run)
    // This logic might be more complex in a real DB scenario
    for (const schema of this.schemas.values()) {
        if (schema.isActive) {
            this.activeVersion = schema.version;
            return schema;
        }
    }
    this.logger.warn('InMemorySchemaStore: No active schema found.');
    return null;
  }

  async findSchemaByVersion(version: string): Promise<SchemaVersionDefinition | null> {
    return this.schemas.get(version) || null;
  }

  async saveSchema(schema: SchemaVersionDefinition): Promise<void> {
    this.schemas.set(schema.version, schema);
    if (schema.isActive) {
      // Ensure only one schema is active
      if (this.activeVersion && this.activeVersion !== schema.version) {
        const oldActive = this.schemas.get(this.activeVersion);
        if (oldActive) oldActive.isActive = false;
      }
      this.activeVersion = schema.version;
    }
    this.logger.info(`Schema ${schema.version} saved. Active: ${schema.isActive}`);
  }
  
  async updateSchemaStatus(version: string, isActive: boolean): Promise<void> {
    const schema = this.schemas.get(version);
    if (schema) {
      schema.isActive = isActive;
      if (isActive) {
        if (this.activeVersion && this.activeVersion !== version) {
          const oldActive = this.schemas.get(this.activeVersion);
          if (oldActive) oldActive.isActive = false;
        }
        this.activeVersion = version;
      } else if (this.activeVersion === version) {
        this.activeVersion = null; // Or find another to set active
      }
      this.logger.info(`Schema ${version} status updated. Active: ${isActive}`);
    } else {
      this.logger.warn(`Schema ${version} not found for status update.`);
    }
  }
}


/**
 * Manages MemoryMemento schema versions, including fetching the current active schema
 * and interacting with the NNNA service for updates.
 */
export class SchemaManager {
  private schemaStore: SchemaStoreClient;
  private nnnaClient: NNNAServiceClient; // Use imported NNNAServiceClient type
  private logger: Console;
  private currentActiveSchema: SchemaVersionDefinition | null = null;
  private schemaCache: Map<string, SchemaVersionDefinition> = new Map();

  /**
   * Initializes a new instance of the SchemaManager class.
   * @param {SchemaStoreClient} [schemaStore] - Client to fetch/store schema definitions.
   * @param {NnnaServiceClient} [nnnaClient] - Client to interact with NNNA service.
   * @param {Console} [logger=console] - Optional logger instance.
   */
  constructor(
    schemaStore?: SchemaStoreClient,
    nnnaClient?: NNNAServiceClient, // Use imported NNNAServiceClient type
    logger?: Console
  ) {
    this.schemaStore = schemaStore || new InMemorySchemaStore();
    // If nnnaClient is not provided, instantiate the imported NNNAServiceClient
    this.nnnaClient = nnnaClient || new NNNAServiceClient(logger || console);
    this.logger = logger || console;
    // Call initialize() separately after creating an instance for async operations.
  }

  /**
   * Initializes the SchemaManager by loading the active schema.
   * Should be called after constructor.
   */
  public async initialize(): Promise<void> {
    this.logger.info('SchemaManager: Initializing...');
    try {
      const activeSchema = await this.schemaStore.findActiveSchema();
      if (activeSchema) {
        this.currentActiveSchema = activeSchema;
        this.schemaCache.set(activeSchema.version, activeSchema);
        this.logger.info(`SchemaManager initialized. Active schema version: ${activeSchema.version}`);
      } else {
        this.logger.warn('SchemaManager: No active schema found during initialization. Attempting to use/create a hardcoded default.');
        // Create and use a hardcoded default if none exists in the store
        const fallbackSchema: SchemaVersionDefinition = {
          version: '1.0.0', // Consistent with InMemorySchemaStore's default
          mementoVersion: '1.0', // Version of the memento structure
          description: 'Fallback default MemoryMemento schema',
          fields: [
            { name: 'mementoId', type: DataType.TEXT, required: true },
            { name: 'agentId', type: DataType.TEXT, required: true },
            { name: 'creationTimestamp', type: DataType.TEXT, required: true },
            { name: 'schemaVersion', type: DataType.TEXT, required: true }, // This refers to mementoVersion
            { name: 'sourceSystem', type: DataType.TEXT, required: true },
            { name: 'contentType', type: DataType.TEXT, required: true },
            { name: 'contentRaw', type: DataType.GENERIC, required: true },
          ] as SchemaFieldDefinition[],
          definition: { /* ... (same as InMemorySchemaStore default definition) ... */
            type: 'object',
            properties: {
              mementoId: { type: 'string', format: 'uuid' },
              agentId: { type: 'string', format: 'uuid' },
              creationTimestamp: { type: 'string', format: 'date-time' },
              schemaVersion: { type: 'string' }, // This refers to mementoVersion
              sourceSystem: { type: 'string' },
              contentType: { type: 'string' },
              contentRaw: { type: ['string', 'object'] },
              contentProcessed: { type: ['string', 'object', 'null'], nullable: true },
              tags: { type: 'array', items: { type: 'string' }, nullable: true },
              temporalContext: { type: ['object', 'null'], nullable: true },
              spatialContext: { type: ['object', 'null'], nullable: true },
              emotionalContext: { type: ['object', 'null'], nullable: true },
              reasoningContext: { type: ['object', 'null'], nullable: true },
            },
            required: ['mementoId', 'agentId', 'creationTimestamp', 'schemaVersion', 'sourceSystem', 'contentType', 'contentRaw'],
          },
          effectiveDate: new Date().toISOString(),
          isActive: true,
        };
        await this.schemaStore.saveSchema(fallbackSchema);
        this.currentActiveSchema = fallbackSchema;
        this.schemaCache.set(fallbackSchema.version, fallbackSchema);
        this.logger.info(`SchemaManager: Initialized with hardcoded fallback schema version: ${fallbackSchema.version}`);
      }
    } catch (error) {
      this.logger.error('SchemaManager: Error during initialization.', error);
      throw new Error(`SchemaManager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieves the current active schema definition.
   * @returns {Promise<SchemaVersionDefinition>} The active schema.
   * @throws {Error} If no active schema is loaded and cannot be initialized.
   */
  public async getCurrentSchema(): Promise<SchemaVersionDefinition> {
    if (!this.currentActiveSchema) {
      this.logger.warn("SchemaManager.getCurrentSchema: No current active schema. Attempting to initialize.");
      await this.initialize();
      if (!this.currentActiveSchema) {
        this.logger.error("SchemaManager.getCurrentSchema: Failed to initialize and load an active schema.");
        throw new Error("No active schema available. Ingestion service cannot proceed.");
      }
    }
    // FR3.6.4: Placeholder for checking NNNA for updates.
    // await this.checkForSchemaUpdates(); // This could be called periodically or triggered.
    return this.currentActiveSchema;
  }

  /**
   * Retrieves a specific schema definition by version.
   * @param {string} version - The version of the schema to retrieve.
   * @returns {Promise<SchemaVersionDefinition | null>} The schema definition or null if not found.
   */
  public async getSchemaByVersion(version: string): Promise<SchemaVersionDefinition | null> {
    if (this.schemaCache.has(version)) {
      return this.schemaCache.get(version) || null;
    }
    const schema = await this.schemaStore.findSchemaByVersion(version);
    if (schema) {
      this.schemaCache.set(version, schema);
      return schema;
    }
    this.logger.warn(`SchemaManager: Schema version ${version} not found in store or cache.`);
    return null;
  }

  /**
   * Checks for schema updates from the NNNA service and updates the local store/cache if a new version is found.
   * FR3.6.4: Auto-tuning schema mechanism.
   */
  public async checkForSchemaUpdates(): Promise<void> {
    this.logger.info('SchemaManager: Checking for schema updates from NNNA (placeholder).');
    if (!this.currentActiveSchema) {
      this.logger.error('SchemaManager.checkForSchemaUpdates: No current active schema to check against. Initialize first.');
      return;
    }
try {
  const updatedSchema = await this.nnnaClient.checkForUpdates(this.currentActiveSchema.version);

  if (updatedSchema && updatedSchema.version !== this.currentActiveSchema.version) {
        this.logger.info(`SchemaManager: Found new schema version ${updatedSchema.version} from NNNA service.`);
        
        // Persist the new schema
        await this.schemaStore.saveSchema(updatedSchema);
        
        // Deactivate the old schema if it was active
        if (this.currentActiveSchema.isActive) {
             await this.schemaStore.updateSchemaStatus(this.currentActiveSchema.version, false);
        }
        // Activate the new schema (saveSchema in InMemoryStore handles this if isActive is true)
        if (!updatedSchema.isActive) { // Ensure it's marked active if not already
            updatedSchema.isActive = true;
            await this.schemaStore.updateSchemaStatus(updatedSchema.version, true);
        }
        
        this.currentActiveSchema = updatedSchema;
        this.schemaCache.set(updatedSchema.version, updatedSchema); // Update cache
        this.logger.info(`SchemaManager: Successfully updated active schema to version ${updatedSchema.version}.`);
      } else if (updatedSchema) {
        this.logger.info('SchemaManager: Current schema is up-to-date with NNNA.');
      } else {
        this.logger.info('SchemaManager: No schema updates available from NNNA.');
      }
    } catch (error) {
      this.logger.error('SchemaManager: Error checking for schema updates.', error);
    }
  }

  /**
   * Validates a memento object against a given schema definition.
   * This is a placeholder for actual JSON schema validation.
   * @param {Record<string, any>} mementoData - The memento data to validate.
   * @param {object} schemaDefinition - The JSON schema definition object.
   * @returns {boolean} True if valid (placeholder), false otherwise.
   */
  public validateMementoAgainstSchema(mementoData: Record<string, any>, schemaDefinition: object): boolean {
    this.logger.info('SchemaManager.validateMementoAgainstSchema called (placeholder). Schema definition will be used here.');
    // TODO: Implement actual JSON schema validation (e.g., using Ajv library)
    // const ajv = new Ajv();
    // const validate = ajv.compile(schemaDefinition);
    // const valid = validate(mementoData);
    // if (!valid) this.logger.warn('Schema validation errors:', validate.errors);
    // return valid;
    if (!mementoData || !schemaDefinition) return false; // Basic check
    return true; // Placeholder: always returns true for now
  }
}