/**
 * PATAY Validators - Operator Validator
 *
 * Validates operator usage and value types.
 * Provides detailed error messages for invalid combinations.
 */

import {
  Operator,
  FieldType,
  ToolResult,
  InvalidOperatorError,
  ToolValidationError,
} from '../tools/types';
import {
  ALL_OPERATORS,
  getOperatorsForType,
  isOperatorValidForType,
  OperatorMeta,
} from '../tools/operators';

// ============================================================================
// TYPES
// ============================================================================

export interface OperatorValidationResult {
  operator: Operator;
  meta: OperatorMeta;
  coercedValue: unknown;
}

// ============================================================================
// VALUE COERCION
// ============================================================================

/**
 * Try to coerce value to expected type
 */
export function coerceValue(
  value: unknown,
  expectedType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'any'
): ToolResult<{ value: unknown }> {
  if (value === null || value === undefined) {
    return { success: true, data: { value } };
  }

  switch (expectedType) {
    case 'string': {
      if (typeof value === 'string') {
        return { success: true, data: { value } };
      }
      // Coerce to string
      return { success: true, data: { value: String(value) } };
    }

    case 'number': {
      if (typeof value === 'number') {
        return { success: true, data: { value } };
      }
      if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          return { success: true, data: { value: num } };
        }
      }
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Expected number, got ${typeof value}: "${value}"`,
        suggestion: 'Provide a valid number value',
      };
      return { success: false, error };
    }

    case 'boolean': {
      if (typeof value === 'boolean') {
        return { success: true, data: { value } };
      }
      if (value === 'true' || value === 1) {
        return { success: true, data: { value: true } };
      }
      if (value === 'false' || value === 0) {
        return { success: true, data: { value: false } };
      }
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Expected boolean, got ${typeof value}: "${value}"`,
        suggestion: 'Use true or false',
      };
      return { success: false, error };
    }

    case 'date': {
      if (value instanceof Date) {
        return { success: true, data: { value } };
      }
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return { success: true, data: { value: date } };
        }
      }
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Expected date, got ${typeof value}: "${value}"`,
        suggestion: 'Use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss',
      };
      return { success: false, error };
    }

    case 'array': {
      if (Array.isArray(value)) {
        return { success: true, data: { value } };
      }
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Expected array, got ${typeof value}`,
        suggestion: 'Provide an array value like ["a", "b"]',
      };
      return { success: false, error };
    }

    case 'any':
    default:
      return { success: true, data: { value } };
  }
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate operator for field type and value
 *
 * Performs:
 * 1. Operator exists check
 * 2. Operator-type compatibility check
 * 3. Value type validation/coercion
 */
export function validateOperator(
  operator: Operator,
  fieldType: FieldType,
  value: unknown
): ToolResult<OperatorValidationResult> {
  // Check operator exists
  const meta = ALL_OPERATORS[operator];
  if (!meta) {
    const validOperators = Object.keys(ALL_OPERATORS);
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      message: `Unknown operator "${operator}"`,
      suggestion: `Valid operators: ${validOperators.join(', ')}`,
    };
    return { success: false, error };
  }

  // Check operator-type compatibility
  if (!isOperatorValidForType(operator, fieldType)) {
    const validOperators = getOperatorsForType(fieldType);
    const error: InvalidOperatorError = {
      code: 'INVALID_OPERATOR',
      operator,
      fieldType,
      validOperators,
    };
    return { success: false, error };
  }

  // Check value type
  if (meta.requiresValue && value === undefined) {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      message: `Operator "${operator}" requires a value`,
      suggestion: `Example: ${meta.example}`,
    };
    return { success: false, error };
  }

  // Coerce value to expected type
  const valueType = meta.valueType || 'any';
  const coerceResult = coerceValue(value, valueType);
  if (!coerceResult.success) {
    return coerceResult as ToolResult<OperatorValidationResult>;
  }

  return {
    success: true,
    data: {
      operator,
      meta,
      coercedValue: coerceResult.data.value,
    },
  };
}

/**
 * Get human-readable description of valid operators for a type
 */
export function describeValidOperators(fieldType: FieldType): string {
  const operators = getOperatorsForType(fieldType);
  const descriptions = operators.map(op => {
    const meta = ALL_OPERATORS[op];
    return `${op}: ${meta?.description || 'No description'}`;
  });
  return descriptions.join('\n');
}

/**
 * Check if value is valid for null comparison
 */
export function isNullComparison(value: unknown): boolean {
  return value === null;
}

/**
 * Validate that a comparison makes sense
 * e.g., comparing string with "gt" doesn't make sense lexically
 */
export function validateComparisonSemantics(
  operator: Operator,
  fieldType: FieldType,
  value: unknown
): ToolResult<void> {
  // Null comparisons only work with equals/not
  if (isNullComparison(value)) {
    if (operator !== 'equals' && operator !== 'not') {
      const error: ToolValidationError = {
        code: 'VALIDATION_ERROR',
        message: `Cannot use operator "${operator}" with null value`,
        suggestion: 'Use "equals" or "not" operator for null comparisons',
      };
      return { success: false, error };
    }
  }

  // Empty string with comparison operators
  if (fieldType === 'String' && value === '' && ['gt', 'lt', 'gte', 'lte'].includes(operator)) {
    const error: ToolValidationError = {
      code: 'VALIDATION_ERROR',
      message: `Comparison operator "${operator}" with empty string is likely unintended`,
      suggestion: 'Use "equals" for empty string check or provide a value to compare',
    };
    return { success: false, error };
  }

  return { success: true, data: undefined };
}
