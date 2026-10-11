/**
 * Local Embedding Provider using Transformers.js
 *
 * Uses multilingual-e5-large for professional-grade embeddings
 * that work across English, Spanish, Portuguese (and 90+ other languages).
 *
 * - Zero external dependencies (runs in Node.js process)
 * - No API keys required
 * - Same code runs in all environments (local, staging, production)
 * - Model cached after first download (~560MB)
 */

import { IEmbeddingProvider, EmbeddingProviderError } from './types';
import { EmbeddingConfig, EmbeddingResult } from '../types';

// Lazy-loaded pipeline to avoid blocking startup
let pipelinePromise: Promise<any> | null = null;
let pipelineInstance: any = null;

// Model configuration
const MODEL_NAME = 'Xenova/multilingual-e5-large';
const MODEL_DIMENSIONS = 1024;

/**
 * Initialize the embedding pipeline (singleton)
 */
async function getEmbeddingPipeline(): Promise<any> {
  if (pipelineInstance) {
    return pipelineInstance;
  }

  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // Dynamic import to avoid issues with ESM/CJS
      const { pipeline } = await import('@xenova/transformers');

      console.log(`[LocalEmbeddings] Loading model ${MODEL_NAME}...`);
      const startTime = Date.now();

      const pipe = await pipeline('feature-extraction', MODEL_NAME, {
        // Cache models in a consistent location
        cacheDir: process.env.TRANSFORMERS_CACHE || './.cache/transformers',
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[LocalEmbeddings] Model loaded in ${duration}s`);

      pipelineInstance = pipe;
      return pipe;
    })();
  }

  return pipelinePromise;
}

/**
 * Local Embedding Provider Implementation
 */
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  readonly providerCode = 'local';
  readonly dimensions: number;

  constructor(config: EmbeddingConfig) {
    // Use configured dimensions or model default
    this.dimensions = config.dimensions || MODEL_DIMENSIONS;
  }

  isConfigured(): boolean {
    // Local provider is always available
    return true;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const pipe = await getEmbeddingPipeline();
      const results: EmbeddingResult[] = [];

      // Process texts in batches to manage memory
      const batchSize = 8;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        for (const text of batch) {
          // E5 models require specific prefix for best results
          // "passage: " for documents (used during indexing)
          const prefixedText = `passage: ${text}`;

          const output = await pipe(prefixedText, {
            pooling: 'mean',
            normalize: true,
          });

          // Extract embedding from tensor
          const embedding = Array.from(output.data as Float32Array);

          // Estimate tokens (rough approximation)
          const tokenCount = Math.ceil(text.length / 4);

          results.push({
            embedding,
            tokenCount,
          });
        }
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new EmbeddingProviderError(
        `Local embedding failed: ${message}`,
        'local',
        true // Retryable
      );
    }
  }

  /**
   * Generate embedding for a search query
   * Uses "query: " prefix as required by E5 models for asymmetric retrieval
   */
  async embedQuery(text: string): Promise<EmbeddingResult> {
    try {
      const pipe = await getEmbeddingPipeline();

      // E5 models use "query: " prefix for search queries
      const prefixedText = `query: ${text}`;

      const output = await pipe(prefixedText, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = Array.from(output.data as Float32Array);
      const tokenCount = Math.ceil(text.length / 4);

      return { embedding, tokenCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new EmbeddingProviderError(
        `Local query embedding failed: ${message}`,
        'local',
        true
      );
    }
  }
}

/**
 * Generate embedding for a search query
 * Uses "query: " prefix for E5 models (different from document embedding)
 */
export async function embedQuery(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();

  // E5 models use "query: " prefix for search queries
  const prefixedText = `query: ${text}`;

  const output = await pipe(prefixedText, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

/**
 * Pre-warm the model (call during server startup)
 */
export async function warmupLocalEmbeddings(): Promise<void> {
  try {
    await getEmbeddingPipeline();
    console.log('[LocalEmbeddings] Model pre-warmed and ready');
  } catch (error) {
    console.error('[LocalEmbeddings] Failed to pre-warm model:', error);
    // Don't throw - allow server to start, model will load on first use
  }
}
