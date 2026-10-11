import { IStorageProvider, StorageProvider } from './types';
import { FilesystemStorage, FilesystemStorageConfig } from './FilesystemStorage';
import { SpacesStorage, SpacesStorageConfig } from './SpacesStorage';
import * as path from 'path';

export class StorageFactory {
  private static instance: IStorageProvider | null = null;

  static getProvider(): IStorageProvider {
    if (this.instance) {
      return this.instance;
    }

    const providerType = (process.env.STORAGE_PROVIDER || 'filesystem') as StorageProvider;

    switch (providerType) {
      case 'filesystem':
        this.instance = this.createFilesystemProvider();
        break;

      case 'spaces':
        this.instance = this.createSpacesProvider();
        break;

      case 'minio':
        throw new Error('MinIO provider not yet implemented');

      default:
        throw new Error(`Unknown storage provider: ${providerType}`);
    }

    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }

  static createFilesystemProvider(): FilesystemStorage {
    const rootDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public');

    const config: FilesystemStorageConfig = {
      rootDir
    };

    return new FilesystemStorage(config);
  }

  static createSpacesProvider(): SpacesStorage {
    const endpoint = process.env.SPACES_ENDPOINT;
    const region = process.env.SPACES_REGION;
    const bucket = process.env.SPACES_BUCKET;
    const accessKeyId = process.env.SPACES_ACCESS_KEY;
    const secretAccessKey = process.env.SPACES_SECRET_KEY;

    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Missing required Spaces configuration. Required: SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_ACCESS_KEY, SPACES_SECRET_KEY'
      );
    }

    const config: SpacesStorageConfig = {
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
      cdnEndpoint: process.env.SPACES_CDN_ENDPOINT,
      forcePathStyle: process.env.SPACES_FORCE_PATH_STYLE === 'true',
      envPrefix: process.env.SPACES_ENV_PREFIX
    };

    return new SpacesStorage(config);
  }
}

export const getStorageProvider = (): IStorageProvider => {
  return StorageFactory.getProvider();
};
