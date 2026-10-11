/**
 * PATAY Validators
 *
 * Input validation for PATAY tools.
 * Validates entities, fields, filters, and operators.
 */

// Entity validation
export {
  validateEntity,
  findEntityByName,
  findEntityByLabel,
  findSimilarEntities,
  getAllEntityNames,
  entityHasRelation,
  getEntityRelations,
  type EntityValidationResult,
} from './entityValidator';

// Filter validation
export {
  validateSingleFilter,
  validateFilterExpression,
  validateFilters,
  resolveFieldPath,
  findField,
  findFieldByLabel,
  type FilterValidationResult,
  type ResolvedFieldPath,
} from './filterValidator';

// Operator validation
export {
  validateOperator,
  coerceValue,
  describeValidOperators,
  isNullComparison,
  validateComparisonSemantics,
  type OperatorValidationResult,
} from './operatorValidator';
