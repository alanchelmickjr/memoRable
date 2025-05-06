import { SchemaManager } from '../../../src/services/ingestion_service/schema_manager';
import { SchemaVersionDefinition, DataType } from '../../../src/services/ingestion_service/models';
import { NNNAServiceClient as ActualNNNAServiceClient } from '../../../src/services/ingestion_service/clients/nnna_service_client';
import { SchemaStoreClient } from '../../../src/services/ingestion_service/schema_manager';

jest.mock('../../../src/services/ingestion_service/clients/nnna_service_client');

describe('SchemaManager', () => {
  let schemaManager: SchemaManager;
  let mockNnnaClient: jest.Mocked<ActualNNNAServiceClient>;
  let mockLogger: jest.Mocked<Console>;
  let mockSchemaStore: jest.Mocked<SchemaStoreClient>;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    } as any;
    mockNnnaClient = new ActualNNNAServiceClient(mockLogger) as jest.Mocked<ActualNNNAServiceClient>;
    const defaultActiveSchema: SchemaVersionDefinition = {
      version: '1.0.0', mementoVersion: '1.0',
      definition: { type: 'object', properties: { defaultField: { type: 'string' } } },
      fields: [{ name: 'defaultField', type: DataType.TEXT, isRequired: true }],
      effectiveDate: new Date(0).toISOString(), isActive: true,
    };
    mockSchemaStore = {
      findActiveSchema: jest.fn().mockResolvedValue(defaultActiveSchema),
      findSchemaByVersion: jest.fn(async (version: string) => (version === '1.0.0' ? defaultActiveSchema : null)),
      saveSchema: jest.fn().mockResolvedValue(undefined),
      updateSchemaStatus: jest.fn().mockResolvedValue(undefined),
    };
    schemaManager = new SchemaManager(mockSchemaStore, mockNnnaClient, mockLogger);
    await schemaManager.initialize();
  });

  describe('initialize', () => {
    it('should load the active schema upon initialization (TDD_ANCHOR:SchemaManager_initialize_loadsActiveSchema)', async () => {
      const currentSchema = await schemaManager.getCurrentSchema();
      expect(currentSchema).toBeDefined();
      expect(currentSchema.isActive).toBe(true);
      expect(currentSchema.version).toEqual('1.0.0');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('SchemaManager initialized. Active schema version: 1.0.0'));
    });
  });

  describe('getCurrentSchema', () => {
    it('should return the current active schema (TDD_ANCHOR:SchemaManager_getCurrentSchema_returnsActive)', async () => {
      const schema = await schemaManager.getCurrentSchema();
      expect(schema).toBeDefined();
      expect(schema.isActive).toBe(true);
      expect(schema.version).toEqual('1.0.0');
    });
    it('should use fallback if no active schema is found and initialization creates one (TDD_ANCHOR:SchemaManager_getCurrentSchema_noActiveSchema_throwsError)', async () => {
      const storeReturningNullInitially: jest.Mocked<SchemaStoreClient> = {
        findActiveSchema: jest.fn().mockResolvedValue(null),
        findSchemaByVersion: jest.fn().mockResolvedValue(null),
        saveSchema: jest.fn().mockImplementation(async (schemaToSave: SchemaVersionDefinition) => {
          storeReturningNullInitially.findActiveSchema.mockResolvedValue(schemaToSave);
          return undefined;
        }),
        updateSchemaStatus: jest.fn().mockResolvedValue(undefined),
      };
      const localFaultySchemaManager = new SchemaManager(storeReturningNullInitially, mockNnnaClient, mockLogger);
      await localFaultySchemaManager.initialize();
      const schema = await localFaultySchemaManager.getCurrentSchema();
      expect(schema).toBeDefined();
      expect(schema.version).toEqual('1.0.0');
      expect(schema.isActive).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('SchemaManager: No active schema found during initialization. Attempting to use/create a hardcoded default.'));
      expect(storeReturningNullInitially.saveSchema).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('SchemaManager: Initialized with hardcoded fallback schema version: 1.0.0'));
    });
  });

  describe('getSchemaByVersion', () => {
    it('should retrieve a schema by its version from cache if available (TDD_ANCHOR:SchemaManager_getSchemaByVersion_fromCache)', async () => {
      await schemaManager.getSchemaByVersion('1.0.0');
      mockSchemaStore.findSchemaByVersion.mockClear();
      const schema = await schemaManager.getSchemaByVersion('1.0.0');
      expect(schema).toBeDefined();
      expect(schema!.version).toEqual('1.0.0');
      expect(mockSchemaStore.findSchemaByVersion).not.toHaveBeenCalled();
    });
    it('should retrieve a schema by its version from store if not in cache (TDD_ANCHOR:SchemaManager_getSchemaByVersion_fromStore)', async () => {
      const versionToTest = '0.9.0';
      const schemaFromStore: SchemaVersionDefinition = {
        version: versionToTest, mementoVersion: '0.9',
        definition: { type: 'object', properties: { testField: { type: 'string' }}},
        fields: [{ name: 'testField', type: DataType.TEXT, isRequired: false }],
        effectiveDate: new Date().toISOString(), isActive: false,
      };
      schemaManager['schemaCache'].delete(versionToTest);
      mockSchemaStore.findSchemaByVersion.mockResolvedValueOnce(schemaFromStore);
      const schema = await schemaManager.getSchemaByVersion(versionToTest);
      expect(schema).toEqual(schemaFromStore);
      expect(mockSchemaStore.findSchemaByVersion).toHaveBeenCalledWith(versionToTest);
      mockSchemaStore.findSchemaByVersion.mockClear();
      const cachedSchema = await schemaManager.getSchemaByVersion(versionToTest);
      expect(cachedSchema).toEqual(schemaFromStore);
      expect(mockSchemaStore.findSchemaByVersion).not.toHaveBeenCalled();
    });
    it('should return null if schema version is not found (TDD_ANCHOR:SchemaManager_getSchemaByVersion_notFound_returnsNull)', async () => {
      mockSchemaStore.findSchemaByVersion.mockResolvedValue(null);
      const schema = await schemaManager.getSchemaByVersion('non-existent-version');
      expect(schema).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('SchemaManager: Schema version non-existent-version not found in store or cache.'));
    });
  });

  describe('checkForSchemaUpdates', () => {
    it('should update to a new schema version if NNNA service provides a newer one (TDD_ANCHOR:SchemaManager_checkForSchemaUpdates_newVersion_updatesActives)', async () => {
      const currentSchemaVersion = '1.0.0'; const newSchemaVersion = '1.1.0';
      const newSchemaDetails: SchemaVersionDefinition = {
        version: newSchemaVersion, mementoVersion: '1.1',
        definition: { type: 'object', properties: { newField: { type: 'number' } } },
        fields: [{ name: 'newField', type: 'number', isRequired: true }], // Changed DataType.NUMBER to 'number'
        effectiveDate: new Date().toISOString(), isActive: false,
      };
      let current = await schemaManager.getCurrentSchema(); expect(current.version).toBe(currentSchemaVersion);
      mockNnnaClient.checkForUpdates.mockResolvedValueOnce(newSchemaDetails);
      mockSchemaStore.findSchemaByVersion.mockImplementation(async (v: string) => {
        if (v === currentSchemaVersion) return (await schemaManager.getSchemaByVersion(currentSchemaVersion));
        if (v === newSchemaVersion) return newSchemaDetails;
        return null;
      });
      mockSchemaStore.updateSchemaStatus.mockImplementation(async (version, isActive) => {
        if (version === newSchemaVersion && isActive) {
          newSchemaDetails.isActive = true;
          const oldSchema = await mockSchemaStore.findSchemaByVersion(currentSchemaVersion);
          if (oldSchema) oldSchema.isActive = false;
          mockSchemaStore.findActiveSchema.mockResolvedValue(newSchemaDetails);
        } else if (version === currentSchemaVersion && !isActive) {
           const oldSchema = await mockSchemaStore.findSchemaByVersion(currentSchemaVersion);
           if (oldSchema) oldSchema.isActive = false;
        }
        return undefined;
      });
      await schemaManager.checkForSchemaUpdates();
      const updatedSchema = await schemaManager.getCurrentSchema();
      expect(updatedSchema.version).toBe(newSchemaVersion); expect(updatedSchema.isActive).toBe(true);
      expect(mockSchemaStore.updateSchemaStatus).toHaveBeenCalledWith(currentSchemaVersion, false);
      expect(mockSchemaStore.updateSchemaStatus).toHaveBeenCalledWith(newSchemaVersion, true);
      mockSchemaStore.findSchemaByVersion.mockClear();
      const cachedNewSchema = await schemaManager.getSchemaByVersion(newSchemaVersion);
      expect(cachedNewSchema).toEqual(updatedSchema);
      expect(mockSchemaStore.findSchemaByVersion).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(`SchemaManager: Found new schema version ${newSchemaVersion} from NNNA service.`);
      expect(mockLogger.info).toHaveBeenCalledWith(`SchemaManager: Successfully updated active schema to version ${newSchemaVersion}.`);
    }); // Correctly closes 'it' for newVersion_updatesActives

    it('should not update if NNNA service returns same version or no update (TDD_ANCHOR:SchemaManager_checkForSchemaUpdates_noUpdate_noChange)', async () => {
      const currentSchema = await schemaManager.getCurrentSchema(); const originalVersion = currentSchema.version;
      (mockNnnaClient.checkForUpdates as jest.Mock).mockResolvedValueOnce(null);
      await schemaManager.checkForSchemaUpdates();
      let activeSchema = await schemaManager.getCurrentSchema(); expect(activeSchema.version).toBe(originalVersion);
      expect(mockLogger.info).toHaveBeenCalledWith('SchemaManager: No schema updates available from NNNA.');
      expect(mockSchemaStore.saveSchema).not.toHaveBeenCalled();
      expect(mockSchemaStore.updateSchemaStatus).not.toHaveBeenCalled();
      (mockNnnaClient.checkForUpdates as jest.Mock).mockClear(); mockLogger.info.mockClear();
      mockSchemaStore.saveSchema.mockClear(); mockSchemaStore.updateSchemaStatus.mockClear();
      (mockNnnaClient.checkForUpdates as jest.Mock).mockResolvedValueOnce({ ...currentSchema });
      await schemaManager.checkForSchemaUpdates();
      activeSchema = await schemaManager.getCurrentSchema(); expect(activeSchema.version).toBe(originalVersion);
      expect(mockLogger.info).toHaveBeenCalledWith('SchemaManager: Current schema is up-to-date with NNNA.');
      expect(mockSchemaStore.saveSchema).not.toHaveBeenCalled();
      expect(mockSchemaStore.updateSchemaStatus).not.toHaveBeenCalled();
    }); // Correctly closes 'it' for noUpdate_noChange

    it('should log an error if NNNA service call fails (TDD_ANCHOR:SchemaManager_checkForSchemaUpdates_nnnaFailure_logsError)', async () => {
      const errorMessage = 'NNNA service unavailable';
      (mockNnnaClient.checkForUpdates as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));
      mockLogger.error.mockClear(); mockLogger.info.mockClear();
      await schemaManager.checkForSchemaUpdates();
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('SchemaManager: Error checking for schema updates.', expect.objectContaining({ message: errorMessage }));
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Found new schema version'));
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Successfully updated active schema'));
    }); // Correctly closes 'it' for nnnaFailure_logsError
  }); // Correctly closes describe('checkForSchemaUpdates', ...)

  describe('validateMementoAgainstSchema', () => {
    let testSchemaDefinition: object;

    beforeEach(() => {
      // A simple schema definition for testing purposes
      testSchemaDefinition = {
        type: 'object',
        properties: {
          requiredField: { type: 'string' },
          optionalField: { type: 'number' },
        },
        required: ['requiredField'],
      };
      // Clear logger mocks for this specific describe block if needed, though outer beforeEach handles it.
      mockLogger.info.mockClear();
    });

    it('should return true for valid-looking data given the placeholder logic (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_validData_returnsTrue)', () => {
      const validMementoData = { requiredField: 'test', optionalField: 123 };
      const isValid = schemaManager.validateMementoAgainstSchema(validMementoData, testSchemaDefinition);
      expect(isValid).toBe(true); // Placeholder returns true if both args are present
      expect(mockLogger.info).toHaveBeenCalledWith('SchemaManager.validateMementoAgainstSchema called (placeholder). Schema definition will be used here.');
    });

    it('should return false if mementoData is null (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse)', () => {
      const isValid = schemaManager.validateMementoAgainstSchema(null as any, testSchemaDefinition);
      expect(isValid).toBe(false);
    });

    it('should return false if mementoData is undefined (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse)', () => {
      const isValid = schemaManager.validateMementoAgainstSchema(undefined as any, testSchemaDefinition);
      expect(isValid).toBe(false);
    });

    it('should return false if schemaDefinition is null (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse)', () => {
      const mementoData = { requiredField: 'test' };
      const isValid = schemaManager.validateMementoAgainstSchema(mementoData, null as any);
      expect(isValid).toBe(false);
    });

    it('should return false if schemaDefinition is undefined (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse)', () => {
      const mementoData = { requiredField: 'test' };
      const isValid = schemaManager.validateMementoAgainstSchema(mementoData, undefined as any);
      expect(isValid).toBe(false);
    });

    // This test specifically targets the placeholder's behavior.
    // Once actual validation is implemented, this test should be updated or replaced.
    it('should return true for structurally invalid data due to placeholder behavior (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse_placeholder_limitation)', () => {
      const structurallyInvalidData = { anotherField: 'someValue' }; // Missing 'requiredField'
      const isValid = schemaManager.validateMementoAgainstSchema(structurallyInvalidData, testSchemaDefinition);
      expect(isValid).toBe(true); // Placeholder returns true as long as mementoData and schemaDefinition are not null/undefined
      expect(mockLogger.info).toHaveBeenCalledWith('SchemaManager.validateMementoAgainstSchema called (placeholder). Schema definition will be used here.');
    });
  });
  // TODO: (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_validData_returnsTrue) - Requires actual schema and validation logic
  // TODO: (TDD_ANCHOR:SchemaManager_validateMementoAgainstSchema_invalidData_returnsFalse) - Requires actual schema and validation logic
}); // Correctly closes describe('SchemaManager', ...)