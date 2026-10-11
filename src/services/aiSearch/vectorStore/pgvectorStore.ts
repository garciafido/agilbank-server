/**
 * pgvector Store Implementation
 *
 * Implements IVectorStore using PostgreSQL with pgvector extension.
 * Uses raw SQL for vector operations (Prisma doesn't support pgvector natively).
 */

import { PrismaClient, Prisma } from '../../../prisma/generated-client/client';
import { randomUUID } from 'crypto';
import {
  IVectorStore,
  StoreVectorParams,
  VectorStoreConfig,
  VectorStoreError,
  SimilarityMetric,
  VectorStoreContextFields,
} from './types';
import { VectorSearchResult, VectorSearchOptions } from '../types';

/**
 * Context for audit fields (alias for interface compatibility)
 */
export type VectorStoreContext = VectorStoreContextFields;

/**
 * Operator mapping for similarity metrics
 */
const SIMILARITY_OPERATORS: Record<SimilarityMetric, string> = {
  cosine: '<=>',
  euclidean: '<->',
  inner_product: '<#>',
};

const DEFAULT_SEARCH_LIMIT = 10;
/** Tope de filas por búsqueda: el pedido llega desde una tool del LLM, y sin tope una
 *  sola llamada puede barrer la tabla de vectores entera. */
const MAX_SEARCH_LIMIT = 100;

/**
 * pgvector Store Implementation
 */
export class PgVectorStore implements IVectorStore {
  private prisma: PrismaClient;
  private tableName: string;
  private similarityMetric: SimilarityMetric;
  private dimensions: number;
  private context?: VectorStoreContext;

  constructor(prisma: PrismaClient, config: VectorStoreConfig, context?: VectorStoreContext) {
    this.prisma = prisma;
    this.tableName = config.tableName || 'document_chunk';
    this.similarityMetric = config.similarityMetric || 'cosine';
    this.dimensions = config.dimensions;
    this.context = context;
  }

  /**
   * Set context for audit fields
   */
  setContext(context: VectorStoreContext): void {
    this.context = context;
  }

  async store(params: StoreVectorParams): Promise<string> {
    const { documentId, chunkIndex, content, embedding, tokenCount, metadata } = params;

    if (!this.context) {
      throw new VectorStoreError('Context required for store operation', 'store');
    }

    const id = randomUUID();
    const version = randomUUID();
    const now = new Date();

    try {
      // Use raw SQL for vector insertion with Haiku audit fields
      await this.prisma.$queryRaw`
        INSERT INTO ${Prisma.raw(`"${this.tableName}"`)} (
          "id",
          "version__",
          "created_at__",
          "created_by__id__",
          "last_updated_at__",
          "last_updated_by__id__",
          "tenant__id__",
          "document__id",
          "chunk_index",
          "content",
          "embedding",
          "token_count",
          "metadata"
        ) VALUES (
          ${id},
          ${version},
          ${now},
          ${this.context.userId},
          ${now},
          ${this.context.userId},
          ${this.context.tenantId},
          ${documentId},
          ${chunkIndex},
          ${content},
          ${this.vectorToSql(embedding)}::vector,
          ${tokenCount},
          ${metadata ? JSON.stringify(metadata) : null}::jsonb
        )
      `;

      return id;
    } catch (error) {
      throw new VectorStoreError(
        `Failed to store vector: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'store',
        error instanceof Error ? error : undefined
      );
    }
  }

  async storeBatch(params: StoreVectorParams[]): Promise<string[]> {
    if (params.length === 0) return [];

    if (!this.context) {
      throw new VectorStoreError('Context required for storeBatch operation', 'storeBatch');
    }

    const now = new Date().toISOString();
    const ids: string[] = [];

    try {
      // Build VALUES clause for batch insert with Haiku audit fields
      const values = params.map((p) => {
        const id = randomUUID();
        const version = randomUUID();
        ids.push(id);
        return `(
          '${id}',
          '${version}',
          '${now}'::timestamp,
          '${this.context!.userId}',
          '${now}'::timestamp,
          '${this.context!.userId}',
          '${this.context!.tenantId}',
          '${p.documentId}',
          ${p.chunkIndex},
          $${ids.length * 3 - 2},
          $${ids.length * 3 - 1}::vector,
          $${ids.length * 3},
          ${p.metadata ? `'${JSON.stringify(p.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL'}
        )`;
      }).join(',\n');

      // Flatten parameters (content, embedding, tokenCount for each)
      const flatParams: unknown[] = [];
      for (const p of params) {
        flatParams.push(
          p.content,
          this.vectorToSql(p.embedding),
          p.tokenCount
        );
      }

      await this.prisma.$queryRawUnsafe(
        `INSERT INTO "${this.tableName}" (
          "id",
          "version__",
          "created_at__",
          "created_by__id__",
          "last_updated_at__",
          "last_updated_by__id__",
          "tenant__id__",
          "document__id",
          "chunk_index",
          "content",
          "embedding",
          "token_count",
          "metadata"
        ) VALUES ${values}`,
        ...flatParams
      );

      return ids;
    } catch (error) {
      throw new VectorStoreError(
        `Failed to store vectors batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'storeBatch',
        error instanceof Error ? error : undefined
      );
    }
  }

  async search(
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    // SECURITY: Require context with tenantId for search
    if (!this.context?.tenantId) {
      throw new VectorStoreError(
        'Context with tenantId required for search operation',
        'search'
      );
    }

    // `limit` llega desde los argumentos de una tool del LLM, así que no es un número
    // por el hecho de estar tipado: se sanea a un entero dentro de un rango antes de
    // tocar la consulta, y abajo va parametrizado en vez de interpolado.
    const requestedLimit = Math.floor(Number(options?.limit));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_SEARCH_LIMIT)
      : DEFAULT_SEARCH_LIMIT;
    const minScore = options?.minScore || 0;
    const documentIds = options?.filter?.documentIds;

    const operator = SIMILARITY_OPERATORS[this.similarityMetric];

    try {
      // Build WHERE clause with MANDATORY tenant filtering
      // SECURITY: tenant__id__ is ALWAYS in WHERE clause (parameterized)
      const whereConditions: string[] = ['\"tenant__id__\" = $2'];
      const params: unknown[] = [this.vectorToSql(queryVector), this.context.tenantId];

      // SECURITY: documentIds are parameterized, not interpolated
      if (documentIds && documentIds.length > 0) {
        // Build parameterized IN clause: $3, $4, $5, etc.
        const placeholders = documentIds.map((_, i) => `$${i + 3}`).join(', ');
        whereConditions.push(`"document__id" IN (${placeholders})`);
        params.push(...documentIds);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // For cosine similarity, convert distance to score (1 - distance)
      // For inner product, negate (it returns negative values)
      const scoreExpression = this.similarityMetric === 'inner_product'
        ? `-(embedding ${operator} $1::vector)`
        : `1 - (embedding ${operator} $1::vector)`;

      // SECURITY: el límite va parameterizado, no interpolado. Su índice depende de
      // cuántos documentIds se hayan agregado antes, así que se calcula acá.
      const limitPlaceholder = `$${params.length + 1}`;
      params.push(limit);

      const query = `
        SELECT
          id as "chunkId",
          "document__id" as "documentId",
          content,
          ${scoreExpression} as score,
          metadata
        FROM "${this.tableName}"
        ${whereClause}
        ORDER BY embedding ${operator} $1::vector
        LIMIT ${limitPlaceholder}
      `;

      const results = await this.prisma.$queryRawUnsafe<{
        chunkId: string;
        documentId: string;
        content: string;
        score: number;
        metadata: Record<string, unknown> | null;
      }[]>(query, ...params);

      // Filter by minimum score
      return results
        .filter((r) => r.score >= minScore)
        .map((r) => ({
          chunkId: r.chunkId,
          documentId: r.documentId,
          content: r.content,
          score: r.score,
          metadata: r.metadata || undefined,
        }));
    } catch (error) {
      throw new VectorStoreError(
        `Failed to search vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'search',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteByDocument(documentId: string): Promise<number> {
    // SECURITY: Require context with tenantId for delete operations
    if (!this.context?.tenantId) {
      throw new VectorStoreError(
        'Context with tenantId required for delete operation',
        'deleteByDocument'
      );
    }

    try {
      // SECURITY: Include tenant filter to prevent cross-tenant deletion
      const result = await this.prisma.$executeRaw`
        DELETE FROM ${Prisma.raw(`"${this.tableName}"`)}
        WHERE "document__id" = ${documentId}
        AND "tenant__id__" = ${this.context.tenantId}
      `;

      return result;
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'deleteByDocument',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteByChunk(chunkId: string): Promise<boolean> {
    // SECURITY: Require context with tenantId for delete operations
    if (!this.context?.tenantId) {
      throw new VectorStoreError(
        'Context with tenantId required for delete operation',
        'deleteByChunk'
      );
    }

    try {
      // SECURITY: Include tenant filter to prevent cross-tenant deletion
      const result = await this.prisma.$executeRaw`
        DELETE FROM ${Prisma.raw(`"${this.tableName}"`)}
        WHERE "id" = ${chunkId}
        AND "tenant__id__" = ${this.context.tenantId}
      `;

      return result > 0;
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete chunk: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'deleteByChunk',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Convert number array to pgvector format
   */
  private vectorToSql(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}

/**
 * Create a pgvector store instance
 */
export function createVectorStore(
  prisma: PrismaClient,
  config: VectorStoreConfig,
  context?: VectorStoreContext
): IVectorStore {
  return new PgVectorStore(prisma, config, context);
}
