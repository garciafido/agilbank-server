/**
 * Response Validator
 *
 * Validates and sanitizes LLM responses to prevent information leakage.
 * Ensures no unauthorized entity names, field names, or technical details are exposed.
 */

import {
  ValidationResult,
  SecurityViolation,
  VisibleSchema,
  SchemaMetadata,
} from './types';
import { getAllEntityNames } from './schemaFilter';

/**
 * Technical terms that should never appear in user-facing responses
 */
const TECHNICAL_PATTERNS = [
  /prisma/gi,
  /graphql/gi,
  /postgres/gi,
  /pgvector/gi,
  /mongodb/gi,
  /redis/gi,
  /docker/gi,
  /kubernetes/gi,
  /nginx/gi,
  /\bapi\s*key/gi,
  /bearer\s+token/gi,
  /jwt/gi,
  /oauth/gi,
  /webhook/gi,
  /endpoint/gi,
  /database/gi,
  /schema/gi,
  /migration/gi,
  /\bsql\b/gi,
  /query/gi,
  /mutation/gi,
  /resolver/gi,
  /middleware/gi,
  /\baws\b/gi,
  /s3\s*bucket/gi,
  /lambda/gi,
  /cloudfront/gi,
];

/**
 * Tool call syntax patterns that should never appear in user-facing responses
 * (DeepSeek/Qwen sometimes output these instead of using native tool calling)
 */
const TOOL_CALL_SYNTAX_PATTERNS = [
  /DSML/gi,
  /function_calls/gi,
  /invoke\s+name=/gi,
  /<[|｜][^>]*[|｜]>/g,  // Matches <|...|> or <｜...｜>
  /parameter\s+name=/gi,
];

/**
 * UUID pattern for detecting leaked IDs
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Internal field name patterns
 */
const INTERNAL_FIELD_PATTERNS = [
  /\w+_$/g,           // Fields ending with underscore
  /password\w*/gi,
  /apiKey\w*/gi,
  /secretKey\w*/gi,
  /accessToken\w*/gi,
  /refreshToken\w*/gi,
  /hash\w*/gi,
  /salt\w*/gi,
];

/**
 * Build a map of field names to their labels for leak detection
 */
function buildFieldNameToLabelMap(visibleSchema: VisibleSchema): Map<string, string> {
  const fieldMap = new Map<string, string>();

  for (const entity of visibleSchema.entities) {
    for (const field of entity.fields) {
      // Only add if name differs from label (case-insensitive)
      if (field.name.toLowerCase() !== field.label.toLowerCase()) {
        fieldMap.set(field.name.toLowerCase(), field.label);
      }
    }
    // Also add entity name if different from label
    if (entity.name.toLowerCase() !== entity.label.toLowerCase()) {
      fieldMap.set(entity.name.toLowerCase(), entity.label);
    }
  }

  return fieldMap;
}

/**
 * Build a map of entity names to their labels for visible entities
 */
function buildEntityNameToLabelMap(visibleSchema: VisibleSchema): Map<string, string> {
  const entityMap = new Map<string, string>();
  for (const entity of visibleSchema.entities) {
    entityMap.set(entity.name, entity.label);
  }
  return entityMap;
}

/**
 * Check for field name leaks in context (when used as identifiers, not in values)
 * Detects patterns like "el campo title", "field author", etc.
 */
function checkSchemaFieldNameLeaks(
  response: string,
  fieldNameToLabel: Map<string, string>,
  violations: SecurityViolation[]
): string {
  let sanitized = response;

  // Patterns that indicate field name usage (not just data values)
  const contextPatterns = [
    /\b(campo|field|columna|column|atributo|attribute)\s+(\w+)/gi,
    /\b(\w+)\s*(es|is|=|:)\s*['"]?[^'"]+['"]?\s*$/gim, // "fieldName is value" or "fieldName: value"
  ];

  for (const fieldName of fieldNameToLabel.keys()) {
    // Skip very short names that might cause false positives
    if (fieldName.length < 3) continue;

    // Check if field name appears in a technical context
    const pattern = new RegExp(
      `\\b(campo|field|columna|column|el|la|the)\\s+${escapeRegex(fieldName)}\\b`,
      'gi'
    );

    if (pattern.test(response)) {
      const label = fieldNameToLabel.get(fieldName);
      violations.push({
        type: 'field_leak',
        description: `Technical field name '${fieldName}' used instead of label '${label}'`,
        originalText: fieldName,
      });
      // Replace the field name with its label in context
      sanitized = sanitized.replace(
        new RegExp(`(campo|field|columna|column|el|la|the)\\s+${escapeRegex(fieldName)}`, 'gi'),
        `$1 ${label}`
      );
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize an LLM response
 */
export function validateResponse(
  response: string,
  visibleSchema: VisibleSchema,
  schemaMetadata: SchemaMetadata
): ValidationResult {
  const violations: SecurityViolation[] = [];
  let sanitized = response;

  // Get sets for comparison
  const allEntityNames = getAllEntityNames(schemaMetadata);

  // Build maps for name → label replacement
  const fieldNameToLabel = buildFieldNameToLabelMap(visibleSchema);
  const entityNameToLabel = buildEntityNameToLabelMap(visibleSchema);

  // 1. Check for leaked entity names (replace with labels if visible)
  sanitized = checkEntityLeaks(sanitized, allEntityNames, entityNameToLabel, violations);

  // 2. Check for leaked internal field names (generic patterns)
  sanitized = checkFieldLeaks(sanitized, violations);

  // 3. Check for schema field names used instead of labels
  sanitized = checkSchemaFieldNameLeaks(sanitized, fieldNameToLabel, violations);

  // 4. Check for leaked UUIDs (replace with generic [ID])
  sanitized = checkIdLeaks(sanitized, violations);

  // 5. Check for technical terms
  sanitized = checkTechnicalLeaks(sanitized, violations);

  // 6. Check for tool call syntax (DeepSeek/Qwen issue)
  sanitized = checkToolCallSyntaxLeaks(sanitized, violations);

  return {
    safe: violations.length === 0,
    sanitizedResponse: sanitized,
    violations,
  };
}

/**
 * Check for entity name leaks and replace with labels
 */
function checkEntityLeaks(
  response: string,
  allEntityNames: Set<string>,
  visibleEntityLabels: Map<string, string>,
  violations: SecurityViolation[]
): string {
  let sanitized = response;

  for (const entityName of allEntityNames) {
    // Create regex to match the entity name
    const pattern = new RegExp(`\\b${escapeRegex(entityName)}\\b`, 'g');

    if (pattern.test(response)) {
      // Get the label for this entity (if visible) or use placeholder
      const label = visibleEntityLabels.get(entityName);

      if (label) {
        // Entity is visible - replace technical name with label
        sanitized = sanitized.replace(pattern, label);
      } else {
        // Entity is not visible - redact completely
        violations.push({
          type: 'entity_leak',
          description: `Internal entity name detected: ${entityName}`,
          originalText: entityName,
        });
        sanitized = sanitized.replace(pattern, '[información no disponible]');
      }
    }
  }

  return sanitized;
}

/**
 * Check for internal field name leaks
 */
function checkFieldLeaks(
  response: string,
  violations: SecurityViolation[]
): string {
  let sanitized = response;

  for (const pattern of INTERNAL_FIELD_PATTERNS) {
    const matches = response.match(pattern);
    if (matches) {
      for (const match of matches) {
        violations.push({
          type: 'field_leak',
          description: `Internal field name detected: ${match}`,
          originalText: match,
        });
      }
      sanitized = sanitized.replace(pattern, '[campo interno]');
    }
  }

  return sanitized;
}

/**
 * Check for UUID leaks
 */
function checkIdLeaks(
  response: string,
  violations: SecurityViolation[]
): string {
  const matches = response.match(UUID_PATTERN);

  if (matches && matches.length > 0) {
    // Allow up to 2 UUIDs (might be legitimate references)
    // but flag if there are more
    if (matches.length > 2) {
      violations.push({
        type: 'id_leak',
        description: `Multiple internal IDs detected (${matches.length})`,
      });
    }

    // Replace UUIDs with generic marker
    return response.replace(UUID_PATTERN, '[ID]');
  }

  return response;
}

/**
 * Check for technical term leaks
 */
function checkTechnicalLeaks(
  response: string,
  violations: SecurityViolation[]
): string {
  let sanitized = response;

  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(response)) {
      const match = response.match(pattern);
      violations.push({
        type: 'technical_leak',
        description: `Technical term detected: ${match?.[0]}`,
        originalText: match?.[0],
      });
      sanitized = sanitized.replace(pattern, '[término técnico]');
    }
  }

  return sanitized;
}

/**
 * Check for tool call syntax leaks (DeepSeek/Qwen output)
 */
function checkToolCallSyntaxLeaks(
  response: string,
  violations: SecurityViolation[]
): string {
  let foundToolSyntax = false;

  for (const pattern of TOOL_CALL_SYNTAX_PATTERNS) {
    if (pattern.test(response)) {
      foundToolSyntax = true;
      break;
    }
  }

  if (foundToolSyntax) {
    violations.push({
      type: 'technical_leak',
      description: 'Tool call syntax detected in response',
    });
    // Replace entire response with friendly error
    return 'Lo siento, hubo un problema procesando tu consulta. Por favor, intenta reformularla de otra manera.';
  }

  return response;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that source references only include accessible documents
 */
export function validateSources(
  sources: Array<{ type: string; id: string }>,
  accessibleDocumentIds: Set<string>
): Array<{ type: string; id: string }> {
  return sources.filter(source => {
    if (source.type === 'document') {
      return accessibleDocumentIds.has(source.id);
    }
    // For entity sources, trust that they came from filtered tools
    return true;
  });
}

/**
 * Create an audit log entry for security violations
 */
export function createSecurityAuditEntry(
  userId: string,
  tenantId: string,
  query: string,
  violations: SecurityViolation[]
): {
  timestamp: Date;
  userId: string;
  tenantId: string;
  query: string;
  violationCount: number;
  violations: SecurityViolation[];
  severity: 'low' | 'medium' | 'high';
} {
  // Determine severity based on violation types
  let severity: 'low' | 'medium' | 'high' = 'low';

  if (violations.some(v => v.type === 'entity_leak' || v.type === 'data_leak')) {
    severity = 'high';
  } else if (violations.some(v => v.type === 'field_leak' || v.type === 'technical_leak')) {
    severity = 'medium';
  }

  return {
    timestamp: new Date(),
    userId,
    tenantId,
    query,
    violationCount: violations.length,
    violations,
    severity,
  };
}
