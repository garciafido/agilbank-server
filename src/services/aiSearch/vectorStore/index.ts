/**
 * Vector Store Module
 *
 * Exports vector store types and implementations.
 */

// Types
export * from './types';

// pgvector implementation
export { PgVectorStore, createVectorStore, type VectorStoreContext } from './pgvectorStore';
