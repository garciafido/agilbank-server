import { describe, it, expect } from '@jest/globals';
import type {
  StorageProvider,
  IStorageProvider,
  FileMetadata,
  StoredFileReference,
  UploadOptions,
  ListResult,
  KeyGenerationOptions
} from '../types';

describe('Storage Types', () => {
  describe('StorageProvider', () => {
    it('should accept valid provider types', () => {
      const validProviders: StorageProvider[] = ['filesystem', 'spaces', 'minio'];
      expect(validProviders).toHaveLength(3);
    });
  });

  describe('FileMetadata', () => {
    it('should require size and mimetype', () => {
      const metadata: FileMetadata = {
        size: 1024,
        mimetype: 'image/jpeg'
      };
      expect(metadata.size).toBe(1024);
      expect(metadata.mimetype).toBe('image/jpeg');
    });

    it('should accept optional fields', () => {
      const metadata: FileMetadata = {
        size: 2048,
        mimetype: 'application/pdf',
        lastModified: new Date(),
        etag: 'abc123',
        customMetadata: { owner: 'user1' }
      };
      expect(metadata.customMetadata?.owner).toBe('user1');
    });
  });

  describe('StoredFileReference', () => {
    it('should require key and metadata', () => {
      const ref: StoredFileReference = {
        key: 'tenant1/User.avatar/2025/11/19/uuid/photo.jpg',
        metadata: {
          size: 512,
          mimetype: 'image/jpeg'
        }
      };
      expect(ref.key).toContain('tenant1');
    });

    it('should accept optional url', () => {
      const ref: StoredFileReference = {
        key: 'key1',
        url: 'https://cdn.example.com/key1',
        metadata: { size: 100, mimetype: 'text/plain' }
      };
      expect(ref.url).toContain('https://');
    });
  });

  describe('IStorageProvider', () => {
    it('should define all required methods', () => {
      const methodNames: (keyof IStorageProvider)[] = [
        'upload',
        'uploadStream',
        'download',
        'getDownloadUrl',
        'getPublicUrl',
        'delete',
        'deleteBatch',
        'exists',
        'list',
        'copy',
        'move',
        'getMetadata'
      ];
      expect(methodNames).toHaveLength(12);
    });
  });

  describe('KeyGenerationOptions', () => {
    it('should require tenant, entity, field, filename', () => {
      const options: KeyGenerationOptions = {
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg'
      };
      expect(options.tenant).toBe('tenant1');
      expect(options.entity).toBe('User');
    });

    it('should accept optional date and uuid', () => {
      const options: KeyGenerationOptions = {
        tenant: 'tenant1',
        entity: 'User',
        field: 'avatar',
        filename: 'photo.jpg',
        date: new Date('2025-11-19'),
        uuid: 'abc-def-ghi'
      };
      expect(options.uuid).toBe('abc-def-ghi');
    });
  });
});
