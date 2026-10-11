import { describe, it, expect, beforeEach } from '@jest/globals';
import { KeyGenerator } from '../KeyGenerator';
import * as path from 'path';

describe('KeyGenerator', () => {
  let generator: KeyGenerator;

  beforeEach(() => {
    generator = new KeyGenerator();
  });

  describe('generateKey', () => {
    it('should generate key with all components', () => {
      const key = generator.generateKey({
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg',
        date: new Date('2025-11-19'),
        uuid: 'abc-def-ghi'
      });

      expect(key).toBe(path.join('tenant1', 'User.avatar', '2025', '11', '19', 'abc-def-ghi', 'photo.jpg'));
    });

    it('should pad month and day with zeros', () => {
      const key = generator.generateKey({
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg',
        date: new Date('2025-01-05'),
        uuid: 'abc'
      });

      expect(key).toContain(path.join('2025', '01', '05'));
    });

    it('should use current date if not provided', () => {
      const now = new Date();
      const key = generator.generateKey({
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg',
        uuid: 'abc'
      });

      const year = String(now.getFullYear());
      expect(key).toContain(year);
    });

    it('should generate uuid if not provided', () => {
      const key = generator.generateKey({
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg'
      });

      const parts = key.split(path.sep);
      expect(parts[5]).toMatch(/^[a-f0-9-]+$/);
    });
  });

  describe('generateLegacyKey', () => {
    it('should generate legacy format key', () => {
      const key = generator.generateLegacyKey('User', 'avatar', 'entity-123', 'photo.jpg');

      expect(key).toBe(path.join('User.avatar', 'entity-123', 'photo.jpg'));
    });
  });

  describe('isLegacyKey', () => {
    it('should identify legacy keys', () => {
      const legacyKey = path.join('User.avatar', 'entity-123', 'photo.jpg');
      expect(generator.isLegacyKey(legacyKey)).toBe(true);
    });

    it('should identify new format keys', () => {
      const newKey = path.join('tenant1', 'User.avatar', '2025', '11', '19', 'uuid', 'photo.jpg');
      expect(generator.isLegacyKey(newKey)).toBe(false);
    });

    it('should reject invalid keys', () => {
      expect(generator.isLegacyKey('invalid')).toBe(false);
      expect(generator.isLegacyKey(path.join('a', 'b'))).toBe(false);
    });
  });

  describe('parseLegacyKey', () => {
    it('should parse legacy key correctly', () => {
      const legacyKey = path.join('User.avatar', 'entity-123', 'photo.jpg');
      const parsed = generator.parseLegacyKey(legacyKey);

      expect(parsed).toEqual({
        entityField: 'User.avatar',
        entityId: 'entity-123',
        filename: 'photo.jpg'
      });
    });

    it('should return null for non-legacy keys', () => {
      const newKey = path.join('tenant1', 'User.avatar', '2025', '11', '19', 'uuid', 'photo.jpg');
      expect(generator.parseLegacyKey(newKey)).toBeNull();
    });
  });

  describe('parseKey', () => {
    it('should parse new format key', () => {
      const key = path.join('tenant1', 'User.avatar', '2025', '11', '19', 'uuid-123', 'photo.jpg');
      const parsed = generator.parseKey(key);

      expect(parsed).toEqual({
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        date: new Date(2025, 10, 19),
        uuid: 'uuid-123',
        filename: 'photo.jpg'
      });
    });

    it('should parse legacy key via parseKey', () => {
      const legacyKey = path.join('User.avatar', 'entity-123', 'photo.jpg');
      const parsed = generator.parseKey(legacyKey);

      expect(parsed).toEqual({
        entity: 'User',
        field: 'avatar',
        uuid: 'entity-123',
        filename: 'photo.jpg'
      });
    });

    it('should return null for invalid keys', () => {
      expect(generator.parseKey('invalid')).toBeNull();
      expect(generator.parseKey(path.join('a', 'b', 'c', 'd'))).toBeNull();
    });

    it('should handle entityField without dot', () => {
      const key = path.join('tenant1', 'InvalidFormat', '2025', '11', '19', 'uuid', 'photo.jpg');
      const parsed = generator.parseKey(key);

      expect(parsed).toBeNull();
    });
  });
});
