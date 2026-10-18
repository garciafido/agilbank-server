import {
  IStorageProvider,
  StoredFileReference,
  UploadOptions,
  FileMetadata,
  ListResult
} from './types';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

export interface SpacesStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnEndpoint?: string;
  forcePathStyle?: boolean;
  envPrefix?: string;
}

export class SpacesStorage implements IStorageProvider {
  private client: S3Client;
  private bucket: string;
  private cdnEndpoint?: string;
  private envPrefix?: string;

  constructor(config: SpacesStorageConfig) {
    this.bucket = config.bucket;
    this.cdnEndpoint = config.cdnEndpoint;
    this.envPrefix = config.envPrefix;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: config.forcePathStyle ?? false
    });
  }

  /**
   * La clave real en el bucket: la pedida, con el prefijo de entorno adelante.
   *
   * Las claves se arman con datos que pueden venir de afuera (el nombre de un
   * archivo subido), y `path.posix.join` normaliza: con un tramo `..` la clave
   * salía del prefijo y apuntaba a lo de otro entorno del mismo bucket. Una clave
   * con un tramo `..` o que empieza con `/` se rechaza antes de anteponerlo.
   */
  private getKey(key: string): string {
    if (key.startsWith("/") || key.split("/").includes("..")) {
      throw new Error("Clave de storage fuera de la raíz");
    }
    if (this.envPrefix) {
      return path.posix.join(this.envPrefix, key);
    }
    return key;
  }

  /**
   * El inverso de getKey: saca el prefijo de entorno de una clave que vuelve
   * del bucket.
   *
   * Hace falta porque lo que devuelve `list()` tiene que poder pasarse a
   * `get()`, `delete()` o `copy()`, y todos ésos ANTEPONEN el prefijo. Una
   * clave que ya lo trae vuelve con el prefijo dos veces y apunta a un objeto
   * que no existe — sin error, simplemente no encuentra nada.
   */
  private stripEnvPrefix(key: string): string {
    if (!this.envPrefix) return key;
    const prefijo = this.envPrefix.replace(/\/+$/, "") + "/";
    return key.startsWith(prefijo) ? key.slice(prefijo.length) : key;
  }

  async upload(
    sourcePath: string,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    // La clave primero: una que sale del prefijo no abre el archivo de origen.
    const fullKey = this.getKey(destinationKey);

    const fileStream = fs.createReadStream(sourcePath);
    const stats = await fs.promises.stat(sourcePath);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fullKey,
      Body: fileStream,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
      CacheControl: options?.cacheControl,
      ACL: options?.isPublic ? 'public-read' : 'private'
    });

    await this.client.send(command);

    const metadata: FileMetadata = {
      size: stats.size,
      mimetype: options?.contentType || 'application/octet-stream',
      customMetadata: options?.metadata
    };

    await fs.promises.unlink(sourcePath);

    return {
      key: fullKey,
      url: this.getPublicUrl(fullKey),
      metadata
    };
  }

  async uploadStream(
    stream: NodeJS.ReadableStream,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    // La clave primero: una que sale del prefijo no consume el stream.
    const fullKey = this.getKey(destinationKey);

    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fullKey,
      Body: buffer,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
      CacheControl: options?.cacheControl,
      ACL: options?.isPublic ? 'public-read' : 'private'
    });

    await this.client.send(command);

    const metadata: FileMetadata = {
      size: buffer.length,
      mimetype: options?.contentType || 'application/octet-stream',
      customMetadata: options?.metadata
    };

    return {
      key: fullKey,
      url: this.getPublicUrl(fullKey),
      metadata
    };
  }

  async download(key: string): Promise<string> {
    const fullKey = this.getKey(key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fullKey
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spaces-download-'));
    const tempFile = path.join(tempDir, path.basename(key));
    const writeStream = fs.createWriteStream(tempFile);

    await pipelineAsync(response.Body as NodeJS.ReadableStream, writeStream);

    return tempFile;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const fullKey = this.getKey(key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fullKey
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const fullKey = this.getKey(key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fullKey
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  getPublicUrl(key: string): string {
    if (this.cdnEndpoint) {
      return `${this.cdnEndpoint}/${key}`;
    }

    return `https://${this.bucket}.${this.client.config.endpoint}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fullKey
    });

    await this.client.send(command);
  }

  async deleteBatch(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const batchSize = 1000;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: batch.map(key => ({ Key: this.getKey(key) })),
          Quiet: true
        }
      });

      await this.client.send(command);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fullKey
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async list(prefix: string, maxKeys: number = 1000): Promise<ListResult> {
    const fullPrefix = this.getKey(prefix);

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: fullPrefix,
      MaxKeys: maxKeys
    });

    const response = await this.client.send(command);

    const keys = (response.Contents || [])
      .map(obj => obj.Key)
      .filter((key): key is string => key !== undefined)
      .map(key => this.stripEnvPrefix(key));

    return {
      keys,
      isTruncated: response.IsTruncated || false,
      nextToken: response.NextContinuationToken
    };
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const fullSourceKey = this.getKey(sourceKey);
    const fullDestinationKey = this.getKey(destinationKey);

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      // La spec de S3 exige CopySource URL-encodeado: con caracteres no-ASCII
      // crudos (ej. "día") el server resuelve mal la key y tira NoSuchKey —
      // la copia del snapshot fallaba silenciosamente para esos archivos.
      // Los "/" se preservan (separadores de path del CopySource).
      CopySource: encodeURIComponent(`${this.bucket}/${fullSourceKey}`).replace(/%2F/g, "/"),
      Key: fullDestinationKey
    });

    await this.client.send(command);
  }

  async move(sourceKey: string, destinationKey: string): Promise<void> {
    await this.copy(sourceKey, destinationKey);
    await this.delete(sourceKey);
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    const fullKey = this.getKey(key);

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: fullKey
    });

    const response = await this.client.send(command);

    return {
      size: response.ContentLength || 0,
      mimetype: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified,
      etag: response.ETag,
      customMetadata: response.Metadata
    };
  }
}
