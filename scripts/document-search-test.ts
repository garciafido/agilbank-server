#!/usr/bin/env npx ts-node
/**
 * Document Search Test - Test vector search on indexed documents
 *
 * Usage:
 *   npm run ai:document:search "query text"     # Search documents
 *   npm run ai:document:search "query" --limit 5  # Limit results
 *   npm run ai:document:search "query" --verbose  # Show embeddings info
 *
 * Examples:
 *   npm run ai:document:search "herencia de obra musical"
 *   npm run ai:document:search "copyright infringement" --limit 3
 */

import 'reflect-metadata';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma/generated-client/client';
import {
  createDocumentIndexer,
  DocumentIndexerConfig,
} from '../src/services/aiSearch';

interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const verbose = args.includes('--verbose') || args.includes('-v');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;

  // Get query (first non-flag argument)
  const query = args.find(a => !a.startsWith('--') && !a.startsWith('-'));

  if (!query) {
    console.log('\n📖 Document Search Test\n');
    console.log('Usage:');
    console.log('  npm run ai:document:search "your search query"');
    console.log('  npm run ai:document:search "query" --limit=10');
    console.log('  npm run ai:document:search "query" --verbose\n');
    console.log('Examples:');
    console.log('  npm run ai:document:search "herencia de obra musical"');
    console.log('  npm run ai:document:search "copyright law"');
    console.log('  npm run ai:document:search "derechos de autor" --limit=3\n');
    process.exit(0);
  }

  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('\n🔍 Document Search Test\n');
    console.log(`Query: "${query}"`);
    console.log(`Limit: ${limit} results`);
    console.log('─'.repeat(60));

    // Check if there are any indexed documents
    const docCount = await prisma.tenantDocument.count({
      where: { status: 'ready' },
    });

    if (docCount === 0) {
      console.log('\n⚠️  No indexed documents found.');
      console.log('   Upload a document first and wait for processing.\n');
      process.exit(0);
    }

    console.log(`\n📚 Searching across ${docCount} indexed document(s)...\n`);

    // Create indexer with local embeddings
    const config: DocumentIndexerConfig = {
      embedding: {
        providerCode: 'local',
        dimensions: 1024,
      },
      vectorTableName: 'document_chunk',
    };

    const startTime = Date.now();

    // Note: For search we don't need context (no writes)
    const indexer = createDocumentIndexer(prisma, config);

    if (verbose) {
      console.log('⏳ Loading embedding model (first time may take ~60s)...\n');
    }

    // Perform search
    const results = await indexer.search(query, {
      limit,
      minScore: 0.3, // Lower threshold for testing
    }) as SearchResult[];

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (results.length === 0) {
      console.log('❌ No results found.\n');
      console.log('Tips:');
      console.log('  - Try a different query');
      console.log('  - Check if documents are indexed (status = ready)');
      console.log('  - Lower the minScore threshold\n');
    } else {
      console.log(`✅ Found ${results.length} result(s) in ${elapsed}s\n`);
      console.log('─'.repeat(60));

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const scorePercent = (result.score * 100).toFixed(1);

        // Get document name
        const doc = await prisma.tenantDocument.findUnique({
          where: { id: result.documentId },
          select: { name: true },
        });

        console.log(`\n📄 Result ${i + 1} (Score: ${scorePercent}%)`);
        console.log(`   Document: ${doc?.name || result.documentId}`);
        console.log(`   Chunk ID: ${result.chunkId}`);
        console.log('');

        // Show content preview (max 500 chars)
        const preview = result.content.length > 500
          ? result.content.substring(0, 500) + '...'
          : result.content;

        console.log('   Content:');
        preview.split('\n').forEach(line => {
          console.log(`   │ ${line}`);
        });

        if (verbose && result.metadata) {
          console.log('');
          console.log(`   Metadata: ${JSON.stringify(result.metadata)}`);
        }

        console.log('');
        console.log('─'.repeat(60));
      }
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    if (verbose && error instanceof Error) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
