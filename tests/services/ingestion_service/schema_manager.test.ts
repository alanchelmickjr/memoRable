import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';
import { IngestionData, Memento, Source } from '../../../src/services/ingestion_service/models';

describe('SchemaManager', () => {
  let schemaManager: SchemaManager;

  beforeEach(() => {
    schemaManager = new SchemaManager();
  });

  describe('validateDataAgainstSchema', () => {
    it('should return true for valid IngestionData (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_validData_returnsTrue_IngestionData)', () => {
      const validIngestionData: Partial<IngestionData> = {
        userId: 'user-123',
        source: Source.Transcript,
        timestamp: new Date().toISOString(),
        content: { text: 'This is a test transcript.' },
        metadata: { language: 'en' },
      };
      expect(schemaManager.validateDataAgainstSchema(validIngestionData)).toBe(true);
    });

    it('should return false for IngestionData missing userId (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingUserId)', () => {
      const invalidData: Partial<IngestionData> = {
        source: Source.Transcript,
        timestamp: new Date().toISOString(),
        content: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for IngestionData missing source (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingSource)', () => {
      const invalidData: Partial<IngestionData> = {
        userId: 'user-123',
        timestamp: new Date().toISOString(),
        content: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for IngestionData missing timestamp (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingTimestamp)', () => {
      const invalidData: Partial<IngestionData> = {
        userId: 'user-123',
        source: Source.Transcript,
        content: { text: 'This is a test transcript.' },
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for IngestionData missing content (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_IngestionData_missingContent)', () => {
      const invalidData: Partial<IngestionData> = {
        userId: 'user-123',
        source: Source.Transcript,
        timestamp: new Date().toISOString(),
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return true for valid Memento (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_validData_returnsTrue_Memento)', () => {
      const validMemento: Partial<Memento> = {
        mementoId: 'memento-123',
        userId: 'user-123',
        source: Source.Transcript,
        originalTimestamp: new Date().toISOString(),
        processedTimestamp: new Date().toISOString(),
        content: { text: 'Original content' },
        summary: 'This is a summary.',
        embedding: [0.1, 0.2],
        entities: [{ name: 'test', type: 'EVENT' }],
        emotions: [{ type: 'joy', score: 0.9 }],
        context: { app: 'testApp' },
        relatedMementos: ['memento-456'],
      };
      expect(schemaManager.validateDataAgainstSchema(validMemento)).toBe(true);
    });

    it('should return false for Memento missing mementoId (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingMementoId)', () => {
      const invalidData: Partial<Memento> = {
        userId: 'user-123',
        source: Source.Transcript,
        originalTimestamp: new Date().toISOString(),
        processedTimestamp: new Date().toISOString(),
        content: { text: 'Original content' },
        summary: 'This is a summary.',
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for Memento missing userId (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingUserId)', () => {
      const invalidData: Partial<Memento> = {
        mementoId: 'memento-123',
        source: Source.Transcript,
        originalTimestamp: new Date().toISOString(),
        processedTimestamp: new Date().toISOString(),
        content: { text: 'Original content' },
        summary: 'This is a summary.',
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for Memento missing originalTimestamp (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingOriginalTimestamp)', () => {
        const invalidData: Partial<Memento> = {
            mementoId: 'memento-123',
            userId: 'user-123',
            source: Source.Transcript,
            processedTimestamp: new Date().toISOString(),
            content: { text: 'Original content' },
            summary: 'This is a summary.',
        };
        expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for Memento missing processedTimestamp (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingProcessedTimestamp)', () => {
        const invalidData: Partial<Memento> = {
            mementoId: 'memento-123',
            userId: 'user-123',
            source: Source.Transcript,
            originalTimestamp: new Date().toISOString(),
            content: { text: 'Original content' },
            summary: 'This is a summary.',
        };
        expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });


    it('should return false for Memento missing content (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingContent)', () => {
      const invalidData: Partial<Memento> = {
        mementoId: 'memento-123',
        userId: 'user-123',
        source: Source.Transcript,
        originalTimestamp: new Date().toISOString(),
        processedTimestamp: new Date().toISOString(),
        summary: 'This is a summary.',
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for Memento missing summary (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_invalidData_returnsFalse_Memento_missingSummary)', () => {
      const invalidData: Partial<Memento> = {
        mementoId: 'memento-123',
        userId: 'user-123',
        source: Source.Transcript,
        originalTimestamp: new Date().toISOString(),
        processedTimestamp: new Date().toISOString(),
        content: { text: 'Original content' },
      };
      expect(schemaManager.validateDataAgainstSchema(invalidData)).toBe(false);
    });

    it('should return false for data that is neither IngestionData nor Memento (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_neitherType_returnsFalse)', () => {
      const neitherData = { someOtherField: 'value' };
      expect(schemaManager.validateDataAgainstSchema(neitherData)).toBe(false);
    });

    it('should return false for empty data object (TDD_ANCHOR:SchemaManager_validateDataAgainstSchema_emptyData_returnsFalse)', () => {
      const emptyData = {};
      expect(schemaManager.validateDataAgainstSchema(emptyData)).toBe(false);
    });
  });
});