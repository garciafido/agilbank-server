import { injectable } from 'tsyringe';
import {
  IStorageProvider,
  StoredFileReference,
  UploadOptions,
  FileMetadata,
  ListResult
} from './types';
import { getStorageProvider } from './StorageFactory';

@injectable()
export class StorageService implements IStorageProvider {
  private provider: IStorageProvider;

  constructor() {
    this.provider = getStorageProvider();
  }

  async upload(
    sourcePath: string,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    return this.provider.upload(sourcePath, destinationKey, options);
  }

  async uploadStream(
    stream: NodeJS.ReadableStream,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference> {
    return this.provider.uploadStream(stream, destinationKey, options);
  }

  async download(key: string): Promise<string> {
    return this.provider.download(key);
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    return this.provider.downloadBuffer(key);
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    return this.provider.getDownloadUrl(key, expiresIn);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async deleteBatch(keys: string[]): Promise<void> {
    return this.provider.deleteBatch(keys);
  }

  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  async list(prefix: string, maxKeys?: number): Promise<ListResult> {
    return this.provider.list(prefix, maxKeys);
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    return this.provider.copy(sourceKey, destinationKey);
  }

  async move(sourceKey: string, destinationKey: string): Promise<void> {
    return this.provider.move(sourceKey, destinationKey);
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    return this.provider.getMetadata(key);
  }

  getProvider(): IStorageProvider {
    return this.provider;
  }
}
