/**
 * PATAY Tools - Operator Definitions
 *
 * Defines all filter operators with their metadata for validation
 * and Prisma query generation.
 *
 * Key insight: Operators are typed by the field types they support.
 * This enables compile-time and runtime validation.
 */

import {
  Operator,
  StringOperator,
  NumberOperator,
  DateOperator,
  ArrayOperator,
  RelationOperator,
  FieldType,
} from './types';

// ============================================================================
// OPERATOR METADATA
// ============================================================================

/**
 * Metadata for an operator
 */
export interface OperatorMeta {
  /** Operator name */
  name: Operator;

  /** Human-readable description */
  description: string;

  /** Prisma operator name (may differ from our name) */
  prismaOperator: string;

  /** Field types this operator supports */
  supportedTypes: FieldType[];

  /** Whether operator requires a value (e.g., isEmpty doesn't) */
  requiresValue: boolean;

  /** Value type expected */
  valueType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'any';

  /** Example usage */
  example: string;
}

// ============================================================================
// STRING OPERATORS
// ============================================================================

export const STRING_OPERATORS: Record<StringOperator, OperatorMeta> = {
  equals: {
    name: 'equals',
    description: 'Exact match (case-insensitive by default)',
    prismaOperator: 'equals',
    supportedTypes: ['String'],
    requiresValue: true,
    valueType: 'string',
    example: '{ field: "name", operator: "equals", value: "John" }',
  },
  contains: {
    name: 'contains',
    description: 'Contains substring (case-insensitive by default)',
    prismaOperator: 'contains',
    supportedTypes: ['String'],
    requiresValue: true,
    valueType: 'string',
    example: '{ field: "name", operator: "contains", value: "oh" }',
  },
  startsWith: {
    name: 'startsWith',
    description: 'Starts with string (case-insensitive by default)',
    prismaOperator: 'startsWith',
    supportedTypes: ['String'],
    requiresValue: true,
    valueType: 'string',
    example: '{ field: "name", operator: "startsWith", value: "J" }',
  },
  endsWith: {
    name: 'endsWith',
    description: 'Ends with string (case-insensitive by default)',
    prismaOperator: 'endsWith',
    supportedTypes: ['String'],
    requiresValue: true,
    valueType: 'string',
    example: '{ field: "name", operator: "endsWith", value: "son" }',
  },
  not: {
    name: 'not',
    description: 'Does not equal (case-insensitive by default)',
    prismaOperator: 'not',
    supportedTypes: ['String'],
    requiresValue: true,
    valueType: 'string',
    example: '{ field: "status", operator: "not", value: "inactive" }',
  },
};

// ============================================================================
// NUMBER OPERATORS
// ============================================================================

export const NUMBER_OPERATORS: Record<NumberOperator, OperatorMeta> = {
  equals: {
    name: 'equals',
    description: 'Exact numeric match',
    prismaOperator: 'equals',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "age", operator: "equals", value: 25 }',
  },
  not: {
    name: 'not',
    description: 'Does not equal',
    prismaOperator: 'not',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "count", operator: "not", value: 0 }',
  },
  gt: {
    name: 'gt',
    description: 'Greater than',
    prismaOperator: 'gt',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "age", operator: "gt", value: 18 }',
  },
  gte: {
    name: 'gte',
    description: 'Greater than or equal',
    prismaOperator: 'gte',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "score", operator: "gte", value: 80 }',
  },
  lt: {
    name: 'lt',
    description: 'Less than',
    prismaOperator: 'lt',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "price", operator: "lt", value: 100 }',
  },
  lte: {
    name: 'lte',
    description: 'Less than or equal',
    prismaOperator: 'lte',
    supportedTypes: ['Int', 'Float', 'Decimal'],
    requiresValue: true,
    valueType: 'number',
    example: '{ field: "quantity", operator: "lte", value: 10 }',
  },
};

// ============================================================================
// DATE OPERATORS
// ============================================================================

export const DATE_OPERATORS: Record<DateOperator, OperatorMeta> = {
  equals: {
    name: 'equals',
    description: 'Exact date match',
    prismaOperator: 'equals',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "createdAt", operator: "equals", value: "2023-01-01" }',
  },
  not: {
    name: 'not',
    description: 'Does not equal date',
    prismaOperator: 'not',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "deletedAt", operator: "not", value: null }',
  },
  gt: {
    name: 'gt',
    description: 'After date',
    prismaOperator: 'gt',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "createdAt", operator: "gt", value: "2023-01-01" }',
  },
  gte: {
    name: 'gte',
    description: 'On or after date',
    prismaOperator: 'gte',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "startDate", operator: "gte", value: "2023-01-01" }',
  },
  lt: {
    name: 'lt',
    description: 'Before date',
    prismaOperator: 'lt',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "endDate", operator: "lt", value: "2024-01-01" }',
  },
  lte: {
    name: 'lte',
    description: 'On or before date',
    prismaOperator: 'lte',
    supportedTypes: ['DateTime', 'Date'],
    requiresValue: true,
    valueType: 'date',
    example: '{ field: "deadline", operator: "lte", value: "2023-12-31" }',
  },
};

// ============================================================================
// ARRAY OPERATORS
// ============================================================================

export const ARRAY_OPERATORS: Record<ArrayOperator, OperatorMeta> = {
  has: {
    name: 'has',
    description: 'Array contains value',
    prismaOperator: 'has',
    supportedTypes: ['Json'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "tags", operator: "has", value: "important" }',
  },
  hasEvery: {
    name: 'hasEvery',
    description: 'Array contains all values',
    prismaOperator: 'hasEvery',
    supportedTypes: ['Json'],
    requiresValue: true,
    valueType: 'array',
    example: '{ field: "tags", operator: "hasEvery", value: ["a", "b"] }',
  },
  hasSome: {
    name: 'hasSome',
    description: 'Array contains any of values',
    prismaOperator: 'hasSome',
    supportedTypes: ['Json'],
    requiresValue: true,
    valueType: 'array',
    example: '{ field: "tags", operator: "hasSome", value: ["x", "y"] }',
  },
  isEmpty: {
    name: 'isEmpty',
    description: 'Array is empty',
    prismaOperator: 'isEmpty',
    supportedTypes: ['Json'],
    requiresValue: true,
    valueType: 'boolean',
    example: '{ field: "items", operator: "isEmpty", value: true }',
  },
};

// ============================================================================
// RELATION OPERATORS
// ============================================================================

export const RELATION_OPERATORS: Record<RelationOperator, OperatorMeta> = {
  some: {
    name: 'some',
    description: 'At least one related record matches',
    prismaOperator: 'some',
    supportedTypes: ['Relation'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "authors", operator: "some", value: { name: "John" } }',
  },
  every: {
    name: 'every',
    description: 'All related records match',
    prismaOperator: 'every',
    supportedTypes: ['Relation'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "items", operator: "every", value: { active: true } }',
  },
  none: {
    name: 'none',
    description: 'No related records match',
    prismaOperator: 'none',
    supportedTypes: ['Relation'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "errors", operator: "none", value: {} }',
  },
  is: {
    name: 'is',
    description: 'Related record matches (1:1 or N:1)',
    prismaOperator: 'is',
    supportedTypes: ['Relation'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "author", operator: "is", value: { id: 1 } }',
  },
  isNot: {
    name: 'isNot',
    description: 'Related record does not match',
    prismaOperator: 'isNot',
    supportedTypes: ['Relation'],
    requiresValue: true,
    valueType: 'any',
    example: '{ field: "category", operator: "isNot", value: { code: "X" } }',
  },
};

// ============================================================================
// COMBINED OPERATORS MAP
// ============================================================================

/**
 * All operators by name
 */
export const ALL_OPERATORS: Record<Operator, OperatorMeta> = {
  ...STRING_OPERATORS,
  ...NUMBER_OPERATORS,
  ...DATE_OPERATORS,
  ...ARRAY_OPERATORS,
  ...RELATION_OPERATORS,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get operators valid for a field type
 */
export function getOperatorsForType(fieldType: FieldType): Operator[] {
  const validOperators: Operator[] = [];

  for (const [name, meta] of Object.entries(ALL_OPERATORS)) {
    if (meta.supportedTypes.includes(fieldType)) {
      validOperators.push(name as Operator);
    }
  }

  // Special handling for Enum (treated as String for filtering)
  if (fieldType === 'Enum') {
    return ['equals', 'not'];
  }

  // Special handling for Boolean
  if (fieldType === 'Boolean') {
    return ['equals', 'not'];
  }

  return validOperators;
}

/**
 * Check if operator is valid for field type
 */
export function isOperatorValidForType(operator: Operator, fieldType: FieldType): boolean {
  const validOperators = getOperatorsForType(fieldType);
  return validOperators.includes(operator);
}

/**
 * Get operator metadata
 */
export function getOperatorMeta(operator: Operator): OperatorMeta | undefined {
  return ALL_OPERATORS[operator];
}

/**
 * Get all string operators
 */
export function getStringOperators(): StringOperator[] {
  return Object.keys(STRING_OPERATORS) as StringOperator[];
}

/**
 * Get all comparison operators (for numbers and dates)
 */
export function getComparisonOperators(): (NumberOperator | DateOperator)[] {
  return ['equals', 'not', 'gt', 'gte', 'lt', 'lte'];
}

/**
 * Get all relation operators
 */
export function getRelationOperators(): RelationOperator[] {
  return Object.keys(RELATION_OPERATORS) as RelationOperator[];
}

/**
 * Determine default operator for field type
 */
export function getDefaultOperator(fieldType: FieldType): Operator {
  switch (fieldType) {
    case 'String':
      return 'contains';
    case 'Int':
    case 'Float':
    case 'Decimal':
    case 'Boolean':
    case 'DateTime':
    case 'Date':
    case 'Enum':
      return 'equals';
    case 'Relation':
      return 'some';
    case 'Json':
      return 'has';
    default:
      return 'equals';
  }
}
