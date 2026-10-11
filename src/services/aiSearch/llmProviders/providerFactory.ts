/**
 * LLM Provider Factory
 *
 * Creates and caches LLM provider instances based on tenant configuration.
 * Supports runtime provider switching per tenant.
 */

import { ILlmProvider, LlmProviderFactory, LlmProviderRegistry, LlmProviderError } from './types';
import { LlmProviderConfig, LlmProviderCode } from '../types';
import { OpenAIProvider } from './openaiProvider';
import { AnthropicProvider } from './anthropicProvider';
import { GroqProvider } from './groqProvider';
import { OllamaProvider } from './ollamaProvider';
import { GoogleProvider } from './googleProvider';

/**
 * Registry of provider factories
 */
class ProviderRegistry implements LlmProviderRegistry {
  private factories = new Map<string, LlmProviderFactory>();

  register(providerCode: string, factory: LlmProviderFactory): void {
    this.factories.set(providerCode, factory);
  }

  get(providerCode: string): LlmProviderFactory | undefined {
    return this.factories.get(providerCode);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

// Global registry instance
const registry = new ProviderRegistry();

// Register built-in providers
registry.register('openai', (config) => new OpenAIProvider(config));
registry.register('anthropic', (config) => new AnthropicProvider(config));
registry.register('groq', (config) => new GroqProvider(config));
registry.register('ollama', (config) => new OllamaProvider(config));
// Cerebras uses OpenAI-compatible API (https://api.cerebras.ai/v1)
registry.register('cerebras', (config) => new OpenAIProvider({
  ...config,
  providerCode: 'cerebras',
  baseUrl: config.baseUrl || 'https://api.cerebras.ai/v1',
}));
// OpenRouter uses OpenAI-compatible API (https://openrouter.ai/api/v1)
registry.register('openrouter', (config) => new OpenAIProvider({
  ...config,
  providerCode: 'openrouter',
  baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
}));
// DeepSeek uses OpenAI-compatible API (https://api.deepseek.com)
registry.register('deepseek', (config) => new OpenAIProvider({
  ...config,
  providerCode: 'deepseek',
  baseUrl: config.baseUrl || 'https://api.deepseek.com',
}));
// Google uses native Gemini SDK
registry.register('google', (config) => new GoogleProvider(config));

/**
 * Provider cache to avoid recreating providers
 * Key format: `${tenantId}:${providerCode}:${model}`
 */
const providerCache = new Map<string, ILlmProvider>();

/**
 * Create or retrieve a cached LLM provider
 */
export function createLlmProvider(
  tenantId: string,
  config: LlmProviderConfig
): ILlmProvider {
  const cacheKey = `${tenantId}:${config.providerCode}:${config.model || 'default'}`;

  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const factory = registry.get(config.providerCode);
  if (!factory) {
    throw new LlmProviderError(
      `Unknown provider: ${config.providerCode}. Available: ${registry.list().join(', ')}`,
      config.providerCode
    );
  }

  const provider = factory(config);
  providerCache.set(cacheKey, provider);

  return provider;
}

/**
 * Clear cached provider for a tenant (useful when config changes)
 */
export function clearProviderCache(tenantId: string, providerCode?: LlmProviderCode): void {
  for (const key of providerCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      if (!providerCode || key.includes(`:${providerCode}:`)) {
        providerCache.delete(key);
      }
    }
  }
}

/**
 * Clear all cached providers
 */
export function clearAllProviderCache(): void {
  providerCache.clear();
}

/**
 * Register a custom provider factory
 */
export function registerProvider(providerCode: string, factory: LlmProviderFactory): void {
  registry.register(providerCode, factory);
}

/**
 * Get list of available providers
 */
export function getAvailableProviders(): string[] {
  return registry.list();
}

/**
 * Export registry for advanced use cases
 */
export { registry as llmProviderRegistry };
