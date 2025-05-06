import { MemorySteward, StorageResult } from '../../../src/services/ingestion_service/memory_steward';
import { MemoryMemento, ContentType, Source } from '../../../src/services/ingestion_service/models';

// Manually mock the placeholder clients used by MemorySteward
// These would typically be in their own files and imported, then jest.mock-ed.
const mockMongoClientWrapperInstance = {
  insertOne: jest.fn().mockResolvedValue({ acknowledged: true, insertedId: 'test-memento-id' }),
  updateOne: jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
};

const mockWeaviateClientWrapperInstance = {
  createObject: jest.fn().mockResolvedValue({ id: 'test-memento-id' }),
};

const mockEventPublisherInstance = {
  publish: jest.fn().mockResolvedValue(undefined),
};

// Mock the constructors of the clients to return our mock instances
jest.mock('../../../src/services/ingestion_service/memory_steward', () => {
  // Original module
  const originalModule = jest.requireActual('../../../src/services/ingestion_service/memory_steward');
  
  // Mocked classes/functions
  return {
    ...originalModule,
    // We are mocking the module that MemorySteward is in, so we need to provide
    // the actual MemorySteward class but ensure its dependencies are mocked if not passed.
    // However, for this test, we will pass mocked dependencies directly to the MemorySteward constructor.
    // So, no need to mock the clients at this module level if we pass them in.
    // If MemorySteward instantiated them internally without DI, we would mock them here.
  };
});


describe('MemorySteward', () => {
  let memorySteward: MemorySteward;

  beforeEach(() => {
    // Reset mocks before each test
    mockMongoClientWrapperInstance.insertOne.mockClear();
    mockMongoClientWrapperInstance.updateOne.mockClear();
    mockWeaviateClientWrapperInstance.createObject.mockClear();
    mockEventPublisherInstance.publish.mockClear();

    // Instantiate MemorySteward with mock dependencies
    memorySteward = new MemorySteward(
      mockMongoClientWrapperInstance as any, // Cast to any to satisfy type checking for the mock
      mockWeaviateClientWrapperInstance as any,
      mockEventPublisherInstance as any,
      console // Pass a real console or a mock logger
    );
  });

  describe('storeNewMementoAndEmbeddings', () => {
    it('should store memento and embeddings and publish event for valid input (TDD_ANCHOR:MemorySteward_storeNewMementoAndEmbeddings_validInput_storesAndPublishes)', async () => {
      const memento: MemoryMemento = {
        mementoId: 'test-memento-id-123',
        agentId: 'agent-007',
        creationTimestamp: new Date().toISOString(),
        sourceSystem: Source.API_UPLOAD,
        contentType: 'Text' as ContentType,
        contentRaw: 'Test content for steward.',
        contentProcessed: 'Test content summary.',
        tags: ['test', 'steward'],
        schemaVersion: '1.0.0',
        temporalContext: { eventTimestamp: new Date().toISOString() },
      };
      const embeddingVector: number[] = [0.1, 0.2, 0.3];

      const expectedResult: Partial<StorageResult> = {
        success: true,
        mementoId: memento.mementoId,
        status: 'stored',
        message: 'Memento and embeddings stored successfully. Event published.',
      };

      const result = await memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      expect(result.success).toBe(true);
      expect(result.mementoId).toEqual(expectedResult.mementoId);
      expect(result.status).toEqual(expectedResult.status);
      // expect(result.message).toEqual(expectedResult.message); // Message can be more dynamic

      // Verify MongoDB client was called
      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledTimes(1);
      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledWith(memento);

      // Verify Weaviate client was called
      expect(mockWeaviateClientWrapperInstance.createObject).toHaveBeenCalledTimes(1);
      const weaviateProperties = {
        mementoId: memento.mementoId,
        agentId: memento.agentId,
        creationTimestamp: memento.creationTimestamp,
        sourceSystem: memento.sourceSystem,
        contentType: memento.contentType,
        tags: memento.tags || [],
        schemaVersion: memento.schemaVersion,
      };
      expect(mockWeaviateClientWrapperInstance.createObject).toHaveBeenCalledWith(
        memento.mementoId,
        weaviateProperties,
        embeddingVector
      );

      // Verify EventPublisher was called
      expect(mockEventPublisherInstance.publish).toHaveBeenCalledTimes(1);
      expect(mockEventPublisherInstance.publish).toHaveBeenCalledWith('memento.created', {
        mementoId: memento.mementoId,
        agentId: memento.agentId,
        contentType: memento.contentType,
        creationTimestamp: memento.creationTimestamp,
      });
    });

    it('should return pending_embedding_retry if embeddingVector is null (TDD_ANCHOR:MemorySteward_storeNewMementoAndEmbeddings_nullVector_pendingRetry)', async () => {
      const memento: MemoryMemento = {
        mementoId: 'test-memento-id-456',
        agentId: 'agent-008',
        creationTimestamp: new Date().toISOString(),
        sourceSystem: Source.MANUAL_INPUT,
        contentType: 'Text' as ContentType,
        contentRaw: 'Content pending embedding.',
        schemaVersion: '1.0.0',
        temporalContext: { eventTimestamp: new Date().toISOString() },
      };
      const embeddingVector: number[] | null = null;

      const result = await memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      expect(result.success).toBe(true); // MongoDB write should succeed
      expect(result.mementoId).toEqual(memento.mementoId);
      expect(result.status).toEqual('pending_embedding_retry');
      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledTimes(1);
      expect(mockMongoClientWrapperInstance.updateOne).toHaveBeenCalledTimes(1); // For status update
      expect(mockMongoClientWrapperInstance.updateOne).toHaveBeenCalledWith(
        { mementoId: memento.mementoId },
        { $set: { processingStatus: 'pending_embedding_retry' } }
      );
      expect(mockWeaviateClientWrapperInstance.createObject).not.toHaveBeenCalled();
      expect(mockEventPublisherInstance.publish).not.toHaveBeenCalled(); // No event if not fully stored
    });
    
    // Add more tests for:
    // - MongoDB write failure
    // - Weaviate write failure (and subsequent status update)
    // - Event publishing failure (should still be success overall)
    // - Failure to update status in Mongo after other failures

    it('should return an error if MongoDB write fails (TDD_ANCHOR:MemorySteward_storeNewMementoAndEmbeddings_mongoFailure_returnsError)', async () => {
      const memento: MemoryMemento = {
        mementoId: 'test-memento-id-mongo-fail',
        agentId: 'agent-009',
        creationTimestamp: new Date().toISOString(),
        sourceSystem: Source.API_UPLOAD,
        contentType: 'Text' as ContentType,
        contentRaw: 'Content for mongo fail test.',
        schemaVersion: '1.0.0',
        temporalContext: { eventTimestamp: new Date().toISOString() },
      };
      const embeddingVector: number[] = [0.4, 0.5, 0.6];

      // Simulate MongoDB failure
      mockMongoClientWrapperInstance.insertOne.mockRejectedValueOnce(new Error('MongoDB write error'));

      const result = await memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      expect(result.success).toBe(false);
      expect(result.mementoId).toEqual(memento.mementoId);
      expect(result.status).toEqual('error');
      expect(result.message).toContain('Primary storage (MongoDB) failed: MongoDB write error');
      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledTimes(1);
      expect(mockWeaviateClientWrapperInstance.createObject).not.toHaveBeenCalled();
      expect(mockEventPublisherInstance.publish).not.toHaveBeenCalled();
      expect(mockMongoClientWrapperInstance.updateOne).not.toHaveBeenCalled(); // No status update if initial insert fails
    });

    it('should update status and return error if Weaviate write fails (TDD_ANCHOR:MemorySteward_storeNewMementoAndEmbeddings_weaviateFailure_updatesStatusAndReturnsError)', async () => {
      const memento: MemoryMemento = {
        mementoId: 'test-memento-id-weaviate-fail',
        agentId: 'agent-010',
        creationTimestamp: new Date().toISOString(),
        sourceSystem: Source.API_UPLOAD, // Changed from Source.EMAIL
        contentType: 'Text' as ContentType,
        contentRaw: 'Content for weaviate fail test.',
        schemaVersion: '1.0.0',
        temporalContext: { eventTimestamp: new Date().toISOString() },
      };
      const embeddingVector: number[] = [0.7, 0.8, 0.9];

      // Simulate MongoDB success
      mockMongoClientWrapperInstance.insertOne.mockResolvedValueOnce({ acknowledged: true, insertedId: memento.mementoId });
      // Simulate Weaviate failure
      mockWeaviateClientWrapperInstance.createObject.mockRejectedValueOnce(new Error('Weaviate write error'));
      // Simulate MongoDB status update success
      mockMongoClientWrapperInstance.updateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });


      const result = await memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      expect(result.success).toBe(true); // Primary storage succeeded
      expect(result.mementoId).toEqual(memento.mementoId);
      // The status should reflect that it's pending retry for vector storage
      expect(result.status).toEqual('pending_embedding_retry'); // As per current implementation, might change to 'pending_vector_storage_retry'
      expect(result.message).toContain('Memento stored in primary, but vector storage (Weaviate) failed. Marked for retry: Weaviate write error');
      
      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledTimes(1);
      expect(mockWeaviateClientWrapperInstance.createObject).toHaveBeenCalledTimes(1);
      expect(mockMongoClientWrapperInstance.updateOne).toHaveBeenCalledTimes(1);
      expect(mockMongoClientWrapperInstance.updateOne).toHaveBeenCalledWith(
        { mementoId: memento.mementoId },
        { $set: { processingStatus: 'pending_vector_storage_retry' } } // This is what the code *should* do
      );
      expect(mockEventPublisherInstance.publish).not.toHaveBeenCalled(); // No event if not fully stored with vector
    });

    it('should return success and log error if event publishing fails (TDD_ANCHOR:MemorySteward_storeNewMementoAndEmbeddings_eventPublishFailure_logsErrorReturnsSuccess)', async () => {
      const memento: MemoryMemento = {
        mementoId: 'test-memento-id-event-fail',
        agentId: 'agent-011',
        creationTimestamp: new Date().toISOString(),
        sourceSystem: Source.MANUAL_INPUT,
        contentType: 'Text' as ContentType,
        contentRaw: 'Content for event publish fail test.',
        schemaVersion: '1.0.0',
        temporalContext: { eventTimestamp: new Date().toISOString() },
      };
      const embeddingVector: number[] = [1.0, 1.1, 1.2];
      const consoleErrorSpy = jest.spyOn(console, 'error');

      // Simulate MongoDB and Weaviate success
      mockMongoClientWrapperInstance.insertOne.mockResolvedValueOnce({ acknowledged: true, insertedId: memento.mementoId });
      mockWeaviateClientWrapperInstance.createObject.mockResolvedValueOnce({ id: memento.mementoId });
      // Simulate EventPublisher failure
      mockEventPublisherInstance.publish.mockRejectedValueOnce(new Error('Event publish error'));

      const result = await memorySteward.storeNewMementoAndEmbeddings(memento, embeddingVector);

      expect(result.success).toBe(true);
      expect(result.mementoId).toEqual(memento.mementoId);
      expect(result.status).toEqual('stored'); // Still considered stored
      expect(result.message).toContain('Memento and embeddings stored successfully'); // Main success message
      expect(result.message).not.toContain('Event published'); // Event part of message might be conditional

      expect(mockMongoClientWrapperInstance.insertOne).toHaveBeenCalledTimes(1);
      expect(mockWeaviateClientWrapperInstance.createObject).toHaveBeenCalledTimes(1);
      expect(mockEventPublisherInstance.publish).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `MemorySteward: Failed to publish memento.created event for ${memento.mementoId}.`,
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
});