/**
 * @file Implements the RequestValidator class for the Ingestion Microservice.
 * This class is responsible for validating incoming IngestionRequest payloads.
 */

import { IngestionRequest, ContentType } from './models'; // Assuming models.ts is in the same directory

/**
 * Represents the result of a validation operation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates incoming ingestion requests.
 */
export class RequestValidator {
  // Placeholder for more sophisticated content type validation if needed
  // private validContentTypes: Set<ContentType> = new Set(["Text", "CodeChange", ...]);

  /**
   * Validates the given IngestionRequest payload.
   * @param {IngestionRequest} request - The request payload to validate.
   * @returns {ValidationResult} - An object indicating if the validation passed and a list of errors.
   */
  public validate(request: IngestionRequest): ValidationResult {
    const errors: string[] = [];

    if (!request.sourceSystem || request.sourceSystem.trim() === '') {
      errors.push("sourceSystem is required and cannot be empty.");
    }

    if (!request.contentType || (typeof request.contentType === 'string' && request.contentType.trim() === '')) {
      errors.push("contentType is required and cannot be empty.");
    }
    // else if (!this.isValidContentType(request.contentType)) { // FR3.1.2 - Placeholder for specific content type enum check
    //   errors.push(`Invalid contentType: ${request.contentType}.`);
    // }

    // contentRaw can be various types, so a simple null/undefined check is performed.
    // More specific checks might be needed based on contentType in a later stage.
    if (request.contentRaw === null || typeof request.contentRaw === 'undefined') {
      errors.push("contentRaw is required.");
    }

    if (!request.agentId || request.agentId.trim() === '') {
      // TODO: Implement derivation from authenticated context if agentId is not directly provided.
      errors.push("agentId is required and cannot be empty.");
    } else if (!this.isValidUUID(request.agentId)) {
      errors.push("agentId must be a valid UUID.");
    }

    if (request.eventTimestamp && !this.isValidISO8601(request.eventTimestamp)) {
      errors.push("Invalid eventTimestamp format. Must be ISO8601.");
    }

    if (request.tags && !Array.isArray(request.tags)) {
      errors.push("tags must be an array of strings.");
    } else if (request.tags) {
      for (const tag of request.tags) {
        if (typeof tag !== 'string' || tag.trim() === '') {
          errors.push("Each tag in the tags array must be a non-empty string.");
          break;
        }
      }
    }
    
    if (request.metadata && typeof request.metadata !== 'object') {
        errors.push("metadata must be an object.");
    }

    // TODO: Add more specific validations based on contentType if needed
    // E.g., for "CodeChange", check for commit specific metadata if expected

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Checks if a given string is a valid ISO8601 timestamp.
   * Basic check, can be enhanced with a more robust library if needed.
   * @param {string} timestamp - The timestamp string to validate.
   * @returns {boolean} - True if valid, false otherwise.
   */
  private isValidISO8601(timestamp: string): boolean {
    // Regex for basic ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ etc.)
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))$/;
    if (!iso8601Regex.test(timestamp)) {
      return false;
    }
    // Further check if it's a valid date
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  /**
   * Checks if a given string is a valid UUID.
   * @param {string} uuid - The string to validate.
   * @returns {boolean} - True if valid UUID, false otherwise.
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
  }

  // private isValidContentType(contentType: ContentType): boolean {
  //   // This would check against a predefined list or enum of valid content types
  //   // For now, allowing any string as ContentType is flexible as per current models.ts
  //   // return this.validContentTypes.has(contentType);
  //   return true; // Placeholder
  // }
}