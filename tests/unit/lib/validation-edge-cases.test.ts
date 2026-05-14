import { describe, it, expect } from 'vitest';
import {
  validateRequiredFields,
  safeJSONParse,
  safeJSONStringify,
  validateMaxLength,
  validateNumberRange,
  validateEnum,
} from '../../../src/lib/utils/validation';

describe('Validation edge cases (J3)', () => {
  // ─── validateRequiredFields ───────────────────────────────────────────────

  describe('validateRequiredFields', () => {
    it('empty object with no required fields is valid', () => {
      expect(validateRequiredFields({}, []).valid).toBe(true);
    });

    it('value 0 is treated as valid (not missing)', () => {
      expect(validateRequiredFields({ count: 0 }, ['count']).valid).toBe(true);
    });

    it('value false is treated as valid (not missing)', () => {
      expect(validateRequiredFields({ enabled: false }, ['enabled']).valid).toBe(true);
    });

    it('value "" (empty string) is treated as missing', () => {
      const result = validateRequiredFields({ name: '' }, ['name']);
      expect(result.valid).toBe(false);
    });

    it('value null is treated as missing', () => {
      const result = validateRequiredFields({ id: null }, ['id']);
      expect(result.valid).toBe(false);
    });

    it('value undefined is treated as missing', () => {
      const result = validateRequiredFields({ id: undefined }, ['id']);
      expect(result.valid).toBe(false);
    });

    it('dot-notation key is NOT deep-resolved (treated as flat key)', () => {
      // validateRequiredFields doesn't traverse nested objects
      const result = validateRequiredFields({ a: { b: 'x' } }, ['a.b']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('a.b');
      }
    });

    it('flat key "a" pointing to nested object is valid', () => {
      expect(validateRequiredFields({ a: { b: 'x' } }, ['a']).valid).toBe(true);
    });

    it('array value is treated as valid (non-empty)', () => {
      expect(validateRequiredFields({ items: [1, 2, 3] }, ['items']).valid).toBe(true);
    });

    it('empty array is treated as valid (not undefined/null/empty-string)', () => {
      expect(validateRequiredFields({ items: [] }, ['items']).valid).toBe(true);
    });

    it('reports all missing fields in a single error', () => {
      const result = validateRequiredFields({ a: 'present' }, ['a', 'b', 'c']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('b');
        expect(result.error).toContain('c');
      }
    });

    it('mix of valid and missing fields fails with only missing listed', () => {
      const result = validateRequiredFields({ x: 1, y: null }, ['x', 'y']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).not.toContain('x');
        expect(result.error).toContain('y');
      }
    });
  });

  // ─── safeJSONParse ───────────────────────────────────────────────────────

  describe('safeJSONParse', () => {
    it('parses a valid JSON object string', () => {
      const result = safeJSONParse<{ a: number }>('{"a":1}', { a: 0 });
      expect(result.a).toBe(1);
    });

    it('returns fallback for malformed JSON', () => {
      const fallback = { default: true };
      expect(safeJSONParse('{bad json}', fallback)).toBe(fallback);
    });

    it('returns fallback for null input', () => {
      const fallback = 'default';
      expect(safeJSONParse(null, fallback)).toBe(fallback);
    });

    it('returns fallback for undefined input', () => {
      const fallback = 42;
      expect(safeJSONParse(undefined, fallback)).toBe(fallback);
    });

    it('returns fallback for empty string', () => {
      const fallback = { empty: true };
      expect(safeJSONParse('', fallback)).toBe(fallback);
    });

    it('parses a JSON string that is itself a primitive number', () => {
      const result = safeJSONParse<number>('123', 0);
      expect(result).toBe(123);
    });

    it('parses a JSON string that is itself a string literal', () => {
      const result = safeJSONParse<string>('"hello"', '');
      expect(result).toBe('hello');
    });

    it('parses deeply nested JSON without error', () => {
      // Build a 50-level deep object
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        obj = { nested: obj };
      }
      const jsonStr = JSON.stringify(obj);
      const result = safeJSONParse<typeof obj>(jsonStr, {});
      expect(result).toHaveProperty('nested');
    });

    it('parsing result of safeJSONStringify on a circular object returns []', () => {
      // safeJSONStringify catches the cycle and returns '[]'
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const stringified = safeJSONStringify(circular); // '[]'
      const parsed = safeJSONParse<unknown[]>(stringified, []);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('parses a JSON array', () => {
      const result = safeJSONParse<number[]>('[1,2,3]', []);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  // ─── safeJSONStringify ───────────────────────────────────────────────────

  describe('safeJSONStringify', () => {
    it('returns "[]" for circular references (non-serializable)', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(safeJSONStringify(obj)).toBe('[]');
    });

    it('returns "[]" for BigInt values (non-serializable)', () => {
      expect(safeJSONStringify(BigInt(123))).toBe('[]');
    });

    it('omits Symbol-valued object properties', () => {
      const obj = { a: 1, b: Symbol('sym') };
      const result = safeJSONStringify(obj);
      expect(result).toBe('{"a":1}');
    });

    it('omits undefined values in objects (JSON.stringify behavior)', () => {
      const obj = { a: 1, b: undefined };
      const result = safeJSONStringify(obj);
      expect(result).toBe('{"a":1}');
    });

    it('converts standalone undefined without throwing', () => {
      expect(() => safeJSONStringify(undefined)).not.toThrow();
    });

    it('stringifies arrays with null holes correctly', () => {
      // JSON.stringify converts undefined elements to null
      const arr = [1, undefined, 3];
      const result = safeJSONStringify(arr);
      expect(result).toBe('[1,null,3]');
    });

    it('stringifies valid nested objects', () => {
      const obj = { a: { b: { c: 42 } } };
      const result = safeJSONStringify(obj);
      expect(result).toBe('{"a":{"b":{"c":42}}}');
    });
  });

  // ─── validateMaxLength — edge cases ──────────────────────────────────────

  describe('validateMaxLength edge cases', () => {
    it('exact boundary length is valid', () => {
      const result = validateMaxLength('a'.repeat(100), 100, 'field');
      expect(result.valid).toBe(true);
    });

    it('one character over boundary is invalid', () => {
      const result = validateMaxLength('a'.repeat(101), 100, 'field');
      expect(result.valid).toBe(false);
    });

    it('empty string is valid (length 0 ≤ any max)', () => {
      expect(validateMaxLength('', 0, 'field').valid).toBe(true);
    });

    it('number type returns invalid with descriptive error', () => {
      const result = validateMaxLength(42, 10, 'field');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('string');
      }
    });
  });

  // ─── validateNumberRange — edge cases ────────────────────────────────────

  describe('validateNumberRange edge cases', () => {
    it('NaN is invalid', () => {
      const result = validateNumberRange(NaN, 0, 100, 'count');
      expect(result.valid).toBe(false);
    });

    it('Infinity is out of range', () => {
      const result = validateNumberRange(Infinity, 0, 100, 'count');
      expect(result.valid).toBe(false);
    });

    it('string numeric is coerced and valid', () => {
      expect(validateNumberRange('50', 0, 100, 'count').valid).toBe(true);
    });

    it('string non-numeric returns invalid', () => {
      const result = validateNumberRange('abc', 0, 100, 'count');
      expect(result.valid).toBe(false);
    });
  });

  // ─── validateEnum — edge cases ────────────────────────────────────────────

  describe('validateEnum edge cases', () => {
    const values = ['a', 'b', 'c'] as const;

    it('empty string is rejected', () => {
      expect(validateEnum('', values, 'field').valid).toBe(false);
    });

    it('case-sensitive: uppercase is rejected when only lowercase allowed', () => {
      expect(validateEnum('A', values, 'field').valid).toBe(false);
    });

    it('number value is rejected (not a string)', () => {
      expect(validateEnum(1, values, 'field').valid).toBe(false);
    });

    it('single-item allowed list accepts the one valid value', () => {
      expect(validateEnum('only', ['only'] as const, 'field').valid).toBe(true);
    });
  });
});
