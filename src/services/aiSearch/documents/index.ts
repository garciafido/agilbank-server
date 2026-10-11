/**
 * Document Processing Module
 *
 * Exports document processing and indexing services.
 */

// Types
export * from './types';

// Processor
export {
  DocumentProcessor,
  extractContent,
  detectFormat,
} from './documentProcessor';

// Indexer
export {
  DocumentIndexer,
  createDocumentIndexer,
  type DocumentIndexerConfig,
  type DocumentIndexerContext,
} from './documentIndexer';

// Content Type Detection
export {
  detectContentType,
  getContentTypeHintFromMimetype,
  type ContentType,
} from './contentTypeDetector';
