import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SpacesStorage } from '../SpacesStorage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const hasCredentials = () => {
  return !!(
    process.env.SPACES_ENDPOINT &&
    process.env.SPACES_BUCKET &&
    process.env.SPACES_REGION &&
    process.env.SPACES_ACCESS_KEY &&
    process.env.SPACES_SECRET_KEY
  );
};

const describeIfCredentials = hasCredentials() ? describe : describe.skip;

describeIfCredentials('SpacesStorage (Integration)', () => {
  let storage: SpacesStorage;
  let testDir: string;
  const testPrefix = `test-${Date.now()}`;

  beforeEach(async () => {
    storage = new SpacesStorage({
      endpoint: process.env.SPACES_ENDPOINT!,
      region: process.env.SPACES_REGION!,
      bucket: process.env.SPACES_BUCKET!,
      accessKeyId: process.env.SPACES_ACCESS_KEY!,
      secretAccessKey: process.env.SPACES_SECRET_KEY!,
      cdnEndpoint: process.env.SPACES_CDN_ENDPOINT
    });

    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spaces-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });

    try {
      const result = await storage.list(testPrefix);
      if (result.keys.length > 0) {
        await storage.deleteBatch(result.keys);
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  describe('upload', () => {
    it('should upload file and return metadata', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'test content');

      const key = `${testPrefix}/upload-test.txt`;
      const result = await storage.upload(sourceFile, key, {
        contentType: 'text/plain'
      });

      expect(result.key).toBe(key);
      expect(result.metadata.size).toBe(12);
      expect(result.metadata.mimetype).toBe('text/plain');
      expect(result.url).toBeTruthy();

      const exists = await storage.exists(key);
      expect(exists).toBe(true);
    });

    it('should delete source file after upload', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'test');

      const key = `${testPrefix}/delete-source.txt`;
      await storage.upload(sourceFile, key);

      const sourceExists = await fs.promises.access(sourceFile).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);
    });
  });

  describe('uploadStream', () => {
    it('should upload from stream', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'stream content');

      const stream = fs.createReadStream(sourceFile);
      const key = `${testPrefix}/stream-test.txt`;

      const result = await storage.uploadStream(stream, key, {
        contentType: 'text/plain'
      });

      expect(result.key).toBe(key);
      expect(result.metadata.size).toBe(14);

      const exists = await storage.exists(key);
      expect(exists).toBe(true);
    });
  });

  describe('download', () => {
    it('should download file to temp location', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      const content = 'download test content';
      await fs.promises.writeFile(sourceFile, content);

      const key = `${testPrefix}/download-test.txt`;
      await storage.upload(sourceFile, key);

      const downloadedPath = await storage.download(key);

      expect(downloadedPath).toBeTruthy();
      const downloadedContent = await fs.promises.readFile(downloadedPath, 'utf-8');
      expect(downloadedContent).toBe(content);

      await fs.promises.unlink(downloadedPath);
      await fs.promises.rmdir(path.dirname(downloadedPath));
    });

    it('should throw error for non-existent file', async () => {
      await expect(storage.download(`${testPrefix}/nonexistent.txt`)).rejects.toThrow();
    });
  });

  describe('getDownloadUrl', () => {
    it('should generate presigned URL', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'url test');

      const key = `${testPrefix}/url-test.txt`;
      await storage.upload(sourceFile, key);

      const url = await storage.getDownloadUrl(key, 3600);

      expect(url).toContain(key);
      expect(url).toContain('X-Amz-Signature');
    });
  });

  describe('getPublicUrl', () => {
    it('should return CDN URL if configured', () => {
      if (!process.env.SPACES_CDN_ENDPOINT) {
        return;
      }

      const key = `${testPrefix}/public-test.txt`;
      const url = storage.getPublicUrl(key);

      expect(url).toContain(process.env.SPACES_CDN_ENDPOINT);
      expect(url).toContain(key);
    });

    it('should return bucket URL if CDN not configured', () => {
      const storageNoCdn = new SpacesStorage({
        endpoint: process.env.SPACES_ENDPOINT!,
        region: process.env.SPACES_REGION!,
        bucket: process.env.SPACES_BUCKET!,
        accessKeyId: process.env.SPACES_ACCESS_KEY!,
        secretAccessKey: process.env.SPACES_SECRET_KEY!
      });

      const key = `${testPrefix}/public-test.txt`;
      const url = storageNoCdn.getPublicUrl(key);

      expect(url).toContain(process.env.SPACES_BUCKET);
      expect(url).toContain(key);
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'delete test');

      const key = `${testPrefix}/delete-test.txt`;
      await storage.upload(sourceFile, key);

      await storage.delete(key);

      const exists = await storage.exists(key);
      expect(exists).toBe(false);
    });

    it('should not throw error for non-existent file', async () => {
      await expect(storage.delete(`${testPrefix}/nonexistent.txt`)).resolves.not.toThrow();
    });
  });

  describe('deleteBatch', () => {
    it('should delete multiple files', async () => {
      const keys: string[] = [];

      for (let i = 0; i < 5; i++) {
        const sourceFile = path.join(testDir, `file${i}.txt`);
        await fs.promises.writeFile(sourceFile, `content ${i}`);

        const key = `${testPrefix}/batch-${i}.txt`;
        await storage.upload(sourceFile, key);
        keys.push(key);
      }

      await storage.deleteBatch(keys);

      for (const key of keys) {
        const exists = await storage.exists(key);
        expect(exists).toBe(false);
      }
    });

    it('should handle empty array', async () => {
      await expect(storage.deleteBatch([])).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'exists test');

      const key = `${testPrefix}/exists-test.txt`;
      await storage.upload(sourceFile, key);

      const exists = await storage.exists(key);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await storage.exists(`${testPrefix}/nonexistent.txt`);
      expect(exists).toBe(false);
    });
  });

  describe('list', () => {
    it('should list files with prefix', async () => {
      const keys: string[] = [];

      for (let i = 0; i < 3; i++) {
        const sourceFile = path.join(testDir, `file${i}.txt`);
        await fs.promises.writeFile(sourceFile, `content ${i}`);

        const key = `${testPrefix}/list-${i}.txt`;
        await storage.upload(sourceFile, key);
        keys.push(key);
      }

      const result = await storage.list(testPrefix);

      expect(result.keys.length).toBeGreaterThanOrEqual(3);
      for (const key of keys) {
        expect(result.keys).toContain(key);
      }
    });

    it('should respect maxKeys limit', async () => {
      const keys: string[] = [];

      for (let i = 0; i < 5; i++) {
        const sourceFile = path.join(testDir, `file${i}.txt`);
        await fs.promises.writeFile(sourceFile, `content ${i}`);

        const key = `${testPrefix}/maxkeys-${i}.txt`;
        await storage.upload(sourceFile, key);
        keys.push(key);
      }

      const result = await storage.list(testPrefix, 3);

      expect(result.keys.length).toBeLessThanOrEqual(3);
    });
  });

  describe('copy', () => {
    it('should copy file to new location', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'copy test');

      const sourceKey = `${testPrefix}/copy-source.txt`;
      await storage.upload(sourceFile, sourceKey);

      const destKey = `${testPrefix}/copy-dest.txt`;
      await storage.copy(sourceKey, destKey);

      const sourceExists = await storage.exists(sourceKey);
      const destExists = await storage.exists(destKey);

      expect(sourceExists).toBe(true);
      expect(destExists).toBe(true);
    });
  });

  describe('move', () => {
    it('should move file to new location', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      await fs.promises.writeFile(sourceFile, 'move test');

      const sourceKey = `${testPrefix}/move-source.txt`;
      await storage.upload(sourceFile, sourceKey);

      const destKey = `${testPrefix}/move-dest.txt`;
      await storage.move(sourceKey, destKey);

      const sourceExists = await storage.exists(sourceKey);
      const destExists = await storage.exists(destKey);

      expect(sourceExists).toBe(false);
      expect(destExists).toBe(true);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      const content = 'metadata test';
      await fs.promises.writeFile(sourceFile, content);

      const key = `${testPrefix}/metadata-test.txt`;
      await storage.upload(sourceFile, key, {
        contentType: 'text/plain',
        metadata: { custom: 'value' }
      });

      const metadata = await storage.getMetadata(key);

      expect(metadata.size).toBe(content.length);
      expect(metadata.mimetype).toBe('text/plain');
      expect(metadata.lastModified).toBeInstanceOf(Date);
      expect(metadata.etag).toBeTruthy();
      expect(metadata.customMetadata?.custom).toBe('value');
    });

    it('should throw error for non-existent file', async () => {
      await expect(storage.getMetadata(`${testPrefix}/nonexistent.txt`)).rejects.toThrow();
    });
  });
});

describe('SpacesStorage (Unit - No Credentials)', () => {
  it('should skip integration tests when credentials are missing', () => {
    if (!hasCredentials()) {
      console.log('Skipping SpacesStorage integration tests - credentials not configured');
      console.log('Set SPACES_ENDPOINT, SPACES_BUCKET, SPACES_REGION, SPACES_ACCESS_KEY, SPACES_SECRET_KEY to run');
    }
    expect(true).toBe(true);
  });
});

/**
 * `list()` tiene que devolver las claves TAL COMO se las pide, sin el prefijo
 * de entorno, porque es lo único que hace utilizable lo que devuelve: el resto
 * de los métodos (`get`, `delete`, `copy`) le ANTEPONEN el prefijo con
 * `getKey()`. Una clave que ya lo trae vuelve con el prefijo dos veces y
 * apunta a un objeto que no existe.
 *
 * Esto no es teórico: en producción la entrega de fotos de DNI recorría el
 * staging con `list()`, armaba mal la ruta de cada carpeta y no encontraba
 * nada. No fallaba — no hacía nada, en silencio, y las fotos se quedaban sin
 * entregar. En desarrollo andaba porque FilesystemStorage sí devuelve las
 * claves relativas, así que los dos proveedores respondían distinto detrás de
 * la misma interfaz.
 *
 * Va como test unitario y no dentro del bloque de integración porque ése se
 * saltea sin credenciales reales: un contrato que solo se verifica cuando hay
 * credenciales es un contrato que no se verifica.
 */
describe('SpacesStorage.list y el prefijo de entorno', () => {
  const conRespuesta = (keys: string[], envPrefix?: string) => {
    const storage = new SpacesStorage({
      endpoint: 'https://ejemplo.digitaloceanspaces.com',
      region: 'us-east-1',
      bucket: 'bucket-de-prueba',
      accessKeyId: 'x',
      secretAccessKey: 'y',
      envPrefix,
    });
    (storage as any).client = {
      send: async () => ({ Contents: keys.map((Key) => ({ Key })), IsTruncated: false }),
    };
    return storage;
  };

  it('devuelve las claves sin el prefijo de entorno', async () => {
    const storage = conRespuesta(
      ['jupiter.ar/jupiter/DniUpload/2026-01-01/abc/anverso.jpg.enc'],
      'jupiter.ar/jupiter'
    );
    const { keys } = await storage.list('DniUpload/');
    expect(keys).toEqual(['DniUpload/2026-01-01/abc/anverso.jpg.enc']);
  });

  it('sin prefijo configurado las deja como están', async () => {
    const storage = conRespuesta(['DniUpload/2026-01-01/abc/meta.json.enc']);
    const { keys } = await storage.list('DniUpload/');
    expect(keys).toEqual(['DniUpload/2026-01-01/abc/meta.json.enc']);
  });

  it('lo que devuelve se puede volver a pedir: la ida y vuelta cierra', async () => {
    // La prueba de que el contrato es el correcto: la clave que sale de list()
    // tiene que ser la misma que getKey() convierte en la clave real.
    const storage = conRespuesta(
      ['jupiter.ar/jupiter/DniUpload/2026-01-01/abc/meta.json.enc'],
      'jupiter.ar/jupiter'
    );
    const { keys } = await storage.list('DniUpload/');
    expect((storage as any).getKey(keys[0])).toBe(
      'jupiter.ar/jupiter/DniUpload/2026-01-01/abc/meta.json.enc'
    );
  });
});
