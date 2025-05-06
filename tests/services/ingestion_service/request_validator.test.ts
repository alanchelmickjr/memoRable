import { RequestValidator } from '../../../src/services/ingestion_service/request_validator';
import { ValidatorIngestionRequest, ValidationResult, DataType, Source } from '../../../src/services/ingestion_service/models';

describe('RequestValidator', () => {
  let requestValidator: RequestValidator;

  beforeEach(() => {
    requestValidator = new RequestValidator();
  });

  describe('validate', () => {
    it('should return a success result for a valid request (TDD_ANCHOR:validateIngestionRequest_validRequest_returnsSuccess)', () => {
      const validRequest: ValidatorIngestionRequest = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        timestamp: new Date().toISOString(),
        dataType: DataType.TEXT,
        data: {
          content: 'This is a valid text input.',
        },
        metadata: {
          sourceApplication: 'test-app',
        },
      };

      const expectedResult: ValidationResult = {
        isValid: true,
      };

      const actualResult = requestValidator.validate(validRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if userId is missing (TDD_ANCHOR:validateIngestionRequest_missingUserId_returnsError)', () => {
      const invalidRequest: any = { // Using 'any' to simulate a malformed request
        source: Source.MANUAL_INPUT,
        timestamp: new Date().toISOString(),
        dataType: DataType.TEXT,
        data: {
          content: 'This is a valid text input.',
        },
        metadata: {
          sourceApplication: 'test-app',
        },
      };

      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'userId', message: 'User ID is required.' }],
      };

      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if source is missing (TDD_ANCHOR:validateIngestionRequest_missingSource_returnsError)', () => {
      const invalidRequest: any = {
        userId: 'user-123',
        timestamp: new Date().toISOString(),
        dataType: DataType.TEXT,
        data: {
          content: 'This is a valid text input.',
        },
        metadata: {
          sourceApplication: 'test-app',
        },
      };

      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'source', message: 'Source is required and must be a valid Source type.' }],
      };

      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if timestamp is missing (TDD_ANCHOR:validateIngestionRequest_missingTimestamp_returnsError)', () => {
      const invalidRequest: any = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        dataType: DataType.TEXT,
        data: {
          content: 'This is a valid text input.',
        },
        metadata: {
          sourceApplication: 'test-app',
        },
      };

      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'timestamp', message: 'Timestamp is required and must be a valid ISO8601 string.' }],
      };

      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if timestamp is not a valid ISO8601 string (TDD_ANCHOR:validateIngestionRequest_invalidTimestamp_returnsError)', () => {
      const invalidRequest: ValidatorIngestionRequest = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        timestamp: '2023-13-01T00:00:00Z', // Invalid month
        dataType: DataType.TEXT,
        data: {
          content: 'This is a valid text input.',
        },
        metadata: {
          sourceApplication: 'test-app',
        },
      };

      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'timestamp', message: 'Timestamp must be a valid ISO8601 string.' }],
      };

      const actualResult = requestValidator.validate(invalidRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if dataType is missing (TDD_ANCHOR:validateIngestionRequest_missingDataType_returnsError)', () => {
      const invalidRequest: any = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        timestamp: new Date().toISOString(),
        // dataType missing
        data: { content: 'Some data' },
      };
      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'dataType', message: 'Data type is required and must be a valid DataType.' }],
      };
      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if dataType is invalid (TDD_ANCHOR:validateIngestionRequest_invalidDataType_returnsError)', () => {
      const invalidRequest: any = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        timestamp: new Date().toISOString(),
        dataType: 'INVALID_TYPE', // Not a valid DataType enum member
        data: { content: 'Some data' },
      };
      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'dataType', message: 'Data type is required and must be a valid DataType.' }],
      };
      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });

    it('should return an error result if data is missing (TDD_ANCHOR:validateIngestionRequest_missingData_returnsError)', () => {
      const invalidRequest: any = {
        userId: 'user-123',
        source: Source.MANUAL_INPUT,
        timestamp: new Date().toISOString(),
        dataType: DataType.TEXT,
        // data missing
      };
      const expectedResult: ValidationResult = {
        isValid: false,
        errors: [{ field: 'data', message: 'Data is required.' }],
      };
      const actualResult = requestValidator.validate(invalidRequest as ValidatorIngestionRequest);
      expect(actualResult).toEqual(expectedResult);
    });
  });
});