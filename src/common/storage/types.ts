export type StorageProvider = 'filesystem' | 'spaces' | 'minio';

export interface FileMetadata {
  size: number;
  mimetype: string;
  lastModified?: Date;
  etag?: string;
  customMetadata?: Record<string, string>;
}

export interface StoredFileReference {
  key: string;
  url?: string;
  metadata: FileMetadata;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  isPublic?: boolean;
}

export interface ListResult {
  keys: string[];
  isTruncated: boolean;
  nextToken?: string;
}

export interface IStorageProvider {
  upload(
    sourcePath: string,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference>;

  uploadStream(
    stream: NodeJS.ReadableStream,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference>;

  download(key: string): Promise<string>;

  downloadBuffer(key: string): Promise<Buffer>;

  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  getPublicUrl(key: string): string;

  delete(key: string): Promise<void>;

  deleteBatch(keys: string[]): Promise<void>;

  exists(key: string): Promise<boolean>;

  list(prefix: string, maxKeys?: number): Promise<ListResult>;

  copy(sourceKey: string, destinationKey: string): Promise<void>;

  move(sourceKey: string, destinationKey: string): Promise<void>;

  getMetadata(key: string): Promise<FileMetadata>;
}

export interface KeyGenerationOptions {
  tenant: string;
  entity: string;
  field: string;
  filename: string;
  date?: Date;
  uuid?: string;
}
