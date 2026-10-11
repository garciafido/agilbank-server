/**
 * LLM Provider Interface
 *
 * Abstract interface for LLM providers (OpenAI, Anthropic, Groq, etc.)
 * Each provider implements this interface to allow seamless switching.
 */

import {
  LlmMessage,
  LlmResponse,
  LlmProviderConfig,
  SearchToolDefinition,
} from '../types';

/**
 * Core interface that all LLM providers must implement
 */
export interface ILlmProvider {
  /**
   * Provider identifier
   */
  readonly providerCode: string;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Generate a completion from messages
   */
  generateCompletion(
    messages: LlmMessage[],
    options?: CompletionOptions
  ): Promise<LlmResponse>;

  /**
   * Generate a completion with tool/function calling support
   */
  generateWithTools(
    messages: LlmMessage[],
    tools: SearchToolDefinition[],
    options?: CompletionOptions
  ): Promise<LlmResponse>;

  /**
   * Stream a completion (for real-time responses)
   */
  streamCompletion?(
    messages: LlmMessage[],
    options?: CompletionOptions
  ): AsyncIterable<string>;
}

/**
 * Options for completion requests
 */
export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  /**
   * For tool calling: 'auto' lets the model decide,
   * 'required' forces tool use, 'none' disables tools
   */
  toolChoice?: 'auto' | 'required' | 'none' | { name: string };
  /**
   * AbortSignal for cancelling the request
   */
  signal?: AbortSignal;
}

/**
 * Provider factory function type
 */
export type LlmProviderFactory = (config: LlmProviderConfig) => ILlmProvider;

/**
 * Registry of available providers
 */
export interface LlmProviderRegistry {
  register(providerCode: string, factory: LlmProviderFactory): void;
  get(providerCode: string): LlmProviderFactory | undefined;
  list(): string[];
}

/**
 * Error thrown by LLM providers
 */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly providerCode: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

/**
 * Rate limit error (special case of provider error)
 */
export class RateLimitError extends LlmProviderError {
  constructor(
    providerCode: string,
    public readonly retryAfterMs?: number
  ) {
    super('Rate limit exceeded', providerCode, 429, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends LlmProviderError {
  constructor(providerCode: string) {
    super('Invalid API key or authentication failed', providerCode, 401, false);
    this.name = 'AuthenticationError';
  }
}

/**
 * Context length exceeded error
 */
export class ContextLengthError extends LlmProviderError {
  constructor(providerCode: string) {
    super('Context length exceeded', providerCode, 400, false);
    this.name = 'ContextLengthError';
  }
}
