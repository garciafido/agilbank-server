#!/usr/bin/env npx ts-node
/**
 * AI Search CLI - Interactive AI Search with full security flow
 *
 * Usage:
 *   npm run ai:search                           # Interactive mode
 *   npm run ai:search --user admin@example.com  # Specify user
 *   npm run ai:search -v                        # Verbose mode
 *
 * In interactive mode:
 *   - Type your queries and press Enter
 *   - Type "exit" or "salir" to quit
 *   - Press Ctrl+C to quit
 */

// Required for tsyringe DI container
import 'reflect-metadata';

import * as readline from 'readline';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma/generated-client/client';
import {
  createAiSearchService,
  AiSearchServiceConfig,
  SearchContext,
  SchemaMetadata,
  ToolCallEvent,
} from '../src/services/aiSearch';
import { SchemaMetadataStore } from '../src/common/services/schemaMetadata';
import * as fs from 'fs';
import * as path from 'path';

// Import schema-metadata.json (generated at build time)
import schemaMetadata from '../src/services/aiSearch/schema-metadata.json';

// Debug log files - overwritten on each run
const DEBUG_LOG_FILE = path.join(process.cwd(), 'logs', 'ai-search-debug.log');
const PROMPT_LOG_FILE = path.join(process.cwd(), 'logs', 'ai-search-prompt.log');
let debugLogInitialized = false;

function writePromptLog(prompt: string): void {
  try {
    const logsDir = path.dirname(PROMPT_LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const content = `=== AI Search System Prompt ===\nTimestamp: ${new Date().toISOString()}\n\n${prompt}\n`;
    fs.writeFileSync(PROMPT_LOG_FILE, content);
  } catch {
    // Silently fail
  }
}

function writeDebugLog(event: ToolCallEvent): void {
  try {
    const logsDir = path.dirname(DEBUG_LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    if (!debugLogInitialized) {
      fs.writeFileSync(DEBUG_LOG_FILE, `=== AI Search Debug Log ===\nTimestamp: ${new Date().toISOString()}\n\n`);
      debugLogInitialized = true;
    }

    const logEntry = [
      `--- ${event.toolName} ---`,
      `Args: ${JSON.stringify(event.args, null, 2)}`,
      `Success: ${event.result.success}`,
      `Duration: ${event.durationMs}ms`,
      `Result: ${JSON.stringify(event.result, null, 2)}`,
      '\n',
    ].join('\n');

    fs.appendFileSync(DEBUG_LOG_FILE, logEntry);
  } catch {
    // Silently fail
  }
}

interface TenantLlmConfigRow {
  id: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  max_tokens: number | null;
  temperature: number | null;
  provider_code: string;
}

interface UserWithRole {
  id: string;
  email: string;
  tenant_id_: string;
  // One role at most (User.role)
  role: {
    id: string;
    permissions: Array<{ id: string }>;
  } | null;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const userArg = args.find(a => a.startsWith('--user='));
  const userEmail = userArg?.split('=')[1];

  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('\n🔍 AI Search CLI (Interactive Mode)\n');

    // Get user with permissions
    const user = await prisma.user.findFirst({
      where: userEmail ? { email: userEmail } : {},
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
        tenant_: true,
      },
    }) as unknown as (UserWithRole & { tenant_: { id: string; name: string | null } }) | null;

    if (!user) {
      console.error(`❌ User not found${userEmail ? `: ${userEmail}` : ''}`);
      process.exit(1);
    }

    const tenant = user.tenant_;

    // Permissions of the user's role: without a role, none
    const permissions = new Set<string>((user.role?.permissions ?? []).map(p => p.id));

    console.log(`👤 User: ${user.email}`);
    console.log(`🏢 Tenant: ${tenant.name || tenant.id}`);
    if (verbose) {
      console.log(`   Rol: ${user.role?.id ?? '(sin rol)'}`);
      console.log(`   Permissions: ${permissions.size} permisos`);
    }

    // Get LLM config for tenant
    const configResult = await prisma.$queryRaw<TenantLlmConfigRow[]>`
      SELECT
        c.id,
        c.model,
        c.api_key,
        c.base_url,
        c.max_tokens,
        c.temperature,
        p.code as provider_code
      FROM tenant_llm_config c
      JOIN llm_provider p ON c.provider__id = p.id
      WHERE c.tenant__id__ = ${tenant.id}
        AND c.enabled = true
      LIMIT 1
    `;

    if (configResult.length === 0) {
      console.error('❌ No LLM configuration found for tenant.');
      process.exit(1);
    }

    const llmConfig = configResult[0];

    console.log(`\n📋 LLM: ${llmConfig.provider_code}/${llmConfig.model}`);
    console.log('━'.repeat(60));
    console.log('Type your queries. Commands: "exit", "salir", "clear", Ctrl+C\n');

    // Build service config
    const schemaMetadataStore = new SchemaMetadataStore();
    schemaMetadataStore.build();
    const serviceConfig: AiSearchServiceConfig = {
      llm: {
        providerCode: llmConfig.provider_code as 'openai' | 'anthropic' | 'groq' | 'google' | 'ollama',
        model: llmConfig.model,
        apiKey: llmConfig.api_key || undefined,
        baseUrl: llmConfig.base_url || undefined,
        maxTokens: llmConfig.max_tokens || 4096,
        temperature: llmConfig.temperature ? Number(llmConfig.temperature) : 0.7,
      },
      embedding: {
        providerCode: 'openai',
        model: 'nomic-embed-text',
        dimensions: 768,
        baseUrl: llmConfig.base_url || 'http://localhost:11434/v1',
      },
      schemaMetadata: schemaMetadata as SchemaMetadata,
      schemaMetadataStore,
      onToolCall: verbose
        ? (event: ToolCallEvent) => {
            const status = event.result.success ? '✓' : '✗';
            const argsStr = JSON.stringify(event.args);
            console.log(`   ${status} ${event.toolName}(${argsStr}) [${event.durationMs}ms]`);
            if (!event.result.success && event.result.error) {
              console.log(`      Error: ${event.result.error}`);
            }
            writeDebugLog(event);
          }
        : undefined,
      onSystemPrompt: writePromptLog,
    };

    // Create service
    const service = createAiSearchService(prisma, tenant.id, serviceConfig);

    // Build search context
    const searchContext: SearchContext = {
      tenantId: tenant.id,
      userId: user.id,
      permissions: Array.from(permissions),
      language: 'es',
    };

    // Track conversation ID for multi-turn
    let conversationId: string | undefined;
    let isProcessing = false;

    // Setup readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const showPrompt = () => {
      process.stdout.write('> ');
    };

    // Handle each line of input
    rl.on('line', async (input) => {
      const query = input.trim();

      // Handle exit commands
      if (!query || ['exit', 'salir', 'quit', 'q'].includes(query.toLowerCase())) {
        console.log('\n👋 ¡Hasta luego!\n');
        rl.close();
        await prisma.$disconnect();
        process.exit(0);
      }

      // Handle clear command
      if (query.toLowerCase() === 'clear') {
        conversationId = undefined;
        console.log('🔄 Conversación reiniciada\n');
        showPrompt();
        return;
      }

      // Prevent concurrent queries
      if (isProcessing) {
        console.log('⏳ Procesando consulta anterior...\n');
        return;
      }

      isProcessing = true;

      try {
        const startTime = Date.now();

        // Execute search with conversation context
        const result = await service.search({
          query,
          conversationId,
          context: searchContext,
        });

        // Store conversation ID for next query
        conversationId = result.conversationId;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        // Display response with explicit flush
        process.stdout.write('\n' + '─'.repeat(60) + '\n');
        process.stdout.write(result.answer + '\n');
        process.stdout.write('─'.repeat(60) + '\n');

        if (verbose && result.usage) {
          process.stdout.write(`⏱️ ${elapsed}s | 📊 ${result.usage.totalTokens} tokens\n`);
        } else {
          process.stdout.write(`⏱️ ${elapsed}s\n`);
        }
        process.stdout.write('\n');

      } catch (error) {
        process.stderr.write('\n❌ Error: ' + (error instanceof Error ? error.message : String(error)) + '\n');
        if (verbose && error instanceof Error) {
          process.stderr.write('Stack: ' + error.stack + '\n');
        }
        process.stdout.write('\n');
      }

      isProcessing = false;
      showPrompt();
    });

    // Handle Ctrl+C
    rl.on('close', async () => {
      console.log('\n👋 ¡Hasta luego!\n');
      await prisma.$disconnect();
      process.exit(0);
    });

    // Start interactive loop
    showPrompt();

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
