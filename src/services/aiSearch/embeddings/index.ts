/**
 * Embeddings Module
 *
 * Exports embedding providers and services.
 */

// Types
export * from './types';

// Providers
export { OpenAIEmbeddingProvider } from './openaiEmbeddings';
export { LocalEmbeddingProvider, embedQuery, warmupLocalEmbeddings } from './localEmbeddings';

// Service
export { EmbeddingService, createEmbeddingProvider } from './embeddingService';
