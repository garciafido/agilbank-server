import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FilesystemStorage } from '../FilesystemStorage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FilesystemStorage', () => {
  let storage: FilesystemStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fs-storage-test-'));
    storage = new FilesystemStorage({ rootDir: testDir });
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('should upload file and return metadata', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'test content');

      const result = await storage.upload(
        sourceFile,
        'tenant1/User.avatar/2025/11/19/uuid/file.txt',
        { contentType: 'text/plain' }
      );

      expect(result.key).toBe('tenant1/User.avatar/2025/11/19/uuid/file.txt');
      expect(result.metadata.size).toBe(12);
      expect(result.metadata.mimetype).toBe('text/plain');

      const destPath = path.join(testDir, 'tenant1/User.avatar/2025/11/19/uuid/file.txt');
      const exists = await fs.promises.access(destPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create directories if they do not exist', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'test');

      await storage.upload(sourceFile, 'deep/nested/path/file.txt');

      const destPath = path.join(testDir, 'deep/nested/path/file.txt');
      const exists = await fs.promises.access(destPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should remove source file after upload', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'test');

      await storage.upload(sourceFile, 'dest/file.txt');

      const sourceExists = await fs.promises.access(sourceFile).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });
  });

  describe('uploadStream', () => {
    it('should upload from stream', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'stream content');

      const stream = fs.createReadStream(sourceFile);
      const result = await storage.uploadStream(
        stream,
        'tenant1/stream/file.txt',
        { contentType: 'text/plain' }
      );

      expect(result.key).toBe('tenant1/stream/file.txt');
      expect(result.metadata.size).toBe(14);

      const destPath = path.join(testDir, 'tenant1/stream/file.txt');
      const content = await fs.promises.readFile(destPath, 'utf-8');
      expect(content).toBe('stream content');
    });
  });

  describe('download', () => {
    it('should return file path for existing file', async () => {
      const filePath = path.join(testDir, 'tenant1/file.txt');
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, 'content');

      const downloadedPath = await storage.download('tenant1/file.txt');

      expect(downloadedPath).toBe(filePath);
    });

    it('should throw error for non-existent file', async () => {
      await expect(storage.download('nonexistent/file.txt')).rejects.toThrow('File not found');
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      const filePath = path.join(testDir, 'tenant1/file.txt');
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, 'content');

      await storage.delete('tenant1/file.txt');

      const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should not throw error for non-existent file', async () => {
      await expect(storage.delete('nonexistent/file.txt')).resolves.not.toThrow();
    });
  });

  describe('deleteBatch', () => {
    it('should delete multiple files', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      await fs.promises.writeFile(file1, 'content1');
      await fs.promises.writeFile(file2, 'content2');

      await storage.deleteBatch(['file1.txt', 'file2.txt']);

      const exists1 = await fs.promises.access(file1).then(() => true).catch(() => false);
      const exists2 = await fs.promises.access(file2).then(() => true).catch(() => false);

      expect(exists1).toBe(false);
      expect(exists2).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'file.txt');
      await fs.promises.writeFile(filePath, 'content');

      const exists = await storage.exists('file.txt');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await storage.exists('nonexistent.txt');

      expect(exists).toBe(false);
    });
  });

  describe('list', () => {
    it('should list files with prefix', async () => {
      await fs.promises.mkdir(path.join(testDir, 'tenant1/User.avatar'), { recursive: true });
      await fs.promises.writeFile(path.join(testDir, 'tenant1/User.avatar/file1.txt'), 'content1');
      await fs.promises.writeFile(path.join(testDir, 'tenant1/User.avatar/file2.txt'), 'content2');

      const result = await storage.list('tenant1/User.avatar');

      expect(result.keys).toHaveLength(2);
      expect(result.keys).toContain(path.join('tenant1', 'User.avatar', 'file1.txt'));
      expect(result.keys).toContain(path.join('tenant1', 'User.avatar', 'file2.txt'));
      expect(result.isTruncated).toBe(false);
    });

    it('should list files recursively', async () => {
      await fs.promises.mkdir(path.join(testDir, 'tenant1/deep/nested'), { recursive: true });
      await fs.promises.writeFile(path.join(testDir, 'tenant1/file1.txt'), 'content1');
      await fs.promises.writeFile(path.join(testDir, 'tenant1/deep/file2.txt'), 'content2');
      await fs.promises.writeFile(path.join(testDir, 'tenant1/deep/nested/file3.txt'), 'content3');

      const result = await storage.list('tenant1');

      expect(result.keys).toHaveLength(3);
    });

    it('should respect maxKeys limit', async () => {
      await fs.promises.mkdir(path.join(testDir, 'tenant1'), { recursive: true });
      for (let i = 0; i < 10; i++) {
        await fs.promises.writeFile(path.join(testDir, `tenant1/file${i}.txt`), 'content');
      }

      const result = await storage.list('tenant1', 5);

      expect(result.keys).toHaveLength(5);
      expect(result.isTruncated).toBe(true);
    });

    it('should return empty array for non-existent prefix', async () => {
      const result = await storage.list('nonexistent');

      expect(result.keys).toHaveLength(0);
      expect(result.isTruncated).toBe(false);
    });
  });

  describe('copy', () => {
    it('should copy file to new location', async () => {
      const sourcePath = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourcePath, 'content');

      await storage.copy('source.txt', 'dest/copied.txt');

      const sourceExists = await fs.promises.access(sourcePath).then(() => true).catch(() => false);
      const destPath = path.join(testDir, 'dest/copied.txt');
      const destExists = await fs.promises.access(destPath).then(() => true).catch(() => false);

      expect(sourceExists).toBe(true);
      expect(destExists).toBe(true);

      const destContent = await fs.promises.readFile(destPath, 'utf-8');
      expect(destContent).toBe('content');
    });
  });

  describe('move', () => {
    it('should move file to new location', async () => {
      const sourcePath = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourcePath, 'content');

      await storage.move('source.txt', 'dest/moved.txt');

      const sourceExists = await fs.promises.access(sourcePath).then(() => true).catch(() => false);
      const destPath = path.join(testDir, 'dest/moved.txt');
      const destExists = await fs.promises.access(destPath).then(() => true).catch(() => false);

      expect(sourceExists).toBe(false);
      expect(destExists).toBe(true);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const filePath = path.join(testDir, 'file.txt');
      await fs.promises.writeFile(filePath, 'test content');

      const metadata = await storage.getMetadata('file.txt');

      expect(metadata.size).toBe(12);
      expect(metadata.mimetype).toBe('application/octet-stream');
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent file', async () => {
      await expect(storage.getMetadata('nonexistent.txt')).rejects.toThrow('File not found');
    });
  });
});
