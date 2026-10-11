import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StorageFactory } from '../StorageFactory';
import { FilesystemStorage } from '../FilesystemStorage';
import { SpacesStorage } from '../SpacesStorage';

describe('StorageFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    StorageFactory.reset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    StorageFactory.reset();
  });

  describe('getProvider', () => {
    it('should return filesystem provider by default', () => {
      delete process.env.STORAGE_PROVIDER;

      const provider = StorageFactory.getProvider();

      expect(provider).toBeInstanceOf(FilesystemStorage);
    });

    it('should return filesystem provider when explicitly configured', () => {
      process.env.STORAGE_PROVIDER = 'filesystem';

      const provider = StorageFactory.getProvider();

      expect(provider).toBeInstanceOf(FilesystemStorage);
    });

    it('should return spaces provider when configured', () => {
      process.env.STORAGE_PROVIDER = 'spaces';
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';

      const provider = StorageFactory.getProvider();

      expect(provider).toBeInstanceOf(SpacesStorage);
    });

    it('should throw error for minio provider (not yet implemented)', () => {
      process.env.STORAGE_PROVIDER = 'minio';

      expect(() => StorageFactory.getProvider()).toThrow('MinIO provider not yet implemented');
    });

    it('should throw error for unknown provider', () => {
      process.env.STORAGE_PROVIDER = 'invalid';

      expect(() => StorageFactory.getProvider()).toThrow('Unknown storage provider: invalid');
    });

    it('should return same instance on subsequent calls (singleton)', () => {
      const provider1 = StorageFactory.getProvider();
      const provider2 = StorageFactory.getProvider();

      expect(provider1).toBe(provider2);
    });

    it('should return new instance after reset', () => {
      const provider1 = StorageFactory.getProvider();
      StorageFactory.reset();
      const provider2 = StorageFactory.getProvider();

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('createFilesystemProvider', () => {
    it('should create filesystem provider with default config', () => {
      delete process.env.UPLOAD_DIR;

      const provider = StorageFactory.createFilesystemProvider();

      expect(provider).toBeInstanceOf(FilesystemStorage);
    });

    it('should create filesystem provider with custom root dir', () => {
      process.env.UPLOAD_DIR = '/custom/path';

      const provider = StorageFactory.createFilesystemProvider();

      expect(provider).toBeInstanceOf(FilesystemStorage);
    });
  });

  describe('createSpacesProvider', () => {
    it('should create spaces provider with valid config', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';

      const provider = StorageFactory.createSpacesProvider();

      expect(provider).toBeInstanceOf(SpacesStorage);
    });

    it('should create spaces provider with CDN endpoint', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';
      process.env.SPACES_CDN_ENDPOINT = 'https://test-bucket.nyc3.cdn.digitaloceanspaces.com';

      const provider = StorageFactory.createSpacesProvider();

      expect(provider).toBeInstanceOf(SpacesStorage);
    });

    it('should throw error when SPACES_ENDPOINT is missing', () => {
      delete process.env.SPACES_ENDPOINT;
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';

      expect(() => StorageFactory.createSpacesProvider()).toThrow('Missing required Spaces configuration');
    });

    it('should throw error when SPACES_REGION is missing', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      delete process.env.SPACES_REGION;
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';

      expect(() => StorageFactory.createSpacesProvider()).toThrow('Missing required Spaces configuration');
    });

    it('should throw error when SPACES_BUCKET is missing', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      delete process.env.SPACES_BUCKET;
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';

      expect(() => StorageFactory.createSpacesProvider()).toThrow('Missing required Spaces configuration');
    });

    it('should throw error when SPACES_ACCESS_KEY is missing', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      delete process.env.SPACES_ACCESS_KEY;
      process.env.SPACES_SECRET_KEY = 'test-secret';

      expect(() => StorageFactory.createSpacesProvider()).toThrow('Missing required Spaces configuration');
    });

    it('should throw error when SPACES_SECRET_KEY is missing', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      delete process.env.SPACES_SECRET_KEY;

      expect(() => StorageFactory.createSpacesProvider()).toThrow('Missing required Spaces configuration');
    });

    it('should handle force path style option', () => {
      process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
      process.env.SPACES_REGION = 'nyc3';
      process.env.SPACES_BUCKET = 'test-bucket';
      process.env.SPACES_ACCESS_KEY = 'test-key';
      process.env.SPACES_SECRET_KEY = 'test-secret';
      process.env.SPACES_FORCE_PATH_STYLE = 'true';

      const provider = StorageFactory.createSpacesProvider();

      expect(provider).toBeInstanceOf(SpacesStorage);
    });
  });
});
