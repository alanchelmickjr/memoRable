import { ValidatorIngestionRequest, ValidationResult, Source } from './models';
export { ValidationResult } from './models'; // Re-export for IngestionIntegrator

/**
 * Validates ingestion requests.
 */
export class RequestValidator {
  /**
   * Validates an ingestion request.
   *
   * @param request - The ingestion request to validate.
   * @returns A ValidationResult indicating whether the request is valid and any errors.
   */
  public validate(request: ValidatorIngestionRequest): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (!request.userId || typeof request.userId !== 'string' || request.userId.trim() === '') {
      errors.push({ field: 'userId', message: 'User ID is required.' });
    }

    if (!request.source || !Object.values(Source).includes(request.source as Source)) {
      errors.push({ field: 'source', message: 'Source is required and must be a valid Source type.' });
    }

    if (!request.timestamp || typeof request.timestamp !== 'string') {
      errors.push({ field: 'timestamp', message: 'Timestamp is required and must be a valid ISO8601 string.' });
    } else {
      // Basic ISO8601 check, a more robust library could be used for full validation
      const iso8601Regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))$/;
      if (!iso8601Regex.test(request.timestamp)) {
        // Corrected error message to match the test's expectation for an invalid format
        errors.push({ field: 'timestamp', message: 'Timestamp must be a valid ISO8601 string.' });
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors,
      };
    }

    return {
      isValid: true,
    };
  }
}

// To keep the test file working with minimal changes for now,
// we can also export a standalone function instance or adapt the test.
// For TDD, let's adapt the test in the next step.
// export const validateIngestionRequest = (request: ValidatorIngestionRequest): ValidationResult => {
//   const validator = new RequestValidator();
//   return validator.validate(request);
// };