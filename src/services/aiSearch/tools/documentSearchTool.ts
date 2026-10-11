/**
 * Document Search Tool
 *
 * Searches over indexed documents using semantic similarity.
 * Returns results with document names and reference numbers for citation.
 */

import { PrismaClient } from '../../../prisma/generated-client/client';
import { Tool } from './types';
import { DocumentIndexer } from '../documents';

/**
 * Create document search tool
 */
export function createDocumentSearchTool(
  indexer: DocumentIndexer,
  prisma: PrismaClient
): Tool {
  return {
    name: 'search_documents',
    description: 'Search through uploaded documents using natural language. Use this to find information in PDFs, Word documents, or other uploaded files. Returns numbered results for citation.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query in natural language',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
    handler: async (args, context) => {
      const query = args.query as string;
      const limit = (args.limit as number) || 5;

      try {
        // SECURITY: Set context with tenantId before search
        // This ensures vector store filters by tenant
        indexer.setContext({
          tenantId: context.tenantId,
          userId: context.userId,
        });

        const results = await indexer.search(query, {
          limit,
          minScore: 0.5,
        });

        if (results.length === 0) {
          return {
            success: true,
            data: {
              message: 'No relevant documents found for the query.',
              results: [],
            },
          };
        }

        // Fetch document names for all unique documentIds
        // SECURITY: Filter by tenant_id_ to prevent cross-tenant data access
        const documentIds = [...new Set(results.map((r) => r.documentId))];
        const documents = await prisma.tenantDocument.findMany({
          where: {
            id: { in: documentIds },
            tenant_id_: context.tenantId,  // SECURITY: Mandatory tenant filter
          },
          select: { id: true, name: true },
        });
        const docNameMap = new Map(documents.map((d) => [d.id, d.name]));

        // Build results with reference numbers and document names
        const formattedResults = results.map((r, index) => ({
          refNumber: index + 1,
          documentName: docNameMap.get(r.documentId) || 'Unknown Document',
          documentId: r.documentId,
          content: r.content,
          score: Math.round(r.score * 100) / 100,
          metadata: r.metadata,
        }));

        return {
          success: true,
          data: {
            resultCount: results.length,
            instruction: 'Use [refNumber] to cite these sources in your response. Add a "Fuentes:" section at the end.',
            results: formattedResults,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Search failed',
        };
      }
    },
  };
}
