/**
 * PATAY Tools - Type Definitions
 *
 * Core types for the PATAY tool system.
 * Designed for clarity, type safety, and LLM-friendly interfaces.
 *
 * Key differences from aiSearch:
 * - Strings are case-insensitive by DEFAULT
 * - OR/NOT logic supported in filters
 * - Explicit distinct support
 * - Clear separation of query vs aggregate
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Supported languages for multilingual labels
 */
export type Lang = 'es' | 'en' | 'pt';

/**
 * Filter operators for different field types
 */
export type StringOperator =
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'not';

export type NumberOperator =
  | 'equals'
  | 'not'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type DateOperator =
  | 'equals'
  | 'not'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type ArrayOperator =
  | 'has'
  | 'hasEvery'
  | 'hasSome'
  | 'isEmpty';

export type RelationOperator =
  | 'some'
  | 'every'
  | 'none'
  | 'is'
  | 'isNot';

export type Operator =
  | StringOperator
  | NumberOperator
  | DateOperator
  | ArrayOperator
  | RelationOperator;

/**
 * Sort direction
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Aggregation operations
 */
export type AggregateOperation = 'count' | 'sum' | 'avg' | 'min' | 'max';

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * A single filter condition
 *
 * Examples:
 * - { field: "name", operator: "contains", value: "John" }
 * - { field: "author.country.name", operator: "equals", value: "Spain" }
 * - { field: "createdAt", operator: "gte", value: "2023-01-01" }
 */
export interface Filter {
  /** Field name or path (e.g., "name" or "author.country.name") */
  field: string;

  /** Comparison operator */
  operator: Operator;

  /** Value to compare against */
  value: unknown;

  /** Case sensitivity mode (default: 'insensitive' for strings) */
  mode?: 'insensitive' | 'default';

  /** Negate this condition */
  not?: boolean;
}

/**
 * Composite filter with OR logic
 *
 * Example:
 * {
 *   or: [
 *     { field: "status", operator: "equals", value: "active" },
 *     { field: "status", operator: "equals", value: "pending" }
 *   ]
 * }
 */
export interface OrFilter {
  or: Filter[];
}

/**
 * Composite filter with AND logic (default behavior)
 */
export interface AndFilter {
  and: (Filter | OrFilter)[];
}

/**
 * Any filter expression
 */
export type FilterExpression = Filter | OrFilter | AndFilter;

// ============================================================================
// ORDERING TYPES
// ============================================================================

/**
 * Order by a field
 *
 * Examples:
 * - { field: "name", direction: "asc" }
 * - { field: "createdAt", direction: "desc" }
 */
export interface OrderBy {
  field: string;
  direction: SortOrder;
}

// ============================================================================
// INCLUDE TYPES
// ============================================================================

/**
 * Include a relation with optional nested includes and filters
 *
 * Examples:
 * - { relation: "author" }
 * - { relation: "authors", take: 5 }
 * - { relation: "authors", where: [{ field: "active", operator: "equals", value: true }] }
 */
export interface Include {
  /** Relation field name */
  relation: string;

  /** Filter conditions for the relation */
  where?: Filter[];

  /** Order of related records */
  orderBy?: OrderBy;

  /** Maximum records to include */
  take?: number;

  /** Nested includes */
  include?: Include[];
}

// ============================================================================
// QUERY TOOL TYPES
// ============================================================================

/**
 * Arguments for the query tool
 *
 * Use this tool to retrieve entity records matching your criteria.
 *
 * Use when you need to:
 * - List entities: "show all works", "list authors"
 * - Find specific records: "works by author X", "works in genre Y"
 * - Get details: "the genre of work X" (use limit: 1)
 *
 * Do NOT use for counting or statistics - use aggregate instead.
 */
export interface QueryArgs {
  /** Entity to query (required) */
  entity: string;

  /** Filter conditions (optional) */
  filters?: FilterExpression[];

  /** Sort order (optional) */
  orderBy?: OrderBy[];

  /** Maximum records to return (default: 10, max: 100) */
  limit?: number;

  /** Records to skip for pagination (default: 0) */
  skip?: number;

  /** Relations to include (optional) */
  include?: Include[];

  /** Return distinct values only (default: false) */
  distinct?: string[];

  /** Fields to select (optional, defaults to all) */
  select?: string[];
}

/**
 * Result from the query tool
 */
export interface QueryResult {
  /** Retrieved records */
  data: Record<string, unknown>[];

  /** Total count matching filters (without limit/skip) */
  total: number;

  /** Whether more records exist */
  hasMore: boolean;

  /** Pagination info */
  pagination: {
    limit: number;
    skip: number;
    returned: number;
  };
}

// ============================================================================
// AGGREGATE TOOL TYPES
// ============================================================================

/**
 * Arguments for the aggregate tool
 *
 * Computes statistics on entity records.
 *
 * Use when you need to:
 * - Count: "how many works", "number of authors"
 * - Statistics: "average duration", "max percentage"
 * - Distribution: "works per genre", "authors by country"
 *
 * Returns a number (simple count) or array of groups.
 */
export interface AggregateArgs {
  /** Entity to aggregate (required) */
  entity: string;

  /** Aggregation operation (required) */
  operation: AggregateOperation;

  /** Field to aggregate (required for sum/avg/min/max) */
  field?: string;

  /** Filter conditions (optional) */
  filters?: FilterExpression[];

  /** Group by field (optional) */
  groupBy?: string | string[];

  /** Filter groups after aggregation (optional) */
  having?: {
    operation: AggregateOperation;
    field?: string;
    operator: NumberOperator;
    value: number;
  };

  /** Order groups (optional) */
  orderBy?: OrderBy;

  /** Limit number of groups (optional) */
  limit?: number;
}

/**
 * Single aggregation result (no grouping)
 */
export interface AggregateResultSimple {
  value: number;
}

/**
 * Grouped aggregation result
 */
export interface AggregateResultGrouped {
  groups: Array<{
    key: Record<string, unknown>;
    value: number;
  }>;
}

/**
 * Result from the aggregate tool
 */
export type AggregateResult = AggregateResultSimple | AggregateResultGrouped;

// ============================================================================
// LOOKUP TOOL TYPES
// ============================================================================

/**
 * Arguments for the lookup tool
 *
 * Retrieves catalog/reference data (pre-loaded, no Prisma query).
 *
 * Use for:
 * - Getting list of genres, statuses, countries, etc.
 * - Validating values before using in filters
 */
export interface LookupArgs {
  /** Catalog entity name */
  entity: string;

  /** Language for labels (optional) */
  lang?: Lang;

  /** Filter by label (optional) */
  search?: string;
}

/**
 * Result from the lookup tool
 */
export interface LookupResult {
  values: Array<{
    id: string | number;
    label: string;
    code?: string;
  }>;
}

// ============================================================================
// TOOL EXECUTION TYPES
// ============================================================================

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Prisma client instance */
  prisma: unknown;

  /** User's tenant ID for multi-tenancy */
  tenantId?: string;

  /** User ID for audit */
  userId?: string;

  /** Request language */
  lang: Lang;

  /** Schema metadata for validation */
  schema: SchemaInfo;
}

/**
 * Minimal schema info needed by tools
 */
export interface SchemaInfo {
  entities: EntityInfo[];
}

/**
 * Entity info for validation
 */
export interface EntityInfo {
  name: string;
  tableName: string;
  labels?: Record<Lang, { s?: string; p?: string }>;
  fields: FieldInfo[];
}

/**
 * Field info for validation
 */
export interface FieldInfo {
  name: string;
  type: FieldType;
  labels?: Record<Lang, { s?: string; p?: string }>;
  isRequired: boolean;
  isRelation: boolean;
  relationEntity?: string;
  isArray: boolean;
  isEnum: boolean;
  enumValues?: string[];
  isGroupable: boolean;
  isSearchable: boolean;
}

/**
 * Field types
 */
export type FieldType =
  | 'String'
  | 'Int'
  | 'Float'
  | 'Decimal'
  | 'Boolean'
  | 'DateTime'
  | 'Date'
  | 'Json'
  | 'Enum'
  | 'Relation';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Validation error from tool
 */
export interface ToolValidationError {
  code: 'VALIDATION_ERROR';
  field?: string;
  message: string;
  suggestion?: string;
}

/**
 * Entity not found error
 */
export interface EntityNotFoundError {
  code: 'ENTITY_NOT_FOUND';
  entity: string;
  availableEntities: string[];
}

/**
 * Field not found error
 */
export interface FieldNotFoundError {
  code: 'FIELD_NOT_FOUND';
  entity: string;
  field: string;
  availableFields: string[];
}

/**
 * Invalid operator error
 */
export interface InvalidOperatorError {
  code: 'INVALID_OPERATOR';
  operator: string;
  fieldType: FieldType;
  validOperators: Operator[];
}

/**
 * Tool error union
 */
export type ToolError =
  | ToolValidationError
  | EntityNotFoundError
  | FieldNotFoundError
  | InvalidOperatorError;

/**
 * Tool result with success/error
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: ToolError };
