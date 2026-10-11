/**
 * Fetchers Index - Exporta fetchers base
 *
 * Estos fetchers genéricos usan SecurePrismaOps internamente
 * para garantizar seguridad en todos los accesos a datos.
 */

export { createCountFetcher } from './count.fetcher';
export { createGroupByFetcher, GroupByResult } from './groupBy.fetcher';
