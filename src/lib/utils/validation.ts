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
  const missing = requiredFields.filter(field => obj[field] === undefined || obj[field] === null || obj[field] === '');

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
 * Validate a string field does not exceed maxLength.
 * Returns valid if value is undefined or null (optional field).
 */
export function validateMaxLength(value: unknown, maxLength: number, fieldName: string): ValidationResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== 'string') return { valid: false, error: `${fieldName} must be a string` };
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} must be ${maxLength} characters or fewer` };
  }
  return { valid: true };
}

/**
 * Validate a numeric field is within [min, max].
 * Returns valid if value is undefined or null (optional field).
 */
export function validateNumberRange(value: unknown, min: number, max: number, fieldName: string): ValidationResult {
  if (value === undefined || value === null) return { valid: true };
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || isNaN(num as number)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if ((num as number) < min || (num as number) > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }
  return { valid: true };
}

/**
 * Validate a field is one of the allowed enum values.
 * Returns valid if value is undefined or null (optional field).
 */
export function validateEnum(value: unknown, allowedValues: readonly string[], fieldName: string): ValidationResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of: ${allowedValues.join(', ')}` };
  }
  return { valid: true };
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
