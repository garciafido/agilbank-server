/**
 * Entity Query Tool
 *
 * Queries entities with filters, using SecurePrismaOps for security.
 * Validates all inputs against schema-metadata before executing.
 */

import { Tool } from './types';
import { SearchContext, SearchToolResult, QueryState } from '../types';
import { SchemaMetadata, FieldMetadata } from '../security/types';
import { setQueryState } from '../orchestrator/conversationService';
import {
  getRelationFilterField,
  resolveToPrisma,
  resolveFieldsToPrisma,
  mapResultToLogical,
} from './multilangHelper';
import { DEFAULT_PAGE_SIZE, QUERY_LIMITS } from '../constants';
import {
  VALID_OPERATORS_BY_TYPE,
  VALID_ID_OPERATORS,
  VALID_RELATION_OPERATORS,
  validateOperatorForType,
  normalizeTemporalField,
} from '../validators';
import { buildPrismaCondition, sanitizeWhereClause } from '../builders';

interface FilterInput {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notIn' | 'isNull' | 'isNotNull';
  value: unknown;
  /** For multi relations (sets): 'some' = at least one matches, 'every' = all match, 'none' = none match. Default: 'some' */
  relationMode?: 'some' | 'every' | 'none';
}

interface IncludeInput {
  /** Relation field name to include */
  field: string;
  /** Optional fields to select from the included entity (displayFields by default) */
  select?: string[];
}

interface QueryEntitiesArgs {
  entity: string;
  fields?: string[];
  filters?: FilterInput[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  include?: IncludeInput[];
  limit?: number;
  skip?: number;
}

interface EntityFieldsMap {
  fields: Map<string, FieldMetadata>;
  entityName: string;
  displayFields?: string[];
  multilangFields?: string[];
  labels?: Record<string, { s: string; p?: string }>;
}

/**
 * Resolved path segment for nested filter validation
 */
interface PathSegment {
  fieldName: string;
  fieldMeta: FieldMetadata;
  targetEntity?: { name: string; fields: FieldMetadata[]; multilangFields?: string[] };
  isMulti: boolean;
}

/**
 * Result of resolving a filter path
 */
interface ResolvedPath {
  segments: PathSegment[];
  leafField: FieldMetadata;
  leafEntity: { name: string; fields: FieldMetadata[]; multilangFields?: string[] };
}

/**
 * Resolve a dotted filter path against the schema.
 * Validates each segment and returns resolved metadata for WHERE building.
 *
 * Example: "WorkAuthor_author.parent_MusicalWork_authors.createdAt_"
 * - Validates WorkAuthor_author exists in AuthorComposer and is a relation
 * - Validates parent_MusicalWork_authors exists in WorkAuthor and is a relation
 * - Validates createdAt_ exists in MusicalWork
 * - Returns segments with isMulti info for relationMode wrapping
 */
function resolveFilterPath(
  path: string,
  startEntity: { name: string; fields: FieldMetadata[]; multilangFields?: string[] },
  schemaMetadata: SchemaMetadata
): { valid: true; resolved: ResolvedPath } | { valid: false; error: string } {
  const parts = path.split('.');
  let currentEntity = startEntity;
  const segments: PathSegment[] = [];

  for (let i = 0; i < parts.length; i++) {
    const fieldName = parts[i];
    const isLast = i === parts.length - 1;

    const fieldMeta = currentEntity.fields.find(f => f.name === fieldName);
    if (!fieldMeta) {
      return {
        valid: false,
        error: `Campo '${fieldName}' no existe en ${currentEntity.name}`
      };
    }

    if (isLast) {
      // Leaf field - can be scalar or relation
      const targetEntityMeta = fieldMeta.targetEntity
        ? schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity)
        : undefined;

      segments.push({
        fieldName,
        fieldMeta,
        targetEntity: targetEntityMeta ? {
          name: targetEntityMeta.name,
          fields: targetEntityMeta.fields,
          multilangFields: targetEntityMeta.multilangFields
        } : undefined,
        isMulti: fieldMeta.multi || false
      });

      return {
        valid: true,
        resolved: {
          segments,
          leafField: fieldMeta,
          leafEntity: currentEntity
        }
      };
    } else {
      // Intermediate segment - must be a relation
      if (!fieldMeta.targetEntity) {
        return {
          valid: false,
          error: `'${fieldName}' no es una relación en ${currentEntity.name}, no se puede continuar el path`
        };
      }

      const targetEntity = schemaMetadata.entities.find(
        e => e.name === fieldMeta.targetEntity
      );
      if (!targetEntity) {
        return {
          valid: false,
          error: `Entidad '${fieldMeta.targetEntity}' no encontrada en el schema`
        };
      }

      segments.push({
        fieldName,
        fieldMeta,
        targetEntity: {
          name: targetEntity.name,
          fields: targetEntity.fields,
          multilangFields: targetEntity.multilangFields
        },
        isMulti: fieldMeta.multi || false
      });

      currentEntity = {
        name: targetEntity.name,
        fields: targetEntity.fields,
        multilangFields: targetEntity.multilangFields
      };
    }
  }

  return { valid: false, error: 'Path vacío' };
}

/**
 * Build nested Prisma WHERE from resolved path segments.
 * Applies relationMode (some/every/none) to multi relations.
 *
 * Example: segments=[WorkAuthor_author(multi), parent_MusicalWork_authors(single)]
 *          leafCondition={ createdAt_: { gte: "2025-01-01" } }
 *          relationMode="none"
 *
 * Result: {
 *   WorkAuthor_author: {
 *     none: {
 *       parent_MusicalWork_authors: {
 *         createdAt_: { gte: "2025-01-01" }
 *       }
 *     }
 *   }
 * }
 */
function buildNestedWhere(
  segments: PathSegment[],
  leafCondition: Record<string, unknown>,
  relationMode: string
): Record<string, unknown> {
  let result = leafCondition;

  // Build from inside out (reverse order, skip leaf which is already in leafCondition)
  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i];

    if (segment.isMulti) {
      // Multi relation - wrap with relationMode
      result = {
        [segment.fieldName]: {
          [relationMode]: result
        }
      };
    } else {
      // Single relation - no wrapper needed
      result = {
        [segment.fieldName]: result
      };
    }
  }

  return result;
}

/**
 * Merge nested where conditions into target.
 * When same key exists, combines with AND.
 */
function mergeWhere(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
    } else {
      // Same relation with multiple conditions - wrap in AND
      if (!target.AND) {
        target.AND = [];
      }
      (target.AND as unknown[]).push({ [key]: value });
    }
  }
}

/**
 * Parse a date string value and return start/end timestamps for the period.
 * Uses Argentina timezone (UTC-3) for date interpretation.
 *
 * @returns { startDate: ISO string, endDate: ISO string } or null if invalid
 */
function parseDateValue(stringValue: string): { startDate: string; endDate: string } | null {
  // Argentina is UTC-3 (no DST currently observed)
  const ARGENTINA_OFFSET_HOURS = 3;

  let startDate: Date;
  let endDate: Date;

  // Year only: "2025"
  const yearMatch = stringValue.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    startDate = new Date(Date.UTC(year, 0, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    endDate = new Date(Date.UTC(year + 1, 0, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }

  // Year-month: "2025-06" or "2025/06"
  if (/^\d{4}[-/]\d{1,2}$/.test(stringValue)) {
    const [yearStr, monthStr] = stringValue.split(/[-/]/);
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed
    startDate = new Date(Date.UTC(year, month, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    const nextMonthNormalized = nextMonth > 11 ? 0 : nextMonth;
    endDate = new Date(Date.UTC(nextYear, nextMonthNormalized, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }

  // Year-month-day: "2025-06-15" or "2025/06/15"
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(stringValue)) {
    const parts = stringValue.split(/[-/]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    startDate = new Date(Date.UTC(year, month, day, ARGENTINA_OFFSET_HOURS, 0, 0));
    endDate = new Date(Date.UTC(year, month, day + 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }

  return null;
}

/**
 * Convert string operators on DateTime fields to proper date range queries.
 * Uses Argentina timezone (UTC-3) for date interpretation.
 *
 * Examples:
 * - contains "2025" → gte: 2025-01-01T03:00:00Z, lt: 2026-01-01T03:00:00Z
 * - contains "2025-06" → gte: 2025-06-01T03:00:00Z, lt: 2025-07-01T03:00:00Z
 * - startsWith "2025" → same as contains
 * - gte "2024-03-01" → gte: 2024-03-01T03:00:00Z (start of day in Argentina)
 * - lt "2025" → lt: 2025-01-01T03:00:00Z (start of year in Argentina)
 */
function convertDateTimeFilter(
  operator: string,
  value: unknown
): { converted: true; condition: unknown } | { converted: false; error?: string } {
  const stringValue = String(value).trim();

  // Check if value is already ISO 8601 format (has T or Z)
  if (stringValue.includes('T') || stringValue.endsWith('Z')) {
    // Already a proper timestamp, let Prisma handle it
    return { converted: false };
  }

  // Handle comparison operators (gte, lte, gt, lt) - convert to proper ISO timestamp
  if (['gte', 'lte', 'gt', 'lt'].includes(operator)) {
    const parsed = parseDateValue(stringValue);
    if (!parsed) {
      return {
        converted: false,
        error: `Formato de fecha inválido '${stringValue}'. Use YYYY, YYYY-MM, o YYYY-MM-DD.`,
      };
    }

    // For gte/gt: use start of period
    // For lte/lt: use end of period (start of next period)
    const useEndOfPeriod = operator === 'lte' || operator === 'lt';
    const timestamp = useEndOfPeriod ? parsed.endDate : parsed.startDate;

    // For 'lt' and 'gte', use the timestamp directly
    // For 'lte', convert to 'lt' with end of period (exclusive end)
    // For 'gt', convert to 'gte' with end of period (exclusive start)
    if (operator === 'lte') {
      // "lte 2024" means "before 2025-01-01" = lt 2025-01-01
      return { converted: true, condition: { lt: timestamp } };
    } else if (operator === 'gt') {
      // "gt 2024" means "on or after 2025-01-01" = gte 2025-01-01
      return { converted: true, condition: { gte: parsed.endDate } };
    } else {
      // gte and lt use timestamp directly
      return { converted: true, condition: { [operator]: timestamp } };
    }
  }

  // Only convert string operators that don't work on DateTime
  if (!['contains', 'notContains', 'startsWith', 'endsWith'].includes(operator)) {
    return { converted: false };
  }

  // Use shared date parsing
  const parsed = parseDateValue(stringValue);
  if (!parsed) {
    return {
      converted: false,
      error: `Formato de fecha inválido '${stringValue}'. Use YYYY, YYYY-MM, o YYYY-MM-DD.`,
    };
  }

  // Build the condition based on operator
  if (operator === 'contains' || operator === 'startsWith') {
    // Records within the date range
    return {
      converted: true,
      condition: {
        gte: parsed.startDate,
        lt: parsed.endDate,
      },
    };
  } else if (operator === 'notContains' || operator === 'endsWith') {
    // Records outside the date range (before start OR after/equal end)
    return {
      converted: true,
      condition: {
        OR: [
          { lt: parsed.startDate },
          { gte: parsed.endDate },
        ],
      },
    };
  }

  return { converted: false };
}

/**
 * Check if a field type is DateTime
 */
function isDateTimeField(fieldType: string): boolean {
  return ['DateTime', 'Date'].includes(fieldType);
}

/**
 * Sanitize result to only include allowed fields
 */
function sanitizeResult(record: Record<string, unknown>, allowedFields: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // Include field if it's in allowedFields
    // Fields ending with _ are allowed if explicitly in metadata (e.g., createdAt_, updatedAt_)
    if (allowedFields.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Build nested Prisma include structure from dot notation path.
 * e.g., "works.authors.author" becomes:
 * { works: { select: { authors: { select: { author: { select: { displayFields } } } } } } }
 */
function buildNestedInclude(
  pathParts: string[],
  startEntityName: string,
  startEntityFields: Map<string, FieldMetadata>,
  allowedEntities: Map<string, EntityFieldsMap>,
  schemaMetadata: SchemaMetadata,
  context: SearchContext,
  language: string
): { success: true; include: Record<string, unknown> } | { success: false; error: string } {
  if (pathParts.length === 0) {
    return { success: false, error: 'Path vacío' };
  }

  let currentEntityName = startEntityName;
  let currentEntityFields = startEntityFields;

  // Build the nested structure from inside out
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentSelect: Record<string, any> | null = null;

  // Process path from end to start to build nested structure
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const fieldName = pathParts[i];

    // For validation, we need to traverse from start
    // Get the entity at position i
    let entityAtPos = startEntityName;
    let fieldsAtPos = startEntityFields;
    for (let j = 0; j < i; j++) {
      const f = pathParts[j];
      const fMeta = fieldsAtPos.get(f);
      if (!fMeta?.targetEntity) {
        return { success: false, error: `'${f}' no es una relación en ${entityAtPos}` };
      }
      entityAtPos = fMeta.targetEntity;
      const entityInfo = allowedEntities.get(entityAtPos);
      if (!entityInfo) {
        return { success: false, error: `Entidad '${entityAtPos}' no disponible` };
      }
      fieldsAtPos = entityInfo.fields;
    }

    // Now validate the field at position i
    const fieldMeta = fieldsAtPos.get(fieldName);
    if (!fieldMeta) {
      return { success: false, error: `Campo '${fieldName}' no existe en ${entityAtPos}` };
    }
    if (!fieldMeta.targetEntity) {
      return { success: false, error: `'${fieldName}' no es una relación en ${entityAtPos}` };
    }

    // Check permission
    const targetEntity = fieldMeta.targetEntity;
    const targetPermCode = `${targetEntity.charAt(0).toLowerCase() + targetEntity.slice(1)}_retrieve`;
    const hasTargetPerm = context.permissions.includes(targetPermCode) || context.permissions.includes('*');
    if (!hasTargetPerm) {
      return { success: false, error: `Sin permiso para consultar ${targetEntity}` };
    }

    // Build select for this level
    const targetEntityInfo = allowedEntities.get(targetEntity);
    if (!targetEntityInfo) {
      return { success: false, error: `Entidad destino '${targetEntity}' no disponible` };
    }
    const targetMeta = schemaMetadata.entities.find(e => e.name === targetEntity);

    // Get displayFields for this entity (used for both leaf and intermediate levels)
    const displayFields = targetEntityInfo.displayFields ||
      Array.from(targetEntityInfo.fields.keys()).filter(f => !f.includes('_')).slice(0, 5);

    // Build base select with id and scalar displayFields
    const baseSelect: Record<string, boolean | Record<string, unknown>> = { id: true };
    for (const df of displayFields) {
      const dfMeta = targetEntityInfo.fields.get(df);
      // Only include scalar fields (not relations)
      if (!dfMeta?.targetEntity) {
        const prismaF = targetMeta ? resolveToPrisma(df, targetMeta, language) : df;
        baseSelect[prismaF] = true;
      }
    }

    if (i === pathParts.length - 1) {
      // Leaf level - just use baseSelect
      currentSelect = { [fieldName]: { select: baseSelect } };
    } else {
      // Intermediate level - include baseSelect fields + nested relation
      const intermediateSelect = { ...baseSelect, ...currentSelect };
      currentSelect = { [fieldName]: { select: intermediateSelect } };
    }
  }

  return { success: true, include: currentSelect || {} };
}

/**
 * Merge nested include into existing prismaInclude structure.
 * Handles merging at each level to combine multiple paths.
 */
function mergeNestedInclude(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
    } else if (
      typeof target[key] === 'object' && target[key] !== null &&
      typeof value === 'object' && value !== null
    ) {
      // Both are objects, need to merge select
      const targetObj = target[key] as Record<string, unknown>;
      const sourceObj = value as Record<string, unknown>;
      if (targetObj.select && sourceObj.select) {
        mergeNestedInclude(
          targetObj.select as Record<string, unknown>,
          sourceObj.select as Record<string, unknown>
        );
      }
    }
  }
}

/**
 * Create entity query tool factory
 *
 * @param schemaMetadata - AI Search schema metadata
 * @param executeSecureQuery - Function to execute secure Prisma queries
 *        IMPORTANT: The `allowedFields` parameter contains the ONLY fields that
 *        should be selected from the database. Never use SELECT * - always use
 *        explicit field list from allowedFields.
 */
export function createEntityQueryTool(
  schemaMetadata: SchemaMetadata,
  executeSecureQuery: (
    entityName: string,
    operation: 'findMany',
    args: Record<string, unknown>,
    context: SearchContext,
    allowedFields: string[]  // Fields that CAN be selected - use for SELECT clause
  ) => Promise<unknown[]>
): Tool {
  // Build lookup maps for fast validation
  const allowedEntities = new Map<string, EntityFieldsMap>();

  for (const entity of schemaMetadata.entities) {
    const fieldsMap = new Map<string, FieldMetadata>();
    for (const field of entity.fields) {
      fieldsMap.set(field.name, field);
    }
    allowedEntities.set(entity.name, {
      fields: fieldsMap,
      entityName: entity.name,
      displayFields: entity.displayFields,
      multilangFields: entity.multilangFields,
      labels: entity.labels,
    });
  }

  const entityNames = Array.from(allowedEntities.keys());

  return {
    name: 'query_entities',
    description: 'Consulta registros de una entidad con filtros. Usa esto para buscar obras, titulares, pagos, etc.',
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: `Nombre de la entidad a consultar. Opciones: ${entityNames.join(', ')}`,
          enum: entityNames,
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campos a devolver. Soporta notación con punto para relaciones: "author.firstName", "author.lastName". Por defecto devuelve campos principales.',
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Nombre del campo a filtrar' },
              operator: { type: 'string', enum: ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'isNull', 'isNotNull'] },
              value: { type: 'string', description: 'Valor a comparar (string, número o array según operador)' },
              relationMode: { type: 'string', enum: ['some', 'every', 'none'], description: 'Para relaciones multi (sets): some=al menos uno cumple (default), every=todos cumplen, none=ninguno cumple' },
            },
            required: ['field', 'operator', 'value'],
          },
          description: 'Filtros a aplicar',
        },
        orderBy: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Campo por el cual ordenar' },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
          description: 'Ordenamiento',
        },
        include: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Nombre del campo de relación' },
              select: { type: 'array', items: { type: 'string' }, description: 'Campos a incluir del registro relacionado' },
            },
            required: ['field'],
          },
          description: 'Relaciones a incluir',
        },
        limit: {
          type: 'number',
          description: 'Resultados por página (default: 10, max: 20)',
        },
        skip: {
          type: 'number',
          description: 'Registros a saltar para paginación (default: 0). Ej: skip=10 para segunda página',
        },
        language: {
          type: 'string',
          description: 'Idioma para campos multilang (es, en, pt). Detectar del idioma del usuario.',
          enum: ['es', 'en', 'pt'],
        },
        reasoning: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Pattern ID from Navigation Patterns section (e.g., entity-only-list, nested-set, inverse-ref)',
            },
            path: {
              type: 'string',
              description: 'Navigation path: Entity → field → Entity → field → ... (e.g., Edition → works → authors → author → nationality)',
            },
          },
          required: ['pattern', 'path'],
          description: 'MANDATORY: Your reasoning for choosing this tool and pattern. Must match a pattern from Navigation Patterns.',
        },
      },
      required: ['entity', 'language', 'reasoning'],
    },

    handler: async (args: Record<string, unknown>, context: SearchContext): Promise<SearchToolResult> => {
      const { entity, fields: requestedFields, filters, orderBy, include, limit, skip, language } = args as QueryEntitiesArgs & { language?: string };

      // Use language from args (LLM-detected) or fall back to context
      const effectiveContext = language
        ? { ...context, language }
        : context;

      try {
        // === VALIDATION 1: Entity exists in schema-metadata ===
        const entityInfo = allowedEntities.get(entity);
        if (!entityInfo) {
          return { success: false, error: `Entidad '${entity}' no disponible para consulta` };
        }

        const allowedFields = entityInfo.fields;
        const allowedFieldNames = new Set(allowedFields.keys());

        // === DETERMINE FIELDS TO SELECT ===
        // Supports dot notation for relations: "author.firstName" -> { author: { select: { firstName: true } } }
        const directFields: string[] = [];
        const nestedFieldsMap: Map<string, { targetEntity: string; fields: Set<string> }> = new Map();

        if (requestedFields && requestedFields.length > 0) {
          for (const f of requestedFields) {
            if (f.includes('.')) {
              // Nested field: relation.field (e.g., author.firstName)
              const [relationName, nestedField] = f.split('.');
              const relationMeta = allowedFields.get(relationName);

              if (!relationMeta) {
                return { success: false, error: `Campo '${relationName}' no existe en ${entity}` };
              }
              if (!relationMeta.targetEntity) {
                return { success: false, error: `Campo '${relationName}' no es una relación` };
              }

              // Validate permission for target entity
              const targetEntity = relationMeta.targetEntity;
              const targetPermCode = `${targetEntity.charAt(0).toLowerCase() + targetEntity.slice(1)}_retrieve`;
              const hasTargetPerm = context.permissions.includes(targetPermCode) || context.permissions.includes('*');
              if (!hasTargetPerm) {
                return { success: false, error: `Sin permiso para consultar ${targetEntity}` };
              }

              // Validate nested field exists in target entity
              const targetEntityInfo = allowedEntities.get(targetEntity);
              if (!targetEntityInfo) {
                return { success: false, error: `Entidad '${targetEntity}' no disponible` };
              }
              if (!targetEntityInfo.fields.has(nestedField)) {
                return { success: false, error: `Campo '${nestedField}' no existe en ${targetEntity}` };
              }

              // Add to nested fields map
              if (!nestedFieldsMap.has(relationName)) {
                nestedFieldsMap.set(relationName, { targetEntity, fields: new Set() });
              }
              nestedFieldsMap.get(relationName)!.fields.add(nestedField);
            } else {
              // Direct field - check if it exists
              if (!allowedFieldNames.has(f)) {
                return { success: false, error: `Campo '${f}' no disponible en ${entity}` };
              }

              // Check if this field is a relation - if so, treat as include with displayFields
              const fieldMeta = allowedFields.get(f);
              if (fieldMeta?.targetEntity) {
                // This is a relation field passed in fields[] - convert to nested include
                const targetEntity = fieldMeta.targetEntity;
                const targetPermCode = `${targetEntity.charAt(0).toLowerCase() + targetEntity.slice(1)}_retrieve`;
                const hasTargetPerm = context.permissions.includes(targetPermCode) || context.permissions.includes('*');
                if (!hasTargetPerm) {
                  return { success: false, error: `Sin permiso para consultar ${targetEntity}` };
                }

                const targetEntityInfo = allowedEntities.get(targetEntity);
                if (targetEntityInfo) {
                  // Use displayFields from target entity
                  const targetDisplayFields = targetEntityInfo.displayFields ||
                    Array.from(targetEntityInfo.fields.keys()).filter(tf => !tf.includes('_')).slice(0, 3);

                  if (!nestedFieldsMap.has(f)) {
                    nestedFieldsMap.set(f, { targetEntity, fields: new Set() });
                  }
                  for (const tdf of targetDisplayFields) {
                    // Only add scalar fields, not nested relations
                    const tdfMeta = targetEntityInfo.fields.get(tdf);
                    if (!tdfMeta?.targetEntity) {
                      nestedFieldsMap.get(f)!.fields.add(tdf);
                    }
                  }
                }
              } else {
                // Scalar field
                directFields.push(f);
              }
            }
          }
        }

        // If no direct fields specified, use displayFields by default
        // NOTE: These are LOGICAL field names (for LLM/result mapping)
        const logicalFieldsToSelect = directFields.length > 0
          ? directFields
          : (entityInfo.displayFields && entityInfo.displayFields.length > 0
              ? entityInfo.displayFields.filter(f => allowedFieldNames.has(f))
              : Array.from(allowedFieldNames).slice(0, 3));

        // Convert logical names to Prisma column names for the actual query
        // Find entity metadata for multilang resolution
        const entityMeta = schemaMetadata.entities.find(e => e.name === entity);
        const prismaFieldsToSelect = entityMeta
          ? resolveFieldsToPrisma(logicalFieldsToSelect, entityMeta, effectiveContext.language)
          : logicalFieldsToSelect;

        const prismaFieldsToSelectSet = new Set(prismaFieldsToSelect);

        // === VALIDATION 2: User has retrieve permission ===
        const permissionCode = `${entity.charAt(0).toLowerCase() + entity.slice(1)}_retrieve`;
        const hasPermission = context.permissions.includes(permissionCode) || context.permissions.includes('*');
        if (!hasPermission) {
          return { success: false, error: `Sin permiso para consultar ${entity}` };
        }

        // === VALIDATION 3: All filter fields exist and operators are compatible ===
        if (filters && Array.isArray(filters)) {
          for (const f of filters) {
            // Normalize temporal fields (LLMs sometimes omit the underscore)
            f.field = normalizeTemporalField(f.field);

            if (f.field.includes('.')) {
              // Nested path - validate recursively using schema metadata
              if (!entityMeta) {
                return { success: false, error: `Metadata de entidad '${entity}' no encontrada` };
              }

              const pathResult = resolveFilterPath(f.field, entityMeta, schemaMetadata);
              if (!pathResult.valid) {
                return { success: false, error: pathResult.error };
              }

              // Validate operator against leaf field type (including relation fields)
              const isRelation = !!pathResult.resolved.leafField.targetEntity;
              const opError = validateOperatorForType(
                pathResult.resolved.leafField.name,
                pathResult.resolved.leafField.type,
                f.operator,
                isRelation
              );
              if (opError) {
                return { success: false, error: opError };
              }

              // Store resolved path for WHERE building
              (f as FilterInput & { _resolved?: ResolvedPath })._resolved = pathResult.resolved;
            } else {
              // Direct field - validate against allowed fields
              if (!allowedFieldNames.has(f.field)) {
                return { success: false, error: `Campo '${f.field}' no disponible en ${entity}` };
              }
              // Validate operator is compatible with field type (including relation fields)
              const fieldMeta = allowedFields.get(f.field);
              if (fieldMeta) {
                const isRelation = !!fieldMeta.targetEntity;
                const opError = validateOperatorForType(f.field, fieldMeta.type, f.operator, isRelation);
                if (opError) {
                  return { success: false, error: opError };
                }

                // If relation field and value is a number, user likely wants to count (use count_entities with having)
                if (isRelation && typeof f.value === 'number') {
                  return {
                    success: false,
                    error: `Campo '${f.field}' es una relación. Para filtrar por CANTIDAD de items (${f.value}), use count_entities con countRelation="${f.field}" y having={countField:"${f.field}", operator:"equals", value:${f.value}}. Los filters en campos relación comparan texto/nombre, no cantidades.`
                  };
                }
              }
            }
          }
        }

        // === VALIDATION 4: OrderBy field exists (supports relation.field format) ===
        let orderByPrisma: Record<string, unknown> | undefined;
        if (orderBy) {
          const orderByField = orderBy.field;
          if (orderByField.includes('.')) {
            // Nested field: relation.field (e.g., author.lastName)
            const [relationName, nestedField] = orderByField.split('.');
            const relationMeta = allowedFields.get(relationName);
            if (!relationMeta || !relationMeta.targetEntity) {
              return { success: false, error: `Campo '${relationName}' no es una relación válida para ordenar` };
            }
            // Validate nested field exists in target entity
            const targetEntityInfo = allowedEntities.get(relationMeta.targetEntity);
            if (!targetEntityInfo || !targetEntityInfo.fields.has(nestedField)) {
              return { success: false, error: `Campo '${nestedField}' no existe en ${relationMeta.targetEntity}` };
            }
            // Resolve multilang field (e.g., "name" → "name_es")
            const targetMeta = schemaMetadata.entities.find(e => e.name === relationMeta.targetEntity);
            const resolvedNestedField = targetMeta
              ? resolveToPrisma(nestedField, targetMeta, effectiveContext.language)
              : nestedField;
            // Build nested orderBy: { author: { name_es: 'asc' } }
            orderByPrisma = { [relationName]: { [resolvedNestedField]: orderBy.direction } };
          } else {
            // Direct field
            if (!allowedFieldNames.has(orderByField)) {
              return { success: false, error: `Campo '${orderByField}' no disponible para ordenar` };
            }
            // Check if it's a relation field - can't orderBy directly on relations
            const fieldMeta = allowedFields.get(orderByField);
            if (fieldMeta?.targetEntity) {
              return {
                success: false,
                error: `No se puede ordenar por '${orderByField}' directamente. Use formato relacion.campo (ej: ${orderByField}.nombre)`,
              };
            }
            // Resolve multilang field (e.g., "name" → "name_es")
            const resolvedOrderByField = entityMeta
              ? resolveToPrisma(orderByField, entityMeta, effectiveContext.language)
              : orderByField;
            orderByPrisma = { [resolvedOrderByField]: orderBy.direction };
          }
        }

        // === VALIDATION 5: Include fields validation ===
        const prismaInclude: Record<string, unknown> = {};
        const includedEntityMaps: Map<string, { fields: Set<string>; fieldName: string; targetEntity: string }> = new Map();

        if (include && Array.isArray(include)) {
          // Pre-process: collect all include field names to detect overlaps
          // If a simple include (no dots) has a dot-notation include that extends it,
          // skip the simple one to avoid merge conflicts
          const allIncludeFields = include.map(rawInc =>
            typeof rawInc === 'string' ? rawInc : (rawInc as IncludeInput).field
          );
          const simpleIncludesToSkip = new Set<string>();
          for (const field of allIncludeFields) {
            if (!field.includes('.')) {
              // Check if there's a dot-notation include that starts with this field
              const hasExtension = allIncludeFields.some(f =>
                f.startsWith(field + '.')
              );
              if (hasExtension) {
                simpleIncludesToSkip.add(field);
              }
            }
          }

          for (const rawInc of include) {
            // Normalize: accept both string and {field: string} formats
            const inc: IncludeInput = typeof rawInc === 'string'
              ? { field: rawInc }
              : rawInc;

            // Skip simple includes that have dot-notation extensions
            // The dot-notation version will handle the full path
            if (simpleIncludesToSkip.has(inc.field)) {
              continue;
            }

            // === DOT NOTATION SUPPORT (patay-eval V7 style) ===
            // If field contains dots, treat as nested path: "works.authors.author"
            // Convert to nested include structure for Prisma
            if (inc.field.includes('.')) {
              const pathParts = inc.field.split('.');
              const result = buildNestedInclude(
                pathParts,
                entity,
                allowedFields,
                allowedEntities,
                schemaMetadata,
                context,
                effectiveContext.language
              );
              if (!result.success) {
                return { success: false, error: result.error };
              }
              // Merge the nested include into prismaInclude
              mergeNestedInclude(prismaInclude, result.include);
              // Track the root field for result mapping
              const rootField = pathParts[0];
              // Add rootField to allowed fields so sanitizeResult doesn't strip it
              prismaFieldsToSelectSet.add(rootField);
              if (!includedEntityMaps.has(rootField)) {
                const rootFieldMeta = allowedFields.get(rootField);
                if (rootFieldMeta?.targetEntity) {
                  includedEntityMaps.set(rootField, {
                    // Use '__deep__' marker to indicate deep nested include (don't sanitize contents)
                    fields: new Set(['__deep__']),
                    fieldName: rootField,
                    targetEntity: rootFieldMeta.targetEntity,
                  });
                }
              }
              continue; // Skip normal processing for dot notation
            }

            // SECURITY: Reject inverse relation patterns using schema metadata
            // Inverse relations are informational metadata, NOT executable fields
            const entityMeta = schemaMetadata.entities.find(e => e.name === entity);
            const isInverseRelation = entityMeta?.inverseRelations?.some(
              inv => inv.relationName === inc.field
            );
            if (isInverseRelation) {
              return {
                success: false,
                error: `Relación inversa '${inc.field}' no permitida. Use query separada a la otra entidad.`,
              };
            }

            // Check if field exists in entity.fields (inverse relations are NOT in fields)
            const fieldMeta = allowedFields.get(inc.field);
            if (!fieldMeta) {
              return { success: false, error: `Campo '${inc.field}' no existe en ${entity}` };
            }

            // Check if it's a relation field (has targetEntity)
            if (!fieldMeta.targetEntity) {
              return { success: false, error: `Campo '${inc.field}' no es una relación` };
            }

            // Check if user has permission to read the target entity
            const targetEntity = fieldMeta.targetEntity;
            const targetPermCode = `${targetEntity.charAt(0).toLowerCase() + targetEntity.slice(1)}_retrieve`;
            const hasTargetPerm = context.permissions.includes(targetPermCode) || context.permissions.includes('*');
            if (!hasTargetPerm) {
              return { success: false, error: `Sin permiso para consultar ${targetEntity} incluido en ${inc.field}` };
            }

            // Get target entity metadata for field validation
            const targetEntityInfo = allowedEntities.get(targetEntity);
            if (!targetEntityInfo) {
              return { success: false, error: `Entidad destino '${targetEntity}' no disponible` };
            }

            // Determine which fields to select
            let selectFields: string[];
            if (inc.select && inc.select.length > 0) {
              // Validate specified select fields exist in target entity
              for (const selectField of inc.select) {
                if (!targetEntityInfo.fields.has(selectField)) {
                  return { success: false, error: `Campo '${selectField}' no existe en ${targetEntity}` };
                }
              }
              selectFields = inc.select;
            } else {
              // Use displayFields from target entity, or first 3 fields
              selectFields = targetEntityInfo.displayFields ||
                Array.from(targetEntityInfo.fields.keys()).slice(0, 3);
            }

            // Build Prisma select for the relation
            // If a field is itself a relation, nest its displayFields
            // Get target entity metadata for multilang resolution
            const targetMeta = schemaMetadata.entities.find(e => e.name === targetEntity);
            const prismaSelect: Record<string, boolean | { select: Record<string, boolean> }> = {};
            for (const sf of selectFields) {
              const nestedFieldMeta = targetEntityInfo.fields.get(sf);
              if (nestedFieldMeta?.targetEntity) {
                // This field is a relation - check permission before including
                const nestedTargetEntity = nestedFieldMeta.targetEntity;
                const nestedPermCode = `${nestedTargetEntity.charAt(0).toLowerCase() + nestedTargetEntity.slice(1)}_retrieve`;
                const hasNestedPerm = context.permissions.includes(nestedPermCode) || context.permissions.includes('*');

                if (!hasNestedPerm) {
                  // SECURITY: Skip nested relation if user doesn't have permission
                  // Don't error - just exclude the field silently
                  continue;
                }

                const nestedTargetInfo = allowedEntities.get(nestedTargetEntity);
                if (nestedTargetInfo) {
                  const nestedDisplayFields = nestedTargetInfo.displayFields ||
                    Array.from(nestedTargetInfo.fields.keys()).filter(f => !f.includes('_')).slice(0, 3);
                  // Get nested entity metadata for multilang resolution
                  const nestedTargetMeta = schemaMetadata.entities.find(e => e.name === nestedTargetEntity);
                  const nestedSelect: Record<string, boolean> = {};
                  for (const nf of nestedDisplayFields) {
                    // Only include scalar fields, not further relations
                    const nfMeta = nestedTargetInfo.fields.get(nf);
                    if (!nfMeta?.targetEntity) {
                      // Resolve logical name to Prisma column name
                      const prismaNf = nestedTargetMeta
                        ? resolveToPrisma(nf, nestedTargetMeta, effectiveContext.language)
                        : nf;
                      nestedSelect[prismaNf] = true;
                    }
                  }
                  prismaSelect[sf] = { select: nestedSelect };
                } else {
                  prismaSelect[sf] = true;
                }
              } else {
                // Resolve logical name to Prisma column name
                const prismaSf = targetMeta
                  ? resolveToPrisma(sf, targetMeta, effectiveContext.language)
                  : sf;
                prismaSelect[prismaSf] = true;
              }
            }

            prismaInclude[inc.field] = { select: prismaSelect };
            includedEntityMaps.set(inc.field, {
              fields: new Set(selectFields),
              fieldName: inc.field,
              targetEntity,
            });
          }
        }

        // === ADD NESTED FIELDS FROM DOT NOTATION ===
        // Merge fields from dot notation (e.g., author.firstName) into prismaInclude
        for (const [relationName, { targetEntity, fields }] of nestedFieldsMap.entries()) {
          // Get target entity metadata for multilang resolution
          const targetMeta = schemaMetadata.entities.find(e => e.name === targetEntity);

          if (prismaInclude[relationName]) {
            // Relation already in include, merge fields
            const existingSelect = (prismaInclude[relationName] as { select: Record<string, boolean> }).select;
            for (const f of fields) {
              // Resolve logical name to Prisma column name
              const prismaF = targetMeta
                ? resolveToPrisma(f, targetMeta, effectiveContext.language)
                : f;
              existingSelect[prismaF] = true;
            }
            // Also update includedEntityMaps (keep logical names for result mapping)
            const existingMap = includedEntityMaps.get(relationName);
            if (existingMap) {
              for (const f of fields) {
                existingMap.fields.add(f);
              }
            }
          } else {
            // New relation from dot notation
            const prismaSelect: Record<string, boolean> = {};
            for (const f of fields) {
              // Resolve logical name to Prisma column name
              const prismaF = targetMeta
                ? resolveToPrisma(f, targetMeta, effectiveContext.language)
                : f;
              prismaSelect[prismaF] = true;
            }
            prismaInclude[relationName] = { select: prismaSelect };
            includedEntityMaps.set(relationName, {
              fields: new Set(fields),  // Keep logical names for result mapping
              fieldName: relationName,
              targetEntity,
            });
          }
        }

        // === BUILD SECURE WHERE ===
        const where: Record<string, unknown> = {};
        if (filters && Array.isArray(filters)) {
          for (const f of filters) {
            const relationMode = f.relationMode || 'some';
            const resolved = (f as FilterInput & { _resolved?: ResolvedPath })._resolved;

            if (resolved) {
              // Nested path - build recursive structure
              const leafSegment = resolved.segments[resolved.segments.length - 1];
              let leafCondition: Record<string, unknown>;

              if (resolved.leafField.targetEntity) {
                // Leaf is a relation - determine filter field
                // For lookup entities: filter by id (value from get_lookup_values)
                // For in/notIn operators: filter by id (LLM provides IDs from lookups)
                // For regular entities: filter by text field (multilang-aware)
                const isIdBasedOperator = ['in', 'notIn'].includes(f.operator);
                const filterField = resolved.leafField.isLookup || isIdBasedOperator
                  ? 'id'
                  : getRelationFilterField(
                      schemaMetadata.entities.find(e => e.name === resolved.leafField.targetEntity),
                      effectiveContext.language
                    );

                if (leafSegment.isMulti) {
                  leafCondition = {
                    [leafSegment.fieldName]: {
                      [relationMode]: {
                        [filterField]: buildPrismaCondition(f.operator, f.value)
                      }
                    }
                  };
                } else if (isIdBasedOperator) {
                  // Single relation with in/notIn: use FK field directly
                  leafCondition = {
                    [`${leafSegment.fieldName}_id`]: buildPrismaCondition(f.operator, f.value)
                  };
                } else {
                  leafCondition = {
                    [leafSegment.fieldName]: {
                      [filterField]: buildPrismaCondition(f.operator, f.value)
                    }
                  };
                }
              } else if (isDateTimeField(resolved.leafField.type)) {
                // DateTime leaf - convert string operators
                const dateConversion = convertDateTimeFilter(f.operator, f.value);
                if (dateConversion.converted) {
                  leafCondition = { [leafSegment.fieldName]: dateConversion.condition };
                } else if (dateConversion.error) {
                  return { success: false, error: dateConversion.error };
                } else {
                  leafCondition = { [leafSegment.fieldName]: buildPrismaCondition(f.operator, f.value) };
                }
              } else {
                // Scalar leaf
                leafCondition = { [leafSegment.fieldName]: buildPrismaCondition(f.operator, f.value) };
              }

              // Build nested structure (if more than 1 segment)
              if (resolved.segments.length > 1) {
                const nestedWhere = buildNestedWhere(resolved.segments, leafCondition, relationMode);
                mergeWhere(where, nestedWhere);
              } else {
                mergeWhere(where, leafCondition);
              }
            } else {
              // Direct field (no dots) - existing logic
              const fieldMeta = allowedFields.get(f.field);
              if (fieldMeta?.targetEntity) {
                // Relation field - convert to nested where
                // For lookup entities: filter by id (value from get_lookup_values)
                // For in/notIn operators: filter by id (LLM provides IDs from lookups)
                // For regular entities: filter by text field (multilang-aware)
                const targetEntityMeta = schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);
                const isIdBasedOperator = ['in', 'notIn'].includes(f.operator);
                const filterField = fieldMeta.isLookup || isIdBasedOperator
                  ? 'id'
                  : getRelationFilterField(targetEntityMeta, effectiveContext.language);

                // For multi relations (sets), wrap with relationMode (some/every/none)
                if (fieldMeta.multi) {
                  where[f.field] = {
                    [relationMode]: {
                      [filterField]: buildPrismaCondition(f.operator, f.value),
                    },
                  };
                } else if (isIdBasedOperator) {
                  // Single relation with in/notIn: use FK field directly
                  // Prisma doesn't support { relation: { id: { in: [...] } } }
                  // Must use: { relation_id: { in: [...] } }
                  where[`${f.field}_id`] = buildPrismaCondition(f.operator, f.value);
                } else {
                  // Single relation with other operators - use nested where
                  where[f.field] = {
                    [filterField]: buildPrismaCondition(f.operator, f.value),
                  };
                }
              } else if (fieldMeta && isDateTimeField(fieldMeta.type)) {
                // DateTime field - convert string operators to date range queries
                const dateConversion = convertDateTimeFilter(f.operator, f.value);
                if (dateConversion.converted) {
                  where[f.field] = dateConversion.condition;
                } else if (dateConversion.error) {
                  return { success: false, error: dateConversion.error };
                } else {
                  // Not a string operator, use standard condition
                  where[f.field] = buildPrismaCondition(f.operator, f.value);
                }
              } else {
                // Scalar field - use directly
                where[f.field] = buildPrismaCondition(f.operator, f.value);
              }
            }
          }
        }

        // === EXECUTE WITH SECURE OPS ===
        // Use N+1 trick: fetch one extra to detect if there are more pages
        const pageSize = Math.min(limit || DEFAULT_PAGE_SIZE, QUERY_LIMITS.ABSOLUTE_MAX);
        const skipCount = skip || 0;

        // Sanitize where clause to fix common LLM-generated issues
        // (e.g., { id: null } or { not: null } in relation filters)
        const sanitizedWhere = sanitizeWhereClause(where);

        const queryArgs: Record<string, unknown> = {
          where: sanitizedWhere,
          orderBy: orderByPrisma,
          take: pageSize + 1,  // Fetch one extra to detect more pages
          skip: skipCount,
        };

        if (Object.keys(prismaInclude).length > 0) {
          queryArgs.include = prismaInclude;
        }

        // Pass selected fields to query executor (Prisma column names)
        const rawResults = await executeSecureQuery(
          entity,
          'findMany',
          queryArgs,
          effectiveContext,
          prismaFieldsToSelect
        );

        // Check if there are more pages
        const hasMore = rawResults.length > pageSize;
        const results = hasMore ? rawResults.slice(0, pageSize) : rawResults;

        // Map results from Prisma column names back to logical names for LLM
        const sanitized = (results as Record<string, unknown>[]).map(r => {
          // First sanitize with Prisma field names, then map to logical names
          const sanitizedRecord = sanitizeResult(r, prismaFieldsToSelectSet);

          // Map Prisma column names (e.g., name_es) back to logical names (e.g., name)
          const logicalRecord = entityMeta
            ? mapResultToLogical(sanitizedRecord, entityMeta, effectiveContext.language)
            : sanitizedRecord;

          // Also map included relations to logical names
          // Note: fields in includedEntityMaps are logical names for validation
          for (const [fieldName, { fields, targetEntity }] of includedEntityMaps.entries()) {
            if (r[fieldName] !== undefined && r[fieldName] !== null) {
              const relatedData = r[fieldName];
              const targetMeta = schemaMetadata.entities.find(e => e.name === targetEntity);
              // Check for __deep__ marker (deep nested includes preserve full structure)
              const isDeepInclude = fields.has('__deep__');

              if (Array.isArray(relatedData)) {
                // Multi relation (set)
                logicalRecord[fieldName] = relatedData.map((item: Record<string, unknown>) => {
                  // First map Prisma column names to logical names
                  const logicalItem = targetMeta
                    ? mapResultToLogical(item, targetMeta, effectiveContext.language)
                    : item;
                  // Deep includes preserve full nested structure, others sanitize
                  return isDeepInclude ? logicalItem : sanitizeResult(logicalItem, fields);
                });
              } else {
                // Single relation
                const logicalItem = targetMeta
                  ? mapResultToLogical(relatedData as Record<string, unknown>, targetMeta, effectiveContext.language)
                  : relatedData as Record<string, unknown>;
                logicalRecord[fieldName] = isDeepInclude ? logicalItem : sanitizeResult(logicalItem, fields);
              }
            }
          }

          return logicalRecord;
        });

        // Get entity label for user-friendly message (prefer plural form)
        const entityLabel = entityInfo.labels?.['es']?.p
          || entityInfo.labels?.['en']?.p
          || entityInfo.labels?.['es']?.s
          || entityInfo.labels?.['en']?.s
          || entity;

        // Save query state for pagination (if we have a conversation)
        if (context.conversationId) {
          const queryState: QueryState = {
            entity,
            args: {
              fields: requestedFields,
              filters,
              orderBy,
              include,
            },
            currentSkip: skipCount + pageSize,
            pageSize,
            hasMore,
          };
          setQueryState(context.conversationId, queryState);
        }

        return {
          success: true,
          data: {
            entity,
            count: sanitized.length,
            results: sanitized,
            ...(hasMore ? {
              hasMore: true,
              // Instructions for LLM - DO NOT expose tool names to user
              _forAssistant: {
                recordsShown: sanitized.length,
                entityLabel,
                moreAvailable: true,
                instruction: 'Tell user how many records shown and ask if they want more. Do NOT mention tool names.',
              },
            } : {
              hasMore: false,
            }),
          },
        };
      } catch (error) {
        console.error('[EntityQueryTool]', error);
        return {
          success: false,
          error: error instanceof Error && error.message.includes('not found')
            ? 'No se encontraron resultados'
            : 'Error al consultar datos',
        };
      }
    },
  };
}
