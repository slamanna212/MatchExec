import { describe, it, expect } from 'vitest';
import {
  validateRequiredFields,
  safeJSONParse,
  safeJSONStringify
} from '@/lib/utils/validation';

describe('Validation Utilities', () => {
  describe('validateRequiredFields', () => {
    it('should return valid when all required fields are present', () => {
      const obj = {
        name: 'Test Match',
        gameId: 'overwatch2',
        teamSize: 5
      };

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(true);
    });

    it('should return invalid when required field is missing', () => {
      const obj = {
        name: 'Test Match'
        // missing gameId
      };

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('gameId');
      }
    });

    it('should list all missing fields in error message', () => {
      const obj = {
        description: 'A test'
        // missing name and gameId
      };

      const result = validateRequiredFields(obj, ['name', 'gameId', 'teamSize']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('name');
        expect(result.error).toContain('gameId');
        expect(result.error).toContain('teamSize');
      }
    });

    it('should treat null as missing', () => {
      const obj = {
        name: 'Test Match',
        gameId: null
      };

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('gameId');
      }
    });

    it('should treat undefined as missing', () => {
      const obj = {
        name: 'Test Match',
        gameId: undefined
      };

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(false);
    });

    it('should treat empty string as missing', () => {
      const obj = {
        name: '',
        gameId: 'overwatch2'
      };

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('name');
      }
    });

    it('should accept 0 as valid value', () => {
      const obj = {
        teamSize: 0,
        rounds: 3
      };

      const result = validateRequiredFields(obj, ['teamSize', 'rounds']);

      // 0 is falsy but should be considered a valid value
      expect(result.valid).toBe(true);
    });

    it('should accept false as valid value', () => {
      const obj = {
        announcements: false,
        playerNotifications: true
      };

      const result = validateRequiredFields(obj, ['announcements', 'playerNotifications']);

      // false is falsy but should be considered a valid value
      expect(result.valid).toBe(true);
    });

    it('should handle empty required fields array', () => {
      const obj = {
        name: 'Test'
      };

      const result = validateRequiredFields(obj, []);

      expect(result.valid).toBe(true);
    });

    it('should handle empty object with no required fields', () => {
      const obj = {};

      const result = validateRequiredFields(obj, []);

      expect(result.valid).toBe(true);
    });

    it('should handle empty object with required fields', () => {
      const obj = {};

      const result = validateRequiredFields(obj, ['name', 'gameId']);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('name');
        expect(result.error).toContain('gameId');
      }
    });
  });

  describe('safeJSONParse', () => {
    it('should parse valid JSON string', () => {
      const jsonString = '{"name": "Test", "value": 123}';
      const result = safeJSONParse(jsonString, {});

      expect(result).toEqual({ name: 'Test', value: 123 });
    });

    it('should parse valid JSON array', () => {
      const jsonString = '["item1", "item2", "item3"]';
      const result = safeJSONParse(jsonString, []);

      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('should return fallback for invalid JSON', () => {
      const invalidJson = '{invalid json}';
      const fallback = { default: true };
      const result = safeJSONParse(invalidJson, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for null value', () => {
      const fallback = { default: true };
      const result = safeJSONParse(null, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for undefined value', () => {
      const fallback = { default: true };
      const result = safeJSONParse(undefined, fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { default: true };
      const result = safeJSONParse('', fallback);

      expect(result).toEqual(fallback);
    });

    it('should parse nested JSON objects', () => {
      const jsonString = '{"user": {"name": "John", "age": 30}, "active": true}';
      const result = safeJSONParse(jsonString, {});

      expect(result).toEqual({
        user: { name: 'John', age: 30 },
        active: true
      });
    });

    it('should handle JSON with special characters', () => {
      const jsonString = '{"message": "Hello\\nWorld", "emoji": "🎮"}';
      const result = safeJSONParse(jsonString, {});

      expect(result).toEqual({
        message: 'Hello\nWorld',
        emoji: '🎮'
      });
    });

    it('should parse JSON with numbers correctly', () => {
      const jsonString = '{"score": 100, "rating": 4.5, "big": 9007199254740991}';
      const result = safeJSONParse(jsonString, {});

      expect(result).toEqual({
        score: 100,
        rating: 4.5,
        big: 9007199254740991
      });
    });

    it('should parse JSON booleans', () => {
      const jsonString = '{"enabled": true, "disabled": false}';
      const result = safeJSONParse(jsonString, {});

      expect(result).toEqual({
        enabled: true,
        disabled: false
      });
    });

    it('should use correct fallback type', () => {
      const invalidJson = 'not json';

      // Array fallback
      const arrayResult = safeJSONParse<string[]>(invalidJson, []);
      expect(Array.isArray(arrayResult)).toBe(true);

      // Object fallback
      const objResult = safeJSONParse<Record<string, unknown>>(invalidJson, {});
      expect(typeof objResult).toBe('object');

      // String fallback
      const strResult = safeJSONParse<string>(invalidJson, 'default');
      expect(strResult).toBe('default');

      // Number fallback
      const numResult = safeJSONParse<number>(invalidJson, 0);
      expect(numResult).toBe(0);
    });
  });

  describe('safeJSONStringify', () => {
    it('should stringify valid object', () => {
      const obj = { name: 'Test', value: 123 };
      const result = safeJSONStringify(obj);

      expect(result).toBe('{"name":"Test","value":123}');
    });

    it('should stringify array', () => {
      const arr = ['item1', 'item2', 'item3'];
      const result = safeJSONStringify(arr);

      expect(result).toBe('["item1","item2","item3"]');
    });

    it('should stringify string', () => {
      const str = 'hello world';
      const result = safeJSONStringify(str);

      expect(result).toBe('"hello world"');
    });

    it('should stringify number', () => {
      const num = 42;
      const result = safeJSONStringify(num);

      expect(result).toBe('42');
    });

    it('should stringify boolean', () => {
      expect(safeJSONStringify(true)).toBe('true');
      expect(safeJSONStringify(false)).toBe('false');
    });

    it('should stringify null', () => {
      const result = safeJSONStringify(null);

      expect(result).toBe('null');
    });

    it('should return fallback for circular reference', () => {
      const obj: any = { name: 'Test' };
      obj.self = obj; // Create circular reference

      const result = safeJSONStringify(obj);

      expect(result).toBe('[]'); // Fallback value
    });

    it('should handle nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        },
        timestamp: 123456789
      };

      const result = safeJSONStringify(obj);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(obj);
    });

    it('should handle empty object', () => {
      const result = safeJSONStringify({});

      expect(result).toBe('{}');
    });

    it('should handle empty array', () => {
      const result = safeJSONStringify([]);

      expect(result).toBe('[]');
    });

    it('should handle special characters', () => {
      const obj = {
        message: 'Hello\nWorld',
        emoji: '🎮',
        quote: 'He said "Hello"'
      };

      const result = safeJSONStringify(obj);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(obj);
    });

    it('should handle undefined by omitting it from objects', () => {
      const obj = {
        name: 'Test',
        value: undefined,
        other: 'data'
      };

      const result = safeJSONStringify(obj);

      // JSON.stringify omits undefined values in objects
      expect(result).toBe('{"name":"Test","other":"data"}');
    });
  });

  describe('Integration: Parse and Stringify', () => {
    it('should roundtrip object through stringify and parse', () => {
      const original = {
        match: {
          name: 'Test Match',
          teams: ['Team A', 'Team B'],
          scores: [3, 2],
          complete: true
        }
      };

      const stringified = safeJSONStringify(original);
      const parsed = safeJSONParse(stringified, {});

      expect(parsed).toEqual(original);
    });

    it('should roundtrip array through stringify and parse', () => {
      const original = ['map1', 'map2', 'map3'];

      const stringified = safeJSONStringify(original);
      const parsed = safeJSONParse(stringified, []);

      expect(parsed).toEqual(original);
    });

    it('should handle invalid data in roundtrip gracefully', () => {
      const obj: any = { name: 'Test' };
      obj.circular = obj;

      const stringified = safeJSONStringify(obj); // Returns '[]'
      const parsed = safeJSONParse(stringified, {}); // Parses '[]' successfully

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual([]);
    });
  });
});
