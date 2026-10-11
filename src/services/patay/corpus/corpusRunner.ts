/**
 * PATAY Test Corpus Runner
 *
 * Executes test cases from the generated corpus against aiSearch
 * and generates accuracy reports.
 *
 * Usage:
 *   npx ts-node src/services/patay/corpus/corpusRunner.ts
 *   npx ts-node src/services/patay/corpus/corpusRunner.ts --lang es
 *   npx ts-node src/services/patay/corpus/corpusRunner.ts --category basic
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestCorpus, TestCase, TestResult, TestReport, Lang } from './corpusTypes';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CORPUS_PATH = path.join(__dirname, 'test-corpus.json');
const REPORT_PATH = path.join(__dirname, 'test-report.json');
const AI_SEARCH_ENDPOINT = process.env.AI_SEARCH_ENDPOINT || 'http://localhost:3000/api/aiSearch/search';

// ============================================================================
// HELPERS
// ============================================================================

async function executeQuery(query: string, language: Lang): Promise<{ tool: string; args: Record<string, unknown> } | null> {
  try {
    const response = await fetch(AI_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': language,
      },
      body: JSON.stringify({
        query,
        conversationId: `test-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      console.error(`HTTP error: ${response.status}`);
      return null;
    }

    // Parse SSE response to extract tool calls
    const text = await response.text();
    const toolCallMatch = text.match(/tool_call.*?"name":\s*"([^"]+)".*?"arguments":\s*(\{[^}]+\})/s);

    if (toolCallMatch) {
      return {
        tool: toolCallMatch[1],
        args: JSON.parse(toolCallMatch[2]),
      };
    }

    return null;
  } catch (error) {
    console.error(`Error executing query: ${error}`);
    return null;
  }
}

function compareToolCall(
  expected: TestCase['expected'],
  actual: { tool: string; args: Record<string, unknown> } | null
): boolean {
  if (!actual) return false;

  // Check tool name
  if (actual.tool !== expected.tool) return false;

  // Check entity if specified
  if (expected.entity && actual.args.entity !== expected.entity) return false;

  // Basic validation passed
  return true;
}

// ============================================================================
// RUNNER
// ============================================================================

async function runCorpus(options: {
  lang?: Lang;
  category?: string;
  pattern?: string;
  limit?: number;
  verbose?: boolean;
}): Promise<TestReport> {
  // Load corpus
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(`Corpus not found at ${CORPUS_PATH}. Run the generator first.`);
  }

  const corpus: TestCorpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf-8'));
  console.log(`Loaded corpus: ${corpus.testCases.length} test cases from ${corpus.projectName}`);

  // Filter test cases
  let testCases = corpus.testCases;

  if (options.category) {
    testCases = testCases.filter(tc =>
      tc.categories.some(c => c.includes(options.category!))
    );
  }

  if (options.pattern) {
    testCases = testCases.filter(tc =>
      tc.categories.some(c => c === `pattern:${options.pattern}`)
    );
  }

  if (options.limit) {
    testCases = testCases.slice(0, options.limit);
  }

  // Determine languages to test
  const langs: Lang[] = options.lang ? [options.lang] : ['es', 'en', 'pt'];

  console.log(`Running ${testCases.length} test cases in ${langs.length} languages...`);

  // Execute tests
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    for (const lang of langs) {
      const query = testCase.queries[lang];
      if (!query) continue;

      if (options.verbose) {
        console.log(`\n[${testCase.id}] ${lang}: ${query}`);
      }

      const startTime = Date.now();
      const actual = await executeQuery(query, lang);
      const responseTime = Date.now() - startTime;

      const testPassed = compareToolCall(testCase.expected, actual);

      if (testPassed) {
        passed++;
        if (options.verbose) {
          console.log(`  ✓ PASSED (${responseTime}ms)`);
        }
      } else {
        failed++;
        if (options.verbose) {
          console.log(`  ✗ FAILED`);
          console.log(`    Expected: ${testCase.expected.tool} on ${testCase.expected.entity}`);
          console.log(`    Actual: ${actual?.tool || 'null'} on ${actual?.args?.entity || 'null'}`);
        }
      }

      results.push({
        testCaseId: testCase.id,
        language: lang,
        query,
        expected: testCase.expected,
        actual: actual || { tool: 'null', args: {} },
        passed: testPassed,
        responseTime,
      });
    }
  }

  // Calculate stats
  const accuracy = passed / (passed + failed);

  const byCategory: Record<string, { passed: number; failed: number; accuracy: number }> = {};
  const byPattern: Record<string, { passed: number; failed: number; accuracy: number }> = {};
  const byLanguage: Record<Lang, { passed: number; failed: number; accuracy: number }> = {
    es: { passed: 0, failed: 0, accuracy: 0 },
    en: { passed: 0, failed: 0, accuracy: 0 },
    pt: { passed: 0, failed: 0, accuracy: 0 },
  };

  for (const result of results) {
    // By language
    if (result.passed) {
      byLanguage[result.language].passed++;
    } else {
      byLanguage[result.language].failed++;
    }

    // By category/pattern
    const testCase = testCases.find(tc => tc.id === result.testCaseId);
    if (testCase) {
      for (const cat of testCase.categories) {
        if (!byCategory[cat]) {
          byCategory[cat] = { passed: 0, failed: 0, accuracy: 0 };
        }
        if (result.passed) {
          byCategory[cat].passed++;
        } else {
          byCategory[cat].failed++;
        }

        if (cat.startsWith('pattern:')) {
          const pattern = cat.replace('pattern:', '');
          if (!byPattern[pattern]) {
            byPattern[pattern] = { passed: 0, failed: 0, accuracy: 0 };
          }
          if (result.passed) {
            byPattern[pattern].passed++;
          } else {
            byPattern[pattern].failed++;
          }
        }
      }
    }
  }

  // Calculate accuracies
  for (const key of Object.keys(byCategory)) {
    const stats = byCategory[key];
    stats.accuracy = stats.passed / (stats.passed + stats.failed);
  }
  for (const key of Object.keys(byPattern)) {
    const stats = byPattern[key];
    stats.accuracy = stats.passed / (stats.passed + stats.failed);
  }
  for (const lang of Object.keys(byLanguage) as Lang[]) {
    const stats = byLanguage[lang];
    stats.accuracy = stats.passed / (stats.passed + stats.failed) || 0;
  }

  const report: TestReport = {
    runAt: new Date().toISOString(),
    corpus: corpus.projectName,
    totalTests: passed + failed,
    passed,
    failed,
    accuracy,
    byCategory,
    byPattern,
    byLanguage,
    failures: results.filter(r => !r.passed),
  };

  return report;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options: Parameters<typeof runCorpus>[0] = {
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      options.lang = args[i + 1] as Lang;
    }
    if (args[i] === '--category' && args[i + 1]) {
      options.category = args[i + 1];
    }
    if (args[i] === '--pattern' && args[i + 1]) {
      options.pattern = args[i + 1];
    }
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
    }
  }

  try {
    const report = await runCorpus(options);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST REPORT');
    console.log('='.repeat(60));
    console.log(`Total: ${report.totalTests}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Accuracy: ${(report.accuracy * 100).toFixed(2)}%`);

    console.log('\nBy Language:');
    for (const [lang, stats] of Object.entries(report.byLanguage)) {
      console.log(`  ${lang}: ${(stats.accuracy * 100).toFixed(2)}% (${stats.passed}/${stats.passed + stats.failed})`);
    }

    console.log('\nBy Pattern:');
    for (const [pattern, stats] of Object.entries(report.byPattern)) {
      console.log(`  ${pattern}: ${(stats.accuracy * 100).toFixed(2)}% (${stats.passed}/${stats.passed + stats.failed})`);
    }

    // Save report
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${REPORT_PATH}`);

    // Exit with error code if accuracy is below threshold
    if (report.accuracy < 0.85) {
      console.log('\n⚠️  Accuracy below 85% threshold');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error running corpus:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runCorpus };
