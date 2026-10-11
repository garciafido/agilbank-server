/**
 * OpenAI Embeddings Provider
 *
 * Implements IEmbeddingProvider using OpenAI's text-embedding models.
 * Supports: text-embedding-3-small (1536), text-embedding-3-large (3072)
 */

import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { IEmbeddingProvider, EmbeddingProviderError } from './types';
import { EmbeddingConfig, EmbeddingResult } from '../types';

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly providerCode = 'openai';
  readonly dimensions: number;

  private client: ReturnType<typeof createOpenAI>;
  private model: string;

  constructor(config: EmbeddingConfig) {
    // API key is required unless using a local/compatible endpoint
    if (!config.apiKey && !config.baseUrl) {
      throw new EmbeddingProviderError(
        'API key is required for OpenAI embeddings (or provide baseUrl for compatible APIs)',
        'openai'
      );
    }

    this.client = createOpenAI({
      apiKey: config.apiKey || 'ollama',  // Ollama doesn't need real API key
      baseURL: config.baseUrl,
    });

    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = config.dimensions || 1536;
  }

  isConfigured(): boolean {
    return true;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    try {
      const result = await embed({
        model: this.client.embedding(this.model, {
          dimensions: this.dimensions,
        }),
        value: text,
      });

      return {
        embedding: result.embedding,
        tokenCount: result.usage?.tokens || this.estimateTokens(text),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const result = await embedMany({
        model: this.client.embedding(this.model, {
          dimensions: this.dimensions,
        }),
        values: texts,
      });

      return result.embeddings.map((embedding, i) => ({
        embedding,
        tokenCount: this.estimateTokens(texts[i]),
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  private handleError(error: unknown): never {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('rate limit') || message.includes('429')) {
        throw new EmbeddingProviderError(
          'Rate limit exceeded',
          'openai',
          true
        );
      }

      if (message.includes('invalid api key') || message.includes('401')) {
        throw new EmbeddingProviderError(
          'Invalid API key',
          'openai',
          false
        );
      }

      throw new EmbeddingProviderError(error.message, 'openai', true);
    }

    throw new EmbeddingProviderError('Unknown error', 'openai');
  }
}
