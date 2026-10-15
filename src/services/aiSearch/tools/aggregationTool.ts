/**
 * Aggregation Tool
 *
 * Counts entities with optional groupBy, using SecurePrismaOps for security.
 * Validates groupBy field against schema-metadata groupable flag.
 */

import { Tool } from './types';
import { SearchContext, SearchToolResult, QueryState } from '../types';
import { SchemaMetadata, FieldMetadata } from '../security/types';
import { setQueryState } from '../orchestrator/conversationService';
import {
  resolveFieldPath as resolveFieldPathMultilang,
  getRelationFilterField,
  resolveToPrisma,
} from './multilangHelper';
import {
  QUERY_LIMITS,
  DEFAULT_GROUPBY_LIMIT,
  MAX_GROUPBY_LIMIT,
} from '../constants';
import {
  VALID_OPERATORS_BY_TYPE,
  VALID_ID_OPERATORS,
  VALID_RELATION_OPERATORS,
  validateOperatorForType,
  normalizeTemporalField,
} from '../validators';
import { buildPrismaCondition, sanitizeWhereClause } from '../builders';
import { convertCalendarDateFilter, dateFilterWhere, DateFilterResult, putDateFilter } from '../builders/calendarDateFilter';

interface FilterInput {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notIn' | 'isNull' | 'isNotNull';
  value: unknown;
  /** For multi relations (sets): 'some' = at least one matches, 'every' = all match, 'none' = none match. Default: 'some' */
  relationMode?: 'some' | 'every' | 'none';
}

interface HavingInput {
  /** Relation field to count (must be a countable/set field) */
  countField: string;
  /** Comparison operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'equals';
  /** Value to compare against */
  value: number;
}

interface OrderByInput {
  /** Field to order by: 'count' for numeric count, 'label' for alphabetical */
  field: 'count' | 'label';
  /** Sort direction */
  direction: 'asc' | 'desc';
}

interface CountEntitiesArgs {
  entity: string;
  filters?: FilterInput[];
  groupBy?: string;
  /** Count items in a set relation (e.g., "works" to count works per edition). Can be combined with groupBy for "X per Y" queries. Mutually exclusive with groupByCount. */
  countRelation?: string;
  /** Group records by count of items in a set relation. Returns distribution: how many records have X items. Mutually exclusive with groupBy and countRelation. */
  groupByCount?: string;
  /** Filter results by count. Use with countRelation to get "items with more than X related records". */
  having?: HavingInput;
  /** Order results by count or label. Default: {field: 'count', direction: 'desc'} */
  orderBy?: OrderByInput;
  /** Number of groups to skip (for pagination). Default: 0 */
  skip?: number;
  /** Maximum groups to return. Default: 20, Max: 30 */
  limit?: number;
}

interface EntityFieldsMap {
  fields: Map<string, FieldMetadata>;
  groupableFields: Set<string>;
  countableFields: Set<string>;
  entityName: string;
  displayFields?: string[];
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
 * Optionally validates permissions for each entity in the path.
 */
function resolveFilterPath(
  path: string,
  startEntity: { name: string; fields: FieldMetadata[]; multilangFields?: string[] },
  schemaMetadata: SchemaMetadata,
  permissions?: string[]
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

      // SECURITY: Validate permission for target entity if permissions provided
      if (permissions) {
        const targetPermCode = `${targetEntity.name.charAt(0).toLowerCase() + targetEntity.name.slice(1)}_retrieve`;
        const hasTargetPerm = permissions.includes(targetPermCode) || permissions.includes('*');
        if (!hasTargetPerm) {
          return {
            valid: false,
            error: `Sin permiso para acceder a ${targetEntity.name} en el path '${path}'`
          };
        }
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
 */
function buildNestedWhere(
  segments: PathSegment[],
  leafCondition: Record<string, unknown>,
  relationMode: string
): Record<string, unknown> {
  let result = leafCondition;

  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i];

    if (segment.isMulti) {
      result = {
        [segment.fieldName]: {
          [relationMode]: result
        }
      };
    } else {
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
      if (!target.AND) {
        target.AND = [];
      }
      (target.AND as unknown[]).push({ [key]: value });
    }
  }
}

// Settings for groupBy results (using centralized constants)
const GROUPBY_SETTINGS = {
  defaultLimit: DEFAULT_GROUPBY_LIMIT,  // Default groups per page (good for bar charts)
  maxLimit: MAX_GROUPBY_LIMIT,          // Maximum groups allowed per request
};

/**
 * Convert string operators on DateTime fields to proper date range queries.
 * Uses Argentina timezone (UTC-3) for date interpretation.
 */
export function convertDateTimeFilter(
  operator: string,
  value: unknown
): DateFilterResult {
  const stringValue = String(value).trim();

  // equals y notEquals con un año, un mes o un día son el período, como contains y
  // notContains (crudos, Prisma no lee "2025", "2025-06" ni "2025-06-15" como un instante).
  const periodOperator = ['equals', 'notEquals'].includes(operator) && /^\d{4}([-/]\d{1,2}){0,2}$/.test(stringValue);

  if (!periodOperator && !['contains', 'notContains', 'startsWith', 'endsWith'].includes(operator)) {
    return { converted: false };
  }

  const ARGENTINA_OFFSET_HOURS = 3;
  let startDate: Date;
  let endDate: Date;

  const yearMatch = stringValue.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    startDate = new Date(Date.UTC(year, 0, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    endDate = new Date(Date.UTC(year + 1, 0, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
  } else if (/^\d{4}[-/]\d{1,2}$/.test(stringValue)) {
    const [yearStr, monthStr] = stringValue.split(/[-/]/);
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    startDate = new Date(Date.UTC(year, month, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    endDate = new Date(Date.UTC(nextYear, nextMonth > 11 ? 0 : nextMonth, 1, ARGENTINA_OFFSET_HOURS, 0, 0));
  } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(stringValue)) {
    const parts = stringValue.split(/[-/]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    startDate = new Date(Date.UTC(year, month, day, ARGENTINA_OFFSET_HOURS, 0, 0));
    endDate = new Date(Date.UTC(year, month, day + 1, ARGENTINA_OFFSET_HOURS, 0, 0));
  } else {
    return { converted: false, error: `Invalid date format '${stringValue}'. Use YYYY, YYYY-MM, or YYYY-MM-DD.` };
  }

  if (operator === 'equals' || operator === 'contains' || operator === 'startsWith') {
    return { converted: true, condition: { gte: startDate.toISOString(), lt: endDate.toISOString() } };
  } else if (operator === 'notEquals' || operator === 'notContains' || operator === 'endsWith') {
    // Fuera del período: va en el where como NOT (putDateFilter / dateFilterWhere); un OR
    // dentro del filtro del campo Prisma no lo acepta.
    return { converted: true, outside: { gte: startDate.toISOString(), lt: endDate.toISOString() } };
  }

  return { converted: false };
}

function isDateTimeField(fieldType: string): boolean {
  return ['DateTime', 'Date'].includes(fieldType);
}

/**
 * Build where object from filters
 * Uses pre-resolved paths from VALIDATION 4 when available (_resolved property)
 * Handles relation fields by converting to nested where
 * Supports dot notation for nested relations using buildNestedWhere
 * Automatically resolves multilang fields using the context language
 * For multi relations (sets), uses relationMode (some/every/none) to wrap the condition
 * Throws on DateTime conversion errors (caught by handler's try/catch)
 */
function buildWhereFromFilters(
  filters: Array<FilterInput & { _resolved?: ResolvedPath }>,
  fieldsMap: Map<string, FieldMetadata>,
  schemaMetadata: SchemaMetadata,
  language: string = 'es'
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const f of filters) {
    const relationMode = f.relationMode || 'some';

    // Use pre-resolved path if available (from VALIDATION 4)
    if (f._resolved) {
      const resolved = f._resolved;
      const leafSegment = resolved.segments[resolved.segments.length - 1];
      let leafCondition: Record<string, unknown>;

      if (resolved.leafField.targetEntity) {
        // Leaf is a relation - filter by id for lookups, text field otherwise
        const targetMeta = schemaMetadata.entities.find(
          e => e.name === resolved.leafField.targetEntity
        );
        const filterField = resolved.leafField.isLookup
          ? 'id'
          : getRelationFilterField(targetMeta, language);

        if (leafSegment.isMulti) {
          leafCondition = {
            [leafSegment.fieldName]: {
              [relationMode]: {
                [filterField]: buildPrismaCondition(f.operator, f.value)
              }
            }
          };
        } else {
          leafCondition = {
            [leafSegment.fieldName]: {
              [filterField]: buildPrismaCondition(f.operator, f.value)
            }
          };
        }
      } else if (resolved.leafField.type === 'Date') {
        // Date (día de calendario): rangos de días, sin desfase de hora.
        const dayConversion = convertCalendarDateFilter(f.operator, f.value);
        if (dayConversion.converted) {
          leafCondition = dateFilterWhere(leafSegment.fieldName, dayConversion);
        } else if ('error' in dayConversion && dayConversion.error) {
          throw new Error(dayConversion.error);
        } else {
          leafCondition = { [leafSegment.fieldName]: buildPrismaCondition(f.operator, f.value) };
        }
      } else if (isDateTimeField(resolved.leafField.type)) {
        // DateTime leaf - convert string operators
        const dateConversion = convertDateTimeFilter(f.operator, f.value);
        if (dateConversion.converted) {
          leafCondition = dateFilterWhere(leafSegment.fieldName, dateConversion);
        } else if ('error' in dateConversion && dateConversion.error) {
          throw new Error(dateConversion.error);
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
      continue;
    }

    // Fallback: handle dot notation without pre-resolved path (legacy support)
    if (f.field.includes('.')) {
      const parts = f.field.split('.');
      const firstFieldMeta = fieldsMap.get(parts[0]);
      const isFirstMulti = firstFieldMeta?.multi === true;

      let currentFieldsMap = fieldsMap;
      let finalEntityMeta: { name: string; fields: FieldMetadata[] } | undefined;
      for (let i = 0; i < parts.length - 1; i++) {
        const fieldMeta = currentFieldsMap.get(parts[i]);
        if (fieldMeta?.targetEntity) {
          finalEntityMeta = schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);
          if (finalEntityMeta) {
            currentFieldsMap = new Map(finalEntityMeta.fields.map(field => [field.name, field]));
          }
        }
      }

      const resolvedFieldName = resolveFieldPathMultilang(parts, fieldsMap, schemaMetadata, language);

      let current = where;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          if (i === 0 && isFirstMulti) {
            current[parts[i]] = { [relationMode]: {} };
            current = (current[parts[i]] as Record<string, unknown>)[relationMode] as Record<string, unknown>;
          } else {
            current[parts[i]] = {};
            current = current[parts[i]] as Record<string, unknown>;
          }
        } else {
          if (i === 0 && isFirstMulti && (current[parts[i]] as Record<string, unknown>)[relationMode]) {
            current = (current[parts[i]] as Record<string, unknown>)[relationMode] as Record<string, unknown>;
          } else {
            current = current[parts[i]] as Record<string, unknown>;
          }
        }
      }

      const finalFieldMeta = currentFieldsMap.get(parts[parts.length - 1]);
      const isRelationField = finalFieldMeta?.targetEntity || finalFieldMeta?.type === 'ref' || finalFieldMeta?.type === 'subentity';

      if (isRelationField) {
        let targetEntity = finalFieldMeta?.targetEntity
          ? schemaMetadata.entities.find(e => e.name === finalFieldMeta.targetEntity)
          : undefined;

        if (!targetEntity && finalFieldMeta) {
          const fieldNameCapitalized = parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1);
          targetEntity = schemaMetadata.entities.find(e =>
            e.name === fieldNameCapitalized ||
            e.name.startsWith(fieldNameCapitalized)
          );
        }

        if (targetEntity) {
          const filterField = finalFieldMeta?.isLookup
            ? 'id'
            : getRelationFilterField(targetEntity, language);
          current[resolvedFieldName] = {
            [filterField]: buildPrismaCondition(f.operator, f.value),
          };
        } else {
          console.warn(`[buildWhereFromFilters] Could not find target entity for relation field '${parts[parts.length - 1]}'`);
          continue;
        }
      } else {
        if (finalFieldMeta?.type === 'Date') {
          // Date (día de calendario): rangos de días, sin desfase de hora.
          const dayConversion = convertCalendarDateFilter(f.operator, f.value);
          if (dayConversion.converted) {
            putDateFilter(current, resolvedFieldName, dayConversion);
          } else if ('error' in dayConversion && dayConversion.error) {
            throw new Error(dayConversion.error);
          } else {
            current[resolvedFieldName] = buildPrismaCondition(f.operator, f.value);
          }
        } else if (finalFieldMeta && isDateTimeField(finalFieldMeta.type)) {
          const dateConversion = convertDateTimeFilter(f.operator, f.value);
          if (dateConversion.converted) {
            putDateFilter(current, resolvedFieldName, dateConversion);
          } else if ('error' in dateConversion && dateConversion.error) {
            throw new Error(dateConversion.error);
          } else {
            current[resolvedFieldName] = buildPrismaCondition(f.operator, f.value);
          }
        } else {
          current[resolvedFieldName] = buildPrismaCondition(f.operator, f.value);
        }
      }
      continue;
    }

    // Direct field (no dots)
    const fieldMeta = fieldsMap.get(f.field);
    if (!fieldMeta) continue;

    if (fieldMeta.targetEntity) {
      const targetEntity = schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);
      const filterField = fieldMeta.isLookup
        ? 'id'
        : getRelationFilterField(targetEntity, language);

      if (fieldMeta.multi) {
        where[f.field] = {
          [relationMode]: {
            [filterField]: buildPrismaCondition(f.operator, f.value),
          },
        };
      } else {
        where[f.field] = {
          [filterField]: buildPrismaCondition(f.operator, f.value),
        };
      }
    } else if (fieldMeta.type === 'Date') {
      // Date (día de calendario): rangos de días, sin desfase de hora.
      const dayConversion = convertCalendarDateFilter(f.operator, f.value);
      if (dayConversion.converted) {
        putDateFilter(where, f.field, dayConversion);
      } else if ('error' in dayConversion && dayConversion.error) {
        throw new Error(dayConversion.error);
      } else {
        where[f.field] = buildPrismaCondition(f.operator, f.value);
      }
    } else if (isDateTimeField(fieldMeta.type)) {
      const dateConversion = convertDateTimeFilter(f.operator, f.value);
      if (dateConversion.converted) {
        putDateFilter(where, f.field, dateConversion);
      } else if ('error' in dateConversion && dateConversion.error) {
        throw new Error(dateConversion.error);
      } else {
        where[f.field] = buildPrismaCondition(f.operator, f.value);
      }
    } else {
      where[f.field] = buildPrismaCondition(f.operator, f.value);
    }
  }
  return where;
}

/**
 * Sort groups by count or label
 */
function sortGroups<T extends { count: number; label?: string; value?: unknown }>(
  groups: T[],
  orderBy: OrderByInput
): T[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    if (orderBy.field === 'count') {
      return orderBy.direction === 'desc' ? b.count - a.count : a.count - b.count;
    } else {
      // Sort by label (or value as string if no label)
      const aLabel = String(a.label ?? a.value ?? '');
      const bLabel = String(b.label ?? b.value ?? '');
      const comparison = aLabel.localeCompare(bLabel, 'es', { sensitivity: 'base' });
      return orderBy.direction === 'desc' ? -comparison : comparison;
    }
  });
  return sorted;
}

/**
 * Apply pagination to groupBy results
 * Returns paginated results plus metadata for hasMore
 */
function paginateGroupByResults(
  groups: Array<{ value: unknown; count: number; label?: string }>,
  skip: number,
  limit: number
): { results: Array<{ value: unknown; count: number; label?: string }>; totalGroups: number; hasMore: boolean } {
  const totalGroups = groups.length;
  const results = groups.slice(skip, skip + limit);
  const hasMore = skip + limit < totalGroups;
  return { results, totalGroups, hasMore };
}

/**
 * Create aggregation tool factory
 *
 * @param schemaMetadata - AI Search schema metadata
 * @param executeSecureCount - Function to execute secure count
 * @param executeSecureGroupBy - Function to execute secure groupBy
 * @param executeSecureCountRelation - Function to count items in a set relation using Prisma _count
 */
export function createAggregationTool(
  schemaMetadata: SchemaMetadata,
  executeSecureCount: (
    entityName: string,
    where: Record<string, unknown>,
    context: SearchContext
  ) => Promise<number>,
  executeSecureGroupBy: (
    entityName: string,
    groupByField: string,
    where: Record<string, unknown>,
    context: SearchContext
  ) => Promise<{
    results: Array<{ value: unknown; count: number; label?: string }>;
    totalBeforeLimit: number;
  }>,
  executeSecureCountRelation?: (
    entityName: string,
    relationField: string,
    where: Record<string, unknown>,
    context: SearchContext,
    pagination: { skip: number; limit: number }
  ) => Promise<{
    groups: Array<{ label: string; count: number }>;
    totalGroups: number;
  }>,
  executeSecureGroupByCount?: (
    entityName: string,
    relationField: string,
    where: Record<string, unknown>,
    context: SearchContext,
    pagination: { skip: number; limit: number }
  ) => Promise<{
    groups: Array<{ countValue: number; numRecords: number }>;
    totalGroups: number;
    totalRecords: number;
  }>,
  executeSecureCountRelationGroupedBy?: (
    entityName: string,
    relationField: string,
    groupByField: string,
    where: Record<string, unknown>,
    context: SearchContext,
    having?: { operator: 'gt' | 'lt' | 'gte' | 'lte' | 'equals'; value: number },
    pagination?: { skip: number; limit: number }
  ) => Promise<{
    groups: Array<{ groupValue: string; count: number }>;
    totalGroups: number;
    totalEntities: number;
  }>,
  executeSecureGroupByNestedPath?: (
    entityName: string,
    nestedPath: string,
    where: Record<string, unknown>,
    context: SearchContext
  ) => Promise<{
    groups: Array<{ value: string | null; count: number; label?: string }>;
    totalGroups: number;
  }>
): Tool {
  // Build lookup maps for fast validation
  const allowedEntities = new Map<string, EntityFieldsMap>();

  for (const entity of schemaMetadata.entities) {
    const fieldsMap = new Map<string, FieldMetadata>();
    const groupableFields = new Set<string>();
    const countableFields = new Set<string>();

    for (const field of entity.fields) {
      fieldsMap.set(field.name, field);
      if (field.groupable) {
        groupableFields.add(field.name);
      }
      // A field is countable if it's a multi relation (set)
      if (field.multi && field.targetEntity) {
        countableFields.add(field.name);
      }
    }

    allowedEntities.set(entity.name, {
      fields: fieldsMap,
      groupableFields,
      countableFields,
      entityName: entity.name,
      displayFields: entity.displayFields,
    });
  }

  const entityNames = Array.from(allowedEntities.keys());

  // Build groupable fields description for LLM
  const groupableFieldsDesc = Array.from(allowedEntities.entries())
    .map(([name, info]) => {
      const fields = Array.from(info.groupableFields);
      return fields.length > 0 ? `${name}: ${fields.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('; ');

  // Build countable fields description for LLM
  const countableFieldsDesc = Array.from(allowedEntities.entries())
    .map(([name, info]) => {
      const fields = Array.from(info.countableFields);
      return fields.length > 0 ? `${name}: ${fields.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('; ');

  return {
    name: 'count_entities',
    description: 'Cuenta registros de una entidad, opcionalmente agrupados por un campo. Usa esto para obtener totales, estadísticas y distribuciones.',
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          description: `Nombre de la entidad a contar. Opciones: ${entityNames.join(', ')}`,
          enum: entityNames,
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
            additionalProperties: false,
          },
          description: 'Filtros a aplicar antes de contar',
        },
        groupBy: {
          type: 'string',
          description: `Campo para agrupar. SOLO estos campos son válidos: ${groupableFieldsDesc || 'ninguno disponible'}. Otros campos serán rechazados.`,
        },
        countRelation: {
          type: 'string',
          description: `Cuenta items en una relación set. Usa para "cantidad de X por Y" donde Y tiene set de X. Campos válidos: ${countableFieldsDesc || 'ninguno disponible'}. Ej: count_entities(entity="Edition", countRelation="works") cuenta obras por edición. PUEDE COMBINARSE con groupBy para "X por campo Z" con filtro having.`,
        },
        groupByCount: {
          type: 'string',
          description: `Agrupa registros por cantidad de items en un set. Retorna distribución: cuántos registros tienen X items. Campos válidos: ${countableFieldsDesc || 'ninguno disponible'}. Ej: count_entities(entity="MusicalWork", groupByCount="authors") → cuántas obras tienen 10 autores, cuántas 9, etc. Mutuamente exclusivo con groupBy y countRelation.`,
        },
        having: {
          type: 'object',
          properties: {
            countField: { type: 'string', description: `Campo de relación a contar. Campos válidos: ${countableFieldsDesc || 'ninguno disponible'}` },
            operator: { type: 'string', enum: ['gt', 'lt', 'gte', 'lte', 'equals'], description: 'Operador de comparación' },
            value: { type: 'number', description: 'Valor numérico a comparar' },
          },
          required: ['countField', 'operator', 'value'],
          additionalProperties: false,
          description: 'Filtro post-agregación por conteo. Ej: having={countField:"works", operator:"gt", value:3} para "más de 3 obras". Usar con countRelation.',
        },
        orderBy: {
          type: 'object',
          properties: {
            field: { type: 'string', enum: ['count', 'label'], description: 'Campo por el cual ordenar: count (numérico) o label (alfabético)' },
            direction: { type: 'string', enum: ['asc', 'desc'], description: 'Dirección: asc (ascendente) o desc (descendente)' },
          },
          required: ['field', 'direction'],
          additionalProperties: false,
          description: 'Ordenar resultados. Default: {field:"count", direction:"desc"} (mayor a menor por cantidad).',
        },
        skip: {
          type: 'number',
          description: 'Grupos a saltar (para paginación). Default: 0',
        },
        limit: {
          type: 'number',
          description: 'Máximo de grupos a devolver. Default: 20, Máximo: 30. Usa 10 para tortas, 20 para barras verticales, 30 para barras horizontales.',
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
              description: 'Pattern ID from Navigation Patterns section (e.g., entity-only-count, groupby, nested-groupby, nested-count)',
            },
            path: {
              type: 'string',
              description: 'Navigation path: Entity → field → Entity → field → ... (e.g., Edition → works → musicalGenre for groupBy)',
            },
          },
          required: ['pattern', 'path'],
          description: 'MANDATORY: Your reasoning for choosing this tool and pattern. Must match a pattern from Navigation Patterns.',
        },
      },
      required: ['entity', 'language', 'reasoning'],
      additionalProperties: false,
    },

    handler: async (args: Record<string, unknown>, context: SearchContext): Promise<SearchToolResult> => {
      // === VALIDATION 0: Check for unknown parameters ===
      const knownParams = new Set(['entity', 'filters', 'groupBy', 'countRelation', 'groupByCount', 'having', 'orderBy', 'skip', 'limit', 'language', 'reasoning']);
      const unknownParams = Object.keys(args).filter(key => !knownParams.has(key));
      if (unknownParams.length > 0) {
        return {
          success: false,
          error: `Parámetros desconocidos: ${unknownParams.join(', ')}. Parámetros válidos: ${Array.from(knownParams).join(', ')}`,
        };
      }

      const { entity, filters, groupBy, countRelation, groupByCount, having, orderBy, skip: rawSkip, limit: rawLimit, language } = args as CountEntitiesArgs & { language?: string };

      // Use language from args (LLM-detected) or fall back to context
      const effectiveContext = language
        ? { ...context, language }
        : context;

      // Apply pagination settings
      const skip = rawSkip ?? 0;
      const limit = Math.min(rawLimit ?? GROUPBY_SETTINGS.defaultLimit, GROUPBY_SETTINGS.maxLimit);

      // Default orderBy: by count descending (most common first)
      const effectiveOrderBy: OrderByInput = orderBy ?? { field: 'count', direction: 'desc' };

      try {
        // === VALIDATION 1: Entity exists in schema-metadata ===
        const entityInfo = allowedEntities.get(entity);
        if (!entityInfo) {
          return { success: false, error: `Entidad '${entity}' no disponible` };
        }

        const allowedFieldNames = new Set(entityInfo.fields.keys());

        // === VALIDATION 2: User has retrieve permission ===
        const permissionCode = `${entity.charAt(0).toLowerCase() + entity.slice(1)}_retrieve`;
        const hasPermission = context.permissions.includes(permissionCode) || context.permissions.includes('*');
        if (!hasPermission) {
          return { success: false, error: `Sin permiso para consultar ${entity}` };
        }

        // === VALIDATION: groupByCount is mutually exclusive with groupBy and countRelation ===
        // groupBy + countRelation CAN be used together (via executeSecureCountRelationGroupedBy)
        if (groupByCount && (groupBy || countRelation)) {
          return { success: false, error: 'groupByCount no se puede combinar con groupBy ni countRelation. Use groupByCount solo.' };
        }

        // === VALIDATION 3: GroupBy field exists and is groupable ===
        // For relation fields, we use the FK field (fieldName_id) for Prisma groupBy
        // For nested paths (e.g., "author.gender"), we use Raw SQL
        let prismaGroupByField: string | undefined;
        let useRawSqlGroupBy = false;

        if (groupBy) {
          // Check if it's a nested path (contains ".")
          if (groupBy.includes('.')) {
            // Nested path - will use Raw SQL for groupBy
            // Validate that the executeSecureGroupByNestedPath function is available
            if (!executeSecureGroupByNestedPath) {
              return {
                success: false,
                error: `groupBy con path anidado '${groupBy}' no está habilitado en este sistema`,
              };
            }

            useRawSqlGroupBy = true;

            // Validate the path exists in schema AND user has permissions for all entities
            const pathParts = groupBy.split('.');
            let currentEntity = entity;

            for (let i = 0; i < pathParts.length - 1; i++) {
              const fieldName = pathParts[i];
              const currentEntityMeta = schemaMetadata.entities.find(e => e.name === currentEntity);
              if (!currentEntityMeta) {
                return {
                  success: false,
                  error: `Entidad '${currentEntity}' no encontrada en el path '${groupBy}'`,
                };
              }

              const fieldMeta = currentEntityMeta.fields.find(f => f.name === fieldName);
              if (!fieldMeta?.targetEntity) {
                return {
                  success: false,
                  error: `Path '${groupBy}' inválido: '${fieldName}' no es una relación en ${currentEntity}`,
                };
              }

              // SECURITY GAP#2 FIX: Validate permission for each entity in the path
              const targetPermCode = `${fieldMeta.targetEntity.charAt(0).toLowerCase() + fieldMeta.targetEntity.slice(1)}_retrieve`;
              const hasTargetPerm = context.permissions.includes(targetPermCode) || context.permissions.includes('*');
              if (!hasTargetPerm) {
                return {
                  success: false,
                  error: `Sin permiso para acceder a ${fieldMeta.targetEntity} en el path '${groupBy}'`,
                };
              }

              currentEntity = fieldMeta.targetEntity;
            }

            // Validate final field exists
            const finalEntityMeta = schemaMetadata.entities.find(e => e.name === currentEntity);
            const finalFieldName = pathParts[pathParts.length - 1];
            if (!finalEntityMeta?.fields.find(f => f.name === finalFieldName)) {
              return {
                success: false,
                error: `Campo '${finalFieldName}' no existe en ${currentEntity}`,
              };
            }

            // SECURITY GAP#2 FIX: If final field is a relation (lookup), validate permission for its target
            const finalFieldMeta = finalEntityMeta.fields.find(f => f.name === finalFieldName);
            if (finalFieldMeta?.targetEntity) {
              const finalTargetPermCode = `${finalFieldMeta.targetEntity.charAt(0).toLowerCase() + finalFieldMeta.targetEntity.slice(1)}_retrieve`;
              const hasFinalTargetPerm = context.permissions.includes(finalTargetPermCode) || context.permissions.includes('*');
              if (!hasFinalTargetPerm) {
                return {
                  success: false,
                  error: `Sin permiso para acceder a ${finalFieldMeta.targetEntity} en el path '${groupBy}'`,
                };
              }
            }
          } else {
            // Direct field - existing validation logic
            if (!allowedFieldNames.has(groupBy)) {
              return { success: false, error: `Campo '${groupBy}' no disponible en ${entity}` };
            }
            if (!entityInfo.groupableFields.has(groupBy)) {
              // Check if it's a relation field to give better error message
              const fieldMeta = entityInfo.fields.get(groupBy);
              if (fieldMeta?.targetEntity) {
                // It's a relation - guide LLM to query the junction entity
                return {
                  success: false,
                  error: `Campo '${groupBy}' es una relación y no permite agrupación directa. Para agrupar por este campo, consulte la entidad de relación que conecta ${entity} con sus ${groupBy}.`,
                };
              }
              return { success: false, error: `Campo '${groupBy}' no permite agrupación` };
            }

            // Check if it's a relation field (has targetEntity)
            const fieldMeta = entityInfo.fields.get(groupBy);
            if (fieldMeta?.targetEntity) {
              // Relation field: use FK field for Prisma groupBy
              // Strip 'parent_' prefix if present (used for back-references in subentities)
              const fkBase = groupBy.startsWith('parent_') ? groupBy.slice(7) : groupBy;
              prismaGroupByField = `${fkBase}_id`;
            } else {
              // Scalar field: resolve multilang (e.g., "name" → "name_es")
              const groupByEntityMeta = schemaMetadata.entities.find(e => e.name === entity);
              prismaGroupByField = groupByEntityMeta
                ? resolveToPrisma(groupBy, groupByEntityMeta, effectiveContext.language)
                : groupBy;
            }
          }
        }

        // === VALIDATION 4: All filter fields exist and operators are compatible ===
        // Get entity metadata for path resolution
        const entityMeta = schemaMetadata.entities.find(e => e.name === entity);
        if (!entityMeta) {
          return { success: false, error: `Metadata de entidad '${entity}' no encontrada` };
        }

        if (filters && Array.isArray(filters)) {
          for (const f of filters) {
            // Normalize temporal fields (LLMs sometimes omit the underscore)
            f.field = normalizeTemporalField(f.field);

            if (f.field.includes('.')) {
              // Nested path - validate recursively using schema metadata
              // SECURITY: Pass permissions to validate access to all entities in path
              const pathResult = resolveFilterPath(f.field, entityMeta, schemaMetadata, context.permissions);
              if (!pathResult.valid) {
                return { success: false, error: (pathResult as { valid: false; error: string }).error };
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
              const fieldMeta = entityInfo.fields.get(f.field);
              if (fieldMeta) {
                const isRelation = !!fieldMeta.targetEntity;
                const opError = validateOperatorForType(f.field, fieldMeta.type, f.operator, isRelation);
                if (opError) {
                  return { success: false, error: opError };
                }

                // If relation field and value is a number, user likely wants to count (use having, not filters)
                if (isRelation && typeof f.value === 'number') {
                  return {
                    success: false,
                    error: `Campo '${f.field}' es una relación. Para filtrar por CANTIDAD de items (${f.value}), use countRelation="${f.field}" con having={countField:"${f.field}", operator:"equals", value:${f.value}}. Los filters en campos relación comparan texto/nombre, no cantidades.`
                  };
                }
              }
            }
          }
        }

        // === VALIDATION 5: countRelation field exists and is countable (multi) ===
        if (countRelation) {
          if (!allowedFieldNames.has(countRelation)) {
            return { success: false, error: `Campo '${countRelation}' no disponible en ${entity}` };
          }
          if (!entityInfo.countableFields.has(countRelation)) {
            return { success: false, error: `Campo '${countRelation}' no es una relación múltiple (set). Solo se pueden contar campos set.` };
          }
        }

        // === VALIDATION 6: groupByCount field exists and is countable (multi) ===
        if (groupByCount) {
          if (!allowedFieldNames.has(groupByCount)) {
            return { success: false, error: `Campo '${groupByCount}' no disponible en ${entity}` };
          }
          if (!entityInfo.countableFields.has(groupByCount)) {
            return { success: false, error: `Campo '${groupByCount}' no es una relación múltiple (set). Solo se puede agrupar por conteo de campos set.` };
          }
        }

        // === VALIDATION 7: having field validation ===
        if (having) {
          // having requires countRelation (with or without groupBy)
          if (!countRelation) {
            return { success: false, error: 'El parámetro having requiere countRelation: falta decir qué relación contar.' };
          }
          // Validate having.countField matches countRelation
          if (having.countField !== countRelation) {
            return { success: false, error: `having.countField ('${having.countField}') debe coincidir con countRelation ('${countRelation}')` };
          }
          // Validate operator
          const validHavingOps = ['gt', 'lt', 'gte', 'lte', 'equals'];
          if (!validHavingOps.includes(having.operator)) {
            return { success: false, error: `Operador having '${having.operator}' no válido. Use: ${validHavingOps.join(', ')}` };
          }
          // Validate value is a number
          if (typeof having.value !== 'number' || isNaN(having.value)) {
            return { success: false, error: 'having.value debe ser un número' };
          }
        }

        // === VALIDATION 8: groupBy + countRelation requires executeSecureCountRelationGroupedBy ===
        if (groupBy && countRelation && !executeSecureCountRelationGroupedBy) {
          return { success: false, error: 'La combinación groupBy + countRelation no está habilitada en este sistema' };
        }

        // === BUILD WHERE ===
        const rawWhere = filters && Array.isArray(filters)
          ? buildWhereFromFilters(filters, entityInfo.fields, schemaMetadata, effectiveContext.language)
          : {};

        // Sanitize where clause to fix common LLM-generated issues
        // (e.g., { id: null } or { not: null } in relation filters)
        const where = sanitizeWhereClause(rawWhere);

        // === EXECUTE groupBy + countRelation (combined) ===
        // For queries like "obras por país del autor, solo autores con más de 3 obras"
        if (groupBy && countRelation && executeSecureCountRelationGroupedBy) {
          const havingParam = having ? { operator: having.operator, value: having.value } : undefined;

          const { groups, totalGroups, totalEntities } = await executeSecureCountRelationGroupedBy(
            entity,
            countRelation,
            groupBy,
            where,
            effectiveContext,
            havingParam,
            { skip, limit }
          );

          const hasMore = skip + limit < totalGroups;

          // Format groups for display (groupValue becomes label)
          const formattedGroups = groups.map(g => ({
            label: g.groupValue,
            count: g.count,
          }));

          // Apply ordering
          const sortedGroups = sortGroups(formattedGroups, effectiveOrderBy);

          // Save query state for pagination
          if (context.conversationId) {
            const queryState: QueryState = {
              entity,
              args: {
                filters,
                groupBy,
                countRelation,
                having,
                orderBy: effectiveOrderBy,
              },
              currentSkip: skip + limit,
              pageSize: limit,
              hasMore,
            };
            setQueryState(context.conversationId, queryState);
          }

          return {
            success: true,
            data: {
              entity,
              groupBy,
              countRelation,
              ...(having ? { having: { operator: having.operator, value: having.value } } : {}),
              orderBy: effectiveOrderBy,
              groups: sortedGroups,
              totalGroups,
              totalEntities,
              showing: sortedGroups.length,
              skip,
              hasMore,
            },
          };
        }

        // === EXECUTE countRelation (without groupBy) ===
        if (countRelation) {
          if (!executeSecureCountRelation) {
            return { success: false, error: 'countRelation no está habilitado en este sistema' };
          }

          // Always fetch all records first, then sort, then paginate
          // This is required because:
          // 1. Ordering by count requires seeing ALL counts to find min/max
          // 2. having filter needs to see all records before filtering
          // 3. DB doesn't know about our sort order (it's computed post-query)
          const fetchLimit = 10000;  // Safe upper bound
          const fetchSkip = 0;

          let { groups, totalGroups } = await executeSecureCountRelation(
            entity,
            countRelation,
            where,
            effectiveContext,
            { skip: fetchSkip, limit: fetchLimit }
          );

          // Apply having filter if present
          if (having) {
            groups = groups.filter(g => {
              switch (having.operator) {
                case 'gt': return g.count > having.value;
                case 'gte': return g.count >= having.value;
                case 'lt': return g.count < having.value;
                case 'lte': return g.count <= having.value;
                case 'equals': return g.count === having.value;
                default: return true;
              }
            });
            totalGroups = groups.length;
          }

          // Apply ordering BEFORE pagination
          const sortedGroups = sortGroups(groups, effectiveOrderBy);

          // Apply pagination AFTER ordering
          const paginatedGroups = sortedGroups.slice(skip, skip + limit);

          // Update totalGroups to reflect sorted count (may differ if having was applied)
          totalGroups = sortedGroups.length;
          const hasMore = skip + paginatedGroups.length < totalGroups;

          // Save query state for pagination
          if (context.conversationId) {
            const queryState: QueryState = {
              entity,
              args: {
                filters,
                countRelation,
                having,
                orderBy: effectiveOrderBy,
              },
              currentSkip: skip + limit,
              pageSize: limit,
              hasMore,
            };
            setQueryState(context.conversationId, queryState);
          }

          return {
            success: true,
            data: {
              entity,
              countRelation,
              ...(having ? { having: { operator: having.operator, value: having.value } } : {}),
              orderBy: effectiveOrderBy,
              groups: paginatedGroups,
              totalGroups,
              showing: paginatedGroups.length,
              skip,
              hasMore,
            },
          };
        }

        // === EXECUTE groupByCount ===
        if (groupByCount) {
          if (!executeSecureGroupByCount) {
            return { success: false, error: 'groupByCount no está habilitado en este sistema' };
          }

          const { groups, totalGroups, totalRecords } = await executeSecureGroupByCount(
            entity,
            groupByCount,
            where,
            effectiveContext,
            { skip, limit }
          );

          const hasMore = skip + limit < totalGroups;

          // Format groups for display: countValue becomes the label
          const formattedGroups = groups.map(g => ({
            label: `${g.countValue}`,
            count: g.numRecords,
          }));

          // Apply ordering
          const sortedGroups = sortGroups(formattedGroups, effectiveOrderBy);

          // Save query state for pagination
          if (context.conversationId) {
            const queryState: QueryState = {
              entity,
              args: {
                filters,
                groupByCount,
                orderBy: effectiveOrderBy,
              },
              currentSkip: skip + limit,
              pageSize: limit,
              hasMore,
            };
            setQueryState(context.conversationId, queryState);
          }

          return {
            success: true,
            data: {
              entity,
              groupByCount,
              orderBy: effectiveOrderBy,
              distribution: sortedGroups,
              totalGroups,
              totalRecords,
              showing: sortedGroups.length,
              skip,
              hasMore,
            },
          };
        }

        // === EXECUTE groupBy ===
        // Handle nested paths with Raw SQL (secure, with tenant filtering)
        if (groupBy && useRawSqlGroupBy && executeSecureGroupByNestedPath) {
          console.log(`[AggregationTool] Using Raw SQL for nested groupBy: ${entity}.${groupBy}`);

          const { groups: rawGroups, totalGroups } = await executeSecureGroupByNestedPath(
            entity,
            groupBy,
            where,
            effectiveContext
          );

          // Apply ordering
          const sortedGroups = sortGroups(rawGroups, effectiveOrderBy);

          // Apply pagination
          const paginatedGroups = sortedGroups.slice(skip, skip + limit);
          const hasMore = skip + limit < totalGroups;

          // Save query state for pagination (if we have a conversation)
          if (context.conversationId) {
            const queryState: QueryState = {
              entity,
              args: {
                filters,
                groupBy,
                orderBy: effectiveOrderBy,
              },
              currentSkip: skip + limit,
              pageSize: limit,
              hasMore,
            };
            setQueryState(context.conversationId, queryState);
          }

          return {
            success: true,
            data: {
              entity,
              groupBy,
              orderBy: effectiveOrderBy,
              groups: paginatedGroups,
              totalGroups,
              showing: paginatedGroups.length,
              skip,
              hasMore,
            },
          };
        }

        // Handle direct fields with Prisma groupBy
        if (groupBy && prismaGroupByField) {
          // GroupBy with security (use FK field for relations)
          const { results: rawGroups, totalBeforeLimit } = await executeSecureGroupBy(entity, prismaGroupByField, where, effectiveContext);
          const { results: groups, totalGroups: groupsInPage, hasMore: hasMoreInPage } = paginateGroupByResults(rawGroups, skip, limit);

          // Apply ordering
          const sortedGroups = sortGroups(groups, effectiveOrderBy);

          // Use totalBeforeLimit as the real total (before the max limit was applied)
          const totalGroups = totalBeforeLimit;
          const hasMore = skip + limit < totalBeforeLimit;

          // Save query state for pagination (if we have a conversation)
          if (context.conversationId) {
            const queryState: QueryState = {
              entity,
              args: {
                filters,
                groupBy,
                orderBy: effectiveOrderBy,
              },
              currentSkip: skip + limit,
              pageSize: limit,
              hasMore,
            };
            setQueryState(context.conversationId, queryState);
          }

          return {
            success: true,
            data: {
              entity,
              groupBy,
              orderBy: effectiveOrderBy,
              groups: sortedGroups,
              totalGroups,
              showing: sortedGroups.length,
              skip,
              hasMore,
            },
          };
        } else {
          // Simple count
          const count = await executeSecureCount(entity, where, effectiveContext);

          return {
            success: true,
            data: {
              entity,
              count,
            },
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[AggregationTool] Error:', errorMsg, error);
        return {
          success: false,
          error: `Error al contar registros: ${errorMsg}`,
        };
      }
    },
  };
}
