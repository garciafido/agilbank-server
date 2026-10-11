/**
 * AI Search Module
 *
 * Provides AI-powered search capabilities:
 * - Natural language queries over structured data
 * - Semantic search over uploaded documents
 * - Configurable LLM providers per tenant
 *
 * @module aiSearch
 */

// Core types
export * from './types';

// Constants (centralized limits and configuration)
export * from './constants';

// LLM Providers (types, implementations, factory)
export * from './llmProviders';

// Embeddings (types, providers, service)
export * from './embeddings';

// Vector store (types, pgvector implementation)
export * from './vectorStore';

// Document processing (extraction, indexing)
export * from './documents';

// Tools (registry, built-in tools)
export * from './tools';

// Prompts
export * from './prompts';

// Orchestrator (main service, conversation)
export * from './orchestrator';

// Security (schema filtering, response validation)
export * from './security';

// Storage tracking (usage limits, history)
export * from './storage';
