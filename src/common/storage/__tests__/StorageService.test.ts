import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StorageService } from '../StorageService';
import { StorageFactory } from '../StorageFactory';
import { FilesystemStorage } from '../FilesystemStorage';

describe('StorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    StorageFactory.reset();
    process.env = { ...originalEnv };
    process.env.STORAGE_PROVIDER = 'filesystem';
  });

  afterEach(() => {
    process.env = originalEnv;
    StorageFactory.reset();
  });

  describe('constructor', () => {
    it('should initialize with provider from factory', () => {
      const service = new StorageService();

      expect(service.getProvider()).toBeInstanceOf(FilesystemStorage);
    });
  });

  describe('delegation', () => {
    it('should delegate upload to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const uploadSpy = jest.spyOn(provider, 'upload').mockResolvedValue({
        key: 'test-key',
        metadata: { size: 100, mimetype: 'text/plain' }
      });

      await service.upload('/tmp/test.txt', 'test-key');

      expect(uploadSpy).toHaveBeenCalledWith('/tmp/test.txt', 'test-key', undefined);
    });

    it('should delegate uploadStream to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const mockStream = {} as NodeJS.ReadableStream;
      const uploadStreamSpy = jest.spyOn(provider, 'uploadStream').mockResolvedValue({
        key: 'test-key',
        metadata: { size: 100, mimetype: 'text/plain' }
      });

      await service.uploadStream(mockStream, 'test-key');

      expect(uploadStreamSpy).toHaveBeenCalledWith(mockStream, 'test-key', undefined);
    });

    it('should delegate download to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const downloadSpy = jest.spyOn(provider, 'download').mockResolvedValue('/tmp/downloaded.txt');

      const result = await service.download('test-key');

      expect(downloadSpy).toHaveBeenCalledWith('test-key');
      expect(result).toBe('/tmp/downloaded.txt');
    });

    it('should delegate getDownloadUrl to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const getUrlSpy = jest.spyOn(provider, 'getDownloadUrl').mockResolvedValue('https://example.com/file');

      const result = await service.getDownloadUrl('test-key', 3600);

      expect(getUrlSpy).toHaveBeenCalledWith('test-key', 3600);
      expect(result).toBe('https://example.com/file');
    });

    it('should delegate getPublicUrl to provider', () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const getPublicUrlSpy = jest.spyOn(provider, 'getPublicUrl').mockReturnValue('https://example.com/public');

      const result = service.getPublicUrl('test-key');

      expect(getPublicUrlSpy).toHaveBeenCalledWith('test-key');
      expect(result).toBe('https://example.com/public');
    });

    it('should delegate delete to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const deleteSpy = jest.spyOn(provider, 'delete').mockResolvedValue(undefined);

      await service.delete('test-key');

      expect(deleteSpy).toHaveBeenCalledWith('test-key');
    });

    it('should delegate deleteBatch to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const deleteBatchSpy = jest.spyOn(provider, 'deleteBatch').mockResolvedValue(undefined);
      const keys = ['key1', 'key2'];

      await service.deleteBatch(keys);

      expect(deleteBatchSpy).toHaveBeenCalledWith(keys);
    });

    it('should delegate exists to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const existsSpy = jest.spyOn(provider, 'exists').mockResolvedValue(true);

      const result = await service.exists('test-key');

      expect(existsSpy).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });

    it('should delegate list to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const listSpy = jest.spyOn(provider, 'list').mockResolvedValue({
        keys: ['key1', 'key2'],
        isTruncated: false
      });

      const result = await service.list('prefix', 100);

      expect(listSpy).toHaveBeenCalledWith('prefix', 100);
      expect(result.keys).toEqual(['key1', 'key2']);
    });

    it('should delegate copy to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const copySpy = jest.spyOn(provider, 'copy').mockResolvedValue(undefined);

      await service.copy('source-key', 'dest-key');

      expect(copySpy).toHaveBeenCalledWith('source-key', 'dest-key');
    });

    it('should delegate move to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const moveSpy = jest.spyOn(provider, 'move').mockResolvedValue(undefined);

      await service.move('source-key', 'dest-key');

      expect(moveSpy).toHaveBeenCalledWith('source-key', 'dest-key');
    });

    it('should delegate getMetadata to provider', async () => {
      const service = new StorageService();
      const provider = service.getProvider() as any;

      const metadata = { size: 100, mimetype: 'text/plain' };
      const getMetadataSpy = jest.spyOn(provider, 'getMetadata').mockResolvedValue(metadata);

      const result = await service.getMetadata('test-key');

      expect(getMetadataSpy).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(metadata);
    });
  });
});
