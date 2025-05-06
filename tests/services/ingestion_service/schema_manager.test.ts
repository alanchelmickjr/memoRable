import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';
import { MemoryMemento, Source, ContentType, SchemaVersionDefinition } from '../../../src/services/ingestion_service/models';

describe('SchemaManager', () => {
  let schemaManager: SchemaManager;
  let currentSchemaDef: SchemaVersionDefinition['definition'];

  beforeEach(async () => {
    schemaManager = new SchemaManager();
    await schemaManager.initialize();
    currentSchemaDef = (await schemaManager.getCurrentSchema()).definition;
  });

  describe('validateMementoAgainstSchema', () => {
    // This test is now for MemoryMemento
    it('should return true for valid MemoryMemento (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_validData_returnsTrue_IngestionData)', async () => {
      const validMemento: Partial<MemoryMemento> = {
        mementoId: 'memento-valid-123',
        agentId: 'agent-test-123', // Changed from userId to agentId
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD, // Corrected enum
        contentType: "Text" as ContentType, // Corrected type
        contentRaw: { text: 'This is a test transcript.' },
        // metadata: { language: 'en' }, // Not a direct field of MemoryMemento, could be in contentRaw or context
      };
      expect(schemaManager.validateMementoAgainstSchema(validMemento as Record<string, any>, currentSchemaDef)).toBe(true);
    });

    it('should return false for MemoryMemento missing agentId (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingUserId)', async () => {
      const invalidData: Partial<MemoryMemento> = {
        mementoId: 'memento-invalid-agentid',
        // agentId missing
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD,
        contentType: "Text" as ContentType,
        contentRaw: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return false for MemoryMemento missing sourceSystem (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingSource)', async () => {
      const invalidData: Partial<MemoryMemento> = {
        mementoId: 'memento-invalid-sourcesys',
        agentId: 'user-123',
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        // sourceSystem missing
        contentType: "Text" as ContentType,
        contentRaw: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return false for MemoryMemento missing creationTimestamp (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingTimestamp)', async () => {
      const invalidData: Partial<MemoryMemento> = {
        mementoId: 'memento-invalid-timestamp',
        agentId: 'user-123',
        // creationTimestamp missing
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD,
        contentType: "Text" as ContentType,
        contentRaw: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return false for MemoryMemento missing contentRaw (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingContent)', async () => {
      const invalidData: Partial<MemoryMemento> = {
        mementoId: 'memento-invalid-content',
        agentId: 'user-123',
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD,
        contentType: "Text" as ContentType,
        // contentRaw missing
      };
      expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return true for valid full MemoryMemento (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_validData_returnsTrue_Memento)', async () => {
      const validMemento: MemoryMemento = { // Using full type for clarity
        mementoId: 'memento-full-123',
        agentId: 'user-123',
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD, // Corrected enum
        contentType: "AudioTranscript" as ContentType, // Corrected type
        contentRaw: { transcript: 'Original content' },
        contentProcessed: "Original content summary",
        tags: ["test", "audio"],
        temporalContext: { eventTimestamp: new Date().toISOString() },
        // Other optional fields can be added here if needed for a "full" valid test
      };
      expect(schemaManager.validateMementoAgainstSchema(validMemento as Record<string, any>, currentSchemaDef)).toBe(true);
    });

    it('should return false for MemoryMemento missing mementoId (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingMementoId)', async () => {
      const invalidData: Partial<MemoryMemento> = {
        // mementoId missing
        agentId: 'user-123',
        creationTimestamp: new Date().toISOString(),
        schemaVersion: '1.0.0',
        sourceSystem: Source.API_UPLOAD,
        contentType: "Text" as ContentType,
        contentRaw: { text: 'Original content' },
      };
      expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    // Note: The original tests for Memento missing userId, originalTimestamp, processedTimestamp, content, summary
    // map to agentId, creationTimestamp, (no direct equivalent for processedTimestamp in MemoryMemento core required fields),
    // contentRaw, (no direct equivalent for summary in MemoryMemento core required fields) respectively.
    // The SchemaManager's default schema requires:
    // ['mementoId', 'agentId', 'creationTimestamp', 'schemaVersion', 'sourceSystem', 'contentType', 'contentRaw']

    it('should return false for MemoryMemento missing schemaVersion (NEW TEST)', async () => {
        const invalidData: Partial<MemoryMemento> = {
            mementoId: 'memento-invalid-schemaver',
            agentId: 'user-123',
            creationTimestamp: new Date().toISOString(),
            // schemaVersion missing
            sourceSystem: Source.API_UPLOAD,
            contentType: "Text" as ContentType,
            contentRaw: { text: 'Original content' },
        };
        expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return false for MemoryMemento missing contentType (NEW TEST)', async () => {
        const invalidData: Partial<MemoryMemento> = {
            mementoId: 'memento-invalid-contenttype',
            agentId: 'user-123',
            creationTimestamp: new Date().toISOString(),
            schemaVersion: '1.0.0',
            sourceSystem: Source.API_UPLOAD,
            // contentType missing
            contentRaw: { text: 'Original content' },
        };
        expect(schemaManager.validateMementoAgainstSchema(invalidData as Record<string, any>, currentSchemaDef)).toBe(false);
    });


    // The original 'neitherType' and 'emptyData' tests are still relevant.
    // However, validateMementoAgainstSchema expects a schema definition.
    // For these, we can test if passing them to validateMementoAgainstSchema (which expects memento-like structure) returns false.
    it('should return false for data that is not a valid memento structure (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_neitherType_returnsFalse)', async () => {
      const neitherData = { someOtherField: 'value' };
      // This test might pass because the placeholder validation is lenient.
      // A real schema validator would catch this.
      expect(schemaManager.validateMementoAgainstSchema(neitherData as Record<string, any>, currentSchemaDef)).toBe(false);
    });

    it('should return false for empty data object (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_emptyData_returnsFalse)', async () => {
      const emptyData = {};
      // This test will likely fail with the placeholder, but pass with a real validator.
      expect(schemaManager.validateMementoAgainstSchema(emptyData as Record<string, any>, currentSchemaDef)).toBe(false);
    });
  });
});