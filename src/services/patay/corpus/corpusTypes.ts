/**
 * PATAY Test Corpus Types
 *
 * Types for the test corpus system that evaluates aiSearch accuracy.
 * Generated queries are in 3 languages (es/en/pt) and categorized by pattern and challenge.
 */

export type Lang = 'es' | 'en' | 'pt';

export type Category =
  | 'basic'
  | 'count'
  | 'filter'
  | 'aggregate'
  | 'multi-hop'
  | 'negation'
  | 'sibling'
  | 'ambiguous'
  | 'temporal'
  | 'comparison';

export type Pattern =
  | 'entity_list'        // "list all works"
  | 'singular_to'        // "the genre of work X" (N:1)
  | 'plural_to'          // "the authors of work X" (1:N or N:M)
  | 'singular_from'      // "the work of this author" (rare)
  | 'plural_from'        // "works by author X" (inverse 1:N)
  | 'count_entity'       // "how many works are there"
  | 'count_relation'     // "how many authors does work X have"
  | 'group_by'           // "works grouped by genre"
  | 'filter_equals'      // "works with genre = rock"
  | 'filter_contains'    // "works containing 'love' in title"
  | 'filter_comparison'  // "authors with more than 5 works"
  | 'multi_hop'          // "country of the author of work X"
  | 'sibling';           // "other works by the same author"

export type ExpectedTool = 'query_entities' | 'count_entities' | 'search_documents';

export interface TestCase {
  id: string;
  categories: string[];  // e.g., ["pattern:plural_to", "challenge:basic"]
  queries: Record<Lang, string>;
  expected: {
    tool: ExpectedTool;
    entity?: string;
    includes?: string[];
    filters?: Record<string, unknown>;
    groupBy?: string;
    orderBy?: string;
  };
  notes?: string;  // Optional notes about edge cases or expected behavior
}

export interface TestCorpus {
  generatedAt: string;
  projectName: string;
  version: string;
  testCases: TestCase[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    byPattern: Record<string, number>;
    byLanguage: Record<Lang, number>;
  };
}

export interface TestResult {
  testCaseId: string;
  language: Lang;
  query: string;
  expected: TestCase['expected'];
  actual: {
    tool: string;
    args: Record<string, unknown>;
  };
  passed: boolean;
  error?: string;
  responseTime?: number;
}

export interface TestReport {
  runAt: string;
  corpus: string;
  totalTests: number;
  passed: number;
  failed: number;
  accuracy: number;
  byCategory: Record<string, { passed: number; failed: number; accuracy: number }>;
  byPattern: Record<string, { passed: number; failed: number; accuracy: number }>;
  byLanguage: Record<Lang, { passed: number; failed: number; accuracy: number }>;
  failures: TestResult[];
}
