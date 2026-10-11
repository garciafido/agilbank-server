#!/usr/bin/env npx ts-node
/**
 * AI Search Debug Report Generator
 *
 * Generates a detailed markdown report of the last AI Search response,
 * including all tool calls with their arguments and results.
 *
 * Usage:
 *   npm run ai:debug              # Report of last response
 *   npm run ai:debug -- --last=3  # Report of last 3 responses
 *   npm run ai:debug -- --id=xxx  # Report of specific response ID
 *
 * Output: logs/ai-search-debug-TIMESTAMP.md
 */

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma/generated-client/client';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function formatJson(obj: unknown, maxLength = 2000): string {
  if (obj === null || obj === undefined) return '_null_';
  const json = JSON.stringify(obj, null, 2);
  if (json.length > maxLength) {
    return json.substring(0, maxLength) + '\n... (truncated)';
  }
  return json;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function generateReport(responseId?: string, lastN = 1): Promise<string> {
  // Query responses using Prisma ORM
  const responses = await prisma.aiSearchResponse.findMany({
    where: responseId ? { id: responseId } : {},
    orderBy: { createdAt: 'desc' },
    take: lastN,
    include: {
      toolCalls: {
        orderBy: { sequence: 'asc' },
      },
      conversation: {
        include: {
          createdBy_: true,
          tenant_: true,
        },
      },
    },
  });

  if (responses.length === 0) {
    return '# AI Search Debug Report\n\nNo responses found.';
  }

  const sections: string[] = [];
  sections.push('# AI Search Debug Report');
  sections.push(`\nGenerated: ${new Date().toISOString()}\n`);

  for (const resp of responses) {
    const userEmail = resp.conversation?.createdBy_?.email;
    const tenantName = resp.conversation?.tenant_?.name;

    sections.push('---');
    sections.push(`\n## Response: ${resp.id.substring(0, 8)}...`);
    sections.push(`\n**Timestamp:** ${resp.createdAt.toISOString()}`);
    if (userEmail) sections.push(`**User:** ${userEmail}`);
    if (tenantName) sections.push(`**Tenant:** ${tenantName}`);

    // Query
    sections.push('\n### Query\n');
    sections.push('```');
    sections.push(resp.query);
    sections.push('```');

    // Response
    sections.push('\n### Response\n');
    sections.push(resp.response);

    // Tool Calls
    const toolCalls = resp.toolCalls;
    if (toolCalls.length > 0) {
      const totalDuration = toolCalls.reduce((sum, tc) => sum + tc.durationMs, 0);
      const successCount = toolCalls.filter(tc => tc.success).length;

      sections.push(`\n### Tool Calls (${toolCalls.length} calls, ${formatDuration(totalDuration)} total, ${successCount}/${toolCalls.length} success)\n`);

      for (const tc of toolCalls) {
        const status = tc.success ? '✅' : '❌';
        const patternInfo = tc.pattern ? ` | Pattern: \`${tc.pattern}\`` : '';
        const pathInfo = tc.navigationPath ? ` | Path: \`${tc.navigationPath}\`` : '';

        sections.push(`#### ${status} Call #${tc.sequence}: \`${tc.toolName}\` (${formatDuration(tc.durationMs)})${patternInfo}${pathInfo}\n`);

        if (tc.errorMessage) {
          sections.push('**Error:**');
          sections.push('```');
          sections.push(tc.errorMessage);
          sections.push('```\n');
        }

        sections.push('**Arguments:**');
        sections.push('```json');
        sections.push(formatJson(tc.toolArguments));
        sections.push('```\n');

        sections.push('**Result:**');
        sections.push('```json');
        sections.push(formatJson(tc.result, 3000));
        sections.push('```\n');
      }
    } else {
      sections.push('\n### Tool Calls\n');
      sections.push('_No tool calls recorded. Enable `debugFullMode` in TenantLlmConfig to capture tool calls._\n');
    }

    // Token Usage
    if (resp.tokenUsage) {
      sections.push('\n### Token Usage\n');
      sections.push('```json');
      sections.push(formatJson(resp.tokenUsage));
      sections.push('```');
    }

    // Sources (RAG)
    if (resp.sources) {
      sections.push('\n### RAG Sources\n');
      sections.push('```json');
      sections.push(formatJson(resp.sources, 1000));
      sections.push('```');
    }

    // Explanation (legacy tool call summary)
    if (resp.explanation) {
      sections.push('\n### Explanation (Summary)\n');
      sections.push('```json');
      sections.push(formatJson(resp.explanation, 1000));
      sections.push('```');
    }
  }

  return sections.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let responseId: string | undefined;
  let lastN = 1;

  for (const arg of args) {
    if (arg.startsWith('--id=')) {
      responseId = arg.split('=')[1];
    } else if (arg.startsWith('--last=')) {
      lastN = parseInt(arg.split('=')[1], 10) || 1;
    }
  }

  try {
    console.log('\n📊 Generating AI Search Debug Report...\n');

    const report = await generateReport(responseId, lastN);

    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Write report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `ai-search-debug-${timestamp}.md`;
    const filepath = path.join(logsDir, filename);

    fs.writeFileSync(filepath, report);

    console.log(`✅ Report saved: ${filepath}\n`);

    // Also print to console
    console.log('─'.repeat(60));
    console.log(report);
    console.log('─'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
