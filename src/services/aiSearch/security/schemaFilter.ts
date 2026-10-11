/**
 * Schema Filter
 *
 * Filters schema metadata based on user permissions.
 * Only exposes entities and fields the user is authorized to see.
 *
 * Note: System entities, internal fields, and sensitive patterns are already
 * filtered at generation time (schema-metadata.json.ts). This filter applies
 * permission-based access control at runtime.
 */

import {
  SchemaMetadata,
  EntityMetadata,
  VisibleSchema,
  VisibleEntity,
  VisibleField,
  SecurityContext,
  InverseRelationMetadata,
} from './types';

/**
 * Derive permission codes from entity name.
 * Convention: entityCamelCase_action (e.g., musicalWork_retrieve)
 */
function getEntityPermissions(entityName: string) {
  // Convert PascalCase to camelCase
  const camelCase = entityName.charAt(0).toLowerCase() + entityName.slice(1);
  return {
    read: `${camelCase}_retrieve`,
    create: `${camelCase}_create`,
    update: `${camelCase}_update`,
    delete: `${camelCase}_delete`,
  };
}

/**
 * Map GraphQL/Prisma types to simplified types for LLM
 */
function simplifyType(type: string): VisibleField['type'] {
  const typeMap: Record<string, VisibleField['type']> = {
    'String': 'text',
    'Int': 'number',
    'Decimal': 'number',
    'Float': 'number',
    'Boolean': 'boolean',
    'DateTime': 'date',
    'Date': 'date',
    'File': 'file',
    'Json': 'text',
  };

  if (type.startsWith('__Reference') || type.includes('Reference')) {
    return 'reference';
  }

  return typeMap[type] || 'text';
}

/**
 * Check if user has a specific permission
 */
function hasPermission(permissions: Set<string>, permissionCode: string): boolean {
  return permissions.has(permissionCode) || permissions.has('*');
}

/**
 * Check if a field is searchable (text-based)
 */
function isFieldSearchable(type: string): boolean {
  return ['String', 'text'].includes(type);
}

/**
 * Get label for entity or field in the specified language.
 * New format: { lang: { s: singular, p?: plural, d?: description } }
 */
function getLabel(
  labels: Record<string, { s: string; p?: string; d?: string }> | undefined,
  name: string,
  language: string
): string {
  if (!labels) {
    // Convert camelCase/PascalCase to human readable
    return name.replace(/([A-Z])/g, ' $1').trim();
  }

  const langLabels = labels[language] || labels['en'] || labels['es'];
  return langLabels?.s || name;
}

/**
 * Get description in the specified language.
 * New format: { lang: { s: singular, p?: plural, d?: description } }
 */
function getDescription(
  labels: Record<string, { s: string; p?: string; d?: string }> | undefined,
  language: string
): string | undefined {
  if (!labels) return undefined;
  const langLabels = labels[language] || labels['en'] || labels['es'];
  return langLabels?.d;
}

/**
 * Filter schema metadata based on user permissions.
 *
 * Note: System entities, internal fields, and sensitive patterns are already
 * filtered at generation time. This function applies runtime permission checks.
 */
export function filterSchema(
  schemaMetadata: SchemaMetadata,
  permissions: string[],
  language: string = 'es'
): VisibleSchema {
  const permissionSet = new Set(permissions);

  // First pass: collect entities user can read (for filtering inverse relations)
  const readableEntities = new Set<string>();
  for (const entity of schemaMetadata.entities) {
    const entityPerms = getEntityPermissions(entity.name);
    if (hasPermission(permissionSet, entityPerms.read)) {
      readableEntities.add(entity.name);
    }
  }

  const visibleEntities: VisibleEntity[] = [];

  for (const entity of schemaMetadata.entities) {
    // Derive permissions from entity name
    const entityPerms = getEntityPermissions(entity.name);

    // Check read permission
    const canRead = hasPermission(permissionSet, entityPerms.read);
    if (!canRead) continue;

    // Build visible fields (already filtered at generation time)
    // Filter out reference fields to entities the user can't access
    const visibleFields: VisibleField[] = entity.fields
      .filter(field => {
        // If it's a reference to another entity, check if user can read that entity
        if (field.targetEntity && !readableEntities.has(field.targetEntity)) {
          return false;
        }
        return true;
      })
      .map(field => ({
        name: field.name,
        label: getLabel(field.labels, field.name, language),
        type: simplifyType(field.type),
        description: getDescription(field.labels, language),
        searchable: isFieldSearchable(field.type),
        groupable: field.groupable ?? false,
        targetEntity: field.targetEntity,
        multi: field.multi,
        isLookup: field.isLookup,
      }));

    // Only include entity if it has visible fields
    if (visibleFields.length === 0) continue;

    // Filter inverse relations to only include readable source entities
    let visibleInverseRelations: InverseRelationMetadata[] | undefined;
    if (entity.inverseRelations) {
      visibleInverseRelations = entity.inverseRelations.filter(
        inv => readableEntities.has(inv.sourceEntity)
      );
      if (visibleInverseRelations.length === 0) {
        visibleInverseRelations = undefined;
      }
    }

    visibleEntities.push({
      name: entity.name,
      label: getLabel(entity.labels, entity.name, language),
      description: getDescription(entity.labels, language),
      fields: visibleFields,
      displayFields: entity.displayFields,
      inverseRelations: visibleInverseRelations,
      canRead: true,
      canCreate: hasPermission(permissionSet, entityPerms.create),
      canUpdate: hasPermission(permissionSet, entityPerms.update),
      canDelete: hasPermission(permissionSet, entityPerms.delete),
    });
  }

  return {
    entities: visibleEntities,
    language,
  };
}

/**
 * Build a complete security context for AI Search
 */
export function buildSecurityContext(
  userId: string,
  tenantId: string,
  permissions: string[],
  language: string,
  schemaMetadata: SchemaMetadata
): SecurityContext {
  const permissionSet = new Set(permissions);
  const visibleSchema = filterSchema(schemaMetadata, permissions, language);

  return {
    userId,
    tenantId,
    permissions: permissionSet,
    language,
    visibleSchema,
  };
}

/**
 * Get list of entity labels that are visible (for response validation)
 */
export function getVisibleEntityLabels(schema: VisibleSchema): Set<string> {
  const labels = new Set<string>();
  for (const entity of schema.entities) {
    labels.add(entity.label.toLowerCase());
  }
  return labels;
}

/**
 * Get list of all entity names from metadata (for leak detection).
 * Only includes entities in the schema - system entities are filtered
 * at generation time via .excludeFromAiSearch attribute in haiku.
 */
export function getAllEntityNames(schemaMetadata: SchemaMetadata): Set<string> {
  const names = new Set<string>();
  for (const entity of schemaMetadata.entities) {
    names.add(entity.name.toLowerCase());
  }
  return names;
}

/**
 * Generate a fingerprint for permission-based caching.
 *
 * Users with the same permissions will have the same fingerprint,
 * enabling cache sharing across users with identical access rights.
 *
 * Only considers _retrieve permissions since AI Search is read-only.
 */
export function getPermissionFingerprint(permissions: string[]): string {
  // Filter to only retrieve permissions and sort for consistency
  const retrievePerms = permissions
    .filter(p => p.endsWith('_retrieve'))
    .sort()
    .join(',');

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < retrievePerms.length; i++) {
    hash = ((hash << 5) + hash) + retrievePerms.charCodeAt(i);
  }

  // Convert to hex string and take first 16 chars
  return Math.abs(hash).toString(16).padStart(8, '0');
}
