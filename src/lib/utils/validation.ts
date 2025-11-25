/**
 * Validation utility functions for API requests
 */

export interface ValidationError {
  valid: false;
  error: string;
}

export interface ValidationSuccess<T = void> {
  valid: true;
  data?: T;
}

export type ValidationResult<T = void> = ValidationSuccess<T> | ValidationError;

/**
 * Validate required fields in an object
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[]
): ValidationResult {
  const missing = requiredFields.filter(field => !obj[field]);

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Safely parse JSON with error handling
 */
export function safeJSONParse<T>(
  value: string | null | undefined,
  fallback: T
): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify JSON with error handling
 */
export function safeJSONStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[]';
  }
}
