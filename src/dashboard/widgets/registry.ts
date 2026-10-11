/**
 * Fetcher Registry - Registro de data fetchers para widgets
 */

import { DataFetcher, FetcherDefinition, WidgetCacheMode, WidgetCacheScope } from '../types';

interface RegisterOptions {
  description?: string;
  cacheMode?: WidgetCacheMode;
  sourceEntities?: string[];
  cacheScope?: WidgetCacheScope;
}

class FetcherRegistry {
  private fetchers = new Map<string, FetcherDefinition>();

  register(key: string, fetcher: DataFetcher, options?: RegisterOptions | string): void {
    // Compat: la firma anterior aceptaba `(key, fetcher, description)`.
    // Soportamos ambas formas para no romper sitios existentes.
    const opts: RegisterOptions =
      typeof options === 'string'
        ? { description: options }
        : options ?? {};

    if (this.fetchers.has(key)) {
      console.warn(`Fetcher "${key}" already registered, overwriting...`);
    }

    if (opts.cacheMode === 'invalidated' && (!opts.sourceEntities || opts.sourceEntities.length === 0)) {
      throw new Error(
        `Fetcher "${key}" declared cacheMode='invalidated' but sourceEntities is empty. ` +
          `Cached widgets must declare which entities invalidate them.`
      );
    }

    this.fetchers.set(key, {
      key,
      fetcher,
      description: opts.description,
      cacheMode: opts.cacheMode ?? 'fresh',
      sourceEntities: opts.sourceEntities ?? [],
      cacheScope: opts.cacheScope ?? 'tenant',
    });
  }

  get(key: string): DataFetcher | undefined {
    return this.fetchers.get(key)?.fetcher;
  }

  has(key: string): boolean {
    return this.fetchers.has(key);
  }

  getDefinition(key: string): FetcherDefinition | undefined {
    return this.fetchers.get(key);
  }

  list(): FetcherDefinition[] {
    return Array.from(this.fetchers.values());
  }

  keys(): string[] {
    return Array.from(this.fetchers.keys());
  }
}

export const fetcherRegistry = new FetcherRegistry();
