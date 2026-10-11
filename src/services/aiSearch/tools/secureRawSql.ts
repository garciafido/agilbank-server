/**
 * Secure Raw SQL for Nested GroupBy
 *
 * Implements groupBy on nested paths (e.g., "author.gender") using Raw SQL
 * with absolute security guarantees:
 * 1. Tenant filtering ALWAYS applied
 * 2. Field permissions validated against VisibleSchema
 * 3. SQL injection prevented via parameterization
 *
 * SECURITY MODEL:
 * - tenant_id_ is ALWAYS in WHERE clause (parameterized)
 * - All entity names and field names are validated against SchemaMetadata
 * - User input values are NEVER interpolated into SQL
 * - Only schema-validated identifiers are used in SQL construction
 */

import { PrismaClient } from '../../../prisma/generated-client/client';
import { SchemaMetadata, FieldMetadata } from '../security/types';
import { SearchContext } from '../types';
import { getDisplayFieldsForPrisma } from './multilangHelper';

export interface NestedGroupByResult {
  groups: Array<{ value: string | null; count: number; label?: string }>;
  totalGroups: number;
}

/**
 * Path segment representing a relation traversal
 */
interface PathSegment {
  fieldName: string;          // Field name in current entity (e.g., "author")
  targetEntity: string;       // Target entity name (e.g., "AuthorComposer")
  targetTable: string;        // DB table name (snake_case)
  joinColumn: string;         // FK column for JOIN (on current or target table depending on isInverse)
  isLookup: boolean;
  isInverse: boolean;         // True if this is an inverse relation (FK is on target table)
  sourceTable?: string;       // For inverse relations: the current table name
}

/**
 * Parsed and validated path
 */
interface ParsedPath {
  segments: PathSegment[];
  finalField: string;         // Final field for groupBy
  finalFieldColumn: string;   // DB column name for final field
  finalEntity: string;        // Final entity name
}

/**
 * Convert PascalCase entity name to snake_case table name
 * Examples:
 * - "MusicalWork" -> "musical_work"
 * - "AuthorComposer" -> "author_composer"
 * - "WorkAuthor" -> "work_author"
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .slice(1);  // Remove leading underscore
}

/**
 * Convert camelCase field name to snake_case column name
 * Examples:
 * - "createdAt" -> "created_at"
 * - "firstName" -> "first_name"
 * - "name" -> "name"
 */
function fieldToColumn(fieldName: string): string {
  return fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Convert relation field name to DB foreign key column name.
 *
 * IMPORTANT: The haiku generator uses DOUBLE underscore for FK columns.
 * See schema.prisma.ts line ~102:
 *   `${fieldName}_id String @map("${snaked}__id")`
 *
 * Examples:
 * - "author" -> "author__id" (double underscore)
 * - "musicalGenre" -> "musical_genre__id"
 * - "authorComposer" -> "author_composer__id"
 */
function relationFieldToDbColumn(fieldName: string): string {
  const snaked = fieldName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');  // Remove leading underscore if any
  return `${snaked}__id`;  // DOUBLE underscore - this is critical!
}

/**
 * Parse nested path and validate against schema
 *
 * SECURITY: Validates that:
 * 1. All entities in path exist in schema
 * 2. User has retrieve permission on all entities
 * 3. All fields exist and are valid relations (except final field)
 */
function parseNestedPath(
  startEntity: string,
  path: string,
  schemaMetadata: SchemaMetadata,
  context: SearchContext
): { valid: true; parsed: ParsedPath } | { valid: false; error: string } {
  const parts = path.split('.');
  const segments: PathSegment[] = [];

  let currentEntityName = startEntity;

  // Walk through all segments except the last (which is the final field)
  for (let i = 0; i < parts.length - 1; i++) {
    const fieldName = parts[i];

    // Find current entity in schema
    const entityMeta = schemaMetadata.entities.find(e => e.name === currentEntityName);
    if (!entityMeta) {
      return { valid: false, error: `Entidad '${currentEntityName}' no encontrada en schema` };
    }

    // Check user has permission to access this entity
    const permCode = `${currentEntityName.charAt(0).toLowerCase() + currentEntityName.slice(1)}_retrieve`;
    if (!context.permissions.includes(permCode) && !context.permissions.includes('*')) {
      return { valid: false, error: `Sin permiso para acceder a ${currentEntityName}` };
    }

    // Find the field - first check direct relations (fields), then inverse relations
    const fieldMeta = entityMeta.fields.find(f => f.name === fieldName);
    const inverseMeta = entityMeta.inverseRelations?.find(r => r.prismaField === fieldName);

    if (fieldMeta && fieldMeta.targetEntity) {
      // Check for implicit many-to-many relations (no FK column exists)
      // These use Prisma's implicit join tables which we can't easily query with raw SQL
      if (fieldMeta.multi && !fieldMeta.isLookup) {
        return {
          valid: false,
          error: `Campo '${fieldName}' es una relación many-to-many implícita. ` +
            `Use la entidad de unión explícita o Prisma API en lugar de Raw SQL.`,
        };
      }

      // Direct relation: FK is on current entity (e.g., author.gender -> author.gender__id = gender.id)
      segments.push({
        fieldName,
        targetEntity: fieldMeta.targetEntity,
        targetTable: toSnakeCase(fieldMeta.targetEntity),
        joinColumn: relationFieldToDbColumn(fieldName),  // author -> author__id
        isLookup: fieldMeta.isLookup || false,
        isInverse: false,
      });
      currentEntityName = fieldMeta.targetEntity;
    } else if (inverseMeta) {
      // Inverse relation: FK is on target entity (e.g., MusicalWork.authors -> work_author.musical_work__id = musical_work.id)
      // The sourceField is the field on the target entity that points back to current entity
      const currentTable = toSnakeCase(currentEntityName);
      segments.push({
        fieldName,
        targetEntity: inverseMeta.sourceEntity,
        targetTable: toSnakeCase(inverseMeta.sourceEntity),
        // For inverse relations, the JOIN is: currentTable.id = targetTable.sourceField__id
        joinColumn: relationFieldToDbColumn(inverseMeta.sourceField),  // musicalWork -> musical_work__id
        isLookup: false,
        isInverse: true,
        sourceTable: currentTable,
      });
      currentEntityName = inverseMeta.sourceEntity;
    } else if (fieldMeta && !fieldMeta.targetEntity) {
      return { valid: false, error: `Campo '${fieldName}' no es una relación` };
    } else {
      return { valid: false, error: `Campo '${fieldName}' no existe en ${currentEntityName}` };
    }
  }

  // Validate final field exists and user can see it
  const finalFieldName = parts[parts.length - 1];
  const finalEntityMeta = schemaMetadata.entities.find(e => e.name === currentEntityName);
  if (!finalEntityMeta) {
    return { valid: false, error: `Entidad final '${currentEntityName}' no encontrada` };
  }

  const finalFieldMeta = finalEntityMeta.fields.find(f => f.name === finalFieldName);
  if (!finalFieldMeta) {
    return { valid: false, error: `Campo '${finalFieldName}' no existe en ${currentEntityName}` };
  }

  // Check permission on final entity
  const finalPermCode = `${currentEntityName.charAt(0).toLowerCase() + currentEntityName.slice(1)}_retrieve`;
  if (!context.permissions.includes(finalPermCode) && !context.permissions.includes('*')) {
    return { valid: false, error: `Sin permiso para acceder a ${currentEntityName}` };
  }

  // Determine the actual DB column name for the final field
  // For lookup relations, we need to join to get the display field
  let finalFieldColumn: string;
  if (finalFieldMeta.targetEntity) {
    // Final field is a relation (e.g., "gender" pointing to Gender lookup)
    // We'll join to the lookup and get its display field - use double underscore
    finalFieldColumn = relationFieldToDbColumn(finalFieldName);
  } else {
    // Final field is a scalar
    finalFieldColumn = fieldToColumn(finalFieldName);
  }

  return {
    valid: true,
    parsed: {
      segments,
      finalField: finalFieldName,
      finalFieldColumn,
      finalEntity: currentEntityName,
    },
  };
}

/**
 * Build SQL for a lookup field to get the display value
 * Returns the column expression and any additional JOIN needed
 */
function buildLookupDisplay(
  finalFieldName: string,
  finalEntityMeta: { name: string; fields: FieldMetadata[] } | undefined,
  schemaMetadata: SchemaMetadata,
  language: string
): { selectExpr: string; joinClause: string; groupByExpr: string } {
  if (!finalEntityMeta) {
    return {
      selectExpr: `t_final."${fieldToColumn(finalFieldName)}"`,
      joinClause: '',
      groupByExpr: `t_final."${fieldToColumn(finalFieldName)}"`,
    };
  }

  const fieldMeta = finalEntityMeta.fields.find(f => f.name === finalFieldName);
  if (!fieldMeta?.targetEntity) {
    // Scalar field
    return {
      selectExpr: `t_final."${fieldToColumn(finalFieldName)}"`,
      joinClause: '',
      groupByExpr: `t_final."${fieldToColumn(finalFieldName)}"`,
    };
  }

  // Lookup field - need to join to get display value
  const lookupEntity = schemaMetadata.entities.find(e => e.name === fieldMeta.targetEntity);
  if (!lookupEntity) {
    // Fallback to FK - use double underscore for DB column
    const fkColumn = relationFieldToDbColumn(finalFieldName);
    return {
      selectExpr: `t_final."${fkColumn}"`,
      joinClause: '',
      groupByExpr: `t_final."${fkColumn}"`,
    };
  }

  const lookupTable = toSnakeCase(fieldMeta.targetEntity);

  // Use multilangHelper to get the correct display field (handles multilang correctly)
  const displayFields = getDisplayFieldsForPrisma(lookupEntity, language);
  const displayColumn = displayFields.length > 0
    ? fieldToColumn(displayFields[0])
    : 'id';

  // Use double underscore for FK column in JOIN
  const fkColumn = relationFieldToDbColumn(finalFieldName);
  return {
    selectExpr: `t_lookup."${displayColumn}"`,
    joinClause: `LEFT JOIN "${lookupTable}" t_lookup ON t_final."${fkColumn}" = t_lookup."id"`,
    groupByExpr: `t_lookup."${displayColumn}"`,
  };
}

/**
 * Execute secure groupBy on nested path using Raw SQL
 *
 * SECURITY GUARANTEES:
 * 1. tenant_id_ ALWAYS in WHERE clause (parameterized with $1)
 * 2. All entities in path validated for permissions
 * 3. Values parameterized (no SQL injection possible)
 * 4. Only schema-validated table/column names used
 *
 * @param prisma - PrismaClient instance
 * @param entityName - Starting entity name
 * @param nestedPath - Dotted path (e.g., "author.gender")
 * @param where - Additional WHERE conditions (not yet implemented for Raw SQL)
 * @param schemaMetadata - Schema metadata for validation
 * @param context - Search context with tenantId and permissions
 */
export async function executeSecureGroupByNestedPath(
  prisma: PrismaClient,
  entityName: string,
  nestedPath: string,
  where: Record<string, unknown>,
  schemaMetadata: SchemaMetadata,
  context: SearchContext
): Promise<NestedGroupByResult> {
  // 1. Parse and validate the path
  const pathResult = parseNestedPath(entityName, nestedPath, schemaMetadata, context);
  if (!pathResult.valid) {
    throw new Error(pathResult.error);
  }

  const { segments, finalField, finalEntity } = pathResult.parsed;

  // Tope de profundidad: cada segmento es un LEFT JOIN. parseNestedPath ya valida
  // que cada salto sea una relación real del schema (sin inyección), pero no acota
  // cuántos: una ruta muy anidada arma decenas de joins y es un DoS barato. Un
  // camino legítimo de agregación no pasa de unos pocos saltos.
  const MAX_NESTED_SEGMENTS = Number(process.env.AI_SEARCH_MAX_NESTED_SEGMENTS) > 0
    ? Number(process.env.AI_SEARCH_MAX_NESTED_SEGMENTS)
    : 6;
  if (segments.length > MAX_NESTED_SEGMENTS) {
    throw new Error(
      `Ruta anidada demasiado profunda: ${segments.length} saltos (máximo ${MAX_NESTED_SEGMENTS}).`
    );
  }

  const startTable = toSnakeCase(entityName);

  // Get final entity metadata for lookup handling
  const finalEntityMeta = schemaMetadata.entities.find(e => e.name === finalEntity);

  // Build lookup display if final field is a lookup
  const lookupDisplay = buildLookupDisplay(
    finalField,
    finalEntityMeta,
    schemaMetadata,
    context.language || 'es'
  );

  // 2. Build the SQL query with JOINs
  let sql = `SELECT ${lookupDisplay.selectExpr} as group_value, COUNT(*) as count\n`;
  sql += `FROM "${startTable}" t0\n`;

  // Add JOINs for each segment in the path
  let tableAlias = 0;
  for (const segment of segments) {
    const prevAlias = `t${tableAlias}`;
    tableAlias++;
    const currAlias = tableAlias === segments.length ? 't_final' : `t${tableAlias}`;

    if (segment.isInverse) {
      // Inverse relation: FK is on target table (e.g., work_author.musical_work_id = musical_work.id)
      sql += `LEFT JOIN "${segment.targetTable}" ${currAlias} ON ${prevAlias}."id" = ${currAlias}."${segment.joinColumn}"\n`;
    } else {
      // Direct relation: FK is on current table (e.g., author.gender_id = gender.id)
      sql += `LEFT JOIN "${segment.targetTable}" ${currAlias} ON ${prevAlias}."${segment.joinColumn}" = ${currAlias}."id"\n`;
    }
  }

  // Add lookup join if needed
  if (lookupDisplay.joinClause) {
    sql += `${lookupDisplay.joinClause}\n`;
  }

  // 3. CRITICAL SECURITY: Always filter by tenant_id_
  // The tenant ID is ALWAYS parameterized ($1) to prevent injection
  // NOTE: DB column is tenant__id__ (double underscore) per haiku generator convention
  sql += `WHERE t0."tenant__id__" = $1\n`;

  // TODO: Add support for additional WHERE conditions from 'where' parameter
  // This would require careful translation of Prisma-style conditions to SQL
  // For now, we only support the base query with tenant filtering

  // 4. Add groupBy and ordering
  sql += `GROUP BY ${lookupDisplay.groupByExpr}\n`;
  sql += `ORDER BY count DESC\n`;
  sql += `LIMIT 100`;  // Safety limit to prevent memory issues

  // Log the query for debugging (without tenant value for security)
  console.log(`[SecureRawSQL] Executing nested groupBy: ${entityName}.${nestedPath}`);
  console.log(`[SecureRawSQL] SQL: ${sql.replace(/\n/g, ' ')}`);

  // 5. Execute with parameterized tenant ID
  // SECURITY: The only parameter ($1) is the tenant ID, which is taken from
  // the authenticated context, never from user input
  const results = await prisma.$queryRawUnsafe<Array<{ group_value: string | null; count: bigint }>>(
    sql,
    context.tenantId
  );

  // 6. Format results
  const groups = results.map(r => ({
    value: r.group_value,
    count: Number(r.count),
    label: r.group_value ?? '(Sin valor)',
  }));

  console.log(`[SecureRawSQL] Results: ${groups.length} groups`);

  return {
    groups,
    totalGroups: groups.length,
  };
}
