/**
 * Lookup Tool for AI Search
 *
 * Provides LLM access to lookup values from cacheable entities.
 * Used when filtering by reference fields that point to small catalog tables.
 *
 * Includes in-memory cache with TTL for sharedAcrossTenants entities.
 */

import { Tool } from './types';
import { SearchContext, SearchToolResult } from '../types';
import { SchemaMetadata } from '../security/types';

/**
 * Lookup value returned by the tool
 */
export interface LookupValue {
  id: string;
  label: string;
}

/**
 * Executor function type for fetching lookup values
 */
export type LookupExecutor = (
  entityName: string,
  context: SearchContext
) => Promise<LookupValue[]>;

/**
 * Cache entry for lookup values
 */
interface CacheEntry {
  values: LookupValue[];
  cachedAt: number;
}

/** Cache TTL: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Create the lookup tool for fetching valid values from cacheable entities
 *
 * @param schemaMetadata Schema metadata to discover lookup entities
 * @param executeQuery Function to execute the actual database query
 */
export function createLookupTool(
  schemaMetadata: SchemaMetadata,
  executeQuery: LookupExecutor
): Tool {
  // Build sets of lookup entities from schema metadata
  const lookupEntities = new Set<string>();
  const sharedLookupEntities = new Set<string>();

  for (const entity of schemaMetadata.entities) {
    for (const field of entity.fields) {
      if (field.isLookup && field.targetEntity) {
        lookupEntities.add(field.targetEntity);
        if (field.isSharedLookup) {
          sharedLookupEntities.add(field.targetEntity);
        }
      }
    }
  }

  // Convert to sorted array for consistent enum ordering
  const lookupEntityList = Array.from(lookupEntities).sort();

  // In-memory cache for shared entities only (safe to cache globally)
  const cache = new Map<string, CacheEntry>();

  /**
   * Get values from cache or execute query
   */
  const getValues = async (entityName: string, context: SearchContext): Promise<LookupValue[]> => {
    // Only use cache for sharedAcrossTenants entities
    if (sharedLookupEntities.has(entityName)) {
      // Include language in cache key to support multilang labels
      const cacheKey = `${entityName}_${context.language}`;
      const cached = cache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
        return cached.values;
      }

      // Fetch and cache
      const values = await executeQuery(entityName, context);
      cache.set(cacheKey, { values, cachedAt: now });
      return values;
    }

    // Non-shared entities: always query (filtered by tenant/permissions)
    return executeQuery(entityName, context);
  };

  return {
    name: 'get_lookup_values',
    description: `Obtiene los valores válidos para campos de tipo lookup/catálogo.

CUÁNDO USAR: Solo cuando el usuario menciona un TÉRMINO que debe mapearse a un valor de catálogo.
Ejemplos que SÍ requieren lookup: "contar mujeres", "filtrar por Rock", "autores de Argentina".

CUÁNDO NO USAR: Si el usuario NO menciona términos de catálogo.
Ejemplos que NO requieren lookup: "agrupar por cantidad", "de 2024", "más de 5 items".

Entidades disponibles: ${lookupEntityList.join(', ')}.
Devuelve lista de {id, label}. Usa "id" para filtrar, "label" para mostrar al usuario.`,
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: 'Nombre de la entidad lookup (catálogo)',
          enum: lookupEntityList.length > 0 ? lookupEntityList : undefined,
        },
        language: {
          type: 'string',
          description: 'Idioma para los valores (es, en, pt). Detectar del idioma del usuario.',
          enum: ['es', 'en', 'pt'],
        },
      },
      required: ['entity', 'language'],
    },

    handler: async (args: Record<string, unknown>, context: SearchContext): Promise<SearchToolResult> => {
      const { entity, language } = args as { entity: string; language?: string };

      // Use language from args (LLM-detected) or fall back to context
      const effectiveContext = language
        ? { ...context, language }
        : context;

      // Validate entity is a known lookup
      if (!lookupEntities.has(entity)) {
        return {
          success: false,
          error: `"${entity}" no es una entidad de lookup válida. Entidades disponibles: ${lookupEntityList.join(', ')}`,
        };
      }

      try {
        const values = await getValues(entity, effectiveContext);

        return {
          success: true,
          data: {
            entity,
            values,
            count: values.length,
            hint: 'Usa "id" para filtrar (en query_entities). Usa "label" para mostrar al usuario en tu respuesta.',
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Error al obtener valores de ${entity}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        };
      }
    },
  };
}
