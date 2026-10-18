import {
  IStorageProvider,
  StoredFileReference,
  UploadOptions,
  FileMetadata,
  ListResult
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { randomUUID } from 'crypto';

const pipelineAsync = promisify(pipeline);

export interface FilesystemStorageConfig {
  rootDir: string;
}

export class FilesystemStorage implements IStorageProvider {
  private rootDir: string;

  constructor(config: FilesystemStorageConfig) {
    this.rootDir = config.rootDir;
  }

  /**
   * La ruta en disco de una clave, si queda dentro de rootDir.
   *
   * Las claves se arman con datos que pueden venir de afuera (el nombre de un
   * archivo subido): con `path.join(rootDir, key)`, un `..` salía de la raíz y se
   * escribía, leía o borraba cualquier archivo del disco. Se resuelve la ruta y
   * se exige que quede adentro; una clave absoluta queda afuera. Solo `list` puede
   * pedir la raíz misma (`allowRoot`). Lanza antes de tocar el disco.
   */
  private resolveInsideRoot(key: string, allowRoot = false): string {
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, key);
    if (!(resolved.startsWith(root + path.sep) || (allowRoot && resolved === root))) {
      throw new Error("Clave de storage fuera de la raíz");
    }
    return resolved;
  }

  async upload(
    sourcePath: string,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    const destPath = this.resolveInsideRoot(destinationKey);
    const destDir = path.dirname(destPath);

    await fs.promises.mkdir(destDir, { recursive: true });

    try {
      await fs.promises.rename(sourcePath, destPath);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        await fs.promises.copyFile(sourcePath, destPath);
        await fs.promises.unlink(sourcePath);
      } else {
        throw err;
      }
    }

    const stats = await fs.promises.stat(destPath);
    const metadata: FileMetadata = {
      size: stats.size,
      mimetype: options?.contentType || 'application/octet-stream',
      lastModified: stats.mtime
    };

    return {
      key: destinationKey,
      metadata
    };
  }

  async uploadStream(
    stream: NodeJS.ReadableStream,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    const destPath = this.resolveInsideRoot(destinationKey);
    const destDir = path.dirname(destPath);

    await fs.promises.mkdir(destDir, { recursive: true });

    const writeStream = fs.createWriteStream(destPath);
    await pipelineAsync(stream, writeStream);

    const stats = await fs.promises.stat(destPath);
    const metadata: FileMetadata = {
      size: stats.size,
      mimetype: options?.contentType || 'application/octet-stream',
      lastModified: stats.mtime
    };

    return {
      key: destinationKey,
      metadata
    };
  }

  async download(key: string): Promise<string> {
    const filePath = this.resolveInsideRoot(key);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return filePath;
    } catch {
      throw new Error(`File not found: ${key}`);
    }
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const filePath = this.resolveInsideRoot(key);
    return fs.promises.readFile(filePath);
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const filePath = await this.download(key);
    return filePath;
  }

  getPublicUrl(key: string): string {
    return this.resolveInsideRoot(key);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveInsideRoot(key);

    try {
      await fs.promises.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async deleteBatch(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.delete(key)));
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveInsideRoot(key);

    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string, maxKeys: number = 1000): Promise<ListResult> {
    const dirPath = this.resolveInsideRoot(prefix, true);
    const keys: string[] = [];

    const listRecursive = async (currentPath: string, relativePath: string = '') => {
      if (keys.length >= maxKeys) return;

      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (keys.length >= maxKeys) break;

          const entryRelativePath = path.join(relativePath, entry.name);

          if (entry.isDirectory()) {
            await listRecursive(
              path.join(currentPath, entry.name),
              entryRelativePath
            );
          } else if (entry.isFile()) {
            keys.push(path.join(prefix, entryRelativePath));
          }
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    };

    await listRecursive(dirPath);

    return {
      keys,
      isTruncated: keys.length >= maxKeys
    };
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = this.resolveInsideRoot(sourceKey);
    const destPath = this.resolveInsideRoot(destinationKey);
    const destDir = path.dirname(destPath);

    await fs.promises.mkdir(destDir, { recursive: true });
    await fs.promises.copyFile(sourcePath, destPath);
  }

  async move(sourceKey: string, destinationKey: string): Promise<void> {
    await this.copy(sourceKey, destinationKey);
    await this.delete(sourceKey);
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    const filePath = this.resolveInsideRoot(key);

    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        mimetype: 'application/octet-stream',
        lastModified: stats.mtime
      };
    } catch {
      throw new Error(`File not found: ${key}`);
    }
  }
}
