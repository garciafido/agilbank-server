/**
 * AI Search Query Limits - Centralized Configuration
 *
 * All query result limits are defined here to ensure consistency
 * across tools, prompts, and documentation.
 */

export const QUERY_LIMITS = {
  /** Pie chart: maximum categories (no pagination) */
  PIE_CHART: 10,

  /** Bar chart vertical: default groups (supports pagination) */
  BAR_CHART_VERTICAL: 20,

  /** Bar chart horizontal: groups per page (supports pagination) */
  BAR_CHART_HORIZONTAL: 30,

  /** Tables: rows per page (supports pagination) */
  TABLE: 30,

  /** Maximum absolute limit for any query */
  ABSOLUTE_MAX: 100,
} as const;

/** Default page size for entity queries and aggregations */
export const DEFAULT_PAGE_SIZE = QUERY_LIMITS.TABLE;

/** Maximum limit for groupBy operations */
export const MAX_GROUPBY_LIMIT = QUERY_LIMITS.TABLE;

/** Default limit for groupBy operations */
export const DEFAULT_GROUPBY_LIMIT = QUERY_LIMITS.BAR_CHART_VERTICAL;
