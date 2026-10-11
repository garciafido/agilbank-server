/**
 * AI Search Security Types
 *
 * Types for permission-based schema filtering and response validation.
 */

/**
 * Visible field in the filtered schema (for LLM context)
 */
export interface VisibleField {
  /** Internal field name (for tool calls) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Simplified type for LLM understanding */
  type: 'text' | 'number' | 'date' | 'boolean' | 'file' | 'reference';
  /** Optional description */
  description?: string;
  /** Whether this field is searchable (text-based) */
  searchable: boolean;
  /** Whether this field can be used for groupBy in aggregations */
  groupable: boolean;
  /** For reference fields: target entity name */
  targetEntity?: string;
  /** For reference fields: whether it's a multi-value relation */
  multi?: boolean;
  /** For ref fields pointing to cacheable entities: requires get_lookup_values */
  isLookup?: boolean;
}

/**
 * Visible entity in the filtered schema (for LLM context)
 */
export interface VisibleEntity {
  /** Internal entity name (for tool calls) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Entity description */
  description?: string;
  /** Visible fields */
  fields: VisibleField[];
  /** Fields to display when this entity is included in queries */
  displayFields?: string[];
  /** Inverse relations from other entities (for include queries) */
  inverseRelations?: InverseRelationMetadata[];
  /** Whether user can read */
  canRead: boolean;
  /** Whether user can create */
  canCreate: boolean;
  /** Whether user can update */
  canUpdate: boolean;
  /** Whether user can delete */
  canDelete: boolean;
}

/**
 * Filtered schema visible to a specific user
 */
export interface VisibleSchema {
  /** Entities the user can access */
  entities: VisibleEntity[];
  /** Language for labels */
  language: string;
}

/**
 * Schema metadata for an entity (from generated schema-metadata.json)
 *
 * Note: The generator filters out system entities and excluded entities/fields
 * at generation time, so the JSON only contains visible entities.
 * Permissions are derived from entity name using the pattern: entityName_action
 */
export interface EntityMetadata {
  /** Internal entity name (PascalCase) */
  name: string;
  /** Labels by language: { lang: { s: singular, p?: plural, d?: description } } */
  labels?: Record<string, { s: string; p?: string; d?: string }>;
  /** Field metadata */
  fields: FieldMetadata[];
  /** Fields to display when this entity is included in another query (logical names) */
  displayFields?: string[];
  /** Field names that are multilang (require _lang suffix in Prisma queries) */
  multilangFields?: string[];
  /**
   * Prisma column names that are never selectable and never returned: `.secret`
   * and `.onlyOnServer` fields. Emitted by the generator as an explicit denylist
   * for the query executor.
   */
  deniedFields?: string[];
  /** Parent entity info (for subentities) */
  parent?: ParentMetadata;
  /** Inverse relations (entities that reference this one) */
  inverseRelations?: InverseRelationMetadata[];
}

/**
 * Schema metadata for a field
 *
 * Note: Internal fields and sensitive patterns are filtered at generation time.
 */
export interface FieldMetadata {
  /** Internal field name */
  name: string;
  /** Field type (String, Int, DateTime, ref, subentity, etc.) */
  type: string;
  /** Labels by language: { lang: { s: singular, p?: plural, d?: description } } */
  labels?: Record<string, { s: string; p?: string; d?: string }>;
  /** Whether field can be used for groupBy in aggregations */
  groupable: boolean;
  /** For ref/subentity fields: target entity name */
  targetEntity?: string;
  /** For ref/subentity fields: whether it's a multi-value relation */
  multi?: boolean;
  /** For enum fields: list of valid values with labels */
  enumValues?: Array<{ value: string; label: string }>;
  /** For ref fields pointing to cacheable entities: use get_lookup_values tool */
  isLookup?: boolean;
  /** For lookup fields: true if entity is sharedAcrossTenants (safe to cache globally) */
  isSharedLookup?: boolean;
}

/**
 * Inverse relation metadata (for navigating from target entity back to source)
 */
export interface InverseRelationMetadata {
  /** Entity that references this entity */
  sourceEntity: string;
  /** Field on sourceEntity that references this entity */
  sourceField: string;
  /** Prisma field name for the inverse relation */
  prismaField: string;
  /** Always true for inverse relations */
  multi: boolean;
}

/**
 * Parent entity info for subentities
 */
export interface ParentMetadata {
  /** Parent entity name */
  entity: string;
  /** Field name on parent that contains this subentity */
  field: string;
  /** Prisma field name to navigate to parent */
  prismaField: string;
}

/**
 * Security context for AI Search operations
 */
export interface SecurityContext {
  userId: string;
  tenantId: string;
  permissions: Set<string>;
  language: string;
  visibleSchema: VisibleSchema;
}

/**
 * Response validation result
 */
export interface ValidationResult {
  /** Whether the response is safe */
  safe: boolean;
  /** Sanitized response (with redactions if needed) */
  sanitizedResponse: string;
  /** List of security violations detected */
  violations: SecurityViolation[];
}

/**
 * Security violation detected in response
 */
export interface SecurityViolation {
  type: 'entity_leak' | 'field_leak' | 'id_leak' | 'technical_leak' | 'data_leak';
  description: string;
  /** Original text that was redacted */
  originalText?: string;
}

/**
 * Query pattern for Set (many-to-many) relations
 * Used by LLM to understand how to query junction entities
 */
export interface SetRelationPattern {
  /** Parent entity name (e.g., "MusicalWork") */
  parent: string;
  /** Set field name on parent (e.g., "authors") */
  setField: string;
  /** Junction entity name (e.g., "WorkAuthor") */
  junction: string;
  /** Field to use for groupBy on junction (e.g., "author") */
  groupByField: string;
  /** Target entity name (e.g., "AuthorComposer") */
  targetEntity: string;
}

/**
 * Query pattern for Reference relations
 * Used by LLM to understand orderBy syntax with relations
 */
export interface RefRelationPattern {
  /** Entity containing the ref field (e.g., "WorkAuthor") */
  entity: string;
  /** Reference field name (e.g., "author") */
  refField: string;
  /** Target entity name (e.g., "AuthorComposer") */
  targetEntity: string;
  /** Example orderBy using dot notation (e.g., "author.lastName") */
  orderByExample: string;
}

/**
 * Query pattern for Countable relations (filters vs having guidance)
 * Used by LLM to understand when to use filters (text) vs having (count)
 */
export interface CountableRelationPattern {
  /** Entity with the set field (e.g., "MusicalWork") */
  entity: string;
  /** Entity label for natural language (e.g., "obra") */
  entityLabel: string;
  /** Set field name (e.g., "authors") */
  setField: string;
  /** Target entity label for natural language (e.g., "autor") */
  targetLabel: string;
}

/**
 * Query pattern for groupBy + countRelation + having combinations
 * Used by LLM for queries like "géneros con obras que tengan 5 autores"
 */
export interface GroupByCountFilterPattern {
  /** Main entity name (e.g., "MusicalWork") */
  entity: string;
  /** Entity label singular (e.g., "obra musical") */
  entityLabel: string;
  /** Entity label plural (e.g., "obras musicales") */
  entityLabelPlural: string;
  /** Ref field to group by (e.g., "musicalGenre") */
  groupByField: string;
  /** Label for groupBy target (e.g., "género") */
  groupByLabel: string;
  /** Set field to count (e.g., "authors") */
  countField: string;
  /** Label for counted items singular (e.g., "autor") */
  countLabel: string;
  /** Label for counted items plural (e.g., "autores") */
  countLabelPlural: string;
}

/**
 * Query patterns for guiding LLM on correct query syntax
 * Generated from schema at build time, used in system prompt
 */
export interface QueryPatterns {
  /** Patterns for Set (many-to-many) relations */
  setRelations: SetRelationPattern[];
  /** Patterns for Reference relations (for orderBy examples) */
  refRelations: RefRelationPattern[];
  /** Patterns for Countable relations (filters vs having guidance) */
  countableRelations?: CountableRelationPattern[];
  /** Patterns for groupBy + countRelation + having */
  groupByCountFilters?: GroupByCountFilterPattern[];
}

/**
 * Full schema metadata (loaded from schema-metadata.json)
 */
export interface SchemaMetadata {
  entities: EntityMetadata[];
  /** Query patterns for LLM guidance */
  queryPatterns?: QueryPatterns;
  /** Custom instructions for domain-specific context (from hkconfig.json) */
  customInstructions?: string;
  generatedAt: string;
}
