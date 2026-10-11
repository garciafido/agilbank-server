# Storage Provider System

Configurable storage abstraction with two backends: filesystem and Digital Ocean
Spaces. Those are the only two `StorageFactory` builds; any other value of
`STORAGE_PROVIDER` throws at startup.

## Architecture

### Provider Selection

Configured via `STORAGE_PROVIDER` environment variable:

```env
STORAGE_PROVIDER=filesystem  # Local filesystem (default)
STORAGE_PROVIDER=spaces      # Digital Ocean Spaces (S3-compatible)
```

`spaces` takes an explicit endpoint, so it also reaches any other S3-compatible
service. That path has not been exercised against one.

### Key Organization

All storage backends use consistent key format:

```
{tenant}/{entity}.{field}/{YYYY}/{MM}/{DD}/{uuid}/{filename}
```

**Examples**:
- `tenant1/User.avatar/2025/11/19/abc-def-ghi/photo.jpg`
- `tenant2/Contract.document/2025/11/20/xyz-123-456/contract.pdf`

**Benefits**:
- Tenant isolation
- Efficient querying by entity/field
- Date-based organization for lifecycle policies
- UUID prevents filename collisions

### Legacy Compatibility

Filesystem provider maintains backward compatibility with existing format:

```
{tenant}/{entity}/{field}/{uuid}/{filename}
```

Key generator detects and preserves legacy keys when migrating.

## Core Components

### KeyGenerator

Handles key generation and parsing for both new and legacy formats.

**Methods**:

```typescript
class KeyGenerator {
  // Generate new format key
  generateKey(options: KeyGenerationOptions): string;

  // Generate legacy format key
  generateLegacyKey(entity: string, field: string, entityId: string, filename: string): string;

  // Check if key is legacy format
  isLegacyKey(key: string): boolean;

  // Parse legacy format key
  parseLegacyKey(key: string): { entityField: string; entityId: string; filename: string } | null;

  // Parse any format key
  parseKey(key: string): {
    tenant?: string;
    entity?: string;
    field?: string;
    date?: Date;
    uuid?: string;
    filename?: string;
  } | null;
}
```

**Example**:

```typescript
import { keyGenerator } from './storage';

// Generate new format key
const key = keyGenerator.generateKey({
  tenant: 'tenant1',
  entity: 'User',
  field: 'avatar',
  filename: 'photo.jpg',
  date: new Date('2025-11-19'),
  uuid: 'abc-def-ghi'
});
// Result: tenant1/User.avatar/2025/11/19/abc-def-ghi/photo.jpg

// Parse key
const parsed = keyGenerator.parseKey(key);
// Result: { tenant: 'tenant1', entity: 'User', field: 'avatar', ... }

// Detect legacy keys
const isLegacy = keyGenerator.isLegacyKey('User.avatar/entity-123/photo.jpg');
// Result: true
```

### FilesystemStorage

Implementation of IStorageProvider for local filesystem storage.

**Configuration**:

```typescript
import { FilesystemStorage } from './storage';

const storage = new FilesystemStorage({
  rootDir: process.env.UPLOAD_DIR || '/var/app/storage'
});
```

**Features**:
- Atomic file operations (rename when possible, copy+delete fallback)
- Recursive directory creation
- Efficient batch operations
- Compatible with both new and legacy key formats

**Example**:

```typescript
// Upload file
const result = await storage.upload(
  '/tmp/source.jpg',
  'tenant1/User.avatar/2025/11/19/uuid/photo.jpg',
  { contentType: 'image/jpeg' }
);

// Download file (returns local path)
const path = await storage.download('tenant1/User.avatar/2025/11/19/uuid/photo.jpg');

// List files
const files = await storage.list('tenant1/User.avatar/2025/11/', 100);

// Delete file
await storage.delete('tenant1/User.avatar/2025/11/19/uuid/photo.jpg');
```

### SpacesStorage

Implementation of IStorageProvider for Digital Ocean Spaces (S3-compatible).

**Configuration**:

```typescript
import { SpacesStorage } from './storage';

const storage = new SpacesStorage({
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  region: 'nyc3',
  bucket: 'my-bucket',
  accessKeyId: process.env.SPACES_ACCESS_KEY,
  secretAccessKey: process.env.SPACES_SECRET_KEY,
  cdnEndpoint: 'https://my-bucket.nyc3.cdn.digitaloceanspaces.com'
});
```

**Environment Variables**:

```env
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_BUCKET=my-bucket
SPACES_ACCESS_KEY=your-access-key
SPACES_SECRET_KEY=your-secret-key
SPACES_CDN_ENDPOINT=https://my-bucket.nyc3.cdn.digitaloceanspaces.com
```

**Features**:
- AWS SDK v3 for S3-compatible operations
- Presigned URLs for temporary access (default 1 hour)
- CDN endpoint support for optimized delivery
- Batch delete operations (up to 1000 objects)
- Public/private ACL support
- Custom metadata support
- Streaming uploads for large files

**Example**:

```typescript
// Upload file
const result = await storage.upload(
  '/tmp/source.jpg',
  'tenant1/User.avatar/2025/11/19/uuid/photo.jpg',
  {
    contentType: 'image/jpeg',
    isPublic: true,
    cacheControl: 'max-age=31536000'
  }
);

// Get presigned URL (expires in 1 hour)
const downloadUrl = await storage.getDownloadUrl(
  'tenant1/User.avatar/2025/11/19/uuid/photo.jpg',
  3600
);

// Get public CDN URL
const publicUrl = storage.getPublicUrl('tenant1/User.avatar/2025/11/19/uuid/photo.jpg');
// Returns: https://my-bucket.nyc3.cdn.digitaloceanspaces.com/tenant1/User.avatar/...

// Batch delete
await storage.deleteBatch([
  'tenant1/User.avatar/2025/11/19/old1.jpg',
  'tenant1/User.avatar/2025/11/19/old2.jpg'
]);
```

**Performance Considerations**:
- Use streaming upload for files > 5MB
- CDN endpoint provides edge caching (reduces latency)
- Batch operations are more efficient than individual calls
- Presigned URLs avoid server overhead for downloads

### StorageFactory

Factory pattern for provider selection based on environment configuration.

**Usage**:

```typescript
import { getStorageProvider } from './storage';

const storage = getStorageProvider();
```

**Provider Selection**:

The factory selects the provider based on `STORAGE_PROVIDER` environment variable:

```env
STORAGE_PROVIDER=filesystem  # Default
STORAGE_PROVIDER=spaces      # Digital Ocean Spaces
```

**Manual Provider Creation**:

```typescript
import { StorageFactory } from './storage';

const filesystemStorage = StorageFactory.createFilesystemProvider();

const spacesStorage = StorageFactory.createSpacesProvider();
```

**Singleton Pattern**:

The factory returns the same instance on subsequent calls:

```typescript
const storage1 = getStorageProvider();
const storage2 = getStorageProvider();

storage1 === storage2  // true
```

**Reset for Testing**:

```typescript
import { StorageFactory } from './storage';

beforeEach(() => {
  StorageFactory.reset();
});
```

### StorageService

Injectable service wrapper for dependency injection with tsyringe.

**Usage with DI**:

```typescript
import { injectable, inject } from 'tsyringe';
import { StorageService } from './storage';

@injectable()
class MyService {
  constructor(
    private storage: StorageService
  ) {}

  async uploadFile(path: string, key: string) {
    return this.storage.upload(path, key);
  }
}
```

**Direct Usage**:

```typescript
import { StorageService } from './storage';

const storage = new StorageService();

await storage.upload('/tmp/file.txt', 'key');
```

**Access Underlying Provider**:

```typescript
const provider = storage.getProvider();

if (provider instanceof SpacesStorage) {
  // Provider-specific operations
}
```

## Interfaces

### IStorageProvider

Core abstraction implemented by all providers:

```typescript
interface IStorageProvider {
  // Upload from local file
  upload(
    sourcePath: string,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference>;

  // Upload from stream
  uploadStream(
    stream: NodeJS.ReadableStream,
    destinationKey: string,
    options?: UploadOptions
  ): Promise<StoredFileReference>;

  // Download to local file
  download(key: string): Promise<string>;

  // Get presigned URL (temporary download link)
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  // Get public CDN URL (if available)
  getPublicUrl(key: string): string;

  // Delete single file
  delete(key: string): Promise<void>;

  // Delete multiple files (batch operation)
  deleteBatch(keys: string[]): Promise<void>;

  // Check if file exists
  exists(key: string): Promise<boolean>;

  // List files by prefix
  list(prefix: string, maxKeys?: number): Promise<ListResult>;

  // Copy file
  copy(sourceKey: string, destinationKey: string): Promise<void>;

  // Move file (copy + delete)
  move(sourceKey: string, destinationKey: string): Promise<void>;

  // Get file metadata
  getMetadata(key: string): Promise<FileMetadata>;
}
```

### Supporting Types

```typescript
interface FileMetadata {
  size: number;
  mimetype: string;
  lastModified?: Date;
  etag?: string;
  customMetadata?: Record<string, string>;
}

interface StoredFileReference {
  key: string;
  url?: string;
  metadata: FileMetadata;
}

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  isPublic?: boolean;
}
```

## Usage Examples

### Basic Upload

```typescript
import { getStorageProvider } from './factory';

const storage = getStorageProvider();

const result = await storage.upload(
  '/tmp/avatar.jpg',
  'tenant1/User.avatar/2025/11/19/abc-def/photo.jpg',
  {
    contentType: 'image/jpeg',
    metadata: { userId: '123' },
    cacheControl: 'max-age=31536000'
  }
);

console.log(result.key);
console.log(result.metadata.size);
```

### Stream Upload

```typescript
import fs from 'fs';

const stream = fs.createReadStream('/path/to/file.pdf');

const result = await storage.uploadStream(
  stream,
  'tenant1/Contract.document/2025/11/19/xyz-123/contract.pdf',
  { contentType: 'application/pdf' }
);
```

### Download

```typescript
// Download to temp file
const localPath = await storage.download(
  'tenant1/User.avatar/2025/11/19/abc-def/photo.jpg'
);

// Or get presigned URL (expires in 1 hour)
const url = await storage.getDownloadUrl(
  'tenant1/User.avatar/2025/11/19/abc-def/photo.jpg',
  3600
);
```

### Batch Delete

```typescript
await storage.deleteBatch([
  'tenant1/User.avatar/2025/11/19/old1.jpg',
  'tenant1/User.avatar/2025/11/19/old2.jpg'
]);
```

### List Files

```typescript
const result = await storage.list('tenant1/User.avatar/2025/11/', 100);

console.log(result.keys);
console.log(result.isTruncated);
```

## Provider-Specific Configuration

### Filesystem

```env
STORAGE_PROVIDER=filesystem
STORAGE_ROOT=/var/app/storage
```

### Digital Ocean Spaces

```env
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_BUCKET=my-bucket
SPACES_REGION=nyc3
SPACES_ACCESS_KEY=xxx
SPACES_SECRET_KEY=yyy
SPACES_CDN_ENDPOINT=https://my-bucket.nyc3.cdn.digitaloceanspaces.com
```

## Migration Strategy

### Phase 1: Dual Write

Write to both old and new storage, read from old:

```typescript
await Promise.all([
  oldStorage.upload(file, oldKey),
  newStorage.upload(file, newKey)
]);
```

### Phase 2: Dual Read

Read from new storage, fallback to old:

```typescript
let path;
try {
  path = await newStorage.download(newKey);
} catch {
  path = await oldStorage.download(oldKey);
}
```

### Phase 3: Migration Script

Background job to copy old → new:

```bash
npm run storage:migrate -- --from=filesystem --to=spaces
```

### Phase 4: Cleanup

After migration complete, remove old storage.

## Backup & Restore

### Using rclone

```bash
# Backup Spaces to local
rclone sync spaces:my-bucket /backup/spaces

# Restore from local to Spaces
rclone sync /backup/spaces spaces:my-bucket

# Sync between providers
rclone sync spaces:my-bucket minio:uploads
```

### Using AWS CLI

```bash
# Backup
aws s3 sync s3://my-bucket /backup/spaces \
  --endpoint-url https://nyc3.digitaloceanspaces.com

# Restore
aws s3 sync /backup/spaces s3://my-bucket \
  --endpoint-url https://nyc3.digitaloceanspaces.com
```

## Rollback Procedure

If issues occur after switching providers:

1. Change `STORAGE_PROVIDER` back to previous value
2. Restart application
3. Verify reads work from old storage
4. Investigate issue before re-attempting

## Testing

```bash
# Unit tests
npm test src/common/storage

# Integration tests (requires provider credentials)
STORAGE_PROVIDER=spaces npm run test:integration
```

## Security Considerations

- Never expose storage credentials in logs
- Use presigned URLs for temporary access
- Set appropriate CORS policies
- Enable encryption at rest
- Rotate access keys regularly
- Use least-privilege IAM policies

## Performance

- **Filesystem**: Fastest for local access, doesn't scale horizontally
- **Spaces**: CDN caching, high throughput, geographic distribution

## Cost Estimation

### Digital Ocean Spaces
- Storage: $5/month for 250GB + $0.02/GB after
- Bandwidth: 1TB/month free, $0.01/GB after
- Requests: Free

### AWS S3 (comparison)
- Storage: ~$0.023/GB/month
- Bandwidth: $0.09/GB (first 10TB)
- Requests: $0.0004/1000 GET, $0.005/1000 PUT

### Self-hosted S3 (comparison)
- Storage: Server/disk costs
- Bandwidth: No egress fees
- Requests: No API fees
- Maintenance: DevOps time

Listed for comparison only. Reaching a self-hosted service would go through the
`spaces` provider with its own endpoint, and nothing here has been tested
against one.
