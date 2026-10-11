/**
 * E-Signature Provider Factory
 *
 * Creates and caches e-signature provider instances based on tenant configuration.
 * Follows the same pattern as LLM provider factory.
 */

import {
  IESignatureProvider,
  ESignatureProviderFactory,
  ESignatureProviderRegistry,
  ESignatureError,
} from './types';
import { ESignatureConfigResolved, ESignatureProviderCode } from '../types';
import { DocuSignProvider } from './docusignProvider';
import { PandaDocProvider } from './pandadocProvider';
import { SignNowProvider } from './signnowProvider';
import { AgilSignProvider } from './agilsignProvider';

/**
 * Registry of provider factories
 */
class ProviderRegistry implements ESignatureProviderRegistry {
  private factories = new Map<string, ESignatureProviderFactory>();

  register(providerCode: string, factory: ESignatureProviderFactory): void {
    this.factories.set(providerCode, factory);
  }

  get(providerCode: string): ESignatureProviderFactory | undefined {
    return this.factories.get(providerCode);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

// Global registry instance
const registry = new ProviderRegistry();

// Register built-in providers
registry.register(ESignatureProviderCode.DOCUSIGN, (config) => new DocuSignProvider(config));
registry.register(ESignatureProviderCode.PANDADOC, (config) => new PandaDocProvider(config));
registry.register(ESignatureProviderCode.SIGNNOW, (config) => new SignNowProvider(config));
registry.register(ESignatureProviderCode.AGILSIGN, (config) => new AgilSignProvider(config));

/**
 * Provider cache to avoid recreating providers.
 * Config is global (one per provider), so the cache key is the provider code.
 */
const providerCache = new Map<string, IESignatureProvider>();

/**
 * Create or retrieve a cached e-signature provider
 */
export function createESignatureProvider(
  config: ESignatureConfigResolved
): IESignatureProvider {
  const cacheKey = config.providerCode;

  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const factory = registry.get(config.providerCode);
  if (!factory) {
    throw new ESignatureError(
      `Unknown provider: ${config.providerCode}. Available: ${registry.list().join(', ')}`,
      config.providerCode
    );
  }

  const provider = factory(config);
  providerCache.set(cacheKey, provider);

  return provider;
}

/**
 * Clear cached provider(s). With no argument, clears all.
 */
export function clearProviderCache(
  providerCode?: ESignatureProviderCode
): void {
  if (!providerCode) {
    providerCache.clear();
    return;
  }
  providerCache.delete(providerCode);
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
export function registerProvider(
  providerCode: string,
  factory: ESignatureProviderFactory
): void {
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
export { registry as esignatureProviderRegistry };
